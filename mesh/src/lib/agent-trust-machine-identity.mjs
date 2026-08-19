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
import { normalizeMachinePrincipalDefinition } from './machine-principal.mjs';

export const MACHINE_IDENTITY_CREDENTIAL_SCHEMA = 'axiom-machine-identity-credential.v1';
export const MACHINE_IDENTITY_REVOCATION_SCHEMA = 'axiom-machine-identity-revocation.v1';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const BASE64URL = /^[A-Za-z0-9_-]+$/;
const REASON = /^[a-z][a-z0-9._-]{0,63}$/;
const MACHINE_TYPES = new Set(['agent', 'service']);
const TRANSITIONS = new Set(['initial', 'rotation', 'recovery']);
const DISPOSITIONS = new Set(['retired', 'revoked', 'compromised']);

const CREDENTIAL_KEYS = new Set([
  'schema', 'statement', 'statement_digest', 'issuer_signature', 'credential_digest'
]);
const CREDENTIAL_STATEMENT_KEYS = new Set([
  'principal_id', 'principal_type', 'sponsor',
  'issuer_id', 'issuer_key_id',
  'operational_key_id', 'operational_public_key', 'key_epoch',
  'issued_at', 'valid_from', 'expires_at',
  'transition_kind', 'predecessor_credential_digest', 'predecessor_disposition',
  'principal_definition_digest', 'principal_authority_digest',
  'runtime_id', 'runtime_kind', 'runtime_software_digest',
  'identity_assurance', 'authority_effect', 'delegation_effect',
  'legal_identity_claimed', 'personhood_claimed', 'reputation_claimed',
  'truth_claimed', 'global_currentness_claimed'
]);
const REVOCATION_KEYS = new Set([
  'schema', 'statement', 'statement_digest', 'issuer_signature', 'revocation_digest'
]);
const REVOCATION_STATEMENT_KEYS = new Set([
  'issuer_id', 'issuer_key_id', 'principal_id', 'credential_digest',
  'operational_key_id', 'key_epoch', 'effective_at', 'reason_code',
  'authority_effect', 'delegation_effect', 'legal_identity_claimed',
  'global_currentness_claimed'
]);

