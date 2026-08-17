import assert from 'node:assert/strict';
import test from 'node:test';

import {
  REMOTE_SOCIAL_REVIEW_SCHEMA,
  buildRemoteSocialReviewProjection
} from '../src/grid/remote-social-review-projection.mjs';

const A = 'principal-review-a';
const B = 'principal-review-b';
const DIGEST_A = 'a'.repeat(64);
const DIGEST_B = 'b'.repeat(64);
const PEM = '-----BEGIN PUBLIC KEY-----\nSECRET-EXPORTER-PEM\n-----END PUBLIC KEY-----\n';

function ownerData(owner, suffix, digest) {
  const stageId = `stage-${suffix}`;
  const admissionId = `admission-${suffix}`;
  const observationId = `observation-${suffix}`;
  const followId = `follow-${suffix}`;
  const receiptId = `receipt-${suffix}`;
  return {
    stages: [{
      owner,
      stage_id: stageId,
      package_digest: digest,
      exporter_grid_id: `grid-${suffix}`,
      exporter_key_id: digest,
      trust_label: `manual-${suffix}`,
      package_json: {
        schema: 'axiom-social-exchange-package.v1',
        attestation: { signature: `secret-signature-${suffix}` },
        statement: { publications: [{ content: { text: `raw-package-${suffix}` } }] }
      },
      import_plan_json: {
        plan_digest: digest,
        status: 'review-only',
        requires_operator_approval: true,
        admitted_objects: {
          persona_projection_digests: [digest],
          publication_digests: [digest],
          transition_digests: []
        }
      },
      trusted_exporter_json: {
        public_key: PEM,
        exporter_grid_id: `grid-${suffix}`,
        exporter_key_id: digest
      },
      created_at: '2026-08-17T04:00:00.000Z',
      expires_at: '2026-08-17T05:00:00.000Z'
    }],
    admissions: [{
      owner,
      admission_id: admissionId,
      stage_id: stageId,
      package_digest: digest,
      exporter_grid_id: `grid-${suffix}`,
      exporter_key_id: digest,
      intent_id: `intent-${suffix}`,
      approval_id: `approval-${suffix}`,
      request_digest: digest,
      import_plan_digest: digest,
      trust_label: `manual-${suffix}`,
      summary_json: {
        admitted_objects: {
          persona_projection_digests: [digest],
          publication_digests: [digest],
          transition_digests: []
        },
        private_review_notes: `internal-${suffix}`
      },
      status: 'admitted',
      admitted_at: '2026-08-17T04:10:00.000Z'
    }],
    observations: [{
      owner,
      observation_id: observationId,
      exporter_grid_id: `grid-${suffix}`,
      exporter_key_id: digest,
      object_kind: 'publication',
      object_digest: digest,
      object_json: {
        publication_id: `publication-${suffix}`,
        persona_id: `persona-${suffix}`,
        persona_projection_digest: digest,
        attribution_mode: 'pseudonymous',
        public_actor_link: null,
        content: {
          media_type: 'text/plain',
          text: `public observation ${suffix}`
        },
        discoverability: 'listed',
        authorship_mode: 'human-authored',
        created_at: '2026-08-17T04:05:00.000Z',
        supersedes_digest: null,
        controller_actor_id: `must-not-leak-${suffix}`
      },
      first_admission_id: admissionId,
      observed_at: '2026-08-17T04:10:00.000Z'
    }],
    follows: [{
      owner,
      follow_id: followId,
      exporter_grid_id: `grid-${suffix}`,
      exporter_key_id: digest,
      persona_projection_digest: digest,
      persona_observation_id: `persona-observation-${suffix}`,
      trust_json: {
        owner_trust_label: `trusted-by-owner-${suffix}`,
        trust_scope: 'exporter-attestation-only',
        content_truth_claimed: false,
        legal_identity_claimed: false,
        actor_authorship_claimed: false
      },
      status: 'following',
      followed_at: '2026-08-17T04:15:00.000Z',
      unfollowed_at: null
    }],
    retention: {
      owner,
      policy: {
        schema: 'axiom-remote-social-retention-policy.v1',
        max_stages: 64,
        max_stage_protected_bytes: 67108864,
        max_admissions: 2048,
        max_observations: 20000,
        max_observation_protected_bytes: 134217728,
        max_retention_receipts: 10000
      },
      stage_count: 1,
      stage_protected_bytes: 4096,
      admission_count: 1,
      observation_count: 1,
      observation_protected_bytes: 1024,
      retention_receipt_count: 1,
      expired_unadmitted_stage_count: 0,
      expired_unadmitted_protected_bytes: 0,
      violations: [],
      within_policy: true
    },
    receipts: [{
      owner,
      receipt_id: receiptId,
      action: 'expire-unadmitted-stage',
      stage_id: `expired-stage-${suffix}`,
      package_digest: digest,
      exporter_grid_id: `grid-${suffix}`,
      exporter_key_id: digest,
      import_plan_digest: digest,
      stage_created_at: '2026-08-17T02:00:00.000Z',
      stage_expires_at: '2026-08-17T03:00:00.000Z',
      logical_bytes_reclaimed: 512,
      protected_bytes_reclaimed: 768,
      reason_code: 'review-expired',
      occurred_at: '2026-08-17T03:10:00.000Z'
    }]
  };
}

