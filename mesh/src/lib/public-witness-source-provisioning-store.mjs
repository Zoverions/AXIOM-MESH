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
  verifyPublicWitnessSourceProvisioningCommand
} from './public-witness-source-provisioning.mjs';

export const PUBLIC_WITNESS_SOURCE_PROVISIONING_APPLICATION_RECORD_SCHEMA =
  'axiom-public-witness-source-provisioning-application-record.v1';
export const PUBLIC_WITNESS_SOURCE_PROVISIONING_APPLICATION_SNAPSHOT_SCHEMA =
  'axiom-public-witness-source-provisioning-application-snapshot.v1';

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const BASE64URL = /^[A-Za-z0-9_-]+$/;
const RECORD_KINDS = new Set(['authorization-retained', 'effect-ready', 'admission-linked']);
const LINK_MODES = new Set(['direct', 'reconciled-existing', 'restart-reconciliation']);
const DEFAULT_MAX_STATE_BYTES = 32 * 1024 * 1024;
const HARD_MAX_STATE_BYTES = 256 * 1024 * 1024;
const DEFAULT_MAX_RECORD_BYTES = 2 * 1024 * 1024;
const HARD_MAX_RECORD_BYTES = 8 * 1024 * 1024;
const DEFAULT_MAX_COMMANDS = 10000;
const HARD_MAX_COMMANDS = 100000;

