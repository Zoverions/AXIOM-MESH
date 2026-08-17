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
  validatePublicPersonaProjection,
  validateSocialPublicationProjection,
  validateSocialPublicationRetraction
} from './social-publication.mjs';

export const SOCIAL_EXCHANGE_PACKAGE_SCHEMA = 'axiom-social-exchange-package.v1';
export const SOCIAL_EXPORTER_ATTESTATION_SCHEMA = 'axiom-social-exporter-attestation.v1';
export const SOCIAL_EXCHANGE_IMPORT_PLAN_SCHEMA = 'axiom-social-exchange-import-plan.v1';

const MAX_PACKAGE_BYTES = 2_097_152;
const MAX_PERSONAS = 64;
const MAX_PUBLICATIONS = 512;
const MAX_TRANSITIONS = 512;
const MAX_IMPORT_PLAN_LIFETIME_MS = 24 * 60 * 60 * 1000;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$/;
const TRUST_LABEL = /^[a-z][a-z0-9._-]{0,63}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const BASE64URL = /^[A-Za-z0-9_-]+$/;

const PACKAGE_KEYS = new Set([
  'schema',
  'statement',
  'package_digest',
  'attestation'
]);
const STATEMENT_KEYS = new Set([
  'exporter',
  'personas',
  'publications',
  'transitions',
  'created_at',
  'transport_effect',
  'authority_effect',
  'delivery_claimed',
  'federation_claimed'
]);
const EXPORTER_KEYS = new Set(['grid_id', 'key_id']);
const ATTESTATION_KEYS = new Set([
  'schema',
  'scope',
  'exporter_key_id',
  'actor_signature_claimed',
  'authorship_claimed',
  'legal_identity_claimed',
  'signature'
]);

export function createSocialExchangePackage({
  personas,
  publications,
  transitions = [],
  exporterGridId,
  exporterPrivateKey,
  exporterPublicKey,
  createdAt,
  now = Date.now()
}) {
  const publicKey = parsePublicKey(exporterPublicKey, 'social exporter public key');
  const privateKey = parsePrivateKey(exporterPrivateKey, 'social exporter private key');
  const derivedPublicKey = createPublicKey(privateKey);
  const derivedPublicPem = derivedPublicKey.export({ type: 'spki', format: 'pem' }).toString();
  if (sha256(derivedPublicPem) !== publicKey.keyId) {
    throw new ValidationError('social exporter private key does not match the supplied public key');
  }

  const statement = normalizeExchangeStatement({
    exporter: {
      grid_id: exporterGridId,
      key_id: publicKey.keyId
    },
    personas,
    publications,
    transitions,
    created_at: createdAt,
    transport_effect: 'none',
    authority_effect: 'none',
    delivery_claimed: false,
    federation_claimed: false
  }, { now });
  const packageDigest = digestObject(statement);
  const signedEnvelope = {
    schema: SOCIAL_EXCHANGE_PACKAGE_SCHEMA,
    package_digest: packageDigest,
    statement
  };
  const signature = sign(
    null,
    Buffer.from(canonicalJson(signedEnvelope)),
    privateKey
  ).toString('base64url');

  return Object.freeze({
    schema: SOCIAL_EXCHANGE_PACKAGE_SCHEMA,
    statement,
    package_digest: packageDigest,
    attestation: Object.freeze({
      schema: SOCIAL_EXPORTER_ATTESTATION_SCHEMA,
      scope: 'grid-export',
      exporter_key_id: publicKey.keyId,
      actor_signature_claimed: false,
      authorship_claimed: false,
      legal_identity_claimed: false,
      signature
    })
  });
}