function fakeStore(dataByOwner, { leakOwner } = {}) {
  const pick = (owner, key) => {
    const selected = leakOwner ?? owner;
    const data = dataByOwner.get(selected);
    if (!data) throw new Error(`missing fake owner ${selected}`);
    return data[key];
  };
  return {
    listRemoteSocialStages(owner, { limit }) {
      return { stages: pick(owner, 'stages').slice(0, limit), truncated: false };
    },
    listRemoteSocialAdmissions(owner, { limit }) {
      return { admissions: pick(owner, 'admissions').slice(0, limit), truncated: false };
    },
    listRemoteSocialObservations(owner, { limit }) {
      return { observations: pick(owner, 'observations').slice(0, limit), truncated: false };
    },
    listRemoteSocialFollows(owner, { limit }) {
      return { follows: pick(owner, 'follows').slice(0, limit), truncated: false };
    },
    getRemoteSocialRetentionAssessment(owner) {
      return pick(owner, 'retention');
    },
    listRemoteSocialRetentionReceipts(owner, { limit }) {
      return { receipts: pick(owner, 'receipts').slice(0, limit), truncated: false };
    }
  };
}

test('projection exposes a bounded owner-scoped read-only review shape', () => {
  const data = new Map([[A, ownerData(A, 'a', DIGEST_A)]]);
  const review = buildRemoteSocialReviewProjection(fakeStore(data), A);
  assert.equal(review.schema, REMOTE_SOCIAL_REVIEW_SCHEMA);
  assert.equal(review.owner, A);
  assert.equal(review.activation_scope, 'local-read-only-review');
  assert.equal(review.stages.length, 1);
  assert.equal(review.stages[0].object_counts.publications, 1);
  assert.equal(review.admissions.length, 1);
  assert.equal(review.observations[0].text_preview, 'public observation a');
  assert.equal(review.follows[0].trust_scope, 'exporter-attestation-only');
  assert.equal(review.retention.stage_count, 1);
  assert.equal(review.mutation_effect, 'none');
  assert.equal(review.network_effect, 'none');
  assert.equal(review.recommendation_effect, 'none');
  assert.equal(review.authority_effect, 'none');
  assert.equal(review.transport_state_included, false);
  assert.equal(review.ranking_state_included, false);
  assert.equal(review.exporter_attestation_is_identity_proof, false);
  assert.equal(review.exporter_attestation_is_content_truth_proof, false);
  assert.equal(review.local_admission_is_authorship_proof, false);
  assert.ok(review.response_bytes > 0);
  assert.ok(review.response_bytes < 524288);
});

test('projection strips exporter PEM, package signatures, raw package body and protected persona fields', () => {
  const data = new Map([[A, ownerData(A, 'a', DIGEST_A)]]);
  const serialized = JSON.stringify(buildRemoteSocialReviewProjection(fakeStore(data), A));
  for (const forbidden of [
    'SECRET-EXPORTER-PEM',
    'secret-signature-a',
    'raw-package-a',
    'must-not-leak-a',
    'private_review_notes',
    'trusted_exporter_json',
    'package_json',
    'controller_actor_id'
  ]) {
    assert.equal(serialized.includes(forbidden), false, `leaked ${forbidden}`);
  }
});

test('two-owner projection cannot reveal another owners identifiers, content or private trust label', () => {
  const data = new Map([
    [A, ownerData(A, 'a', DIGEST_A)],
    [B, ownerData(B, 'b', DIGEST_B)]
  ]);
  const serializedA = JSON.stringify(buildRemoteSocialReviewProjection(fakeStore(data), A));
  assert.equal(serializedA.includes('stage-a'), true);
  assert.equal(serializedA.includes('public observation a'), true);
  for (const foreign of [
    B,
    'stage-b',
    'admission-b',
    'observation-b',
    'follow-b',
    'receipt-b',
    'public observation b',
    'trusted-by-owner-b',
    'grid-b'
  ]) {
    assert.equal(serializedA.includes(foreign), false, `cross-owner leak: ${foreign}`);
  }
});

test('projection independently rejects a store regression that returns a foreign owner row', () => {
  const data = new Map([
    [A, ownerData(A, 'a', DIGEST_A)],
    [B, ownerData(B, 'b', DIGEST_B)]
  ]);
  assert.throws(
    () => buildRemoteSocialReviewProjection(fakeStore(data, { leakOwner: B }), A),
    /owner binding is invalid/
  );
});

test('projection rejects trust expansion and unsupported or excessive caller limits', () => {
  const a = ownerData(A, 'a', DIGEST_A);
  a.follows[0].trust_json.content_truth_claimed = true;
  const data = new Map([[A, a]]);
  assert.throws(
    () => buildRemoteSocialReviewProjection(fakeStore(data), A),
    /trust exceeds the allowed scope/
  );

  const clean = new Map([[A, ownerData(A, 'a', DIGEST_A)]]);
  assert.throws(
    () => buildRemoteSocialReviewProjection(fakeStore(clean), A, {
      limits: { observations: 201 }
    }),
    /between 1 and 200/
  );
  assert.throws(
    () => buildRemoteSocialReviewProjection(fakeStore(clean), A, {
      limits: { arbitrary: 1 }
    }),
    /unsupported field arbitrary/
  );
});

test('public observation preview is bounded without rejecting harmless security-looking text', () => {
  const a = ownerData(A, 'a', DIGEST_A);
  a.observations[0].object_json.content.text = `BEGIN PUBLIC KEY ${'x'.repeat(400)} signature`;
  const review = buildRemoteSocialReviewProjection(fakeStore(new Map([[A, a]])), A);
  assert.equal(review.observations[0].text_preview.length, 280);
  assert.equal(review.observations[0].text_preview.endsWith('…'), true);
});
