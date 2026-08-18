import {
  createPrivateKey,
  createPublicKey,
  sign
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
  digestObject
} from './canonical.mjs';
import {
  PUBLIC_WITNESS_SOURCE_PROVISIONING_APPLICATION_RECORD_SCHEMA,
  verifyPublicWitnessSourceProvisioningApplicationRecord
} from './public-witness-source-provisioning-store.mjs';
import {
  assertPublicWitnessSourceProvisioningCommandEffectAllowed,
  verifyPublicWitnessSourceProvisioningCommandWithKeyLifecycle
} from './public-witness-source-provisioning-key-lifecycle.mjs';
import {
  verifyPublicWitnessSourceProvisioningApplicationRecordWithKeyLifecycle
} from './public-witness-source-provisioning-journal-lifecycle.mjs';
import {
  PUBLIC_WITNESS_SERVICE_KEY_ROLES,
  assertPublicWitnessServiceKeyUsableAt,
  publicWitnessServiceKeyId,
  resolvePublicWitnessServiceKeyCredential,
  resolvePublicWitnessServiceKeyRevocation,
  validatePublicWitnessServiceKeyCredentialPath
} from './public-witness-service-key-lifecycle.mjs';

export const PUBLIC_WITNESS_SOURCE_PROVISIONING_LIFECYCLE_APPLICATION_SNAPSHOT_SCHEMA =
  'axiom-public-witness-source-provisioning-lifecycle-application-snapshot.v1';

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const DEFAULT_MAX_STATE_BYTES = 32 * 1024 * 1024;
const HARD_MAX_STATE_BYTES = 256 * 1024 * 1024;
const DEFAULT_MAX_RECORD_BYTES = 2 * 1024 * 1024;
const HARD_MAX_RECORD_BYTES = 8 * 1024 * 1024;
const DEFAULT_MAX_COMMANDS = 10000;
const HARD_MAX_COMMANDS = 100000;

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

function signingKey(privateKeyValue) {
  const privateKey = parsePrivateKey(
    privateKeyValue,
    'public witness lifecycle provisioning application provisioner private key'
  );
  const publicKey = createPublicKey(privateKey);
  return Object.freeze({
    privateKey,
    publicKey,
    keyId: publicWitnessServiceKeyId(publicKey)
  });
}

function sameCanonical(left, right) {
  return canonicalJson(left) === canonicalJson(right);
}

function wireCommand(command) {
  const {
    operator_credential_digest: _credentialDigest,
    operator_key_epoch: _keyEpoch,
    operator_role_root_key_id: _rootKeyId,
    ...wire
  } = command;
  return Object.freeze(wire);
}

function receiverSnapshot(receiverStore, domainId) {
  if (
    !receiverStore
    || typeof receiverStore.snapshot !== 'function'
    || typeof receiverStore.getSourceAdmission !== 'function'
    || typeof receiverStore.admitSource !== 'function'
  ) {
    throw new ValidationError('public witness lifecycle provisioning application requires a W2c2 receiver');
  }
  const snapshot = receiverStore.snapshot();
  if (snapshot.domain_id !== domainId) {
    throw new ValidationError('public witness lifecycle provisioning application receiver belongs to a different domain');
  }
  if (!Number.isSafeInteger(snapshot.durable_record_count) || snapshot.durable_record_count < 0) {
    throw new ValidationError('public witness lifecycle provisioning application receiver record count is invalid');
  }
  const head = snapshot.last_record_digest === null
    ? null
    : digest(snapshot.last_record_digest, 'public witness lifecycle provisioning application receiver head');
  if ((snapshot.durable_record_count === 0) !== (head === null)) {
    throw new ValidationError('public witness lifecycle provisioning application receiver head/count are inconsistent');
  }
  return Object.freeze({
    durable_record_count: snapshot.durable_record_count,
    last_record_digest: head
  });
}

