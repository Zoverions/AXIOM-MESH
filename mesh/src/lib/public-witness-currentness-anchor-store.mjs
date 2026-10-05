import {
  createPrivateKey,
  createPublicKey,
  sign,
  verify
} from 'node:crypto';
import {
  lstat,
  mkdir,
  open,
  readFile
} from 'node:fs/promises';
import { dirname } from 'node:path';

import {
  ValidationError,
  assertPlainObject,
  assertString,
  canonicalJson,
  digestObject,
  sha256
} from './canonical.mjs';
import {
  verifyDelegationRootAttestationKeyCurrentnessAnchor
} from './delegation-root-attestation-key-currentness-anchor.mjs';

export const PUBLIC_WITNESS_CURRENTNESS_ANCHOR_RECORD_SCHEMA =
  'axiom-public-witness-currentness-anchor-record.v1';

const DIGEST = /^[a-f0-9]{64}$/;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$/;
const BASE64URL = /^[A-Za-z0-9_-]+$/;
const MAX_SEQUENCE = Number.MAX_SAFE_INTEGER;
const DEFAULT_MAX_STATE_BYTES = 64 * 1024 * 1024;
const HARD_MAX_STATE_BYTES = 512 * 1024 * 1024;
const DEFAULT_MAX_RECORD_BYTES = 2 * 1024 * 1024;
const HARD_MAX_RECORD_BYTES = 16 * 1024 * 1024;

const RECORD_KEYS = new Set([
  'schema',
  'statement',
  'statement_digest',
  'anchor',
  'anchored_checkpoint',
  'trusted_controller_public_key',
  'witness_signature',
  'record_digest'
]);
const STATEMENT_KEYS = new Set([
  'domain_id',
  'witness_id',
  'witness_key_id',
  'sequence',
  'previous_record_digest',
  'anchor_digest',
  'anchor_sequence',
  'anchored_checkpoint_digest',
  'anchored_checkpoint_sequence',
  'root_binding_digest',
  'root_authority_digest',
  'root_holder',
  'controller_key_id',
  'published_at',
  'data_availability_claimed',
  'global_currentness_claimed',
  'finality_claimed',
  'authority_effect',
  'network_effect'
]);

function exactKeys(raw, allowed, label) {
  const value = assertPlainObject(raw, label);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new ValidationError(`${label} contains unsupported field ${key}`);
  }
  if (Object.keys(value).length !== allowed.size) {
    throw new ValidationError(`${label} fields are invalid`);
  }
  return value;
}

function identifier(value, label) {
  return assertString(value, label, { min: 1, max: 192, pattern: IDENTIFIER });
}

function digest(value, label) {
  return assertString(value, label, { min: 64, max: 64, pattern: DIGEST });
}

function nullableDigest(value, label) {
  return value === null ? null : digest(value, label);
}

function positiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_SEQUENCE) {
    throw new ValidationError(`${label} must be a positive safe integer`);
  }
  return value;
}

function boundedInteger(value, label, fallback, hardMax) {
  const normalized = value === undefined ? fallback : value;
  if (!Number.isSafeInteger(normalized) || normalized < 1 || normalized > hardMax) {
    throw new ValidationError(`${label} must be a positive safe integer no greater than ${hardMax}`);
  }
  return normalized;
}

function canonicalTimestamp(value, label) {
  const text = assertString(value, label, { min: 24, max: 24 });
  const parsed = new Date(text);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== text) {
    throw new ValidationError(`${label} must be a canonical UTC ISO timestamp`);
  }
  return text;
}

function parsePrivateKey(value, label) {
  let key;
  try {
    key = value?.type === 'private' ? value : createPrivateKey(value);
  } catch {
    throw new ValidationError(`${label} is invalid`);
  }
  if (key.type !== 'private' || key.asymmetricKeyType !== 'ed25519') {
    throw new ValidationError(`${label} must be Ed25519`);
  }
  return key;
}

function parsePublicKey(value, label) {
  let key;
  try {
    key = value?.type === 'public' ? value : createPublicKey(value);
  } catch {
    throw new ValidationError(`${label} is invalid`);
  }
  if (key.type !== 'public' || key.asymmetricKeyType !== 'ed25519') {
    throw new ValidationError(`${label} must be Ed25519`);
  }
  return key;
}

