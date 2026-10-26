import assert from 'node:assert/strict';
import test from 'node:test';
import {
  evaluateContainmentLatency,
  evaluateContainmentResumption
} from '../src/lib/containment-latency-lab.mjs';

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
  assert.equal(Object.isFrozen(result.planes[0].effects), true);
  assert.equal(Object.isFrozen(result.planes[0].false_success_conditions), true);
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



test('external acknowledgement cannot substitute for observed effect denial', () => {
  const result = evaluateContainmentLatency(scenario([
    plane(),
    plane({
      plane_id: 'provider-coordinator',
      acknowledgement_status: 'acknowledged',
      acknowledged_at: '2026-10-26T14:00:00.006Z',
      effects: [effect({
        effect_id: 'effect.provider',
        authority_path: 'provider.remote-entitlement',
        attempted_at: '2026-10-26T14:00:00.030Z',
        outcome: 'succeeded'
      })]
    })
  ]));
  assert.equal(result.result, 'INCOMPLETE');
  assert.deepEqual(result.unresolved_edges, []);
  assert.deepEqual(result.false_success_conditions, [{
    plane_id: 'provider-coordinator',
    effect_id: 'effect.provider',
    authority_path: 'provider.remote-entitlement',
    condition: 'post-decision-protected-effect-succeeded'
  }]);
  assert.deepEqual(result.missing_denial_evidence, [{
    plane_id: 'provider-coordinator',
    condition: 'no-post-decision-denial-evidence'
  }]);
  assert.equal(result.protected_effects_allowed, false);
  assert.equal(result.authority_effect, 'none');
});


test('benign transport labels cannot launder a successful protected effect', () => {
  const result = evaluateContainmentLatency(scenario([
    plane({
      plane_id: 'transport-observability',
      effects: [effect({
        effect_id: 'telemetry.heartbeat',
        authority_path: 'transport.audit-only',
        outcome: 'succeeded'
      })]
    })
  ]));
  assert.equal(result.result, 'INCOMPLETE');
  assert.deepEqual(result.false_success_conditions, [{
    plane_id: 'transport-observability',
    effect_id: 'telemetry.heartbeat',
    authority_path: 'transport.audit-only',
    condition: 'post-decision-protected-effect-succeeded'
  }]);
  assert.deepEqual(result.missing_denial_evidence, [{
    plane_id: 'transport-observability',
    condition: 'no-post-decision-denial-evidence'
  }]);
  assert.equal(result.protected_effects_allowed, false);
});

function recoveryAuthorization(overrides = {}) {
  return {
    authorization_id: 'recovery.current',
    issued_at: '2026-10-26T14:00:00.010Z',
    containment_epoch: 'epoch.contained',
    authority_path: 'delegation.primary',
    current: true,
    ...overrides
  };
}

function resumptionAttempt(overrides = {}) {
  return {
    attempt_id: 'attempt.restart',
    source: 'restart',
    authority_path: 'delegation.primary',
    persisted_containment_epoch: 'epoch.contained',
    attempted_at: '2026-10-26T14:00:00.020Z',
    recovery_authorization_id: 'recovery.current',
    outcome: 'succeeded',
    ...overrides
  };
}

function resumptionScenario(overrides = {}) {
  return {
    scenario_id: 'resumption.case',
    containment_epoch: 'epoch.contained',
    decision_at: decisionAt,
    recovery_authorizations: [recoveryAuthorization()],
    attempts: [resumptionAttempt()],
    ...overrides
  };
}