async function ensureRegularStateFile(path) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  try {
    const info = await lstat(path);
    if (info.isSymbolicLink() || !info.isFile()) {
      throw new ValidationError('public witness lifecycle provisioning application state must be a regular non-symlink file');
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
    throw new ValidationError('public witness lifecycle provisioning application state exceeds configured capacity');
  }
  if (info.size === 0) return [];
  const text = await readFile(path, 'utf8');
  if (!text.endsWith('\n')) {
    throw new ValidationError('public witness lifecycle provisioning application state is truncated');
  }
  const lines = text.slice(0, -1).split('\n');
  const records = [];
  for (const line of lines) {
    if (Buffer.byteLength(line, 'utf8') > maxRecordBytes) {
      throw new ValidationError('public witness lifecycle provisioning application record exceeds configured byte limit');
    }
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch {
      throw new ValidationError('public witness lifecycle provisioning application state contains invalid JSON');
    }
    if (canonicalJson(parsed) !== line) {
      throw new ValidationError('public witness lifecycle provisioning application state contains a noncanonical record');
    }
    records.push(parsed);
  }
  return records;
}

function sourceEpochKey(command) {
  return `${command.statement.source_id}\u0000${command.statement.source_epoch}`;
}

function lifecycleContext({
  credentialPath,
  revocations,
  trustedRoleRootPublicKey,
  role,
  principalId,
  domainId,
  operationalKeyId
}) {
  validatePublicWitnessServiceKeyCredentialPath(credentialPath, {
    trustedRoleRootPublicKey,
    expectedDomainId: domainId,
    expectedRole: role,
    expectedPrincipalId: principalId
  });
  const credential = resolvePublicWitnessServiceKeyCredential(credentialPath, {
    trustedRoleRootPublicKey,
    operationalKeyId,
    expectedDomainId: domainId,
    expectedRole: role,
    expectedPrincipalId: principalId
  });
  const index = credentialPath.findIndex(item => item.credential_digest === credential.credential_digest);
  if (index < 0) {
    throw new ValidationError('public witness lifecycle provisioning credential path is inconsistent');
  }
  const successorCredential = index + 1 < credentialPath.length ? credentialPath[index + 1] : null;
  const revocation = resolvePublicWitnessServiceKeyRevocation(revocations, credential, {
    trustedRoleRootPublicKey
  });
  return Object.freeze({ credential, successorCredential, revocation });
}

function validateLifecycleTrust({
  operatorCredentialPath,
  trustedOperatorRoleRootPublicKey,
  operatorId,
  provisionerCredentialPath,
  trustedProvisionerRoleRootPublicKey,
  provisionerId,
  domainId
}) {
  const operatorPath = validatePublicWitnessServiceKeyCredentialPath(operatorCredentialPath, {
    trustedRoleRootPublicKey: trustedOperatorRoleRootPublicKey,
    expectedDomainId: domainId,
    expectedRole: PUBLIC_WITNESS_SERVICE_KEY_ROLES.OPERATOR,
    expectedPrincipalId: operatorId
  });
  const provisionerPath = validatePublicWitnessServiceKeyCredentialPath(provisionerCredentialPath, {
    trustedRoleRootPublicKey: trustedProvisionerRoleRootPublicKey,
    expectedDomainId: domainId,
    expectedRole: PUBLIC_WITNESS_SERVICE_KEY_ROLES.PROVISIONER,
    expectedPrincipalId: provisionerId
  });
  if (publicWitnessServiceKeyId(trustedOperatorRoleRootPublicKey) === publicWitnessServiceKeyId(trustedProvisionerRoleRootPublicKey)) {
    throw new ValidationError('public witness lifecycle provisioning operator and provisioner role roots must remain distinct');
  }
  return Object.freeze({ operatorPath, provisionerPath });
}

function verifyCommand(raw, context, now) {
  return verifyPublicWitnessSourceProvisioningCommandWithKeyLifecycle(raw, {
    operatorCredentialPath: context.operatorCredentialPath,
    operatorRevocations: context.operatorRevocations,
    trustedOperatorRoleRootPublicKey: context.trustedOperatorRoleRootPublicKey,
    expectedDomainId: context.domainId,
    expectedOperatorId: context.operatorId,
    now
  });
}

function assertCommandEffectAllowed(raw, context, effectAt) {
  return assertPublicWitnessSourceProvisioningCommandEffectAllowed(raw, {
    operatorCredentialPath: context.operatorCredentialPath,
    operatorRevocations: context.operatorRevocations,
    trustedOperatorRoleRootPublicKey: context.trustedOperatorRoleRootPublicKey,
    expectedDomainId: context.domainId,
    expectedOperatorId: context.operatorId,
    effectAt
  });
}

