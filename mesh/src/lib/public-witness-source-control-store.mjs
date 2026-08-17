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
  readFile,
  stat
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
  projectPublicWitnessSourceControlToIngressTrustEntry,
  validatePublicWitnessSourceControl,
  validatePublicWitnessSourceControlTransition,
  verifyPublicWitnessSourceControlAgainstReceiver
} from './public-witness-source-control.mjs';

export const PUBLIC_WITNESS_SOURCE_CONTROL_RECORD_SCHEMA = 'axiom-public-witness-source-control-record.v1';
export const PUBLIC_WITNESS_SOURCE_CONTROL_STORE_SNAPSHOT_SCHEMA = 'axiom-public-witness-source-control-store-snapshot.v1';

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const BASE64URL = /^[A-Za-z0-9_-]+$/;
const DEFAULT_MAX_STATE_BYTES = 32 * 1024 * 1024;
const HARD_MAX_STATE_BYTES = 256 * 1024 * 1024;
const DEFAULT_MAX_RECORD_BYTES = 2 * 1024 * 1024;
const HARD_MAX_RECORD_BYTES = 8 * 1024 * 1024;
const DEFAULT_MAX_CONTROLS = 10000;
const HARD_MAX_CONTROLS = 100000;

const RECORD_KEYS = new Set([
  'schema',
  'statement',
  'statement_digest',
  'control',
  'operator_signature',
  'record_digest'
]);
const STATEMENT_KEYS = new Set([
  'domain_id',
  'operator_id',
  'operator_key_id',
  'sequence',
  'previous_record_digest',
  'control_digest',
  'applied_at',
  'local_operator_signature_claimed',
  'remote_self_provisioning_allowed',
  'receiver_mutation_claimed',
  'persona_root_trust_effect',
  'social_authority_effect',
  'finality_claimed',
  'authority_effect',
  'network_effect'
]);

function exactKeys(raw, allowed, label) {
  const value = assertPlainObject(raw, label);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new ValidationError(`${label} contains unsupported field ${key}`);
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

function canonicalTimestamp(value, label) {
  const text = assertString(value, label, { min: 24, max: 24 });
  const parsed = new Date(text);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== text) {
    throw new ValidationError(`${label} must be a canonical UTC ISO timestamp`);
  }
  return text;
}

function positiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new ValidationError(`${label} must be a positive safe integer`);
  }
  return value;
}

function boundedInteger(value, label, fallback, max) {
  const normalized = value === undefined ? fallback : value;
  if (!Number.isSafeInteger(normalized) || normalized < 1 || normalized > max) {
    throw new ValidationError(`${label} must be a positive safe integer no greater than ${max}`);
  }
  return normalized;
}

function parsePrivateKey(value, label) {
  let key;
  try {
    key = value && typeof value === 'object' && value.type === 'private'
      ? value
      : createPrivateKey(value);
  } catch {
    throw new ValidationError(`${label} is invalid`);
  }
  if (key.asymmetricKeyType !== 'ed25519') throw new ValidationError(`${label} must be Ed25519`);
  return key;
}

function parsePublicKey(value, label) {
  let key;
  try {
    key = value && typeof value === 'object' && value.type === 'public'
      ? value
      : createPublicKey(value);
  } catch {
    throw new ValidationError(`${label} is invalid`);
  }
  if (key.asymmetricKeyType !== 'ed25519') throw new ValidationError(`${label} must be Ed25519`);
  return key;
}

function publicKeyId(value, label) {
  const key = parsePublicKey(value, label);
  return sha256(key.export({ type: 'spki', format: 'pem' }).toString());
}

function signingKey(privateKeyValue) {
  const privateKey = parsePrivateKey(privateKeyValue, 'public witness source-control operator private key');
  const publicKey = createPublicKey(privateKey);
  return Object.freeze({
    privateKey,
    publicKey,
    keyId: publicKeyId(publicKey, 'public witness source-control operator public key')
  });
}

