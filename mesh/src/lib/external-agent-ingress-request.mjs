import { digestObject, ValidationError } from './canonical.mjs';

export const EXTERNAL_AGENT_INGRESS_REQUEST_SCHEMA = 'axiom-external-agent-ingress-request.v0';
export const EXTERNAL_AGENT_INGRESS_REQUEST_SCHEMA_ID =
  'urn:axiom:contract:external-agent-ingress-request:v0';

const CORE_FIELDS = Object.freeze([
  'schema',
  'request_id',
  'source',
  'principal',
  'intent',
  'observed_at',
  'expires_at',
  'evidence',
  'authority_state',
  'credentials_present',
  'grants_authority',
  'execution_effect',
  'network_effect'
]);

const TOP_LEVEL_FIELDS = Object.freeze([...CORE_FIELDS, 'request_digest']);
const CREATE_INPUT_FIELDS = Object.freeze([
  'request_id',
  'source',
  'principal',
  'intent',
  'observed_at',
  'expires_at',
  'evidence'
]);
const SOURCE_FIELDS = Object.freeze([
  'surface',
  'provider',
  'transport_profile',
  'connector_ref',
  'context_digest'
]);
const PRINCIPAL_FIELDS = Object.freeze([
  'external_principal_ref',
  'identity_claim_external_only'
]);
const INTENT_FIELDS = Object.freeze([
  'axiom_action',
  'input_digest',
  'requested_effect',
  'purpose',
  'resource_refs'
]);
const EVIDENCE_FIELDS = Object.freeze(['source_refs', 'external_claim_only']);

const TRANSPORT_PROFILES = Object.freeze(['muse', 'mcp', 'a2a', 'other']);
const EFFECT_CLASSES = Object.freeze([
  'read-external',
  'write-external',
  'publish-external',
  'create-external-resource',
  'delete-external-resource',
  'generate-media',
  'financial',
  'communication',
  'unknown'
]);

const IDENTIFIER_RE = /^[A-Za-z0-9][A-Za-z0-9_.:@/#-]{0,191}$/;
const SHA256_RE = /^[a-f0-9]{64}$/;
const DEFAULT_MAX_LIFETIME_MS = 5 * 60 * 1000;

function requirePlain(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError(`${name} must be an object`);
  }
  return value;
}

function requireExactFields(value, fields, name) {
  requirePlain(value, name);
  const allowed = new Set(fields);
  for (const field of fields) {
    if (!Object.hasOwn(value, field)) {
      throw new ValidationError(`${name} is missing required field ${field}`);
    }
  }
  for (const field of Object.keys(value)) {
    if (!allowed.has(field)) {
      throw new ValidationError(`${name} contains unknown field ${field}`);
    }
  }
}

function requireString(value, name, max = 512) {
  if (typeof value !== 'string' || value.length < 1 || value.length > max) {
    throw new ValidationError(`${name} must be a non-empty string with at most ${max} characters`);
  }
  return value;
}

function requireIdentifier(value, name) {
  requireString(value, name, 192);
  if (!IDENTIFIER_RE.test(value)) {
    throw new ValidationError(`${name} has an invalid format`);
  }
  return value;
}

function requireDigest(value, name) {
  if (typeof value !== 'string' || !SHA256_RE.test(value)) {
    throw new ValidationError(`${name} must be a lowercase sha256 digest`);
  }
  return value;
}

function requireEnum(value, allowed, name) {
  if (!allowed.includes(value)) {
    throw new ValidationError(`${name} is invalid`);
  }
  return value;
}

function requireStringArray(value, name, { min = 0, max = 32, itemMax = 2048 } = {}) {
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    throw new ValidationError(`${name} must be an array with ${min}-${max} items`);
  }
  const seen = new Set();
  for (const item of value) {
    requireString(item, `${name} item`, itemMax);
    if (seen.has(item)) {
      throw new ValidationError(`${name} contains duplicate values`);
    }
    seen.add(item);
  }
  return value;
}

function requireTimestamp(value, name) {
  requireString(value, name, 64);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new ValidationError(`${name} must be a canonical ISO timestamp`);
  }
  return parsed.getTime();
}

function digestOrValidationError(value, name) {
  try {
    return digestObject(value);
  } catch {
    throw new ValidationError(`${name} cannot be canonically digested`);
  }
}

function validateSource(source) {
  requireExactFields(source, SOURCE_FIELDS, 'External agent ingress source');
  requireIdentifier(source.surface, 'External agent ingress source.surface');
  requireIdentifier(source.provider, 'External agent ingress source.provider');
  requireEnum(
    source.transport_profile,
    TRANSPORT_PROFILES,
    'External agent ingress source.transport_profile'
  );
  requireIdentifier(source.connector_ref, 'External agent ingress source.connector_ref');
  requireDigest(source.context_digest, 'External agent ingress source.context_digest');
}

function validatePrincipal(principal) {
  requireExactFields(principal, PRINCIPAL_FIELDS, 'External agent ingress principal');
  requireIdentifier(
    principal.external_principal_ref,
    'External agent ingress principal.external_principal_ref'
  );
  if (principal.identity_claim_external_only !== true) {
    throw new ValidationError(
      'External agent ingress principal.identity_claim_external_only must be true'
    );
  }
}

