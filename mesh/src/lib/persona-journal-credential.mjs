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
import {
  SOCIAL_PUBLICATION_SCHEMA,
  SOCIAL_PUBLICATION_TRANSITION_SCHEMA,
  validateSocialPublicationProjection,
  validateSocialPublicationRetraction
} from './social-publication.mjs';

export const PERSONA_SIGNING_CREDENTIAL_SCHEMA = 'axiom-persona-signing-credential.v1';
export const PERSONA_SIGNING_REVOCATION_SCHEMA = 'axiom-persona-signing-revocation.v1';
export const CREDENTIALED_PUBLIC_JOURNAL_ATTESTATION_SCHEMA = 'axiom-social-public-journal-attestation.v2';

const DIGEST = /^[a-f0-9]{64}$/;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$/;
const REASON = /^[a-z][a-z0-9._-]{0,63}$/;
const BASE64URL = /^[A-Za-z0-9_-]+$/;
const MAX_SEQUENCE = Number.MAX_SAFE_INTEGER;

const CREDENTIAL_KEYS = new Set([
  'schema',
  'statement',
  'statement_digest',
  'root_signature',
  'credential_digest'
]);
const CREDENTIAL_STATEMENT_KEYS = new Set([
  'persona_id',
  'persona_projection_digest',
  'root_key_id',
  'signing_key_id',
  'signing_public_key',
  'epoch',
  'activated_at',
  'transition_kind',
  'predecessor_credential_digest',
  'predecessor_disposition',
  'controller_identity_disclosed',
  'legal_identity_claimed',
  'authority_effect',
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
  'persona_id',
  'persona_projection_digest',
  'root_key_id',
  'credential_digest',
  'signing_key_id',
  'epoch',
  'effective_at',
  'reason_code',
  'controller_identity_disclosed',
  'legal_identity_claimed',
  'authority_effect',
  'network_effect'
]);
const JOURNAL_KEYS = new Set([
  'schema',
  'statement',
  'statement_digest',
  'signature',
  'attestation_digest'
]);
const JOURNAL_STATEMENT_KEYS = new Set([
  'entry_type',
  'entry_schema',
  'entry_digest',
  'persona_id',
  'persona_projection_digest',
  'persona_root_key_id',
  'persona_credential_digest',
  'persona_key_id',
  'persona_key_epoch',
  'sequence',
  'previous_attestation_digest',
  'issued_at',
  'public_audience',
  'content_truth_claimed',
  'authorship_claimed',
  'legal_identity_claimed',
  'authority_effect',
  'network_effect'
]);

function assertExactKeys(value, allowed, label) {
  for (const key of Object.keys(assertPlainObject(value, label))) {
    if (!allowed.has(key)) {
      throw new ValidationError(`${label} contains unsupported field ${key}`);
    }
  }
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
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_SEQUENCE) {
    throw new ValidationError(`${label} must be a positive safe integer`);
  }
  return value;
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

function canonicalPublicKeyPem(value, label) {
  const key = parsePublicKey(value, label);
  return key.export({ type: 'spki', format: 'pem' }).toString();
}

function publicKeyId(value, label = 'public key') {
  return sha256(canonicalPublicKeyPem(value, label));
}

function rootSigner(privateKeyValue) {
  const privateKey = parsePrivateKey(privateKeyValue, 'persona root private key');
  const publicKey = createPublicKey(privateKey);
  return {
    privateKey,
    publicKey,
    keyId: publicKeyId(publicKey, 'persona root public key')
  };
}

function operationalSigner(privateKeyValue) {
  const privateKey = parsePrivateKey(privateKeyValue, 'persona journal private key');
  const publicKey = createPublicKey(privateKey);
  return {
    privateKey,
    publicKey,
    keyId: publicKeyId(publicKey, 'persona journal public key')
  };
}

