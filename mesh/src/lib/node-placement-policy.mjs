import { digestObject, ValidationError } from './canonical.mjs';

export const NODE_PLACEMENT_POLICY_SCHEMA = 'axiom-node-placement-policy.v0';

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:#/-]{0,191}$/;
const CURRENCY = /^[A-Z]{3}$/;
const EGRESS = new Set(['none','owner-lan','owner-vpn','managed-private','public-provider']);
const LOCALITY_POLICIES = new Set(['owner-local-only','private-network-allowed','public-provider-allowed']);
const LOCALITIES = new Set(['owner-local','owner-private-remote','managed-private','public-provider']);
const OBSERVATION_STATES = new Set(['current','stale','unknown']);
const PREFERENCES = new Set(['locality','trust','latency','cost','energy']);
const LOCALITY_RANK = new Map([
  ['owner-local',0],
  ['owner-private-remote',1],
  ['managed-private',2],
  ['public-provider',3]
]);

export function validateNodePlacementPolicy(document) {
  exactObject(document, 'Node placement policy', [
    'schema','version','status','placement_id','outcome_id','task_id',
    'requested_egress_class','locality_policy','required_residency_regions',
    'required_capabilities','required_runtime_ids','required_model_refs','required_tool_refs',
    'minimum_security_level','require_attestation','max_latency_ms','max_cost',
    'max_energy_millijoules','optimization_currency','preference_order',
    'grants_authority','execution_effect','runtime_activation'
  ]);
  if (
    document.schema !== NODE_PLACEMENT_POLICY_SCHEMA
    || document.version !== 0
    || document.status !== 'inert-contract-laboratory'
    || document.grants_authority !== false
    || document.execution_effect !== 'none'
    || document.runtime_activation !== false
  ) throw new ValidationError('Node placement policy activation boundary is invalid');

  id(document.placement_id, 'placement_id');
  id(document.outcome_id, 'outcome_id');
  id(document.task_id, 'task_id');
  if (!EGRESS.has(document.requested_egress_class)) throw new ValidationError('requested_egress_class is invalid');
  if (!LOCALITY_POLICIES.has(document.locality_policy)) throw new ValidationError('locality_policy is invalid');
  textArray(document.required_residency_regions, 'required_residency_regions', 64, 128);
  idArray(document.required_capabilities, 'required_capabilities', 128);
  idArray(document.required_runtime_ids, 'required_runtime_ids', 128);
  idArray(document.required_model_refs, 'required_model_refs', 128);
  idArray(document.required_tool_refs, 'required_tool_refs', 128);
  integer(document.minimum_security_level, 'minimum_security_level', 0, 3);
  if (typeof document.require_attestation !== 'boolean') throw new ValidationError('require_attestation must be boolean');
  nullableInteger(document.max_latency_ms, 'max_latency_ms', 0);
  validateCost(document.max_cost, 'max_cost');
  nullableInteger(document.max_energy_millijoules, 'max_energy_millijoules', 0);
  if (document.optimization_currency !== null) {
    if (typeof document.optimization_currency !== 'string' || !CURRENCY.test(document.optimization_currency)) {
      throw new ValidationError('optimization_currency is invalid');
    }
  }
  enumArray(document.preference_order, 'preference_order', PREFERENCES, 1, 5);
  if (document.preference_order.includes('cost') && document.optimization_currency === null) {
    throw new ValidationError('cost preference requires optimization_currency');
  }
  return Object.freeze({
    valid:true,
    schema:document.schema,
    placement_id:document.placement_id,
    policy_digest:digestObject(document),
    authority_effect:'none',
    execution_effect:'none',
    runtime_activation:false
  });
}

export function nodePlacementPolicyDigest(document) {
  validateNodePlacementPolicy(document);
  return digestObject(document);
}

export function evaluateNodePlacements(policy, candidates, { evaluatedAt } = {}) {
  validateNodePlacementPolicy(policy);
  const instant = canonicalDate(evaluatedAt, 'evaluatedAt');
  if (!Array.isArray(candidates) || candidates.length > 4096) {
    throw new ValidationError('Node placement candidates must be an array with at most 4096 items');
  }
  const seen = new Set();
  const evaluations = candidates.map(candidate => {
    validateCandidate(candidate);
    if (seen.has(candidate.node_id)) throw new ValidationError('Duplicate node placement candidate: ' + candidate.node_id);
    seen.add(candidate.node_id);
    return evaluateCandidate(policy, candidate, instant);
  });
  const eligible = evaluations
    .filter(item => item.eligible)
    .sort((left, right) => compareEligible(policy, left.candidate, right.candidate));
  const rejected = evaluations
    .filter(item => !item.eligible)
    .sort((left, right) => left.candidate.node_id.localeCompare(right.candidate.node_id));
  return Object.freeze({
    schema:'axiom-node-placement-evaluation.v0',
    placement_id:policy.placement_id,
    evaluated_at:new Date(instant).toISOString(),
    policy_digest:digestObject(policy),
    eligible:Object.freeze(eligible.map((item, index) => Object.freeze({
      rank:index + 1,
      node_id:item.candidate.node_id,
      reasons:Object.freeze([])
    }))),
    rejected:Object.freeze(rejected.map(item => Object.freeze({
      node_id:item.candidate.node_id,
      reasons:Object.freeze([...item.reasons])
    }))),
    selected_node_id:eligible[0]?.candidate.node_id ?? null,
    grants_authority:false,
    execution_effect:'none',
    runtime_activation:false
  });
}

