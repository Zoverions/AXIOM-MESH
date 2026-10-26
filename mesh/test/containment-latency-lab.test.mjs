import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateContainmentLatency } from '../src/lib/containment-latency-lab.mjs';

const decisionAt = '2026-10-26T14:00:00.000Z';

function effect(overrides = {}) {
  return {
    effect_id: 'effect.primary',
    authority_path: 'delegation.primary',
    queued_at: '2026-10-26T14:00:00.010Z',
    attempted_at: '2026-10-26T14:00:00.020Z',
    currentness_rechecked: true,
    outcome: 'denied',
    ...overrides
  };
}

function plane(overrides = {}) {
  return {
    plane_id: 'delegation',
    required: true,
    acknowledgement_status: 'acknowledged',
    acknowledged_at: '2026-10-26T14:00:00.005Z',
    effects: [effect()],
    ...overrides
  };
}

function scenario(planes) {
  return { scenario_id: 'containment.case', decision_at: decisionAt, planes };
}

test('complete result requires acknowledgement and post-decision denial on every required plane', () => {
  const result = evaluateContainmentLatency(scenario([
    plane(),
    plane({
      plane_id: 'session',
      effects: [effect({ effect_id: 'effect.session', authority_path: 'session.primary' })]
    })
  ]));
  assert.equal(result.result, 'COMPLETE');
  assert.equal(result.protected_effects_allowed, false);
  assert.equal(result.planes[0].time_to_effect_denial_ms, 20);
  assert.deepEqual(result.false_success_conditions, []);
  assert.equal(result.authority_effect, 'none');
});

test('sibling authority success is explicit and containment cannot report success', () => {
  const result = evaluateContainmentLatency(scenario([
    plane({
      effects: [
        effect(),
        effect({
          effect_id: 'effect.sibling',
          authority_path: 'delegation.sibling',
          attempted_at: '2026-10-26T14:00:00.025Z',
          outcome: 'succeeded'
        })
      ]
    })
  ]));
  assert.equal(result.result, 'INCOMPLETE');
  assert.equal(result.planes[0].last_successful_effect_at, '2026-10-26T14:00:00.025Z');
  assert.match(result.false_success_conditions[0].condition, /post-decision/);
  assert.equal(result.false_success_conditions[0].authority_path, 'delegation.sibling');
});

test('queued effects must recheck currentness after the containment decision', () => {
  const result = evaluateContainmentLatency(scenario([
    plane({
      effects: [effect({
        queued_at: '2026-10-26T13:59:59.900Z',
        currentness_rechecked: false
      })]
    })
  ]));
  assert.equal(result.result, 'INCOMPLETE');
  assert.deepEqual(
    result.false_success_conditions.map(item => item.condition),
    ['queued-effect-skipped-currentness-recheck']
  );
});

test('an unreachable required backend remains unresolved and fails closed', () => {
  const result = evaluateContainmentLatency(scenario([
    plane({
      plane_id: 'provider-entitlement',
      acknowledgement_status: 'unreachable',
      acknowledged_at: null
    })
  ]));
  assert.equal(result.result, 'INCOMPLETE');
  assert.equal(result.protected_effects_allowed, false);
  assert.deepEqual(result.unresolved_edges, [
    { plane_id: 'provider-entitlement', condition: 'unreachable' }
  ]);
});

test('unknown fields and contradictory acknowledgement evidence fail closed', () => {
  assert.throws(
    () => evaluateContainmentLatency({ ...scenario([plane()]), grants_authority: true }),
    /fields/i
  );
  assert.throws(
    () => evaluateContainmentLatency(scenario([
      plane({ acknowledgement_status: 'acknowledged', acknowledged_at: null })
    ])),
    /timestamp\/status/i
  );
});
