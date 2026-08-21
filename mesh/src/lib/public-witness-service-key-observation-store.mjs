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
  validatePublicWitnessServiceKeyCredentialPath,
  validatePublicWitnessServiceKeyCredentialTransition,
  verifyPublicWitnessServiceKeyCredential,
  verifyPublicWitnessServiceKeyRevocation
} from './public-witness-service-key-lifecycle.mjs';

export const PUBLIC_WITNESS_SERVICE_KEY_CONFLICT_SCHEMA =
  'axiom-public-witness-service-key-conflict.v1';
export const PUBLIC_WITNESS_SERVICE_KEY_OBSERVATION_SNAPSHOT_SCHEMA =
  'axiom-public-witness-service-key-observation-snapshot.v1';
export const PUBLIC_WITNESS_SERVICE_KEY_OBSERVATION_RECORD_SCHEMA =
  'axiom-public-witness-service-key-observation-record.v1';

const DIGEST = /^[a-f0-9]{64}$/;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$/;
const OPERATIONS = new Set(['observe-credential', 'observe-revocation']);
const DEFAULT_MAX_RECORDS = 8192;
const HARD_MAX_RECORDS = 100000;
const DEFAULT_MAX_STATE_BYTES = 64 * 1024 * 1024;
const HARD_MAX_STATE_BYTES = 512 * 1024 * 1024;
const DEFAULT_MAX_RECORD_BYTES = 2 * 1024 * 1024;
const HARD_MAX_RECORD_BYTES = 16 * 1024 * 1024;
const STORE_CONSTRUCTION_TOKEN = Symbol('public-witness-service-key-observation-store');

function identifier(value, label) {
  return assertString(value, label, { min: 1, max: 192, pattern: IDENTIFIER });
}

function digest(value, label) {
  return assertString(value, label, { min: 64, max: 64, pattern: DIGEST });
}

function canonicalTimestamp(value, label) {
  const text = assertString(value, label, { min: 24, max: 24 });
  const parsed = new Date(text);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== text) {
    throw new ValidationError(`${label} must be a canonical UTC ISO timestamp`);
  }
  return text;
}

function boundedInteger(value, label, fallback, maximum) {
  const normalized = value === undefined ? fallback : value;
  if (!Number.isSafeInteger(normalized) || normalized < 1 || normalized > maximum) {
    throw new ValidationError(`${label} must be a positive safe integer no greater than ${maximum}`);
  }
  return normalized;
}

function exactKeys(value, allowed, label) {
  const object = assertPlainObject(value, label);
  for (const key of Object.keys(object)) {
    if (!allowed.has(key)) throw new ValidationError(`${label} contains unsupported field ${key}`);
  }
  return object;
}

function recordDigestBody(record) {
  return {
    schema: record.schema,
    sequence: record.sequence,
    previous_record_digest: record.previous_record_digest,
    operation: record.operation,
    observed_at: record.observed_at,
    artifact: record.artifact
  };
}

function makeRecord({ sequence, previousRecordDigest, operation, observedAt, artifact }) {
  const body = {
    schema: PUBLIC_WITNESS_SERVICE_KEY_OBSERVATION_RECORD_SCHEMA,
    sequence,
    previous_record_digest: previousRecordDigest,
    operation,
    observed_at: canonicalTimestamp(observedAt, 'service-key observation observedAt'),
    artifact: structuredClone(artifact)
  };
  return Object.freeze({ ...body, record_digest: digestObject(body) });
}