export function verifySocialExchangePackage(input, {
  trustedExporterPublicKey,
  expectedExporterGridId,
  now = Date.now()
} = {}) {
  const value = assertPlainObject(input, 'social exchange package');
  assertExactKeys(value, PACKAGE_KEYS, 'social exchange package');
  if (value.schema !== SOCIAL_EXCHANGE_PACKAGE_SCHEMA) {
    throw new ValidationError('unsupported social exchange package schema');
  }
  assertPackageBytes(value);

  const trustedKey = parsePublicKey(
    trustedExporterPublicKey,
    'trusted social exporter public key'
  );
  const statement = normalizeExchangeStatement(value.statement, { now });
  if (
    expectedExporterGridId !== undefined
    && statement.exporter.grid_id !== expectedExporterGridId
  ) {
    throw new ValidationError('social exchange exporter Grid does not match the expected exporter');
  }
  if (statement.exporter.key_id !== trustedKey.keyId) {
    throw new ValidationError('social exchange exporter key does not match the trusted exporter key');
  }

  const packageDigest = digest(value.package_digest, 'social exchange package_digest');
  if (packageDigest !== digestObject(statement)) {
    throw new ValidationError('social exchange package digest does not match canonical content');
  }

  const attestation = normalizeAttestation(value.attestation);
  if (attestation.exporter_key_id !== trustedKey.keyId) {
    throw new ValidationError('social exporter attestation key does not match the trusted exporter key');
  }

  const signedEnvelope = {
    schema: SOCIAL_EXCHANGE_PACKAGE_SCHEMA,
    package_digest: packageDigest,
    statement
  };
  let validSignature = false;
  try {
    validSignature = verify(
      null,
      Buffer.from(canonicalJson(signedEnvelope)),
      trustedKey.key,
      Buffer.from(attestation.signature, 'base64url')
    );
  } catch {
    validSignature = false;
  }
  if (!validSignature) {
    throw new ValidationError('social exporter attestation signature is invalid');
  }

  return Object.freeze({
    valid: true,
    schema: SOCIAL_EXCHANGE_PACKAGE_SCHEMA,
    package_digest: packageDigest,
    exporter: statement.exporter,
    personas: statement.personas,
    publications: statement.publications,
    transitions: statement.transitions,
    created_at: statement.created_at,
    transport_effect: 'none',
    authority_effect: 'none',
    delivery_claimed: false,
    federation_claimed: false,
    exporter_attestation: Object.freeze({
      schema: attestation.schema,
      scope: 'grid-export',
      exporter_key_id: attestation.exporter_key_id,
      actor_signature_claimed: false,
      authorship_claimed: false,
      legal_identity_claimed: false
    })
  });
}

export function createSocialExchangeImportPlan(packageInput, {
  trustedExporterPublicKey,
  expectedExporterGridId,
  recipientPrincipal,
  trustLabel,
  plannedAt,
  expiresAt,
  now = Date.now()
} = {}) {
  const verified = verifySocialExchangePackage(packageInput, {
    trustedExporterPublicKey,
    expectedExporterGridId,
    now
  });
  const plannedAtValue = canonicalTimestamp(
    plannedAt ?? new Date(now).toISOString(),
    'social exchange import planned_at',
    { now }
  );
  const expiresAtValue = canonicalTimestamp(
    expiresAt,
    'social exchange import expires_at',
    { now, allowFuture: true }
  );
  const plannedMs = new Date(plannedAtValue).valueOf();
  const expiresMs = new Date(expiresAtValue).valueOf();
  if (expiresMs <= plannedMs) {
    throw new ValidationError('social exchange import plan must expire after it is created');
  }
  if (expiresMs - plannedMs > MAX_IMPORT_PLAN_LIFETIME_MS) {
    throw new ValidationError('social exchange import plan lifetime exceeds 24 hours');
  }

  const admittedObjects = Object.freeze({
    persona_projection_digests: Object.freeze(
      verified.personas.map(item => item.projection_digest)
    ),
    publication_digests: Object.freeze(
      verified.publications.map(item => item.projection_digest)
    ),
    transition_digests: Object.freeze(
      verified.transitions.map(item => item.transition_digest)
    )
  });
  const body = Object.freeze({
    schema: SOCIAL_EXCHANGE_IMPORT_PLAN_SCHEMA,
    package_digest: verified.package_digest,
    exporter_grid_id: verified.exporter.grid_id,
    exporter_key_id: verified.exporter.key_id,
    recipient_principal: identifier(
      recipientPrincipal,
      'social exchange import recipient_principal'
    ),
    trust_label: assertString(trustLabel, 'social exchange import trust_label', {
      min: 1,
      max: 64,
      pattern: TRUST_LABEL
    }),
    admitted_objects: admittedObjects,
    planned_at: plannedAtValue,
    expires_at: expiresAtValue,
    requires_operator_approval: true,
    status: 'review-only',
    apply_effect: 'none',
    authority_effect: 'none',
    transport_effect: 'none'
  });
  return Object.freeze({
    ...body,
    plan_digest: digestObject(body)
  });
}