const RECORD_KEYS = new Set([
  'schema',
  'statement',
  'statement_digest',
  'payload',
  'provisioner_signature',
  'record_digest'
]);
const STATEMENT_KEYS = new Set([
  'domain_id',
  'provisioner_id',
  'provisioner_key_id',
  'sequence',
  'previous_record_digest',
  'record_kind',
  'payload_digest',
  'recorded_at',
  'operator_authorization_required',
  'remote_self_provisioning_allowed',
  'receiver_mutation_scope',
  'persona_root_trust_effect',
  'social_authority_effect',
  'capability_promotion_effect',
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

function nonnegativeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new ValidationError(`${label} must be a non-negative safe integer`);
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
  const privateKey = parsePrivateKey(
    privateKeyValue,
    'public witness source provisioning application provisioner private key'
  );
  const publicKey = createPublicKey(privateKey);
  return Object.freeze({
    privateKey,
    publicKey,
    keyId: publicKeyId(
      publicKey,
      'public witness source provisioning application provisioner public key'
    )
  });
}

function normalizeStatement(raw) {
  const value = exactKeys(raw, STATEMENT_KEYS, 'public witness source provisioning application statement');
  const sequence = positiveInteger(value.sequence, 'public witness source provisioning application sequence');
  const previous = nullableDigest(
    value.previous_record_digest,
    'public witness source provisioning application previous_record_digest'
  );
  if ((sequence === 1) !== (previous === null)) {
    throw new ValidationError('public witness source provisioning application first record requires null predecessor and later records require one');
  }
  const kind = assertString(value.record_kind, 'public witness source provisioning application record_kind', {
    min: 11,
    max: 32
  });
  if (!RECORD_KINDS.has(kind)) {
    throw new ValidationError('public witness source provisioning application record_kind is invalid');
  }
  if (
    value.operator_authorization_required !== true
    || value.remote_self_provisioning_allowed !== false
    || value.receiver_mutation_scope !== 'exact-authorized-source-admission'
    || value.persona_root_trust_effect !== 'none'
    || value.social_authority_effect !== 'none'
    || value.capability_promotion_effect !== 'none'
    || value.finality_claimed !== false
    || value.authority_effect !== 'w2c2-source-admission-only'
    || value.network_effect !== 'none'
  ) {
    throw new ValidationError('public witness source provisioning application statement widens authority or non-claims');
  }
  return Object.freeze({
    domain_id: identifier(value.domain_id, 'public witness source provisioning application domain_id'),
    provisioner_id: identifier(value.provisioner_id, 'public witness source provisioning application provisioner_id'),
    provisioner_key_id: digest(value.provisioner_key_id, 'public witness source provisioning application provisioner_key_id'),
    sequence,
    previous_record_digest: previous,
    record_kind: kind,
    payload_digest: digest(value.payload_digest, 'public witness source provisioning application payload_digest'),
    recorded_at: canonicalTimestamp(value.recorded_at, 'public witness source provisioning application recorded_at'),
    operator_authorization_required: true,
    remote_self_provisioning_allowed: false,
    receiver_mutation_scope: 'exact-authorized-source-admission',
    persona_root_trust_effect: 'none',
    social_authority_effect: 'none',
    capability_promotion_effect: 'none',
    finality_claimed: false,
    authority_effect: 'w2c2-source-admission-only',
    network_effect: 'none'
  });
}

function normalizeAuthorizationPayload(raw) {
  const value = exactKeys(
    raw,
    new Set(['command']),
    'public witness source provisioning authorization-retained payload'
  );
  return Object.freeze({
    command: assertPlainObject(value.command, 'public witness source provisioning retained command')
  });
}

function normalizeReadyPayload(raw) {
  const value = exactKeys(
    raw,
    new Set([
      'command_digest',
      'attempt',
      'intended_admitted_at',
      'receiver_record_count_before',
      'receiver_head_before'
    ]),
    'public witness source provisioning effect-ready payload'
  );
  return Object.freeze({
    command_digest: digest(value.command_digest, 'public witness source provisioning ready command_digest'),
    attempt: positiveInteger(value.attempt, 'public witness source provisioning ready attempt'),
    intended_admitted_at: canonicalTimestamp(
      value.intended_admitted_at,
      'public witness source provisioning ready intended_admitted_at'
    ),
    receiver_record_count_before: nonnegativeInteger(
      value.receiver_record_count_before,
      'public witness source provisioning ready receiver_record_count_before'
    ),
    receiver_head_before: nullableDigest(
      value.receiver_head_before,
      'public witness source provisioning ready receiver_head_before'
    )
  });
}

function normalizeLinkPayload(raw) {
  const value = exactKeys(
    raw,
    new Set([
      'command_digest',
      'ready_record_digest',
      'source_admission_digest',
      'receiver_record_count_after',
      'receiver_head_after',
      'link_mode'
    ]),
    'public witness source provisioning admission-linked payload'
  );
  const mode = assertString(value.link_mode, 'public witness source provisioning link_mode', {
    min: 6,
    max: 32
  });
  if (!LINK_MODES.has(mode)) throw new ValidationError('public witness source provisioning link_mode is invalid');
  return Object.freeze({
    command_digest: digest(value.command_digest, 'public witness source provisioning link command_digest'),
    ready_record_digest: digest(
      value.ready_record_digest,
      'public witness source provisioning link ready_record_digest'
    ),
    source_admission_digest: digest(
      value.source_admission_digest,
      'public witness source provisioning link source_admission_digest'
    ),
    receiver_record_count_after: positiveInteger(
      value.receiver_record_count_after,
      'public witness source provisioning link receiver_record_count_after'
    ),
    receiver_head_after: digest(
      value.receiver_head_after,
      'public witness source provisioning link receiver_head_after'
    ),
    link_mode: mode
  });
}

function normalizePayload(kind, raw) {
  if (kind === 'authorization-retained') return normalizeAuthorizationPayload(raw);
  if (kind === 'effect-ready') return normalizeReadyPayload(raw);
  if (kind === 'admission-linked') return normalizeLinkPayload(raw);
  throw new ValidationError('public witness source provisioning application payload kind is unsupported');
}

function recordDigestBody(record) {
  return Object.freeze({
    schema: record.schema,
    statement: record.statement,
    statement_digest: record.statement_digest,
    payload: record.payload,
    provisioner_signature: record.provisioner_signature
  });
}

export function verifyPublicWitnessSourceProvisioningApplicationRecord(raw, {
  trustedProvisionerPublicKey,
  expectedDomainId,
  expectedProvisionerId
} = {}) {
  const value = exactKeys(raw, RECORD_KEYS, 'public witness source provisioning application record');
  if (value.schema !== PUBLIC_WITNESS_SOURCE_PROVISIONING_APPLICATION_RECORD_SCHEMA) {
    throw new ValidationError('public witness source provisioning application record schema is unsupported');
  }
  const statement = normalizeStatement(value.statement);
  const payload = normalizePayload(statement.record_kind, value.payload);
  if (statement.payload_digest !== digestObject(payload)) {
    throw new ValidationError('public witness source provisioning application payload digest mismatch');
  }
  const statementDigest = digest(
    value.statement_digest,
    'public witness source provisioning application statement_digest'
  );
  if (statementDigest !== digestObject(statement)) {
    throw new ValidationError('public witness source provisioning application statement digest mismatch');
  }
  const publicKey = parsePublicKey(
    trustedProvisionerPublicKey,
    'public witness source provisioning application trusted provisioner public key'
  );
  if (
    statement.provisioner_key_id
    !== publicKeyId(publicKey, 'public witness source provisioning application trusted provisioner public key')
  ) {
    throw new ValidationError('public witness source provisioning application provisioner key substitution');
  }
  const signature = assertString(
    value.provisioner_signature,
    'public witness source provisioning application provisioner_signature',
    { min: 32, max: 256, pattern: BASE64URL }
  );
  if (!verify(null, Buffer.from(canonicalJson(statement)), publicKey, Buffer.from(signature, 'base64url'))) {
    throw new ValidationError('public witness source provisioning application provisioner signature is invalid');
  }
  const expectedRecordDigest = digestObject(recordDigestBody({
    schema: PUBLIC_WITNESS_SOURCE_PROVISIONING_APPLICATION_RECORD_SCHEMA,
    statement,
    statement_digest: statementDigest,
    payload,
    provisioner_signature: signature
  }));
  if (digest(value.record_digest, 'public witness source provisioning application record_digest') !== expectedRecordDigest) {
    throw new ValidationError('public witness source provisioning application record digest mismatch');
  }
  if (expectedDomainId !== undefined && statement.domain_id !== expectedDomainId) {
    throw new ValidationError('public witness source provisioning application record belongs to a different domain');
  }
  if (expectedProvisionerId !== undefined && statement.provisioner_id !== expectedProvisionerId) {
    throw new ValidationError('public witness source provisioning application record belongs to a different provisioner');
  }
  return Object.freeze({
    schema: PUBLIC_WITNESS_SOURCE_PROVISIONING_APPLICATION_RECORD_SCHEMA,
    statement,
    statement_digest: statementDigest,
    payload,
    provisioner_signature: signature,
    record_digest: expectedRecordDigest
  });
}

function createRecord(kind, payloadRaw, {
  domainId,
  provisionerId,
  provisionerPrivateKey,
  provisionerKeyId,
  sequence,
  previousRecordDigest,
  recordedAt
}) {
  const payload = normalizePayload(kind, payloadRaw);
  const statement = normalizeStatement({
    domain_id: domainId,
    provisioner_id: provisionerId,
    provisioner_key_id: provisionerKeyId,
    sequence,
    previous_record_digest: previousRecordDigest,
    record_kind: kind,
    payload_digest: digestObject(payload),
    recorded_at: recordedAt,
    operator_authorization_required: true,
    remote_self_provisioning_allowed: false,
    receiver_mutation_scope: 'exact-authorized-source-admission',
    persona_root_trust_effect: 'none',
    social_authority_effect: 'none',
    capability_promotion_effect: 'none',
    finality_claimed: false,
    authority_effect: 'w2c2-source-admission-only',
    network_effect: 'none'
  });
  const statementDigest = digestObject(statement);
  const signature = sign(
    null,
    Buffer.from(canonicalJson(statement)),
    provisionerPrivateKey
  ).toString('base64url');
  const body = Object.freeze({
    schema: PUBLIC_WITNESS_SOURCE_PROVISIONING_APPLICATION_RECORD_SCHEMA,
    statement,
    statement_digest: statementDigest,
    payload,
    provisioner_signature: signature
  });
  return Object.freeze({ ...body, record_digest: digestObject(body) });
}

async function ensureRegularStateFile(path) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  try {
    const info = await lstat(path);
    if (info.isSymbolicLink() || !info.isFile()) {
      throw new ValidationError('public witness source provisioning application state must be a regular non-symlink file');
    }
  } catch (error) {
    if (error instanceof ValidationError) throw error;
    if (error?.code !== 'ENOENT') throw error;
    const handle = await open(path, 'wx', 0o600);
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
  }
}

