import {
  ValidationError,
  assertPlainObject,
  assertString,
  canonicalJson,
  digestObject
} from './canonical.mjs';
import {
  evaluateAgentAuthorityAttenuation,
  normalizeAgentAuthorityCeiling
} from './agent-trust-attenuation-proof.mjs';

export const SUBAGENT_AGGREGATE_BUDGET_PLAN_SCHEMA = 'axiom-subagent-aggregate-budget-plan.v1';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$/;
const MAX_RESERVATIONS = 256;
const SUPPORTED_SHARED_DIMENSIONS = Object.freeze([
  'max_concurrent_requests',
  'max_cost_units',
  'max_requests_per_minute'
]);
const SUPPORTED_SHARED_SET = new Set(SUPPORTED_SHARED_DIMENSIONS);

const PLAN_KEYS = new Set(['schema', 'statement', 'plan_digest']);
const STATEMENT_KEYS = new Set([
  'plan_id',
  'parent_ceiling_digest',
  'shared_dimensions',
  'reservations',
  'totals',
  'headroom',
  'valid_from',
  'expires_at',
  'authority_effect',
  'delegation_effect',
  'execution_authorized',
  'runtime_enforcement_claimed',
  'durable_cas_claimed',
  'reservation_effect'
]);
const INPUT_RESERVATION_KEYS = new Set([
  'reservation_id',
  'child_id',
  'child_authority',
  'budgets'
]);
const RESERVATION_KEYS = new Set([
  'reservation_id',
  'child_id',
  'child_ceiling_digest',
  'budgets'
]);

const SEMANTICS = Object.freeze({
  authority_effect: 'none',
  delegation_effect: 'none',
  execution_authorized: false,
  runtime_enforcement_claimed: false,
  durable_cas_claimed: false,
  reservation_effect: 'pre-spawn-accounting-only'
});

function exactObject(raw, allowed, label) {
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

function canonicalTimestamp(value, label) {
  const text = assertString(value, label, { min: 24, max: 24 });
  const parsed = new Date(text);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== text) {
    throw new ValidationError(`${label} must be a canonical UTC ISO timestamp`);
  }
  return text;
}

function timestampValue(value) {
  return new Date(value).valueOf();
}

function nonNegativeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new ValidationError(`${label} must be a non-negative safe integer`);
  }
  return value;
}

function normalizeSharedDimensions(raw = SUPPORTED_SHARED_DIMENSIONS) {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > SUPPORTED_SHARED_DIMENSIONS.length) {
    throw new ValidationError('shared budget dimensions must contain 1-3 items');
  }
  const values = raw.map((value, index) => assertString(
    value,
    `shared budget dimensions[${index}]`,
    { min: 1, max: 64 }
  ));
  for (const value of values) {
    if (!SUPPORTED_SHARED_SET.has(value)) {
      throw new ValidationError(`unsupported shared budget dimension ${value}`);
    }
  }
  const normalized = [...new Set(values)].sort();
  if (normalized.length !== values.length) {
    throw new ValidationError('shared budget dimensions must be unique');
  }
  return Object.freeze(normalized);
}

function normalizeSharedBudget(raw, dimensions, label) {
  const value = assertPlainObject(raw, label);
  const allowed = new Set(dimensions);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new ValidationError(`${label} contains unsupported shared budget dimension ${key}`);
    }
  }
  for (const dimension of dimensions) {
    if (!(dimension in value)) {
      throw new ValidationError(`${label} must explicitly include ${dimension}`);
    }
  }
  return Object.freeze(Object.fromEntries(
    dimensions.map(dimension => [
      dimension,
      nonNegativeInteger(value[dimension], `${label}.${dimension}`)
    ])
  ));
}

