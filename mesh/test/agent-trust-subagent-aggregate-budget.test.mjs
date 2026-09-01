import assert from 'node:assert/strict';
import test from 'node:test';

import { createAgentAuthorityCeiling } from '../src/lib/agent-trust-attenuation-proof.mjs';
import {
  createSubagentAggregateBudgetPlan,
  verifySubagentAggregateBudgetPlan
} from '../src/lib/agent-trust-subagent-aggregate-budget.mjs';

function parentCeiling(overrides = {}) {
  return createAgentAuthorityCeiling({
    capabilities: ['cap.echo', 'cap.hash'],
    actions: [
      {
        id: 'system.echo',
        effect_destination: 'local',
        required_assurance: 'A1',
        required_confirmations: 1,
        required_confirmation_values: ['confirm.echo'],
        requires_independent_approval: false,
        timeout_ms: 5_000
      },
      {
        id: 'system.hash',
        effect_destination: 'local',
        required_assurance: 'A2',
        required_confirmations: 1,
        required_confirmation_values: ['confirm.hash'],
        requires_independent_approval: false,
        timeout_ms: 5_000
      }
    ],
    scopes: ['intent:execute'],
    purposes: ['test.conformance'],
    destinations: ['local'],
    data_classes: ['public'],
    budgets: {
      max_requests_per_minute: 20,
      max_concurrent_requests: 4,
      max_execution_ms: 5_000,
      max_request_bytes: 131_072,
      max_response_bytes: 524_288,
      max_cost_units: 100
    },
    delegation: { may_subdelegate: true, remaining_depth: 2 },
    valid_from: '2026-09-01T17:00:00.000Z',
    expires_at: '2026-09-01T20:00:00.000Z',
    ...overrides
  });
}

function childCeiling({
  action = 'system.echo',
  requests = 10,
  concurrent = 2,
  cost = 50,
  ...overrides
} = {}) {
  return createAgentAuthorityCeiling({
    capabilities: [action === 'system.echo' ? 'cap.echo' : 'cap.hash'],
    actions: [
      {
        id: action,
        effect_destination: 'local',
        required_assurance: 'A2',
        required_confirmations: 2,
        required_confirmation_values: [action === 'system.echo' ? 'confirm.echo' : 'confirm.hash', 'confirm.extra'].sort(),
        requires_independent_approval: true,
        timeout_ms: 2_500
      }
    ],
    scopes: ['intent:execute'],
    purposes: ['test.conformance'],
    destinations: ['local'],
    data_classes: ['public'],
    budgets: {
      max_requests_per_minute: requests,
      max_concurrent_requests: concurrent,
      max_execution_ms: 2_500,
      max_request_bytes: 65_536,
      max_response_bytes: 262_144,
      max_cost_units: cost
    },
    delegation: { may_subdelegate: false, remaining_depth: 0 },
    valid_from: '2026-09-01T17:05:00.000Z',
    expires_at: '2026-09-01T19:00:00.000Z',
    ...overrides
  });
}

function reservation(reservationId, childId, childAuthority, budgets = {}) {
  return {
    reservation_id: reservationId,
    child_id: childId,
    child_authority: childAuthority,
    budgets: {
      max_concurrent_requests: childAuthority.budgets.max_concurrent_requests,
      max_cost_units: childAuthority.budgets.max_cost_units,
      max_requests_per_minute: childAuthority.budgets.max_requests_per_minute,
      ...budgets
    }
  };
}

test('two individually valid children may reserve only an aggregate allocation within the parent shared ceiling', () => {
  const parent = parentCeiling();
  const childA = childCeiling({ requests: 10, concurrent: 2, cost: 25 });
  const childB = childCeiling({ action: 'system.hash', requests: 10, concurrent: 2, cost: 75 });

  const plan = createSubagentAggregateBudgetPlan({
    planId: 'budget-plan.swarm.1',
    parentAuthority: parent,
    reservations: [
      reservation('reservation.a', 'agent.child.a', childA),
      reservation('reservation.b', 'agent.child.b', childB)
    ],
    validFrom: '2026-09-01T17:10:00.000Z',
    expiresAt: '2026-09-01T18:30:00.000Z'
  });

  const verified = verifySubagentAggregateBudgetPlan(plan, {
    parentAuthority: parent,
    childAuthorities: {
      'agent.child.a': childA,
      'agent.child.b': childB
    }
  });

  assert.deepEqual(verified.statement.shared_dimensions, [
    'max_concurrent_requests',
    'max_cost_units',
    'max_requests_per_minute'
  ]);
  assert.deepEqual(verified.statement.totals, {
    max_concurrent_requests: 4,
    max_cost_units: 100,
    max_requests_per_minute: 20
  });
  assert.deepEqual(verified.statement.headroom, {
    max_concurrent_requests: 0,
    max_cost_units: 0,
    max_requests_per_minute: 0
  });
  assert.equal(verified.statement.authority_effect, 'none');
  assert.equal(verified.statement.delegation_effect, 'none');
  assert.equal(verified.statement.execution_authorized, false);
  assert.equal(verified.statement.runtime_enforcement_claimed, false);
  assert.equal(verified.statement.durable_cas_claimed, false);
  assert.equal(verified.statement.reservation_effect, 'pre-spawn-accounting-only');
});