async function readRecords(path, maxStateBytes, maxRecordBytes) {
  const info = await stat(path);
  if (info.size > maxStateBytes) {
    throw new ValidationError('public witness source provisioning application state exceeds configured capacity');
  }
  if (info.size === 0) return [];
  const text = await readFile(path, 'utf8');
  if (!text.endsWith('\n')) {
    throw new ValidationError('public witness source provisioning application state is truncated');
  }
  const lines = text.slice(0, -1).split('\n');
  const records = [];
  for (const line of lines) {
    if (Buffer.byteLength(line, 'utf8') > maxRecordBytes) {
      throw new ValidationError('public witness source provisioning application record exceeds configured byte limit');
    }
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch {
      throw new ValidationError('public witness source provisioning application state contains invalid JSON');
    }
    if (canonicalJson(parsed) !== line) {
      throw new ValidationError('public witness source provisioning application state contains a noncanonical record');
    }
    records.push(parsed);
  }
  return records;
}

function sameCanonical(left, right) {
  return canonicalJson(left) === canonicalJson(right);
}

function receiverSnapshot(receiverStore, domainId) {
  if (
    !receiverStore
    || typeof receiverStore.snapshot !== 'function'
    || typeof receiverStore.getSourceAdmission !== 'function'
    || typeof receiverStore.admitSource !== 'function'
  ) {
    throw new ValidationError('public witness source provisioning application requires a W2c2 receiver');
  }
  const snapshot = receiverStore.snapshot();
  if (snapshot.domain_id !== domainId) {
    throw new ValidationError('public witness source provisioning application receiver belongs to a different domain');
  }
  if (!Number.isSafeInteger(snapshot.durable_record_count) || snapshot.durable_record_count < 0) {
    throw new ValidationError('public witness source provisioning application receiver record count is invalid');
  }
  const head = snapshot.last_record_digest === null
    ? null
    : digest(snapshot.last_record_digest, 'public witness source provisioning application receiver head');
  if ((snapshot.durable_record_count === 0) !== (head === null)) {
    throw new ValidationError('public witness source provisioning application receiver head/count are inconsistent');
  }
  return Object.freeze({
    durable_record_count: snapshot.durable_record_count,
    last_record_digest: head
  });
}

