import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const REVIEW_URL = new URL(
  '../config/circle-grid-admission-threat-review.v0.json',
  import.meta.url
);
const SOURCE_URLS = [
  new URL('../src/grid/circle-admission.mjs', import.meta.url),
  new URL('../src/grid/circle-admission-implementation.mjs', import.meta.url)
];

const EXPECTED_THREATS = new Set([
  'forged-admission-capability',
  'subject-substitution',
  'event-or-head-substitution',
  'hidden-claim-or-constraint-authority',
  'bearer-token-replay',
  'reissued-token-replay',
  'cross-actor-event-replay',
  'collective-decision-submitter-confusion',
  'separate-consumption-crash-window',
  'clock-and-expiry-manipulation',
  'upstream-policy-evidence-laundering',
  'admission-to-circle-authority-laundering',
  'receipt-evidence-laundering',
  'capability-secret-persistence',
  'direct-store-bypass'
]);

const EXPECTED_NON_CLAIMS = new Set([
  'human-identity',
  'legal-identity',
  'circle-membership-role',
  'circle-decision-validity',
  'historical-truth',
  'complete-history',
  'governance-legitimacy',
  'legal-authority',
  'execution-authority',
  'portable-authority',
  'external-effect-authority',
  'distributed-consensus'
]);

test('Circle Grid admission threat review preserves exact threat and non-claim inventories', async () => {
  const review = JSON.parse(await readFile(REVIEW_URL, 'utf8'));
  assert.equal(review.schema, 'axiom-circle-grid-admission-threat-review.v0');
  assert.equal(review.version, 0);
  assert.equal(review.status, 'internal-admission-threat-review');
  assert.equal(review.runtime_activation, false);
  assert.equal(review.authority_effect, 'none');
  assert.equal(review.network_effect, 'none');

  assert.deepEqual(new Set(review.threats.map(item => item.id)), EXPECTED_THREATS);
  assert.equal(review.threats.length, EXPECTED_THREATS.size);
  for (const threat of review.threats) {
    assert.equal(typeof threat.control, 'string');
    assert.ok(threat.control.length > 20);
    assert.equal(typeof threat.residual, 'string');
    assert.ok(threat.residual.length > 20);
  }

  assert.deepEqual(new Set(review.non_claims), EXPECTED_NON_CLAIMS);
  assert.equal(review.non_claims.length, EXPECTED_NON_CLAIMS.size);
});

test('Circle Grid admission promotion blockers retain runtime, role, transport, clock, evidence, secret, and review boundaries', async () => {
  const review = JSON.parse(await readFile(REVIEW_URL, 'utf8'));
  assert.equal(review.promotion_blockers.length, 10);
  const blockers = review.promotion_blockers.join('\n').toLowerCase();
  for (const required of [
    'hypervisor issuance',
    'record-type authorization',
    'sole service-level circle append path',
    'transport identity',
    'service clock',
    'authenticated evidence',
    'key rotation',
    'raw capabilities',
    'receipts',
    'security, privacy, governance, and accessibility review'
  ]) {
    assert.match(blockers, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('Circle Grid admission source implements the threat-review security boundaries without claiming Circle authority', async () => {
  const source = (await Promise.all(SOURCE_URLS.map(url => readFile(url, 'utf8')))).join('\n');
  for (const required of [
    "audience: CIRCLE_GRID_ADMISSION_POLICY.audience",
    "issuer: CIRCLE_GRID_ADMISSION_POLICY.issuer_service",
    'deriveCircleGridAdmissionJti',
    'deriveCircleGridAdmissionInvocationDigest',
    'deriveCircleGridAdmissionTraceId',
    'circle_persistence_admission_replay_mismatch',
    'verifyObjectSignature',
    'event_hash',
    'payload_digest',
    'circle_persistence_admission_grid_event_invalid',
    'runtime_authority: false',
    'portable_authority: false',
    'external_effect_authority: false',
    'Circle Grid admission persistence event'
  ]) {
    assert.ok(source.includes(required), `missing admission boundary: ${required}`);
  }
  assert.doesNotMatch(source, /runtime_authority:\s*true/);
  assert.doesNotMatch(source, /portable_authority:\s*true/);
  assert.doesNotMatch(source, /external_effect_authority:\s*true/);
});
