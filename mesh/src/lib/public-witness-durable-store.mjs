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
import { createPublicWitnessServiceLab } from './public-witness-service.mjs';

export const PUBLIC_WITNESS_DURABLE_RECORD_SCHEMA = 'axiom-public-witness-durable-record.v1';

const DIGEST = /^[a-f0-9]{64}$/;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$/;
const BASE64URL = /^[A-Za-z0-9_-]+$/;
const OPERATIONS = new Set(['observe-credential', 'observe-revocation', 'observe-journal']);
const MAX_SEQUENCE = Number.MAX_SAFE_INTEGER;
const DEFAULT_MAX_STATE_BYTES = 64 * 1024 * 1024;
const HARD_MAX_STATE_BYTES = 512 * 1024 * 1024;
const DEFAULT_MAX_RECORD_BYTES = 2 * 1024 * 1024;
const HARD_MAX_RECORD_BYTES = 16 * 1024 * 1024;

const RECORD_KEYS = new Set([
  'schema',
  'statement',
  'statement_digest',
  'request',
  'witness_signature',
  'record_digest'
]);
const STATEMENT_KEYS = new Set([
  'domain_id',
  'witness_id',
  'witness_key_id',
  'sequence',
  'previous_record_digest',
  'operation',
  'request_digest',
  'observation_digest',
  'conflict_digests',
  'committed_at',
  'data_availability_claimed',
  'global_currentness_claimed',
  'finality_claimed',
  'authority_effect',
  'network_effect'
]);