function verifyRecord(raw, context) {
  return verifyPublicWitnessSourceProvisioningApplicationRecordWithKeyLifecycle(raw, {
    provisionerCredentialPath: context.provisionerCredentialPath,
    provisionerRevocations: context.provisionerRevocations,
    trustedProvisionerRoleRootPublicKey: context.trustedProvisionerRoleRootPublicKey,
    expectedDomainId: context.domainId,
    expectedProvisionerId: context.provisionerId
  });
}

function rebuild(records, context, maxCommands) {
  const states = new Map();
  const commandById = new Map();
  const commandByAdmission = new Map();
  const commandBySourceEpoch = new Map();
  let previousRecordDigest = null;
  let previousTime = null;
  let commandCount = 0;
  let highestOperatorKeyEpochObserved = 0;
  let highestProvisionerKeyEpochObserved = 0;

  for (let index = 0; index < records.length; index += 1) {
    const verifiedRecord = verifyRecord(records[index], context);
    const record = records[index];
    if (
      record.statement.sequence !== index + 1
      || record.statement.previous_record_digest !== previousRecordDigest
    ) {
      throw new ValidationError('public witness lifecycle provisioning application record chain is discontinuous');
    }
    if (previousTime !== null && record.statement.recorded_at < previousTime) {
      throw new ValidationError('public witness lifecycle provisioning application record time cannot move backward');
    }
    highestProvisionerKeyEpochObserved = Math.max(
      highestProvisionerKeyEpochObserved,
      verifiedRecord.provisioner_key_epoch
    );

    if (record.statement.record_kind === 'authorization-retained') {
      commandCount += 1;
      if (commandCount > maxCommands) {
        throw new ValidationError('public witness lifecycle provisioning application command capacity is exhausted');
      }
      const verified = verifyCommand(record.payload.command, context, Date.parse(record.statement.recorded_at));
      const command = wireCommand(verified);
      if (states.has(command.command_digest)) {
        throw new ValidationError('public witness lifecycle provisioning application repeats an authorization');
      }
      const existingId = commandById.get(command.statement.command_id);
      if (existingId && existingId !== command.command_digest) {
        throw new ValidationError('public witness lifecycle provisioning application command_id is reused for different authorization');
      }
      const existingAdmission = commandByAdmission.get(command.source_admission.admission_digest);
      if (existingAdmission && existingAdmission !== command.command_digest) {
        throw new ValidationError('public witness lifecycle provisioning application admission is authorized by multiple commands');
      }
      const epochKey = sourceEpochKey(command);
      const existingEpoch = commandBySourceEpoch.get(epochKey);
      if (existingEpoch && existingEpoch !== command.command_digest) {
        throw new ValidationError('public witness lifecycle provisioning application source epoch is authorized by multiple commands');
      }
      states.set(command.command_digest, {
        rawCommand: record.payload.command,
        command,
        operatorKeyEpoch: verified.operator_key_epoch,
        authorizationRecord: record,
        readyRecords: [],
        linkRecord: null
      });
      highestOperatorKeyEpochObserved = Math.max(
        highestOperatorKeyEpochObserved,
        verified.operator_key_epoch
      );
      commandById.set(command.statement.command_id, command.command_digest);
      commandByAdmission.set(command.source_admission.admission_digest, command.command_digest);
      commandBySourceEpoch.set(epochKey, command.command_digest);
    } else if (record.statement.record_kind === 'effect-ready') {
      const state = states.get(record.payload.command_digest);
      if (!state) {
        throw new ValidationError('public witness lifecycle provisioning effect-ready record lacks prior authorization');
      }
      if (state.linkRecord) {
        throw new ValidationError('public witness lifecycle provisioning cannot add effect-ready after linkage');
      }
      if (record.payload.attempt !== state.readyRecords.length + 1) {
        throw new ValidationError('public witness lifecycle provisioning effect-ready attempt is not contiguous');
      }
      if (record.payload.intended_admitted_at !== record.statement.recorded_at) {
        throw new ValidationError('public witness lifecycle provisioning effect-ready time binding is invalid');
      }
      if (
        (record.payload.receiver_record_count_before === 0)
        !== (record.payload.receiver_head_before === null)
      ) {
        throw new ValidationError('public witness lifecycle provisioning effect-ready receiver head/count are inconsistent');
      }
      assertCommandEffectAllowed(state.rawCommand, context, record.statement.recorded_at);
      state.readyRecords.push(record);
    } else {
      const state = states.get(record.payload.command_digest);
      if (!state) {
        throw new ValidationError('public witness lifecycle provisioning linkage lacks prior authorization');
      }
      if (state.linkRecord) {
        throw new ValidationError('public witness lifecycle provisioning command is linked more than once');
      }
      const ready = state.readyRecords.at(-1);
      if (!ready || ready.record_digest !== record.payload.ready_record_digest) {
        throw new ValidationError('public witness lifecycle provisioning linkage does not bind latest effect-ready record');
      }
      if (record.payload.source_admission_digest !== state.command.source_admission.admission_digest) {
        throw new ValidationError('public witness lifecycle provisioning linkage binds wrong source admission');
      }
      if (record.payload.receiver_record_count_after <= ready.payload.receiver_record_count_before) {
        throw new ValidationError('public witness lifecycle provisioning linkage does not advance receiver durable state');
      }
      if (record.statement.recorded_at < ready.statement.recorded_at) {
        throw new ValidationError('public witness lifecycle provisioning linkage cannot predate effect-ready');
      }
      state.linkRecord = record;
    }

    previousRecordDigest = record.record_digest;
    previousTime = record.statement.recorded_at;
  }

  return Object.freeze({
    states,
    commandById,
    commandByAdmission,
    commandBySourceEpoch,
    highestOperatorKeyEpochObserved,
    highestProvisionerKeyEpochObserved
  });
}