function sourceEpochKey(command) {
  return `${command.statement.source_id}\u0000${command.statement.source_epoch}`;
}

function rebuild(records, {
  provisionerPublicKey,
  domainId,
  provisionerId,
  operatorPublicKey,
  operatorId,
  maxCommands
}) {
  const states = new Map();
  const commandById = new Map();
  const commandByAdmission = new Map();
  const commandBySourceEpoch = new Map();
  let previousRecordDigest = null;
  let commandCount = 0;

  for (let index = 0; index < records.length; index += 1) {
    const record = verifyPublicWitnessSourceProvisioningApplicationRecord(records[index], {
      trustedProvisionerPublicKey: provisionerPublicKey,
      expectedDomainId: domainId,
      expectedProvisionerId: provisionerId
    });
    if (
      record.statement.sequence !== index + 1
      || record.statement.previous_record_digest !== previousRecordDigest
    ) {
      throw new ValidationError('public witness source provisioning application record chain is discontinuous');
    }
    if (index > 0 && record.statement.recorded_at < records[index - 1].statement.recorded_at) {
      throw new ValidationError('public witness source provisioning application record time cannot move backward');
    }

    if (record.statement.record_kind === 'authorization-retained') {
      commandCount += 1;
      if (commandCount > maxCommands) {
        throw new ValidationError('public witness source provisioning application command capacity is exhausted');
      }
      const command = verifyPublicWitnessSourceProvisioningCommand(record.payload.command, {
        trustedOperatorPublicKey: operatorPublicKey,
        expectedDomainId: domainId,
        expectedOperatorId: operatorId,
        now: Date.parse(record.statement.recorded_at)
      });
      if (states.has(command.command_digest)) {
        throw new ValidationError('public witness source provisioning application repeats an authorization');
      }
      const existingId = commandById.get(command.statement.command_id);
      if (existingId && existingId !== command.command_digest) {
        throw new ValidationError('public witness source provisioning application command_id is reused for different authorization');
      }
      const existingAdmission = commandByAdmission.get(command.source_admission.admission_digest);
      if (existingAdmission && existingAdmission !== command.command_digest) {
        throw new ValidationError('public witness source provisioning application admission is authorized by multiple commands');
      }
      const epochKey = sourceEpochKey(command);
      const existingEpoch = commandBySourceEpoch.get(epochKey);
      if (existingEpoch && existingEpoch !== command.command_digest) {
        throw new ValidationError('public witness source provisioning application source epoch is authorized by multiple commands');
      }
      states.set(command.command_digest, {
        command,
        authorizationRecord: record,
        readyRecords: [],
        linkRecord: null
      });
      commandById.set(command.statement.command_id, command.command_digest);
      commandByAdmission.set(command.source_admission.admission_digest, command.command_digest);
      commandBySourceEpoch.set(epochKey, command.command_digest);
    } else if (record.statement.record_kind === 'effect-ready') {
      const state = states.get(record.payload.command_digest);
      if (!state) throw new ValidationError('public witness source provisioning effect-ready record lacks prior authorization');
      if (state.linkRecord) throw new ValidationError('public witness source provisioning cannot add effect-ready after linkage');
      const expectedAttempt = state.readyRecords.length + 1;
      if (record.payload.attempt !== expectedAttempt) {
        throw new ValidationError('public witness source provisioning effect-ready attempt is not contiguous');
      }
      if (
        record.statement.recorded_at < state.command.statement.authorized_at
        || record.statement.recorded_at >= state.command.statement.expires_at
        || record.payload.intended_admitted_at !== record.statement.recorded_at
      ) {
        throw new ValidationError('public witness source provisioning effect-ready record is outside authorization window');
      }
      if (
        (record.payload.receiver_record_count_before === 0)
        !== (record.payload.receiver_head_before === null)
      ) {
        throw new ValidationError('public witness source provisioning effect-ready receiver head/count are inconsistent');
      }
      state.readyRecords.push(record);
    } else {
      const state = states.get(record.payload.command_digest);
      if (!state) throw new ValidationError('public witness source provisioning linkage lacks prior authorization');
      if (state.linkRecord) throw new ValidationError('public witness source provisioning command is linked more than once');
      const ready = state.readyRecords.at(-1);
      if (!ready || ready.record_digest !== record.payload.ready_record_digest) {
        throw new ValidationError('public witness source provisioning linkage does not bind the latest effect-ready record');
      }
      if (record.payload.source_admission_digest !== state.command.source_admission.admission_digest) {
        throw new ValidationError('public witness source provisioning linkage binds the wrong admission');
      }
      if (record.payload.receiver_record_count_after <= ready.payload.receiver_record_count_before) {
        throw new ValidationError('public witness source provisioning linkage does not advance receiver durable state');
      }
      if (record.statement.recorded_at < ready.statement.recorded_at) {
        throw new ValidationError('public witness source provisioning linkage cannot predate effect-ready');
      }
      state.linkRecord = record;
    }
    previousRecordDigest = record.record_digest;
  }

  return Object.freeze({ states, commandById, commandByAdmission, commandBySourceEpoch });
}