function canonicalPublicKeyPem(value, label) {
  return parsePublicKey(value, label).export({ type: 'spki', format: 'pem' }).toString();
}

function keyId(value, label) {
  return sha256(canonicalPublicKeyPem(value, label));
}

function controllerKeyId(value, label) {
  return sha256(canonicalPublicKeyPem(value, label).trim());
}

function signer(privateKeyValue) {
  const privateKey = parsePrivateKey(
    privateKeyValue,
    'public witness currentness anchor private key'
  );
  const publicKey = createPublicKey(privateKey);
  const publicPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  return Object.freeze({
    privateKey,
    publicKey,
    publicPem,
    keyId: sha256(publicPem)
  });
}

function normalizeStatement(raw) {
  const value = exactKeys(raw, STATEMENT_KEYS, 'public witness currentness anchor record statement');
  const sequence = positiveInteger(value.sequence, 'public witness currentness anchor record sequence');
  const previous = nullableDigest(
    value.previous_record_digest,
    'public witness currentness anchor record previous_record_digest'
  );
  if ((sequence === 1) !== (previous === null)) {
    throw new ValidationError(
      'public witness currentness anchor first record requires null predecessor and later records require one'
    );
  }
  if (
    value.data_availability_claimed !== false
    || value.global_currentness_claimed !== false
    || value.finality_claimed !== false
  ) {
    throw new ValidationError(
      'public witness currentness anchor record cannot claim data availability, global currentness, or finality'
    );
  }
  if (value.authority_effect !== 'none' || value.network_effect !== 'none') {
    throw new ValidationError(
      'public witness currentness anchor record cannot perform authority or network effects'
    );
  }
  return Object.freeze({
    domain_id: identifier(value.domain_id, 'public witness currentness anchor domain_id'),
    witness_id: identifier(value.witness_id, 'public witness currentness anchor witness_id'),
    witness_key_id: digest(value.witness_key_id, 'public witness currentness anchor witness_key_id'),
    sequence,
    previous_record_digest: previous,
    anchor_digest: digest(value.anchor_digest, 'public witness currentness anchor anchor_digest'),
    anchor_sequence: positiveInteger(value.anchor_sequence, 'public witness currentness anchor anchor_sequence'),
    anchored_checkpoint_digest: digest(
      value.anchored_checkpoint_digest,
      'public witness currentness anchor anchored_checkpoint_digest'
    ),
    anchored_checkpoint_sequence: positiveInteger(
      value.anchored_checkpoint_sequence,
      'public witness currentness anchor anchored_checkpoint_sequence'
    ),
    root_binding_digest: digest(
      value.root_binding_digest,
      'public witness currentness anchor root_binding_digest'
    ),
    root_authority_digest: digest(
      value.root_authority_digest,
      'public witness currentness anchor root_authority_digest'
    ),
    root_holder: identifier(value.root_holder, 'public witness currentness anchor root_holder'),
    controller_key_id: digest(
      value.controller_key_id,
      'public witness currentness anchor controller_key_id'
    ),
    published_at: canonicalTimestamp(value.published_at, 'public witness currentness anchor published_at'),
    data_availability_claimed: false,
    global_currentness_claimed: false,
    finality_claimed: false,
    authority_effect: 'none',
    network_effect: 'none'
  });
}

function normalizeControllerPem(value) {
  const text = assertString(
    value,
    'public witness currentness anchor trusted_controller_public_key',
    { min: 64, max: 16384 }
  );
  const canonical = canonicalPublicKeyPem(
    text,
    'public witness currentness anchor trusted controller public key'
  );
  if (canonical !== text) {
    throw new ValidationError(
      'public witness currentness anchor trusted controller public key must use canonical PEM'
    );
  }
  return canonical;
}

function recordSignable(statement, anchor, anchoredCheckpoint, trustedControllerPublicKey) {
  const statementDigest = digestObject(statement);
  return Object.freeze({
    schema: PUBLIC_WITNESS_CURRENTNESS_ANCHOR_RECORD_SCHEMA,
    statement,
    statement_digest: statementDigest,
    anchor,
    anchored_checkpoint: anchoredCheckpoint,
    trusted_controller_public_key: trustedControllerPublicKey
  });
}