function normalizeStatement(raw) {
  const value = exactKeys(raw, STATEMENT_KEYS, 'public witness source-control record statement');
  const sequence = positiveInteger(value.sequence, 'public witness source-control record sequence');
  const previous = nullableDigest(value.previous_record_digest, 'public witness source-control previous_record_digest');
  if ((sequence === 1) !== (previous === null)) {
    throw new ValidationError('public witness source-control first durable record requires null predecessor and later records require one');
  }
  if (
    value.local_operator_signature_claimed !== true
    || value.remote_self_provisioning_allowed !== false
    || value.receiver_mutation_claimed !== false
    || value.persona_root_trust_effect !== 'none'
    || value.social_authority_effect !== 'none'
    || value.finality_claimed !== false
    || value.authority_effect !== 'none'
    || value.network_effect !== 'none'
  ) {
    throw new ValidationError('public witness source-control durable record cannot expand remote, receiver, persona, social, finality, authority, or network claims');
  }
  return Object.freeze({
    domain_id: identifier(value.domain_id, 'public witness source-control record domain_id'),
    operator_id: identifier(value.operator_id, 'public witness source-control record operator_id'),
    operator_key_id: digest(value.operator_key_id, 'public witness source-control record operator_key_id'),
    sequence,
    previous_record_digest: previous,
    control_digest: digest(value.control_digest, 'public witness source-control record control_digest'),
    applied_at: canonicalTimestamp(value.applied_at, 'public witness source-control record applied_at'),
    local_operator_signature_claimed: true,
    remote_self_provisioning_allowed: false,
    receiver_mutation_claimed: false,
    persona_root_trust_effect: 'none',
    social_authority_effect: 'none',
    finality_claimed: false,
    authority_effect: 'none',
    network_effect: 'none'
  });
}

function recordDigestBody(record) {
  return Object.freeze({
    schema: record.schema,
    statement: record.statement,
    statement_digest: record.statement_digest,
    control: record.control,
    operator_signature: record.operator_signature
  });
}

export function verifyPublicWitnessSourceControlRecord(raw, {
  trustedOperatorPublicKey,
  expectedDomainId,
  expectedOperatorId
} = {}) {
  const value = exactKeys(raw, RECORD_KEYS, 'public witness source-control durable record');
  if (value.schema !== PUBLIC_WITNESS_SOURCE_CONTROL_RECORD_SCHEMA) {
    throw new ValidationError('public witness source-control durable record schema is unsupported');
  }
  const statement = normalizeStatement(value.statement);
  const control = validatePublicWitnessSourceControl(value.control);
  if (statement.control_digest !== control.control_digest) {
    throw new ValidationError('public witness source-control durable record control digest mismatch');
  }
  const statementDigest = digest(value.statement_digest, 'public witness source-control statement_digest');
  if (statementDigest !== digestObject(statement)) {
    throw new ValidationError('public witness source-control durable record statement digest mismatch');
  }
  const publicKey = parsePublicKey(trustedOperatorPublicKey, 'public witness source-control trusted operator public key');
  if (statement.operator_key_id !== publicKeyId(publicKey, 'public witness source-control trusted operator public key')) {
    throw new ValidationError('public witness source-control durable record operator key substitution');
  }
  const signature = assertString(value.operator_signature, 'public witness source-control operator_signature', {
    min: 32,
    max: 256,
    pattern: BASE64URL
  });
  if (!verify(null, Buffer.from(canonicalJson(statement)), publicKey, Buffer.from(signature, 'base64url'))) {
    throw new ValidationError('public witness source-control durable record operator signature is invalid');
  }
  const expectedRecordDigest = digestObject(recordDigestBody({
    schema: PUBLIC_WITNESS_SOURCE_CONTROL_RECORD_SCHEMA,
    statement,
    statement_digest: statementDigest,
    control,
    operator_signature: signature
  }));
  if (digest(value.record_digest, 'public witness source-control record_digest') !== expectedRecordDigest) {
    throw new ValidationError('public witness source-control durable record digest mismatch');
  }
  if (expectedDomainId !== undefined && statement.domain_id !== expectedDomainId) {
    throw new ValidationError('public witness source-control durable record belongs to a different domain');
  }
  if (expectedOperatorId !== undefined && statement.operator_id !== expectedOperatorId) {
    throw new ValidationError('public witness source-control durable record belongs to a different operator');
  }
  return Object.freeze({
    schema: PUBLIC_WITNESS_SOURCE_CONTROL_RECORD_SCHEMA,
    statement,
    statement_digest: statementDigest,
    control,
    operator_signature: signature,
    record_digest: expectedRecordDigest
  });
}

function createRecord(control, {
  domainId,
  operatorId,
  operatorPrivateKey,
  operatorKeyId,
  sequence,
  previousRecordDigest,
  appliedAt
}) {
  const statement = Object.freeze({
    domain_id: domainId,
    operator_id: operatorId,
    operator_key_id: operatorKeyId,
    sequence,
    previous_record_digest: previousRecordDigest,
    control_digest: control.control_digest,
    applied_at: appliedAt,
    local_operator_signature_claimed: true,
    remote_self_provisioning_allowed: false,
    receiver_mutation_claimed: false,
    persona_root_trust_effect: 'none',
    social_authority_effect: 'none',
    finality_claimed: false,
    authority_effect: 'none',
    network_effect: 'none'
  });
  const statementDigest = digestObject(statement);
  const signature = sign(null, Buffer.from(canonicalJson(statement)), operatorPrivateKey).toString('base64url');
  const body = Object.freeze({
    schema: PUBLIC_WITNESS_SOURCE_CONTROL_RECORD_SCHEMA,
    statement,
    statement_digest: statementDigest,
    control,
    operator_signature: signature
  });
  return Object.freeze({ ...body, record_digest: digestObject(body) });
}

