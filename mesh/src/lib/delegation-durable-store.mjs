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
  digestObject
} from './canonical.mjs';
import {
  normalizeDelegationAuthority,
  normalizeDelegationGrant,
  normalizeDelegationRevocation,
  resolveDelegationChain
} from './delegation-graph.mjs';

// This store persists delegation evidence only. It deliberately has no
// Gateway/capability/hypervisor integration and never grants execution authority.
export const DELEGATION_DURABLE_RECORD_SCHEMA = 'axiom-delegation-durable-record.v1';
export const DELEGATION_EVIDENCE_PROJECTION_SCHEMA = 'axiom-delegation-evidence-projection.v1';

const DIGEST = /^[a-f0-9]{64}$/;
const OPERATIONS = new Set(['trust-root', 'append-grant', 'append-revocation']);
const DEFAULT_MAX_STATE_BYTES = 64 * 1024 * 1024;
const HARD_MAX_STATE_BYTES = 512 * 1024 * 1024;
const DEFAULT_MAX_RECORD_BYTES = 2 * 1024 * 1024;
const HARD_MAX_RECORD_BYTES = 16 * 1024 * 1024;

const RECORD_KEYS = new Set([
  'schema',
  'sequence',
  'previous_record_digest',
  'operation',
  'root_authority_digest',
  'payload',
  'payload_digest',
  'committed_at',
  'execution_authority_granted',
  'authority_effect',
  'record_digest'
]);

function exactKeys(raw, allowed, label) {
  const value = assertPlainObject(raw, label);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new ValidationError(`${label} contains unsupported field ${key}`);
  }
  for (const key of allowed) {
    if (!(key in value)) throw new ValidationError(`${label} is missing required field ${key}`);
  }
  return value;
}

function digest(value, label) {
  return assertString(value, label, { min: 64, max: 64, pattern: DIGEST });
}