function signRecord(statement, anchor, anchoredCheckpoint, trustedControllerPublicKey, privateKey) {
  const signable = recordSignable(
    normalizeStatement(statement),
    anchor,
    anchoredCheckpoint,
    normalizeControllerPem(trustedControllerPublicKey)
  );
  const witnessSignature = sign(
    null,
    Buffer.from(canonicalJson(signable), 'utf8'),
    privateKey
  ).toString('base64url');
  const signed = Object.freeze({ ...signable, witness_signature: witnessSignature });
  return Object.freeze({ ...signed, record_digest: digestObject(signed) });
}

function verifyRecord(raw, {
  trustedWitnessPublicKey,
  expectedDomainId,
  expectedWitnessId
}) {
  const value = exactKeys(raw, RECORD_KEYS, 'public witness currentness anchor durable record');
  if (value.schema !== PUBLIC_WITNESS_CURRENTNESS_ANCHOR_RECORD_SCHEMA) {
    throw new ValidationError('public witness currentness anchor durable record schema is unsupported');
  }
  const statement = normalizeStatement(value.statement);
  const controllerPem = normalizeControllerPem(value.trusted_controller_public_key);
  const anchor = verifyDelegationRootAttestationKeyCurrentnessAnchor(value.anchor, {
    trustedWitnessPublicKey,
    trustedControllerPublicKey: controllerPem,
    anchoredCheckpoint: value.anchored_checkpoint,
    expectedRootBindingDigest: statement.root_binding_digest,
    expectedRootAuthorityDigest: statement.root_authority_digest,
    expectedRootHolder: statement.root_holder
  });

  if (statement.domain_id !== expectedDomainId) {
    throw new ValidationError('public witness currentness anchor durable record belongs to a different domain');
  }
  if (statement.witness_id !== expectedWitnessId || anchor.statement.witness_id !== expectedWitnessId) {
    throw new ValidationError('public witness currentness anchor durable record witness identity mismatch');
  }
  const witnessKeyId = keyId(
    trustedWitnessPublicKey,
    'trusted public witness currentness anchor public key'
  );
  if (statement.witness_key_id !== witnessKeyId || anchor.statement.witness_key_id !== witnessKeyId) {
    throw new ValidationError('public witness currentness anchor durable record witness key mismatch');
  }
  if (
    statement.anchor_digest !== anchor.anchor_digest
    || statement.anchor_sequence !== anchor.statement.anchor_sequence
    || statement.anchored_checkpoint_digest !== anchor.statement.checkpoint_digest
    || statement.anchored_checkpoint_sequence !== anchor.statement.checkpoint_sequence
    || statement.root_binding_digest !== anchor.statement.root_binding_digest
    || statement.root_authority_digest !== anchor.statement.root_authority_digest
    || statement.root_holder !== anchor.statement.root_holder
    || statement.controller_key_id !== anchor.statement.controller_key_id
  ) {
    throw new ValidationError(
      'public witness currentness anchor durable record statement does not match signed anchor'
    );
  }
  if (
    controllerKeyId(controllerPem, 'public witness currentness anchor controller public key')
    !== statement.controller_key_id
  ) {
    throw new ValidationError('public witness currentness anchor durable record controller key mismatch');
  }
  if (Date.parse(statement.published_at) < Date.parse(anchor.statement.anchored_at)) {
    throw new ValidationError('public witness currentness anchor publication time predates witness anchor');
  }

  const statementDigest = digest(
    value.statement_digest,
    'public witness currentness anchor durable record statement_digest'
  );
  if (statementDigest !== digestObject(statement)) {
    throw new ValidationError('public witness currentness anchor durable record statement digest mismatch');
  }
  const signature = assertString(
    value.witness_signature,
    'public witness currentness anchor durable record witness_signature',
    { min: 32, max: 1024, pattern: BASE64URL }
  );
  const signatureBytes = Buffer.from(signature, 'base64url');
  if (signatureBytes.length !== 64 || signatureBytes.toString('base64url') !== signature) {
    throw new ValidationError('public witness currentness anchor durable record witness signature is invalid');
  }
  const publicKey = parsePublicKey(
    trustedWitnessPublicKey,
    'trusted public witness currentness anchor public key'
  );
  const signable = Object.freeze({
    schema: PUBLIC_WITNESS_CURRENTNESS_ANCHOR_RECORD_SCHEMA,
    statement,
    statement_digest: statementDigest,
    anchor,
    anchored_checkpoint: value.anchored_checkpoint,
    trusted_controller_public_key: controllerPem
  });
  if (!verify(null, Buffer.from(canonicalJson(signable), 'utf8'), publicKey, signatureBytes)) {
    throw new ValidationError('public witness currentness anchor durable record witness signature is invalid');
  }
  const signed = Object.freeze({ ...signable, witness_signature: signature });
  const recordDigest = digest(
    value.record_digest,
    'public witness currentness anchor durable record record_digest'
  );
  if (recordDigest !== digestObject(signed)) {
    throw new ValidationError('public witness currentness anchor durable record digest mismatch');
  }
  return Object.freeze({ ...signed, record_digest: recordDigest });
}