test('restart and shared-state success cannot discard the persisted containment epoch', () => {
  const result = evaluateContainmentResumption(resumptionScenario({
    attempts: [
      resumptionAttempt({
        attempt_id: 'attempt.restart',
        persisted_containment_epoch: null,
        recovery_authorization_id: null
      }),
      resumptionAttempt({
        attempt_id: 'attempt.shared-state',
        source: 'shared-state',
        persisted_containment_epoch: 'epoch.previous',
        recovery_authorization_id: null
      })
    ]
  }));
  assert.equal(result.result, 'INCOMPLETE');
  assert.deepEqual(
    result.false_success_conditions.map(item => item.condition),
    [
      'restart-did-not-preserve-containment-epoch',
      'successful-reentry-without-fresh-recovery-authorization',
      'shared-state-did-not-preserve-containment-epoch',
      'successful-reentry-without-fresh-recovery-authorization'
    ]
  );
  assert.equal(result.authorizes_reentry, false);
});

test('stale, wrong-scope, and pre-decision recovery records do not authorize re-entry', () => {
  const variants = [
    recoveryAuthorization({ current: false }),
    recoveryAuthorization({ containment_epoch: 'epoch.previous' }),
    recoveryAuthorization({ authority_path: 'delegation.sibling' }),
    recoveryAuthorization({ issued_at: '2026-10-26T13:59:59.999Z' })
  ];
  for (const authorization of variants) {
    const result = evaluateContainmentResumption(resumptionScenario({
      recovery_authorizations: [authorization]
    }));
    assert.equal(result.result, 'INCOMPLETE');
    assert.equal(
      result.false_success_conditions[0].condition,
      'successful-reentry-without-fresh-recovery-authorization'
    );
  }
});

test('fresh scoped recovery evidence is a positive control but grants no authority', () => {
  const result = evaluateContainmentResumption(resumptionScenario());
  assert.equal(result.result, 'COMPLETE');
  assert.deepEqual(result.false_success_conditions, []);
  assert.deepEqual(result.matching_recovery_evidence, [{
    attempt_id: 'attempt.restart',
    authorization_id: 'recovery.current',
    authority_path: 'delegation.primary'
  }]);
  assert.equal(result.authority_effect, 'none');
  assert.equal(result.authorizes_reentry, false);
  assert.equal(result.production_certified, false);
});


test('containment and recovery scope propagate to descendant authority paths', () => {
  const descendantPath = 'delegation.primary.child';
  const blocked = evaluateContainmentResumption(resumptionScenario({
    recovery_authorizations: [recoveryAuthorization({
      authorization_id: 'recovery.parent',
      authority_path: 'delegation.primary'
    })],
    attempts: [resumptionAttempt({
      attempt_id: 'attempt.descendant',
      source: 'descendant',
      authority_path: descendantPath,
      persisted_containment_epoch: null,
      recovery_authorization_id: 'recovery.parent'
    })]
  }));
  assert.equal(blocked.result, 'INCOMPLETE');
  assert.deepEqual(
    blocked.false_success_conditions.map(item => item.condition),
    [
      'descendant-did-not-preserve-containment-epoch',
      'successful-reentry-without-fresh-recovery-authorization'
    ]
  );

  const recovered = evaluateContainmentResumption(resumptionScenario({
    recovery_authorizations: [recoveryAuthorization({
      authorization_id: 'recovery.descendant',
      authority_path: descendantPath
    })],
    attempts: [resumptionAttempt({
      attempt_id: 'attempt.descendant',
      source: 'descendant',
      authority_path: descendantPath,
      recovery_authorization_id: 'recovery.descendant'
    })]
  }));
  assert.equal(recovered.result, 'COMPLETE');
  assert.deepEqual(recovered.matching_recovery_evidence, [{
    attempt_id: 'attempt.descendant',
    authorization_id: 'recovery.descendant',
    authority_path: descendantPath
  }]);
  assert.equal(recovered.authority_effect, 'none');
  assert.equal(recovered.authorizes_reentry, false);
});

test('malformed resumption evidence fails closed', () => {
  assert.throws(
    () => evaluateContainmentResumption({
      ...resumptionScenario(),
      authorizes_reentry: true
    }),
    /fields/i
  );
  assert.throws(
    () => evaluateContainmentResumption(resumptionScenario({
      attempts: [resumptionAttempt({ source: 'process-respawn' })]
    })),
    /source is invalid/i
  );
});