async function ensureRegularStateFile(path) {
  await mkdir(dirname(path), { recursive: true });
  try {
    const info = await lstat(path);
    if (info.isSymbolicLink() || !info.isFile()) {
      throw new ValidationError('public witness source-control state must be a regular non-symlink file');
    }
  } catch (error) {
    if (error instanceof ValidationError) throw error;
    if (error?.code !== 'ENOENT') throw error;
    const handle = await open(path, 'wx');
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
  }
}

async function readRecords(path, maxStateBytes, maxRecordBytes) {
  const info = await stat(path);
  if (info.size > maxStateBytes) throw new ValidationError('public witness source-control state exceeds configured capacity');
  if (info.size === 0) return [];
  const text = await readFile(path, 'utf8');
  if (!text.endsWith('\n')) throw new ValidationError('public witness source-control state is truncated');
  const lines = text.slice(0, -1).split('\n');
  const records = [];
  for (const line of lines) {
    if (Buffer.byteLength(line) > maxRecordBytes) {
      throw new ValidationError('public witness source-control durable record exceeds configured byte limit');
    }
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch {
      throw new ValidationError('public witness source-control state contains invalid JSON');
    }
    if (canonicalJson(parsed) !== line) {
      throw new ValidationError('public witness source-control state contains a noncanonical record');
    }
    records.push(parsed);
  }
  return records;
}

function validateAppliedTransition(current, control) {
  if (!current) {
    if (
      control.control_sequence !== 1
      || control.previous_control_digest !== null
      || control.operation !== 'admit'
      || control.source_epoch !== 1
    ) {
      throw new ValidationError('public witness source-control applied lineage must begin with epoch-1 admit genesis');
    }
    return;
  }
  validatePublicWitnessSourceControlTransition(current, control);
}

function rebuild(records, {
  receiverStore,
  operatorPublicKey,
  domainId,
  operatorId,
  maxControls
}) {
  const currentBySource = new Map();
  const recordByControlDigest = new Map();
  let previousRecordDigest = null;
  for (let index = 0; index < records.length; index += 1) {
    if (index >= maxControls) throw new ValidationError('public witness source-control durable state control capacity is exhausted');
    const record = verifyPublicWitnessSourceControlRecord(records[index], {
      trustedOperatorPublicKey: operatorPublicKey,
      expectedDomainId: domainId,
      expectedOperatorId: operatorId
    });
    if (record.statement.sequence !== index + 1 || record.statement.previous_record_digest !== previousRecordDigest) {
      throw new ValidationError('public witness source-control durable record chain is discontinuous');
    }
    if (record.control.domain_id !== domainId) {
      throw new ValidationError('public witness source-control durable control belongs to a different domain');
    }
    if (record.statement.applied_at < record.control.effective_at) {
      throw new ValidationError('public witness source-control durable control was applied before its effective time');
    }
    if (recordByControlDigest.has(record.control.control_digest)) {
      throw new ValidationError('public witness source-control durable state contains duplicate control application');
    }
    verifyPublicWitnessSourceControlAgainstReceiver({ receiverStore, control: record.control });
    const current = currentBySource.get(record.control.source_id) ?? null;
    validateAppliedTransition(current, record.control);
    currentBySource.set(record.control.source_id, record.control);
    recordByControlDigest.set(record.control.control_digest, record);
    previousRecordDigest = record.record_digest;
  }
  return Object.freeze({ currentBySource, recordByControlDigest });
}

export class PublicWitnessSourceControlStore {
  #statePath;
  #receiverStore;
  #domainId;
  #operatorId;
  #operatorPrivateKey;
  #operatorPublicKey;
  #operatorKeyId;
  #maxStateBytes;
  #maxRecordBytes;
  #maxControls;
  #records;
  #currentBySource;
  #recordByControlDigest;
  #tail;