function normalizeExchangeStatement(input, { now }) {
  const value = assertPlainObject(input, 'social exchange statement');
  assertExactKeys(value, STATEMENT_KEYS, 'social exchange statement');
  const exporterInput = assertPlainObject(value.exporter, 'social exchange exporter');
  assertExactKeys(exporterInput, EXPORTER_KEYS, 'social exchange exporter');
  const exporter = Object.freeze({
    grid_id: identifier(exporterInput.grid_id, 'social exchange exporter grid_id'),
    key_id: digest(exporterInput.key_id, 'social exchange exporter key_id')
  });

  const personasInput = boundedArray(
    value.personas,
    'social exchange personas',
    { min: 1, max: MAX_PERSONAS }
  );
  const publicationsInput = boundedArray(
    value.publications,
    'social exchange publications',
    { min: 1, max: MAX_PUBLICATIONS }
  );
  const transitionsInput = boundedArray(
    value.transitions,
    'social exchange transitions',
    { min: 0, max: MAX_TRANSITIONS }
  );

  const personas = personasInput
    .map(item => validatePublicPersonaProjection(item))
    .sort((left, right) => (
      left.persona_id.localeCompare(right.persona_id)
      || left.projection_digest.localeCompare(right.projection_digest)
    ));
  const personaIds = new Set();
  const personaDigests = new Set();
  const personaById = new Map();
  for (const persona of personas) {
    if (personaIds.has(persona.persona_id)) {
      throw new ValidationError('social exchange package contains duplicate persona identities');
    }
    if (personaDigests.has(persona.projection_digest)) {
      throw new ValidationError('social exchange package contains duplicate persona projections');
    }
    personaIds.add(persona.persona_id);
    personaDigests.add(persona.projection_digest);
    personaById.set(persona.persona_id, persona);
  }

  const publications = publicationsInput
    .map(item => validateSocialPublicationProjection(item))
    .sort((left, right) => (
      left.created_at.localeCompare(right.created_at)
      || left.projection_digest.localeCompare(right.projection_digest)
    ));
  const publicationIds = new Set();
  const publicationDigests = new Set();
  const publicationByDigest = new Map();
  for (const publication of publications) {
    if (publicationIds.has(publication.publication_id)) {
      throw new ValidationError('social exchange package contains duplicate publication identities');
    }
    if (publicationDigests.has(publication.projection_digest)) {
      throw new ValidationError('social exchange package contains duplicate publication projections');
    }
    publicationIds.add(publication.publication_id);
    publicationDigests.add(publication.projection_digest);
    publicationByDigest.set(publication.projection_digest, publication);

    const persona = personaById.get(publication.persona_id);
    if (!persona) {
      throw new ValidationError('social exchange publication references an absent persona');
    }
    if (publication.persona_projection_digest !== persona.projection_digest) {
      throw new ValidationError('social exchange publication persona projection binding is invalid');
    }
    if (
      publication.attribution_mode !== persona.attribution_mode
      || publication.public_actor_link !== persona.public_actor_link
    ) {
      throw new ValidationError('social exchange publication attribution binding is invalid');
    }
  }

  for (const publication of publications) {
    if (publication.supersedes_digest === null) continue;
    const previous = publicationByDigest.get(publication.supersedes_digest);
    if (!previous) {
      throw new ValidationError('social exchange publication supersession predecessor is absent');
    }
    if (
      previous.persona_id !== publication.persona_id
      || previous.persona_projection_digest !== publication.persona_projection_digest
    ) {
      throw new ValidationError('social exchange publication supersession changes persona binding');
    }
    if (publication.created_at <= previous.created_at) {
      throw new ValidationError('social exchange publication supersession order is invalid');
    }
  }

  const transitions = transitionsInput
    .map(item => validateSocialPublicationRetraction(item))
    .sort((left, right) => (
      left.occurred_at.localeCompare(right.occurred_at)
      || left.transition_digest.localeCompare(right.transition_digest)
    ));
  const transitionDigests = new Set();
  for (const transition of transitions) {
    if (transitionDigests.has(transition.transition_digest)) {
      throw new ValidationError('social exchange package contains duplicate publication transitions');
    }
    transitionDigests.add(transition.transition_digest);
    const publication = publicationByDigest.get(transition.publication_digest);
    if (!publication) {
      throw new ValidationError('social exchange retraction references an absent publication');
    }
    if (
      transition.persona_id !== publication.persona_id
      || transition.persona_projection_digest !== publication.persona_projection_digest
    ) {
      throw new ValidationError('social exchange retraction persona binding is invalid');
    }
    if (transition.occurred_at <= publication.created_at) {
      throw new ValidationError('social exchange retraction order is invalid');
    }
  }

  if (value.transport_effect !== 'none' || value.authority_effect !== 'none') {
    throw new ValidationError('social exchange package cannot perform transport or authority effects');
  }
  if (value.delivery_claimed !== false || value.federation_claimed !== false) {
    throw new ValidationError('social exchange package cannot claim delivery or federation');
  }

  return Object.freeze({
    exporter,
    personas: Object.freeze(personas),
    publications: Object.freeze(publications),
    transitions: Object.freeze(transitions),
    created_at: canonicalTimestamp(value.created_at, 'social exchange created_at', { now }),
    transport_effect: 'none',
    authority_effect: 'none',
    delivery_claimed: false,
    federation_claimed: false
  });
}

