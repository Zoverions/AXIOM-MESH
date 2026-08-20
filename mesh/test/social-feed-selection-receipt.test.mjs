import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  createFeedSelectionReceipt,
  validateFeedSelectionReceiptPolicy
} from '../../packages/axiom-social-feed-policy/selection-receipt.mjs';

const policyUrl = new URL('../config/social-feed-selection-receipt.v0.json', import.meta.url);

async function loadPolicy() {
  return JSON.parse(await readFile(policyUrl, 'utf8'));
}

test('feed selection receipt policy is inert, private by default, and explainable', async () => {
  const policy = await loadPolicy();
  assert.equal(validateFeedSelectionReceiptPolicy(policy), true);
  assert.equal(policy.runtime_activation, false);
  assert.equal(policy.authority_effect, 'none');
  assert.equal(policy.network_effect, 'none');
  assert.equal(policy.explainability.human_reason_available, true);
  assert.equal(policy.explainability.raw_selection_receipt_available, true);
  assert.equal(policy.explainability.opaque_score_alone_is_sufficient, false);
  assert.equal(policy.privacy.selection_receipt_is_owner_private_by_default, true);
  assert.equal(policy.privacy.may_export_without_user_action, false);
});

test('diversity insertion binds the exact user preference and claims no truth or endorsement', async () => {
  const policy = await loadPolicy();
  const receipt = createFeedSelectionReceipt(policy, {
    owner: 'human.owner',
    contentDigest: 'a'.repeat(64),
    selectionReason: 'diversity-counterview',
    sourceClass: 'admitted-remote-observation',
    selectedAt: '2026-08-20T16:30:00.000Z',
    preferenceDigest: 'b'.repeat(64)
  });
  assert.equal(receipt.selection_reason, 'diversity-counterview');
  assert.equal(receipt.preference_digest, 'b'.repeat(64));
  assert.equal(receipt.curation_lens_digest, null);
  assert.equal(receipt.endorsement_claimed, false);
  assert.equal(receipt.truth_judgment_claimed, false);
  assert.equal(receipt.authority_effect, 'none');
  assert.equal(receipt.network_effect, 'none');
});

test('personalized non-chronological reasons fail closed without user preference evidence', async () => {
  const policy = await loadPolicy();
  for (const reason of [
    'topic-match',
    'diversity-counterview',
    'underrepresented-source',
    'user-requested-discovery'
  ]) {
    assert.throws(
      () => createFeedSelectionReceipt(policy, {
        owner: 'human.owner',
        contentDigest: 'a'.repeat(64),
        selectionReason: reason,
        sourceClass: 'admitted-remote-observation',
        selectedAt: '2026-08-20T16:30:00.000Z'
      }),
      /requires a preference digest/
    );
  }
});

test('Circle-curated selection binds the exact curation lens and no other reason may smuggle one', async () => {
  const policy = await loadPolicy();
  const receipt = createFeedSelectionReceipt(policy, {
    owner: 'human.owner',
    contentDigest: 'a'.repeat(64),
    selectionReason: 'circle-curated',
    sourceClass: 'circle-shared-observation',
    selectedAt: '2026-08-20T16:31:00.000Z',
    curationLensDigest: 'c'.repeat(64)
  });
  assert.equal(receipt.curation_lens_digest, 'c'.repeat(64));
  assert.throws(
    () => createFeedSelectionReceipt(policy, {
      owner: 'human.owner',
      contentDigest: 'a'.repeat(64),
      selectionReason: 'chronological',
      sourceClass: 'local-authored',
      selectedAt: '2026-08-20T16:31:00.000Z',
      curationLensDigest: 'c'.repeat(64)
    }),
    /allowed only for circle-curated/
  );
});

test('diversity evidence policy prohibits hidden political and sensitive-trait profiling', async () => {
  const policy = await loadPolicy();
  validateFeedSelectionReceiptPolicy(policy);
  const diversity = policy.diversity_evidence;
  assert.equal(diversity.must_be_user_enabled, true);
  assert.equal(diversity.must_bind_user_preference_digest, true);
  assert.equal(diversity.may_use_hidden_political_label, false);
  assert.equal(diversity.may_infer_religion, false);
  assert.equal(diversity.may_infer_race_or_ethnicity, false);
  assert.equal(diversity.may_infer_sexual_orientation, false);
  assert.equal(diversity.may_infer_health_status, false);
  assert.equal(diversity.may_infer_criminal_history, false);
  assert.equal(diversity.opposing_view_is_truth_judgment, false);
  assert.equal(diversity.underrepresented_source_is_quality_judgment, false);
  assert.equal(diversity.diversity_insertion_is_endorsement, false);
});

test('diversity evidence dimensions are an exact safe inventory rather than a count-only check', async () => {
  const policy = await loadPolicy();
  const tampered = structuredClone(policy);
  tampered.diversity_evidence.allowed_dimensions[0] = 'inferred-political-affiliation';
  assert.throws(
    () => validateFeedSelectionReceiptPolicy(tampered),
    /feed diversity dimensions inventory drifted/
  );

  const duplicated = structuredClone(policy);
  duplicated.diversity_evidence.allowed_dimensions[1] = duplicated.diversity_evidence.allowed_dimensions[0];
  assert.throws(
    () => validateFeedSelectionReceiptPolicy(duplicated),
    /feed diversity dimensions inventory drifted/
  );
});
