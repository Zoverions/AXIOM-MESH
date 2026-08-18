import {
  createPrivateKey,
  createPublicKey,
  sign,
  verify
} from 'node:crypto';

import {
  ValidationError,
  assertPlainObject,
  assertString,
  canonicalJson,
  digestObject,
  sha256
} from './canonical.mjs';

export const PUBLIC_WITNESS_SERVICE_KEY_CREDENTIAL_SCHEMA =
  'axiom-public-witness-service-key-credential.v1';
export const PUBLIC_WITNESS_SERVICE_KEY_REVOCATION_SCHEMA =
  'axiom-public-witness-service-key-revocation.v1';

export const PUBLIC_WITNESS_SERVICE_KEY_ROLES = Object.freeze({
  OPERATOR: 'source-provisioning-operator',
  PROVISIONER: 'source-provisioning-provisioner'
});

const ROLE_AUTHORITY = Object.freeze({
  [PUBLIC_WITNESS_SERVICE_KEY_ROLES.OPERATOR]: Object.freeze({
    authority_scope: 'authorize-exact-w2c2-source-admission',
    authority_effect: 'delegate-w2c2-source-admission-authorization-signing'
  }),
  [PUBLIC_WITNESS_SERVICE_KEY_ROLES.PROVISIONER]: Object.freeze({
    authority_scope: 'sign-w2c4d2-application-journal',
    authority_effect: 'delegate-w2c4d2-application-journal-signing'
  })
});

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const REASON = /^[a-z][a-z0-9._-]{0,63}$/;
const BASE64URL = /^[A-Za-z0-9_-]+$/;
const MAX_PATH = 128;

const CREDENTIAL_KEYS = new Set([
  'schema',
  'statement',
  'statement_digest',
  'root_signature',
  'credential_digest'
]);
const CREDENTIAL_STATEMENT_KEYS = new Set([
  'domain_id',
  'role',
  'principal_id',
  'role_root_key_id',
  'operational_key_id',
  'operational_public_key',
  'key_epoch',
  'activated_at',
  'transition_kind',
  'predecessor_credential_digest',
  'predecessor_disposition',
  'authority_scope',
  'authority_effect',
  'persona_root_trust_effect',
  'social_authority_effect',
  'capability_promotion_effect',
  'finality_claimed',
  'network_effect'
]);
const REVOCATION_KEYS = new Set([
  'schema',
  'statement',
  'statement_digest',
  'root_signature',
  'revocation_digest'
]);
const REVOCATION_STATEMENT_KEYS = new Set([
  'domain_id',
  'role',
  'principal_id',
  'role_root_key_id',
  'credential_digest',
  'operational_key_id',
  'key_epoch',
  'effective_at',
  'reason_code',
  'authority_effect',
  'persona_root_trust_effect',
  'social_authority_effect',
  'capability_promotion_effect',
  'finality_claimed',
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

function positiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new ValidationError(`${label} must be a positive safe integer`);
  }
  return value;
}

function canonicalTimestamp(value, label) {
  const text = assertString(value, label, { min: 24, max: 24 });
  const parsed = new Date(text);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== text) {
    throw new ValidationError(`${label} must be a canonical UTC ISO timestamp`);
  }
  return text;
}