function chainKey(statement) {
  return canonicalJson({
    root_binding_digest: statement.root_binding_digest,
    root_authority_digest: statement.root_authority_digest,
    root_holder: statement.root_holder,
    controller_key_id: statement.controller_key_id
  });
}

function normalizeHeadQuery(raw) {
  const value = assertPlainObject(raw, 'public witness currentness anchor head query');
  const expected = new Set([
    'rootBindingDigest',
    'rootAuthorityDigest',
    'rootHolder',
    'controllerKeyId'
  ]);
  for (const key of Object.keys(value)) {
    if (!expected.has(key)) {
      throw new ValidationError(`public witness currentness anchor head query contains unsupported field ${key}`);
    }
  }
  if (Object.keys(value).length !== expected.size) {
    throw new ValidationError('public witness currentness anchor head query fields are invalid');
  }
  return Object.freeze({
    root_binding_digest: digest(value.rootBindingDigest, 'public witness currentness anchor root binding digest'),
    root_authority_digest: digest(value.rootAuthorityDigest, 'public witness currentness anchor root authority digest'),
    root_holder: identifier(value.rootHolder, 'public witness currentness anchor root holder'),
    controller_key_id: digest(value.controllerKeyId, 'public witness currentness anchor controller key id')
  });
}

function assertAnchorProgression(previousAnchor, currentAnchor) {
  const previous = previousAnchor.statement;
  const current = currentAnchor.statement;
  if (current.anchor_sequence !== previous.anchor_sequence + 1) {
    throw new ValidationError('public witness currentness anchor sequence must advance exactly one');
  }
  if (current.predecessor_anchor_digest !== previousAnchor.anchor_digest) {
    throw new ValidationError('public witness currentness anchor predecessor digest mismatch');
  }
  if (
    current.witness_id !== previous.witness_id
    || current.witness_key_id !== previous.witness_key_id
  ) {
    throw new ValidationError('public witness currentness anchor witness identity or key substitution detected');
  }
  if (
    current.root_binding_digest !== previous.root_binding_digest
    || current.root_authority_digest !== previous.root_authority_digest
    || current.root_holder !== previous.root_holder
    || current.controller_key_id !== previous.controller_key_id
  ) {
    throw new ValidationError('public witness currentness anchor root or controller substitution detected');
  }
  if (Date.parse(current.anchored_at) < Date.parse(previous.anchored_at)) {
    throw new ValidationError('public witness currentness anchor time moved backward');
  }
  if (current.checkpoint_sequence < previous.checkpoint_sequence) {
    throw new ValidationError('public witness currentness anchor rollback rejected: checkpoint sequence moved backward');
  }
  if (
    current.checkpoint_sequence === previous.checkpoint_sequence
    && current.checkpoint_digest !== previous.checkpoint_digest
  ) {
    throw new ValidationError(
      'public witness currentness anchor equivocation rejected: same checkpoint sequence has different digest'
    );
  }
}

function newState() {
  return {
    records: [],
    anchors: new Map(),
    heads: new Map(),
    latest_record_digest: null,
    latest_published_at: null
  };
}