function auditAgainstReceiver(rebuilt, receiverStore, domainId) {
  const currentSnapshot = receiverSnapshot(receiverStore, domainId);
  let reconciliationRequired = 0;
  for (const state of rebuilt.states.values()) {
    const retained = receiverStore.getSourceAdmission(state.command.source_admission.admission_digest);
    if (state.linkRecord) {
      if (!retained || !sameCanonical(retained, state.command.source_admission)) {
        throw new ValidationError('public witness lifecycle provisioning linked admission is not exactly retained by W2c2');
      }
      const afterCount = state.linkRecord.payload.receiver_record_count_after;
      if (currentSnapshot.durable_record_count < afterCount) {
        throw new ValidationError('public witness lifecycle provisioning receiver durable state rolled back below linked evidence');
      }
      if (
        currentSnapshot.durable_record_count === afterCount
        && currentSnapshot.last_record_digest !== state.linkRecord.payload.receiver_head_after
      ) {
        throw new ValidationError('public witness lifecycle provisioning receiver head diverges from linked evidence');
      }
      continue;
    }
    if (retained) {
      if (state.readyRecords.length === 0) {
        throw new ValidationError('public witness lifecycle provisioning source admission exists without prior durable effect-ready authorization');
      }
      const ready = state.readyRecords.at(-1);
      if (currentSnapshot.durable_record_count <= ready.payload.receiver_record_count_before) {
        throw new ValidationError('public witness lifecycle provisioning source admission cannot predate or equal its effect-ready receiver head');
      }
      reconciliationRequired += 1;
    }
  }
  return Object.freeze({ currentSnapshot, reconciliationRequired });
}