function auditAgainstReceiver(rebuilt, receiverStore, domainId) {
  const currentSnapshot = receiverSnapshot(receiverStore, domainId);
  let reconciliationRequired = 0;
  for (const state of rebuilt.states.values()) {
    const retained = receiverStore.getSourceAdmission(state.command.source_admission.admission_digest);
    if (state.linkRecord) {
      if (!retained || !sameCanonical(retained, state.command.source_admission)) {
        throw new ValidationError('public witness source provisioning linked admission is not exactly retained by W2c2');
      }
      const afterCount = state.linkRecord.payload.receiver_record_count_after;
      if (currentSnapshot.durable_record_count < afterCount) {
        throw new ValidationError('public witness source provisioning receiver durable state rolled back below linked evidence');
      }
      if (
        currentSnapshot.durable_record_count === afterCount
        && currentSnapshot.last_record_digest !== state.linkRecord.payload.receiver_head_after
      ) {
        throw new ValidationError('public witness source provisioning receiver head diverges from linked evidence');
      }
      continue;
    }
    if (retained) {
      if (state.readyRecords.length === 0) {
        throw new ValidationError('public witness source admission exists without prior durable effect-ready authorization');
      }
      const ready = state.readyRecords.at(-1);
      if (currentSnapshot.durable_record_count <= ready.payload.receiver_record_count_before) {
        throw new ValidationError('public witness source admission cannot predate or equal its effect-ready receiver head');
      }
      reconciliationRequired += 1;
    }
  }
  return Object.freeze({ currentSnapshot, reconciliationRequired });
}

export class PublicWitnessSourceProvisioningApplicationStore {
  #statePath;
  #receiverStore;
  #domainId;
  #operatorId;
  #operatorPublicKey;
  #provisionerId;
  #provisionerPrivateKey;
  #provisionerPublicKey;
  #provisionerKeyId;
  #maxStateBytes;
  #maxRecordBytes;
  #maxCommands;
  #records;
  #states;
  #commandById;
  #commandByAdmission;
  #commandBySourceEpoch;
  #tail;