function signEnvelope({ schema, statement, privateKey, signatureField, digestField }) {
  const statementDigest = digestObject(statement);
  const signable = Object.freeze({ schema, statement, statement_digest: statementDigest });
  const signature = sign(
    null,
    Buffer.from(canonicalJson(signable)),
    privateKey
  ).toString('base64url');
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
  trustedPublicKey,
  expectedKeyId,
  signatureField,
  digestField
}) {
  const value = assertPlainObject(raw, label);
  assertExactKeys(value, keys, label);
  if (value.schema !== schema) throw new ValidationError(`${label} schema is unsupported`);
  const statementDigest = digest(value.statement_digest, `${label} statement_digest`);
  if (statementDigest !== digestObject(value.statement)) {
    throw new ValidationError(`${label} statement digest does not match canonical content`);
  }
  const signature = assertString(value[signatureField], `${label} ${signatureField}`, {
    min: 32,
    max: 1024,
    pattern: BASE64URL
  });
  const publicKey = parsePublicKey(trustedPublicKey, `trusted ${label} public key`);
  if (publicKeyId(publicKey, `trusted ${label} public key`) !== expectedKeyId) {
    throw new ValidationError(`${label} signing key does not match the trusted public key`);
  }
  let valid = false;
  try {
    valid = verify(
      null,
      Buffer.from(canonicalJson({ schema, statement: value.statement, statement_digest: statementDigest })),
      publicKey,
      Buffer.from(signature, 'base64url')
    );
  } catch {
    valid = false;
  }
  if (!valid) throw new ValidationError(`${label} signature is invalid`);
  const signed = Object.freeze({
    schema,
    statement: value.statement,
    statement_digest: statementDigest,
    [signatureField]: signature
  });
  const objectDigest = digest(value[digestField], `${label} ${digestField}`);
  if (objectDigest !== digestObject(signed)) {
    throw new ValidationError(`${label} ${digestField} does not match canonical signed content`);
  }
  return Object.freeze({ ...signed, [digestField]: objectDigest });
}

function normalizeCredentialStatement(raw) {
  const value = assertPlainObject(raw, 'persona signing credential statement');
  assertExactKeys(value, CREDENTIAL_STATEMENT_KEYS, 'persona signing credential statement');
  const epoch = positiveInteger(value.epoch, 'persona signing credential epoch');
  const transitionKind = assertString(value.transition_kind, 'persona signing credential transition_kind');
  if (!['initial', 'rotation', 'recovery'].includes(transitionKind)) {
    throw new ValidationError('persona signing credential transition_kind is invalid');
  }
  const predecessor = nullableDigest(
    value.predecessor_credential_digest,
    'persona signing credential predecessor_credential_digest'
  );
  const disposition = value.predecessor_disposition === null
    ? null
    : assertString(value.predecessor_disposition, 'persona signing credential predecessor_disposition');
  if (disposition !== null && !['retired', 'revoked', 'compromised'].includes(disposition)) {
    throw new ValidationError('persona signing credential predecessor_disposition is invalid');
  }
  if (epoch === 1) {
    if (transitionKind !== 'initial' || predecessor !== null || disposition !== null) {
      throw new ValidationError('first persona signing credential must be an initial credential without a predecessor');
    }
  } else {
    if (transitionKind === 'initial' || predecessor === null || disposition === null) {
      throw new ValidationError('later persona signing credentials require a transition and predecessor');
    }
    if (transitionKind === 'rotation' && disposition !== 'retired') {
      throw new ValidationError('rotation must retire the predecessor credential');
    }
    if (transitionKind === 'recovery' && !['revoked', 'compromised'].includes(disposition)) {
      throw new ValidationError('recovery requires a revoked or compromised predecessor credential');
    }
  }
  if (value.controller_identity_disclosed !== false || value.legal_identity_claimed !== false) {
    throw new ValidationError('persona signing credential cannot disclose controller identity or claim legal identity');
  }
  if (value.authority_effect !== 'none' || value.network_effect !== 'none') {
    throw new ValidationError('persona signing credential cannot perform authority or network effects');
  }
  const signingPublicKey = canonicalPublicKeyPem(
    value.signing_public_key,
    'persona signing credential signing_public_key'
  );
  const signingKeyId = digest(value.signing_key_id, 'persona signing credential signing_key_id');
  if (signingKeyId !== sha256(signingPublicKey)) {
    throw new ValidationError('persona signing credential signing_key_id does not match signing_public_key');
  }
  return Object.freeze({
    persona_id: identifier(value.persona_id, 'persona signing credential persona_id'),
    persona_projection_digest: digest(
      value.persona_projection_digest,
      'persona signing credential persona_projection_digest'
    ),
    root_key_id: digest(value.root_key_id, 'persona signing credential root_key_id'),
    signing_key_id: signingKeyId,
    signing_public_key: signingPublicKey,
    epoch,
    activated_at: canonicalTimestamp(value.activated_at, 'persona signing credential activated_at'),
    transition_kind: transitionKind,
    predecessor_credential_digest: predecessor,
    predecessor_disposition: disposition,
    controller_identity_disclosed: false,
    legal_identity_claimed: false,
    authority_effect: 'none',
    network_effect: 'none'
  });
}