function applyVerifiedRecord(state, record) {
  const expectedSequence = state.records.length + 1;
  if (record.statement.sequence !== expectedSequence) {
    throw new ValidationError('public witness currentness anchor durable record sequence is not contiguous');
  }
  if (record.statement.previous_record_digest !== state.latest_record_digest) {
    throw new ValidationError('public witness currentness anchor durable record predecessor mismatch');
  }
  if (
    state.latest_published_at !== null
    && Date.parse(record.statement.published_at) < Date.parse(state.latest_published_at)
  ) {
    throw new ValidationError('public witness currentness anchor durable publication time moved backward');
  }
  if (state.anchors.has(record.anchor.anchor_digest)) {
    throw new ValidationError('public witness currentness anchor durable state contains a duplicate anchor');
  }

  const key = chainKey(record.anchor.statement);
  const previousHead = state.heads.get(key);
  if (previousHead === undefined) {
    if (record.anchor.statement.anchor_sequence !== 1) {
      throw new ValidationError('public witness currentness anchor chain must begin at anchor sequence one');
    }
    if (record.anchor.statement.predecessor_anchor_digest !== null) {
      throw new ValidationError('public witness currentness anchor genesis cannot name a predecessor');
    }
  } else {
    assertAnchorProgression(previousHead, record.anchor);
  }

  state.records.push(record);
  state.anchors.set(record.anchor.anchor_digest, record.anchor);
  state.heads.set(key, record.anchor);
  state.latest_record_digest = record.record_digest;
  state.latest_published_at = record.statement.published_at;
}

