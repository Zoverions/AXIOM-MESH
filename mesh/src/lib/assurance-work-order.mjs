import { randomInt } from 'node:crypto';
import {
  ValidationError,
  assertPlainObject,
  assertString,
  digestObject
} from './canonical.mjs';
import {
  validateAdaptiveAssuranceDecision
} from './adaptive-assurance.mjs';
import {
  evaluateVerifierIndependence,
  normalizeVerifierProfile
} from './verifier-independence.mjs';
import { AssuranceWorkBudget } from './assurance-work-budget.mjs';

export const ASSURANCE_WORK_ORDER_SCHEMA = 'axiom-assurance-work-order.v1';

const CHECK_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$/;
const MACHINE_CHECKS = new Set([
  'independent-context-verification',
  'adversarial-review',
  'provenance-review',
  'correlation-aware-cross-check',
  'stochastic-supplemental-audit'
]);
const EXTERNAL_CHECKS = new Set([
  'normal-policy-and-authority-path',
  'explicit-human-or-policy-designated-independent-approval'
]);

function checkId(value, label) {
  return assertString(value, label, {
    min: 1,
    max: 192,
    pattern: CHECK_ID
  });
}

function integer(value, label, min, max) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new ValidationError(`${label} must be an integer between ${min} and ${max}`);
  }
  return value;
}

function normalizeCost(raw, check) {
  const value = assertPlainObject(raw, `assurance work cost ${check}`);
  const allowed = new Set([
    'compute_units',
    'external_cost_units',
    'elapsed_ms'
  ]);
  const unknown = Object.keys(value).filter(key => !allowed.has(key));
  if (unknown.length) {
    throw new ValidationError(
      `assurance work cost ${check} contains unsupported fields: ${unknown.join(', ')}`
    );
  }
  return Object.freeze({
    compute_units: integer(value.compute_units, `${check}.compute_units`, 0, 1_000_000_000),
    external_cost_units: integer(
      value.external_cost_units,
      `${check}.external_cost_units`,
      0,
      1_000_000_000
    ),
    elapsed_ms: integer(value.elapsed_ms, `${check}.elapsed_ms`, 0, 86_400_000)
  });
}

function eligibleForCheck(check, item, origin) {
  if (!item.independence.meaningful_independence) return false;

  if (check === 'independent-context-verification') {
    return (
      item.independence.independent_context
      || item.independence.independent_evidence
    );
  }
  if (check === 'adversarial-review') {
    return (
      item.candidate.method_id !== origin.method_id
      && (
        item.independence.independent_context
        || item.independence.independent_evidence
      )
    );
  }
  if (check === 'provenance-review') {
    return item.independence.independent_evidence;
  }
  if (check === 'correlation-aware-cross-check') {
    return (
      item.candidate.runtime_id !== origin.runtime_id
      || (
        item.candidate.model_family !== 'family.unverified'
        && origin.model_family !== 'family.unverified'
        && item.candidate.model_family !== origin.model_family
      )
      || (
        item.candidate.operator_domain !== 'operator.unverified'
        && origin.operator_domain !== 'operator.unverified'
        && item.candidate.operator_domain !== origin.operator_domain
      )
    );
  }
  return true;
}

function randomIndex(length, randomIntFn) {
  if (!Number.isSafeInteger(length) || length < 1) {
    throw new ValidationError('assurance work selection requires at least one candidate');
  }
  const selected = randomIntFn(0, length);
  if (!Number.isSafeInteger(selected) || selected < 0 || selected >= length) {
    throw new ValidationError('assurance work random source returned an invalid index');
  }
  return selected;
}

export function compileAssuranceWorkOrder({
  decision,
  originVerifierProfile,
  verifierCandidates,
  checkCosts,
  budgetLimits,
  randomIntFn = randomInt
} = {}) {
  const adaptiveDecision = validateAdaptiveAssuranceDecision(decision);
  const origin = normalizeVerifierProfile(originVerifierProfile);
  if (!Array.isArray(verifierCandidates) || verifierCandidates.length > 256) {
    throw new ValidationError('assurance work verifierCandidates must contain at most 256 items');
  }
  const candidates = verifierCandidates.map(normalizeVerifierProfile);
  const verifierIds = candidates.map(item => item.verifier_id);
  if (new Set(verifierIds).size !== verifierIds.length) {
    throw new ValidationError('assurance work verifier candidate identities must be unique');
  }
  if (verifierIds.includes(origin.verifier_id)) {
    throw new ValidationError('assurance work candidates must not include the origin verifier');
  }
  if (typeof randomIntFn !== 'function') {
    throw new ValidationError('assurance work compiler requires randomIntFn');
  }
  const costs = assertPlainObject(checkCosts, 'assurance work checkCosts');
  const budget = new AssuranceWorkBudget(budgetLimits);

  if (
    !Array.isArray(adaptiveDecision.required_checks)
    || adaptiveDecision.required_checks.length < 1
    || adaptiveDecision.required_checks.length > 32
  ) {
    throw new ValidationError('adaptive assurance decision required_checks is invalid');
  }

  const requiredChecks = adaptiveDecision.required_checks.map((item, index) => (
    checkId(item, `adaptive assurance required_checks[${index}]`)
  ));
  if (new Set(requiredChecks).size !== requiredChecks.length) {
    throw new ValidationError('adaptive assurance decision required_checks must be unique');
  }

  const assignments = [];
  const externalObligations = [];
  const usedVerifierIds = new Set();

  for (const check of requiredChecks) {
    if (EXTERNAL_CHECKS.has(check)) {
      externalObligations.push(check);
      continue;
    }
    if (!MACHINE_CHECKS.has(check)) {
      throw new ValidationError(`assurance work check is unsupported: ${check}`);
    }
    if (!Object.hasOwn(costs, check)) {
      throw new ValidationError(`assurance work cost is missing for check: ${check}`);
    }
    const cost = normalizeCost(costs[check], check);

    const eligible = candidates
      .map(candidate => ({
        candidate,
        independence: evaluateVerifierIndependence(origin, candidate)
      }))
      .filter(item => eligibleForCheck(check, item, origin));

    if (!eligible.length) {
      throw new ValidationError(
        `assurance work has no meaningfully independent verifier for check: ${check}`
      );
    }

    const unused = eligible.filter(item => !usedVerifierIds.has(item.candidate.verifier_id));
    const pool = unused.length ? unused : eligible;
    const selected = pool[randomIndex(pool.length, randomIntFn)];

    budget.consume({
      checks: 1,
      computeUnits: cost.compute_units,
      externalCostUnits: cost.external_cost_units,
      elapsedMs: cost.elapsed_ms
    });
    usedVerifierIds.add(selected.candidate.verifier_id);

    assignments.push(Object.freeze({
      check_id: check,
      verifier_id: selected.candidate.verifier_id,
      verifier_profile_digest: selected.candidate.profile_digest,
      independence_digest: selected.independence.independence_digest,
      estimated_cost: cost
    }));
  }

  const body = Object.freeze({
    schema: ASSURANCE_WORK_ORDER_SCHEMA,
    task_id: adaptiveDecision.task_id,
    assurance_decision_digest: adaptiveDecision.decision_digest,
    selected_tier: adaptiveDecision.selected_tier,
    assignments: Object.freeze(assignments),
    external_obligations: Object.freeze([...externalObligations].sort()),
    budget_snapshot: budget.snapshot(),
    verifier_selection: 'stochastic-diversity-preserving',
    authority_effect: 'none',
    execution_effect: 'none'
  });

  return Object.freeze({ ...body, work_order_digest: digestObject(body) });
}