export function createPersonaSigningCredential({
  personaId,
  personaProjectionDigest,
  personaRootPrivateKey,
  signingPublicKey,
  epoch,
  activatedAt,
  transitionKind = 'initial',
  predecessorCredential = null,
  predecessorDisposition = null
} = {}) {
  const root = rootSigner(personaRootPrivateKey);
  const signingPem = canonicalPublicKeyPem(signingPublicKey, 'persona signing public key');
  let predecessor = null;
  if (predecessorCredential !== null) {
    predecessor = verifyPersonaSigningCredential(predecessorCredential, {
      trustedPersonaRootPublicKey: root.publicKey,
      expectedPersonaId: personaId,
      expectedPersonaProjectionDigest: personaProjectionDigest
    });
  }
  const normalizedEpoch = positiveInteger(epoch, 'persona signing credential epoch');
  if ((normalizedEpoch === 1) !== (predecessor === null)) {
    throw new ValidationError('persona signing credential epoch and predecessor relationship is invalid');
  }
  if (predecessor) {
    if (normalizedEpoch !== predecessor.statement.epoch + 1) {
      throw new ValidationError('persona signing credential epoch must advance by one');
    }
    const activation = canonicalTimestamp(activatedAt, 'persona signing credential activated_at');
    if (activation <= predecessor.statement.activated_at) {
      throw new ValidationError('persona signing credential activation must advance monotonically');
    }
  }
  const statement = normalizeCredentialStatement({
    persona_id: personaId,
    persona_projection_digest: personaProjectionDigest,
    root_key_id: root.keyId,
    signing_key_id: sha256(signingPem),
    signing_public_key: signingPem,
    epoch: normalizedEpoch,
    activated_at: activatedAt,
    transition_kind: transitionKind,
    predecessor_credential_digest: predecessor ? predecessor.credential_digest : null,
    predecessor_disposition: predecessor ? predecessorDisposition : null,
    controller_identity_disclosed: false,
    legal_identity_claimed: false,
    authority_effect: 'none',
    network_effect: 'none'
  });
  return signEnvelope({
    schema: PERSONA_SIGNING_CREDENTIAL_SCHEMA,
    statement,
    privateKey: root.privateKey,
    signatureField: 'root_signature',
    digestField: 'credential_digest'
  });
}

export function verifyPersonaSigningCredential(raw, {
  trustedPersonaRootPublicKey,
  expectedPersonaId,
  expectedPersonaProjectionDigest
} = {}) {
  const value = assertPlainObject(raw, 'persona signing credential');
  const statement = normalizeCredentialStatement(value.statement);
  const verified = verifyEnvelope(value, {
    schema: PERSONA_SIGNING_CREDENTIAL_SCHEMA,
    keys: CREDENTIAL_KEYS,
    label: 'persona signing credential',
    trustedPublicKey: trustedPersonaRootPublicKey,
    expectedKeyId: statement.root_key_id,
    signatureField: 'root_signature',
    digestField: 'credential_digest'
  });
  if (expectedPersonaId !== undefined && statement.persona_id !== expectedPersonaId) {
    throw new ValidationError('persona signing credential belongs to a different persona');
  }
  if (
    expectedPersonaProjectionDigest !== undefined
    && statement.persona_projection_digest !== expectedPersonaProjectionDigest
  ) {
    throw new ValidationError('persona signing credential belongs to a different persona projection');
  }
  return Object.freeze({ ...verified, statement });
}