function evaluateCandidate(policy, candidate, instant) {
  const reasons = [];
  const observed = canonicalDate(candidate.observed_at, 'candidate observed_at');
  const expires = canonicalDate(candidate.expires_at, 'candidate expires_at');
  if (candidate.observation_state !== 'current' || observed > instant || expires <= instant) {
    reasons.push('observation-not-current');
  }
  if (!localityAllowed(policy.locality_policy, candidate.locality)) reasons.push('locality-denied');
  if (
    policy.required_residency_regions.length
    && !policy.required_residency_regions.includes(candidate.residency_region)
  ) reasons.push('residency-denied');
  if (!candidate.supported_egress_classes.includes(policy.requested_egress_class)) {
    reasons.push('egress-class-unsupported');
  }
  subsetReasons(policy.required_capabilities, candidate.capabilities, 'capability-missing', reasons);
  subsetReasons(policy.required_runtime_ids, candidate.runtime_ids, 'runtime-missing', reasons);
  subsetReasons(policy.required_model_refs, candidate.model_refs, 'model-missing', reasons);
  subsetReasons(policy.required_tool_refs, candidate.tool_refs, 'tool-missing', reasons);
  if (candidate.security_level < policy.minimum_security_level) reasons.push('security-level-insufficient');
  if (policy.require_attestation && candidate.attested !== true) reasons.push('attestation-required');

  if (policy.max_latency_ms !== null) {
    if (candidate.latency_ms === null) reasons.push('latency-unknown');
    else if (candidate.latency_ms > policy.max_latency_ms) reasons.push('latency-exceeds-limit');
  }
  if (policy.max_cost !== null) {
    if (candidate.cost === null) reasons.push('cost-unknown');
    else if (candidate.cost.currency !== policy.max_cost.currency) reasons.push('cost-currency-mismatch');
    else if (candidate.cost.minor_units > policy.max_cost.max_minor_units) reasons.push('cost-exceeds-limit');
  }
  if (policy.max_energy_millijoules !== null) {
    if (candidate.energy_millijoules === null) reasons.push('energy-unknown');
    else if (candidate.energy_millijoules > policy.max_energy_millijoules) reasons.push('energy-exceeds-limit');
  }
  return { candidate, eligible:reasons.length === 0, reasons };
}

function compareEligible(policy, left, right) {
  for (const preference of policy.preference_order) {
    const compared = comparePreference(preference, policy, left, right);
    if (compared !== 0) return compared;
  }
  return left.node_id.localeCompare(right.node_id);
}

function comparePreference(preference, policy, left, right) {
  if (preference === 'locality') {
    return LOCALITY_RANK.get(left.locality) - LOCALITY_RANK.get(right.locality);
  }
  if (preference === 'trust') {
    return right.security_level - left.security_level
      || Number(right.attested) - Number(left.attested);
  }
  if (preference === 'latency') return nullableAscending(left.latency_ms, right.latency_ms);
  if (preference === 'energy') return nullableAscending(left.energy_millijoules, right.energy_millijoules);
  if (preference === 'cost') {
    const leftCost = comparableCost(left.cost, policy.optimization_currency);
    const rightCost = comparableCost(right.cost, policy.optimization_currency);
    return nullableAscending(leftCost, rightCost);
  }
  return 0;
}

function comparableCost(cost, currency) {
  if (cost === null || cost.currency !== currency) return null;
  return cost.minor_units;
}

function nullableAscending(left, right) {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return left - right;
}

function localityAllowed(policy, locality) {
  if (policy === 'owner-local-only') return locality === 'owner-local';
  if (policy === 'private-network-allowed') {
    return ['owner-local','owner-private-remote','managed-private'].includes(locality);
  }
  return true;
}

