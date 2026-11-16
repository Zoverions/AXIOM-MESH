import assert from 'node:assert/strict';
import test from 'node:test';

import { evaluateAuthorityVerifiability } from '../src/lib/authority-verifiability-gate.mjs';

const POLICY_DIGEST = 'a'.repeat(64);

function request(overrides = {}) {
  return {
    request_id: 'verify.assurance.1',
    principal_id: 'agent.verify.1',
    action: 'system.echo',
    risk: 'low',
    effect_destination: 'local',
    authority_level: 1,
    autonomy_level: 1,
    novelty_signals: [],
    external_agent_interaction: false,
    self_modification: false,
    ...overrides
  };
}

function evidence(overrides = {}) {
  return {
    policy_binding_digest: POLICY_DIGEST,
    identity_current: true,
    delegation_current: true,
    evidence_bound: true,
    monitorability_level: 1,
    independent_monitor: false,
    independent_evaluator: false,
    human_authorization_present: false,
    rollback_available: false,
    rollback_tested: false,
    ...overrides
  };
}

test('authority level raises the monitorability floor and contracts the lease ceiling', () => {
  const result = evaluateAuthorityVerifiability({
    request: request({ authority_level: 3 }),
    evidence: evidence({ monitorability_level: 2 })
  });

  assert.equal(result.decision, 'hold');
  assert.equal(result.requirements.monitorability_level, 3);
  assert.equal(result.requirements.max_lease_ms, 60_000);
  assert.deepEqual(result.reasons, ['monitorability_below_requirement']);
});

test('autonomy level raises the monitorability floor independently of consequence class', () => {
  const result = evaluateAuthorityVerifiability({
    request: request({ autonomy_level: 4 }),
    evidence: evidence({ monitorability_level: 3, independent_monitor: true })
  });

  assert.equal(result.decision, 'hold');
  assert.equal(result.requirements.monitorability_level, 4);
  assert.equal(result.requirements.max_lease_ms, 15_000);
  assert.deepEqual(result.reasons, ['monitorability_below_requirement']);
});

test('novelty escalates from the strongest risk-authority-autonomy floor', () => {
  const result = evaluateAuthorityVerifiability({
    request: request({
      risk: 'medium',
      authority_level: 3,
      autonomy_level: 2,
      novelty_signals: ['tool']
    }),
    evidence: evidence({ monitorability_level: 3 })
  });

  assert.equal(result.requirements.monitorability_level, 4);
  assert.equal(result.requirements.max_lease_ms, 60_000);
  assert.equal(result.decision, 'hold');
  assert.deepEqual(result.reasons, ['monitorability_below_requirement']);
});

test('sufficient evidence at the contracted floor remains only eligible, never authorized', () => {
  const result = evaluateAuthorityVerifiability({
    request: request({ authority_level: 3 }),
    evidence: evidence({ monitorability_level: 3 })
  });

  assert.equal(result.decision, 'eligible');
  assert.equal(result.requirements.max_lease_ms, 60_000);
  assert.equal(result.semantics.grants_execution_authority, false);
  assert.equal(result.semantics.requires_downstream_authorization, true);
});