function verifyRecord(raw, expectedSequence, previousRecordDigest) {
  const record = exactKeys(raw, new Set([
    'schema',
    'sequence',
    'previous_record_digest',
    'operation',
    'observed_at',
    'artifact',
    'record_digest'
  ]), 'public witness service-key observation record');
  if (record.schema !== PUBLIC_WITNESS_SERVICE_KEY_OBSERVATION_RECORD_SCHEMA) {
    throw new ValidationError('public witness service-key observation record schema is unsupported');
  }
  if (record.sequence !== expectedSequence) {
    throw new ValidationError('public witness service-key observation record sequence is not contiguous');
  }
  if (record.previous_record_digest !== previousRecordDigest) {
    throw new ValidationError('public witness service-key observation predecessor chain is invalid');
  }
  if (!OPERATIONS.has(record.operation)) {
    throw new ValidationError('public witness service-key observation operation is invalid');
  }
  canonicalTimestamp(record.observed_at, 'public witness service-key observation observed_at');
  assertPlainObject(record.artifact, 'public witness service-key observation artifact');
  const recordDigest = digest(record.record_digest, 'public witness service-key observation record_digest');
  if (recordDigest !== digestObject(recordDigestBody(record))) {
    throw new ValidationError('public witness service-key observation record digest mismatch');
  }
  return Object.freeze(structuredClone(record));
}

function forkPosition(credential) {
  if (credential.statement.key_epoch === 1) return null;
  return [
    credential.statement.domain_id,
    credential.statement.role,
    credential.statement.principal_id,
    credential.statement.predecessor_credential_digest,
    String(credential.statement.key_epoch)
  ].join('|');
}

function conflictFromGroup(group) {
  if (group.length < 2) return null;
  const credentials = [...group].sort((left, right) =>
    left.credential.credential_digest.localeCompare(right.credential.credential_digest));
  const first = credentials[0].credential;
  const statement = Object.freeze({
    domain_id: first.statement.domain_id,
    conflict_kind: 'credential-epoch',
    role: first.statement.role,
    principal_id: first.statement.principal_id,
    role_root_key_id: first.statement.role_root_key_id,
    predecessor_credential_digest: first.statement.predecessor_credential_digest,
    position_kind: 'credential-epoch',
    position: first.statement.key_epoch,
    artifact_digests: Object.freeze(credentials.map(item => item.credential.credential_digest)),
    detected_at: credentials
      .map(item => item.observedAt)
      .sort()
      .at(-1),
    conflict_observed: true,
    preferred_artifact_digest: null,
    truth_resolution_claimed: false,
    legal_identity_claimed: false,
    globally_current_key_state_claimed: false,
    finality_claimed: false,
    authority_effect: 'none',
    network_effect: 'none'
  });
  const body = Object.freeze({
    schema: PUBLIC_WITNESS_SERVICE_KEY_CONFLICT_SCHEMA,
    statement
  });
  return Object.freeze({ ...body, conflict_digest: digestObject(body) });
}

function buildState(records, options) {
  const credentials = new Map();
  const credentialObservedAt = new Map();
  const revocations = new Map();
  const revocationObservedAt = new Map();

  for (const record of records) {
    if (record.operation === 'observe-credential') {
      const credential = verifyPublicWitnessServiceKeyCredential(record.artifact, {
        trustedRoleRootPublicKey: options.trustedRoleRootPublicKey,
        expectedDomainId: options.expectedDomainId,
        expectedRole: options.expectedRole,
        expectedPrincipalId: options.expectedPrincipalId
      });
      if (credentials.has(credential.credential_digest)) {
        throw new ValidationError('public witness service-key durable state contains a duplicate credential observation');
      }
      if (credential.statement.key_epoch > 1) {
        const predecessor = credentials.get(credential.statement.predecessor_credential_digest);
        if (!predecessor) {
          throw new ValidationError('public witness service-key successor was observed before its predecessor');
        }
        validatePublicWitnessServiceKeyCredentialTransition(predecessor, credential, {
          trustedRoleRootPublicKey: options.trustedRoleRootPublicKey
        });
      }
      credentials.set(credential.credential_digest, credential);
      credentialObservedAt.set(credential.credential_digest, record.observed_at);
      continue;
    }

    const revocation = verifyPublicWitnessServiceKeyRevocation(record.artifact, {
      trustedRoleRootPublicKey: options.trustedRoleRootPublicKey
    });
    const credential = credentials.get(revocation.statement.credential_digest);
    if (!credential) {
      throw new ValidationError('public witness service-key revocation was observed before its credential');
    }
    verifyPublicWitnessServiceKeyRevocation(record.artifact, {
      trustedRoleRootPublicKey: options.trustedRoleRootPublicKey,
      credential
    });
    if (revocations.has(revocation.revocation_digest)) {
      throw new ValidationError('public witness service-key durable state contains a duplicate revocation observation');
    }
    revocations.set(revocation.revocation_digest, revocation);
    revocationObservedAt.set(revocation.revocation_digest, record.observed_at);
  }

  const forkGroups = new Map();
  for (const credential of credentials.values()) {
    const position = forkPosition(credential);
    if (position === null) continue;
    const group = forkGroups.get(position) ?? [];
    group.push({
      credential,
      observedAt: credentialObservedAt.get(credential.credential_digest)
    });
    forkGroups.set(position, group);
  }
  const conflicts = [...forkGroups.values()]
    .map(conflictFromGroup)
    .filter(Boolean)
    .sort((left, right) => left.conflict_digest.localeCompare(right.conflict_digest));

  return {
    credentials,
    credentialObservedAt,
    revocations,
    revocationObservedAt,
    conflicts
  };
}

