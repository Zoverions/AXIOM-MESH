import {
  canonicalJson,
  digestObject,
  ValidationError
} from './canonical.mjs';
import {
  DATA_CLASSES,
  contractDigest,
  verifyFlowContext
} from './agent-containment-contracts.mjs';

const MAX_EVALUATION_OBJECT_BYTES = 32_768;
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;
const DATA_CLASS_SET = new Set(DATA_CLASSES);
const REASON_ORDER = Object.freeze([
  'policy_profile_mismatch',
  'authority_bearing_material_observed',
  'action_not_allowed',
  'provider_not_allowed',
  'destination_not_allowed',
  'purpose_not_allowed',
  'data_class_not_allowed',
  'credential_surrogate_required',
  'approval_required'
]);

const REQUEST_REQUIRED_FIELDS = Object.freeze([
  'schema',
  'action',
  'provider_or_connector',
  'destination',
  'purpose',
  'requires_credential'
]);
const REQUEST_OPTIONAL_FIELDS = Object.freeze([
  'credential_surrogate_digest',
  'approval_challenge_digest'
]);
const POLICY_FIELDS = Object.freeze([
  'schema',
  'policy_profile_digest',
  'allowed_actions',
  'allowed_providers_or_connectors',
  'allowed_destinations',
  'allowed_purposes',
  'allowed_data_classes',
  'approval_required_for_data_classes',
  'credential_surrogate_required'
]);

function unionSorted(...groups) {
  return [...new Set(groups.flat(2))].sort();
}

function fail(message) {
  throw new ValidationError(message);
}