export function validatePersonaSigningCredentialTransition(previousRaw, currentRaw, {
  trustedPersonaRootPublicKey
} = {}) {
  const previous = verifyPersonaSigningCredential(previousRaw, { trustedPersonaRootPublicKey });
  const current = verifyPersonaSigningCredential(currentRaw, { trustedPersonaRootPublicKey });
  if (
    current.statement.persona_id !== previous.statement.persona_id
    || current.statement.persona_projection_digest !== previous.statement.persona_projection_digest
    || current.statement.root_key_id !== previous.statement.root_key_id
  ) {
    throw new ValidationError('persona signing credential transition cannot cross persona or root bindings');
  }
  if (current.statement.epoch !== previous.statement.epoch + 1) {
    throw new ValidationError('persona signing credential transition must advance exactly one epoch');
  }
  if (current.statement.predecessor_credential_digest !== previous.credential_digest) {
    throw new ValidationError('persona signing credential predecessor digest is invalid');
  }
  if (current.statement.activated_at <= previous.statement.activated_at) {
    throw new ValidationError('persona signing credential transition must advance activation time');
  }
  return Object.freeze({
    valid: true,
    persona_id: current.statement.persona_id,
    persona_projection_digest: current.statement.persona_projection_digest,
    root_key_id: current.statement.root_key_id,
    previous_epoch: previous.statement.epoch,
    current_epoch: current.statement.epoch,
    transition_kind: current.statement.transition_kind,
    predecessor_disposition: current.statement.predecessor_disposition,
    previous_credential_digest: previous.credential_digest,
    current_credential_digest: current.credential_digest
  });
}

export function validatePersonaSigningCredentialPath(credentials, {
  trustedPersonaRootPublicKey
} = {}) {
  if (!Array.isArray(credentials) || credentials.length < 1 || credentials.length > 128) {
    throw new ValidationError('persona signing credential path requires 1-128 credentials');
  }
  const verified = credentials.map(credential => verifyPersonaSigningCredential(credential, {
    trustedPersonaRootPublicKey
  }));
  for (let index = 1; index < verified.length; index += 1) {
    validatePersonaSigningCredentialTransition(verified[index - 1], verified[index], {
      trustedPersonaRootPublicKey
    });
  }
  return Object.freeze({
    valid: true,
    persona_id: verified[0].statement.persona_id,
    root_key_id: verified[0].statement.root_key_id,
    first_epoch: verified[0].statement.epoch,
    last_epoch: verified.at(-1).statement.epoch,
    credentials: verified.length,
    first_credential_digest: verified[0].credential_digest,
    last_credential_digest: verified.at(-1).credential_digest
  });
}

function normalizeRevocationStatement(raw) {
  const value = assertPlainObject(raw, 'persona signing revocation statement');
  assertExactKeys(value, REVOCATION_STATEMENT_KEYS, 'persona signing revocation statement');
  if (value.controller_identity_disclosed !== false || value.legal_identity_claimed !== false) {
    throw new ValidationError('persona signing revocation cannot disclose controller identity or claim legal identity');
  }
  if (value.authority_effect !== 'none' || value.network_effect !== 'none') {
    throw new ValidationError('persona signing revocation cannot perform authority or network effects');
  }
  return Object.freeze({
    persona_id: identifier(value.persona_id, 'persona signing revocation persona_id'),
    persona_projection_digest: digest(
      value.persona_projection_digest,
      'persona signing revocation persona_projection_digest'
    ),
    root_key_id: digest(value.root_key_id, 'persona signing revocation root_key_id'),
    credential_digest: digest(value.credential_digest, 'persona signing revocation credential_digest'),
    signing_key_id: digest(value.signing_key_id, 'persona signing revocation signing_key_id'),
    epoch: positiveInteger(value.epoch, 'persona signing revocation epoch'),
    effective_at: canonicalTimestamp(value.effective_at, 'persona signing revocation effective_at'),
    reason_code: assertString(value.reason_code, 'persona signing revocation reason_code', {
      min: 1,
      max: 64,
      pattern: REASON
    }),
    controller_identity_disclosed: false,
    legal_identity_claimed: false,
    authority_effect: 'none',
    network_effect: 'none'
  });
}

export function createPersonaSigningRevocation(credentialRaw, {
  trustedPersonaRootPublicKey,
  personaRootPrivateKey,
  effectiveAt,
  reasonCode
} = {}) {
  const root = rootSigner(personaRootPrivateKey);
  const trustedRoot = parsePublicKey(trustedPersonaRootPublicKey, 'trusted persona root public key');
  if (publicKeyId(trustedRoot) !== root.keyId) {
    throw new ValidationError('persona root private key does not match trusted persona root public key');
  }
  const credential = verifyPersonaSigningCredential(credentialRaw, {
    trustedPersonaRootPublicKey: trustedRoot
  });
  const effective = canonicalTimestamp(effectiveAt, 'persona signing revocation effective_at');
  if (effective < credential.statement.activated_at) {
    throw new ValidationError('persona signing revocation cannot predate credential activation');
  }
  const statement = normalizeRevocationStatement({
    persona_id: credential.statement.persona_id,
    persona_projection_digest: credential.statement.persona_projection_digest,
    root_key_id: credential.statement.root_key_id,
    credential_digest: credential.credential_digest,
    signing_key_id: credential.statement.signing_key_id,
    epoch: credential.statement.epoch,
    effective_at: effective,
    reason_code: reasonCode,
    controller_identity_disclosed: false,
    legal_identity_claimed: false,
    authority_effect: 'none',
    network_effect: 'none'
  });
  return signEnvelope({
    schema: PERSONA_SIGNING_REVOCATION_SCHEMA,
    statement,
    privateKey: root.privateKey,
    signatureField: 'root_signature',
    digestField: 'revocation_digest'
  });
}