  constructor({
    statePath,
    receiverStore,
    domainId,
    operatorId,
    signing,
    maxStateBytes,
    maxRecordBytes,
    maxControls,
    records,
    rebuilt
  }) {
    this.#statePath = statePath;
    this.#receiverStore = receiverStore;
    this.#domainId = domainId;
    this.#operatorId = operatorId;
    this.#operatorPrivateKey = signing.privateKey;
    this.#operatorPublicKey = signing.publicKey;
    this.#operatorKeyId = signing.keyId;
    this.#maxStateBytes = maxStateBytes;
    this.#maxRecordBytes = maxRecordBytes;
    this.#maxControls = maxControls;
    this.#records = records;
    this.#currentBySource = rebuilt.currentBySource;
    this.#recordByControlDigest = rebuilt.recordByControlDigest;
    this.#tail = Promise.resolve();
  }

  async #serialized(fn) {
    const run = async () => fn();
    const result = this.#tail.then(run, run);
    this.#tail = result.then(() => undefined, () => undefined);
    return result;
  }

  async #assertDiskMatchesMemory() {
    const raw = await readRecords(this.#statePath, this.#maxStateBytes, this.#maxRecordBytes);
    if (raw.length !== this.#records.length) {
      throw new ValidationError('public witness source-control state changed outside the active store');
    }
    for (let index = 0; index < raw.length; index += 1) {
      const verifiedRecord = verifyPublicWitnessSourceControlRecord(raw[index], {
        trustedOperatorPublicKey: this.#operatorPublicKey,
        expectedDomainId: this.#domainId,
        expectedOperatorId: this.#operatorId
      });
      if (verifiedRecord.record_digest !== this.#records[index].record_digest) {
        throw new ValidationError('public witness source-control state changed outside the active store');
      }
    }
  }

  async applyControl(controlRaw, { appliedAt } = {}) {
    return this.#serialized(async () => {
      const control = validatePublicWitnessSourceControl(controlRaw);
      if (control.domain_id !== this.#domainId) {
        throw new ValidationError('public witness source-control applied control belongs to a different domain');
      }
      const applied = canonicalTimestamp(appliedAt, 'public witness source-control appliedAt');
      if (applied < control.effective_at) {
        throw new ValidationError('public witness source-control cannot apply before control effective time');
      }
      const replay = this.#recordByControlDigest.get(control.control_digest);
      if (replay) {
        return Object.freeze({ status: 'replay', control: structuredClone(control), durable_record: null, original_record_digest: replay.record_digest });
      }
      await this.#assertDiskMatchesMemory();
      if (this.#records.length >= this.#maxControls) {
        throw new ValidationError('public witness source-control durable state control capacity is exhausted');
      }
      verifyPublicWitnessSourceControlAgainstReceiver({ receiverStore: this.#receiverStore, control });
      const current = this.#currentBySource.get(control.source_id) ?? null;
      validateAppliedTransition(current, control);
      const record = createRecord(control, {
        domainId: this.#domainId,
        operatorId: this.#operatorId,
        operatorPrivateKey: this.#operatorPrivateKey,
        operatorKeyId: this.#operatorKeyId,
        sequence: this.#records.length + 1,
        previousRecordDigest: this.#records.length === 0 ? null : this.#records.at(-1).record_digest,
        appliedAt: applied
      });
      const line = `${canonicalJson(record)}\n`;
      if (Buffer.byteLength(line) > this.#maxRecordBytes) {
        throw new ValidationError('public witness source-control durable record exceeds configured byte limit');
      }
      const projectedBytes = (await stat(this.#statePath)).size + Buffer.byteLength(line);
      if (projectedBytes > this.#maxStateBytes) {
        throw new ValidationError('public witness source-control state exceeds configured capacity');
      }
      const handle = await open(this.#statePath, 'a');
      try {
        await handle.writeFile(line, 'utf8');
        await handle.sync();
      } finally {
        await handle.close();
      }
      this.#records = [...this.#records, record];
      this.#currentBySource.set(control.source_id, control);
      this.#recordByControlDigest.set(control.control_digest, record);
      return Object.freeze({ status: 'applied', control: structuredClone(control), durable_record: structuredClone(record) });
    });
  }

  getCurrentControl(sourceId) {
    const normalized = identifier(sourceId, 'public witness source-control sourceId');
    const control = this.#currentBySource.get(normalized);
    return control ? structuredClone(control) : null;
  }

  resolveSourceBinding({ certificate_sha256, source_id, source_epoch } = {}) {
    const certificateDigest = digest(certificate_sha256, 'public witness source-control resolver certificate_sha256');
    const sourceId = identifier(source_id, 'public witness source-control resolver source_id');
    const sourceEpoch = positiveInteger(source_epoch, 'public witness source-control resolver source_epoch');
    const control = this.#currentBySource.get(sourceId);
    if (!control || control.source_status !== 'active') return null;
    if (control.source_epoch !== sourceEpoch || control.certificate_sha256 !== certificateDigest) return null;
    return projectPublicWitnessSourceControlToIngressTrustEntry(control)
      ? Object.freeze({ certificate_sha256: certificateDigest, source_id: sourceId, source_epoch: sourceEpoch })
      : null;
  }

  snapshot() {
    const controls = [...this.#currentBySource.values()];
    const active = controls.filter(value => value.source_status === 'active').length;
    const disabled = controls.length - active;
    const body = Object.freeze({
      schema: PUBLIC_WITNESS_SOURCE_CONTROL_STORE_SNAPSHOT_SCHEMA,
      domain_id: this.#domainId,
      operator_id: this.#operatorId,
      operator_key_id: this.#operatorKeyId,
      durable_record_count: this.#records.length,
      source_count: controls.length,
      active_source_count: active,
      disabled_source_count: disabled,
      last_record_digest: this.#records.length === 0 ? null : this.#records.at(-1).record_digest,
      local_operator_signature_claimed: true,
      remote_self_provisioning_allowed: false,
      receiver_mutation_claimed: false,
      persona_root_trust_effect: 'none',
      social_authority_effect: 'none',
      finality_claimed: false,
      authority_effect: 'none',
      network_effect: 'none'
    });
    return Object.freeze({ ...body, snapshot_digest: digestObject(body) });
  }

  async verifyState() {
    await this.#assertDiskMatchesMemory();
    rebuild(this.#records, {
      receiverStore: this.#receiverStore,
      operatorPublicKey: this.#operatorPublicKey,
      domainId: this.#domainId,
      operatorId: this.#operatorId,
      maxControls: this.#maxControls
    });
    return Object.freeze({ valid: true, ...this.snapshot() });
  }
}

export async function openPublicWitnessSourceControlStore({
  statePath,
  receiverStore,
  domainId,
  operatorId,
  operatorPrivateKey,
  maxStateBytes,
  maxRecordBytes,
  maxControls
} = {}) {
  const normalizedPath = assertString(statePath, 'public witness source-control statePath', { min: 1, max: 4096 });
  if (!receiverStore || typeof receiverStore.getSourceAdmission !== 'function' || typeof receiverStore.snapshot !== 'function') {
    throw new ValidationError('public witness source-control store requires a W2c2 receiver');
  }
  const normalizedDomain = identifier(domainId, 'public witness source-control domainId');
  const normalizedOperator = identifier(operatorId, 'public witness source-control operatorId');
  if (receiverStore.snapshot().domain_id !== normalizedDomain) {
    throw new ValidationError('public witness source-control store receiver belongs to a different domain');
  }
  const normalizedMaxState = boundedInteger(maxStateBytes, 'public witness source-control maxStateBytes', DEFAULT_MAX_STATE_BYTES, HARD_MAX_STATE_BYTES);
  const normalizedMaxRecord = boundedInteger(maxRecordBytes, 'public witness source-control maxRecordBytes', DEFAULT_MAX_RECORD_BYTES, HARD_MAX_RECORD_BYTES);
  if (normalizedMaxRecord > normalizedMaxState) {
    throw new ValidationError('public witness source-control maxRecordBytes cannot exceed maxStateBytes');
  }
  const normalizedMaxControls = boundedInteger(maxControls, 'public witness source-control maxControls', DEFAULT_MAX_CONTROLS, HARD_MAX_CONTROLS);
  const signing = signingKey(operatorPrivateKey);
  await ensureRegularStateFile(normalizedPath);
  const raw = await readRecords(normalizedPath, normalizedMaxState, normalizedMaxRecord);
  const records = raw.map(record => verifyPublicWitnessSourceControlRecord(record, {
    trustedOperatorPublicKey: signing.publicKey,
    expectedDomainId: normalizedDomain,
    expectedOperatorId: normalizedOperator
  }));
  const rebuilt = rebuild(records, {
    receiverStore,
    operatorPublicKey: signing.publicKey,
    domainId: normalizedDomain,
    operatorId: normalizedOperator,
    maxControls: normalizedMaxControls
  });
  return new PublicWitnessSourceControlStore({
    statePath: normalizedPath,
    receiverStore,
    domainId: normalizedDomain,
    operatorId: normalizedOperator,
    signing,
    maxStateBytes: normalizedMaxState,
    maxRecordBytes: normalizedMaxRecord,
    maxControls: normalizedMaxControls,
    records,
    rebuilt
  });
}