function role(value, label = 'public witness service key role') {
  const normalized = assertString(value, label, { min: 1, max: 64 });
  if (!Object.hasOwn(ROLE_AUTHORITY, normalized)) {
    throw new ValidationError(`${label} is unsupported`);
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

function canonicalPublicKey(value, label) {
  return parsePublicKey(value, label).export({ type: 'spki', format: 'pem' }).toString();
}

export function publicWitnessServiceKeyId(value, label = 'public witness service public key') {
  return sha256(canonicalPublicKey(value, label));
}

function rootSigner(privateKeyValue) {
  const privateKey = parsePrivateKey(privateKeyValue, 'public witness service role root private key');
  const publicKey = createPublicKey(privateKey);
  return Object.freeze({
    privateKey,
    publicKey,
    keyId: publicWitnessServiceKeyId(publicKey, 'public witness service role root public key')
  });
}

function signEnvelope({ schema, statement, privateKey, signatureField, digestField }) {
  const statementDigest = digestObject(statement);
  const signable = Object.freeze({ schema, statement, statement_digest: statementDigest });
  const signature = sign(null, Buffer.from(canonicalJson(signable)), privateKey).toString('base64url');
  const signed = Object.freeze({
    schema,
    statement,
    statement_digest: statementDigest,
    [signatureField]: signature
  });
  return Object.freeze({ ...signed, [digestField]: digestObject(signed) });
}

function verifyEnvelope(raw, {
  schema,
  keys,
  label,
  trustedRootPublicKey,
  expectedRootKeyId,
  signatureField,
  digestField
}) {
  const value = exactKeys(raw, keys, label);
  if (value.schema !== schema) throw new ValidationError(`${label} schema is unsupported`);
  const statementDigest = digest(value.statement_digest, `${label} statement_digest`);
  if (statementDigest !== digestObject(value.statement)) {
    throw new ValidationError(`${label} statement digest mismatch`);
  }
  const root = parsePublicKey(trustedRootPublicKey, `trusted ${label} root public key`);
  if (publicWitnessServiceKeyId(root) !== expectedRootKeyId) {
    throw new ValidationError(`${label} role-root key substitution`);
  }
  const signature = assertString(value[signatureField], `${label} ${signatureField}`, {
    min: 32,
    max: 1024,
    pattern: BASE64URL
  });
  let valid = false;
  try {
    valid = verify(
      null,
      Buffer.from(canonicalJson({ schema, statement: value.statement, statement_digest: statementDigest })),
      root,
      Buffer.from(signature, 'base64url')
    );
  } catch {
    valid = false;
  }
  if (!valid) throw new ValidationError(`${label} root signature is invalid`);
  const signed = Object.freeze({
    schema,
    statement: value.statement,
    statement_digest: statementDigest,
    [signatureField]: signature
  });
  const objectDigest = digest(value[digestField], `${label} ${digestField}`);
  if (objectDigest !== digestObject(signed)) {
    throw new ValidationError(`${label} ${digestField} mismatch`);
  }
  return Object.freeze({ ...signed, [digestField]: objectDigest });
}

function normalizeCredentialStatement(raw) {
  const value = exactKeys(raw, CREDENTIAL_STATEMENT_KEYS, 'public witness service key credential statement');
  const normalizedRole = role(value.role);
  const authority = ROLE_AUTHORITY[normalizedRole];
  const epoch = positiveInteger(value.key_epoch, 'public witness service key credential key_epoch');
  const transitionKind = assertString(
    value.transition_kind,
    'public witness service key credential transition_kind',
    { min: 5, max: 16 }
  );
  if (!['initial', 'rotation', 'recovery'].includes(transitionKind)) {
    throw new ValidationError('public witness service key credential transition_kind is invalid');
  }
  const predecessor = nullableDigest(
    value.predecessor_credential_digest,
    'public witness service key credential predecessor_credential_digest'
  );
  const disposition = value.predecessor_disposition === null
    ? null
    : assertString(
      value.predecessor_disposition,
      'public witness service key credential predecessor_disposition',
      { min: 7, max: 16 }
    );
  if (disposition !== null && !['retired', 'revoked', 'compromised'].includes(disposition)) {
    throw new ValidationError('public witness service key credential predecessor_disposition is invalid');
  }
  if (epoch === 1) {
    if (transitionKind !== 'initial' || predecessor !== null || disposition !== null) {
      throw new ValidationError('first public witness service key credential must be initial without a predecessor');
    }
  } else {
    if (transitionKind === 'initial' || predecessor === null || disposition === null) {
      throw new ValidationError('later public witness service key credential requires transition and predecessor');
    }
    if (transitionKind === 'rotation' && disposition !== 'retired') {
      throw new ValidationError('public witness service key rotation must retire predecessor');
    }
    if (transitionKind === 'recovery' && !['revoked', 'compromised'].includes(disposition)) {
      throw new ValidationError('public witness service key recovery requires revoked or compromised predecessor');
    }
  }
  if (
    value.authority_scope !== authority.authority_scope
    || value.authority_effect !== authority.authority_effect
    || value.persona_root_trust_effect !== 'none'
    || value.social_authority_effect !== 'none'
    || value.capability_promotion_effect !== 'none'
    || value.finality_claimed !== false
    || value.network_effect !== 'none'
  ) {
    throw new ValidationError('public witness service key credential widens its role authority boundary');
  }
  const operationalPublicKey = canonicalPublicKey(
    value.operational_public_key,
    'public witness service key credential operational_public_key'
  );
  const operationalKeyId = digest(
    value.operational_key_id,
    'public witness service key credential operational_key_id'
  );
  if (operationalKeyId !== sha256(operationalPublicKey)) {
    throw new ValidationError('public witness service key credential operational_key_id does not match public key');
  }
  return Object.freeze({
    domain_id: identifier(value.domain_id, 'public witness service key credential domain_id'),
    role: normalizedRole,
    principal_id: identifier(value.principal_id, 'public witness service key credential principal_id'),
    role_root_key_id: digest(value.role_root_key_id, 'public witness service key credential role_root_key_id'),
    operational_key_id: operationalKeyId,
    operational_public_key: operationalPublicKey,
    key_epoch: epoch,
    activated_at: canonicalTimestamp(value.activated_at, 'public witness service key credential activated_at'),
    transition_kind: transitionKind,
    predecessor_credential_digest: predecessor,
    predecessor_disposition: disposition,
    authority_scope: authority.authority_scope,
    authority_effect: authority.authority_effect,
    persona_root_trust_effect: 'none',
    social_authority_effect: 'none',
    capability_promotion_effect: 'none',
    finality_claimed: false,
    network_effect: 'none'
  });
}

export function createPublicWitnessServiceKeyCredential({
  domainId,
  role: roleValue,
  principalId,
  roleRootPrivateKey,
  operationalPublicKey,
  keyEpoch,
  activatedAt,
  transitionKind = 'initial',
  predecessorCredential = null,
  predecessorDisposition = null,
  trustedRoleRootPublicKey = null
} = {}) {
  const root = rootSigner(roleRootPrivateKey);
  if (trustedRoleRootPublicKey !== null) {
    const trusted = parsePublicKey(trustedRoleRootPublicKey, 'trusted public witness service role root public key');
    if (publicWitnessServiceKeyId(trusted) !== root.keyId) {
      throw new ValidationError('public witness service role root private key does not match trusted root');
    }
  }
  const normalizedRole = role(roleValue);
  const normalizedEpoch = positiveInteger(keyEpoch, 'public witness service key credential keyEpoch');
  const operationalPem = canonicalPublicKey(
    operationalPublicKey,
    'public witness service key credential operational public key'
  );
  let predecessor = null;
  if (predecessorCredential !== null) {
    predecessor = verifyPublicWitnessServiceKeyCredential(predecessorCredential, {
      trustedRoleRootPublicKey: root.publicKey,
      expectedDomainId: domainId,
      expectedRole: normalizedRole,
      expectedPrincipalId: principalId
    });
    if (normalizedEpoch !== predecessor.statement.key_epoch + 1) {
      throw new ValidationError('public witness service key credential epoch must advance by one');
    }
    const activation = canonicalTimestamp(activatedAt, 'public witness service key credential activatedAt');
    if (activation <= predecessor.statement.activated_at) {
      throw new ValidationError('public witness service key credential activation must advance monotonically');
    }
    if (sha256(operationalPem) === predecessor.statement.operational_key_id) {
      throw new ValidationError('public witness service key rotation or recovery must change operational key');
    }
  } else if (normalizedEpoch !== 1) {
    throw new ValidationError('non-genesis public witness service key credential requires predecessor');
  }
  const authority = ROLE_AUTHORITY[normalizedRole];
  const statement = normalizeCredentialStatement({
    domain_id: domainId,
    role: normalizedRole,
    principal_id: principalId,
    role_root_key_id: root.keyId,
    operational_key_id: sha256(operationalPem),
    operational_public_key: operationalPem,
    key_epoch: normalizedEpoch,
    activated_at: activatedAt,
    transition_kind: transitionKind,
    predecessor_credential_digest: predecessor ? predecessor.credential_digest : null,
    predecessor_disposition: predecessor ? predecessorDisposition : null,
    authority_scope: authority.authority_scope,
    authority_effect: authority.authority_effect,
    persona_root_trust_effect: 'none',
    social_authority_effect: 'none',
    capability_promotion_effect: 'none',
    finality_claimed: false,
    network_effect: 'none'
  });
  return signEnvelope({
    schema: PUBLIC_WITNESS_SERVICE_KEY_CREDENTIAL_SCHEMA,
    statement,
    privateKey: root.privateKey,
    signatureField: 'root_signature',
    digestField: 'credential_digest'
  });
}

export function verifyPublicWitnessServiceKeyCredential(raw, {
  trustedRoleRootPublicKey,
  expectedDomainId,
  expectedRole,
  expectedPrincipalId
} = {}) {
  const value = exactKeys(raw, CREDENTIAL_KEYS, 'public witness service key credential');
  const statement = normalizeCredentialStatement(value.statement);
  const verified = verifyEnvelope(value, {
    schema: PUBLIC_WITNESS_SERVICE_KEY_CREDENTIAL_SCHEMA,
    keys: CREDENTIAL_KEYS,
    label: 'public witness service key credential',
    trustedRootPublicKey: trustedRoleRootPublicKey,
    expectedRootKeyId: statement.role_root_key_id,
    signatureField: 'root_signature',
    digestField: 'credential_digest'
  });
  if (expectedDomainId !== undefined && statement.domain_id !== expectedDomainId) {
    throw new ValidationError('public witness service key credential belongs to a different domain');
  }
  if (expectedRole !== undefined && statement.role !== expectedRole) {
    throw new ValidationError('public witness service key credential belongs to a different role');
  }
  if (expectedPrincipalId !== undefined && statement.principal_id !== expectedPrincipalId) {
    throw new ValidationError('public witness service key credential belongs to a different principal');
  }
  return Object.freeze({ ...verified, statement });
}

export function validatePublicWitnessServiceKeyCredentialTransition(previousRaw, currentRaw, {
  trustedRoleRootPublicKey
} = {}) {
  const previous = verifyPublicWitnessServiceKeyCredential(previousRaw, { trustedRoleRootPublicKey });
  const current = verifyPublicWitnessServiceKeyCredential(currentRaw, { trustedRoleRootPublicKey });
  if (
    current.statement.domain_id !== previous.statement.domain_id
    || current.statement.role !== previous.statement.role
    || current.statement.principal_id !== previous.statement.principal_id
    || current.statement.role_root_key_id !== previous.statement.role_root_key_id
  ) {
    throw new ValidationError('public witness service key transition cannot cross role trust binding');
  }
  if (current.statement.key_epoch !== previous.statement.key_epoch + 1) {
    throw new ValidationError('public witness service key transition must advance exactly one epoch');
  }
  if (current.statement.predecessor_credential_digest !== previous.credential_digest) {
    throw new ValidationError('public witness service key transition predecessor digest is invalid');
  }
  if (current.statement.activated_at <= previous.statement.activated_at) {
    throw new ValidationError('public witness service key transition activation must advance');
  }
  if (current.statement.operational_key_id === previous.statement.operational_key_id) {
    throw new ValidationError('public witness service key transition must change operational key');
  }
  return Object.freeze({
    valid: true,
    domain_id: current.statement.domain_id,
    role: current.statement.role,
    principal_id: current.statement.principal_id,
    role_root_key_id: current.statement.role_root_key_id,
    previous_epoch: previous.statement.key_epoch,
    current_epoch: current.statement.key_epoch,
    transition_kind: current.statement.transition_kind,
    predecessor_disposition: current.statement.predecessor_disposition,
    previous_credential_digest: previous.credential_digest,
    current_credential_digest: current.credential_digest
  });
}

export function validatePublicWitnessServiceKeyCredentialPath(credentials, {
  trustedRoleRootPublicKey,
  expectedDomainId,
  expectedRole,
  expectedPrincipalId
} = {}) {
  if (!Array.isArray(credentials) || credentials.length < 1 || credentials.length > MAX_PATH) {
    throw new ValidationError(`public witness service key credential path requires 1-${MAX_PATH} credentials`);
  }
  const verified = credentials.map(credential => verifyPublicWitnessServiceKeyCredential(credential, {
    trustedRoleRootPublicKey,
    expectedDomainId,
    expectedRole,
    expectedPrincipalId
  }));
  if (verified[0].statement.key_epoch !== 1) {
    throw new ValidationError('public witness service key credential path must begin at epoch 1');
  }
  const keyIds = new Set();
  for (let index = 0; index < verified.length; index += 1) {
    const credential = verified[index];
    if (keyIds.has(credential.statement.operational_key_id)) {
      throw new ValidationError('public witness service key credential path reuses an operational key');
    }
    keyIds.add(credential.statement.operational_key_id);
    if (index > 0) {
      validatePublicWitnessServiceKeyCredentialTransition(verified[index - 1], credential, {
        trustedRoleRootPublicKey
      });
    }
  }
  return Object.freeze({
    valid: true,
    domain_id: verified[0].statement.domain_id,
    role: verified[0].statement.role,
    principal_id: verified[0].statement.principal_id,
    role_root_key_id: verified[0].statement.role_root_key_id,
    first_epoch: 1,
    last_epoch: verified.at(-1).statement.key_epoch,
    credential_count: verified.length,
    first_credential_digest: verified[0].credential_digest,
    last_credential_digest: verified.at(-1).credential_digest
  });
}

function normalizeRevocationStatement(raw) {
  const value = exactKeys(raw, REVOCATION_STATEMENT_KEYS, 'public witness service key revocation statement');
  const normalizedRole = role(value.role);
  if (
    value.authority_effect !== 'contract-role-key-authority'
    || value.persona_root_trust_effect !== 'none'
    || value.social_authority_effect !== 'none'
    || value.capability_promotion_effect !== 'none'
    || value.finality_claimed !== false
    || value.network_effect !== 'none'
  ) {
    throw new ValidationError('public witness service key revocation widens its authority boundary');
  }
  return Object.freeze({
    domain_id: identifier(value.domain_id, 'public witness service key revocation domain_id'),
    role: normalizedRole,
    principal_id: identifier(value.principal_id, 'public witness service key revocation principal_id'),
    role_root_key_id: digest(value.role_root_key_id, 'public witness service key revocation role_root_key_id'),
    credential_digest: digest(value.credential_digest, 'public witness service key revocation credential_digest'),
    operational_key_id: digest(value.operational_key_id, 'public witness service key revocation operational_key_id'),
    key_epoch: positiveInteger(value.key_epoch, 'public witness service key revocation key_epoch'),
    effective_at: canonicalTimestamp(value.effective_at, 'public witness service key revocation effective_at'),
    reason_code: assertString(value.reason_code, 'public witness service key revocation reason_code', {
      min: 1,
      max: 64,
      pattern: REASON
    }),
    authority_effect: 'contract-role-key-authority',
    persona_root_trust_effect: 'none',
    social_authority_effect: 'none',
    capability_promotion_effect: 'none',
    finality_claimed: false,
    network_effect: 'none'
  });
}

export function createPublicWitnessServiceKeyRevocation(credentialRaw, {
  trustedRoleRootPublicKey,
  roleRootPrivateKey,
  effectiveAt,
  reasonCode
} = {}) {
  const root = rootSigner(roleRootPrivateKey);
  const trusted = parsePublicKey(trustedRoleRootPublicKey, 'trusted public witness service role root public key');
  if (publicWitnessServiceKeyId(trusted) !== root.keyId) {
    throw new ValidationError('public witness service role root private key does not match trusted root');
  }
  const credential = verifyPublicWitnessServiceKeyCredential(credentialRaw, {
    trustedRoleRootPublicKey: trusted
  });
  const effective = canonicalTimestamp(effectiveAt, 'public witness service key revocation effectiveAt');
  if (effective < credential.statement.activated_at) {
    throw new ValidationError('public witness service key revocation cannot predate credential activation');
  }
  const statement = normalizeRevocationStatement({
    domain_id: credential.statement.domain_id,
    role: credential.statement.role,
    principal_id: credential.statement.principal_id,
    role_root_key_id: credential.statement.role_root_key_id,
    credential_digest: credential.credential_digest,
    operational_key_id: credential.statement.operational_key_id,
    key_epoch: credential.statement.key_epoch,
    effective_at: effective,
    reason_code: reasonCode,
    authority_effect: 'contract-role-key-authority',
    persona_root_trust_effect: 'none',
    social_authority_effect: 'none',
    capability_promotion_effect: 'none',
    finality_claimed: false,
    network_effect: 'none'
  });
  return signEnvelope({
    schema: PUBLIC_WITNESS_SERVICE_KEY_REVOCATION_SCHEMA,
    statement,
    privateKey: root.privateKey,
    signatureField: 'root_signature',
    digestField: 'revocation_digest'
  });
}

export function verifyPublicWitnessServiceKeyRevocation(raw, {
  trustedRoleRootPublicKey,
  credential
} = {}) {
  const value = exactKeys(raw, REVOCATION_KEYS, 'public witness service key revocation');
  const statement = normalizeRevocationStatement(value.statement);
  const verified = verifyEnvelope(value, {
    schema: PUBLIC_WITNESS_SERVICE_KEY_REVOCATION_SCHEMA,
    keys: REVOCATION_KEYS,
    label: 'public witness service key revocation',
    trustedRootPublicKey: trustedRoleRootPublicKey,
    expectedRootKeyId: statement.role_root_key_id,
    signatureField: 'root_signature',
    digestField: 'revocation_digest'
  });
  if (credential !== undefined) {
    const bound = verifyPublicWitnessServiceKeyCredential(credential, { trustedRoleRootPublicKey });
    if (
      statement.domain_id !== bound.statement.domain_id
      || statement.role !== bound.statement.role
      || statement.principal_id !== bound.statement.principal_id
      || statement.role_root_key_id !== bound.statement.role_root_key_id
      || statement.credential_digest !== bound.credential_digest
      || statement.operational_key_id !== bound.statement.operational_key_id
      || statement.key_epoch !== bound.statement.key_epoch
    ) {
      throw new ValidationError('public witness service key revocation does not bind supplied credential');
    }
  }
  return Object.freeze({ ...verified, statement });
}

export function assertPublicWitnessServiceKeyUsableAt(credentialRaw, {
  trustedRoleRootPublicKey,
  at,
  successorCredential = null,
  revocation = null,
  expectedDomainId,
  expectedRole,
  expectedPrincipalId
} = {}) {
  const credential = verifyPublicWitnessServiceKeyCredential(credentialRaw, {
    trustedRoleRootPublicKey,
    expectedDomainId,
    expectedRole,
    expectedPrincipalId
  });
  const timestamp = canonicalTimestamp(at, 'public witness service key usage time');
  if (timestamp < credential.statement.activated_at) {
    throw new ValidationError('public witness service key credential is not active yet');
  }
  let successor = null;
  if (successorCredential !== null) {
    successor = verifyPublicWitnessServiceKeyCredential(successorCredential, {
      trustedRoleRootPublicKey,
      expectedDomainId: credential.statement.domain_id,
      expectedRole: credential.statement.role,
      expectedPrincipalId: credential.statement.principal_id
    });
    validatePublicWitnessServiceKeyCredentialTransition(credential, successor, {
      trustedRoleRootPublicKey
    });
    if (timestamp >= successor.statement.activated_at) {
      throw new ValidationError('public witness service key credential is stale after successor activation');
    }
  }
  let revoked = null;
  if (revocation !== null) {
    revoked = verifyPublicWitnessServiceKeyRevocation(revocation, {
      trustedRoleRootPublicKey,
      credential
    });
    if (timestamp >= revoked.statement.effective_at) {
      throw new ValidationError('public witness service key credential is revoked at requested time');
    }
  }
  return Object.freeze({
    valid: true,
    domain_id: credential.statement.domain_id,
    role: credential.statement.role,
    principal_id: credential.statement.principal_id,
    role_root_key_id: credential.statement.role_root_key_id,
    operational_key_id: credential.statement.operational_key_id,
    key_epoch: credential.statement.key_epoch,
    usable_at: timestamp,
    successor_checked: successor !== null,
    revocation_checked: revoked !== null,
    wall_clock_signing_time_proved: false,
    globally_current_key_state_claimed: false,
    network_effect: 'none'
  });
}

export function resolvePublicWitnessServiceKeyCredential(credentials, {
  trustedRoleRootPublicKey,
  operationalKeyId,
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
  const wanted = digest(operationalKeyId, 'public witness service operationalKeyId');
  const matches = credentials
    .map(credential => verifyPublicWitnessServiceKeyCredential(credential, {
      trustedRoleRootPublicKey,
      expectedDomainId,
      expectedRole,
      expectedPrincipalId
    }))
    .filter(credential => credential.statement.operational_key_id === wanted);
  if (matches.length !== 1) {
    throw new ValidationError('public witness service operational key is not uniquely credentialed');
  }
  return matches[0];
}

export function resolvePublicWitnessServiceKeyRevocation(revocations, credentialRaw, {
  trustedRoleRootPublicKey
} = {}) {
  if (!Array.isArray(revocations) || revocations.length > MAX_PATH) {
    throw new ValidationError(`public witness service key revocations must be an array of at most ${MAX_PATH}`);
  }
  const credential = verifyPublicWitnessServiceKeyCredential(credentialRaw, { trustedRoleRootPublicKey });
  const matches = revocations
    .map(revocation => verifyPublicWitnessServiceKeyRevocation(revocation, {
      trustedRoleRootPublicKey
    }))
    .filter(revocation => revocation.statement.credential_digest === credential.credential_digest);
  if (matches.length > 1) {
    const unique = new Set(matches.map(item => item.revocation_digest));
    if (unique.size > 1) {
      throw new ValidationError('public witness service key credential has conflicting revocations');
    }
  }
  return matches.length === 0 ? null : matches[0];
}