export function verifyPersonaSigningRevocation(raw, {
  trustedPersonaRootPublicKey,
  credential
} = {}) {
  const value = assertPlainObject(raw, 'persona signing revocation');
  const statement = normalizeRevocationStatement(value.statement);
  const verified = verifyEnvelope(value, {
    schema: PERSONA_SIGNING_REVOCATION_SCHEMA,
    keys: REVOCATION_KEYS,
    label: 'persona signing revocation',
    trustedPublicKey: trustedPersonaRootPublicKey,
    expectedKeyId: statement.root_key_id,
    signatureField: 'root_signature',
    digestField: 'revocation_digest'
  });
  if (credential !== undefined) {
    const bound = verifyPersonaSigningCredential(credential, { trustedPersonaRootPublicKey });
    if (
      statement.credential_digest !== bound.credential_digest
      || statement.signing_key_id !== bound.statement.signing_key_id
      || statement.epoch !== bound.statement.epoch
      || statement.persona_id !== bound.statement.persona_id
      || statement.persona_projection_digest !== bound.statement.persona_projection_digest
    ) {
      throw new ValidationError('persona signing revocation does not bind the supplied credential');
    }
  }
  return Object.freeze({ ...verified, statement });
}

export function assertPersonaSigningCredentialUsableAt(credentialRaw, {
  trustedPersonaRootPublicKey,
  at,
  successorCredential = null,
  revocation = null
} = {}) {
  const credential = verifyPersonaSigningCredential(credentialRaw, {
    trustedPersonaRootPublicKey
  });
  const timestamp = canonicalTimestamp(at, 'persona signing credential usage time');
  if (timestamp < credential.statement.activated_at) {
    throw new ValidationError('persona signing credential is not active yet');
  }
  let successor = null;
  if (successorCredential !== null) {
    successor = verifyPersonaSigningCredential(successorCredential, {
      trustedPersonaRootPublicKey
    });
    validatePersonaSigningCredentialTransition(credential, successor, {
      trustedPersonaRootPublicKey
    });
    if (timestamp >= successor.statement.activated_at) {
      throw new ValidationError('persona signing credential is stale after successor activation');
    }
  }
  let revoked = null;
  if (revocation !== null) {
    revoked = verifyPersonaSigningRevocation(revocation, {
      trustedPersonaRootPublicKey,
      credential
    });
    if (timestamp >= revoked.statement.effective_at) {
      throw new ValidationError('persona signing credential is revoked at the requested time');
    }
  }
  return Object.freeze({
    valid: true,
    usable_at: timestamp,
    persona_id: credential.statement.persona_id,
    persona_projection_digest: credential.statement.persona_projection_digest,
    credential_digest: credential.credential_digest,
    signing_key_id: credential.statement.signing_key_id,
    epoch: credential.statement.epoch,
    successor_checked: successor !== null,
    revocation_checked: revoked !== null,
    global_currentness_claimed: false,
    authority_effect: 'none',
    network_effect: 'none'
  });
}