function normalizeStoredReservation(raw, dimensions, index) {
  const value = exactObject(raw, RESERVATION_KEYS, `subagent budget reservation[${index}]`);
  return Object.freeze({
    reservation_id: identifier(
      value.reservation_id,
      `subagent budget reservation[${index}].reservation_id`
    ),
    child_id: identifier(value.child_id, `subagent budget reservation[${index}].child_id`),
    child_ceiling_digest: assertString(
      value.child_ceiling_digest,
      `subagent budget reservation[${index}].child_ceiling_digest`,
      { min: 64, max: 64, pattern: /^[a-f0-9]{64}$/ }
    ),
    budgets: normalizeSharedBudget(
      value.budgets,
      dimensions,
      `subagent budget reservation[${index}].budgets`
    )
  });
}

function normalizeStatement(raw) {
  const value = exactObject(raw, STATEMENT_KEYS, 'subagent aggregate budget plan statement');
  const semantics = Object.fromEntries(Object.keys(SEMANTICS).map(key => [key, value[key]]));
  if (canonicalJson(semantics) !== canonicalJson(SEMANTICS)) {
    throw new ValidationError('subagent aggregate budget plan widens its non-authorizing boundary');
  }
  const dimensions = normalizeSharedDimensions(value.shared_dimensions);
  if (!Array.isArray(value.reservations) || value.reservations.length < 1 || value.reservations.length > MAX_RESERVATIONS) {
    throw new ValidationError(`subagent aggregate budget plan must contain 1-${MAX_RESERVATIONS} reservations`);
  }
  const reservations = value.reservations.map((item, index) => normalizeStoredReservation(item, dimensions, index));
  const reservationIds = reservations.map(item => item.reservation_id);
  const childIds = reservations.map(item => item.child_id);
  if (new Set(reservationIds).size !== reservationIds.length) {
    throw new ValidationError('subagent aggregate budget plan contains duplicate reservation');
  }
  if (new Set(childIds).size !== childIds.length) {
    throw new ValidationError('subagent aggregate budget plan contains duplicate child');
  }
  if (canonicalJson(reservationIds) !== canonicalJson([...reservationIds].sort())) {
    throw new ValidationError('subagent aggregate budget plan reservations must be sorted by reservation_id');
  }

  const validFrom = canonicalTimestamp(value.valid_from, 'subagent aggregate budget plan valid_from');
  const expiresAt = canonicalTimestamp(value.expires_at, 'subagent aggregate budget plan expires_at');
  if (timestampValue(expiresAt) <= timestampValue(validFrom)) {
    throw new ValidationError('subagent aggregate budget plan expiry must follow valid_from');
  }

  return Object.freeze({
    plan_id: identifier(value.plan_id, 'subagent aggregate budget plan plan_id'),
    parent_ceiling_digest: assertString(
      value.parent_ceiling_digest,
      'subagent aggregate budget plan parent_ceiling_digest',
      { min: 64, max: 64, pattern: /^[a-f0-9]{64}$/ }
    ),
    shared_dimensions: dimensions,
    reservations: Object.freeze(reservations),
    totals: normalizeSharedBudget(value.totals, dimensions, 'subagent aggregate budget plan totals'),
    headroom: normalizeSharedBudget(value.headroom, dimensions, 'subagent aggregate budget plan headroom'),
    valid_from: validFrom,
    expires_at: expiresAt,
    ...SEMANTICS
  });
}

