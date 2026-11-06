import { digestObject, ValidationError } from './canonical.mjs';

export const CREDENTIAL_BROKER_PROVIDER_SCHEMA = 'axiom-credential-broker-provider.v0';
export const CREDENTIAL_BROKER_REQUEST_SCHEMA = 'axiom-credential-broker-request.v0';

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const PROVIDER_KINDS = new Set([
  'password-manager',
  'enterprise-secret-manager',
  'hardware-authenticator',
  'local-vault',
  'other'
]);
const INTEGRATION_MODES = new Set([
  'external-native',
  'trusted-broker-api',
  'trusted-browser-extension',
  'local-only'
]);
const CREDENTIAL_CLASSES = new Set([
  'password',
  'passkey',
  'totp',
  'oauth-token',
  'api-key',
  'client-certificate',
  'session',
  'signing-key',
  'other'
]);
const MAX_REQUEST_WINDOW_MS = 15 * 60 * 1000;

export function validateCredentialBrokerProvider(provider) {
  exactObject(provider, 'Credential broker provider', [
    'schema',
    'version',
    'status',
    'provider_id',
    'provider_kind',
    'integration_mode',
    'supported_credential_classes',
    'supported_actions',
    'allowed_destinations',
    'approval_mode',
    'secret_visibility',
    'model_secret_access',
    'live_invocation',
    'authority_effect',
    'network_effect'
  ]);

  if (
    provider.schema !== CREDENTIAL_BROKER_PROVIDER_SCHEMA
    || provider.version !== 0
    || provider.status !== 'inert-contract-laboratory'
  ) throw new ValidationError('Credential broker provider schema/version/status is invalid');

  id(provider.provider_id, 'provider_id');
  if (!PROVIDER_KINDS.has(provider.provider_kind)) throw new ValidationError('provider_kind is invalid');
  if (!INTEGRATION_MODES.has(provider.integration_mode)) throw new ValidationError('integration_mode is invalid');
  enumSet(provider.supported_credential_classes, 'supported_credential_classes', CREDENTIAL_CLASSES);
  identifierSet(provider.supported_actions, 'supported_actions');
  originSet(provider.allowed_destinations, 'allowed_destinations');

  if (provider.approval_mode !== 'always-human') {
    throw new ValidationError('Credential broker v0 requires always-human approval');
  }
  if (provider.secret_visibility !== 'trusted-broker-only' || provider.model_secret_access !== false) {
    throw new ValidationError('Credential broker provider secret-visibility boundary is invalid');
  }
  if (
    provider.live_invocation !== false
    || provider.authority_effect !== 'none'
    || provider.network_effect !== 'none'
  ) throw new ValidationError('Credential broker provider activation boundary is invalid');

  return provider;
}

export function validateCredentialBrokerRequest(request) {
  exactObject(request, 'Credential broker request', [
    'schema',
    'version',
    'status',
    'request_id',
    'principal_id',
    'provider_id',
    'credential_ref',
    'credential_class',
    'exact_action',
    'purpose',
    'exact_destination',
    'prepared_effect_digest',
    'issued_at',
    'expires_at',
    'single_use',
    'requires_human_approval',
    'authority_effect',
    'network_effect',
    'broker_invocation'
  ]);

  if (
    request.schema !== CREDENTIAL_BROKER_REQUEST_SCHEMA
    || request.version !== 0
    || request.status !== 'inert-contract-laboratory'
  ) throw new ValidationError('Credential broker request schema/version/status is invalid');

  id(request.request_id, 'request_id');
  id(request.principal_id, 'principal_id');
  id(request.provider_id, 'provider_id');
  id(request.credential_ref, 'credential_ref');
  if (!CREDENTIAL_CLASSES.has(request.credential_class)) throw new ValidationError('credential_class is invalid');
  id(request.exact_action, 'exact_action');
  id(request.purpose, 'purpose');
  origin(request.exact_destination, 'exact_destination');
  digest(request.prepared_effect_digest, 'prepared_effect_digest');

  const issuedAt = date(request.issued_at, 'issued_at');
  const expiresAt = date(request.expires_at, 'expires_at');
  if (expiresAt <= issuedAt) throw new ValidationError('expires_at must follow issued_at');
  if (expiresAt - issuedAt > MAX_REQUEST_WINDOW_MS) {
    throw new ValidationError('Credential broker request lifetime exceeds 15 minutes');
  }

  if (request.single_use !== true || request.requires_human_approval !== true) {
    throw new ValidationError('Credential broker v0 requires single-use human-approved requests');
  }
  if (
    request.authority_effect !== 'none'
    || request.network_effect !== 'none'
    || request.broker_invocation !== false
  ) throw new ValidationError('Credential broker request activation boundary is invalid');

  return request;
}