  constructor({
    statePath,
    receiverStore,
    domainId,
    operatorId,
    operatorPublicKey,
    provisionerId,
    signing,
    maxStateBytes,
    maxRecordBytes,
    maxCommands,
    records,
    rebuilt
  }) {
    this.#statePath = statePath;
    this.#receiverStore = receiverStore;
    this.#domainId = domainId;
    this.#operatorId = operatorId;
    this.#operatorPublicKey = operatorPublicKey;
    this.#provisionerId = provisionerId;
    this.#provisionerPrivateKey = signing.privateKey;
    this.#provisionerPublicKey = signing.publicKey;
    this.#provisionerKeyId = signing.keyId;
    this.#maxStateBytes = maxStateBytes;
    this.#maxRecordBytes = maxRecordBytes;
    this.#maxCommands = maxCommands;
    this.#records = records;
    this.#states = rebuilt.states;
    this.#commandById = rebuilt.commandById;
    this.#commandByAdmission = rebuilt.commandByAdmission;
    this.#commandBySourceEpoch = rebuilt.commandBySourceEpoch;
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
      throw new ValidationError('public witness source provisioning application state changed outside active store');
    }
    for (let index = 0; index < raw.length; index += 1) {
      const verified = verifyPublicWitnessSourceProvisioningApplicationRecord(raw[index], {
        trustedProvisionerPublicKey: this.#provisionerPublicKey,
        expectedDomainId: this.#domainId,
        expectedProvisionerId: this.#provisionerId
      });
      if (verified.record_digest !== this.#records[index].record_digest) {
        throw new ValidationError('public witness source provisioning application state changed outside active store');
      }
    }
  }

  #rebuild(records) {
    return rebuild(records, {
      provisionerPublicKey: this.#provisionerPublicKey,
      domainId: this.#domainId,
      provisionerId: this.#provisionerId,
      operatorPublicKey: this.#operatorPublicKey,
      operatorId: this.#operatorId,
      maxCommands: this.#maxCommands
    });
  }

  async #append(kind, payload, recordedAt) {
    const timestamp = canonicalTimestamp(recordedAt, 'public witness source provisioning application recordedAt');
    if (this.#records.length > 0 && timestamp < this.#records.at(-1).statement.recorded_at) {
      throw new ValidationError('public witness source provisioning application record time cannot move backward');
    }
    await this.#assertDiskMatchesMemory();
    const record = createRecord(kind, payload, {
      domainId: this.#domainId,
      provisionerId: this.#provisionerId,
      provisionerPrivateKey: this.#provisionerPrivateKey,
      provisionerKeyId: this.#provisionerKeyId,
      sequence: this.#records.length + 1,
      previousRecordDigest: this.#records.length === 0 ? null : this.#records.at(-1).record_digest,
      recordedAt: timestamp
    });
    const line = `${canonicalJson(record)}\n`;
    const lineBytes = Buffer.byteLength(line, 'utf8');
    if (lineBytes > this.#maxRecordBytes) {
      throw new ValidationError('public witness source provisioning application record exceeds configured byte limit');
    }
    const info = await stat(this.#statePath);
    if (info.size + lineBytes > this.#maxStateBytes) {
      throw new ValidationError('public witness source provisioning application state capacity is exhausted');
    }
    const trialRecords = [...this.#records, record];
    const rebuilt = this.#rebuild(trialRecords);
    const handle = await open(this.#statePath, 'a');
    try {
      await handle.writeFile(line, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
    this.#records = trialRecords;
    this.#states = rebuilt.states;
    this.#commandById = rebuilt.commandById;
    this.#commandByAdmission = rebuilt.commandByAdmission;
    this.#commandBySourceEpoch = rebuilt.commandBySourceEpoch;
    return record;
  }

  async #reserveLinkCapacity(commandDigest, readyRecord, recordedAt) {
    const snapshot = receiverSnapshot(this.#receiverStore, this.#domainId);
    const preview = createRecord('admission-linked', {
      command_digest: commandDigest,
      ready_record_digest: readyRecord.record_digest,
      source_admission_digest: this.#states.get(commandDigest).command.source_admission.admission_digest,
      receiver_record_count_after: Math.max(1, snapshot.durable_record_count + 1),
      receiver_head_after: '0'.repeat(64),
      link_mode: 'restart-reconciliation'
    }, {
      domainId: this.#domainId,
      provisionerId: this.#provisionerId,
      provisionerPrivateKey: this.#provisionerPrivateKey,
      provisionerKeyId: this.#provisionerKeyId,
      sequence: this.#records.length + 1,
      previousRecordDigest: this.#records.at(-1).record_digest,
      recordedAt
    });
    const bytes = Buffer.byteLength(`${canonicalJson(preview)}\n`, 'utf8');
    if (bytes > this.#maxRecordBytes) {
      throw new ValidationError('public witness source provisioning application linkage exceeds configured byte limit');
    }
    const info = await stat(this.#statePath);
    if (info.size + bytes > this.#maxStateBytes) {
      throw new ValidationError('public witness source provisioning application lacks reserved capacity for linkage');
    }
  }

  #verifyCommand(commandRaw, now) {
    return verifyPublicWitnessSourceProvisioningCommand(commandRaw, {
      trustedOperatorPublicKey: this.#operatorPublicKey,
      expectedDomainId: this.#domainId,
      expectedOperatorId: this.#operatorId,
      now
    });
  }

  #preflightPredecessor(command) {
    if (command.statement.source_epoch === 1) return;
    const previous = this.#receiverStore.getSourceAdmission(command.statement.previous_admission_digest);
    if (!previous) {
      throw new ValidationError('public witness source provisioning previous admission is not retained by W2c2');
    }
    if (
      previous.source_id !== command.statement.source_id
      || previous.source_epoch !== command.statement.source_epoch - 1
      || previous.admission_digest !== command.statement.previous_admission_digest
    ) {
      throw new ValidationError('public witness source provisioning previous admission does not match prior source epoch');
    }
  }

  async #link(state, readyRecord, {
    linkedAt,
    linkMode
  }) {
    const retained = this.#receiverStore.getSourceAdmission(state.command.source_admission.admission_digest);
    if (!retained || !sameCanonical(retained, state.command.source_admission)) {
      throw new ValidationError('public witness source provisioning cannot link an admission not exactly retained by W2c2');
    }
    const after = receiverSnapshot(this.#receiverStore, this.#domainId);
    if (after.durable_record_count <= readyRecord.payload.receiver_record_count_before) {
      throw new ValidationError('public witness source provisioning receiver state did not advance after effect-ready');
    }
    return this.#append('admission-linked', {
      command_digest: state.command.command_digest,
      ready_record_digest: readyRecord.record_digest,
      source_admission_digest: state.command.source_admission.admission_digest,
      receiver_record_count_after: after.durable_record_count,
      receiver_head_after: after.last_record_digest,
      link_mode: linkMode
    }, linkedAt);
  }

  async apply(commandRaw, { appliedAt } = {}) {
    return this.#serialized(async () => {
      const timestamp = canonicalTimestamp(appliedAt, 'public witness source provisioning application appliedAt');
      const command = this.#verifyCommand(commandRaw, Date.parse(timestamp));
      this.#preflightPredecessor(command);

      let state = this.#states.get(command.command_digest) ?? null;
      if (state?.linkRecord) {
        return Object.freeze({
          status: 'replay',
          command_digest: command.command_digest,
          admission_digest: command.source_admission.admission_digest,
          link_record: structuredClone(state.linkRecord)
        });
      }

      const retainedBefore = this.#receiverStore.getSourceAdmission(command.source_admission.admission_digest);
      if (retainedBefore && !state?.readyRecords.length) {
        throw new ValidationError('public witness source provisioning refuses post-hoc authorization of an already retained admission');
      }

      if (!state) {
        const idOwner = this.#commandById.get(command.statement.command_id);
        if (idOwner && idOwner !== command.command_digest) {
          throw new ValidationError('public witness source provisioning command_id is already bound to another command');
        }
        const admissionOwner = this.#commandByAdmission.get(command.source_admission.admission_digest);
        if (admissionOwner && admissionOwner !== command.command_digest) {
          throw new ValidationError('public witness source provisioning admission is already bound to another command');
        }
        const epochOwner = this.#commandBySourceEpoch.get(sourceEpochKey(command));
        if (epochOwner && epochOwner !== command.command_digest) {
          throw new ValidationError('public witness source provisioning source epoch is already bound to another command');
        }
        await this.#append('authorization-retained', { command }, timestamp);
        state = this.#states.get(command.command_digest);
      }

      const exactBeforeReady = this.#receiverStore.getSourceAdmission(command.source_admission.admission_digest);
      if (exactBeforeReady) {
        const ready = state.readyRecords.at(-1);
        if (!ready) {
          throw new ValidationError('public witness source provisioning admission appeared before any durable effect-ready record');
        }
        await this.#reserveLinkCapacity(command.command_digest, ready, timestamp);
        const link = await this.#link(state, ready, {
          linkedAt: timestamp,
          linkMode: 'reconciled-existing'
        });
        return Object.freeze({
          status: 'reconciled-existing',
          command_digest: command.command_digest,
          admission_digest: command.source_admission.admission_digest,
          link_record: structuredClone(link)
        });
      }

      const before = receiverSnapshot(this.#receiverStore, this.#domainId);
      const ready = await this.#append('effect-ready', {
        command_digest: command.command_digest,
        attempt: state.readyRecords.length + 1,
        intended_admitted_at: timestamp,
        receiver_record_count_before: before.durable_record_count,
        receiver_head_before: before.last_record_digest
      }, timestamp);
      state = this.#states.get(command.command_digest);
      await this.#reserveLinkCapacity(command.command_digest, ready, timestamp);

      const result = await this.#receiverStore.admitSource(command.source_admission, {
        admittedAt: timestamp
      });
      const mode = result.status === 'admitted' ? 'direct' : 'reconciled-existing';
      const link = await this.#link(state, ready, {
        linkedAt: timestamp,
        linkMode: mode
      });
      return Object.freeze({
        status: mode === 'direct' ? 'applied' : 'reconciled-existing',
        command_digest: command.command_digest,
        admission_digest: command.source_admission.admission_digest,
        receiver_status: result.status,
        receiver_record: result.durable_record ? structuredClone(result.durable_record) : null,
        link_record: structuredClone(link)
      });
    });
  }

  async reconcilePending({ reconciledAt } = {}) {
    return this.#serialized(async () => {
      const timestamp = canonicalTimestamp(
        reconciledAt,
        'public witness source provisioning application reconciledAt'
      );
      const results = [];
      for (const state of this.#states.values()) {
        if (state.linkRecord || state.readyRecords.length === 0) continue;
        const retained = this.#receiverStore.getSourceAdmission(state.command.source_admission.admission_digest);
        if (!retained) continue;
        const ready = state.readyRecords.at(-1);
        if (timestamp < ready.statement.recorded_at) {
          throw new ValidationError('public witness source provisioning reconciliation cannot predate effect-ready');
        }
        await this.#reserveLinkCapacity(state.command.command_digest, ready, timestamp);
        const link = await this.#link(state, ready, {
          linkedAt: timestamp,
          linkMode: 'restart-reconciliation'
        });
        results.push(Object.freeze({
          command_digest: state.command.command_digest,
          admission_digest: state.command.source_admission.admission_digest,
          link_record: structuredClone(link)
        }));
      }
      return Object.freeze(results);
    });
  }

  getCommandStatus(commandDigest) {
    const normalized = digest(commandDigest, 'public witness source provisioning application commandDigest');
    const state = this.#states.get(normalized);
    if (!state) return null;
    const retained = this.#receiverStore.getSourceAdmission(state.command.source_admission.admission_digest);
    return Object.freeze({
      command_digest: normalized,
      command_id: state.command.statement.command_id,
      source_id: state.command.statement.source_id,
      source_epoch: state.command.statement.source_epoch,
      admission_digest: state.command.source_admission.admission_digest,
      authorization_retained: true,
      ready_attempt_count: state.readyRecords.length,
      linked: state.linkRecord !== null,
      receiver_admission_retained: retained !== null,
      reconciliation_required: state.linkRecord === null && state.readyRecords.length > 0 && retained !== null
    });
  }

  snapshot() {
    let linked = 0;
    let authorizedOnly = 0;
    let readyPending = 0;
    let reconciliationRequired = 0;
    for (const state of this.#states.values()) {
      if (state.linkRecord) {
        linked += 1;
        continue;
      }
      if (state.readyRecords.length === 0) {
        authorizedOnly += 1;
        continue;
      }
      readyPending += 1;
      if (this.#receiverStore.getSourceAdmission(state.command.source_admission.admission_digest)) {
        reconciliationRequired += 1;
      }
    }
    const body = Object.freeze({
      schema: PUBLIC_WITNESS_SOURCE_PROVISIONING_APPLICATION_SNAPSHOT_SCHEMA,
      domain_id: this.#domainId,
      operator_id: this.#operatorId,
      provisioner_id: this.#provisionerId,
      provisioner_key_id: this.#provisionerKeyId,
      durable_record_count: this.#records.length,
      command_count: this.#states.size,
      linked_command_count: linked,
      authorized_only_count: authorizedOnly,
      ready_pending_count: readyPending,
      reconciliation_required_count: reconciliationRequired,
      last_record_digest: this.#records.length === 0 ? null : this.#records.at(-1).record_digest,
      operator_authorization_required: true,
      remote_self_provisioning_allowed: false,
      receiver_mutation_scope: 'exact-authorized-source-admission',
      persona_root_trust_effect: 'none',
      social_authority_effect: 'none',
      capability_promotion_effect: 'none',
      finality_claimed: false,
      authority_effect: 'w2c2-source-admission-only',
      network_effect: 'none'
    });
    return Object.freeze({ ...body, snapshot_digest: digestObject(body) });
  }

  async verifyState() {
    await this.#assertDiskMatchesMemory();
    const rebuilt = this.#rebuild(this.#records);
    auditAgainstReceiver(rebuilt, this.#receiverStore, this.#domainId);
    return Object.freeze({ valid: true, ...this.snapshot() });
  }
}

