import { digestObject, ValidationError } from './canonical.mjs';
import { validateRuntimeConnectorCatalogEntry } from './runtime-connector-fabric-contracts.mjs';

export const EXTERNAL_OPERATION_OFFER_SCHEMA = 'axiom-external-operation-offer.v0';
export const EXTERNAL_OPERATION_OFFER_SCHEMA_ID =
  'urn:axiom:contract:external-operation-offer:v0';
export const EXTERNAL_OPERATION_ELIGIBILITY_RESULT_SCHEMA =
  'axiom-external-operation-eligibility-result.v0';

const OFFER_FIELDS = Object.freeze([
  'schema',
  'offer_id',
  'observed_at',
  'freshness',
  'catalog_entry',
  'operation',
  'topology',
  'quote',
  'health',
  'execution_semantics',
  'evidence',
  'grants_authority',
  'execution_effect'
]);

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

const QUOTE_KINDS = Object.freeze(['free', 'exact', 'bounded', 'variable', 'unknown']);
const PRICING_UNITS = Object.freeze(['call', 'result', 'character', 'second', 'token', 'other']);
const FRESHNESS_STATES = Object.freeze(['current', 'unknown']);
const BROKER_LOCATIONS = Object.freeze(['hosted', 'owner-local']);
const DOWNSTREAM_LOCATIONS = Object.freeze([
  'provider-remote',
  'owner-local',
  'owner-remote',
  'hybrid',
  'unknown'
]);
const HEALTH_STATES = Object.freeze(['available', 'degraded', 'unavailable', 'unknown']);
const CANCELLATION_MODES = Object.freeze(['best-effort', 'unsupported', 'cooperative', 'unknown']);
const IDEMPOTENCY_MODES = Object.freeze([
  'read-safe',
  'idempotent-key',
  'none',
  'unknown'
]);
const RECONCILIATION_MODES = Object.freeze([
  'not-required',
  'required',
  'status-path',
  'unknown'
]);

const CONSTRAINT_FIELDS = Object.freeze([
  'evaluated_at',
  'required_axiom_action',
  'expected_effect_class',
  'verified_effect',
  'allowed_broker_destinations',
  'allowed_provider_destinations',
  'allowed_data_classes',
  'max_spend',
  'require_current_offer'
]);

const VERIFIED_EFFECT_FIELDS = Object.freeze([
  'axiom_action',
  'schema_sha256',
  'provider_ref',
  'effect_class',
  'evidence_digest'
]);

const REJECTION_ORDER = Object.freeze([
  'catalog-binding-invalid',
  'stale-offer',
  'action-mismatch',
  'effect-verification-invalid',
  'effect-class-unknown',
  'effect-class-mismatch',
  'broker-destination-not-allowed',
  'provider-destination-not-allowed',
  'data-class-not-allowed',
  'paid-operation-not-allowed',
  'quote-currency-mismatch',
  'quote-max-unknown',
  'quote-exceeds-spend-ceiling'
]);

const IDENTIFIER_RE = /^[A-Za-z0-9][A-Za-z0-9_.:#/-]{0,191}$/;
const CATALOG_ID_RE = /^[a-z0-9][a-z0-9._:-]{1,127}$/;
const VERSION_RE = /^[0-9]+\.[0-9]+\.[0-9]+(?:[-+][0-9A-Za-z.-]+)?$/;
const SHA256_RE = /^[a-f0-9]{64}$/;
const CURRENCY_RE = /^[A-Z]{3}$/;

function requirePlain(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError(`${name} must be an object`);
  }
  return value;
}

function requireFields(value, fields, name) {
  requirePlain(value, name);
  for (const field of fields) {
    if (!Object.hasOwn(value, field)) {
      throw new ValidationError(`${name} is missing required field ${field}`);
    }
  }
}