function exactKeys(raw, allowed, label) {
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

function timestampValue(value) {
  return new Date(value).valueOf();
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

export function machineIdentityKeyId(value, label = 'machine identity public key') {
  return sha256(canonicalPublicKey(value, label));
}

function issuerSigner(privateKeyValue) {
  const privateKey = parsePrivateKey(privateKeyValue, 'machine identity issuer private key');
  const publicKey = createPublicKey(privateKey);
  return Object.freeze({
    privateKey,
    publicKey,
    keyId: machineIdentityKeyId(publicKey, 'machine identity issuer public key')
  });
}

function signEnvelope({ schema, statement, privateKey, digestField }) {
  const statementDigest = digestObject(statement);
  const signable = Object.freeze({ schema, statement, statement_digest: statementDigest });
  const issuerSignature = sign(
    null,
    Buffer.from(canonicalJson(signable)),
    privateKey
  ).toString('base64url');
  const signed = Object.freeze({
    schema,
    statement,
    statement_digest: statementDigest,
    issuer_signature: issuerSignature
  });
  return Object.freeze({ ...signed, [digestField]: digestObject(signed) });
}

function verifyEnvelope(raw, {
  schema,
  allowedKeys,
  label,
  trustedIssuerPublicKey,
  expectedIssuerKeyId,
  digestField
}) {
  const value = exactKeys(raw, allowedKeys, label);
  if (value.schema !== schema) throw new ValidationError(`${label} schema is unsupported`);
  const statementDigest = digest(value.statement_digest, `${label} statement_digest`);
  if (statementDigest !== digestObject(value.statement)) {
    throw new ValidationError(`${label} statement digest mismatch`);
  }
  const trusted = parsePublicKey(trustedIssuerPublicKey, `trusted ${label} issuer public key`);
  if (machineIdentityKeyId(trusted) !== expectedIssuerKeyId) {
    throw new ValidationError(`${label} issuer key substitution`);
  }
  const signature = assertString(value.issuer_signature, `${label} issuer_signature`, {
    min: 32,
    max: 1024,
    pattern: BASE64URL
  });
  let valid = false;
  try {
    valid = verify(
      null,
      Buffer.from(canonicalJson({ schema, statement: value.statement, statement_digest: statementDigest })),
      trusted,
      Buffer.from(signature, 'base64url')
    );
  } catch {
    valid = false;
  }
  if (!valid) throw new ValidationError(`${label} issuer signature is invalid`);
  const signed = Object.freeze({
    schema,
    statement: value.statement,
    statement_digest: statementDigest,
    issuer_signature: signature
  });
  const objectDigest = digest(value[digestField], `${label} ${digestField}`);
  if (objectDigest !== digestObject(signed)) {
    throw new ValidationError(`${label} ${digestField} mismatch`);
  }
  return Object.freeze({ ...signed, [digestField]: objectDigest });
}

function normalizePrincipalInput(raw, { knownHumanPrincipals = null, now } = {}) {
  const value = assertPlainObject(raw, 'machine principal');
  if (value.schema === 'axiom-machine-principal.v1') {
    const { schema, authority_digest: suppliedAuthorityDigest, ...definition } = value;
    const normalized = normalizeMachinePrincipalDefinition(definition, { knownHumanPrincipals, now });
    if (suppliedAuthorityDigest !== normalized.authority_digest) {
      throw new ValidationError('machine principal authority digest does not match its definition');
    }
    return normalized;
  }
  return normalizeMachinePrincipalDefinition(value, { knownHumanPrincipals, now });
}

function normalizeCredentialStatement(raw) {
  const value = exactKeys(raw, CREDENTIAL_STATEMENT_KEYS, 'machine identity credential statement');
  const principalType = assertString(value.principal_type, 'machine identity credential principal_type', {
    min: 5,
    max: 16
  });
  if (!MACHINE_TYPES.has(principalType)) {
    throw new ValidationError('machine identity credential principal_type must be agent or service');
  }
  const transition = assertString(value.transition_kind, 'machine identity credential transition_kind', {
    min: 7,
    max: 16
  });
  if (!TRANSITIONS.has(transition)) {
    throw new ValidationError('machine identity credential transition_kind is invalid');
  }
  const epoch = positiveInteger(value.key_epoch, 'machine identity credential key_epoch');
  const predecessor = nullableDigest(
    value.predecessor_credential_digest,
    'machine identity credential predecessor_credential_digest'
  );
  const disposition = value.predecessor_disposition === null
    ? null
    : assertString(value.predecessor_disposition, 'machine identity credential predecessor_disposition', {
      min: 7,
      max: 16
    });
  if (disposition !== null && !DISPOSITIONS.has(disposition)) {
    throw new ValidationError('machine identity credential predecessor_disposition is invalid');
  }
  if (epoch === 1) {
    if (transition !== 'initial' || predecessor !== null || disposition !== null) {
      throw new ValidationError('first machine identity credential must be initial without a predecessor');
    }
  } else {
    if (transition === 'initial' || predecessor === null || disposition === null) {
      throw new ValidationError('later machine identity credential requires transition and predecessor');
    }
    if (transition === 'rotation' && disposition !== 'retired') {
      throw new ValidationError('machine identity rotation must retire predecessor');
    }
    if (transition === 'recovery' && !['revoked', 'compromised'].includes(disposition)) {
      throw new ValidationError('machine identity recovery requires revoked or compromised predecessor');
    }
  }

  const operationalPublicKey = canonicalPublicKey(
    value.operational_public_key,
    'machine identity credential operational_public_key'
  );
  const operationalKeyId = digest(value.operational_key_id, 'machine identity credential operational_key_id');
  if (operationalKeyId !== sha256(operationalPublicKey)) {
    throw new ValidationError('machine identity credential operational_key_id does not match public key');
  }

  const issuedAt = canonicalTimestamp(value.issued_at, 'machine identity credential issued_at');
  const validFrom = canonicalTimestamp(value.valid_from, 'machine identity credential valid_from');
  const expiresAt = canonicalTimestamp(value.expires_at, 'machine identity credential expires_at');
  if (timestampValue(issuedAt) > timestampValue(validFrom)) {
    throw new ValidationError('machine identity credential cannot become valid before issuance');
  }
  if (timestampValue(expiresAt) <= timestampValue(validFrom)) {
    throw new ValidationError('machine identity credential expiry must follow valid_from');
  }

  if (
    value.identity_assurance !== 'issuer-key-continuity-only'
    || value.authority_effect !== 'none'
    || value.delegation_effect !== 'none'
    || value.legal_identity_claimed !== false
    || value.personhood_claimed !== false
    || value.reputation_claimed !== false
    || value.truth_claimed !== false
    || value.global_currentness_claimed !== false
  ) {
    throw new ValidationError('machine identity credential widens its identity/non-authority boundary');
  }

  return Object.freeze({
    principal_id: identifier(value.principal_id, 'machine identity credential principal_id'),
    principal_type: principalType,
    sponsor: identifier(value.sponsor, 'machine identity credential sponsor'),
    issuer_id: identifier(value.issuer_id, 'machine identity credential issuer_id'),
    issuer_key_id: digest(value.issuer_key_id, 'machine identity credential issuer_key_id'),
    operational_key_id: operationalKeyId,
    operational_public_key: operationalPublicKey,
    key_epoch: epoch,
    issued_at: issuedAt,
    valid_from: validFrom,
    expires_at: expiresAt,
    transition_kind: transition,
    predecessor_credential_digest: predecessor,
    predecessor_disposition: disposition,
    principal_definition_digest: digest(
      value.principal_definition_digest,
      'machine identity credential principal_definition_digest'
    ),
    principal_authority_digest: digest(
      value.principal_authority_digest,
      'machine identity credential principal_authority_digest'
    ),
    runtime_id: identifier(value.runtime_id, 'machine identity credential runtime_id'),
    runtime_kind: assertString(value.runtime_kind, 'machine identity credential runtime_kind', {
      min: 5,
      max: 32,
      pattern: /^[a-z][a-z0-9-]{0,31}$/
    }),
    runtime_software_digest: value.runtime_software_digest === null
      ? null
      : digest(value.runtime_software_digest, 'machine identity credential runtime_software_digest'),
    identity_assurance: 'issuer-key-continuity-only',
    authority_effect: 'none',
    delegation_effect: 'none',
    legal_identity_claimed: false,
    personhood_claimed: false,
    reputation_claimed: false,
    truth_claimed: false,
    global_currentness_claimed: false
  });
}

export function verifyMachineIdentityCredential(raw, {
  trustedIssuerPublicKey,
  expectedIssuerId,
  expectedPrincipalId,
  expectedPrincipalDefinitionDigest
} = {}) {
  const value = exactKeys(raw, CREDENTIAL_KEYS, 'machine identity credential');
  const statement = normalizeCredentialStatement(value.statement);
  const verified = verifyEnvelope(value, {
    schema: MACHINE_IDENTITY_CREDENTIAL_SCHEMA,
    allowedKeys: CREDENTIAL_KEYS,
    label: 'machine identity credential',
    trustedIssuerPublicKey,
    expectedIssuerKeyId: statement.issuer_key_id,
    digestField: 'credential_digest'
  });
  if (expectedIssuerId !== undefined && statement.issuer_id !== expectedIssuerId) {
    throw new ValidationError('machine identity credential issuer_id mismatch');
  }
  if (expectedPrincipalId !== undefined && statement.principal_id !== expectedPrincipalId) {
    throw new ValidationError('machine identity credential principal_id mismatch');
  }
  if (
    expectedPrincipalDefinitionDigest !== undefined
    && statement.principal_definition_digest !== expectedPrincipalDefinitionDigest
  ) {
    throw new ValidationError('machine identity credential principal definition mismatch');
  }
  return Object.freeze({ ...verified, statement });
}

export function verifyMachineIdentityCredentialHistory(rawHistory, {
  trustedIssuerPublicKey,
  expectedIssuerId,
  expectedPrincipalId,
  expectedPrincipalDefinitionDigest
} = {}) {
  if (!Array.isArray(rawHistory) || rawHistory.length < 1 || rawHistory.length > 256) {
    throw new ValidationError('machine identity credential history must contain 1-256 credentials');
  }
  const history = rawHistory.map(item => verifyMachineIdentityCredential(item, {
    trustedIssuerPublicKey,
    expectedIssuerId,
    expectedPrincipalId,
    expectedPrincipalDefinitionDigest
  }));
  const first = history[0].statement;
  const seenOperationalKeys = new Set();
  for (let index = 0; index < history.length; index += 1) {
    const current = history[index];
    const statement = current.statement;
    if (statement.key_epoch !== index + 1) {
      throw new ValidationError('machine identity credential history epochs must be contiguous from one');
    }
    if (
      statement.principal_id !== first.principal_id
      || statement.principal_type !== first.principal_type
      || statement.sponsor !== first.sponsor
      || statement.issuer_id !== first.issuer_id
      || statement.issuer_key_id !== first.issuer_key_id
      || statement.principal_definition_digest !== first.principal_definition_digest
      || statement.principal_authority_digest !== first.principal_authority_digest
      || statement.runtime_id !== first.runtime_id
      || statement.runtime_kind !== first.runtime_kind
      || statement.runtime_software_digest !== first.runtime_software_digest
    ) {
      throw new ValidationError('machine identity credential history changed bound principal identity');
    }
    if (seenOperationalKeys.has(statement.operational_key_id)) {
      throw new ValidationError('machine identity credential history reuses an operational key');
    }
    seenOperationalKeys.add(statement.operational_key_id);
    if (index === 0) continue;
    const predecessor = history[index - 1];
    if (statement.predecessor_credential_digest !== predecessor.credential_digest) {
      throw new ValidationError('machine identity credential predecessor digest mismatch');
    }
    if (timestampValue(statement.issued_at) < timestampValue(predecessor.statement.issued_at)) {
      throw new ValidationError('machine identity credential issuance time moved backward');
    }
    if (timestampValue(statement.valid_from) <= timestampValue(predecessor.statement.valid_from)) {
      throw new ValidationError('machine identity credential valid_from must advance monotonically');
    }
  }
  return Object.freeze([...history]);
}

export function createMachineIdentityCredential({
  principal,
  issuerId,
  issuerPrivateKey,
  operationalPublicKey,
  keyEpoch,
  issuedAt,
  validFrom,
  expiresAt,
  transitionKind = 'initial',
  predecessorDisposition = null,
  credentialHistory = [],
  knownHumanPrincipals = null
} = {}) {
  const signer = issuerSigner(issuerPrivateKey);
  const issued = canonicalTimestamp(issuedAt, 'machine identity credential issuedAt');
  const normalizedPrincipal = normalizePrincipalInput(principal, {
    knownHumanPrincipals,
    now: new Date(issued)
  });
  const principalDefinitionDigest = digestObject(normalizedPrincipal);
  const epoch = positiveInteger(keyEpoch, 'machine identity credential keyEpoch');
  const operationalPem = canonicalPublicKey(
    operationalPublicKey,
    'machine identity credential operational public key'
  );
  const operationalKeyId = sha256(operationalPem);
  const valid = canonicalTimestamp(validFrom, 'machine identity credential validFrom');
  const expiry = canonicalTimestamp(expiresAt, 'machine identity credential expiresAt');
  if (timestampValue(issued) > timestampValue(valid)) {
    throw new ValidationError('machine identity credential cannot become valid before issuance');
  }
  if (timestampValue(expiry) <= timestampValue(valid)) {
    throw new ValidationError('machine identity credential expiry must follow validFrom');
  }
  if (
    normalizedPrincipal.expires_at
    && timestampValue(expiry) > timestampValue(normalizedPrincipal.expires_at)
  ) {
    throw new ValidationError('machine identity credential cannot outlive its machine principal');
  }

  let predecessor = null;
  if (epoch === 1) {
    if (credentialHistory.length !== 0) {
      throw new ValidationError('initial machine identity credential must not provide credential history');
    }
  } else {
    if (!Array.isArray(credentialHistory) || credentialHistory.length !== epoch - 1) {
      throw new ValidationError('machine identity successor requires complete credential history');
    }
    const history = verifyMachineIdentityCredentialHistory(credentialHistory, {
      trustedIssuerPublicKey: signer.publicKey,
      expectedIssuerId: issuerId,
      expectedPrincipalId: normalizedPrincipal.id,
      expectedPrincipalDefinitionDigest: principalDefinitionDigest
    });
    predecessor = history.at(-1);
    if (history.some(item => item.statement.operational_key_id === operationalKeyId)) {
      throw new ValidationError('machine identity successor must not reuse any prior operational key');
    }
    if (timestampValue(valid) <= timestampValue(predecessor.statement.valid_from)) {
      throw new ValidationError('machine identity successor validFrom must advance monotonically');
    }
  }

  const statement = normalizeCredentialStatement({
    principal_id: normalizedPrincipal.id,
    principal_type: normalizedPrincipal.type,
    sponsor: normalizedPrincipal.sponsor,
    issuer_id: issuerId,
    issuer_key_id: signer.keyId,
    operational_key_id: operationalKeyId,
    operational_public_key: operationalPem,
    key_epoch: epoch,
    issued_at: issued,
    valid_from: valid,
    expires_at: expiry,
    transition_kind: transitionKind,
    predecessor_credential_digest: predecessor ? predecessor.credential_digest : null,
    predecessor_disposition: predecessor ? predecessorDisposition : null,
    principal_definition_digest: principalDefinitionDigest,
    principal_authority_digest: normalizedPrincipal.authority_digest,
    runtime_id: normalizedPrincipal.runtime.id,
    runtime_kind: normalizedPrincipal.runtime.kind,
    runtime_software_digest: normalizedPrincipal.runtime.software_digest ?? null,
    identity_assurance: 'issuer-key-continuity-only',
    authority_effect: 'none',
    delegation_effect: 'none',
    legal_identity_claimed: false,
    personhood_claimed: false,
    reputation_claimed: false,
    truth_claimed: false,
    global_currentness_claimed: false
  });
  return signEnvelope({
    schema: MACHINE_IDENTITY_CREDENTIAL_SCHEMA,
    statement,
    privateKey: signer.privateKey,
    digestField: 'credential_digest'
  });
}

function normalizeRevocationStatement(raw) {
  const value = exactKeys(raw, REVOCATION_STATEMENT_KEYS, 'machine identity revocation statement');
  const reason = assertString(value.reason_code, 'machine identity revocation reason_code', {
    min: 1,
    max: 64,
    pattern: REASON
  });
  if (
    value.authority_effect !== 'none'
    || value.delegation_effect !== 'none'
    || value.legal_identity_claimed !== false
    || value.global_currentness_claimed !== false
  ) {
    throw new ValidationError('machine identity revocation widens its non-authority boundary');
  }
  return Object.freeze({
    issuer_id: identifier(value.issuer_id, 'machine identity revocation issuer_id'),
    issuer_key_id: digest(value.issuer_key_id, 'machine identity revocation issuer_key_id'),
    principal_id: identifier(value.principal_id, 'machine identity revocation principal_id'),
    credential_digest: digest(value.credential_digest, 'machine identity revocation credential_digest'),
    operational_key_id: digest(value.operational_key_id, 'machine identity revocation operational_key_id'),
    key_epoch: positiveInteger(value.key_epoch, 'machine identity revocation key_epoch'),
    effective_at: canonicalTimestamp(value.effective_at, 'machine identity revocation effective_at'),
    reason_code: reason,
    authority_effect: 'none',
    delegation_effect: 'none',
    legal_identity_claimed: false,
    global_currentness_claimed: false
  });
}

export function verifyMachineIdentityRevocation(raw, {
  trustedIssuerPublicKey,
  expectedIssuerId,
  expectedPrincipalId
} = {}) {
  const value = exactKeys(raw, REVOCATION_KEYS, 'machine identity revocation');
  const statement = normalizeRevocationStatement(value.statement);
  const verified = verifyEnvelope(value, {
    schema: MACHINE_IDENTITY_REVOCATION_SCHEMA,
    allowedKeys: REVOCATION_KEYS,
    label: 'machine identity revocation',
    trustedIssuerPublicKey,
    expectedIssuerKeyId: statement.issuer_key_id,
    digestField: 'revocation_digest'
  });
  if (expectedIssuerId !== undefined && statement.issuer_id !== expectedIssuerId) {
    throw new ValidationError('machine identity revocation issuer_id mismatch');
  }
  if (expectedPrincipalId !== undefined && statement.principal_id !== expectedPrincipalId) {
    throw new ValidationError('machine identity revocation principal_id mismatch');
  }
  return Object.freeze({ ...verified, statement });
}

export function createMachineIdentityRevocation({
  credential,
  issuerPrivateKey,
  effectiveAt,
  reasonCode
} = {}) {
  const signer = issuerSigner(issuerPrivateKey);
  const verifiedCredential = verifyMachineIdentityCredential(credential, {
    trustedIssuerPublicKey: signer.publicKey
  });
  const effective = canonicalTimestamp(effectiveAt, 'machine identity revocation effectiveAt');
  if (timestampValue(effective) < timestampValue(verifiedCredential.statement.issued_at)) {
    throw new ValidationError('machine identity revocation cannot predate credential issuance');
  }
  const statement = normalizeRevocationStatement({
    issuer_id: verifiedCredential.statement.issuer_id,
    issuer_key_id: signer.keyId,
    principal_id: verifiedCredential.statement.principal_id,
    credential_digest: verifiedCredential.credential_digest,
    operational_key_id: verifiedCredential.statement.operational_key_id,
    key_epoch: verifiedCredential.statement.key_epoch,
    effective_at: effective,
    reason_code: reasonCode,
    authority_effect: 'none',
    delegation_effect: 'none',
    legal_identity_claimed: false,
    global_currentness_claimed: false
  });
  return signEnvelope({
    schema: MACHINE_IDENTITY_REVOCATION_SCHEMA,
    statement,
    privateKey: signer.privateKey,
    digestField: 'revocation_digest'
  });
}

export function evaluateMachineIdentityCurrentness({
  credentialHistory,
  revocations = [],
  trustedIssuerPublicKey,
  at
} = {}) {
  const history = verifyMachineIdentityCredentialHistory(credentialHistory, {
    trustedIssuerPublicKey
  });
  if (!Array.isArray(revocations) || revocations.length > 256) {
    throw new ValidationError('machine identity revocations must be an array with at most 256 items');
  }
  const when = canonicalTimestamp(at, 'machine identity currentness at');
  const verifiedRevocations = revocations.map(item => verifyMachineIdentityRevocation(item, {
    trustedIssuerPublicKey,
    expectedIssuerId: history[0].statement.issuer_id,
    expectedPrincipalId: history[0].statement.principal_id
  }));
  const credentialDigests = new Set(history.map(item => item.credential_digest));
  for (const revocation of verifiedRevocations) {
    if (!credentialDigests.has(revocation.statement.credential_digest)) {
      throw new ValidationError('machine identity revocation references credential outside supplied history');
    }
    const credential = history[revocation.statement.key_epoch - 1];
    if (
      !credential
      || credential.credential_digest !== revocation.statement.credential_digest
      || credential.statement.operational_key_id !== revocation.statement.operational_key_id
    ) {
      throw new ValidationError('machine identity revocation credential binding mismatch');
    }
  }

  const whenMs = timestampValue(when);
  const started = history.filter(item => timestampValue(item.statement.valid_from) <= whenMs);
  const base = {
    schema: 'axiom-machine-identity-currentness.v1',
    principal_id: history[0].statement.principal_id,
    issuer_id: history[0].statement.issuer_id,
    evaluated_at: when,
    evidence_scope: 'supplied-issuer-evidence-only',
    global_currentness_claimed: false,
    authority_effect: 'none',
    delegation_effect: 'none'
  };
  if (!started.length) {
    return Object.freeze({ ...base, status: 'not-yet-valid', credential_digest: null, key_epoch: null });
  }
  const current = started.at(-1);
  if (whenMs >= timestampValue(current.statement.expires_at)) {
    return Object.freeze({
      ...base,
      status: 'expired',
      credential_digest: current.credential_digest,
      key_epoch: current.statement.key_epoch
    });
  }
  const activeRevocation = verifiedRevocations.find(item => (
    item.statement.credential_digest === current.credential_digest
    && timestampValue(item.statement.effective_at) <= whenMs
  ));
  if (activeRevocation) {
    return Object.freeze({
      ...base,
      status: 'revoked',
      credential_digest: current.credential_digest,
      key_epoch: current.statement.key_epoch,
      revocation_digest: activeRevocation.revocation_digest,
      reason_code: activeRevocation.statement.reason_code
    });
  }
  return Object.freeze({
    ...base,
    status: 'active',
    credential_digest: current.credential_digest,
    key_epoch: current.statement.key_epoch,
    operational_key_id: current.statement.operational_key_id,
    principal_definition_digest: current.statement.principal_definition_digest,
    principal_authority_digest: current.statement.principal_authority_digest
  });
}
