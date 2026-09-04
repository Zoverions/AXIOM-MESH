import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ADAPTIVE_ASSURANCE_INPUT_SCHEMA,
  createAdaptiveAssuranceEvaluator,
  normalizeAdaptiveAssuranceInput,
  projectAdaptiveAssuranceForUi
} from '../src/lib/adaptive-assurance.mjs';

function input(overrides = {}) {
  return {
    schema: ADAPTIVE_ASSURANCE_INPUT_SCHEMA,
    task_id: 'task.assurance.example',
    risk_class: 'low',
    signals: {
      consequence: 10,
      uncertainty: 10,
      irreversibility: 0,
      authority_exposure: 10,
      anomaly: 0,
      provenance_weakness: 10,
      correlation_risk: 10,
      context_integrity_risk: 10
    },
    reputation_score: 90,
    reputation_confidence: 100,
    ...overrides
  };
}

const neverChallenge = createAdaptiveAssuranceEvaluator({ randomIntFn: () => 9_999 });
const alwaysChallenge = createAdaptiveAssuranceEvaluator({ randomIntFn: () => 0 });

test('adaptive assurance preserves a mandatory floor and never grants authority', () => {
  const result = neverChallenge(input({
    risk_class: 'high',
    signals: {
      consequence: 5,
      uncertainty: 5,
      irreversibility: 5,
      authority_exposure: 5,
      anomaly: 0,
      provenance_weakness: 0,
      correlation_risk: 0,
      context_integrity_risk: 0
    }
  }));

  assert.equal(result.policy_floor, 'A3');
  assert.equal(result.selected_tier, 'A3');
  assert.equal(result.mandatory_floor_preserved, true);
  assert.equal(result.reputation_can_exempt, false);
  assert.equal(result.authority_effect, 'none');
  assert.equal(result.delegation_effect, 'none');
});

test('higher observable risk cannot reduce deterministic assurance', () => {
  const low = neverChallenge(input());
  const high = neverChallenge(input({
    signals: {
      consequence: 95,
      uncertainty: 85,
      irreversibility: 90,
      authority_exposure: 95,
      anomaly: 75,
      provenance_weakness: 80,
      correlation_risk: 90,
      context_integrity_risk: 90
    }
  }));

  const rank = { A1: 1, A2: 2, A3: 3 };
  assert.ok(high.adjusted_risk_score > low.adjusted_risk_score);
  assert.ok(rank[high.deterministic_tier] >= rank[low.deterministic_tier]);
});

test('reputation may reduce expected effort but cannot create exemption', () => {
  const trusted = neverChallenge(input({
    reputation_score: 100,
    reputation_confidence: 100
  }));
  const untrusted = neverChallenge(input({
    reputation_score: 0,
    reputation_confidence: 100
  }));

  assert.ok(trusted.adjusted_risk_score <= untrusted.adjusted_risk_score);
  assert.equal(trusted.policy_floor, 'A1');
  assert.equal(trusted.reputation_can_exempt, false);
  assert.ok(trusted.internal_audit.challenge_probability_bps > 0);
});

test('stochastic challenge can escalate scrutiny without changing authority', () => {
  const deterministic = neverChallenge(input({
    risk_class: 'medium',
    signals: {
      consequence: 30,
      uncertainty: 25,
      irreversibility: 20,
      authority_exposure: 25,
      anomaly: 10,
      provenance_weakness: 10,
      correlation_risk: 10,
      context_integrity_risk: 10
    }
  }));
  const challenged = alwaysChallenge(input({
    risk_class: 'medium',
    signals: {
      consequence: 30,
      uncertainty: 25,
      irreversibility: 20,
      authority_exposure: 25,
      anomaly: 10,
      provenance_weakness: 10,
      correlation_risk: 10,
      context_integrity_risk: 10
    }
  }));

  assert.equal(deterministic.deterministic_tier, 'A2');
  assert.equal(challenged.selected_tier, 'A3');
  assert.equal(challenged.stochastic_audit_performed, true);
  assert.ok(challenged.required_checks.includes('stochastic-supplemental-audit'));
  assert.equal(challenged.authority_effect, 'none');
});

test('critical work always requires explicit independent human or policy-designated approval', () => {
  const result = neverChallenge(input({ risk_class: 'critical' }));
  assert.equal(result.selected_tier, 'A3');
  assert.equal(result.ui_level, 'Critical');
  assert.ok(
    result.required_checks.includes('explicit-human-or-policy-designated-independent-approval')
  );
});

test('correlation and context-integrity risk increase challenge probability', () => {
  const clean = neverChallenge(input({
    signals: {
      consequence: 20,
      uncertainty: 20,
      irreversibility: 20,
      authority_exposure: 20,
      anomaly: 0,
      provenance_weakness: 0,
      correlation_risk: 0,
      context_integrity_risk: 0
    }
  }));
  const contaminated = neverChallenge(input({
    signals: {
      consequence: 20,
      uncertainty: 20,
      irreversibility: 20,
      authority_exposure: 20,
      anomaly: 100,
      provenance_weakness: 100,
      correlation_risk: 100,
      context_integrity_risk: 100
    }
  }));

  assert.ok(
    contaminated.internal_audit.challenge_probability_bps
    > clean.internal_audit.challenge_probability_bps
  );
});

test('pre-execution UI does not disclose stochastic probability or random sample', () => {
  const result = alwaysChallenge(input());
  const projection = projectAdaptiveAssuranceForUi(result, { phase: 'pre-execution' });

  assert.equal(projection.authority_effect, 'none');
  assert.equal('supplemental_audit_performed' in projection, false);
  assert.equal('challenge_probability_bps' in projection, false);
  assert.equal('sample_bps' in projection, false);
});

test('post-execution UI may disclose that supplemental review occurred without exposing the sampling rule', () => {
  const result = alwaysChallenge(input());
  const projection = projectAdaptiveAssuranceForUi(result, { phase: 'post-execution' });

  assert.equal(projection.supplemental_audit_performed, true);
  assert.equal('challenge_probability_bps' in projection, false);
  assert.equal('sample_bps' in projection, false);
});

test('malformed and future-widening inputs fail closed', () => {
  assert.throws(
    () => normalizeAdaptiveAssuranceInput(input({ policy_floor: 'A4' })),
    /A3|maximum/i
  );
  assert.throws(
    () => normalizeAdaptiveAssuranceInput({
      ...input(),
      signals: { ...input().signals, hidden_override: 100 }
    }),
    /unsupported fields/i
  );
  assert.throws(
    () => normalizeAdaptiveAssuranceInput({
      ...input(),
      reputation_score: 101
    }),
    /between 0 and 100/i
  );
});