function createRecord(kind, payload, {
  domainId,
  provisionerId,
  provisionerPrivateKey,
  provisionerKeyId,
  sequence,
  previousRecordDigest,
  recordedAt
}) {
  const statement = Object.freeze({
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
  const record = Object.freeze({ ...body, record_digest: digestObject(body) });
  return verifyPublicWitnessSourceProvisioningApplicationRecord(record, {
    trustedProvisionerPublicKey: createPublicKey(provisionerPrivateKey),
    expectedDomainId: domainId,
    expectedProvisionerId: provisionerId
  });
}

export class PublicWitnessSourceProvisioningLifecycleApplicationStore {
  #statePath;
  #receiverStore;
  #context;
  #signing;
  #signingCredential;
  #signingSuccessor;
  #signingRevocation;
  #maxStateBytes;
  #maxRecordBytes;
  #maxCommands;
  #records;
  #states;
  #commandById;
  #commandByAdmission;
  #commandBySourceEpoch;
  #highestOperatorKeyEpochObserved;
  #highestProvisionerKeyEpochObserved;
  #tail;

  constructor({
    statePath,
    receiverStore,
    context,
    signing,
    signingCredential,
    signingSuccessor,
    signingRevocation,
    maxStateBytes,
    maxRecordBytes,
    maxCommands,
    records,
    rebuilt
  }) {
    this.#statePath = statePath;
    this.#receiverStore = receiverStore;
    this.#context = context;
    this.#signing = signing;
    this.#signingCredential = signingCredential;
    this.#signingSuccessor = signingSuccessor;
    this.#signingRevocation = signingRevocation;
    this.#maxStateBytes = maxStateBytes;
    this.#maxRecordBytes = maxRecordBytes;
    this.#maxCommands = maxCommands;
    this.#records = records;
    this.#states = rebuilt.states;
    this.#commandById = rebuilt.commandById;
    this.#commandByAdmission = rebuilt.commandByAdmission;
    this.#commandBySourceEpoch = rebuilt.commandBySourceEpoch;
    this.#highestOperatorKeyEpochObserved = rebuilt.highestOperatorKeyEpochObserved;
    this.#highestProvisionerKeyEpochObserved = rebuilt.highestProvisionerKeyEpochObserved;
    this.#tail = Promise.resolve();
  }

  async #serialized(fn) {
    const run = async () => fn();
    const result = this.#tail.then(run, run);
    this.#tail = result.then(() => undefined, () => undefined);
    return result;
  }

  #assertSignerUsable(recordedAt) {
    return assertPublicWitnessServiceKeyUsableAt(this.#signingCredential, {
      trustedRoleRootPublicKey: this.#context.trustedProvisionerRoleRootPublicKey,
      at: recordedAt,
      successorCredential: this.#signingSuccessor,
      revocation: this.#signingRevocation,
      expectedDomainId: this.#context.domainId,
      expectedRole: PUBLIC_WITNESS_SERVICE_KEY_ROLES.PROVISIONER,
      expectedPrincipalId: this.#context.provisionerId
    });
  }

  async #assertDiskMatchesMemory() {
    const raw = await readRecords(this.#statePath, this.#maxStateBytes, this.#maxRecordBytes);
    if (raw.length !== this.#records.length) {
      throw new ValidationError('public witness lifecycle provisioning application state changed outside active store');
    }
    for (let index = 0; index < raw.length; index += 1) {
      const verified = verifyRecord(raw[index], this.#context);
      if (verified.record_digest !== this.#records[index].record_digest) {
        throw new ValidationError('public witness lifecycle provisioning application state changed outside active store');
      }
    }
  }

  #rebuild(records) {
    return rebuild(records, this.#context, this.#maxCommands);
  }

  async #append(kind, payload, recordedAt) {
    const timestamp = canonicalTimestamp(recordedAt, 'public witness lifecycle provisioning application recordedAt');
    if (this.#records.length > 0 && timestamp < this.#records.at(-1).statement.recorded_at) {
      throw new ValidationError('public witness lifecycle provisioning application record time cannot move backward');
    }
    this.#assertSignerUsable(timestamp);
    await this.#assertDiskMatchesMemory();
    const record = createRecord(kind, payload, {
      domainId: this.#context.domainId,
      provisionerId: this.#context.provisionerId,
      provisionerPrivateKey: this.#signing.privateKey,
      provisionerKeyId: this.#signing.keyId,
      sequence: this.#records.length + 1,
      previousRecordDigest: this.#records.length === 0 ? null : this.#records.at(-1).record_digest,
      recordedAt: timestamp
    });
    verifyRecord(record, this.#context);
    const line = `${canonicalJson(record)}\n`;
    const lineBytes = Buffer.byteLength(line, 'utf8');
    if (lineBytes > this.#maxRecordBytes) {
      throw new ValidationError('public witness lifecycle provisioning application record exceeds configured byte limit');
    }
    const info = await stat(this.#statePath);
    if (info.size + lineBytes > this.#maxStateBytes) {
      throw new ValidationError('public witness lifecycle provisioning application state capacity is exhausted');
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
    this.#highestOperatorKeyEpochObserved = rebuilt.highestOperatorKeyEpochObserved;
    this.#highestProvisionerKeyEpochObserved = rebuilt.highestProvisionerKeyEpochObserved;
    return record;
  }

  async #reserveLinkCapacity(commandDigest, readyRecord, recordedAt) {
    const timestamp = canonicalTimestamp(
      recordedAt,
      'public witness lifecycle provisioning application linkage reservation time'
    );
    this.#assertSignerUsable(timestamp);
    const snapshot = receiverSnapshot(this.#receiverStore, this.#context.domainId);
    const preview = createRecord('admission-linked', Object.freeze({
      command_digest: commandDigest,
      ready_record_digest: readyRecord.record_digest,
      source_admission_digest: this.#states.get(commandDigest).command.source_admission.admission_digest,
      receiver_record_count_after: Math.max(1, snapshot.durable_record_count + 1),
      receiver_head_after: '0'.repeat(64),
      link_mode: 'restart-reconciliation'
    }), {
      domainId: this.#context.domainId,
      provisionerId: this.#context.provisionerId,
      provisionerPrivateKey: this.#signing.privateKey,
      provisionerKeyId: this.#signing.keyId,
      sequence: this.#records.length + 1,
      previousRecordDigest: this.#records.at(-1).record_digest,
      recordedAt: timestamp
    });
    const bytes = Buffer.byteLength(`${canonicalJson(preview)}\n`, 'utf8');
    if (bytes > this.#maxRecordBytes) {
      throw new ValidationError('public witness lifecycle provisioning application linkage exceeds configured byte limit');
    }
    const info = await stat(this.#statePath);
    if (info.size + bytes > this.#maxStateBytes) {
      throw new ValidationError('public witness lifecycle provisioning application lacks reserved capacity for linkage');
    }
  }

  #verifyCommand(commandRaw, now) {
    return verifyCommand(commandRaw, this.#context, now);
  }

  #preflightPredecessor(command) {
    if (command.statement.source_epoch === 1) return;
    const previous = this.#receiverStore.getSourceAdmission(command.statement.previous_admission_digest);
    if (!previous) {
      throw new ValidationError('public witness lifecycle provisioning previous admission is not retained by W2c2');
    }
    if (
      previous.source_id !== command.statement.source_id
      || previous.source_epoch !== command.statement.source_epoch - 1
      || previous.admission_digest !== command.statement.previous_admission_digest
    ) {
      throw new ValidationError('public witness lifecycle provisioning previous admission does not match prior source epoch');
    }
  }

  async #link(state, readyRecord, { linkedAt, linkMode }) {
    const retained = this.#receiverStore.getSourceAdmission(state.command.source_admission.admission_digest);
    if (!retained || !sameCanonical(retained, state.command.source_admission)) {
      throw new ValidationError('public witness lifecycle provisioning cannot link an admission not exactly retained by W2c2');
    }
    const after = receiverSnapshot(this.#receiverStore, this.#context.domainId);
    if (after.durable_record_count <= readyRecord.payload.receiver_record_count_before) {
      throw new ValidationError('public witness lifecycle provisioning receiver state did not advance after effect-ready');
    }
    return this.#append('admission-linked', Object.freeze({
      command_digest: state.command.command_digest,
      ready_record_digest: readyRecord.record_digest,
      source_admission_digest: state.command.source_admission.admission_digest,
      receiver_record_count_after: after.durable_record_count,
      receiver_head_after: after.last_record_digest,
      link_mode: linkMode
    }), linkedAt);
  }

  async apply(commandRaw, { appliedAt } = {}) {
    return this.#serialized(async () => {
      const timestamp = canonicalTimestamp(appliedAt, 'public witness lifecycle provisioning application appliedAt');
      const verified = this.#verifyCommand(commandRaw, Date.parse(timestamp));
      const command = wireCommand(verified);
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
        throw new ValidationError('public witness lifecycle provisioning refuses post-hoc authorization of an already retained admission');
      }

      if (!state) {
        assertCommandEffectAllowed(commandRaw, this.#context, timestamp);
        const idOwner = this.#commandById.get(command.statement.command_id);
        if (idOwner && idOwner !== command.command_digest) {
          throw new ValidationError('public witness lifecycle provisioning command_id is already bound to another command');
        }
        const admissionOwner = this.#commandByAdmission.get(command.source_admission.admission_digest);
        if (admissionOwner && admissionOwner !== command.command_digest) {
          throw new ValidationError('public witness lifecycle provisioning admission is already bound to another command');
        }
        const epochOwner = this.#commandBySourceEpoch.get(sourceEpochKey(command));
        if (epochOwner && epochOwner !== command.command_digest) {
          throw new ValidationError('public witness lifecycle provisioning source epoch is already bound to another command');
        }
        await this.#append('authorization-retained', Object.freeze({ command }), timestamp);
        state = this.#states.get(command.command_digest);
      }

      const exactBeforeReady = this.#receiverStore.getSourceAdmission(command.source_admission.admission_digest);
      if (exactBeforeReady) {
        const ready = state.readyRecords.at(-1);
        if (!ready) {
          throw new ValidationError('public witness lifecycle provisioning admission appeared before any durable effect-ready record');
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

      assertCommandEffectAllowed(commandRaw, this.#context, timestamp);
      const before = receiverSnapshot(this.#receiverStore, this.#context.domainId);
      const ready = await this.#append('effect-ready', Object.freeze({
        command_digest: command.command_digest,
        attempt: state.readyRecords.length + 1,
        intended_admitted_at: timestamp,
        receiver_record_count_before: before.durable_record_count,
        receiver_head_before: before.last_record_digest
      }), timestamp);
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
        'public witness lifecycle provisioning application reconciledAt'
      );
      const results = [];
      for (const state of this.#states.values()) {
        if (state.linkRecord || state.readyRecords.length === 0) continue;
        const retained = this.#receiverStore.getSourceAdmission(state.command.source_admission.admission_digest);
        if (!retained) continue;
        const ready = state.readyRecords.at(-1);
        if (timestamp < ready.statement.recorded_at) {
          throw new ValidationError('public witness lifecycle provisioning reconciliation cannot predate effect-ready');
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
    const normalized = digest(commandDigest, 'public witness lifecycle provisioning application commandDigest');
    const state = this.#states.get(normalized);
    if (!state) return null;
    const retained = this.#receiverStore.getSourceAdmission(state.command.source_admission.admission_digest);
    return Object.freeze({
      command_digest: normalized,
      command_id: state.command.statement.command_id,
      source_id: state.command.statement.source_id,
      source_epoch: state.command.statement.source_epoch,
      operator_key_epoch: state.operatorKeyEpoch,
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
      schema: PUBLIC_WITNESS_SOURCE_PROVISIONING_LIFECYCLE_APPLICATION_SNAPSHOT_SCHEMA,
      domain_id: this.#context.domainId,
      operator_id: this.#context.operatorId,
      provisioner_id: this.#context.provisionerId,
      current_provisioner_key_id: this.#signing.keyId,
      current_provisioner_key_epoch: this.#signingCredential.statement.key_epoch,
      durable_record_count: this.#records.length,
      command_count: this.#states.size,
      linked_command_count: linked,
      authorized_only_count: authorizedOnly,
      ready_pending_count: readyPending,
      reconciliation_required_count: reconciliationRequired,
      highest_operator_key_epoch_observed: this.#highestOperatorKeyEpochObserved,
      highest_provisioner_key_epoch_observed: this.#highestProvisionerKeyEpochObserved,
      last_record_digest: this.#records.length === 0 ? null : this.#records.at(-1).record_digest,
      historical_records_resigned: false,
      signer_cutover_requires_reopen: true,
      operator_authorization_required: true,
      remote_self_provisioning_allowed: false,
      receiver_mutation_scope: 'exact-authorized-source-admission',
      persona_root_trust_effect: 'none',
      social_authority_effect: 'none',
      capability_promotion_effect: 'none',
      finality_claimed: false,
      globally_current_key_state_claimed: false,
      wall_clock_signing_time_proved: false,
      hostile_host_resistance_claimed: false,
      authority_effect: 'w2c2-source-admission-only',
      network_effect: 'none'
    });
    return Object.freeze({ ...body, snapshot_digest: digestObject(body) });
  }

  async verifyState() {
    await this.#assertDiskMatchesMemory();
    const rebuilt = this.#rebuild(this.#records);
    auditAgainstReceiver(rebuilt, this.#receiverStore, this.#context.domainId);
    return Object.freeze({ valid: true, ...this.snapshot() });
  }
}

export async function openPublicWitnessSourceProvisioningLifecycleApplicationStore({
  statePath,
  receiverStore,
  domainId,
  operatorId,
  operatorCredentialPath,
  operatorRevocations = [],
  trustedOperatorRoleRootPublicKey,
  provisionerId,
  provisionerPrivateKey,
  provisionerCredentialPath,
  provisionerRevocations = [],
  trustedProvisionerRoleRootPublicKey,
  maxStateBytes,
  maxRecordBytes,
  maxCommands
} = {}) {
  const normalizedPath = assertString(
    statePath,
    'public witness lifecycle provisioning application statePath',
    { min: 1, max: 4096 }
  );
  const normalizedDomain = identifier(domainId, 'public witness lifecycle provisioning application domainId');
  const normalizedOperator = identifier(operatorId, 'public witness lifecycle provisioning application operatorId');
  const normalizedProvisioner = identifier(
    provisionerId,
    'public witness lifecycle provisioning application provisionerId'
  );
  if (!Array.isArray(operatorRevocations) || !Array.isArray(provisionerRevocations)) {
    throw new ValidationError('public witness lifecycle provisioning revocations must be arrays');
  }
  const trust = validateLifecycleTrust({
    operatorCredentialPath,
    trustedOperatorRoleRootPublicKey,
    operatorId: normalizedOperator,
    provisionerCredentialPath,
    trustedProvisionerRoleRootPublicKey,
    provisionerId: normalizedProvisioner,
    domainId: normalizedDomain
  });
  const signing = signingKey(provisionerPrivateKey);
  const signingContext = lifecycleContext({
    credentialPath: provisionerCredentialPath,
    revocations: provisionerRevocations,
    trustedRoleRootPublicKey: trustedProvisionerRoleRootPublicKey,
    role: PUBLIC_WITNESS_SERVICE_KEY_ROLES.PROVISIONER,
    principalId: normalizedProvisioner,
    domainId: normalizedDomain,
    operationalKeyId: signing.keyId
  });
  const normalizedMaxState = boundedInteger(
    maxStateBytes,
    'public witness lifecycle provisioning application maxStateBytes',
    DEFAULT_MAX_STATE_BYTES,
    HARD_MAX_STATE_BYTES
  );
  const normalizedMaxRecord = boundedInteger(
    maxRecordBytes,
    'public witness lifecycle provisioning application maxRecordBytes',
    DEFAULT_MAX_RECORD_BYTES,
    HARD_MAX_RECORD_BYTES
  );
  if (normalizedMaxRecord > normalizedMaxState) {
    throw new ValidationError('public witness lifecycle provisioning application maxRecordBytes cannot exceed maxStateBytes');
  }
  const normalizedMaxCommands = boundedInteger(
    maxCommands,
    'public witness lifecycle provisioning application maxCommands',
    DEFAULT_MAX_COMMANDS,
    HARD_MAX_COMMANDS
  );
  const context = Object.freeze({
    domainId: normalizedDomain,
    operatorId: normalizedOperator,
    operatorCredentialPath: Object.freeze([...operatorCredentialPath]),
    operatorRevocations: Object.freeze([...operatorRevocations]),
    trustedOperatorRoleRootPublicKey,
    provisionerId: normalizedProvisioner,
    provisionerCredentialPath: Object.freeze([...provisionerCredentialPath]),
    provisionerRevocations: Object.freeze([...provisionerRevocations]),
    trustedProvisionerRoleRootPublicKey,
    operatorPath: trust.operatorPath,
    provisionerPath: trust.provisionerPath
  });

  receiverSnapshot(receiverStore, normalizedDomain);
  await ensureRegularStateFile(normalizedPath);
  const rawRecords = await readRecords(normalizedPath, normalizedMaxState, normalizedMaxRecord);
  for (const record of rawRecords) verifyRecord(record, context);
  const rebuilt = rebuild(rawRecords, context, normalizedMaxCommands);
  auditAgainstReceiver(rebuilt, receiverStore, normalizedDomain);

  return new PublicWitnessSourceProvisioningLifecycleApplicationStore({
    statePath: normalizedPath,
    receiverStore,
    context,
    signing,
    signingCredential: signingContext.credential,
    signingSuccessor: signingContext.successorCredential,
    signingRevocation: signingContext.revocation,
    maxStateBytes: normalizedMaxState,
    maxRecordBytes: normalizedMaxRecord,
    maxCommands: normalizedMaxCommands,
    records: rawRecords,
    rebuilt
  });
}