function normalizeJournalStatement(raw) {
  const value = assertPlainObject(raw, 'credentialed public journal statement');
  assertExactKeys(value, JOURNAL_STATEMENT_KEYS, 'credentialed public journal statement');
  if (!['publication', 'retraction'].includes(value.entry_type)) {
    throw new ValidationError('credentialed public journal entry_type must be publication or retraction');
  }
  const expectedSchema = value.entry_type === 'publication'
    ? SOCIAL_PUBLICATION_SCHEMA
    : SOCIAL_PUBLICATION_TRANSITION_SCHEMA;
  if (value.entry_schema !== expectedSchema) {
    throw new ValidationError('credentialed public journal entry_schema does not match entry_type');
  }
  const sequence = positiveInteger(value.sequence, 'credentialed public journal sequence');
  const previous = nullableDigest(
    value.previous_attestation_digest,
    'credentialed public journal previous_attestation_digest'
  );
  if ((sequence === 1) !== (previous === null)) {
    throw new ValidationError('credentialed public journal sequence 1 requires a null predecessor and later entries require one');
  }
  if (value.public_audience !== true) {
    throw new ValidationError('credentialed public journal is restricted to public-audience social history');
  }
  if (
    value.content_truth_claimed !== false
    || value.authorship_claimed !== false
    || value.legal_identity_claimed !== false
  ) {
    throw new ValidationError('credentialed public journal cannot claim truth, authorship, or legal identity');
  }
  if (value.authority_effect !== 'none' || value.network_effect !== 'none') {
    throw new ValidationError('credentialed public journal cannot perform authority or network effects');
  }
  return Object.freeze({
    entry_type: value.entry_type,
    entry_schema: expectedSchema,
    entry_digest: digest(value.entry_digest, 'credentialed public journal entry_digest'),
    persona_id: identifier(value.persona_id, 'credentialed public journal persona_id'),
    persona_projection_digest: digest(
      value.persona_projection_digest,
      'credentialed public journal persona_projection_digest'
    ),
    persona_root_key_id: digest(value.persona_root_key_id, 'credentialed public journal persona_root_key_id'),
    persona_credential_digest: digest(
      value.persona_credential_digest,
      'credentialed public journal persona_credential_digest'
    ),
    persona_key_id: digest(value.persona_key_id, 'credentialed public journal persona_key_id'),
    persona_key_epoch: positiveInteger(value.persona_key_epoch, 'credentialed public journal persona_key_epoch'),
    sequence,
    previous_attestation_digest: previous,
    issued_at: canonicalTimestamp(value.issued_at, 'credentialed public journal issued_at'),
    public_audience: true,
    content_truth_claimed: false,
    authorship_claimed: false,
    legal_identity_claimed: false,
    authority_effect: 'none',
    network_effect: 'none'
  });
}

function validatePublicPublication(raw) {
  const publication = validateSocialPublicationProjection(raw);
  if (publication.audience.mode !== 'public') {
    throw new ValidationError('credentialed public journal accepts only public-audience publications');
  }
  return publication;
}

function validateRetractionEntry(raw, publicationRaw) {
  const transition = validateSocialPublicationRetraction(raw);
  const publication = validatePublicPublication(publicationRaw);
  if (transition.publication_digest !== publication.projection_digest) {
    throw new ValidationError('credentialed public retraction does not target the supplied public publication');
  }
  if (
    transition.persona_id !== publication.persona_id
    || transition.persona_projection_digest !== publication.persona_projection_digest
  ) {
    throw new ValidationError('credentialed public retraction persona binding does not match the publication');
  }
  return { transition, publication };
}

function verifyJournalEnvelope(raw, credential, trustedPersonaRootPublicKey) {
  const value = assertPlainObject(raw, 'credentialed public journal attestation');
  const statement = normalizeJournalStatement(value.statement);
  const verifiedCredential = verifyPersonaSigningCredential(credential, {
    trustedPersonaRootPublicKey,
    expectedPersonaId: statement.persona_id,
    expectedPersonaProjectionDigest: statement.persona_projection_digest
  });
  if (
    statement.persona_root_key_id !== verifiedCredential.statement.root_key_id
    || statement.persona_credential_digest !== verifiedCredential.credential_digest
    || statement.persona_key_id !== verifiedCredential.statement.signing_key_id
    || statement.persona_key_epoch !== verifiedCredential.statement.epoch
  ) {
    throw new ValidationError('credentialed public journal key credential binding is invalid');
  }
  const verified = verifyEnvelope(value, {
    schema: CREDENTIALED_PUBLIC_JOURNAL_ATTESTATION_SCHEMA,
    keys: JOURNAL_KEYS,
    label: 'credentialed public journal attestation',
    trustedPublicKey: verifiedCredential.statement.signing_public_key,
    expectedKeyId: verifiedCredential.statement.signing_key_id,
    signatureField: 'signature',
    digestField: 'attestation_digest'
  });
  return Object.freeze({ ...verified, statement, credential: verifiedCredential });
}