test('parallel children cannot multiply requests concurrency or cost beyond the parent shared ceiling', () => {
  const parent = parentCeiling();
  const childA = childCeiling({ requests: 10, concurrent: 2, cost: 50 });
  const childB = childCeiling({ action: 'system.hash', requests: 11, concurrent: 3, cost: 51 });

  assert.throws(
    () => createSubagentAggregateBudgetPlan({
      planId: 'budget-plan.oversubscribed',
      parentAuthority: parent,
      reservations: [
        reservation('reservation.a', 'agent.child.a', childA),
        reservation('reservation.b', 'agent.child.b', childB)
      ],
      validFrom: '2026-09-01T17:10:00.000Z',
      expiresAt: '2026-09-01T18:30:00.000Z'
    }),
    /aggregate parent budget/i
  );
});

test('a child cannot reserve more shared budget than its own attenuated ceiling', () => {
  const parent = parentCeiling();
  const child = childCeiling({ requests: 5, concurrent: 1, cost: 10 });

  assert.throws(
    () => createSubagentAggregateBudgetPlan({
      planId: 'budget-plan.child-widening',
      parentAuthority: parent,
      reservations: [
        reservation('reservation.a', 'agent.child.a', child, {
          max_requests_per_minute: 6
        })
      ],
      validFrom: '2026-09-01T17:10:00.000Z',
      expiresAt: '2026-09-01T18:30:00.000Z'
    }),
    /child shared budget/i
  );
});

test('only explicitly shared aggregate dimensions may be summed; per-effect byte and timeout ceilings remain attenuation constraints', () => {
  const parent = parentCeiling();
  const child = childCeiling();

  assert.throws(
    () => createSubagentAggregateBudgetPlan({
      planId: 'budget-plan.ambiguous-dimension',
      parentAuthority: parent,
      sharedDimensions: ['max_concurrent_requests', 'max_execution_ms'],
      reservations: [reservation('reservation.a', 'agent.child.a', child)],
      validFrom: '2026-09-01T17:10:00.000Z',
      expiresAt: '2026-09-01T18:30:00.000Z'
    }),
    /unsupported shared budget dimension/i
  );
});

test('duplicate child or reservation identities are rejected so one allocation cannot be counted ambiguously', () => {
  const parent = parentCeiling();
  const childA = childCeiling({ requests: 5, concurrent: 1, cost: 20 });
  const childB = childCeiling({ action: 'system.hash', requests: 5, concurrent: 1, cost: 20 });

  assert.throws(
    () => createSubagentAggregateBudgetPlan({
      planId: 'budget-plan.duplicate-child',
      parentAuthority: parent,
      reservations: [
        reservation('reservation.a', 'agent.child.a', childA),
        reservation('reservation.b', 'agent.child.a', childB)
      ],
      validFrom: '2026-09-01T17:10:00.000Z',
      expiresAt: '2026-09-01T18:30:00.000Z'
    }),
    /duplicate child/i
  );

  assert.throws(
    () => createSubagentAggregateBudgetPlan({
      planId: 'budget-plan.duplicate-reservation',
      parentAuthority: parent,
      reservations: [
        reservation('reservation.a', 'agent.child.a', childA),
        reservation('reservation.a', 'agent.child.b', childB)
      ],
      validFrom: '2026-09-01T17:10:00.000Z',
      expiresAt: '2026-09-01T18:30:00.000Z'
    }),
    /duplicate reservation/i
  );
});

test('plan lifetime must stay inside the parent and every reserved child authority', () => {
  const parent = parentCeiling();
  const child = childCeiling();

  assert.throws(
    () => createSubagentAggregateBudgetPlan({
      planId: 'budget-plan.outlives-child',
      parentAuthority: parent,
      reservations: [reservation('reservation.a', 'agent.child.a', child)],
      validFrom: '2026-09-01T17:10:00.000Z',
      expiresAt: '2026-09-01T19:00:01.000Z'
    }),
    /child authority/i
  );
});

test('plan tamper or child-authority substitution fails verification and cannot become authority', () => {
  const parent = parentCeiling();
  const child = childCeiling({ requests: 5, concurrent: 1, cost: 20 });
  const plan = createSubagentAggregateBudgetPlan({
    planId: 'budget-plan.verify',
    parentAuthority: parent,
    reservations: [reservation('reservation.a', 'agent.child.a', child)],
    validFrom: '2026-09-01T17:10:00.000Z',
    expiresAt: '2026-09-01T18:30:00.000Z'
  });

  const tampered = structuredClone(plan);
  tampered.statement.execution_authorized = true;
  assert.throws(
    () => verifySubagentAggregateBudgetPlan(tampered, {
      parentAuthority: parent,
      childAuthorities: { 'agent.child.a': child }
    }),
    /(plan digest mismatch|non-authorizing boundary)/i
  );

  const differentChild = childCeiling({ requests: 4, concurrent: 1, cost: 20 });
  assert.throws(
    () => verifySubagentAggregateBudgetPlan(plan, {
      parentAuthority: parent,
      childAuthorities: { 'agent.child.a': differentChild }
    }),
    /child ceiling digest mismatch/i
  );
});