function validateIntent(intent) {
  requireExactFields(intent, INTENT_FIELDS, 'External agent ingress intent');
  requireIdentifier(intent.axiom_action, 'External agent ingress intent.axiom_action');
  requireDigest(intent.input_digest, 'External agent ingress intent.input_digest');
  requireEnum(
    intent.requested_effect,
    EFFECT_CLASSES,
    'External agent ingress intent.requested_effect'
  );
  requireString(intent.purpose, 'External agent ingress intent.purpose', 512);
  requireStringArray(intent.resource_refs, 'External agent ingress intent.resource_refs', {
    max: 32,
    itemMax: 512
  });
}

function validateEvidence(evidence) {
  requireExactFields(evidence, EVIDENCE_FIELDS, 'External agent ingress evidence');
  requireStringArray(evidence.source_refs, 'External agent ingress evidence.source_refs', {
    min: 1,
    max: 32,
    itemMax: 2048
  });
  if (evidence.external_claim_only !== true) {
    throw new ValidationError(
      'External agent ingress evidence.external_claim_only must be true'
    );
  }
}

function validateCore(request, { now, maxLifetimeMs } = {}) {
  requireExactFields(request, CORE_FIELDS, 'External agent ingress request');
  if (request.schema !== EXTERNAL_AGENT_INGRESS_REQUEST_SCHEMA) {
    throw new ValidationError('External agent ingress request schema is invalid');
  }
  requireIdentifier(request.request_id, 'External agent ingress request.request_id');
  validateSource(request.source);
  validatePrincipal(request.principal);
  validateIntent(request.intent);
  validateEvidence(request.evidence);

  const observedAt = requireTimestamp(
    request.observed_at,
    'External agent ingress request.observed_at'
  );
  const expiresAt = requireTimestamp(
    request.expires_at,
    'External agent ingress request.expires_at'
  );
  const nowMs = now ?? Date.now();
  const lifetimeMs = maxLifetimeMs ?? DEFAULT_MAX_LIFETIME_MS;

  if (!Number.isInteger(nowMs) || nowMs < 0) {
    throw new ValidationError('External agent ingress validation now must be a non-negative integer');
  }
  if (!Number.isInteger(lifetimeMs) || lifetimeMs < 1 || lifetimeMs > 60 * 60 * 1000) {
    throw new ValidationError('External agent ingress maxLifetimeMs is invalid');
  }
  if (observedAt > nowMs) {
    throw new ValidationError('External agent ingress request observed_at is in the future');
  }
  if (expiresAt <= observedAt) {
    throw new ValidationError('External agent ingress request expires_at must follow observed_at');
  }
  if (expiresAt - observedAt > lifetimeMs) {
    throw new ValidationError('External agent ingress request lifetime exceeds the allowed bound');
  }
  if (expiresAt <= nowMs) {
    throw new ValidationError('External agent ingress request is expired');
  }

  if (request.authority_state !== 'unresolved') {
    throw new ValidationError('External agent ingress request authority_state must be unresolved');
  }
  if (request.credentials_present !== false) {
    throw new ValidationError('External agent ingress request credentials_present must be false');
  }
  if (request.grants_authority !== false) {
    throw new ValidationError('External agent ingress request grants_authority must be false');
  }
  if (request.execution_effect !== 'none') {
    throw new ValidationError('External agent ingress request execution_effect must be none');
  }
  if (request.network_effect !== 'none') {
    throw new ValidationError('External agent ingress request network_effect must be none');
  }

  return request;
}

function withoutDigest(request) {
  const core = {};
  for (const field of CORE_FIELDS) core[field] = request[field];
  return core;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

export function createExternalAgentIngressRequest(input, options = {}) {
  requireExactFields(input, CREATE_INPUT_FIELDS, 'External agent ingress create input');
  const core = {
    schema: EXTERNAL_AGENT_INGRESS_REQUEST_SCHEMA,
    request_id: input.request_id,
    source: structuredClone(input.source),
    principal: structuredClone(input.principal),
    intent: structuredClone(input.intent),
    observed_at: input.observed_at,
    expires_at: input.expires_at,
    evidence: structuredClone(input.evidence),
    authority_state: 'unresolved',
    credentials_present: false,
    grants_authority: false,
    execution_effect: 'none',
    network_effect: 'none'
  };
  validateCore(core, options);
  return deepFreeze({
    ...core,
    request_digest: digestOrValidationError(core, 'External agent ingress request')
  });
}

export function validateExternalAgentIngressRequest(request, options = {}) {
  requireExactFields(request, TOP_LEVEL_FIELDS, 'External agent ingress request');
  const core = withoutDigest(request);
  validateCore(core, options);
  requireDigest(request.request_digest, 'External agent ingress request.request_digest');
  const expected = digestOrValidationError(core, 'External agent ingress request');
  if (request.request_digest !== expected) {
    throw new ValidationError('External agent ingress request digest mismatch');
  }
  return Object.freeze({
    valid: true,
    schema: request.schema,
    request_digest: request.request_digest,
    authority_state: 'unresolved',
    authority_effect: 'none',
    execution_effect: 'none',
    network_effect: 'none'
  });
}
