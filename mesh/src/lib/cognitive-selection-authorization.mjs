import {
  canonicalJson,
  digestObject,
  ValidationError
} from './canonical.mjs';
import { COGNITIVE_SELECTION_POLICY_SCHEMA } from './cognitive-selection-proposal.mjs';
import {
  ACTIVE_GATEWAY_CLIENT_CONTRACT,
  gatewayClientRoute
} from './gateway-client-contract.mjs';

export const COGNITIVE_SELECTION_AUTHORIZATION_ACTION =
  'cognitive.selection.authorize';
export const COGNITIVE_SELECTION_AUTHORIZATION_OUTPUT_SCHEMA =
  'axiom-cognitive-selection-authorization-output.v0';
export const COGNITIVE_SELECTION_AUTHORIZATION_DECISION_SCHEMA =
  'axiom-cognitive-selection-authorization-decision.v0';

const PROPOSAL_SCHEMA = 'axiom-cognitive-selection-proposal.v0';
const PROPOSAL_STATUS = 'inert-selection-proposal';
const INTENT_ROUTE_ID = 'intents.submit';
const IDENTIFIER_RE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$/;
const DIGEST_RE = /^[a-f0-9]{64}$/;

const PROPOSAL_FIELDS = Object.freeze([
  'valid',
  'schema',
  'version',
  'status',
  'request_id',
  'request_digest',
  'policy_id',
  'policy_digest',
  'eligibility_report_digest',
  'evaluated_profiles',
  'eligible_profiles',
  'rejected_profiles',
  'ranked_candidates',
  'recommendation_made',
  'recommended_profile_id',
  'recommended_profile_digest',
  'ranking_applied',
  'winner_selected',
  'requires_gateway_authorization',
  'execution_effect',
  'authority_effect',
  'network_effect',
  'credential_visibility',
  'runtime_activation',
  'selection_effect'
]);

const RANKED_CANDIDATE_FIELDS = Object.freeze([
  'rank',
  'profile_id',
  'offering_ref',
  'profile_digest',
  'criterion_values'
]);

const CRITERION_VALUE_FIELDS = Object.freeze(['field', 'value']);

const OUTPUT_FIELDS = Object.freeze([
  'schema',
  'version',
  'proposal_digest',
  'request_id',
  'request_digest',
  'selection_policy_schema',
  'selection_policy_id',
  'selection_policy_digest',
  'eligibility_report_digest',
  'recommended_profile_id',
  'recommended_profile_digest',
  'authority_effect',
  'selection_effect',
  'selection_applied',
  'cognitive_execution_authorized',
  'provider_invocation_authorized',
  'network_effect',
  'credential_visibility',
  'runtime_activation',
  'requires_gateway_completion'
]);

const EVIDENCE_FIELDS = Object.freeze([
  'plan_digest',
  'invocation_digest',
  'capability_consumption_receipt_digest',
  'effect_destination',
  'execution_digest',
  'policy_digest',
  'machine_authority_digest',
  'machine_sponsor'
]);

function requirePlain(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError(`${name} must be an object`);
  }
  return value;
}

function rejectUnknown(value, fields, name) {
  requirePlain(value, name);
  const allowed = new Set(fields);
  for (const field of Object.keys(value)) {
    if (!allowed.has(field)) {
      throw new ValidationError(`${name} contains unknown field ${field}`);
    }
  }
}

function requireExactFields(value, fields, name) {
  rejectUnknown(value, fields, name);
  for (const field of fields) {
    if (!Object.hasOwn(value, field)) {
      throw new ValidationError(`${name} is missing required field ${field}`);
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
  if (typeof value !== 'string' || !DIGEST_RE.test(value)) {
    throw new ValidationError(`${name} must be a SHA-256 digest`);
  }
  return value;
}

function requireCount(value, name) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new ValidationError(`${name} must be a non-negative safe integer`);
  }
  return value;
}

function requireBoolean(value, name) {
  if (typeof value !== 'boolean') {
    throw new ValidationError(`${name} must be a boolean`);
  }
  return value;
}

function requireStringArray(value, name, { maxItems = 64, itemMax = 192 } = {}) {
  if (!Array.isArray(value) || value.length > maxItems) {
    throw new ValidationError(`${name} must be an array with at most ${maxItems} items`);
  }
  const normalized = [];
  const seen = new Set();
  for (let index = 0; index < value.length; index += 1) {
    const item = requireString(value[index], `${name}[${index}]`, itemMax);
    if (seen.has(item)) throw new ValidationError(`${name} contains duplicate value ${item}`);
    seen.add(item);
    normalized.push(item);
  }
  return normalized;
}