function createCredentialedJournalAttestation({
  entryType,
  entrySchema,
  entryDigest,
  personaId,
  personaProjectionDigest,
  eventTime,
  personaJournalPrivateKey,
  personaSigningCredential,
  trustedPersonaRootPublicKey,
  successorCredential,
  revocation,
  previousAttestation,
  previousCredential,
  credentialPath,
  issuedAt
}) {
  const credential = verifyPersonaSigningCredential(personaSigningCredential, {
    trustedPersonaRootPublicKey,
    expectedPersonaId: personaId,
    expectedPersonaProjectionDigest: personaProjectionDigest
  });
  const signer = operationalSigner(personaJournalPrivateKey);
  if (signer.keyId !== credential.statement.signing_key_id) {
    throw new ValidationError('persona journal private key does not match the signing credential');
  }
  const issued = canonicalTimestamp(issuedAt, 'credentialed public journal issued_at');
  assertPersonaSigningCredentialUsableAt(credential, {
    trustedPersonaRootPublicKey,
    at: issued,
    successorCredential,
    revocation
  });
  if (issued < eventTime) {
    throw new ValidationError('credentialed public journal attestation cannot predate the social entry');
  }

  let previous = null;
  if (previousAttestation !== null && previousAttestation !== undefined) {
    if (!previousCredential) {
      throw new ValidationError('credentialed public journal predecessor requires its signing credential');
    }
    previous = verifyJournalEnvelope(
      previousAttestation,
      previousCredential,
      trustedPersonaRootPublicKey
    );
    if (
      previous.statement.persona_id !== personaId
      || previous.statement.persona_projection_digest !== personaProjectionDigest
      || previous.statement.persona_root_key_id !== credential.statement.root_key_id
    ) {
      throw new ValidationError('credentialed public journal predecessor belongs to a different persona or root');
    }
    if (previous.credential.credential_digest !== credential.credential_digest) {
      const path = credentialPath ?? [previousCredential, personaSigningCredential];
      const pathResult = validatePersonaSigningCredentialPath(path, {
        trustedPersonaRootPublicKey
      });
      if (
        pathResult.first_credential_digest !== previous.credential.credential_digest
        || pathResult.last_credential_digest !== credential.credential_digest
      ) {
        throw new ValidationError('credentialed public journal credential path does not bridge predecessor to current key');
      }
    }
    if (issued < previous.statement.issued_at) {
      throw new ValidationError('credentialed public journal cannot move backward in issued time');
    }
  }

  const statement = normalizeJournalStatement({
    entry_type: entryType,
    entry_schema: entrySchema,
    entry_digest: entryDigest,
    persona_id: personaId,
    persona_projection_digest: personaProjectionDigest,
    persona_root_key_id: credential.statement.root_key_id,
    persona_credential_digest: credential.credential_digest,
    persona_key_id: credential.statement.signing_key_id,
    persona_key_epoch: credential.statement.epoch,
    sequence: previous ? previous.statement.sequence + 1 : 1,
    previous_attestation_digest: previous ? previous.attestation_digest : null,
    issued_at: issued,
    public_audience: true,
    content_truth_claimed: false,
    authorship_claimed: false,
    legal_identity_claimed: false,
    authority_effect: 'none',
    network_effect: 'none'
  });
  return signEnvelope({
    schema: CREDENTIALED_PUBLIC_JOURNAL_ATTESTATION_SCHEMA,
    statement,
    privateKey: signer.privateKey,
    signatureField: 'signature',
    digestField: 'attestation_digest'
  });
}

export function createCredentialedPersonaPublicationAttestation(publicationRaw, options = {}) {
  const publication = validatePublicPublication(publicationRaw);
  return createCredentialedJournalAttestation({
    ...options,
    entryType: 'publication',
    entrySchema: SOCIAL_PUBLICATION_SCHEMA,
    entryDigest: publication.projection_digest,
    personaId: publication.persona_id,
    personaProjectionDigest: publication.persona_projection_digest,
    eventTime: publication.created_at
  });
}

export function createCredentialedPersonaRetractionAttestation(retractionRaw, {
  publication,
  ...options
} = {}) {
  const validated = validateRetractionEntry(retractionRaw, publication);
  return createCredentialedJournalAttestation({
    ...options,
    entryType: 'retraction',
    entrySchema: SOCIAL_PUBLICATION_TRANSITION_SCHEMA,
    entryDigest: validated.transition.transition_digest,
    personaId: validated.transition.persona_id,
    personaProjectionDigest: validated.transition.persona_projection_digest,
    eventTime: validated.transition.occurred_at
  });
}

