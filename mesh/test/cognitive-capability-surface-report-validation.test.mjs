import assert from 'node:assert/strict';
import test from 'node:test';
import {
  validateCognitiveCapabilitySurfaceReport
} from '../src/lib/cognitive-capability-surface-report.mjs';

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);

function source(observation_id, observation_digest) {
  return {
    observation_id,
    observation_digest,
    capability: 'reasoning',
    freshness: 'current',
    observed_at: '2026-09-06T12:00:00.000Z',
    valid_until: '2026-10-06T12:00:00.000Z',
    recorded_at: '2026-09-06T12:01:00.000Z'
  };
}

function report(source_observations) {
  return {
    schema: 'axiom-cognitive-capability-surface-report.v0',
    version: 0,
    status: 'inert-evidence-report',
    report_id: 'capsurface.validation.review.v1',
    profile_id: 'cognitive.example.validation',
    profile_digest: A,
    assessment_at: '2026-09-06T13:00:00.000Z',
    recorded_at: '2026-09-06T13:01:00.000Z',
    source_observations,
    capability_surfaces: [],
    contains_secret_material: false,
    authority_effect: 'none',
    network_effect: 'none',
    training_effect: 'none',
    spend_effect: 'none',
    runtime_activation: false,
    selection_effect: 'evidence-only'
  };
}

test('validator fails closed on duplicate source observation_id with different digests', () => {
  const document = report([
    source('capobs.review.same-id', A),
    source('capobs.review.same-id', B)
  ]);

  assert.throws(
    () => validateCognitiveCapabilitySurfaceReport(document),
    /duplicate observation_id/i
  );
});

test('validator fails closed on duplicate source observation_digest under different ids', () => {
  const document = report([
    source('capobs.review.digest.a', A),
    source('capobs.review.digest.b', A)
  ]);

  assert.throws(
    () => validateCognitiveCapabilitySurfaceReport(document),
    /duplicate observation digest/i
  );
});