async function ensureStateFile(statePath) {
  await mkdir(dirname(statePath), { recursive: true, mode: 0o700 });
  try {
    const info = await lstat(statePath);
    if (info.isSymbolicLink() || !info.isFile()) {
      throw new ValidationError(
        'public witness currentness anchor state path must be a regular non-symlink file'
      );
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    const handle = await open(statePath, 'wx', 0o600);
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
  }
}

async function readRecordLines(statePath, maxStateBytes, maxRecordBytes) {
  const info = await lstat(statePath);
  if (info.isSymbolicLink() || !info.isFile()) {
    throw new ValidationError(
      'public witness currentness anchor state path must be a regular non-symlink file'
    );
  }
  if (info.size > maxStateBytes) {
    throw new ValidationError('public witness currentness anchor state exceeds configured byte limit');
  }
  if (info.size === 0) return [];
  const bytes = await readFile(statePath);
  if (bytes.length > maxStateBytes) {
    throw new ValidationError('public witness currentness anchor state exceeds configured byte limit');
  }
  const text = bytes.toString('utf8');
  if (!text.endsWith('\n')) {
    throw new ValidationError('public witness currentness anchor state has an incomplete trailing record');
  }
  const lines = text.slice(0, -1).split('\n');
  return lines.map((line, index) => {
    if (Buffer.byteLength(line, 'utf8') > maxRecordBytes) {
      throw new ValidationError(
        `public witness currentness anchor record ${index + 1} exceeds configured byte limit`
      );
    }
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch {
      throw new ValidationError(
        `public witness currentness anchor record ${index + 1} is not valid JSON`
      );
    }
    if (canonicalJson(parsed) !== line) {
      throw new ValidationError(
        `public witness currentness anchor record ${index + 1} must use canonical JSON`
      );
    }
    return parsed;
  });
}

async function loadState({
  statePath,
  maxStateBytes,
  maxRecordBytes,
  trustedWitnessPublicKey,
  domainId,
  witnessId
}) {
  const state = newState();
  const lines = await readRecordLines(statePath, maxStateBytes, maxRecordBytes);
  for (const line of lines) {
    const record = verifyRecord(line, {
      trustedWitnessPublicKey,
      expectedDomainId: domainId,
      expectedWitnessId: witnessId
    });
    applyVerifiedRecord(state, record);
  }
  return state;
}

function stateIdentity(state) {
  return digestObject({
    record_digests: state.records.map(record => record.record_digest),
    latest_record_digest: state.latest_record_digest
  });
}

async function appendSynced(statePath, line) {
  const before = await lstat(statePath);
  if (before.isSymbolicLink() || !before.isFile()) {
    throw new ValidationError(
      'public witness currentness anchor state path must be a regular non-symlink file'
    );
  }
  const handle = await open(statePath, 'a', 0o600);
  try {
    await handle.write(line);
    await handle.sync();
  } finally {
    await handle.close();
  }
  const after = await lstat(statePath);
  if (after.isSymbolicLink() || !after.isFile()) {
    throw new ValidationError(
      'public witness currentness anchor state path changed away from a regular non-symlink file'
    );
  }
}

function publicationProjection(status, anchor, durableRecord) {
  return Object.freeze({
    status,
    anchor,
    durable_record: durableRecord,
    execution_authority_granted: false,
    global_currentness_claimed: false,
    finality_claimed: false,
    authority_effect: 'none',
    network_effect: 'none'
  });
}

export async function openPublicWitnessCurrentnessAnchorStore({
  statePath: rawStatePath,
  domainId: rawDomainId,
  witnessId: rawWitnessId,
  witnessPrivateKey,
  maxStateBytes: rawMaxStateBytes,
  maxRecordBytes: rawMaxRecordBytes
} = {}) {
  const statePath = assertString(
    rawStatePath,
    'public witness currentness anchor state path',
    { min: 1, max: 4096 }
  );
  const domainId = identifier(rawDomainId, 'public witness currentness anchor domain id');
  const witnessId = identifier(rawWitnessId, 'public witness currentness anchor witness id');
  const maxStateBytes = boundedInteger(
    rawMaxStateBytes,
    'public witness currentness anchor maxStateBytes',
    DEFAULT_MAX_STATE_BYTES,
    HARD_MAX_STATE_BYTES
  );
  const maxRecordBytes = boundedInteger(
    rawMaxRecordBytes,
    'public witness currentness anchor maxRecordBytes',
    DEFAULT_MAX_RECORD_BYTES,
    HARD_MAX_RECORD_BYTES
  );
  const witness = signer(witnessPrivateKey);

  await ensureStateFile(statePath);
  let state = await loadState({
    statePath,
    maxStateBytes,
    maxRecordBytes,
    trustedWitnessPublicKey: witness.publicKey,
    domainId,
    witnessId
  });
  let retainedStateIdentity = stateIdentity(state);

  async function verifyDiskUnchanged() {
    const disk = await loadState({
      statePath,
      maxStateBytes,
      maxRecordBytes,
      trustedWitnessPublicKey: witness.publicKey,
      domainId,
      witnessId
    });
    if (stateIdentity(disk) !== retainedStateIdentity) {
      throw new ValidationError(
        'public witness currentness anchor durable state changed outside the active store'
      );
    }
    return disk;
  }

  async function publish({
    anchor: rawAnchor,
    anchoredCheckpoint,
    trustedControllerPublicKey,
    publishedAt
  } = {}) {
    const controllerPem = canonicalPublicKeyPem(
      trustedControllerPublicKey,
      'public witness currentness anchor trusted controller public key'
    );
    const anchor = verifyDelegationRootAttestationKeyCurrentnessAnchor(rawAnchor, {
      trustedWitnessPublicKey: witness.publicKey,
      trustedControllerPublicKey: controllerPem,
      anchoredCheckpoint,
      expectedRootBindingDigest: rawAnchor?.statement?.root_binding_digest,
      expectedRootAuthorityDigest: rawAnchor?.statement?.root_authority_digest,
      expectedRootHolder: rawAnchor?.statement?.root_holder
    });
    if (anchor.statement.witness_id !== witnessId) {
      throw new ValidationError('public witness currentness anchor witness identity substitution detected');
    }
    if (anchor.statement.witness_key_id !== witness.keyId) {
      throw new ValidationError('public witness currentness anchor witness key substitution detected');
    }
    const publicationTime = canonicalTimestamp(
      publishedAt,
      'public witness currentness anchor publishedAt'
    );
    if (Date.parse(publicationTime) < Date.parse(anchor.statement.anchored_at)) {
      throw new ValidationError('public witness currentness anchor publication time predates witness anchor');
    }

    await verifyDiskUnchanged();
    const key = chainKey(anchor.statement);
    const currentHead = state.heads.get(key);
    const retainedAnchor = state.anchors.get(anchor.anchor_digest);
    if (retainedAnchor !== undefined) {
      if (currentHead?.anchor_digest === anchor.anchor_digest) {
        return publicationProjection('replay', retainedAnchor, null);
      }
      throw new ValidationError(
        'public witness currentness anchor rollback rejected: retained anchor is older than current chain head'
      );
    }
    if (currentHead === undefined) {
      if (anchor.statement.anchor_sequence !== 1 || anchor.statement.predecessor_anchor_digest !== null) {
        throw new ValidationError('public witness currentness anchor chain must begin at sequence one');
      }
    } else {
      if (anchor.statement.anchor_sequence < currentHead.statement.anchor_sequence) {
        throw new ValidationError('public witness currentness anchor rollback rejected: older anchor sequence');
      }
      if (anchor.statement.anchor_sequence === currentHead.statement.anchor_sequence) {
        throw new ValidationError(
          'public witness currentness anchor equivocation rejected: same anchor sequence has a different digest'
        );
      }
      assertAnchorProgression(currentHead, anchor);
    }
    if (
      state.latest_published_at !== null
      && Date.parse(publicationTime) < Date.parse(state.latest_published_at)
    ) {
      throw new ValidationError('public witness currentness anchor publication time moved backward');
    }

    const sequence = state.records.length + 1;
    const statement = {
      domain_id: domainId,
      witness_id: witnessId,
      witness_key_id: witness.keyId,
      sequence,
      previous_record_digest: state.latest_record_digest,
      anchor_digest: anchor.anchor_digest,
      anchor_sequence: anchor.statement.anchor_sequence,
      anchored_checkpoint_digest: anchor.statement.checkpoint_digest,
      anchored_checkpoint_sequence: anchor.statement.checkpoint_sequence,
      root_binding_digest: anchor.statement.root_binding_digest,
      root_authority_digest: anchor.statement.root_authority_digest,
      root_holder: anchor.statement.root_holder,
      controller_key_id: anchor.statement.controller_key_id,
      published_at: publicationTime,
      data_availability_claimed: false,
      global_currentness_claimed: false,
      finality_claimed: false,
      authority_effect: 'none',
      network_effect: 'none'
    };
    const record = signRecord(
      statement,
      anchor,
      anchoredCheckpoint,
      controllerPem,
      witness.privateKey
    );
    const line = `${canonicalJson(record)}\n`;
    const recordBytes = Buffer.byteLength(line, 'utf8') - 1;
    if (recordBytes > maxRecordBytes) {
      throw new ValidationError('public witness currentness anchor record exceeds configured byte limit');
    }
    const info = await lstat(statePath);
    if (info.size + Buffer.byteLength(line, 'utf8') > maxStateBytes) {
      throw new ValidationError('public witness currentness anchor state capacity byte limit exceeded');
    }

    await appendSynced(statePath, line);
    const disk = await loadState({
      statePath,
      maxStateBytes,
      maxRecordBytes,
      trustedWitnessPublicKey: witness.publicKey,
      domainId,
      witnessId
    });
    if (disk.latest_record_digest !== record.record_digest || disk.records.length !== sequence) {
      throw new ValidationError('public witness currentness anchor durable append did not verify after sync');
    }
    state = disk;
    retainedStateIdentity = stateIdentity(state);
    return publicationProjection('published', anchor, record);
  }

  function getAnchor(anchorDigest) {
    const normalized = digest(anchorDigest, 'public witness currentness anchor digest');
    return state.anchors.get(normalized) ?? null;
  }

  function getHead(query) {
    const normalized = normalizeHeadQuery(query);
    return state.heads.get(chainKey(normalized)) ?? null;
  }

  async function verifyState() {
    const disk = await verifyDiskUnchanged();
    return Object.freeze({
      valid: true,
      records: disk.records.length,
      anchor_count: disk.anchors.size,
      chain_count: disk.heads.size,
      latest_record_digest: disk.latest_record_digest,
      execution_authority_granted: false,
      data_availability_claimed: false,
      global_currentness_claimed: false,
      finality_claimed: false,
      authority_effect: 'none',
      network_effect: 'none'
    });
  }

  return Object.freeze({
    publish,
    getAnchor,
    getHead,
    verifyState
  });
}
