import {
  ValidationError,
  assertPlainObject,
  assertString
} from './canonical.mjs';
import {
  verifyPublicWitnessSourceProvisioningApplicationRecord
} from './public-witness-source-provisioning-store.mjs';
import {
  assertPublicWitnessSourceProvisioningCommandEffectAllowed,
  verifyPublicWitnessSourceProvisioningCommandWithKeyLifecycle
} from './public-witness-source-provisioning-key-lifecycle.mjs';
import {
  PUBLIC_WITNESS_SERVICE_KEY_ROLES,
  assertPublicWitnessServiceKeyUsableAt,
  publicWitnessServiceKeyId,
  resolvePublicWitnessServiceKeyCredential,
  resolvePublicWitnessServiceKeyRevocation,
  validatePublicWitnessServiceKeyCredentialPath
} from './public-witness-service-key-lifecycle.mjs';

const DIGEST = /^[a-f0-9]{64}$/;
const MAX_RECORDS = 100000;

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

function recordProvisionerKeyId(raw) {
  const value = assertPlainObject(raw, 'public witness provisioning lifecycle record');
  const statement = assertPlainObject(value.statement, 'public witness provisioning lifecycle record statement');
  return digest(statement.provisioner_key_id, 'public witness provisioning lifecycle provisioner_key_id');
}

