import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  diversityPreference,
  feedView,
  presentationMode,
  validateUserSovereignFeedContract
} from '../../packages/axiom-social-feed-policy/index.mjs';

const contractUrl = new URL('../config/social-user-sovereign-feed.v0.json', import.meta.url);

async function loadContract() {
  return JSON.parse(await readFile(contractUrl, 'utf8'));
}

test('user-sovereign feed contract is inert and non-authorizing', async () => {
  const contract = await loadContract();
  assert.equal(validateUserSovereignFeedContract(contract), true);
  assert.equal(contract.runtime_activation, false);
  assert.equal(contract.authority_effect, 'none');
  assert.equal(contract.network_effect, 'none');
  assert.equal(contract.recommendation_effect, 'none');
});

test('community curation cannot disable the member-accessible uncurated view', async () => {
  const contract = await loadContract();
  const curated = feedView(contract, 'curated');
  const uncurated = feedView(contract, 'uncurated');
  assert.equal(curated.curator_may_exclude_from_this_view, true);
  assert.equal(curated.user_can_switch_away, true);
  assert.equal(curated.curator_can_disable_uncurated_view, false);
  assert.equal(uncurated.includes_curated_view_exclusions, true);
  assert.equal(uncurated.still_subject_to_safety_legal_quarantine, true);
  assert.equal(uncurated.claims_complete_network_visibility, false);
  assert.equal(contract.curation.founder_monopoly, false);
  assert.equal(contract.curation.member_selects_lens, true);
  assert.equal(contract.curation.uncurated_access_disableable_by_curator, false);
});

test('personal mute and interaction boundaries never suppress third-party perspectives', async () => {
  const contract = await loadContract();
  validateUserSovereignFeedContract(contract);
  const mute = contract.control_scopes.personal_visibility_mute;
  const interaction = contract.control_scopes.personal_interaction_boundary;
  assert.equal(mute.scope, 'requesting-user-view-only');
  assert.equal(mute.third_party_suppression, false);
  assert.equal(mute.network_deletion, false);
  assert.equal(interaction.scope, 'actor-pair-interaction');
  assert.equal(interaction.may_limit_direct_contact, true);
  assert.equal(interaction.third_party_suppression, false);
  assert.equal(interaction.network_deletion, false);
});

test('curated exclusion remains one lens and never becomes a network ban', async () => {
  const contract = await loadContract();
  const exclusion = contract.control_scopes.curated_lens_exclusion;
  assert.equal(exclusion.scope, 'one-declared-curated-view');
  assert.equal(exclusion.member_uncurated_access_preserved, true);
  assert.equal(exclusion.third_party_network_ban, false);
  assert.equal(contract.non_claims.curator_exclusion_is_network_ban, false);
});

test('reports and suspected spam remain reversible review/filter inputs rather than adjudication', async () => {
  const contract = await loadContract();
  const report = contract.control_scopes.report;
  const filtered = feedView(contract, 'filtered-suspected-spam');
  assert.equal(report.scope, 'review-input');
  assert.equal(report.guilt_claimed, false);
  assert.equal(report.falsity_claimed, false);
  assert.equal(report.spam_truth_claimed, false);
  assert.equal(report.automatic_universal_hiding, false);
  assert.equal(filtered.user_inspectable_when_lawful_and_safe, true);
  assert.equal(filtered.report_is_adjudication, false);
  assert.equal(filtered.spam_label_is_irreversible, false);
});

test('safety or legal quarantine is a separately scoped high-severity policy', async () => {
  const contract = await loadContract();
  const quarantine = contract.control_scopes.safety_legal_quarantine;
  assert.equal(quarantine.scope, 'separate-high-severity-policy');
  assert.equal(quarantine.may_override_ordinary_visibility, true);
  assert.equal(quarantine.must_not_be_inferred_from_disagreement, true);
  assert.equal(quarantine.must_not_be_inferred_from_ordinary_report, true);
});

test('perspective diversity defaults to ten percent but remains explicitly user controlled', async () => {
  const contract = await loadContract();
  validateUserSovereignFeedContract(contract);
  assert.equal(contract.diversity.default_basis_points, 1000);
  assert.equal(contract.diversity.hard_platform_minimum, false);
  assert.equal(contract.diversity.requires_hidden_ideological_label, false);
  assert.deepEqual(diversityPreference(contract, 1000), {
    basis_points: 1000,
    user_selected: true,
    hard_platform_minimum_applied: false
  });
  assert.deepEqual(diversityPreference(contract, 3500), {
    basis_points: 3500,
    user_selected: true,
    hard_platform_minimum_applied: false
  });
  assert.deepEqual(diversityPreference(contract, 0), {
    basis_points: 0,
    user_selected: true,
    hard_platform_minimum_applied: false
  });
  assert.throws(() => diversityPreference(contract, -1), /outside the user-controlled range/);
  assert.throws(() => diversityPreference(contract, 10001), /outside the user-controlled range/);
});

test('feed selection reasons make non-chronological insertion explainable', async () => {
  const contract = await loadContract();
  validateUserSovereignFeedContract(contract);
  assert.equal(contract.provenance.why_am_i_seeing_this_supported, true);
  assert.equal(contract.provenance.selection_reason_required_for_non_chronological_insertion, true);
  assert.equal(contract.provenance.curation_lens_identity_required, true);
  assert.equal(contract.provenance.filter_source_required, true);
  assert.equal(contract.provenance.opaque_ranking_score_required, false);
  assert.ok(contract.selection_reasons.includes('diversity-counterview'));
  assert.ok(contract.selection_reasons.includes('underrepresented-source'));
  assert.ok(contract.selection_reasons.includes('suspected-spam-visible-by-choice'));
});

test('sensitivity transformations never mutate or impersonate the canonical source', async () => {
  const contract = await loadContract();
  validateUserSovereignFeedContract(contract);
  assert.equal(contract.presentation.canonical_original_preserved, true);
  assert.equal(contract.presentation.original_one_action_away_when_lawful_and_safe, true);
  assert.equal(contract.presentation.transformation_scope, 'local-presentation-only');
  assert.equal(contract.presentation.transformation_receipt_required, true);
  assert.equal(contract.presentation.source_digest_required, true);
  assert.equal(contract.presentation.transformed_rendering_may_claim_author_exact_words, false);
  assert.equal(contract.presentation.transformed_rendering_may_mutate_canonical_source, false);

  assert.deepEqual(presentationMode(contract, 'soften-local-rendering'), {
    mode: 'soften-local-rendering',
    canonical_original_preserved: true,
    transformation_scope: 'local-presentation-only',
    may_claim_author_exact_words: false
  });
  assert.deepEqual(presentationMode(contract, 'show-original'), {
    mode: 'show-original',
    canonical_original_preserved: true,
    transformation_scope: 'none',
    may_claim_author_exact_words: true
  });
});

test('feed contract keeps recommendation, moderation and transformation non-claims explicit', async () => {
  const contract = await loadContract();
  validateUserSovereignFeedContract(contract);
  assert.deepEqual(contract.non_claims, {
    recommendation_is_endorsement: false,
    opposing_view_classification_is_truth_judgment: false,
    report_is_guilt: false,
    mute_is_deletion: false,
    curator_exclusion_is_network_ban: false,
    transformation_is_source_mutation: false,
    uncurated_view_is_complete_internet: false
  });
});