function boundedPlainObject(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${name} must be an ordinary plain object`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    fail(`${name} must be an ordinary plain object`);
  }
  let encoded;
  try {
    encoded = canonicalJson(value);
  } catch (error) {
    fail(`${name} must contain canonical plain JSON data: ${error.message}`);
  }
  if (Buffer.byteLength(encoded, 'utf8') > MAX_EVALUATION_OBJECT_BYTES) {
    fail(`${name} exceeds 32768 bytes`);
  }
  return JSON.parse(encoded);
}

function assertClosedRequired(value, required, optional, name) {
  const allowed = new Set([...required, ...optional]);
  for (const field of Object.keys(value)) {
    if (!allowed.has(field)) fail(`${name} contains unsupported field ${field}`);
  }
  for (const field of required) {
    if (!Object.hasOwn(value, field)) fail(`${name} missing required field ${field}`);
  }
}

function assertString(value, name, max = 2048) {
  if (typeof value !== 'string' || value.length === 0 || value.length > max) {
    fail(`${name} must be a non-empty string no longer than ${max} characters`);
  }
  return value;
}

function assertExactLiteral(value, name, max = 2048, { destination = false } = {}) {
  assertString(value, name, max);
  if (/[*[\]{}]/.test(value) || (!destination && value.includes('?'))) {
    fail(`${name} must be exact and cannot contain wildcard or glob metacharacters`);
  }
  return value;
}

function assertDigest(value, name) {
  if (typeof value !== 'string' || !DIGEST_PATTERN.test(value)) {
    fail(`${name} must be a sha256 digest`);
  }
  return value;
}

function assertBoolean(value, name) {
  if (typeof value !== 'boolean') fail(`${name} must be boolean`);
  return value;
}

function assertUniqueExactSet(value, name, {
  minItems = 1,
  maxItems,
  itemMax = 256,
  destination = false,
  vocabulary = null
}) {
  if (!Array.isArray(value) || value.length < minItems || value.length > maxItems) {
    const minimum = minItems === 0 ? 'zero' : minItems === 1 ? 'one' : String(minItems);
    fail(`${name} must contain at least ${minimum} and at most ${maxItems} items`);
  }
  const seen = new Set();
  for (let index = 0; index < value.length; index += 1) {
    const item = assertExactLiteral(value[index], `${name}[${index}]`, itemMax, { destination });
    if (vocabulary && !vocabulary.has(item)) {
      fail(`${name}[${index}] has unknown data class ${item}`);
    }
    if (seen.has(item)) fail(`${name} contains duplicate value ${item}`);
    seen.add(item);
  }
  return value;
}

function verifyEvaluationRequest(input) {
  const value = boundedPlainObject(input, 'flow egress request');
  assertClosedRequired(
    value,
    REQUEST_REQUIRED_FIELDS,
    REQUEST_OPTIONAL_FIELDS,
    'flow egress request'
  );
  if (value.schema !== 'axiom-flow-egress-request.v0') {
    fail('flow egress request schema mismatch');
  }
  assertExactLiteral(value.action, 'flow egress request action', 256);
  assertExactLiteral(value.provider_or_connector, 'flow egress request provider_or_connector', 256);
  assertExactLiteral(value.destination, 'flow egress request destination', 2048, { destination: true });
  assertExactLiteral(value.purpose, 'flow egress request purpose', 256);
  assertBoolean(value.requires_credential, 'flow egress request requires_credential');
  if (Object.hasOwn(value, 'credential_surrogate_digest')) {
    assertDigest(value.credential_surrogate_digest, 'flow egress request credential_surrogate_digest');
  }
  if (Object.hasOwn(value, 'approval_challenge_digest')) {
    assertDigest(value.approval_challenge_digest, 'flow egress request approval_challenge_digest');
  }
  return value;
}

function verifyEvaluationPolicy(input) {
  const value = boundedPlainObject(input, 'flow egress policy');
  assertClosedRequired(value, POLICY_FIELDS, [], 'flow egress policy');
  if (value.schema !== 'axiom-flow-egress-policy.v0') {
    fail('flow egress policy schema mismatch');
  }
  assertDigest(value.policy_profile_digest, 'flow egress policy policy_profile_digest');
  assertUniqueExactSet(value.allowed_actions, 'flow egress policy allowed_actions', {
    maxItems: 64
  });
  assertUniqueExactSet(
    value.allowed_providers_or_connectors,
    'flow egress policy allowed_providers_or_connectors',
    { maxItems: 32 }
  );
  assertUniqueExactSet(value.allowed_destinations, 'flow egress policy allowed_destinations', {
    maxItems: 32,
    itemMax: 2048,
    destination: true
  });
  assertUniqueExactSet(value.allowed_purposes, 'flow egress policy allowed_purposes', {
    maxItems: 32
  });
  assertUniqueExactSet(value.allowed_data_classes, 'flow egress policy allowed_data_classes', {
    maxItems: DATA_CLASSES.length,
    vocabulary: DATA_CLASS_SET
  });
  assertUniqueExactSet(
    value.approval_required_for_data_classes,
    'flow egress policy approval_required_for_data_classes',
    {
      minItems: 0,
      maxItems: DATA_CLASSES.length,
      vocabulary: DATA_CLASS_SET
    }
  );
  assertBoolean(
    value.credential_surrogate_required,
    'flow egress policy credential_surrogate_required'
  );
  return value;
}

export function deriveFlowContext(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new ValidationError('flow derivation input must be an object');
  }
  if (!Array.isArray(input.parents)) {
    throw new ValidationError('flow parents must be an array');
  }
  if (input.parents.length > 8) {
    throw new ValidationError('flow parent count exceeds 8');
  }

  const parents = input.parents.map(verifyFlowContext);
  for (const parent of parents) {
    if (parent.root_task_id !== input.root_task_id) {
      throw new ValidationError('flow parent root task mismatch');
    }
    if (parent.policy_profile_digest !== input.policy_profile_digest) {
      throw new ValidationError('flow parent policy digest mismatch');
    }
  }

  const lineageDepth = parents.length === 0
    ? 0
    : 1 + Math.max(...parents.map(item => item.lineage_depth));
  if (lineageDepth > 16) {
    throw new ValidationError('flow lineage depth exceeds 16');
  }

  const raw = {
    schema: 'axiom-flow-context.v0',
    flow_context_id: input.id,
    principal: input.principal,
    runtime_identity: input.runtime_identity,
    root_task_id: input.root_task_id,
    parent_flow_contexts: parents.map(item => ({
      flow_context_id: item.flow_context_id,
      flow_digest: item.flow_digest
    })),
    lineage_depth: lineageDepth,
    observed_data_classes: unionSorted(
      parents.map(item => item.observed_data_classes),
      input.observed_data_classes
    ),
    observed_authority_classes: unionSorted(
      parents.map(item => item.observed_authority_classes),
      input.observed_authority_classes
    ),
    owner_or_domain_scopes: unionSorted(
      parents.map(item => item.owner_or_domain_scopes),
      input.owner_or_domain_scopes
    ),
    purpose_scopes: unionSorted(
      parents.map(item => item.purpose_scopes),
      input.purpose_scopes
    ),
    source_commitments: unionSorted(
      parents.map(item => item.source_commitments),
      input.source_commitments
    ),
    created_at: input.created_at,
    updated_at: input.updated_at,
    policy_profile_digest: input.policy_profile_digest
  };
  raw.flow_digest = contractDigest(raw, 'flow_digest');
  return verifyFlowContext(raw);
}

export function evaluateProtectedEgress({ flow_context, request, policy }) {
  const flow = verifyFlowContext(flow_context);
  const req = verifyEvaluationRequest(request);
  const rule = verifyEvaluationPolicy(policy);
  const reasons = new Set();

  if (rule.policy_profile_digest !== flow.policy_profile_digest) {
    reasons.add('policy_profile_mismatch');
  }
  if (flow.observed_authority_classes.length > 0) {
    reasons.add('authority_bearing_material_observed');
  }
  if (!rule.allowed_actions.includes(req.action)) {
    reasons.add('action_not_allowed');
  }
  if (!rule.allowed_providers_or_connectors.includes(req.provider_or_connector)) {
    reasons.add('provider_not_allowed');
  }
  if (!rule.allowed_destinations.includes(req.destination)) {
    reasons.add('destination_not_allowed');
  }
  if (!rule.allowed_purposes.includes(req.purpose)) {
    reasons.add('purpose_not_allowed');
  }
  if (flow.observed_data_classes.some(value => !rule.allowed_data_classes.includes(value))) {
    reasons.add('data_class_not_allowed');
  }
  if (
    req.requires_credential
    && rule.credential_surrogate_required
    && !req.credential_surrogate_digest
  ) {
    reasons.add('credential_surrogate_required');
  }
  if (
    flow.observed_data_classes.some(value => (
      rule.approval_required_for_data_classes.includes(value)
    ))
    && !req.approval_challenge_digest
  ) {
    reasons.add('approval_required');
  }

  const reasonCodes = REASON_ORDER.filter(code => reasons.has(code));
  return Object.freeze({
    schema: 'axiom-flow-evaluation.v0',
    decision: reasonCodes.length ? 'deny' : 'allow',
    reason_codes: reasonCodes.length ? reasonCodes : ['allow'],
    flow_context_digest: flow.flow_digest,
    policy_profile_digest: rule.policy_profile_digest,
    request_digest: `sha256:${digestObject(req)}`
  });
}
