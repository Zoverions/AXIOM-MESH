import { createPrivateKey, createPublicKey } from 'node:crypto';

import {
  ValidationError,
  assertPlainObject,
  assertString
} from './canonical.mjs';
import {
  createPublicWitnessSourceProvisioningCommand,
  verifyPublicWitnessSourceProvisioningCommand
} from './public-witness-source-provisioning.mjs';
import {
  PUBLIC_WITNESS_SERVICE_KEY_ROLES,
  assertPublicWitnessServiceKeyUsableAt,
  publicWitnessServiceKeyId,
  resolvePublicWitnessServiceKeyCredential,
  resolvePublicWitnessServiceKeyRevocation,
  validatePublicWitnessServiceKeyCredentialPath
} from './public-witness-service-key-lifecycle.mjs';

const DIGEST = /^[a-f0-9]{64}$/;

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

function canonicalTimestamp(value, label) {
  const text = assertString(value, label, { min: 24, max: 24 });
  const parsed = new Date(text);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== text) {
    throw new ValidationError(`${label} must be a canonical UTC ISO timestamp`);
  }
  return text;
}

function commandOperatorKeyId(raw) {
  const value = assertPlainObject(raw, 'public witness source provisioning lifecycle command');
  const statement = assertPlainObject(value.statement, 'public witness source provisioning lifecycle command statement');
  return assertString(statement.operator_key_id, 'public witness source provisioning lifecycle operator_key_id', {
    min: 64,
    max: 64,
    pattern: DIGEST
  });
}

function lifecycleContext({
  operatorCredentialPath,
  operatorRevocations = [],
  trustedOperatorRoleRootPublicKey,
  expectedDomainId,
  expectedOperatorId,
  operatorKeyId
}) {
  validatePublicWitnessServiceKeyCredentialPath(operatorCredentialPath, {
    trustedRoleRootPublicKey: trustedOperatorRoleRootPublicKey,
    expectedDomainId,
    expectedRole: PUBLIC_WITNESS_SERVICE_KEY_ROLES.OPERATOR,
    expectedPrincipalId: expectedOperatorId
  });
  const credential = resolvePublicWitnessServiceKeyCredential(operatorCredentialPath, {
    trustedRoleRootPublicKey: trustedOperatorRoleRootPublicKey,
    operationalKeyId: operatorKeyId,
    expectedDomainId,
    expectedRole: PUBLIC_WITNESS_SERVICE_KEY_ROLES.OPERATOR,
    expectedPrincipalId: expectedOperatorId
  });
  const index = operatorCredentialPath.findIndex(item => item.credential_digest === credential.credential_digest);
  if (index < 0) throw new ValidationError('public witness source provisioning lifecycle credential path is inconsistent');
  const successorCredential = index + 1 < operatorCredentialPath.length
    ? operatorCredentialPath[index + 1]
    : null;
  const revocation = resolvePublicWitnessServiceKeyRevocation(
    operatorRevocations,
    credential,
    { trustedRoleRootPublicKey: trustedOperatorRoleRootPublicKey }
  );
  return Object.freeze({ credential, successorCredential, revocation });
}

export function createPublicWitnessSourceProvisioningCommandWithKeyLifecycle({
  sourceAdmission,
  operatorId,
  operatorPrivateKey,
  operatorCredentialPath,
  operatorRevocations = [],
  trustedOperatorRoleRootPublicKey,
  commandId,
  previousAdmissionDigest = null,
  authorizedAt,
  expiresAt = null,
  maxLifetimeSeconds
} = {}) {
  const privateKey = parsePrivateKey(
    operatorPrivateKey,
    'public witness source provisioning lifecycle operator private key'
  );
  const publicKey = createPublicKey(privateKey);
  const context = lifecycleContext({
    operatorCredentialPath,
    operatorRevocations,
    trustedOperatorRoleRootPublicKey,
    expectedDomainId: sourceAdmission?.domain_id,
    expectedOperatorId: operatorId,
    operatorKeyId: publicWitnessServiceKeyId(publicKey)
  });
  assertPublicWitnessServiceKeyUsableAt(context.credential, {
    trustedRoleRootPublicKey: trustedOperatorRoleRootPublicKey,
    at: authorizedAt,
    successorCredential: context.successorCredential,
    revocation: context.revocation,
    expectedDomainId: context.credential.statement.domain_id,
    expectedRole: PUBLIC_WITNESS_SERVICE_KEY_ROLES.OPERATOR,
    expectedPrincipalId: operatorId
  });
  return createPublicWitnessSourceProvisioningCommand({
    sourceAdmission,
    operatorId,
    operatorPrivateKey: privateKey,
    commandId,
    previousAdmissionDigest,
    authorizedAt,
    expiresAt,
    ...(maxLifetimeSeconds === undefined ? {} : { maxLifetimeSeconds })
  });
}

