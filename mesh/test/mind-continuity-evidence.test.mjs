import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MIND_CONTINUITY_EVIDENCE_SCHEMA,
  assessMindContinuityEvidence
} from '../src/lib/mind-continuity-evidence.mjs';

function fixture(overrides = {}) {
  return {
    schema: MIND_CONTINUITY_EVIDENCE_SCHEMA,
    event_id: 'continuity.restore.1',
    mind_id: 'digital.founder.1',
    event_kind: 'restore',
    source_identity_digest: 'a'.repeat(64),
    source_state_digest: 'b'.repeat(64),
    candidate_state_digest: 'c'.repeat(64),
    simultaneous_active_claims: 0,
    divergence_declared: false,
    separate_standing_requested: false,
    observed_at: '2026-09-25T13:00:00.000Z',
    population_effect: 'none',
    governance_identity_effect: 'none',
    authority_effect: 'none',
    runtime_activation: false,
    ...overrides
  };
}

test('clean restore remains one identity and creates no population or governance identity', () => {
  const result = assessMindContinuityEvidence(fixture());

  assert.equal(result.status, 'continuity-candidate');
  assert.equal(result.privileged_governance_blocked, false);
  assert.equal(result.genesis_review_required, false);
  assert.equal(result.recognized_population_delta, 0);
  assert.equal(result.new_governance_identity, false);
  assert.equal(result.authority_effect, 'none');
  assert.equal(result.runtime_activation, false);
});

test('simultaneous restore claims fail closed for privileged governance', () => {
  const result = assessMindContinuityEvidence(fixture({
    simultaneous_active_claims: 1
  }));

  assert.equal(result.status, 'continuity-dispute');
  assert.equal(result.privileged_governance_blocked, true);
  assert.equal(result.recognized_population_delta, 0);
});

test('parallel runtime instance cannot become a second citizen or vote', () => {
  const result = assessMindContinuityEvidence(fixture({
    event_id: 'continuity.parallel.1',
    event_kind: 'parallel-instance',
    simultaneous_active_claims: 1
  }));

  assert.equal(result.status, 'continuity-dispute');
  assert.equal(result.privileged_governance_blocked, true);
  assert.equal(result.recognized_population_delta, 0);
  assert.equal(result.new_governance_identity, false);
});

test('divergent fork requesting separate standing requires Genesis review and remains population-neutral', () => {
  const result = assessMindContinuityEvidence(fixture({
    event_id: 'continuity.fork.1',
    event_kind: 'divergent-fork',
    divergence_declared: true,
    separate_standing_requested: true
  }));

  assert.equal(result.status, 'genesis-review-required');
  assert.equal(result.genesis_review_required, true);
  assert.equal(result.privileged_governance_blocked, true);
  assert.equal(result.recognized_population_delta, 0);
  assert.equal(result.new_governance_identity, false);
});

test('divergent fork without separate-standing request is still a continuity dispute', () => {
  const result = assessMindContinuityEvidence(fixture({
    event_id: 'continuity.fork.2',
    event_kind: 'divergent-fork',
    divergence_declared: true,
    separate_standing_requested: false
  }));

  assert.equal(result.status, 'continuity-dispute');
  assert.equal(result.genesis_review_required, false);
  assert.equal(result.privileged_governance_blocked, true);
});

test('restore cannot smuggle divergence or separate standing', () => {
  assert.throws(
    () => assessMindContinuityEvidence(fixture({ divergence_declared: true })),
    /Restore continuity evidence cannot claim divergence/
  );

  assert.throws(
    () => assessMindContinuityEvidence(fixture({ separate_standing_requested: true })),
    /Restore continuity evidence cannot claim divergence/
  );
});

test('parallel instance cannot claim separate standing without fork review', () => {
  assert.throws(
    () => assessMindContinuityEvidence(fixture({
      event_kind: 'parallel-instance',
      separate_standing_requested: true
    })),
    /cannot claim separate standing/
  );
});

test('fork label cannot be used without declaring divergence', () => {
  assert.throws(
    () => assessMindContinuityEvidence(fixture({
      event_kind: 'divergent-fork',
      divergence_declared: false
    })),
    /must declare divergence/
  );
});

test('continuity evidence cannot directly change population, identity, authority, or runtime state', () => {
  for (const [field, value] of [
    ['population_effect', 'increment'],
    ['governance_identity_effect', 'create'],
    ['authority_effect', 'grant'],
    ['runtime_activation', true]
  ]) {
    assert.throws(
      () => assessMindContinuityEvidence(fixture({ [field]: value })),
      /activation boundary/
    );
  }
});
