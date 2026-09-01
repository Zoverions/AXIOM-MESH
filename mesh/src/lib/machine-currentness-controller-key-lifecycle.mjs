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

export const MACHINE_CURRENTNESS_CONTROLLER_KEY_CREDENTIAL_SCHEMA =
  'axiom-machine-currentness-controller-key-credential.v1';
export const MACHINE_CURRENTNESS_CONTROLLER_KEY_REVOCATION_SCHEMA =
  'axiom-machine-currentness-controller-key-revocation.v1';

const ROLE = 'machine-principal-currentness-controller';
const AUTHORITY_SCOPE = 'sign-machine-principal-currentness-checkpoints';
const AUTHORITY_EFFECT = 'authorize-currentness-evidence-signing-only';
const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const REASON = /^[a-z][a-z0-9._-]{0,63}$/;
const BASE64URL = /^[A-Za-z0-9_-]+$/;
const MAX_PATH = 128;

const FIXED_NONCLAIMS = Object.freeze({
  role: ROLE,
  authority_scope: AUTHORITY_SCOPE,
  authority_effect: AUTHORITY_EFFECT,
  execution_authority_granted: false,
  capability_promotion_effect: 'none',
  delegation_effect: 'none',
  identity_effect: 'none',
  global_currentness_claimed: false,
  network_effect: 'none'
});

function exact(raw, allowed, label) {
  const value = assertPlainObject(raw, label);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new ValidationError(`${label} contains unsupported field ${key}`);
  }
  return value;
}

function identifier(value, label) {
  return assertString(value, label, { min: 1, max: 192, pattern: ID });
}

function digest(value, label) {
  return assertString(value, label, { min: 64, max: 64, pattern: DIGEST });
}

