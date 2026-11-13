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

export const MACHINE_IDENTITY_CORE_CREDENTIAL_SCHEMA = 'axiom-machine-identity-core-credential.v1';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const BASE64URL = /^[A-Za-z0-9_-]+$/;
const MACHINE_TYPES = new Set(['agent', 'service']);
const TRANSITIONS = new Set(['initial', 'rotation', 'recovery']);
const DISPOSITIONS = new Set(['retired', 'revoked', 'compromised']);

const CREDENTIAL_KEYS = new Set([
  'schema',
  'statement',
  'statement_digest',
  'issuer_signature',
  'credential_digest'
]);

const STATEMENT_KEYS = new Set([
  'principal_id',
  'principal_type',
  'issuer_id',
  'issuer_key_id',
  'operational_key_id',
  'operational_public_key',
  'key_epoch',
  'issued_at',
  'valid_from',
  'expires_at',
  'transition_kind',
  'predecessor_credential_digest',
  'predecessor_disposition',
  'identity_assurance',
  'authority_effect',
  'delegation_effect',
  'legal_identity_claimed',
  'personhood_claimed',
  'reputation_claimed',
  'truth_claimed',
  'global_currentness_claimed'
]);

function exactKeys(raw, allowed, label) {
  const value = assertPlainObject(raw, label);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new ValidationError(`${label} contains unsupported field ${key}`);
    }
  }
  return value;
}

function identifier(value, label) {
  return assertString(value, label, { min: 1, max: 192, pattern: ID });
}