function validateCriterionValues(values, candidateIndex) {
  if (!Array.isArray(values) || values.length > 32) {
    throw new ValidationError(`Cognitive selection candidate ${candidateIndex} criterion_values are invalid`);
  }
  const seen = new Set();
  for (let index = 0; index < values.length; index += 1) {
    const criterion = values[index];
    requireExactFields(
      criterion,
      CRITERION_VALUE_FIELDS,
      `Cognitive selection candidate ${candidateIndex} criterion ${index}`
    );
    const field = requireString(criterion.field, 'Cognitive selection criterion field', 96);
    requireString(criterion.value, 'Cognitive selection criterion value', 192);
    if (seen.has(field)) {
      throw new ValidationError(`Cognitive selection candidate ${candidateIndex} duplicates criterion ${field}`);
    }
    seen.add(field);
  }
}

function validateProposal(proposal, { requireRecommendation = false } = {}) {
  requireExactFields(proposal, PROPOSAL_FIELDS, 'Cognitive selection proposal');
  if (proposal.valid !== true) throw new ValidationError('Cognitive selection proposal must be valid');
  if (proposal.schema !== PROPOSAL_SCHEMA || proposal.version !== 0 || proposal.status !== PROPOSAL_STATUS) {
    throw new ValidationError('Cognitive selection proposal identity is invalid');
  }
  requireIdentifier(proposal.request_id, 'Cognitive selection proposal request_id');
  requireDigest(proposal.request_digest, 'Cognitive selection proposal request_digest');
  requireIdentifier(proposal.policy_id, 'Cognitive selection proposal policy_id');
  requireDigest(proposal.policy_digest, 'Cognitive selection proposal policy_digest');
  requireDigest(
    proposal.eligibility_report_digest,
    'Cognitive selection proposal eligibility_report_digest'
  );
  const evaluatedProfiles = requireCount(
    proposal.evaluated_profiles,
    'Cognitive selection proposal evaluated_profiles'
  );
  const eligibleProfiles = requireCount(
    proposal.eligible_profiles,
    'Cognitive selection proposal eligible_profiles'
  );
  if (!Array.isArray(proposal.rejected_profiles)) {
    throw new ValidationError('Cognitive selection proposal rejected_profiles must be an array');
  }
  if (!Array.isArray(proposal.ranked_candidates)) {
    throw new ValidationError('Cognitive selection proposal ranked_candidates must be an array');
  }
  if (eligibleProfiles !== proposal.ranked_candidates.length) {
    throw new ValidationError('Cognitive selection proposal eligible count does not match ranked candidates');
  }
  if (evaluatedProfiles !== eligibleProfiles + proposal.rejected_profiles.length) {
    throw new ValidationError('Cognitive selection proposal evaluated count is inconsistent');
  }

  const profileIds = new Set();
  for (let index = 0; index < proposal.ranked_candidates.length; index += 1) {
    const candidate = proposal.ranked_candidates[index];
    requireExactFields(
      candidate,
      RANKED_CANDIDATE_FIELDS,
      `Cognitive selection candidate ${index}`
    );
    if (candidate.rank !== index + 1) {
      throw new ValidationError('Cognitive selection candidate ranks must be contiguous and deterministic');
    }
    const profileId = requireIdentifier(
      candidate.profile_id,
      `Cognitive selection candidate ${index} profile_id`
    );
    if (profileIds.has(profileId)) {
      throw new ValidationError(`Cognitive selection proposal duplicates profile ${profileId}`);
    }
    profileIds.add(profileId);
    requireString(candidate.offering_ref, `Cognitive selection candidate ${index} offering_ref`, 512);
    requireDigest(candidate.profile_digest, `Cognitive selection candidate ${index} profile_digest`);
    validateCriterionValues(candidate.criterion_values, index);
  }

  requireBoolean(proposal.recommendation_made, 'Cognitive selection proposal recommendation_made');
  requireBoolean(proposal.ranking_applied, 'Cognitive selection proposal ranking_applied');
  requireBoolean(proposal.winner_selected, 'Cognitive selection proposal winner_selected');
  requireBoolean(
    proposal.requires_gateway_authorization,
    'Cognitive selection proposal requires_gateway_authorization'
  );
  requireBoolean(proposal.runtime_activation, 'Cognitive selection proposal runtime_activation');

  if (proposal.ranking_applied !== true) {
    throw new ValidationError('Cognitive selection proposal ranking must already be applied');
  }
  if (proposal.winner_selected !== false) {
    throw new ValidationError('Cognitive selection proposal may not pre-select a winner');
  }
  if (proposal.requires_gateway_authorization !== true) {
    throw new ValidationError('Cognitive selection proposal must require gateway authorization');
  }
  if (
    proposal.execution_effect !== 'none'
    || proposal.authority_effect !== 'none'
    || proposal.network_effect !== 'none'
    || proposal.credential_visibility !== 'none'
    || proposal.runtime_activation !== false
    || proposal.selection_effect !== 'proposal-only'
  ) {
    throw new ValidationError('Cognitive selection proposal boundary is widened');
  }

  if (proposal.recommendation_made) {
    const first = proposal.ranked_candidates[0];
    if (!first) throw new ValidationError('Cognitive selection recommendation has no ranked candidate');
    requireIdentifier(
      proposal.recommended_profile_id,
      'Cognitive selection proposal recommended_profile_id'
    );
    requireDigest(
      proposal.recommended_profile_digest,
      'Cognitive selection proposal recommended_profile_digest'
    );
    if (
      proposal.recommended_profile_id !== first.profile_id
      || proposal.recommended_profile_digest !== first.profile_digest
    ) {
      throw new ValidationError('Cognitive selection recommendation is not bound to rank one');
    }
  } else if (
    proposal.recommended_profile_id !== null
    || proposal.recommended_profile_digest !== null
    || proposal.ranked_candidates.length !== 0
  ) {
    throw new ValidationError('Cognitive selection proposal recommendation fields are inconsistent');
  }

  if (requireRecommendation && !proposal.recommendation_made) {
    throw new ValidationError('Cognitive selection authorization requires an exact recommendation');
  }

  return Object.freeze({
    valid: true,
    proposal_digest: digestObject(proposal),
    recommended_profile_id: proposal.recommended_profile_id,
    recommended_profile_digest: proposal.recommended_profile_digest
  });
}