function timestamp(value, label) {
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

function parsePrivateKey(value, label) {
  try {
    const key = value?.type === 'private' ? value : createPrivateKey(value);
    if (key.asymmetricKeyType !== 'ed25519') throw new Error();
    return key;
  } catch {
    throw new ValidationError(`${label} must be Ed25519`);
  }
}

function parsePublicKey(value, label) {
  try {
    const key = value?.type === 'public' ? value : createPublicKey(value);
    if (key.asymmetricKeyType !== 'ed25519') throw new Error();
    return key;
  } catch {
    throw new ValidationError(`${label} must be Ed25519`);
  }
}

function canonicalPublicKey(value, label) {
  return parsePublicKey(value, label).export({ type: 'spki', format: 'pem' }).toString();
}

export function machineCurrentnessControllerKeyId(value) {
  return sha256(canonicalPublicKey(value, 'machine currentness controller public key'));
}

function rootSigner(privateKeyValue) {
  const privateKey = parsePrivateKey(
    privateKeyValue,
    'machine currentness controller root private key'
  );
  const publicKey = createPublicKey(privateKey);
  return Object.freeze({
    privateKey,
    publicKey,
    keyId: machineCurrentnessControllerKeyId(publicKey)
  });
}

function signedEnvelope({ schema, statement, privateKey, signatureField, digestField }) {
  const statementDigest = digestObject(statement);
  const signable = Object.freeze({ schema, statement, statement_digest: statementDigest });
  const signature = sign(null, Buffer.from(canonicalJson(signable)), privateKey).toString('base64url');
  const signed = Object.freeze({
    ...signable,
    [signatureField]: signature
  });
  return Object.freeze({ ...signed, [digestField]: digestObject(signed) });
}

const CREDENTIAL_KEYS = new Set([
  'schema', 'statement', 'statement_digest', 'root_signature', 'credential_digest'
]);
const CREDENTIAL_STATEMENT_KEYS = new Set([
  'domain_id', 'role', 'principal_id', 'root_key_id', 'operational_key_id',
  'operational_public_key', 'key_epoch', 'activated_at', 'transition_kind',
  'predecessor_credential_digest', 'predecessor_disposition',
  'authority_scope', 'authority_effect', 'execution_authority_granted',
  'capability_promotion_effect', 'delegation_effect', 'identity_effect',
  'global_currentness_claimed', 'network_effect'
]);
const REVOCATION_KEYS = new Set([
  'schema', 'statement', 'statement_digest', 'root_signature', 'revocation_digest'
]);
const REVOCATION_STATEMENT_KEYS = new Set([
  'domain_id', 'role', 'principal_id', 'root_key_id', 'credential_digest',
  'operational_key_id', 'key_epoch', 'effective_at', 'reason_code',
  'authority_effect', 'execution_authority_granted', 'capability_promotion_effect',
  'delegation_effect', 'identity_effect', 'global_currentness_claimed', 'network_effect'
]);

function normalizeCredentialStatement(raw) {
  const value = exact(
    raw,
    CREDENTIAL_STATEMENT_KEYS,
    'machine currentness controller key credential statement'
  );
  if (
    value.role !== ROLE
    || value.authority_scope !== AUTHORITY_SCOPE
    || value.authority_effect !== AUTHORITY_EFFECT
    || value.execution_authority_granted !== false
    || value.capability_promotion_effect !== 'none'
    || value.delegation_effect !== 'none'
    || value.identity_effect !== 'none'
    || value.global_currentness_claimed !== false
    || value.network_effect !== 'none'
  ) {
    throw new ValidationError('machine currentness controller credential widens its evidence-signing boundary');
  }
  const epoch = positiveInteger(value.key_epoch, 'machine currentness controller key epoch');
  const transition = assertString(value.transition_kind, 'machine currentness controller transition kind', {
    min: 5,
    max: 16
  });
  if (!['initial', 'rotation', 'recovery'].includes(transition)) {
    throw new ValidationError('machine currentness controller transition kind is invalid');
  }
  const predecessor = value.predecessor_credential_digest === null
    ? null
    : digest(
        value.predecessor_credential_digest,
        'machine currentness controller predecessor credential digest'
      );
  const disposition = value.predecessor_disposition;
  if (epoch === 1) {
    if (transition !== 'initial' || predecessor !== null || disposition !== null) {
      throw new ValidationError('first machine currentness controller credential must be initial');
    }
  } else {
    if (
      predecessor === null
      || !['retired', 'revoked', 'compromised'].includes(disposition)
      || transition === 'initial'
    ) {
      throw new ValidationError('later machine currentness controller credential requires predecessor transition');
    }
    if (transition === 'rotation' && disposition !== 'retired') {
      throw new ValidationError('machine currentness controller rotation must retire predecessor');
    }
    if (transition === 'recovery' && !['revoked', 'compromised'].includes(disposition)) {
      throw new ValidationError('machine currentness controller recovery requires revoked or compromised predecessor');
    }
  }
  const operationalPublicKey = canonicalPublicKey(
    value.operational_public_key,
    'machine currentness controller operational public key'
  );
  const operationalKeyId = digest(
    value.operational_key_id,
    'machine currentness controller operational key id'
  );
  if (operationalKeyId !== sha256(operationalPublicKey)) {
    throw new ValidationError('machine currentness controller operational key id mismatch');
  }
  return Object.freeze({
    domain_id: identifier(value.domain_id, 'machine currentness controller domain id'),
    role: ROLE,
    principal_id: identifier(value.principal_id, 'machine currentness controller principal id'),
    root_key_id: digest(value.root_key_id, 'machine currentness controller root key id'),
    operational_key_id: operationalKeyId,
    operational_public_key: operationalPublicKey,
    key_epoch: epoch,
    activated_at: timestamp(value.activated_at, 'machine currentness controller activated_at'),
    transition_kind: transition,
    predecessor_credential_digest: predecessor,
    predecessor_disposition: disposition,
    ...FIXED_NONCLAIMS
  });
}

function verifyEnvelope(raw, {
  schema,
  keys,
  label,
  trustedRootPublicKey,
  signatureField,
  digestField
}) {
  const value = exact(raw, keys, label);
  if (value.schema !== schema) throw new ValidationError(`${label} schema is unsupported`);
  const statementDigest = digest(value.statement_digest, `${label} statement digest`);
  if (statementDigest !== digestObject(value.statement)) {
    throw new ValidationError(`${label} statement digest mismatch`);
  }
  const root = parsePublicKey(trustedRootPublicKey, `trusted ${label} root public key`);
  if (value.statement.root_key_id !== machineCurrentnessControllerKeyId(root)) {
    throw new ValidationError(`${label} root key substitution`);
  }
  const signature = assertString(value[signatureField], `${label} signature`, {
    min: 32,
    max: 1024,
    pattern: BASE64URL
  });
  const valid = verify(
    null,
    Buffer.from(canonicalJson({ schema, statement: value.statement, statement_digest: statementDigest })),
    root,
    Buffer.from(signature, 'base64url')
  );
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

export function createMachineCurrentnessControllerKeyCredential({
  domainId = 'axiom.machine-currentness.v1',
  principalId,
  rootPrivateKey,
  operationalPublicKey,
  keyEpoch,
  activatedAt,
  transitionKind = 'initial',
  predecessorCredential = null,
  predecessorDisposition = null,
  trustedRootPublicKey = null
} = {}) {
  const root = rootSigner(rootPrivateKey);
  if (
    trustedRootPublicKey !== null
    && machineCurrentnessControllerKeyId(trustedRootPublicKey) !== root.keyId
  ) {
    throw new ValidationError('machine currentness controller root private key does not match trusted root');
  }
  const epoch = positiveInteger(keyEpoch, 'machine currentness controller key epoch');
  const operationalPem = canonicalPublicKey(
    operationalPublicKey,
    'machine currentness controller operational public key'
  );
  let predecessor = null;
  if (predecessorCredential !== null) {
    predecessor = verifyMachineCurrentnessControllerKeyCredential(predecessorCredential, {
      trustedRootPublicKey: root.publicKey,
      expectedDomainId: domainId,
      expectedPrincipalId: principalId
    });
    if (epoch !== predecessor.statement.key_epoch + 1) {
      throw new ValidationError('machine currentness controller key epoch must advance by one');
    }
    if (timestamp(activatedAt, 'machine currentness controller activatedAt') <= predecessor.statement.activated_at) {
      throw new ValidationError('machine currentness controller activation must advance monotonically');
    }
    if (sha256(operationalPem) === predecessor.statement.operational_key_id) {
      throw new ValidationError('machine currentness controller rotation or recovery must change operational key');
    }
  } else if (epoch !== 1) {
    throw new ValidationError('non-genesis machine currentness controller credential requires predecessor');
  }

  const statement = normalizeCredentialStatement({
    domain_id: domainId,
    role: ROLE,
    principal_id: principalId,
    root_key_id: root.keyId,
    operational_key_id: sha256(operationalPem),
    operational_public_key: operationalPem,
    key_epoch: epoch,
    activated_at: activatedAt,
    transition_kind: transitionKind,
    predecessor_credential_digest: predecessor?.credential_digest ?? null,
    predecessor_disposition: predecessor ? predecessorDisposition : null,
    ...FIXED_NONCLAIMS
  });
  return signedEnvelope({
    schema: MACHINE_CURRENTNESS_CONTROLLER_KEY_CREDENTIAL_SCHEMA,
    statement,
    privateKey: root.privateKey,
    signatureField: 'root_signature',
    digestField: 'credential_digest'
  });
}

export function verifyMachineCurrentnessControllerKeyCredential(raw, {
  trustedRootPublicKey,
  expectedDomainId,
  expectedPrincipalId
} = {}) {
  const statement = normalizeCredentialStatement(
    exact(raw, CREDENTIAL_KEYS, 'machine currentness controller key credential').statement
  );
  const verified = verifyEnvelope(raw, {
    schema: MACHINE_CURRENTNESS_CONTROLLER_KEY_CREDENTIAL_SCHEMA,
    keys: CREDENTIAL_KEYS,
    label: 'machine currentness controller key credential',
    trustedRootPublicKey,
    signatureField: 'root_signature',
    digestField: 'credential_digest'
  });
  if (expectedDomainId !== undefined && statement.domain_id !== expectedDomainId) {
    throw new ValidationError('machine currentness controller credential belongs to a different domain');
  }
  if (expectedPrincipalId !== undefined && statement.principal_id !== expectedPrincipalId) {
    throw new ValidationError('machine currentness controller credential belongs to a different principal');
  }
  return Object.freeze({ ...verified, statement });
}

export function validateMachineCurrentnessControllerKeyTransition(previousRaw, currentRaw, {
  trustedRootPublicKey
} = {}) {
  const previous = verifyMachineCurrentnessControllerKeyCredential(previousRaw, { trustedRootPublicKey });
  const current = verifyMachineCurrentnessControllerKeyCredential(currentRaw, { trustedRootPublicKey });
  if (
    previous.statement.domain_id !== current.statement.domain_id
    || previous.statement.principal_id !== current.statement.principal_id
    || previous.statement.root_key_id !== current.statement.root_key_id
  ) {
    throw new ValidationError('machine currentness controller transition crossed trust binding');
  }
  if (current.statement.key_epoch !== previous.statement.key_epoch + 1) {
    throw new ValidationError('machine currentness controller transition must advance one epoch');
  }
  if (current.statement.predecessor_credential_digest !== previous.credential_digest) {
    throw new ValidationError('machine currentness controller predecessor credential mismatch');
  }
  if (current.statement.activated_at <= previous.statement.activated_at) {
    throw new ValidationError('machine currentness controller activation must advance');
  }
  if (current.statement.operational_key_id === previous.statement.operational_key_id) {
    throw new ValidationError('machine currentness controller transition must change operational key');
  }
  return Object.freeze({
    valid: true,
    previous_epoch: previous.statement.key_epoch,
    current_epoch: current.statement.key_epoch,
    transition_kind: current.statement.transition_kind,
    predecessor_disposition: current.statement.predecessor_disposition,
    current_credential_digest: current.credential_digest,
    execution_authority_granted: false,
    capability_promotion_effect: 'none'
  });
}

export function validateMachineCurrentnessControllerKeyPath(credentials, {
  trustedRootPublicKey,
  expectedDomainId,
  expectedPrincipalId
} = {}) {
  if (!Array.isArray(credentials) || credentials.length < 1 || credentials.length > MAX_PATH) {
    throw new ValidationError(`machine currentness controller path requires 1-${MAX_PATH} credentials`);
  }
  const verified = credentials.map(item => verifyMachineCurrentnessControllerKeyCredential(item, {
    trustedRootPublicKey,
    expectedDomainId,
    expectedPrincipalId
  }));
  if (verified[0].statement.key_epoch !== 1) {
    throw new ValidationError('machine currentness controller path must begin at epoch 1');
  }
  const operationalKeys = new Set();
  for (let index = 0; index < verified.length; index += 1) {
    const item = verified[index];
    if (operationalKeys.has(item.statement.operational_key_id)) {
      throw new ValidationError('machine currentness controller path reuses an operational key');
    }
    operationalKeys.add(item.statement.operational_key_id);
    if (index > 0) {
      validateMachineCurrentnessControllerKeyTransition(verified[index - 1], item, {
        trustedRootPublicKey
      });
    }
  }
  return Object.freeze({
    valid: true,
    first_epoch: 1,
    last_epoch: verified.at(-1).statement.key_epoch,
    credential_count: verified.length,
    latest_credential_digest: verified.at(-1).credential_digest,
    latest_operational_key_id: verified.at(-1).statement.operational_key_id,
    execution_authority_granted: false,
    global_currentness_claimed: false
  });
}

function normalizeRevocationStatement(raw) {
  const value = exact(
    raw,
    REVOCATION_STATEMENT_KEYS,
    'machine currentness controller key revocation statement'
  );
  if (
    value.role !== ROLE
    || value.authority_effect !== 'revoke-currentness-evidence-signing-key'
    || value.execution_authority_granted !== false
    || value.capability_promotion_effect !== 'none'
    || value.delegation_effect !== 'none'
    || value.identity_effect !== 'none'
    || value.global_currentness_claimed !== false
    || value.network_effect !== 'none'
  ) {
    throw new ValidationError('machine currentness controller revocation widens its key-lifecycle boundary');
  }
  return Object.freeze({
    domain_id: identifier(value.domain_id, 'machine currentness controller revocation domain id'),
    role: ROLE,
    principal_id: identifier(value.principal_id, 'machine currentness controller revocation principal id'),
    root_key_id: digest(value.root_key_id, 'machine currentness controller revocation root key id'),
    credential_digest: digest(value.credential_digest, 'machine currentness controller revocation credential digest'),
    operational_key_id: digest(value.operational_key_id, 'machine currentness controller revocation operational key id'),
    key_epoch: positiveInteger(value.key_epoch, 'machine currentness controller revocation key epoch'),
    effective_at: timestamp(value.effective_at, 'machine currentness controller revocation effective_at'),
    reason_code: assertString(value.reason_code, 'machine currentness controller revocation reason_code', {
      min: 1,
      max: 64,
      pattern: REASON
    }),
    authority_effect: 'revoke-currentness-evidence-signing-key',
    execution_authority_granted: false,
    capability_promotion_effect: 'none',
    delegation_effect: 'none',
    identity_effect: 'none',
    global_currentness_claimed: false,
    network_effect: 'none'
  });
}

export function createMachineCurrentnessControllerKeyRevocation(credentialRaw, {
  trustedRootPublicKey,
  rootPrivateKey,
  effectiveAt,
  reasonCode
} = {}) {
  const root = rootSigner(rootPrivateKey);
  if (machineCurrentnessControllerKeyId(trustedRootPublicKey) !== root.keyId) {
    throw new ValidationError('machine currentness controller revocation root mismatch');
  }
  const credential = verifyMachineCurrentnessControllerKeyCredential(credentialRaw, {
    trustedRootPublicKey
  });
  const effective = timestamp(effectiveAt, 'machine currentness controller revocation effectiveAt');
  if (effective < credential.statement.activated_at) {
    throw new ValidationError('machine currentness controller revocation predates activation');
  }
  const statement = normalizeRevocationStatement({
    domain_id: credential.statement.domain_id,
    role: ROLE,
    principal_id: credential.statement.principal_id,
    root_key_id: credential.statement.root_key_id,
    credential_digest: credential.credential_digest,
    operational_key_id: credential.statement.operational_key_id,
    key_epoch: credential.statement.key_epoch,
    effective_at: effective,
    reason_code: reasonCode,
    authority_effect: 'revoke-currentness-evidence-signing-key',
    execution_authority_granted: false,
    capability_promotion_effect: 'none',
    delegation_effect: 'none',
    identity_effect: 'none',
    global_currentness_claimed: false,
    network_effect: 'none'
  });
  return signedEnvelope({
    schema: MACHINE_CURRENTNESS_CONTROLLER_KEY_REVOCATION_SCHEMA,
    statement,
    privateKey: root.privateKey,
    signatureField: 'root_signature',
    digestField: 'revocation_digest'
  });
}

export function verifyMachineCurrentnessControllerKeyRevocation(raw, {
  trustedRootPublicKey,
  credential
} = {}) {
  const statement = normalizeRevocationStatement(
    exact(raw, REVOCATION_KEYS, 'machine currentness controller key revocation').statement
  );
  const verified = verifyEnvelope(raw, {
    schema: MACHINE_CURRENTNESS_CONTROLLER_KEY_REVOCATION_SCHEMA,
    keys: REVOCATION_KEYS,
    label: 'machine currentness controller key revocation',
    trustedRootPublicKey,
    signatureField: 'root_signature',
    digestField: 'revocation_digest'
  });
  if (credential !== undefined) {
    const bound = verifyMachineCurrentnessControllerKeyCredential(credential, {
      trustedRootPublicKey
    });
    if (
      statement.credential_digest !== bound.credential_digest
      || statement.operational_key_id !== bound.statement.operational_key_id
      || statement.key_epoch !== bound.statement.key_epoch
      || statement.principal_id !== bound.statement.principal_id
      || statement.domain_id !== bound.statement.domain_id
    ) {
      throw new ValidationError('machine currentness controller revocation does not bind supplied credential');
    }
  }
  return Object.freeze({ ...verified, statement });
}

export function assertMachineCurrentnessControllerKeyUsableAt(credentialRaw, {
  trustedRootPublicKey,
  at,
  successorCredential = null,
  revocation = null,
  expectedDomainId,
  expectedPrincipalId
} = {}) {
  const credential = verifyMachineCurrentnessControllerKeyCredential(credentialRaw, {
    trustedRootPublicKey,
    expectedDomainId,
    expectedPrincipalId
  });
  const when = timestamp(at, 'machine currentness controller usage time');
  if (when < credential.statement.activated_at) {
    throw new ValidationError('machine currentness controller credential is not active yet');
  }
  if (successorCredential !== null) {
    const successor = verifyMachineCurrentnessControllerKeyCredential(successorCredential, {
      trustedRootPublicKey,
      expectedDomainId: credential.statement.domain_id,
      expectedPrincipalId: credential.statement.principal_id
    });
    validateMachineCurrentnessControllerKeyTransition(credential, successor, {
      trustedRootPublicKey
    });
    if (when >= successor.statement.activated_at) {
      throw new ValidationError('machine currentness controller credential is stale after successor activation');
    }
  }
  if (revocation !== null) {
    const revoked = verifyMachineCurrentnessControllerKeyRevocation(revocation, {
      trustedRootPublicKey,
      credential
    });
    if (when >= revoked.statement.effective_at) {
      throw new ValidationError('machine currentness controller credential is revoked at requested time');
    }
  }
  return Object.freeze({
    valid: true,
    operational_key_id: credential.statement.operational_key_id,
    operational_public_key: credential.statement.operational_public_key,
    key_epoch: credential.statement.key_epoch,
    usable_at: when,
    execution_authority_granted: false,
    currentness_evidence_signing_only: true,
    global_currentness_claimed: false
  });
}