function validateCandidate(candidate) {
  exactObject(candidate, 'Node placement candidate', [
    'node_id','locality','residency_region','supported_egress_classes','capabilities',
    'runtime_ids','model_refs','tool_refs','security_level','attested','latency_ms',
    'cost','energy_millijoules','observation_state','observed_at','expires_at'
  ]);
  id(candidate.node_id, 'candidate node_id');
  if (!LOCALITIES.has(candidate.locality)) throw new ValidationError('candidate locality is invalid');
  text(candidate.residency_region, 'candidate residency_region', 2, 128);
  enumArray(candidate.supported_egress_classes, 'candidate supported_egress_classes', EGRESS, 1, 5);
  idArray(candidate.capabilities, 'candidate capabilities', 128);
  idArray(candidate.runtime_ids, 'candidate runtime_ids', 128);
  idArray(candidate.model_refs, 'candidate model_refs', 128);
  idArray(candidate.tool_refs, 'candidate tool_refs', 128);
  integer(candidate.security_level, 'candidate security_level', 0, 3);
  if (typeof candidate.attested !== 'boolean') throw new ValidationError('candidate attested must be boolean');
  nullableInteger(candidate.latency_ms, 'candidate latency_ms', 0);
  validateCandidateCost(candidate.cost);
  nullableInteger(candidate.energy_millijoules, 'candidate energy_millijoules', 0);
  if (!OBSERVATION_STATES.has(candidate.observation_state)) throw new ValidationError('candidate observation_state is invalid');
  const observed = canonicalDate(candidate.observed_at, 'candidate observed_at');
  const expires = canonicalDate(candidate.expires_at, 'candidate expires_at');
  if (expires <= observed) throw new ValidationError('candidate expires_at must follow observed_at');
  return candidate;
}

function validateCost(value, label) {
  if (value === null) return null;
  exactObject(value, label, ['currency','max_minor_units']);
  if (typeof value.currency !== 'string' || !CURRENCY.test(value.currency)) throw new ValidationError(label + ' currency is invalid');
  integer(value.max_minor_units, label + ' max_minor_units', 0, Number.MAX_SAFE_INTEGER);
  return value;
}

function validateCandidateCost(value) {
  if (value === null) return null;
  exactObject(value, 'candidate cost', ['currency','minor_units']);
  if (typeof value.currency !== 'string' || !CURRENCY.test(value.currency)) throw new ValidationError('candidate cost currency is invalid');
  integer(value.minor_units, 'candidate cost minor_units', 0, Number.MAX_SAFE_INTEGER);
  return value;
}

function subsetReasons(required, available, prefix, reasons) {
  const set = new Set(available);
  for (const item of required) if (!set.has(item)) reasons.push(prefix + ':' + item);
}

function exactObject(value, label, fields) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ValidationError(label + ' must be an object');
  const actual = Object.keys(value).sort().join(',');
  const expected = [...fields].sort().join(',');
  if (actual !== expected) throw new ValidationError(label + ' fields are invalid');
}
function id(value, label) {
  if (typeof value !== 'string' || !IDENTIFIER.test(value)) throw new ValidationError(label + ' is invalid');
  return value;
}
function text(value, label, minimum, maximum) {
  if (typeof value !== 'string' || value.trim().length < minimum || value.length > maximum) throw new ValidationError(label + ' has invalid length');
  return value;
}
function idArray(value, label, maximum) {
  if (!Array.isArray(value) || value.length > maximum) throw new ValidationError(label + ' has invalid cardinality');
  const seen = new Set();
  for (const item of value) {
    id(item, label + ' item');
    if (seen.has(item)) throw new ValidationError(label + ' contains duplicate values');
    seen.add(item);
  }
}
function textArray(value, label, maximum, itemMaximum) {
  if (!Array.isArray(value) || value.length > maximum) throw new ValidationError(label + ' has invalid cardinality');
  const seen = new Set();
  for (const item of value) {
    text(item, label + ' item', 1, itemMaximum);
    if (seen.has(item)) throw new ValidationError(label + ' contains duplicate values');
    seen.add(item);
  }
}
function enumArray(value, label, allowed, minimum, maximum) {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) throw new ValidationError(label + ' has invalid cardinality');
  const seen = new Set();
  for (const item of value) {
    if (!allowed.has(item)) throw new ValidationError(label + ' contains invalid value');
    if (seen.has(item)) throw new ValidationError(label + ' contains duplicate values');
    seen.add(item);
  }
}
function integer(value, label, minimum, maximum = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new ValidationError(label + ' is invalid');
}
function nullableInteger(value, label, minimum) { if (value === null) return null; integer(value, label, minimum); return value; }
function canonicalDate(value, label) {
  if (typeof value !== 'string' || value.length > 64) throw new ValidationError(label + ' must be a canonical ISO timestamp');
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) throw new ValidationError(label + ' must be a canonical ISO timestamp');
  return parsed.getTime();
}