export function verifyPublicWitnessSourceProvisioningCommandWithKeyLifecycle(raw, {
  operatorCredentialPath,
  operatorRevocations = [],
  trustedOperatorRoleRootPublicKey,
  expectedDomainId,
  expectedOperatorId,
  now = Date.now()
} = {}) {
  const operatorKeyId = commandOperatorKeyId(raw);
  const context = lifecycleContext({
    operatorCredentialPath,
    operatorRevocations,
    trustedOperatorRoleRootPublicKey,
    expectedDomainId,
    expectedOperatorId,
    operatorKeyId
  });
  const statement = assertPlainObject(raw.statement, 'public witness source provisioning lifecycle command statement');
  assertPublicWitnessServiceKeyUsableAt(context.credential, {
    trustedRoleRootPublicKey: trustedOperatorRoleRootPublicKey,
    at: statement.authorized_at,
    successorCredential: context.successorCredential,
    revocation: context.revocation,
    expectedDomainId,
    expectedRole: PUBLIC_WITNESS_SERVICE_KEY_ROLES.OPERATOR,
    expectedPrincipalId: expectedOperatorId
  });
  const command = verifyPublicWitnessSourceProvisioningCommand(raw, {
    trustedOperatorPublicKey: context.credential.statement.operational_public_key,
    expectedDomainId,
    expectedOperatorId,
    now
  });
  return Object.freeze({
    ...command,
    operator_credential_digest: context.credential.credential_digest,
    operator_key_epoch: context.credential.statement.key_epoch,
    operator_role_root_key_id: context.credential.statement.role_root_key_id
  });
}

export function assertPublicWitnessSourceProvisioningCommandEffectAllowed(raw, {
  operatorCredentialPath,
  operatorRevocations = [],
  trustedOperatorRoleRootPublicKey,
  expectedDomainId,
  expectedOperatorId,
  effectAt
} = {}) {
  const timestamp = canonicalTimestamp(
    effectAt,
    'public witness source provisioning lifecycle effectAt'
  );
  const command = verifyPublicWitnessSourceProvisioningCommandWithKeyLifecycle(raw, {
    operatorCredentialPath,
    operatorRevocations,
    trustedOperatorRoleRootPublicKey,
    expectedDomainId,
    expectedOperatorId,
    now: Date.parse(timestamp)
  });
  const context = lifecycleContext({
    operatorCredentialPath,
    operatorRevocations,
    trustedOperatorRoleRootPublicKey,
    expectedDomainId,
    expectedOperatorId,
    operatorKeyId: command.statement.operator_key_id
  });
  if (context.revocation !== null && timestamp >= context.revocation.statement.effective_at) {
    throw new ValidationError('public witness source provisioning operator credential is revoked for new effects');
  }
  if (
    context.successorCredential !== null
    && timestamp >= context.successorCredential.statement.activated_at
    && ['revoked', 'compromised'].includes(context.successorCredential.statement.predecessor_disposition)
  ) {
    throw new ValidationError('public witness source provisioning operator predecessor is revoked or compromised for new effects');
  }
  return Object.freeze({
    valid: true,
    command_digest: command.command_digest,
    operator_credential_digest: context.credential.credential_digest,
    operator_key_epoch: context.credential.statement.key_epoch,
    effect_at: timestamp,
    routine_rotation_preserves_existing_bounded_command: context.successorCredential !== null
      && context.successorCredential.statement.predecessor_disposition === 'retired',
    wall_clock_signing_time_proved: false,
    globally_current_key_state_claimed: false,
    network_effect: 'none'
  });
}