function authorizationRoute() {
  const route = gatewayClientRoute(INTENT_ROUTE_ID, ACTIVE_GATEWAY_CLIENT_CONTRACT);
  if (
    route.method !== 'POST'
    || route.path !== '/v1/intents'
    || route.request_schema !== 'axiom-intent-request.v1'
    || route.response_schema !== 'axiom-intent-result.v1'
    || route.idempotency !== 'required'
  ) {
    throw new ValidationError('Cognitive selection authorization gateway route is invalid');
  }
  return route;
}

export function buildCognitiveSelectionAuthorizationIntent(proposal, options = {}) {
  validateProposal(proposal, { requireRecommendation: true });
  requirePlain(options, 'Cognitive selection authorization options');
  const allowedOptions = ['purpose', 'confirmations', 'approval_ids'];
  rejectUnknown(options, allowedOptions, 'Cognitive selection authorization options');
  authorizationRoute();

  const purpose = options.purpose === undefined
    ? 'cognitive-selection-authorization'
    : requireString(options.purpose, 'Cognitive selection authorization purpose', 512);
  const confirmations = options.confirmations === undefined
    ? []
    : requireStringArray(options.confirmations, 'Cognitive selection authorization confirmations', {
        maxItems: 16,
        itemMax: 160
      });
  const approvalIds = options.approval_ids === undefined
    ? []
    : requireStringArray(options.approval_ids, 'Cognitive selection authorization approval_ids', {
        maxItems: 16,
        itemMax: 160
      });

  return deepFreeze({
    action: COGNITIVE_SELECTION_AUTHORIZATION_ACTION,
    input: { proposal: structuredClone(proposal) },
    purpose,
    data_scopes: [],
    confirmations,
    approval_ids: approvalIds
  });
}

export function buildCognitiveSelectionAuthorizationOutput(proposal) {
  const validation = validateProposal(proposal, { requireRecommendation: true });
  authorizationRoute();
  return deepFreeze({
    schema: COGNITIVE_SELECTION_AUTHORIZATION_OUTPUT_SCHEMA,
    version: 0,
    proposal_digest: validation.proposal_digest,
    request_id: proposal.request_id,
    request_digest: proposal.request_digest,
    selection_policy_schema: COGNITIVE_SELECTION_POLICY_SCHEMA,
    selection_policy_id: proposal.policy_id,
    selection_policy_digest: proposal.policy_digest,
    eligibility_report_digest: proposal.eligibility_report_digest,
    recommended_profile_id: validation.recommended_profile_id,
    recommended_profile_digest: validation.recommended_profile_digest,
    authority_effect: 'none',
    selection_effect: 'authorization-output-only',
    selection_applied: false,
    cognitive_execution_authorized: false,
    provider_invocation_authorized: false,
    network_effect: 'none',
    credential_visibility: 'none',
    runtime_activation: false,
    requires_gateway_completion: true
  });
}