async function ensureStateFile(statePath) {
  await mkdir(dirname(statePath), { recursive: true, mode: 0o700 });
  try {
    const info = await lstat(statePath);
    if (info.isSymbolicLink() || !info.isFile()) {
      throw new ValidationError('public witness service-key observation state must be a regular non-symlink file');
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    const handle = await open(statePath, 'wx', 0o600);
    await handle.close();
  }
}

async function readRecords(statePath, maxStateBytes, maxRecordBytes) {
  const info = await stat(statePath);
  if (info.size > maxStateBytes) {
    throw new ValidationError('public witness service-key observation state exceeds configured byte limit');
  }
  if (info.size === 0) return [];
  const bytes = await readFile(statePath);
  if (bytes.length > maxStateBytes) {
    throw new ValidationError('public witness service-key observation state exceeds configured byte limit');
  }
  const text = bytes.toString('utf8');
  if (!text.endsWith('\n')) {
    throw new ValidationError('public witness service-key observation state has an incomplete trailing record');
  }
  let previous = null;
  return text.slice(0, -1).split('\n').map((line, index) => {
    if (Buffer.byteLength(line, 'utf8') > maxRecordBytes) {
      throw new ValidationError(`public witness service-key observation record ${index + 1} exceeds configured byte limit`);
    }
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch {
      throw new ValidationError(`public witness service-key observation record ${index + 1} is not valid JSON`);
    }
    if (canonicalJson(parsed) !== line) {
      throw new ValidationError(`public witness service-key observation record ${index + 1} must use canonical JSON`);
    }
    const verified = verifyRecord(parsed, index + 1, previous);
    previous = verified.record_digest;
    return verified;
  });
}

function snapshotBody(state, options, recordCount, lastRecordDigest) {
  return Object.freeze({
    schema: PUBLIC_WITNESS_SERVICE_KEY_OBSERVATION_SNAPSHOT_SCHEMA,
    domain_id: options.expectedDomainId,
    role: options.expectedRole,
    principal_id: options.expectedPrincipalId,
    role_root_key_id: [...state.credentials.values()][0]?.statement.role_root_key_id ?? null,
    credential_digests: Object.freeze([...state.credentials.keys()].sort()),
    revocation_digests: Object.freeze([...state.revocations.keys()].sort()),
    conflicts: Object.freeze(state.conflicts.map(conflict => structuredClone(conflict))),
    unresolved_conflict_count: state.conflicts.length,
    durable_record_count: recordCount,
    durable_last_record_digest: lastRecordDigest,
    data_availability_claimed: false,
    globally_current_key_state_claimed: false,
    truth_resolution_claimed: false,
    finality_claimed: false,
    authority_effect: 'none',
    network_effect: 'none'
  });
}

function validateSnapshot(raw, {
  expectedDomainId,
  expectedRole,
  expectedPrincipalId
} = {}) {
  const snapshot = exactKeys(raw, new Set([
    'schema',
    'domain_id',
    'role',
    'principal_id',
    'role_root_key_id',
    'credential_digests',
    'revocation_digests',
    'conflicts',
    'unresolved_conflict_count',
    'durable_record_count',
    'durable_last_record_digest',
    'data_availability_claimed',
    'globally_current_key_state_claimed',
    'truth_resolution_claimed',
    'finality_claimed',
    'authority_effect',
    'network_effect',
    'snapshot_digest'
  ]), 'public witness service-key observation snapshot');
  if (snapshot.schema !== PUBLIC_WITNESS_SERVICE_KEY_OBSERVATION_SNAPSHOT_SCHEMA) {
    throw new ValidationError('public witness service-key observation snapshot schema is unsupported');
  }
  if (expectedDomainId !== undefined && snapshot.domain_id !== expectedDomainId) {
    throw new ValidationError('public witness service-key observation snapshot belongs to a different domain');
  }
  if (expectedRole !== undefined && snapshot.role !== expectedRole) {
    throw new ValidationError('public witness service-key observation snapshot belongs to a different role');
  }
  if (expectedPrincipalId !== undefined && snapshot.principal_id !== expectedPrincipalId) {
    throw new ValidationError('public witness service-key observation snapshot belongs to a different principal');
  }
  if (
    snapshot.data_availability_claimed !== false
    || snapshot.globally_current_key_state_claimed !== false
    || snapshot.truth_resolution_claimed !== false
    || snapshot.finality_claimed !== false
    || snapshot.authority_effect !== 'none'
    || snapshot.network_effect !== 'none'
  ) {
    throw new ValidationError('public witness service-key observation snapshot widens its evidence boundary');
  }
  const body = { ...snapshot };
  delete body.snapshot_digest;
  if (digest(snapshot.snapshot_digest, 'public witness service-key observation snapshot_digest') !== digestObject(body)) {
    throw new ValidationError('public witness service-key observation snapshot digest mismatch');
  }
  return Object.freeze(structuredClone(snapshot));
}

export function inspectPublicWitnessServiceKeyPathAgainstObservationSnapshot(credentials, snapshotRaw, {
  trustedRoleRootPublicKey,
  expectedDomainId,
  expectedRole,
  expectedPrincipalId
} = {}) {
  validatePublicWitnessServiceKeyCredentialPath(credentials, {
    trustedRoleRootPublicKey,
    expectedDomainId,
    expectedRole,
    expectedPrincipalId
  });
  const verified = credentials.map(credential => verifyPublicWitnessServiceKeyCredential(credential, {
    trustedRoleRootPublicKey,
    expectedDomainId,
    expectedRole,
    expectedPrincipalId
  }));
  const snapshot = validateSnapshot(snapshotRaw, {
    expectedDomainId,
    expectedRole,
    expectedPrincipalId
  });
  const observed = new Set(snapshot.credential_digests);
  const pathDigests = new Set(verified.map(credential => credential.credential_digest));
  const missing = [...pathDigests].filter(value => !observed.has(value));
  if (missing.length) {
    throw new ValidationError('public witness service-key observation snapshot does not cover the supplied credential path', {
      key_state_uncertain: true,
      missing_credential_digests: missing,
      globally_current_key_state_claimed: false
    });
  }
  const relevantConflicts = snapshot.conflicts.filter(conflict => {
    const statement = conflict?.statement;
    return statement
      && (pathDigests.has(statement.predecessor_credential_digest)
        || statement.artifact_digests?.some(value => pathDigests.has(value)));
  });
  if (relevantConflicts.length) {
    throw new ValidationError('public witness service-key successor equivocation is unresolved', {
      key_state_uncertain: true,
      conflict_observed: true,
      conflict_kind: 'credential-epoch',
      conflict_digests: relevantConflicts.map(conflict => conflict.conflict_digest).sort(),
      preferred_artifact_digest: null,
      globally_current_key_state_claimed: false
    });
  }
  return Object.freeze({
    valid: true,
    successor_equivocation_checked: true,
    successor_equivocation_observed: false,
    observed_credential_count: pathDigests.size,
    globally_current_key_state_claimed: false,
    finality_claimed: false,
    authority_effect: 'none',
    network_effect: 'none'
  });
}

export class PublicWitnessServiceKeyObservationStore {
  #statePath;
  #options;
  #records;
  #state;
  #tail = Promise.resolve();

  constructor(token, statePath, options, records, state) {
    if (token !== STORE_CONSTRUCTION_TOKEN) {
      throw new ValidationError('public witness service-key observation store must be opened through the verified factory');
    }
    this.#statePath = statePath;
    this.#options = options;
    this.#records = records;
    this.#state = state;
  }

  async observeCredential(raw, { observedAt = new Date().toISOString() } = {}) {
    const observed = canonicalTimestamp(observedAt, 'public witness service-key credential observedAt');
    const credential = verifyPublicWitnessServiceKeyCredential(raw, {
      trustedRoleRootPublicKey: this.#options.trustedRoleRootPublicKey,
      expectedDomainId: this.#options.expectedDomainId,
      expectedRole: this.#options.expectedRole,
      expectedPrincipalId: this.#options.expectedPrincipalId
    });
    if (this.#state.credentials.has(credential.credential_digest)) {
      return Object.freeze({
        status: 'replay',
        credential_digest: credential.credential_digest,
        conflicts: this.#state.conflicts.map(conflict => structuredClone(conflict)),
        durable_record: null
      });
    }
    if (credential.statement.key_epoch > 1) {
      const predecessor = this.#state.credentials.get(credential.statement.predecessor_credential_digest);
      if (!predecessor) {
        throw new ValidationError('public witness service-key successor requires its predecessor to be observed first');
      }
      validatePublicWitnessServiceKeyCredentialTransition(predecessor, credential, {
        trustedRoleRootPublicKey: this.#options.trustedRoleRootPublicKey
      });
    }
    return this.#append('observe-credential', raw, observed, credential.credential_digest);
  }

  async observeRevocation(raw, { observedAt = new Date().toISOString() } = {}) {
    const observed = canonicalTimestamp(observedAt, 'public witness service-key revocation observedAt');
    const revocation = verifyPublicWitnessServiceKeyRevocation(raw, {
      trustedRoleRootPublicKey: this.#options.trustedRoleRootPublicKey
    });
    if (this.#state.revocations.has(revocation.revocation_digest)) {
      return Object.freeze({
        status: 'replay',
        revocation_digest: revocation.revocation_digest,
        conflicts: this.#state.conflicts.map(conflict => structuredClone(conflict)),
        durable_record: null
      });
    }
    const credential = this.#state.credentials.get(revocation.statement.credential_digest);
    if (!credential) {
      throw new ValidationError('public witness service-key revocation requires its credential to be observed first');
    }
    verifyPublicWitnessServiceKeyRevocation(raw, {
      trustedRoleRootPublicKey: this.#options.trustedRoleRootPublicKey,
      credential
    });
    return this.#append('observe-revocation', raw, observed, revocation.revocation_digest);
  }

  async #append(operation, artifact, observedAt, artifactDigest) {
    const run = async () => {
      if (this.#records.length >= this.#options.maxRecords) {
        throw new ValidationError('public witness service-key observation record capacity is exhausted');
      }
      const disk = await readRecords(
        this.#statePath,
        this.#options.maxStateBytes,
        this.#options.maxRecordBytes
      );
      if (
        disk.length !== this.#records.length
        || disk.some((record, index) => record.record_digest !== this.#records[index].record_digest)
      ) {
        throw new ValidationError('public witness service-key observation state changed outside the active store');
      }
      const record = makeRecord({
        sequence: this.#records.length + 1,
        previousRecordDigest: this.#records.at(-1)?.record_digest ?? null,
        operation,
        observedAt,
        artifact
      });
      const line = `${canonicalJson(record)}\n`;
      const lineBytes = Buffer.byteLength(line, 'utf8');
      if (lineBytes > this.#options.maxRecordBytes) {
        throw new ValidationError('public witness service-key observation record exceeds configured byte limit');
      }
      const info = await stat(this.#statePath);
      if (info.size + lineBytes > this.#options.maxStateBytes) {
        throw new ValidationError('public witness service-key observation state capacity is exhausted');
      }
      const handle = await open(this.#statePath, 'a');
      try {
        await handle.writeFile(line, 'utf8');
        await handle.sync();
      } finally {
        await handle.close();
      }
      this.#records.push(record);
      this.#state = buildState(this.#records, this.#options);
      return Object.freeze({
        status: 'observed',
        artifact_digest: artifactDigest,
        conflicts: this.#state.conflicts.map(conflict => structuredClone(conflict)),
        durable_record: structuredClone(record)
      });
    };
    const promise = this.#tail.then(run, run);
    this.#tail = promise.then(() => undefined, () => undefined);
    return promise;
  }

  getCredential(credentialDigest) {
    const value = this.#state.credentials.get(credentialDigest);
    return value ? structuredClone(value) : null;
  }

  listConflicts() {
    return this.#state.conflicts.map(conflict => structuredClone(conflict));
  }

  snapshot() {
    const body = snapshotBody(
      this.#state,
      this.#options,
      this.#records.length,
      this.#records.at(-1)?.record_digest ?? null
    );
    return Object.freeze({ ...body, snapshot_digest: digestObject(body) });
  }

  async verifyState() {
    const records = await readRecords(
      this.#statePath,
      this.#options.maxStateBytes,
      this.#options.maxRecordBytes
    );
    if (
      records.length !== this.#records.length
      || records.some((record, index) => record.record_digest !== this.#records[index].record_digest)
    ) {
      throw new ValidationError('public witness service-key observation state changed outside the active store');
    }
    buildState(records, this.#options);
    return Object.freeze({
      valid: true,
      records: records.length,
      conflicts: this.#state.conflicts.length,
      globally_current_key_state_claimed: false,
      finality_claimed: false,
      authority_effect: 'none',
      network_effect: 'none'
    });
  }
}

export async function openPublicWitnessServiceKeyObservationStore({
  statePath,
  trustedRoleRootPublicKey,
  expectedDomainId,
  expectedRole,
  expectedPrincipalId,
  maxRecords,
  maxStateBytes,
  maxRecordBytes
} = {}) {
  const normalizedPath = assertString(statePath, 'public witness service-key observation statePath', {
    min: 1,
    max: 4096
  });
  const options = Object.freeze({
    trustedRoleRootPublicKey: assertString(
      trustedRoleRootPublicKey,
      'public witness service-key trusted role root public key',
      { min: 64, max: 16384 }
    ),
    expectedDomainId: identifier(expectedDomainId, 'public witness service-key expectedDomainId'),
    expectedRole: identifier(expectedRole, 'public witness service-key expectedRole'),
    expectedPrincipalId: identifier(expectedPrincipalId, 'public witness service-key expectedPrincipalId'),
    maxRecords: boundedInteger(maxRecords, 'public witness service-key maxRecords', DEFAULT_MAX_RECORDS, HARD_MAX_RECORDS),
    maxStateBytes: boundedInteger(
      maxStateBytes,
      'public witness service-key maxStateBytes',
      DEFAULT_MAX_STATE_BYTES,
      HARD_MAX_STATE_BYTES
    ),
    maxRecordBytes: boundedInteger(
      maxRecordBytes,
      'public witness service-key maxRecordBytes',
      DEFAULT_MAX_RECORD_BYTES,
      HARD_MAX_RECORD_BYTES
    )
  });
  if (options.maxRecordBytes > options.maxStateBytes) {
    throw new ValidationError('public witness service-key maxRecordBytes cannot exceed maxStateBytes');
  }
  await ensureStateFile(normalizedPath);
  const records = await readRecords(normalizedPath, options.maxStateBytes, options.maxRecordBytes);
  if (records.length > options.maxRecords) {
    throw new ValidationError('public witness service-key observation state exceeds configured record capacity');
  }
  const state = buildState(records, options);
  return new PublicWitnessServiceKeyObservationStore(
    STORE_CONSTRUCTION_TOKEN,
    normalizedPath,
    options,
    records,
    state
  );
}