function exactKeys(raw, allowed, label) {
  const value = assertPlainObject(raw, label);
  const actual = Object.keys(value);
  for (const key of actual) {
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
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_SEQUENCE) {
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

function signer(privateKeyValue) {
  const privateKey = parsePrivateKey(privateKeyValue, 'public witness durable private key');
  const publicKey = createPublicKey(privateKey);
  return Object.freeze({
    privateKey,
    publicKey,
    keyId: publicKeyId(publicKey, 'public witness durable public key')
  });
}

function sortedUniqueDigests(raw, label) {
  if (!Array.isArray(raw) || raw.length > 4096) {
    throw new ValidationError(`${label} must be an array with at most 4096 items`);
  }
  const values = raw.map((item, index) => digest(item, `${label}[${index}]`));
  if (new Set(values).size !== values.length) throw new ValidationError(`${label} must be unique`);
  return Object.freeze([...values].sort());
}

function normalizeStatement(raw) {
  const value = exactKeys(raw, STATEMENT_KEYS, 'public witness durable record statement');
  const sequence = positiveInteger(value.sequence, 'public witness durable record sequence');
  const previous = nullableDigest(value.previous_record_digest, 'public witness durable record previous_record_digest');
  if ((sequence === 1) !== (previous === null)) {
    throw new ValidationError('public witness durable first record requires null predecessor and later records require one');
  }
  const operation = assertString(value.operation, 'public witness durable record operation');
  if (!OPERATIONS.has(operation)) throw new ValidationError('public witness durable record operation is invalid');
  if (
    value.data_availability_claimed !== false
    || value.global_currentness_claimed !== false
    || value.finality_claimed !== false
  ) {
    throw new ValidationError('public witness durable record cannot claim data availability, global currentness, or finality');
  }
  if (value.authority_effect !== 'none' || value.network_effect !== 'none') {
    throw new ValidationError('public witness durable record cannot perform authority or network effects');
  }
  return Object.freeze({
    domain_id: identifier(value.domain_id, 'public witness durable domain_id'),
    witness_id: identifier(value.witness_id, 'public witness durable witness_id'),
    witness_key_id: digest(value.witness_key_id, 'public witness durable witness_key_id'),
    sequence,
    previous_record_digest: previous,
    operation,
    request_digest: digest(value.request_digest, 'public witness durable request_digest'),
    observation_digest: digest(value.observation_digest, 'public witness durable observation_digest'),
    conflict_digests: sortedUniqueDigests(value.conflict_digests, 'public witness durable conflict_digests'),
    committed_at: canonicalTimestamp(value.committed_at, 'public witness durable committed_at'),
    data_availability_claimed: false,
    global_currentness_claimed: false,
    finality_claimed: false,
    authority_effect: 'none',
    network_effect: 'none'
  });
}

function normalizeRequest(raw, expectedOperation) {
  const value = assertPlainObject(raw, 'public witness durable request');
  if (expectedOperation === 'observe-credential') {
    exactKeys(value, new Set(['credential', 'trusted_persona_root_public_key', 'observed_at']), 'public witness durable credential request');
    return Object.freeze({
      credential: value.credential,
      trusted_persona_root_public_key: assertString(value.trusted_persona_root_public_key, 'trusted persona root public key', { min: 64, max: 16384 }),
      observed_at: canonicalTimestamp(value.observed_at, 'public witness durable credential observed_at')
    });
  }
  if (expectedOperation === 'observe-revocation') {
    exactKeys(value, new Set(['revocation', 'credential', 'trusted_persona_root_public_key', 'observed_at']), 'public witness durable revocation request');
    return Object.freeze({
      revocation: value.revocation,
      credential: value.credential,
      trusted_persona_root_public_key: assertString(value.trusted_persona_root_public_key, 'trusted persona root public key', { min: 64, max: 16384 }),
      observed_at: canonicalTimestamp(value.observed_at, 'public witness durable revocation observed_at')
    });
  }
  if (expectedOperation === 'observe-journal') {
    exactKeys(value, new Set([
      'attestation',
      'persona_signing_credential',
      'trusted_persona_root_public_key',
      'entry',
      'publication',
      'observed_at'
    ]), 'public witness durable journal request');
    if (value.publication !== null && (typeof value.publication !== 'object' || Array.isArray(value.publication))) {
      throw new ValidationError('public witness durable journal publication must be an object or null');
    }
    return Object.freeze({
      attestation: value.attestation,
      persona_signing_credential: value.persona_signing_credential,
      trusted_persona_root_public_key: assertString(value.trusted_persona_root_public_key, 'trusted persona root public key', { min: 64, max: 16384 }),
      entry: value.entry,
      publication: value.publication,
      observed_at: canonicalTimestamp(value.observed_at, 'public witness durable journal observed_at')
    });
  }
  throw new ValidationError('public witness durable request operation is unsupported');
}

function signRecord(statement, request, witnessPrivateKey) {
  const normalizedStatement = normalizeStatement(statement);
  const normalizedRequest = normalizeRequest(request, normalizedStatement.operation);
  if (normalizedStatement.request_digest !== digestObject(normalizedRequest)) {
    throw new ValidationError('public witness durable request digest does not match request');
  }
  const statementDigest = digestObject(normalizedStatement);
  const signable = Object.freeze({
    schema: PUBLIC_WITNESS_DURABLE_RECORD_SCHEMA,
    statement: normalizedStatement,
    statement_digest: statementDigest,
    request: normalizedRequest
  });
  const witnessSignature = sign(
    null,
    Buffer.from(canonicalJson(signable)),
    witnessPrivateKey
  ).toString('base64url');
  const signed = Object.freeze({ ...signable, witness_signature: witnessSignature });
  return Object.freeze({ ...signed, record_digest: digestObject(signed) });
}

export function verifyPublicWitnessDurableRecord(raw, {
  trustedWitnessPublicKey,
  expectedDomainId,
  expectedWitnessId
} = {}) {
  const value = exactKeys(raw, RECORD_KEYS, 'public witness durable record');
  if (value.schema !== PUBLIC_WITNESS_DURABLE_RECORD_SCHEMA) {
    throw new ValidationError('public witness durable record schema is unsupported');
  }
  const statement = normalizeStatement(value.statement);
  const request = normalizeRequest(value.request, statement.operation);
  const statementDigest = digest(value.statement_digest, 'public witness durable record statement_digest');
  if (statementDigest !== digestObject(statement)) {
    throw new ValidationError('public witness durable record statement digest does not match canonical content');
  }
  if (statement.request_digest !== digestObject(request)) {
    throw new ValidationError('public witness durable record request digest does not match canonical request');
  }
  const signature = assertString(value.witness_signature, 'public witness durable record witness_signature', {
    min: 32,
    max: 1024,
    pattern: BASE64URL
  });
  const publicKey = parsePublicKey(trustedWitnessPublicKey, 'trusted public witness durable public key');
  if (publicKeyId(publicKey, 'trusted public witness durable public key') !== statement.witness_key_id) {
    throw new ValidationError('public witness durable record witness key does not match trusted public key');
  }
  let valid = false;
  try {
    valid = verify(
      null,
      Buffer.from(canonicalJson({
        schema: PUBLIC_WITNESS_DURABLE_RECORD_SCHEMA,
        statement,
        statement_digest: statementDigest,
        request
      })),
      publicKey,
      Buffer.from(signature, 'base64url')
    );
  } catch {
    valid = false;
  }
  if (!valid) throw new ValidationError('public witness durable record witness signature is invalid');
  const signed = Object.freeze({
    schema: PUBLIC_WITNESS_DURABLE_RECORD_SCHEMA,
    statement,
    statement_digest: statementDigest,
    request,
    witness_signature: signature
  });
  const recordDigest = digest(value.record_digest, 'public witness durable record record_digest');
  if (recordDigest !== digestObject(signed)) {
    throw new ValidationError('public witness durable record digest does not match signed content');
  }
  if (expectedDomainId !== undefined && statement.domain_id !== expectedDomainId) {
    throw new ValidationError('public witness durable record belongs to a different domain');
  }
  if (expectedWitnessId !== undefined && statement.witness_id !== expectedWitnessId) {
    throw new ValidationError('public witness durable record belongs to a different witness');
  }
  return Object.freeze({ ...signed, record_digest: recordDigest });
}

function applyRequest(core, operation, request) {
  if (operation === 'observe-credential') {
    return core.observeCredential(request.credential, {
      trustedPersonaRootPublicKey: request.trusted_persona_root_public_key,
      observedAt: request.observed_at
    });
  }
  if (operation === 'observe-revocation') {
    return core.observeRevocation(request.revocation, {
      trustedPersonaRootPublicKey: request.trusted_persona_root_public_key,
      credential: request.credential,
      observedAt: request.observed_at
    });
  }
  if (operation === 'observe-journal') {
    return core.observeJournal(request.attestation, {
      personaSigningCredential: request.persona_signing_credential,
      trustedPersonaRootPublicKey: request.trusted_persona_root_public_key,
      entry: request.entry,
      publication: request.publication === null ? undefined : request.publication,
      observedAt: request.observed_at
    });
  }
  throw new ValidationError('public witness durable operation is unsupported');
}

function resultDigests(result) {
  return Object.freeze({
    observation_digest: digest(result.observation.observation_digest, 'public witness durable result observation_digest'),
    conflict_digests: sortedUniqueDigests(
      result.conflicts.map(conflict => conflict.conflict_digest),
      'public witness durable result conflict_digests'
    )
  });
}

async function ensureStateFile(statePath) {
  await mkdir(dirname(statePath), { recursive: true, mode: 0o700 });
  try {
    const info = await lstat(statePath);
    if (info.isSymbolicLink() || !info.isFile()) {
      throw new ValidationError('public witness durable state path must be a regular non-symlink file');
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    const handle = await open(statePath, 'wx', 0o600);
    await handle.close();
  }
}

async function readRecordLines(statePath, maxStateBytes, maxRecordBytes) {
  const info = await stat(statePath);
  if (info.size > maxStateBytes) throw new ValidationError('public witness durable state exceeds configured byte limit');
  if (info.size === 0) return [];
  const bytes = await readFile(statePath);
  if (bytes.length > maxStateBytes) throw new ValidationError('public witness durable state exceeds configured byte limit');
  const text = bytes.toString('utf8');
  if (!text.endsWith('\n')) {
    throw new ValidationError('public witness durable state has an incomplete trailing record');
  }
  const lines = text.slice(0, -1).split('\n');
  return lines.map((line, index) => {
    if (Buffer.byteLength(line, 'utf8') > maxRecordBytes) {
      throw new ValidationError(`public witness durable record ${index + 1} exceeds configured byte limit`);
    }
    try {
      const parsed = JSON.parse(line);
      if (canonicalJson(parsed) !== line) {
        throw new ValidationError(`public witness durable record ${index + 1} must use canonical JSON`);
      }
      return parsed;
    } catch (error) {
      if (error instanceof ValidationError) throw error;
      throw new ValidationError(`public witness durable record ${index + 1} is not valid JSON`);
    }
  });
}

function replayRecords(records, {
  domainId,
  witnessId,
  witnessPrivateKey,
  maxArtifacts,
  maxConflicts
}) {
  const signing = signer(witnessPrivateKey);
  const core = createPublicWitnessServiceLab({
    domainId,
    witnessId,
    witnessPrivateKey,
    maxArtifacts,
    maxConflicts
  });
  let previousDigest = null;
  for (let index = 0; index < records.length; index += 1) {
    const record = verifyPublicWitnessDurableRecord(records[index], {
      trustedWitnessPublicKey: signing.publicKey,
      expectedDomainId: domainId,
      expectedWitnessId: witnessId
    });
    if (record.statement.sequence !== index + 1) {
      throw new ValidationError('public witness durable record sequence is not contiguous');
    }
    if (record.statement.previous_record_digest !== previousDigest) {
      throw new ValidationError('public witness durable record predecessor chain is invalid');
    }
    const result = applyRequest(core, record.statement.operation, record.request);
    if (result.status === 'replay') {
      throw new ValidationError('public witness durable state contains a duplicate observation operation');
    }
    const digests = resultDigests(result);
    if (
      digests.observation_digest !== record.statement.observation_digest
      || digests.conflict_digests.join(',') !== record.statement.conflict_digests.join(',')
    ) {
      throw new ValidationError('public witness durable record result does not reproduce deterministically');
    }
    previousDigest = record.record_digest;
  }
  return Object.freeze({ core, lastRecordDigest: previousDigest, witnessKeyId: signing.keyId });
}

export class PublicWitnessDurableStore {
  constructor({
    statePath,
    domainId,
    witnessId,
    witnessPrivateKey,
    maxArtifacts,
    maxConflicts,
    maxStateBytes,
    maxRecordBytes,
    records,
    core,
    witnessKeyId
  }) {
    this.statePath = statePath;
    this.domainId = domainId;
    this.witnessId = witnessId;
    this.witnessPrivateKey = witnessPrivateKey;
    this.maxArtifacts = maxArtifacts;
    this.maxConflicts = maxConflicts;
    this.maxStateBytes = maxStateBytes;
    this.maxRecordBytes = maxRecordBytes;
    this.records = records;
    this.core = core;
    this.witnessKeyId = witnessKeyId;
    this._tail = Promise.resolve();
  }

  get witnessPublicKey() {
    return this.core.witnessPublicKey;
  }

  async commit(operation, rawRequest, { committedAt } = {}) {
    const normalizedOperation = assertString(operation, 'public witness durable operation');
    if (!OPERATIONS.has(normalizedOperation)) throw new ValidationError('public witness durable operation is invalid');
    const request = normalizeRequest(rawRequest, normalizedOperation);
    const committed = canonicalTimestamp(committedAt ?? new Date().toISOString(), 'public witness durable committedAt');
    if (committed < request.observed_at) {
      throw new ValidationError('public witness durable commit cannot predate the witness observation');
    }
    if (this.records.length > 0 && committed < this.records.at(-1).statement.committed_at) {
      throw new ValidationError('public witness durable commit time cannot move backward');
    }
    const run = async () => this._commitSerialized(normalizedOperation, request, committed);
    const promise = this._tail.then(run, run);
    this._tail = promise.then(() => undefined, () => undefined);
    return promise;
  }

  async _assertDiskMatchesMemory() {
    const signing = signer(this.witnessPrivateKey);
    const rawRecords = await readRecordLines(this.statePath, this.maxStateBytes, this.maxRecordBytes);
    if (rawRecords.length !== this.records.length) {
      throw new ValidationError('public witness durable state changed outside the active store');
    }
    for (let index = 0; index < rawRecords.length; index += 1) {
      const verified = verifyPublicWitnessDurableRecord(rawRecords[index], {
        trustedWitnessPublicKey: signing.publicKey,
        expectedDomainId: this.domainId,
        expectedWitnessId: this.witnessId
      });
      if (verified.record_digest !== this.records[index].record_digest) {
        throw new ValidationError('public witness durable state changed outside the active store');
      }
    }
    return rawRecords;
  }

  async _commitSerialized(operation, request, committedAt) {
    await this._assertDiskMatchesMemory();
    const trial = replayRecords(this.records, {
      domainId: this.domainId,
      witnessId: this.witnessId,
      witnessPrivateKey: this.witnessPrivateKey,
      maxArtifacts: this.maxArtifacts,
      maxConflicts: this.maxConflicts
    });
    const result = applyRequest(trial.core, operation, request);
    if (result.status === 'replay') {
      return Object.freeze({ ...result, durable_record: null });
    }
    const digests = resultDigests(result);
    const privateKey = parsePrivateKey(this.witnessPrivateKey, 'public witness durable private key');
    const statement = normalizeStatement({
      domain_id: this.domainId,
      witness_id: this.witnessId,
      witness_key_id: this.witnessKeyId,
      sequence: this.records.length + 1,
      previous_record_digest: this.records.length === 0 ? null : this.records.at(-1).record_digest,
      operation,
      request_digest: digestObject(request),
      observation_digest: digests.observation_digest,
      conflict_digests: digests.conflict_digests,
      committed_at: committedAt,
      data_availability_claimed: false,
      global_currentness_claimed: false,
      finality_claimed: false,
      authority_effect: 'none',
      network_effect: 'none'
    });
    const record = signRecord(statement, request, privateKey);
    const line = `${canonicalJson(record)}\n`;
    const lineBytes = Buffer.byteLength(line, 'utf8');
    if (lineBytes > this.maxRecordBytes) {
      throw new ValidationError('public witness durable record exceeds configured byte limit');
    }
    const current = await stat(this.statePath);
    if (current.size + lineBytes > this.maxStateBytes) {
      throw new ValidationError('public witness durable state capacity is exhausted');
    }
    const handle = await open(this.statePath, 'a');
    try {
      await handle.writeFile(line, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
    this.records.push(record);
    this.core = trial.core;
    return Object.freeze({ ...result, durable_record: structuredClone(record) });
  }

  getArtifact(artifactDigest) {
    return this.core.getArtifact(artifactDigest);
  }

  getObservation(artifactDigest) {
    return this.core.getObservation(artifactDigest);
  }

  listPosition(options) {
    return this.core.listPosition(options);
  }

  listConflicts() {
    return this.core.listConflicts();
  }

  snapshot() {
    const witness = this.core.snapshot();
    const body = Object.freeze({
      ...witness,
      durable_record_count: this.records.length,
      durable_last_record_digest: this.records.length === 0 ? null : this.records.at(-1).record_digest,
      durable_state_path_disclosed: false,
      data_availability_claimed: false
    });
    return Object.freeze({ ...body, durable_snapshot_digest: digestObject(body) });
  }

  async verifyState() {
    const rawRecords = await this._assertDiskMatchesMemory();
    replayRecords(rawRecords, {
      domainId: this.domainId,
      witnessId: this.witnessId,
      witnessPrivateKey: this.witnessPrivateKey,
      maxArtifacts: this.maxArtifacts,
      maxConflicts: this.maxConflicts
    });
    return Object.freeze({
      valid: true,
      records: this.records.length,
      last_record_digest: this.records.length === 0 ? null : this.records.at(-1).record_digest,
      witness_key_id: this.witnessKeyId,
      global_currentness_claimed: false,
      finality_claimed: false,
      authority_effect: 'none',
      network_effect: 'none'
    });
  }
}

export async function openPublicWitnessDurableStore({
  statePath,
  domainId,
  witnessId,
  witnessPrivateKey,
  maxArtifacts,
  maxConflicts,
  maxStateBytes,
  maxRecordBytes
} = {}) {
  const normalizedStatePath = assertString(statePath, 'public witness durable statePath', { min: 1, max: 4096 });
  const normalizedDomainId = identifier(domainId, 'public witness durable domainId');
  const normalizedWitnessId = identifier(witnessId, 'public witness durable witnessId');
  const normalizedMaxStateBytes = boundedInteger(maxStateBytes, 'public witness durable maxStateBytes', DEFAULT_MAX_STATE_BYTES, HARD_MAX_STATE_BYTES);
  const normalizedMaxRecordBytes = boundedInteger(maxRecordBytes, 'public witness durable maxRecordBytes', DEFAULT_MAX_RECORD_BYTES, HARD_MAX_RECORD_BYTES);
  if (normalizedMaxRecordBytes > normalizedMaxStateBytes) {
    throw new ValidationError('public witness durable maxRecordBytes cannot exceed maxStateBytes');
  }
  const signing = signer(witnessPrivateKey);
  await ensureStateFile(normalizedStatePath);
  const rawRecords = await readRecordLines(normalizedStatePath, normalizedMaxStateBytes, normalizedMaxRecordBytes);
  const verifiedRecords = [];
  for (const raw of rawRecords) {
    verifiedRecords.push(verifyPublicWitnessDurableRecord(raw, {
      trustedWitnessPublicKey: signing.publicKey,
      expectedDomainId: normalizedDomainId,
      expectedWitnessId: normalizedWitnessId
    }));
  }
  const replayed = replayRecords(verifiedRecords, {
    domainId: normalizedDomainId,
    witnessId: normalizedWitnessId,
    witnessPrivateKey,
    maxArtifacts,
    maxConflicts
  });
  return new PublicWitnessDurableStore({
    statePath: normalizedStatePath,
    domainId: normalizedDomainId,
    witnessId: normalizedWitnessId,
    witnessPrivateKey,
    maxArtifacts,
    maxConflicts,
    maxStateBytes: normalizedMaxStateBytes,
    maxRecordBytes: normalizedMaxRecordBytes,
    records: verifiedRecords,
    core: replayed.core,
    witnessKeyId: signing.keyId
  });
}