export async function openPublicWitnessSourceProvisioningApplicationStore({
  statePath,
  receiverStore,
  domainId,
  operatorId,
  trustedOperatorPublicKey,
  provisionerId,
  provisionerPrivateKey,
  maxStateBytes,
  maxRecordBytes,
  maxCommands
} = {}) {
  const normalizedPath = assertString(
    statePath,
    'public witness source provisioning application statePath',
    { min: 1, max: 4096 }
  );
  const normalizedDomain = identifier(domainId, 'public witness source provisioning application domainId');
  const normalizedOperator = identifier(operatorId, 'public witness source provisioning application operatorId');
  const normalizedProvisioner = identifier(
    provisionerId,
    'public witness source provisioning application provisionerId'
  );
  const operatorPublicKey = parsePublicKey(
    trustedOperatorPublicKey,
    'public witness source provisioning application trusted operator public key'
  );
  const signing = signingKey(provisionerPrivateKey);
  const normalizedMaxState = boundedInteger(
    maxStateBytes,
    'public witness source provisioning application maxStateBytes',
    DEFAULT_MAX_STATE_BYTES,
    HARD_MAX_STATE_BYTES
  );
  const normalizedMaxRecord = boundedInteger(
    maxRecordBytes,
    'public witness source provisioning application maxRecordBytes',
    DEFAULT_MAX_RECORD_BYTES,
    HARD_MAX_RECORD_BYTES
  );
  if (normalizedMaxRecord > normalizedMaxState) {
    throw new ValidationError('public witness source provisioning application maxRecordBytes cannot exceed maxStateBytes');
  }
  const normalizedMaxCommands = boundedInteger(
    maxCommands,
    'public witness source provisioning application maxCommands',
    DEFAULT_MAX_COMMANDS,
    HARD_MAX_COMMANDS
  );

  receiverSnapshot(receiverStore, normalizedDomain);
  await ensureRegularStateFile(normalizedPath);
  const rawRecords = await readRecords(normalizedPath, normalizedMaxState, normalizedMaxRecord);
  const verifiedRecords = rawRecords.map(record => verifyPublicWitnessSourceProvisioningApplicationRecord(record, {
    trustedProvisionerPublicKey: signing.publicKey,
    expectedDomainId: normalizedDomain,
    expectedProvisionerId: normalizedProvisioner
  }));
  const rebuilt = rebuild(verifiedRecords, {
    provisionerPublicKey: signing.publicKey,
    domainId: normalizedDomain,
    provisionerId: normalizedProvisioner,
    operatorPublicKey,
    operatorId: normalizedOperator,
    maxCommands: normalizedMaxCommands
  });
  auditAgainstReceiver(rebuilt, receiverStore, normalizedDomain);

  return new PublicWitnessSourceProvisioningApplicationStore({
    statePath: normalizedPath,
    receiverStore,
    domainId: normalizedDomain,
    operatorId: normalizedOperator,
    operatorPublicKey,
    provisionerId: normalizedProvisioner,
    signing,
    maxStateBytes: normalizedMaxState,
    maxRecordBytes: normalizedMaxRecord,
    maxCommands: normalizedMaxCommands,
    records: verifiedRecords,
    rebuilt
  });
}