function normalizeAttestation(input) {
  const value = assertPlainObject(input, 'social exporter attestation');
  assertExactKeys(value, ATTESTATION_KEYS, 'social exporter attestation');
  if (value.schema !== SOCIAL_EXPORTER_ATTESTATION_SCHEMA) {
    throw new ValidationError('unsupported social exporter attestation schema');
  }
  if (value.scope !== 'grid-export') {
    throw new ValidationError('social exporter attestation scope must be grid-export');
  }
  if (
    value.actor_signature_claimed !== false
    || value.authorship_claimed !== false
    || value.legal_identity_claimed !== false
  ) {
    throw new ValidationError('social exporter attestation cannot claim actor authorship or legal identity');
  }
  return Object.freeze({
    schema: SOCIAL_EXPORTER_ATTESTATION_SCHEMA,
    scope: 'grid-export',
    exporter_key_id: digest(value.exporter_key_id, 'social exporter attestation key_id'),
    actor_signature_claimed: false,
    authorship_claimed: false,
    legal_identity_claimed: false,
    signature: assertString(value.signature, 'social exporter attestation signature', {
      min: 32,
      max: 1024,
      pattern: BASE64URL
    })
  });
}

function assertPackageBytes(value) {
  let bytes;
  try {
    bytes = Buffer.byteLength(canonicalJson(value));
  } catch {
    throw new ValidationError('social exchange package is not canonically serializable');
  }
  if (bytes > MAX_PACKAGE_BYTES) {
    throw new ValidationError(`social exchange package exceeds ${MAX_PACKAGE_BYTES} bytes`);
  }
}

function parsePublicKey(value, label) {
  const pem = assertString(value, label, { min: 64, max: 8192 });
  let key;
  try {
    key = createPublicKey(pem);
  } catch {
    throw new ValidationError(`${label} is invalid`);
  }
  if (key.asymmetricKeyType !== 'ed25519') {
    throw new ValidationError(`${label} must use Ed25519`);
  }
  const canonicalPem = key.export({ type: 'spki', format: 'pem' }).toString();
  return Object.freeze({
    key,
    pem: canonicalPem,
    keyId: sha256(canonicalPem)
  });
}

function parsePrivateKey(value, label) {
  const pem = assertString(value, label, { min: 64, max: 8192 });
  let key;
  try {
    key = createPrivateKey(pem);
  } catch {
    throw new ValidationError(`${label} is invalid`);
  }
  if (key.asymmetricKeyType !== 'ed25519') {
    throw new ValidationError(`${label} must use Ed25519`);
  }
  return key;
}

function canonicalTimestamp(value, label, {
  now,
  allowFuture = false
}) {
  const text = assertString(value, label, { min: 24, max: 24 });
  const date = new Date(text);
  if (Number.isNaN(date.valueOf()) || date.toISOString() !== text) {
    throw new ValidationError(`${label} must be a canonical UTC ISO timestamp`);
  }
  if (!allowFuture && date.valueOf() > now + 300_000) {
    throw new ValidationError(`${label} is too far in the future`);
  }
  return text;
}

function identifier(value, label) {
  return assertString(value, label, { min: 1, max: 192, pattern: IDENTIFIER });
}

function digest(value, label) {
  return assertString(value, label, { min: 64, max: 64, pattern: DIGEST });
}

function boundedArray(value, label, { min, max }) {
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    throw new ValidationError(`${label} must contain ${min}-${max} items`);
  }
  return value;
}

function assertExactKeys(value, allowed, label) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new ValidationError(`${label} contains unsupported field ${key}`);
    }
  }
  for (const key of allowed) {
    if (!(key in value)) {
      throw new ValidationError(`${label} is missing required field ${key}`);
    }
  }
}