function canonicalTimestamp(value, label) {
  if (value instanceof Date) {
    if (Number.isNaN(value.valueOf())) throw new ValidationError(`${label} must be a valid date`);
    return value.toISOString();
  }
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

function normalizeOperation(value) {
  const operation = assertString(value, 'delegation durable operation');
  if (!OPERATIONS.has(operation)) throw new ValidationError('delegation durable operation is unsupported');
  return operation;
}

function normalizePayload(operation, raw) {
  if (operation === 'trust-root') return normalizeDelegationAuthority(raw);
  if (operation === 'append-grant') return normalizeDelegationGrant(raw);
  if (operation === 'append-revocation') return normalizeDelegationRevocation(raw);
  throw new ValidationError('delegation durable operation is unsupported');
}

function payloadDigest(operation, payload) {
  if (operation === 'trust-root') return payload.authority_digest;
  if (operation === 'append-grant') return payload.grant_digest;
  if (operation === 'append-revocation') return payload.revocation_digest;
  throw new ValidationError('delegation durable operation is unsupported');
}

function normalizeDurableRecord(raw) {
  const value = exactKeys(raw, RECORD_KEYS, 'delegation durable record');
  if (value.schema !== DELEGATION_DURABLE_RECORD_SCHEMA) {
    throw new ValidationError('delegation durable record schema is unsupported');
  }
  const sequence = positiveInteger(value.sequence, 'delegation durable sequence');
  const previous = value.previous_record_digest === null
    ? null
    : digest(value.previous_record_digest, 'delegation durable previous_record_digest');
  if ((sequence === 1) !== (previous === null)) {
    throw new ValidationError('delegation durable first record requires null predecessor and later records require one');
  }
  const operation = normalizeOperation(value.operation);
  const rootAuthorityDigest = digest(value.root_authority_digest, 'delegation durable root_authority_digest');
  const payload = normalizePayload(operation, value.payload);
  const normalizedPayloadDigest = digest(value.payload_digest, 'delegation durable payload_digest');
  if (normalizedPayloadDigest !== payloadDigest(operation, payload)) {
    throw new ValidationError('delegation durable payload digest does not match canonical payload');
  }
  if (operation === 'trust-root' && rootAuthorityDigest !== payload.authority_digest) {
    throw new ValidationError('delegation durable trusted root digest does not match authority');
  }
  if (value.execution_authority_granted !== false || value.authority_effect !== 'none') {
    throw new ValidationError('delegation durable records cannot grant execution authority or runtime authority effects');
  }
  const body = Object.freeze({
    schema: DELEGATION_DURABLE_RECORD_SCHEMA,
    sequence,
    previous_record_digest: previous,
    operation,
    root_authority_digest: rootAuthorityDigest,
    payload,
    payload_digest: normalizedPayloadDigest,
    committed_at: canonicalTimestamp(value.committed_at, 'delegation durable committed_at'),
    execution_authority_granted: false,
    authority_effect: 'none'
  });
  const recordDigest = digest(value.record_digest, 'delegation durable record_digest');
  if (recordDigest !== digestObject(body)) {
    throw new ValidationError('delegation durable record digest does not match canonical content');
  }
  return Object.freeze({ ...body, record_digest: recordDigest });
}

function createRecord({ sequence, previousRecordDigest, operation, rootAuthorityDigest, payload, committedAt }) {
  const normalizedOperation = normalizeOperation(operation);
  const normalizedPayload = normalizePayload(normalizedOperation, payload);
  const body = Object.freeze({
    schema: DELEGATION_DURABLE_RECORD_SCHEMA,
    sequence: positiveInteger(sequence, 'delegation durable sequence'),
    previous_record_digest: previousRecordDigest === null
      ? null
      : digest(previousRecordDigest, 'delegation durable previous_record_digest'),
    operation: normalizedOperation,
    root_authority_digest: digest(rootAuthorityDigest, 'delegation durable root_authority_digest'),
    payload: normalizedPayload,
    payload_digest: payloadDigest(normalizedOperation, normalizedPayload),
    committed_at: canonicalTimestamp(committedAt, 'delegation durable committed_at'),
    execution_authority_granted: false,
    authority_effect: 'none'
  });
  return normalizeDurableRecord({ ...body, record_digest: digestObject(body) });
}

async function ensureStateFile(statePath) {
  await mkdir(dirname(statePath), { recursive: true, mode: 0o700 });
  try {
    const info = await lstat(statePath);
    if (info.isSymbolicLink() || !info.isFile()) {
      throw new ValidationError('delegation durable state path must be a regular non-symlink file');
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    const handle = await open(statePath, 'wx', 0o600);
    await handle.close();
  }
}

async function assertRegularStateFile(statePath) {
  const info = await lstat(statePath);
  if (info.isSymbolicLink() || !info.isFile()) {
    throw new ValidationError('delegation durable state path must be a regular non-symlink file');
  }
  return info;
}

async function readRecordLines(statePath, maxStateBytes, maxRecordBytes) {
  const info = await assertRegularStateFile(statePath);
  if (info.size > maxStateBytes) throw new ValidationError('delegation durable state exceeds configured byte limit');
  if (info.size === 0) return [];
  const bytes = await readFile(statePath);
  if (bytes.length > maxStateBytes) throw new ValidationError('delegation durable state exceeds configured byte limit');
  const text = bytes.toString('utf8');
  if (!text.endsWith('\n')) {
    throw new ValidationError('delegation durable state has an incomplete trailing record');
  }
  const lines = text.slice(0, -1).split('\n');
  return lines.map((line, index) => {
    if (Buffer.byteLength(line, 'utf8') > maxRecordBytes) {
      throw new ValidationError(`delegation durable record ${index + 1} exceeds configured byte limit`);
    }
    try {
      const parsed = JSON.parse(line);
      if (canonicalJson(parsed) !== line) {
        throw new ValidationError(`delegation durable record ${index + 1} must use canonical JSON`);
      }
      return parsed;
    } catch (error) {
      if (error instanceof ValidationError) throw error;
      throw new ValidationError(`delegation durable record ${index + 1} is not valid JSON`);
    }
  });
}

function emptyState() {
  return {
    roots: new Map(),
    grants: new Map(),
    revocations: new Map()
  };
}

function grantsForRoot(state, rootAuthorityDigest, extraGrant = null) {
  const grants = [];
  for (const entry of state.grants.values()) {
    if (entry.root_authority_digest === rootAuthorityDigest) grants.push(entry.grant);
  }
  if (extraGrant !== null) grants.push(extraGrant);
  return grants;
}

function revocationsForRoot(state, rootAuthorityDigest) {
  const revocations = [];
  for (const entry of state.revocations.values()) {
    if (entry.root_authority_digest === rootAuthorityDigest) revocations.push(entry.revocation);
  }
  return revocations;
}

function requireRoot(state, rootAuthorityDigest) {
  const normalized = digest(rootAuthorityDigest, 'delegation durable root authority digest');
  const root = state.roots.get(normalized);
  if (!root) throw new ValidationError('delegation durable root authority is not trusted');
  return root;
}

function applyRecord(state, record) {
  const rootDigest = record.root_authority_digest;
  if (record.operation === 'trust-root') {
    if (state.roots.has(rootDigest)) {
      throw new ValidationError('delegation durable root authority is already trusted');
    }
    if (new Date(record.committed_at) >= new Date(record.payload.expires_at)) {
      throw new ValidationError('delegation durable root authority cannot be trusted after expiry');
    }
    state.roots.set(rootDigest, Object.freeze({
      authority: record.payload,
      trusted_at: record.committed_at
    }));
    return;
  }

  const root = requireRoot(state, rootDigest);
  if (record.operation === 'append-grant') {
    const grant = record.payload;
    if (state.grants.has(grant.id)) {
      throw new ValidationError(`Duplicate delegation grant id: ${grant.id}`);
    }
    if (new Date(grant.issued_at) < new Date(root.trusted_at)) {
      throw new ValidationError('Delegation grant cannot predate trusted root registration');
    }
    if (new Date(record.committed_at) < new Date(grant.issued_at)) {
      throw new ValidationError('delegation durable grant commit cannot predate grant issuance');
    }
    const grants = grantsForRoot(state, rootDigest, grant);
    resolveDelegationChain({
      root_authority: root.authority,
      grants,
      revocations: revocationsForRoot(state, rootDigest),
      target_grant_id: grant.id,
      now: new Date(grant.issued_at)
    });
    state.grants.set(grant.id, Object.freeze({
      root_authority_digest: rootDigest,
      grant
    }));
    return;
  }

  if (record.operation === 'append-revocation') {
    const revocation = record.payload;
    if (state.revocations.has(revocation.id)) {
      throw new ValidationError(`Duplicate delegation revocation id: ${revocation.id}`);
    }
    const target = state.grants.get(revocation.grant_id);
    if (!target || target.root_authority_digest !== rootDigest) {
      throw new ValidationError('Delegation revocation references an unknown grant for the trusted root');
    }
    if (target.grant.delegator !== revocation.revoked_by) {
      throw new ValidationError('Delegation revocation must be issued by the grant delegator');
    }
    if (new Date(revocation.revoked_at) < new Date(target.grant.issued_at)) {
      throw new ValidationError('Delegation revocation cannot predate the grant');
    }
    if (new Date(record.committed_at) < new Date(revocation.revoked_at)) {
      throw new ValidationError('delegation durable revocation commit cannot predate revocation');
    }
    state.revocations.set(revocation.id, Object.freeze({
      root_authority_digest: rootDigest,
      revocation
    }));
    return;
  }

  throw new ValidationError('delegation durable operation is unsupported');
}

function replayRecords(rawRecords) {
  const state = emptyState();
  const records = [];
  let previousDigest = null;
  let previousCommittedAt = null;
  for (let index = 0; index < rawRecords.length; index += 1) {
    const record = normalizeDurableRecord(rawRecords[index]);
    if (record.sequence !== index + 1) {
      throw new ValidationError('delegation durable record sequence is not contiguous');
    }
    if (record.previous_record_digest !== previousDigest) {
      throw new ValidationError('delegation durable record predecessor chain is invalid');
    }
    if (previousCommittedAt !== null && record.committed_at < previousCommittedAt) {
      throw new ValidationError('delegation durable commit time cannot move backward');
    }
    applyRecord(state, record);
    records.push(record);
    previousDigest = record.record_digest;
    previousCommittedAt = record.committed_at;
  }
  return Object.freeze({ records, state });
}

function projectionTime(value) {
  return canonicalTimestamp(value ?? new Date().toISOString(), 'delegation evidence evaluatedAt');
}

export class DelegationDurableStore {
  #statePath;
  #maxStateBytes;
  #maxRecordBytes;
  #records;
  #state;
  #tail;

  constructor({ statePath, maxStateBytes, maxRecordBytes, records, state }) {
    this.#statePath = statePath;
    this.#maxStateBytes = maxStateBytes;
    this.#maxRecordBytes = maxRecordBytes;
    this.#records = records;
    this.#state = state;
    this.#tail = Promise.resolve();
  }

  async trustRoot(rawAuthority, { committedAt } = {}) {
    const authority = normalizeDelegationAuthority(rawAuthority);
    const record = await this.#enqueue('trust-root', authority.authority_digest, authority, committedAt);
    return Object.freeze({ authority: structuredClone(authority), record: structuredClone(record) });
  }

  async appendGrant(rootAuthorityDigest, rawGrant, { committedAt } = {}) {
    const rootDigest = digest(rootAuthorityDigest, 'delegation durable root authority digest');
    const grant = normalizeDelegationGrant(rawGrant);
    const record = await this.#enqueue('append-grant', rootDigest, grant, committedAt);
    return Object.freeze({ grant: structuredClone(grant), record: structuredClone(record) });
  }

  async appendRevocation(rootAuthorityDigest, rawRevocation, { committedAt } = {}) {
    const rootDigest = digest(rootAuthorityDigest, 'delegation durable root authority digest');
    const revocation = normalizeDelegationRevocation(rawRevocation);
    const record = await this.#enqueue('append-revocation', rootDigest, revocation, committedAt);
    return Object.freeze({ revocation: structuredClone(revocation), record: structuredClone(record) });
  }

  async #enqueue(operation, rootAuthorityDigest, payload, committedAt) {
    const committed = canonicalTimestamp(committedAt ?? new Date().toISOString(), 'delegation durable committedAt');
    const run = async () => this.#commitSerialized(operation, rootAuthorityDigest, payload, committed);
    const promise = this.#tail.then(run, run);
    this.#tail = promise.then(() => undefined, () => undefined);
    return promise;
  }

  async #assertDiskMatchesMemory() {
    const rawRecords = await readRecordLines(this.#statePath, this.#maxStateBytes, this.#maxRecordBytes);
    if (rawRecords.length !== this.#records.length) {
      throw new ValidationError('delegation durable state changed outside the active store');
    }
    for (let index = 0; index < rawRecords.length; index += 1) {
      const verified = normalizeDurableRecord(rawRecords[index]);
      if (verified.record_digest !== this.#records[index].record_digest) {
        throw new ValidationError('delegation durable state changed outside the active store');
      }
    }
    return rawRecords;
  }

  async #commitSerialized(operation, rootAuthorityDigest, payload, committedAt) {
    await this.#assertDiskMatchesMemory();
    if (this.#records.length > 0 && committedAt < this.#records.at(-1).committed_at) {
      throw new ValidationError('delegation durable commit time cannot move backward');
    }
    const record = createRecord({
      sequence: this.#records.length + 1,
      previousRecordDigest: this.#records.length === 0 ? null : this.#records.at(-1).record_digest,
      operation,
      rootAuthorityDigest,
      payload,
      committedAt
    });
    const candidate = replayRecords([...this.#records, record]);
    const line = `${canonicalJson(record)}\n`;
    const lineBytes = Buffer.byteLength(line, 'utf8');
    if (lineBytes > this.#maxRecordBytes) {
      throw new ValidationError('delegation durable record exceeds configured byte limit');
    }
    const current = await assertRegularStateFile(this.#statePath);
    if (current.size + lineBytes > this.#maxStateBytes) {
      throw new ValidationError('delegation durable state capacity is exhausted');
    }
    const handle = await open(this.#statePath, 'a');
    try {
      await handle.writeFile(line, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
    this.#records = candidate.records;
    this.#state = candidate.state;
    return record;
  }

  resolve({ rootAuthorityDigest, targetGrantId, now = new Date() } = {}) {
    const rootDigest = digest(rootAuthorityDigest, 'delegation durable root authority digest');
    const root = requireRoot(this.#state, rootDigest);
    return resolveDelegationChain({
      root_authority: root.authority,
      grants: grantsForRoot(this.#state, rootDigest),
      revocations: revocationsForRoot(this.#state, rootDigest),
      target_grant_id: targetGrantId,
      now
    });
  }

  projectEvidence({ rootAuthorityDigest, evaluatedAt = new Date() } = {}) {
    const rootDigest = digest(rootAuthorityDigest, 'delegation durable root authority digest');
    const root = requireRoot(this.#state, rootDigest);
    const grants = grantsForRoot(this.#state, rootDigest).map(item => structuredClone(item));
    const revocations = revocationsForRoot(this.#state, rootDigest).map(item => structuredClone(item));
    const recordDigests = this.#records
      .filter(record => record.root_authority_digest === rootDigest)
      .map(record => record.record_digest);
    const body = Object.freeze({
      schema: DELEGATION_EVIDENCE_PROJECTION_SCHEMA,
      root_authority_digest: rootDigest,
      root_authority: structuredClone(root.authority),
      evaluated_at: projectionTime(evaluatedAt),
      grants,
      revocations,
      root_record_digests: recordDigests,
      durable_record_count: this.#records.length,
      durable_last_record_digest: this.#records.length === 0 ? null : this.#records.at(-1).record_digest,
      execution_authority_granted: false,
      authority_effect: 'none'
    });
    return Object.freeze({ ...body, projection_digest: digestObject(body) });
  }

  async verifyState() {
    const rawRecords = await this.#assertDiskMatchesMemory();
    const replayed = replayRecords(rawRecords);
    return Object.freeze({
      valid: true,
      records: replayed.records.length,
      roots: replayed.state.roots.size,
      grants: replayed.state.grants.size,
      revocations: replayed.state.revocations.size,
      execution_authority_granted: false,
      authority_effect: 'none'
    });
  }
}

export async function openDelegationDurableStore({
  statePath,
  maxStateBytes,
  maxRecordBytes
} = {}) {
  const normalizedStatePath = assertString(statePath, 'delegation durable statePath', { min: 1, max: 4096 });
  const normalizedMaxStateBytes = boundedInteger(
    maxStateBytes,
    'delegation durable maxStateBytes',
    DEFAULT_MAX_STATE_BYTES,
    HARD_MAX_STATE_BYTES
  );
  const normalizedMaxRecordBytes = boundedInteger(
    maxRecordBytes,
    'delegation durable maxRecordBytes',
    DEFAULT_MAX_RECORD_BYTES,
    HARD_MAX_RECORD_BYTES
  );
  if (normalizedMaxRecordBytes > normalizedMaxStateBytes) {
    throw new ValidationError('delegation durable maxRecordBytes cannot exceed maxStateBytes');
  }
  await ensureStateFile(normalizedStatePath);
  const rawRecords = await readRecordLines(
    normalizedStatePath,
    normalizedMaxStateBytes,
    normalizedMaxRecordBytes
  );
  const replayed = replayRecords(rawRecords);
  return new DelegationDurableStore({
    statePath: normalizedStatePath,
    maxStateBytes: normalizedMaxStateBytes,
    maxRecordBytes: normalizedMaxRecordBytes,
    records: replayed.records,
    state: replayed.state
  });
}