function digest(value, label) {
  return assertString(value, label, { min: 64, max: 64, pattern: DIGEST });
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

function parsePrivateKey(value, label) {
  let key;
  try {
    key = value && typeof value === 'object' && value.type === 'private'
      ? value
      : createPrivateKey(value);
  } catch {
    throw new ValidationError(`${label} is invalid`);
  }
  if (key.asymmetricKeyType !== 'ed25519') {
    throw new ValidationError(`${label} must be Ed25519`);
  }
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
  if (key.asymmetricKeyType !== 'ed25519') {
    throw new ValidationError(`${label} must be Ed25519`);
  }
  return key;
}

function canonicalPublicKey(value, label) {
  return parsePublicKey(value, label)
    .export({ type: 'spki', format: 'pem' })
    .toString();
}

export function machineIdentityCoreKeyId(value, label = 'machine identity core public key') {
  return sha256(canonicalPublicKey(value, label));
}

function normalizeStatement(raw) {
  const value = exactKeys(raw, STATEMENT_KEYS, 'machine identity core credential statement');
  const principalType = assertString(
    value.principal_type,
    'machine identity core credential principal_type',
    { min: 5, max: 16 }
  );
  if (!MACHINE_TYPES.has(principalType)) {
    throw new ValidationError('machine identity core credential principal_type must be agent or service');
  }

  const epoch = positiveInteger(value.key_epoch, 'machine identity core credential key_epoch');
  const transition = assertString(
    value.transition_kind,
    'machine identity core credential transition_kind',
    { min: 7, max: 16 }
  );
  if (!TRANSITIONS.has(transition)) {
    throw new ValidationError('machine identity core credential transition_kind is invalid');
  }

  const predecessor = value.predecessor_credential_digest === null
    ? null
    : digest(
      value.predecessor_credential_digest,
      'machine identity core credential predecessor_credential_digest'
    );
  const disposition = value.predecessor_disposition === null
    ? null
    : assertString(
      value.predecessor_disposition,
      'machine identity core credential predecessor_disposition',
      { min: 7, max: 16 }
    );
  if (disposition !== null && !DISPOSITIONS.has(disposition)) {
    throw new ValidationError('machine identity core credential predecessor_disposition is invalid');
  }

  if (epoch === 1) {
    if (transition !== 'initial' || predecessor !== null || disposition !== null) {
      throw new ValidationError(
        'first machine identity core credential must be initial without a predecessor'
      );
    }
  } else {
    if (transition === 'initial' || predecessor === null || disposition === null) {
      throw new ValidationError(
        'later machine identity core credential requires transition and predecessor'
      );
    }
    if (transition === 'rotation' && disposition !== 'retired') {
      throw new ValidationError('machine identity core rotation must retire predecessor');
    }
    if (transition === 'recovery' && !['revoked', 'compromised'].includes(disposition)) {
      throw new ValidationError(
        'machine identity core recovery requires revoked or compromised predecessor'
      );
    }
  }

  const operationalPublicKey = canonicalPublicKey(
    value.operational_public_key,
    'machine identity core credential operational_public_key'
  );
  const operationalKeyId = digest(
    value.operational_key_id,
    'machine identity core credential operational_key_id'
  );
  if (operationalKeyId !== sha256(operationalPublicKey)) {
    throw new ValidationError(
      'machine identity core credential operational_key_id does not match public key'
    );
  }

  const issuedAt = canonicalTimestamp(
    value.issued_at,
    'machine identity core credential issued_at'
  );
  const validFrom = canonicalTimestamp(
    value.valid_from,
    'machine identity core credential valid_from'
  );
  const expiresAt = canonicalTimestamp(
    value.expires_at,
    'machine identity core credential expires_at'
  );
  if (new Date(issuedAt).valueOf() > new Date(validFrom).valueOf()) {
    throw new ValidationError(
      'machine identity core credential cannot become valid before issuance'
    );
  }
  if (new Date(expiresAt).valueOf() <= new Date(validFrom).valueOf()) {
    throw new ValidationError(
      'machine identity core credential expiry must follow valid_from'
    );
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
    throw new ValidationError(
      'machine identity core credential widens its identity/non-authority boundary'
    );
  }

  return Object.freeze({
    principal_id: identifier(
      value.principal_id,
      'machine identity core credential principal_id'
    ),
    principal_type: principalType,
    issuer_id: identifier(
      value.issuer_id,
      'machine identity core credential issuer_id'
    ),
    issuer_key_id: digest(
      value.issuer_key_id,
      'machine identity core credential issuer_key_id'
    ),
    operational_key_id: operationalKeyId,
    operational_public_key: operationalPublicKey,
    key_epoch: epoch,
    issued_at: issuedAt,
    valid_from: validFrom,
    expires_at: expiresAt,
    transition_kind: transition,
    predecessor_credential_digest: predecessor,
    predecessor_disposition: disposition,
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

function signCredential(statement, privateKey) {
  const statementDigest = digestObject(statement);
  const signable = Object.freeze({
    schema: MACHINE_IDENTITY_CORE_CREDENTIAL_SCHEMA,
    statement,
    statement_digest: statementDigest
  });
  const issuerSignature = sign(
    null,
    Buffer.from(canonicalJson(signable)),
    privateKey
  ).toString('base64url');
  const signed = Object.freeze({
    ...signable,
    issuer_signature: issuerSignature
  });
  return Object.freeze({
    ...signed,
    credential_digest: digestObject(signed)
  });
}

export function verifyMachineIdentityCoreCredential(raw, {
  trustedIssuerPublicKey,
  expectedIssuerId,
  expectedPrincipalId
} = {}) {
  const value = exactKeys(raw, CREDENTIAL_KEYS, 'machine identity core credential');
  if (value.schema !== MACHINE_IDENTITY_CORE_CREDENTIAL_SCHEMA) {
    throw new ValidationError('machine identity core credential schema is unsupported');
  }
  const statement = normalizeStatement(value.statement);
  const statementDigest = digest(
    value.statement_digest,
    'machine identity core credential statement_digest'
  );
  if (statementDigest !== digestObject(statement)) {
    throw new ValidationError('machine identity core credential statement digest mismatch');
  }

  const trusted = parsePublicKey(
    trustedIssuerPublicKey,
    'trusted machine identity core issuer public key'
  );
  if (machineIdentityCoreKeyId(trusted) !== statement.issuer_key_id) {
    throw new ValidationError('machine identity core credential issuer key substitution');
  }

  const signature = assertString(
    value.issuer_signature,
    'machine identity core credential issuer_signature',
    { min: 32, max: 1024, pattern: BASE64URL }
  );
  let valid = false;
  try {
    valid = verify(
      null,
      Buffer.from(canonicalJson({
        schema: MACHINE_IDENTITY_CORE_CREDENTIAL_SCHEMA,
        statement,
        statement_digest: statementDigest
      })),
      trusted,
      Buffer.from(signature, 'base64url')
    );
  } catch {
    valid = false;
  }
  if (!valid) {
    throw new ValidationError('machine identity core credential issuer signature is invalid');
  }

  const signed = Object.freeze({
    schema: MACHINE_IDENTITY_CORE_CREDENTIAL_SCHEMA,
    statement,
    statement_digest: statementDigest,
    issuer_signature: signature
  });
  const credentialDigest = digest(
    value.credential_digest,
    'machine identity core credential credential_digest'
  );
  if (credentialDigest !== digestObject(signed)) {
    throw new ValidationError('machine identity core credential credential_digest mismatch');
  }
  if (expectedIssuerId !== undefined && statement.issuer_id !== expectedIssuerId) {
    throw new ValidationError('machine identity core credential issuer_id mismatch');
  }
  if (expectedPrincipalId !== undefined && statement.principal_id !== expectedPrincipalId) {
    throw new ValidationError('machine identity core credential principal_id mismatch');
  }

  return Object.freeze({ ...signed, credential_digest: credentialDigest });
}

export function verifyMachineIdentityCoreCredentialHistory(rawHistory, {
  trustedIssuerPublicKey,
  expectedIssuerId,
  expectedPrincipalId
} = {}) {
  if (!Array.isArray(rawHistory) || rawHistory.length < 1 || rawHistory.length > 256) {
    throw new ValidationError(
      'machine identity core credential history must contain 1-256 credentials'
    );
  }
  const history = rawHistory.map(item => verifyMachineIdentityCoreCredential(item, {
    trustedIssuerPublicKey,
    expectedIssuerId,
    expectedPrincipalId
  }));
  const first = history[0].statement;
  const seenOperationalKeys = new Set();

  for (let index = 0; index < history.length; index += 1) {
    const current = history[index];
    const statement = current.statement;
    if (statement.key_epoch !== index + 1) {
      throw new ValidationError(
        'machine identity core credential history epochs must be contiguous from one'
      );
    }
    if (
      statement.principal_id !== first.principal_id
      || statement.principal_type !== first.principal_type
      || statement.issuer_id !== first.issuer_id
      || statement.issuer_key_id !== first.issuer_key_id
    ) {
      throw new ValidationError(
        'machine identity core credential history changed stable principal identity'
      );
    }
    if (seenOperationalKeys.has(statement.operational_key_id)) {
      throw new ValidationError(
        'machine identity core credential history reuses an operational key'
      );
    }
    seenOperationalKeys.add(statement.operational_key_id);

    if (index === 0) continue;
    const predecessor = history[index - 1];
    if (statement.predecessor_credential_digest !== predecessor.credential_digest) {
      throw new ValidationError(
        'machine identity core credential history predecessor digest mismatch'
      );
    }
    if (
      new Date(statement.valid_from).valueOf()
      <= new Date(predecessor.statement.valid_from).valueOf()
    ) {
      throw new ValidationError(
        'machine identity core credential history valid_from must increase monotonically'
      );
    }
  }

  return Object.freeze(history);
}

export function createMachineIdentityCoreCredential({
  principalId,
  principalType,
  issuerId,
  issuerPrivateKey,
  operationalPublicKey,
  keyEpoch,
  issuedAt,
  validFrom,
  expiresAt,
  transitionKind,
  predecessorDisposition = null,
  predecessorCredentialDigest = null,
  credentialHistory = null
} = {}) {
  const privateKey = parsePrivateKey(
    issuerPrivateKey,
    'machine identity core issuer private key'
  );
  const issuerPublicKey = createPublicKey(privateKey);
  const epoch = positiveInteger(keyEpoch, 'machine identity core keyEpoch');
  let transition = transitionKind ?? (epoch === 1 ? 'initial' : null);
  let predecessor = predecessorCredentialDigest;
  let disposition = predecessorDisposition;

  if (credentialHistory !== null) {
    const history = verifyMachineIdentityCoreCredentialHistory(credentialHistory, {
      trustedIssuerPublicKey: issuerPublicKey,
      expectedIssuerId: issuerId,
      expectedPrincipalId: principalId
    });
    if (epoch !== history.length + 1) {
      throw new ValidationError(
        'machine identity core successor must use the next key epoch'
      );
    }
    predecessor = history.at(-1).credential_digest;
    const newOperationalKeyId = machineIdentityCoreKeyId(operationalPublicKey);
    if (history.some(item => item.statement.operational_key_id === newOperationalKeyId)) {
      throw new ValidationError(
        'machine identity core successor must not reuse any prior operational key'
      );
    }
  }

  if (epoch > 1 && transition === null) {
    throw new ValidationError(
      'machine identity core successor requires an explicit transition kind'
    );
  }

  const operationalPem = canonicalPublicKey(
    operationalPublicKey,
    'machine identity core operational public key'
  );
  const statement = normalizeStatement({
    principal_id: principalId,
    principal_type: principalType,
    issuer_id: issuerId,
    issuer_key_id: machineIdentityCoreKeyId(issuerPublicKey),
    operational_key_id: sha256(operationalPem),
    operational_public_key: operationalPem,
    key_epoch: epoch,
    issued_at: issuedAt,
    valid_from: validFrom,
    expires_at: expiresAt,
    transition_kind: transition,
    predecessor_credential_digest: predecessor,
    predecessor_disposition: disposition,
    identity_assurance: 'issuer-key-continuity-only',
    authority_effect: 'none',
    delegation_effect: 'none',
    legal_identity_claimed: false,
    personhood_claimed: false,
    reputation_claimed: false,
    truth_claimed: false,
    global_currentness_claimed: false
  });

  return signCredential(statement, privateKey);
}