function validateOutputFields(result, expected) {
  for (const field of OUTPUT_FIELDS) {
    if (!Object.hasOwn(result, field)) {
      throw new ValidationError(`Cognitive selection authorization output is missing ${field}`);
    }
    if (canonicalJson(result[field]) !== canonicalJson(expected[field])) {
      throw new ValidationError(`Cognitive selection authorization output mismatch for ${field}`);
    }
  }
}

function validateEvidence(raw) {
  rejectUnknown(raw, EVIDENCE_FIELDS, 'Cognitive selection authorization evidence');
  for (const field of [
    'plan_digest',
    'invocation_digest',
    'capability_consumption_receipt_digest',
    'execution_digest',
    'policy_digest'
  ]) {
    if (!Object.hasOwn(raw, field)) {
      throw new ValidationError(`Cognitive selection authorization evidence is missing ${field}`);
    }
    requireDigest(raw[field], `Cognitive selection authorization evidence ${field}`);
  }
  if (raw.effect_destination !== undefined && raw.effect_destination !== 'local') {
    throw new ValidationError('Cognitive selection authorization effect destination must remain local when asserted');
  }
  if (raw.machine_authority_digest !== undefined) {
    requireDigest(
      raw.machine_authority_digest,
      'Cognitive selection authorization evidence machine_authority_digest'
    );
  }
  if (raw.machine_sponsor !== undefined) {
    requireIdentifier(
      raw.machine_sponsor,
      'Cognitive selection authorization evidence machine_sponsor'
    );
  }
  return deepFreeze(structuredClone(raw));
}

function validateGatewayResultShape(result) {
  requirePlain(result, 'Cognitive selection authorization result');
  const allowed = new Set([
    ...OUTPUT_FIELDS,
    'intent_id',
    'trace_id',
    'status',
    'evidence',
    'assurance'
  ]);
  for (const field of Object.keys(result)) {
    if (!allowed.has(field)) {
      throw new ValidationError(`Cognitive selection authorization result contains unknown field ${field}`);
    }
  }
  if (result.status !== 'completed') {
    throw new ValidationError('Cognitive selection authorization result must be completed');
  }
  requireIdentifier(result.intent_id, 'Cognitive selection authorization intent_id');
  requireIdentifier(result.trace_id, 'Cognitive selection authorization trace_id');
  if (result.assurance !== undefined) {
    requirePlain(result.assurance, 'Cognitive selection authorization assurance');
  }
}

export function validateCognitiveSelectionAuthorizationResult(result, proposal) {
  const expected = buildCognitiveSelectionAuthorizationOutput(proposal);
  validateGatewayResultShape(result);
  validateOutputFields(result, expected);
  const evidence = validateEvidence(result.evidence);
  authorizationRoute();

  const executionOutput = result.assurance === undefined
    ? expected
    : { ...expected, assurance: structuredClone(result.assurance) };
  const expectedExecutionDigest = digestObject({ output: executionOutput });
  if (evidence.execution_digest !== expectedExecutionDigest) {
    throw new ValidationError('Cognitive selection authorization execution digest does not bind the authorization output');
  }

  const gatewayContractDigest = digestObject(ACTIVE_GATEWAY_CLIENT_CONTRACT);
  const evidenceBinding = deepFreeze({
    gateway_route_id: INTENT_ROUTE_ID,
    gateway_contract_digest: gatewayContractDigest,
    proposal_digest: expected.proposal_digest,
    intent_id: result.intent_id,
    trace_id: result.trace_id,
    evidence
  });
  const authorizationEvidenceDigest = digestObject(evidenceBinding);

  const decisionBody = {
    valid: true,
    schema: COGNITIVE_SELECTION_AUTHORIZATION_DECISION_SCHEMA,
    version: 0,
    status: 'authorized',
    authorization_intent_completed: true,
    proposal_digest: expected.proposal_digest,
    recommended_profile_id: expected.recommended_profile_id,
    recommended_profile_digest: expected.recommended_profile_digest,
    intent_id: result.intent_id,
    trace_id: result.trace_id,
    gateway_route_id: INTENT_ROUTE_ID,
    gateway_contract_schema: ACTIVE_GATEWAY_CLIENT_CONTRACT.schema,
    gateway_contract_digest: gatewayContractDigest,
    policy_digest: evidence.policy_digest,
    effect_destination: evidence.effect_destination ?? null,
    authority_effect: 'selection-authorization-only',
    selection_authorized: true,
    selection_applied: false,
    cognitive_execution_authorized: false,
    provider_invocation_authorized: false,
    network_effect: 'none',
    credential_visibility: 'none',
    runtime_activation: false,
    evidence,
    authorization_evidence_digest: authorizationEvidenceDigest
  };
  return deepFreeze({
    ...decisionBody,
    decision_digest: digestObject(decisionBody)
  });
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