function rejectUnknown(value, allowed, name) {
  requirePlain(value, name);
  const allowedSet = new Set(allowed);
  for (const field of Object.keys(value)) {
    if (!allowedSet.has(field)) {
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

function requireIdentifier(value, name, pattern = IDENTIFIER_RE) {
  requireString(value, name, 192);
  if (!pattern.test(value)) throw new ValidationError(`${name} has an invalid format`);
  return value;
}

function requireVersion(value, name) {
  requireString(value, name, 96);
  if (!VERSION_RE.test(value)) throw new ValidationError(`${name} has an invalid format`);
  return value;
}

function requireDigest(value, name) {
  if (typeof value !== 'string' || !SHA256_RE.test(value)) {
    throw new ValidationError(`${name} must be a lowercase sha256 digest`);
  }
  return value;
}

function requireEnum(value, allowed, name) {
  if (!allowed.includes(value)) throw new ValidationError(`${name} is invalid`);
  return value;
}

function requireBoolean(value, name) {
  if (typeof value !== 'boolean') throw new ValidationError(`${name} must be boolean`);
  return value;
}

function requireInteger(value, name, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new ValidationError(`${name} is invalid`);
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

function requireHttpsOrigin(value, name) {
  requireString(value, name, 2048);
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new ValidationError(`${name} must be an https origin`);
  }
  if (url.protocol !== 'https:') {
    throw new ValidationError(`${name} must be an https origin`);
  }
  if (url.username || url.password || url.search || url.hash || (url.pathname && url.pathname !== '/')) {
    throw new ValidationError(`${name} must be an https origin without path, query, userinfo, or fragment`);
  }
  if (value !== url.origin) {
    throw new ValidationError(`${name} must be an https origin`);
  }
  return value;
}

function requireStringArray(value, name, { min = 0, max = 64 } = {}) {
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    throw new ValidationError(`${name} must be an array with ${min}-${max} items`);
  }
  const seen = new Set();
  for (const item of value) {
    requireString(item, `${name} item`, 512);
    if (seen.has(item)) throw new ValidationError(`${name} contains duplicate values`);
    seen.add(item);
  }
  return value;
}

function exactArray(value, expected, name) {
  if (!Array.isArray(value) || value.length !== expected.length) {
    throw new ValidationError(`${name} is invalid`);
  }
  for (let index = 0; index < expected.length; index += 1) {
    if (value[index] !== expected[index]) {
      throw new ValidationError(`${name} is invalid`);
    }
  }
}

function everyObjectAdditionalPropertiesFalse(node) {
  if (!node || typeof node !== 'object' || Array.isArray(node)) return true;
  if (node.type === 'object' || Object.hasOwn(node, 'properties') || Object.hasOwn(node, 'required')) {
    if (node.additionalProperties !== false) return false;
  }
  for (const value of Object.values(node)) {
    if (value && typeof value === 'object') {
      if (Array.isArray(value)) {
        for (const item of value) {
          if (!everyObjectAdditionalPropertiesFalse(item)) return false;
        }
      } else if (!everyObjectAdditionalPropertiesFalse(value)) {
        return false;
      }
    }
  }
  return true;
}

function validateFreshness(value) {
  requireFields(value, ['state'], 'External operation offer freshness');
  rejectUnknown(value, ['state', 'valid_until'], 'External operation offer freshness');
  requireEnum(value.state, FRESHNESS_STATES, 'External operation offer freshness.state');
  if (value.state === 'current') {
    if (value.valid_until === undefined) {
      throw new ValidationError('External operation offer current freshness requires valid_until');
    }
    requireTimestamp(value.valid_until, 'External operation offer freshness.valid_until');
  } else if (value.valid_until !== undefined) {
    throw new ValidationError('External operation offer unknown freshness cannot claim valid_until');
  }
}

function validateCatalogBinding(value) {
  requireFields(value, ['entry_id', 'entry_version', 'entry_digest'], 'External operation offer catalog_entry');
  rejectUnknown(value, ['entry_id', 'entry_version', 'entry_digest'], 'External operation offer catalog_entry');
  requireIdentifier(value.entry_id, 'External operation offer catalog_entry.entry_id', CATALOG_ID_RE);
  requireVersion(value.entry_version, 'External operation offer catalog_entry.entry_version');
  requireDigest(value.entry_digest, 'External operation offer catalog_entry.entry_digest');
}

function validateOperation(value) {
  requireFields(value, [
    'broker_operation_id',
    'axiom_action',
    'schema_sha256',
    'provider_ref',
    'effect_class',
    'input_data_classes',
    'output_data_classes',
    'network_required',
    'description'
  ], 'External operation offer operation');
  rejectUnknown(value, [
    'broker_operation_id',
    'axiom_action',
    'schema_sha256',
    'provider_ref',
    'effect_class',
    'input_data_classes',
    'output_data_classes',
    'network_required',
    'description'
  ], 'External operation offer operation');
  requireIdentifier(value.broker_operation_id, 'External operation offer operation.broker_operation_id');
  requireIdentifier(value.axiom_action, 'External operation offer operation.axiom_action');
  requireDigest(value.schema_sha256, 'External operation offer operation.schema_sha256');
  requireIdentifier(value.provider_ref, 'External operation offer operation.provider_ref');
  requireEnum(value.effect_class, EFFECT_CLASSES, 'External operation offer operation.effect_class');
  requireStringArray(value.input_data_classes, 'External operation offer operation.input_data_classes', {
    max: 32
  });
  requireStringArray(value.output_data_classes, 'External operation offer operation.output_data_classes', {
    max: 32
  });
  requireBoolean(value.network_required, 'External operation offer operation.network_required');
  requireString(value.description, 'External operation offer operation.description', 4000);
}

function validateTopology(value, operation) {
  requireFields(value, [
    'broker_location',
    'broker_destination',
    'downstream_location',
    'provider_destination'
  ], 'External operation offer topology');
  rejectUnknown(value, [
    'broker_location',
    'broker_destination',
    'downstream_location',
    'provider_destination'
  ], 'External operation offer topology');
  requireEnum(value.broker_location, BROKER_LOCATIONS, 'External operation offer topology.broker_location');
  requireEnum(
    value.downstream_location,
    DOWNSTREAM_LOCATIONS,
    'External operation offer topology.downstream_location'
  );

  if (value.broker_location === 'hosted') {
    if (value.broker_destination === null) {
      throw new ValidationError('External operation offer hosted broker requires broker_destination');
    }
    requireHttpsOrigin(value.broker_destination, 'External operation offer topology.broker_destination');
  } else if (value.broker_destination !== null) {
    throw new ValidationError('External operation offer owner-local broker_destination must be null');
  }

  if (operation.network_required && value.downstream_location === 'provider-remote') {
    if (value.provider_destination === null) {
      throw new ValidationError(
        'External operation offer remote provider requires explicit provider_destination'
      );
    }
    requireHttpsOrigin(value.provider_destination, 'External operation offer topology.provider_destination');
  } else if (value.provider_destination !== null) {
    requireHttpsOrigin(value.provider_destination, 'External operation offer topology.provider_destination');
  }
}

function validateQuote(value) {
  requireFields(value, [
    'kind',
    'currency',
    'quoted_amount_minor_units',
    'max_amount_minor_units',
    'pricing_unit',
    'valid_until'
  ], 'External operation offer quote');
  rejectUnknown(value, [
    'kind',
    'currency',
    'quoted_amount_minor_units',
    'max_amount_minor_units',
    'pricing_unit',
    'valid_until'
  ], 'External operation offer quote');
  requireEnum(value.kind, QUOTE_KINDS, 'External operation offer quote.kind');
  requireEnum(value.pricing_unit, PRICING_UNITS, 'External operation offer quote.pricing_unit');
  if (value.valid_until !== null) {
    requireTimestamp(value.valid_until, 'External operation offer quote.valid_until');
  }

  if (value.kind === 'free') {
    if (value.currency !== null) {
      throw new ValidationError('External operation offer free quote currency must be null');
    }
    if (value.quoted_amount_minor_units !== 0 || value.max_amount_minor_units !== 0) {
      throw new ValidationError('External operation offer free quote amounts must be zero');
    }
    return;
  }

  if (value.currency !== null) {
    requireString(value.currency, 'External operation offer quote.currency', 3);
    if (!CURRENCY_RE.test(value.currency)) {
      throw new ValidationError('External operation offer quote.currency is invalid');
    }
  }

  if (value.kind === 'exact') {
    if (value.currency === null) {
      throw new ValidationError('External operation offer exact quote requires currency');
    }
    requireInteger(value.quoted_amount_minor_units, 'External operation offer quote.quoted_amount_minor_units');
    requireInteger(value.max_amount_minor_units, 'External operation offer quote.max_amount_minor_units');
    if (value.quoted_amount_minor_units !== value.max_amount_minor_units) {
      throw new ValidationError('External operation offer exact quote amounts must be equal');
    }
    return;
  }

  if (value.kind === 'bounded') {
    if (value.currency === null) {
      throw new ValidationError('External operation offer bounded quote requires currency');
    }
    requireInteger(value.quoted_amount_minor_units, 'External operation offer quote.quoted_amount_minor_units');
    requireInteger(value.max_amount_minor_units, 'External operation offer quote.max_amount_minor_units');
    if (value.max_amount_minor_units < value.quoted_amount_minor_units) {
      throw new ValidationError('External operation offer bounded quote max is below quoted amount');
    }
    return;
  }

  if (value.max_amount_minor_units !== null) {
    throw new ValidationError(
      'External operation offer variable/unknown quote cannot claim a guaranteed maximum'
    );
  }
  if (value.quoted_amount_minor_units !== null) {
    requireInteger(value.quoted_amount_minor_units, 'External operation offer quote.quoted_amount_minor_units');
  }
  if (value.kind === 'variable' && value.currency === null) {
    throw new ValidationError('External operation offer variable quote requires currency');
  }
}

function validateHealth(value) {
  requireFields(value, ['state', 'observed_at', 'p50_ms', 'p95_ms'], 'External operation offer health');
  rejectUnknown(value, ['state', 'observed_at', 'p50_ms', 'p95_ms'], 'External operation offer health');
  requireEnum(value.state, HEALTH_STATES, 'External operation offer health.state');
  requireTimestamp(value.observed_at, 'External operation offer health.observed_at');
  if (value.p50_ms !== null) {
    requireInteger(value.p50_ms, 'External operation offer health.p50_ms');
  }
  if (value.p95_ms !== null) {
    requireInteger(value.p95_ms, 'External operation offer health.p95_ms');
  }
  if (value.p50_ms !== null && value.p95_ms !== null && value.p95_ms < value.p50_ms) {
    throw new ValidationError('External operation offer health p95 cannot be below p50');
  }
}

function validateExecutionSemantics(value) {
  requireFields(value, [
    'timeout_ms',
    'cancellation',
    'idempotency',
    'reconciliation'
  ], 'External operation offer execution_semantics');
  rejectUnknown(value, [
    'timeout_ms',
    'cancellation',
    'idempotency',
    'reconciliation',
    'reconciliation_path'
  ], 'External operation offer execution_semantics');
  requireInteger(value.timeout_ms, 'External operation offer execution_semantics.timeout_ms', {
    min: 1,
    max: 86_400_000
  });
  requireEnum(value.cancellation, CANCELLATION_MODES, 'External operation offer execution_semantics.cancellation');
  requireEnum(value.idempotency, IDEMPOTENCY_MODES, 'External operation offer execution_semantics.idempotency');
  requireEnum(
    value.reconciliation,
    RECONCILIATION_MODES,
    'External operation offer execution_semantics.reconciliation'
  );
  if (value.reconciliation_path !== undefined && value.reconciliation_path !== null) {
    requireString(value.reconciliation_path, 'External operation offer execution_semantics.reconciliation_path', 512);
  }
  if (
    (value.reconciliation === 'required' || value.reconciliation === 'status-path')
    && !value.reconciliation_path
  ) {
    throw new ValidationError(
      'External operation offer reconciliation semantics require a reconciliation_path'
    );
  }
}

function validateEvidence(value) {
  requireFields(value, ['source_refs', 'external_claim_only'], 'External operation offer evidence');
  rejectUnknown(value, ['source_refs', 'external_claim_only'], 'External operation offer evidence');
  requireStringArray(value.source_refs, 'External operation offer evidence.source_refs', { min: 1, max: 32 });
  if (value.external_claim_only !== true) {
    throw new ValidationError('External operation offer evidence.external_claim_only must be true');
  }
}

function validateOfferDocument(offer) {
  requireFields(offer, OFFER_FIELDS, 'External operation offer');
  rejectUnknown(offer, OFFER_FIELDS, 'External operation offer');
  if (offer.schema !== EXTERNAL_OPERATION_OFFER_SCHEMA) {
    throw new ValidationError('External operation offer schema is invalid');
  }
  requireIdentifier(offer.offer_id, 'External operation offer offer_id');
  requireTimestamp(offer.observed_at, 'External operation offer observed_at');
  validateFreshness(offer.freshness);
  validateCatalogBinding(offer.catalog_entry);
  validateOperation(offer.operation);
  validateTopology(offer.topology, offer.operation);
  validateQuote(offer.quote);
  validateHealth(offer.health);
  validateExecutionSemantics(offer.execution_semantics);
  validateEvidence(offer.evidence);
  if (offer.grants_authority !== false) {
    throw new ValidationError('External operation offer grants_authority must be false');
  }
  if (offer.execution_effect !== 'none') {
    throw new ValidationError('External operation offer execution_effect must be none');
  }
  return offer;
}

export function validateExternalOperationOfferSchema(schema) {
  requirePlain(schema, 'External operation offer schema');
  if (
    schema.$schema !== 'https://json-schema.org/draft/2020-12/schema'
    || schema.$id !== EXTERNAL_OPERATION_OFFER_SCHEMA_ID
    || schema.type !== 'object'
    || schema.additionalProperties !== false
    || schema.properties?.schema?.const !== EXTERNAL_OPERATION_OFFER_SCHEMA
    || schema.properties?.grants_authority?.const !== false
    || schema.properties?.execution_effect?.const !== 'none'
  ) {
    throw new ValidationError('External operation offer schema invariants are invalid');
  }
  exactArray(schema.required, [...OFFER_FIELDS], 'External operation offer schema required');
  exactArray(
    schema.properties?.operation?.properties?.effect_class?.enum,
    [...EFFECT_CLASSES],
    'External operation offer schema effect_class enum'
  );
  exactArray(
    schema.properties?.quote?.properties?.kind?.enum,
    [...QUOTE_KINDS],
    'External operation offer schema quote.kind enum'
  );
  exactArray(
    schema.properties?.quote?.properties?.pricing_unit?.enum,
    [...PRICING_UNITS],
    'External operation offer schema pricing_unit enum'
  );
  if (!everyObjectAdditionalPropertiesFalse(schema)) {
    throw new ValidationError('External operation offer schema must set additionalProperties false');
  }
  return true;
}

export function validateExternalOperationOffer(offer) {
  validateOfferDocument(offer);
  return Object.freeze({
    valid: true,
    schema: offer.schema,
    offer_id: offer.offer_id,
    offer_digest: digestObject(offer),
    grants_authority: false,
    execution_effect: 'none'
  });
}

export function externalOperationOfferDigest(offer) {
  validateExternalOperationOffer(offer);
  return digestObject(offer);
}

function subsetOrEqual(actual, allowed) {
  const allowedSet = new Set(allowed);
  return actual.every((item) => allowedSet.has(item));
}

function assertCatalogSubset(offer, catalogEntry) {
  const access = catalogEntry.requested_access;
  if (!access.actions.includes(offer.operation.axiom_action)) {
    throw new ValidationError('External operation offer axiom_action widens catalog actions');
  }

  if (offer.operation.network_required !== access.network_required) {
    throw new ValidationError('External operation offer network_required does not match catalog network requirement');
  }

  if (offer.topology.broker_location === 'hosted') {
    const networkDestinations = access.network_destinations ?? [];
    if (!networkDestinations.includes(offer.topology.broker_destination)) {
      throw new ValidationError('External operation offer broker_destination widens catalog network destinations');
    }
  }

  if (offer.topology.provider_destination !== null) {
    if (!access.destinations.includes(offer.topology.provider_destination)) {
      throw new ValidationError('External operation offer provider_destination widens catalog destinations');
    }
  }

  const offerData = [
    ...offer.operation.input_data_classes,
    ...offer.operation.output_data_classes
  ];
  if (!subsetOrEqual(offerData, access.data_classes)) {
    throw new ValidationError('External operation offer data classes widen catalog data classes');
  }

  const bounds = access.resource_bounds;
  if (bounds?.timeout_ms !== undefined && offer.execution_semantics.timeout_ms > bounds.timeout_ms) {
    throw new ValidationError('External operation offer timeout widens catalog resource bounds');
  }

  if (bounds?.cost_ceiling !== undefined && offer.quote.kind !== 'free') {
    if (offer.quote.max_amount_minor_units === null) {
      throw new ValidationError('External operation offer bounded catalog cost requires a finite offer maximum');
    }
    if (
      offer.quote.currency !== bounds.cost_ceiling.currency
      || offer.quote.max_amount_minor_units > bounds.cost_ceiling.amount_minor_units
    ) {
      throw new ValidationError('External operation offer monetary maximum widens catalog cost ceiling');
    }
  }
}

export function resolveExternalOperationOffer(offer, catalogEntry, { evaluated_at } = {}) {
  validateExternalOperationOffer(offer);
  validateRuntimeConnectorCatalogEntry(catalogEntry);
  if (typeof evaluated_at !== 'string') {
    throw new ValidationError('External operation offer evaluated_at must be caller-supplied');
  }
  requireTimestamp(evaluated_at, 'External operation offer evaluated_at');

  if (offer.catalog_entry.entry_id !== catalogEntry.entry_id) {
    throw new ValidationError('External operation offer catalog entry_id mismatch');
  }
  if (offer.catalog_entry.entry_version !== catalogEntry.entry_version) {
    throw new ValidationError('External operation offer catalog entry_version mismatch');
  }
  const catalogDigest = digestObject(catalogEntry);
  if (offer.catalog_entry.entry_digest !== catalogDigest) {
    throw new ValidationError('External operation offer catalog entry_digest mismatch');
  }

  assertCatalogSubset(offer, catalogEntry);

  return Object.freeze({
    valid: true,
    offer_id: offer.offer_id,
    offer_digest: digestObject(offer),
    catalog_entry_id: catalogEntry.entry_id,
    catalog_entry_version: catalogEntry.entry_version,
    catalog_entry_digest: catalogDigest,
    current_at: evaluated_at,
    grants_authority: false,
    execution_effect: 'none'
  });
}

function validateVerifiedEffect(value) {
  requireFields(value, VERIFIED_EFFECT_FIELDS, 'External operation offer verified_effect');
  rejectUnknown(value, VERIFIED_EFFECT_FIELDS, 'External operation offer verified_effect');
  requireIdentifier(value.axiom_action, 'External operation offer verified_effect.axiom_action');
  requireDigest(value.schema_sha256, 'External operation offer verified_effect.schema_sha256');
  requireIdentifier(value.provider_ref, 'External operation offer verified_effect.provider_ref');
  requireEnum(value.effect_class, EFFECT_CLASSES, 'External operation offer verified_effect.effect_class');
  requireDigest(value.evidence_digest, 'External operation offer verified_effect.evidence_digest');
  return value;
}

function validateConstraints(constraints) {
  requireFields(constraints, CONSTRAINT_FIELDS, 'External operation offer constraints');
  rejectUnknown(constraints, CONSTRAINT_FIELDS, 'External operation offer constraints');
  requireTimestamp(constraints.evaluated_at, 'External operation offer constraints.evaluated_at');
  requireIdentifier(constraints.required_axiom_action, 'External operation offer constraints.required_axiom_action');
  requireEnum(
    constraints.expected_effect_class,
    EFFECT_CLASSES,
    'External operation offer constraints.expected_effect_class'
  );
  validateVerifiedEffect(constraints.verified_effect);
  requireStringArray(
    constraints.allowed_broker_destinations,
    'External operation offer constraints.allowed_broker_destinations',
    { max: 32 }
  );
  requireStringArray(
    constraints.allowed_provider_destinations,
    'External operation offer constraints.allowed_provider_destinations',
    { max: 32 }
  );
  requireStringArray(
    constraints.allowed_data_classes,
    'External operation offer constraints.allowed_data_classes',
    { max: 64 }
  );
  requireBoolean(
    constraints.require_current_offer,
    'External operation offer constraints.require_current_offer'
  );
  if (constraints.max_spend !== null) {
    requireFields(constraints.max_spend, ['amount_minor_units', 'currency'], 'External operation offer max_spend');
    rejectUnknown(
      constraints.max_spend,
      ['amount_minor_units', 'currency'],
      'External operation offer max_spend'
    );
    requireInteger(constraints.max_spend.amount_minor_units, 'External operation offer max_spend.amount_minor_units');
    requireString(constraints.max_spend.currency, 'External operation offer max_spend.currency', 3);
    if (!CURRENCY_RE.test(constraints.max_spend.currency)) {
      throw new ValidationError('External operation offer max_spend.currency is invalid');
    }
  }
  return constraints;
}

function isPaidQuote(quote) {
  return quote.kind !== 'free';
}

function eligibilityReasons(offer, catalogEntry, constraints) {
  const reasons = [];
  try {
    resolveExternalOperationOffer(offer, catalogEntry, { evaluated_at: constraints.evaluated_at });
  } catch {
    reasons.push('catalog-binding-invalid');
    return reasons;
  }

  if (constraints.require_current_offer) {
    if (offer.freshness.state !== 'current') {
      reasons.push('stale-offer');
    } else {
      const evaluatedMs = Date.parse(constraints.evaluated_at);
      const validUntilMs = Date.parse(offer.freshness.valid_until);
      if (!(evaluatedMs <= validUntilMs)) {
        reasons.push('stale-offer');
      }
    }
  }

  if (isPaidQuote(offer.quote)) {
    const evaluatedMs = Date.parse(constraints.evaluated_at);
    const quoteValidUntilMs = offer.quote.valid_until === null
      ? Number.NaN
      : Date.parse(offer.quote.valid_until);
    if (!Number.isFinite(quoteValidUntilMs) || evaluatedMs > quoteValidUntilMs) {
      reasons.push('stale-offer');
    }
  }

  if (offer.operation.axiom_action !== constraints.required_axiom_action) {
    reasons.push('action-mismatch');
  }

  const verified = constraints.verified_effect;
  if (
    verified.axiom_action !== offer.operation.axiom_action
    || verified.schema_sha256 !== offer.operation.schema_sha256
    || verified.provider_ref !== offer.operation.provider_ref
    || verified.effect_class !== offer.operation.effect_class
  ) {
    reasons.push('effect-verification-invalid');
  }

  if (offer.operation.effect_class === 'unknown' || verified.effect_class === 'unknown') {
    reasons.push('effect-class-unknown');
  } else if (
    offer.operation.effect_class !== constraints.expected_effect_class
    || verified.effect_class !== constraints.expected_effect_class
  ) {
    reasons.push('effect-class-mismatch');
  }

  if (offer.topology.broker_destination !== null) {
    if (!constraints.allowed_broker_destinations.includes(offer.topology.broker_destination)) {
      reasons.push('broker-destination-not-allowed');
    }
  }

  if (offer.topology.provider_destination !== null) {
    if (!constraints.allowed_provider_destinations.includes(offer.topology.provider_destination)) {
      reasons.push('provider-destination-not-allowed');
    }
  }

  const offerData = [
    ...offer.operation.input_data_classes,
    ...offer.operation.output_data_classes
  ];
  if (!subsetOrEqual(offerData, constraints.allowed_data_classes)) {
    reasons.push('data-class-not-allowed');
  }

  if (isPaidQuote(offer.quote)) {
    if (constraints.max_spend === null) {
      reasons.push('paid-operation-not-allowed');
    } else if (offer.quote.currency !== constraints.max_spend.currency) {
      reasons.push('quote-currency-mismatch');
    } else if (offer.quote.max_amount_minor_units === null) {
      reasons.push('quote-max-unknown');
    } else if (offer.quote.max_amount_minor_units > constraints.max_spend.amount_minor_units) {
      reasons.push('quote-exceeds-spend-ceiling');
    }
  }

  return REJECTION_ORDER.filter((code) => reasons.includes(code));
}

export function evaluateExternalOperationOffer(offer, catalogEntry, constraints) {
  validateExternalOperationOffer(offer);
  validateRuntimeConnectorCatalogEntry(catalogEntry);
  validateConstraints(constraints);

  const reasons = eligibilityReasons(offer, catalogEntry, constraints);
  const eligible = reasons.length === 0;

  return Object.freeze({
    schema: EXTERNAL_OPERATION_ELIGIBILITY_RESULT_SCHEMA,
    offer_id: offer.offer_id,
    offer_digest: digestObject(offer),
    catalog_entry_id: catalogEntry.entry_id,
    eligible,
    reasons: Object.freeze([...reasons]),
    authorization_result: 'not-evaluated',
    winner_selected: false,
    execution_effect: 'none'
  });
}

export function validateExternalOperationSpendEnvelope(envelope) {
  requireFields(envelope, ['currency', 'ceiling_minor_units', 'reservations'], 'External operation spend envelope');
  rejectUnknown(
    envelope,
    ['currency', 'ceiling_minor_units', 'reservations'],
    'External operation spend envelope'
  );
  requireString(envelope.currency, 'External operation spend envelope currency', 3);
  if (!CURRENCY_RE.test(envelope.currency)) {
    throw new ValidationError('External operation spend envelope currency is invalid');
  }
  requireInteger(envelope.ceiling_minor_units, 'External operation spend envelope ceiling_minor_units');
  if (!Array.isArray(envelope.reservations) || envelope.reservations.length < 1) {
    throw new ValidationError('External operation spend envelope reservations are invalid');
  }

  const reservationIds = new Set();
  const taskIds = new Set();
  let reserved = 0;
  for (const reservation of envelope.reservations) {
    requireFields(
      reservation,
      ['reservation_id', 'task_id', 'offer_digest', 'amount_minor_units'],
      'External operation spend reservation'
    );
    rejectUnknown(
      reservation,
      ['reservation_id', 'task_id', 'offer_digest', 'amount_minor_units'],
      'External operation spend reservation'
    );
    requireIdentifier(reservation.reservation_id, 'External operation spend reservation.reservation_id');
    requireIdentifier(reservation.task_id, 'External operation spend reservation.task_id');
    requireDigest(reservation.offer_digest, 'External operation spend reservation.offer_digest');
    requireInteger(
      reservation.amount_minor_units,
      'External operation spend reservation.amount_minor_units',
      { min: 0 }
    );
    if (reservationIds.has(reservation.reservation_id)) {
      throw new ValidationError('External operation spend envelope has duplicate reservation_id');
    }
    if (taskIds.has(reservation.task_id)) {
      throw new ValidationError('External operation spend envelope has duplicate task_id');
    }
    reservationIds.add(reservation.reservation_id);
    taskIds.add(reservation.task_id);
    const next = reserved + reservation.amount_minor_units;
    if (!Number.isSafeInteger(next)) {
      throw new ValidationError('External operation spend envelope overflows safe integer range');
    }
    reserved = next;
  }

  if (reserved > envelope.ceiling_minor_units) {
    throw new ValidationError('External operation spend envelope exceeds shared ceiling');
  }

  return Object.freeze({
    valid: true,
    currency: envelope.currency,
    ceiling_minor_units: envelope.ceiling_minor_units,
    reserved_minor_units: reserved,
    remaining_minor_units: envelope.ceiling_minor_units - reserved,
    authority_effect: 'none',
    proposal_only: true
  });
}