function normalizeInputReservations(rawReservations, dimensions, parent) {
  if (!Array.isArray(rawReservations) || rawReservations.length < 1 || rawReservations.length > MAX_RESERVATIONS) {
    throw new ValidationError(`subagent aggregate budget plan must contain 1-${MAX_RESERVATIONS} reservations`);
  }

  const seenReservations = new Set();
  const seenChildren = new Set();
  const normalized = rawReservations.map((raw, index) => {
    const value = exactObject(raw, INPUT_RESERVATION_KEYS, `subagent budget reservation input[${index}]`);
    const reservationId = identifier(
      value.reservation_id,
      `subagent budget reservation input[${index}].reservation_id`
    );
    const childId = identifier(value.child_id, `subagent budget reservation input[${index}].child_id`);
    if (seenReservations.has(reservationId)) {
      throw new ValidationError(`duplicate reservation ${reservationId}`);
    }
    if (seenChildren.has(childId)) {
      throw new ValidationError(`duplicate child ${childId}`);
    }
    seenReservations.add(reservationId);
    seenChildren.add(childId);

    const child = normalizeAgentAuthorityCeiling(value.child_authority);
    evaluateAgentAuthorityAttenuation(parent, child);
    const budgets = normalizeSharedBudget(
      value.budgets,
      dimensions,
      `subagent budget reservation input[${index}].budgets`
    );
    for (const dimension of dimensions) {
      if (budgets[dimension] > child.budgets[dimension]) {
        throw new ValidationError(
          `child shared budget ${dimension} exceeds child authority ceiling`
        );
      }
    }

    return Object.freeze({
      reservation_id: reservationId,
      child_id: childId,
      child_authority: child,
      child_ceiling_digest: child.ceiling_digest,
      budgets
    });
  });

  return Object.freeze(normalized.sort((a, b) => a.reservation_id.localeCompare(b.reservation_id)));
}

function assertPlanLifetime(validFrom, expiresAt, parent, reservations) {
  if (timestampValue(validFrom) < timestampValue(parent.valid_from)) {
    throw new ValidationError('subagent aggregate budget plan starts before parent authority');
  }
  if (timestampValue(expiresAt) > timestampValue(parent.expires_at)) {
    throw new ValidationError('subagent aggregate budget plan outlives parent authority');
  }
  for (const reservation of reservations) {
    if (timestampValue(validFrom) < timestampValue(reservation.child_authority.valid_from)) {
      throw new ValidationError(`subagent aggregate budget plan starts before child authority ${reservation.child_id}`);
    }
    if (timestampValue(expiresAt) > timestampValue(reservation.child_authority.expires_at)) {
      throw new ValidationError(`subagent aggregate budget plan outlives child authority ${reservation.child_id}`);
    }
  }
}

function totalsFor(dimensions, reservations) {
  const totals = Object.fromEntries(dimensions.map(dimension => [dimension, 0]));
  for (const reservation of reservations) {
    for (const dimension of dimensions) {
      totals[dimension] += reservation.budgets[dimension];
      if (!Number.isSafeInteger(totals[dimension])) {
        throw new ValidationError(`aggregate parent budget ${dimension} exceeds safe integer range`);
      }
    }
  }
  return Object.freeze(totals);
}

function assertWithinParentBudget(dimensions, totals, parent) {
  for (const dimension of dimensions) {
    if (totals[dimension] > parent.budgets[dimension]) {
      throw new ValidationError(
        `aggregate parent budget ${dimension} exceeded: ${totals[dimension]} > ${parent.budgets[dimension]}`
      );
    }
  }
}

function headroomFor(dimensions, totals, parent) {
  return Object.freeze(Object.fromEntries(dimensions.map(dimension => [
    dimension,
    parent.budgets[dimension] - totals[dimension]
  ])));
}