export function evaluateCredentialBrokerRequest({ request, provider, evaluated_at }) {
  validateCredentialBrokerProvider(provider);
  validateCredentialBrokerRequest(request);
  const evaluatedAt = date(evaluated_at, 'evaluated_at');
  const issuedAt = date(request.issued_at, 'issued_at');
  const expiresAt = date(request.expires_at, 'expires_at');

  if (evaluatedAt < issuedAt) throw new ValidationError('Credential broker request is not yet valid');
  if (evaluatedAt >= expiresAt) throw new ValidationError('Credential broker request is expired');
  if (provider.provider_id !== request.provider_id) throw new ValidationError('provider_id does not match provider profile');
  if (!provider.supported_credential_classes.includes(request.credential_class)) {
    throw new ValidationError('credential_class is not supported by provider profile');
  }
  if (!provider.supported_actions.includes(request.exact_action)) {
    throw new ValidationError('exact_action is not supported by provider profile');
  }
  if (!provider.allowed_destinations.includes(request.exact_destination)) {
    throw new ValidationError('exact_destination is not allowed by provider profile');
  }

  return Object.freeze({
    valid: true,
    schema: 'axiom-credential-broker-evaluation.v0',
    request_id: request.request_id,
    principal_id: request.principal_id,
    provider_id: request.provider_id,
    credential_class: request.credential_class,
    exact_action: request.exact_action,
    purpose: request.purpose,
    exact_destination: request.exact_destination,
    request_digest: digestObject(request),
    provider_digest: digestObject(provider),
    requires_trusted_credential_broker: true,
    requires_human_approval: true,
    secret_material_returned: false,
    authority_effect: 'none',
    network_effect: 'none',
    broker_invocation: false
  });
}

function exactObject(value, label, allowedFields) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError(`${label} must be an object`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new ValidationError(`${label} must be a plain object`);
  }
  const allowed = new Set(allowedFields);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new ValidationError(`${label} contains unknown field ${key}`);
  }
  for (const key of allowedFields) {
    if (!Object.hasOwn(value, key)) throw new ValidationError(`${label} is missing required field ${key}`);
  }
}

function id(value, label) {
  if (typeof value !== 'string' || !IDENTIFIER.test(value)) throw new ValidationError(`${label} is invalid`);
  return value;
}

function digest(value, label) {
  if (typeof value !== 'string' || !DIGEST.test(value)) throw new ValidationError(`${label} is invalid`);
  return value;
}

function date(value, label) {
  if (typeof value !== 'string' || value.length > 64) throw new ValidationError(`${label} must be a canonical ISO timestamp`);
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new ValidationError(`${label} must be a canonical ISO timestamp`);
  }
  return parsed.getTime();
}

function origin(value, label) {
  if (typeof value !== 'string' || value.length > 512) throw new ValidationError(`${label} must be an HTTPS origin`);
  let parsed;
  try { parsed = new URL(value); } catch { throw new ValidationError(`${label} must be an HTTPS origin`); }
  if (
    parsed.protocol !== 'https:'
    || parsed.username
    || parsed.password
    || parsed.pathname !== '/'
    || parsed.search
    || parsed.hash
    || parsed.origin !== value
  ) throw new ValidationError(`${label} must be an exact HTTPS origin`);
  return value;
}

function enumSet(value, label, allowed) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 16) {
    throw new ValidationError(`${label} must contain 1-16 items`);
  }
  const seen = new Set();
  for (const item of value) {
    if (!allowed.has(item)) throw new ValidationError(`${label} contains an invalid value`);
    if (seen.has(item)) throw new ValidationError(`${label} contains a duplicate value`);
    seen.add(item);
  }
}

function identifierSet(value, label) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 32) {
    throw new ValidationError(`${label} must contain 1-32 items`);
  }
  const seen = new Set();
  for (const item of value) {
    id(item, label);
    if (seen.has(item)) throw new ValidationError(`${label} contains a duplicate value`);
    seen.add(item);
  }
}

function originSet(value, label) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 32) {
    throw new ValidationError(`${label} must contain 1-32 items`);
  }
  const seen = new Set();
  for (const item of value) {
    origin(item, label);
    if (seen.has(item)) throw new ValidationError(`${label} contains a duplicate value`);
    seen.add(item);
  }
}