function credentialContext({
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
  if (index < 0) throw new ValidationError('public witness provisioning lifecycle credential path is inconsistent');
  const successorCredential = index + 1 < credentialPath.length ? credentialPath[index + 1] : null;
  const revocation = resolvePublicWitnessServiceKeyRevocation(revocations, credential, {
    trustedRoleRootPublicKey
  });
  return Object.freeze({ credential, successorCredential, revocation });
}

export function verifyPublicWitnessSourceProvisioningApplicationRecordWithKeyLifecycle(raw, {
  provisionerCredentialPath,
  provisionerRevocations = [],
  trustedProvisionerRoleRootPublicKey,
  expectedDomainId,
  expectedProvisionerId
} = {}) {
  const keyId = recordProvisionerKeyId(raw);
  const context = credentialContext({
    credentialPath: provisionerCredentialPath,
    revocations: provisionerRevocations,
    trustedRoleRootPublicKey: trustedProvisionerRoleRootPublicKey,
    role: PUBLIC_WITNESS_SERVICE_KEY_ROLES.PROVISIONER,
    principalId: expectedProvisionerId,
    domainId: expectedDomainId,
    operationalKeyId: keyId
  });
  const statement = assertPlainObject(raw.statement, 'public witness provisioning lifecycle record statement');
  assertPublicWitnessServiceKeyUsableAt(context.credential, {
    trustedRoleRootPublicKey: trustedProvisionerRoleRootPublicKey,
    at: statement.recorded_at,
    successorCredential: context.successorCredential,
    revocation: context.revocation,
    expectedDomainId,
    expectedRole: PUBLIC_WITNESS_SERVICE_KEY_ROLES.PROVISIONER,
    expectedPrincipalId: expectedProvisionerId
  });
  const record = verifyPublicWitnessSourceProvisioningApplicationRecord(raw, {
    trustedProvisionerPublicKey: context.credential.statement.operational_public_key,
    expectedDomainId,
    expectedProvisionerId
  });
  return Object.freeze({
    ...record,
    provisioner_credential_digest: context.credential.credential_digest,
    provisioner_key_epoch: context.credential.statement.key_epoch,
    provisioner_role_root_key_id: context.credential.statement.role_root_key_id
  });
}

export function verifyPublicWitnessSourceProvisioningApplicationJournalWithKeyLifecycle(records, {
  operatorCredentialPath,
  operatorRevocations = [],
  trustedOperatorRoleRootPublicKey,
  expectedOperatorId,
  provisionerCredentialPath,
  provisionerRevocations = [],
  trustedProvisionerRoleRootPublicKey,
  expectedProvisionerId,
  expectedDomainId
} = {}) {
  if (!Array.isArray(records) || records.length > MAX_RECORDS) {
    throw new ValidationError(`public witness provisioning lifecycle journal requires an array of at most ${MAX_RECORDS} records`);
  }
  validatePublicWitnessServiceKeyCredentialPath(operatorCredentialPath, {
    trustedRoleRootPublicKey: trustedOperatorRoleRootPublicKey,
    expectedDomainId,
    expectedRole: PUBLIC_WITNESS_SERVICE_KEY_ROLES.OPERATOR,
    expectedPrincipalId: expectedOperatorId
  });
  validatePublicWitnessServiceKeyCredentialPath(provisionerCredentialPath, {
    trustedRoleRootPublicKey: trustedProvisionerRoleRootPublicKey,
    expectedDomainId,
    expectedRole: PUBLIC_WITNESS_SERVICE_KEY_ROLES.PROVISIONER,
    expectedPrincipalId: expectedProvisionerId
  });
  if (publicWitnessServiceKeyId(trustedOperatorRoleRootPublicKey) === publicWitnessServiceKeyId(trustedProvisionerRoleRootPublicKey)) {
    throw new ValidationError('public witness provisioning operator and provisioner role roots must remain distinct');
  }

  const states = new Map();
  let previousDigest = null;
  let previousTime = null;
  let operatorEpochMax = 0;
  let provisionerEpochMax = 0;

  for (let index = 0; index < records.length; index += 1) {
    const record = verifyPublicWitnessSourceProvisioningApplicationRecordWithKeyLifecycle(records[index], {
      provisionerCredentialPath,
      provisionerRevocations,
      trustedProvisionerRoleRootPublicKey,
      expectedDomainId,
      expectedProvisionerId
    });
    if (record.statement.sequence !== index + 1 || record.statement.previous_record_digest !== previousDigest) {
      throw new ValidationError('public witness provisioning lifecycle journal record chain is discontinuous');
    }
    if (previousTime !== null && record.statement.recorded_at < previousTime) {
      throw new ValidationError('public witness provisioning lifecycle journal time cannot move backward');
    }
    provisionerEpochMax = Math.max(provisionerEpochMax, record.provisioner_key_epoch);

    if (record.statement.record_kind === 'authorization-retained') {
      const command = verifyPublicWitnessSourceProvisioningCommandWithKeyLifecycle(record.payload.command, {
        operatorCredentialPath,
        operatorRevocations,
        trustedOperatorRoleRootPublicKey,
        expectedDomainId,
        expectedOperatorId,
        now: Date.parse(record.statement.recorded_at)
      });
      if (states.has(command.command_digest)) {
        throw new ValidationError('public witness provisioning lifecycle journal repeats authorization');
      }
      states.set(command.command_digest, {
        command,
        readyRecords: [],
        linkRecord: null
      });
      operatorEpochMax = Math.max(operatorEpochMax, command.operator_key_epoch);
    } else if (record.statement.record_kind === 'effect-ready') {
      const state = states.get(record.payload.command_digest);
      if (!state) throw new ValidationError('public witness provisioning lifecycle effect-ready lacks prior authorization');
      if (state.linkRecord) throw new ValidationError('public witness provisioning lifecycle cannot become ready after linkage');
      if (record.payload.attempt !== state.readyRecords.length + 1) {
        throw new ValidationError('public witness provisioning lifecycle effect-ready attempt is not contiguous');
      }
      if (record.payload.intended_admitted_at !== record.statement.recorded_at) {
        throw new ValidationError('public witness provisioning lifecycle effect-ready time binding is invalid');
      }
      assertPublicWitnessSourceProvisioningCommandEffectAllowed(state.command, {
        operatorCredentialPath,
        operatorRevocations,
        trustedOperatorRoleRootPublicKey,
        expectedDomainId,
        expectedOperatorId,
        effectAt: record.statement.recorded_at
      });
      state.readyRecords.push(record);
    } else {
      const state = states.get(record.payload.command_digest);
      if (!state) throw new ValidationError('public witness provisioning lifecycle linkage lacks prior authorization');
      if (state.linkRecord) throw new ValidationError('public witness provisioning lifecycle command is linked more than once');
      const ready = state.readyRecords.at(-1);
      if (!ready || ready.record_digest !== record.payload.ready_record_digest) {
        throw new ValidationError('public witness provisioning lifecycle linkage does not bind latest ready attempt');
      }
      if (record.payload.source_admission_digest !== state.command.source_admission.admission_digest) {
        throw new ValidationError('public witness provisioning lifecycle linkage binds wrong source admission');
      }
      if (record.payload.receiver_record_count_after <= ready.payload.receiver_record_count_before) {
        throw new ValidationError('public witness provisioning lifecycle linkage does not prove receiver advancement');
      }
      if (record.statement.recorded_at < ready.statement.recorded_at) {
        throw new ValidationError('public witness provisioning lifecycle linkage cannot predate ready attempt');
      }
      state.linkRecord = record;
    }

    previousDigest = record.record_digest;
    previousTime = record.statement.recorded_at;
  }

  let linked = 0;
  let readyPending = 0;
  let authorizedOnly = 0;
  for (const state of states.values()) {
    if (state.linkRecord) linked += 1;
    else if (state.readyRecords.length > 0) readyPending += 1;
    else authorizedOnly += 1;
  }
  return Object.freeze({
    valid: true,
    domain_id: expectedDomainId,
    operator_id: expectedOperatorId,
    provisioner_id: expectedProvisionerId,
    durable_record_count: records.length,
    command_count: states.size,
    linked_command_count: linked,
    ready_pending_count: readyPending,
    authorized_only_count: authorizedOnly,
    highest_operator_key_epoch_observed: operatorEpochMax,
    highest_provisioner_key_epoch_observed: provisionerEpochMax,
    last_record_digest: previousDigest,
    wall_clock_signing_time_proved: false,
    globally_current_key_state_claimed: false,
    hostile_host_resistance_claimed: false,
    network_effect: 'none'
  });
}

export function assertPublicWitnessProvisionerSigningKeyCurrent({
  provisionerPrivateKey,
  provisionerCredentialPath,
  provisionerRevocations = [],
  trustedProvisionerRoleRootPublicKey,
  expectedDomainId,
  expectedProvisionerId,
  at
} = {}) {
  const timestamp = canonicalTimestamp(at, 'public witness provisioning provisioner key check time');
  let publicKey;
  try {
    const { createPrivateKey, createPublicKey } = await import('node:crypto');
    publicKey = createPublicKey(createPrivateKey(provisionerPrivateKey));
  } catch {
    throw new ValidationError('public witness provisioning provisioner private key is invalid');
  }
  const keyId = publicWitnessServiceKeyId(publicKey);
  const context = credentialContext({
    credentialPath: provisionerCredentialPath,
    revocations: provisionerRevocations,
    trustedRoleRootPublicKey: trustedProvisionerRoleRootPublicKey,
    role: PUBLIC_WITNESS_SERVICE_KEY_ROLES.PROVISIONER,
    principalId: expectedProvisionerId,
    domainId: expectedDomainId,
    operationalKeyId: keyId
  });
  return assertPublicWitnessServiceKeyUsableAt(context.credential, {
    trustedRoleRootPublicKey: trustedProvisionerRoleRootPublicKey,
    at: timestamp,
    successorCredential: context.successorCredential,
    revocation: context.revocation,
    expectedDomainId,
    expectedRole: PUBLIC_WITNESS_SERVICE_KEY_ROLES.PROVISIONER,
    expectedPrincipalId: expectedProvisionerId
  });
}