export function createSubagentAggregateBudgetPlan({
  planId,
  parentAuthority,
  reservations,
  sharedDimensions = SUPPORTED_SHARED_DIMENSIONS,
  validFrom,
  expiresAt
} = {}) {
  const parent = normalizeAgentAuthorityCeiling(parentAuthority);
  const dimensions = normalizeSharedDimensions(sharedDimensions);
  const normalizedReservations = normalizeInputReservations(reservations, dimensions, parent);
  const normalizedValidFrom = canonicalTimestamp(validFrom, 'subagent aggregate budget plan valid_from');
  const normalizedExpiresAt = canonicalTimestamp(expiresAt, 'subagent aggregate budget plan expires_at');
  if (timestampValue(normalizedExpiresAt) <= timestampValue(normalizedValidFrom)) {
    throw new ValidationError('subagent aggregate budget plan expiry must follow valid_from');
  }
  assertPlanLifetime(normalizedValidFrom, normalizedExpiresAt, parent, normalizedReservations);

  const totals = totalsFor(dimensions, normalizedReservations);
  assertWithinParentBudget(dimensions, totals, parent);
  const headroom = headroomFor(dimensions, totals, parent);

  const statement = normalizeStatement({
    plan_id: planId,
    parent_ceiling_digest: parent.ceiling_digest,
    shared_dimensions: dimensions,
    reservations: normalizedReservations.map(reservation => ({
      reservation_id: reservation.reservation_id,
      child_id: reservation.child_id,
      child_ceiling_digest: reservation.child_ceiling_digest,
      budgets: reservation.budgets
    })),
    totals,
    headroom,
    valid_from: normalizedValidFrom,
    expires_at: normalizedExpiresAt,
    ...SEMANTICS
  });
  const envelope = Object.freeze({
    schema: SUBAGENT_AGGREGATE_BUDGET_PLAN_SCHEMA,
    statement
  });
  return Object.freeze({
    ...envelope,
    plan_digest: digestObject(envelope)
  });
}

export function verifySubagentAggregateBudgetPlan(raw, {
  parentAuthority,
  childAuthorities
} = {}) {
  const value = exactObject(raw, PLAN_KEYS, 'subagent aggregate budget plan');
  if (value.schema !== SUBAGENT_AGGREGATE_BUDGET_PLAN_SCHEMA) {
    throw new ValidationError(
      `subagent aggregate budget plan schema must be ${SUBAGENT_AGGREGATE_BUDGET_PLAN_SCHEMA}`
    );
  }
  const expectedDigest = digestObject({
    schema: value.schema,
    statement: value.statement
  });
  if (value.plan_digest !== expectedDigest) {
    throw new ValidationError('subagent aggregate budget plan digest mismatch');
  }

  const statement = normalizeStatement(value.statement);
  const parent = normalizeAgentAuthorityCeiling(parentAuthority);
  if (statement.parent_ceiling_digest !== parent.ceiling_digest) {
    throw new ValidationError('subagent aggregate budget plan parent ceiling digest mismatch');
  }
  const children = assertPlainObject(childAuthorities, 'subagent aggregate budget plan childAuthorities');

  const reservations = statement.reservations.map((reservation, index) => {
    const rawChild = children[reservation.child_id];
    if (rawChild === undefined) {
      throw new ValidationError(`missing child authority for ${reservation.child_id}`);
    }
    const child = normalizeAgentAuthorityCeiling(rawChild);
    if (child.ceiling_digest !== reservation.child_ceiling_digest) {
      throw new ValidationError(`child ceiling digest mismatch for ${reservation.child_id}`);
    }
    evaluateAgentAuthorityAttenuation(parent, child);
    for (const dimension of statement.shared_dimensions) {
      if (reservation.budgets[dimension] > child.budgets[dimension]) {
        throw new ValidationError(
          `child shared budget ${dimension} exceeds child authority ceiling`
        );
      }
    }
    return Object.freeze({
      reservation_id: reservation.reservation_id,
      child_id: reservation.child_id,
      child_authority: child,
      child_ceiling_digest: child.ceiling_digest,
      budgets: reservation.budgets,
      index
    });
  });

  assertPlanLifetime(statement.valid_from, statement.expires_at, parent, reservations);
  const totals = totalsFor(statement.shared_dimensions, reservations);
  assertWithinParentBudget(statement.shared_dimensions, totals, parent);
  const headroom = headroomFor(statement.shared_dimensions, totals, parent);

  if (canonicalJson(totals) !== canonicalJson(statement.totals)) {
    throw new ValidationError('subagent aggregate budget plan totals mismatch');
  }
  if (canonicalJson(headroom) !== canonicalJson(statement.headroom)) {
    throw new ValidationError('subagent aggregate budget plan headroom mismatch');
  }

  return Object.freeze({
    schema: value.schema,
    statement,
    plan_digest: expectedDigest
  });
}