export function verifyCredentialedPublicJournalAttestation(raw, {
  personaSigningCredential,
  trustedPersonaRootPublicKey,
  successorCredential = null,
  revocation = null,
  entry,
  publication
} = {}) {
  const verified = verifyJournalEnvelope(
    raw,
    personaSigningCredential,
    trustedPersonaRootPublicKey
  );
  const statement = verified.statement;
  assertPersonaSigningCredentialUsableAt(verified.credential, {
    trustedPersonaRootPublicKey,
    at: statement.issued_at,
    successorCredential,
    revocation
  });
  if (statement.entry_type === 'publication') {
    const projected = validatePublicPublication(entry);
    if (
      statement.entry_digest !== projected.projection_digest
      || statement.persona_id !== projected.persona_id
      || statement.persona_projection_digest !== projected.persona_projection_digest
    ) {
      throw new ValidationError('credentialed public journal publication binding is invalid');
    }
    if (statement.issued_at < projected.created_at) {
      throw new ValidationError('credentialed public journal publication attestation predates the publication');
    }
  } else {
    const validated = validateRetractionEntry(entry, publication);
    if (
      statement.entry_digest !== validated.transition.transition_digest
      || statement.persona_id !== validated.transition.persona_id
      || statement.persona_projection_digest !== validated.transition.persona_projection_digest
    ) {
      throw new ValidationError('credentialed public journal retraction binding is invalid');
    }
    if (statement.issued_at < validated.transition.occurred_at) {
      throw new ValidationError('credentialed public journal retraction attestation predates the transition');
    }
  }
  return Object.freeze({
    valid: true,
    schema: verified.schema,
    statement,
    statement_digest: verified.statement_digest,
    attestation_digest: verified.attestation_digest,
    credential_digest: verified.credential.credential_digest,
    persona_key_signature_valid: true,
    persona_root_credential_valid: true,
    content_truth_claimed: false,
    authorship_claimed: false,
    legal_identity_claimed: false,
    global_currentness_claimed: false,
    authority_effect: 'none',
    network_effect: 'none'
  });
}

export function validateCredentialedPublicJournalContinuity(previousRaw, currentRaw, {
  previousCredential,
  currentCredential,
  trustedPersonaRootPublicKey,
  credentialPath
} = {}) {
  const previous = verifyJournalEnvelope(previousRaw, previousCredential, trustedPersonaRootPublicKey);
  const current = verifyJournalEnvelope(currentRaw, currentCredential, trustedPersonaRootPublicKey);
  if (
    current.statement.persona_id !== previous.statement.persona_id
    || current.statement.persona_projection_digest !== previous.statement.persona_projection_digest
    || current.statement.persona_root_key_id !== previous.statement.persona_root_key_id
  ) {
    throw new ValidationError('credentialed public journal continuity cannot cross persona or root bindings');
  }
  if (current.statement.sequence !== previous.statement.sequence + 1) {
    throw new ValidationError('credentialed public journal continuity requires the next sequence number');
  }
  if (current.statement.previous_attestation_digest !== previous.attestation_digest) {
    throw new ValidationError('credentialed public journal continuity predecessor digest is invalid');
  }
  if (current.statement.issued_at < previous.statement.issued_at) {
    throw new ValidationError('credentialed public journal continuity cannot move backward in issued time');
  }
  if (previous.credential.credential_digest !== current.credential.credential_digest) {
    const path = credentialPath ?? [previousCredential, currentCredential];
    const pathResult = validatePersonaSigningCredentialPath(path, { trustedPersonaRootPublicKey });
    if (
      pathResult.first_credential_digest !== previous.credential.credential_digest
      || pathResult.last_credential_digest !== current.credential.credential_digest
    ) {
      throw new ValidationError('credentialed public journal continuity credential path is invalid');
    }
  }
  return Object.freeze({
    valid: true,
    persona_id: current.statement.persona_id,
    persona_projection_digest: current.statement.persona_projection_digest,
    root_key_id: current.statement.persona_root_key_id,
    previous_key_epoch: previous.statement.persona_key_epoch,
    current_key_epoch: current.statement.persona_key_epoch,
    previous_sequence: previous.statement.sequence,
    current_sequence: current.statement.sequence,
    previous_attestation_digest: previous.attestation_digest,
    current_attestation_digest: current.attestation_digest
  });
}
