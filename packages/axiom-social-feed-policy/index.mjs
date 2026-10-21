const VIEW_IDS = new Set(['curated', 'uncurated', 'filtered-suspected-spam']);
const DIVERSITY_DIMENSIONS = new Set([
  'viewpoint-distance',
  'source-novelty',
  'topic-novelty',
  'geographic-breadth',
  'evidence-source-diversity',
  'chronological-ranked-balance'
]);
const SELECTION_REASONS = new Set([
  'followed-source',
  'circle-curated',
  'chronological',
  'topic-match',
  'diversity-counterview',
  'underrepresented-source',
  'user-requested-discovery',
  'suspected-spam-visible-by-choice'
]);
const PRESENTATION_MODES = new Set([
  'show-original',
  'mask-selected-terms',
  'soften-local-rendering',
  'summarize-before-reveal',
  'warning-before-reveal'
]);

export function validateUserSovereignFeedContract(contract) {
  exactObject(contract, 'user-sovereign feed contract', [
    'schema',
    'version',
    'status',
    'runtime_activation',
    'authority_effect',
    'network_effect',
    'recommendation_effect',
    'views',
    'control_scopes',
    'curation',
    'diversity',
    'selection_reasons',
    'presentation',
    'provenance',
    'non_claims'
  ]);
  if (
    contract.schema !== 'axiom-social-user-sovereign-feed.v0'
    || contract.version !== 0
    || contract.status !== 'inert-feed-policy-contract'
    || contract.runtime_activation !== false
    || contract.authority_effect !== 'none'
    || contract.network_effect !== 'none'
    || contract.recommendation_effect !== 'none'
  ) throw new Error('User-sovereign feed activation boundary is invalid');

  validateViews(contract.views);
  validateControlScopes(contract.control_scopes);
  validateCuration(contract.curation);
  validateDiversity(contract.diversity);
  validateExactSet(contract.selection_reasons, SELECTION_REASONS, 'feed selection reasons');
  validatePresentation(contract.presentation);
  validateProvenance(contract.provenance);
  validateNonClaims(contract.non_claims);
  return true;
}

export function feedView(contract, viewId) {
  validateUserSovereignFeedContract(contract);
  if (!VIEW_IDS.has(viewId)) throw new Error('Unknown feed view');
  return Object.freeze({ ...contract.views.find(view => view.id === viewId) });
}

export function diversityPreference(contract, requestedBasisPoints) {
  validateUserSovereignFeedContract(contract);
  if (!Number.isSafeInteger(requestedBasisPoints)) {
    throw new Error('Diversity preference must use integer basis points');
  }
  if (
    requestedBasisPoints < contract.diversity.minimum_basis_points
    || requestedBasisPoints > contract.diversity.maximum_basis_points
  ) throw new Error('Diversity preference is outside the user-controlled range');
  return Object.freeze({
    basis_points: requestedBasisPoints,
    user_selected: true,
    hard_platform_minimum_applied: false
  });
}

export function presentationMode(contract, mode) {
  validateUserSovereignFeedContract(contract);
  if (!PRESENTATION_MODES.has(mode)) throw new Error('Unsupported presentation mode');
  return Object.freeze({
    mode,
    canonical_original_preserved: true,
    transformation_scope: mode === 'show-original' ? 'none' : 'local-presentation-only',
    may_claim_author_exact_words: mode === 'show-original'
  });
}

function validateViews(views) {
  if (!Array.isArray(views) || views.length !== 3) throw new Error('Feed view inventory is invalid');
  const ids = new Set(views.map(view => view?.id));
  if (ids.size !== VIEW_IDS.size || [...VIEW_IDS].some(id => !ids.has(id))) {
    throw new Error('Feed view inventory drifted');
  }

  const curated = views.find(view => view.id === 'curated');
  exactObject(curated, 'curated feed view', [
    'id',
    'source',
    'curator_may_exclude_from_this_view',
    'user_can_switch_away',
    'curator_can_disable_uncurated_view'
  ]);
  if (
    curated.source !== 'declared-curation-lens'
    || curated.curator_may_exclude_from_this_view !== true
    || curated.user_can_switch_away !== true
    || curated.curator_can_disable_uncurated_view !== false
  ) throw new Error('Curated view grants excessive curator authority');

  const uncurated = views.find(view => view.id === 'uncurated');
  exactObject(uncurated, 'uncurated feed view', [
    'id',
    'source',
    'includes_curated_view_exclusions',
    'still_subject_to_safety_legal_quarantine',
    'claims_complete_network_visibility'
  ]);
  if (
    uncurated.source !== 'broader-admissible-corpus'
    || uncurated.includes_curated_view_exclusions !== true
    || uncurated.still_subject_to_safety_legal_quarantine !== true
    || uncurated.claims_complete_network_visibility !== false
  ) throw new Error('Uncurated view claim boundary is invalid');

  const filtered = views.find(view => view.id === 'filtered-suspected-spam');
  exactObject(filtered, 'filtered feed view', [
    'id',
    'source',
    'user_inspectable_when_lawful_and_safe',
    'report_is_adjudication',
    'spam_label_is_irreversible'
  ]);
  if (
    filtered.source !== 'reported-or-lower-confidence-material'
    || filtered.user_inspectable_when_lawful_and_safe !== true
    || filtered.report_is_adjudication !== false
    || filtered.spam_label_is_irreversible !== false
  ) throw new Error('Filtered view is not reversibly user inspectable');
}

function validateControlScopes(scopes) {
  exactObject(scopes, 'feed control scopes', [
    'personal_visibility_mute',
    'personal_interaction_boundary',
    'curated_lens_exclusion',
    'report',
    'safety_legal_quarantine'
  ]);

  exactObject(scopes.personal_visibility_mute, 'personal visibility mute', [
    'scope',
    'third_party_suppression',
    'network_deletion'
  ]);
  if (
    scopes.personal_visibility_mute.scope !== 'requesting-user-view-only'
    || scopes.personal_visibility_mute.third_party_suppression !== false
    || scopes.personal_visibility_mute.network_deletion !== false
  ) throw new Error('Personal visibility mute exceeds user-local scope');

  exactObject(scopes.personal_interaction_boundary, 'personal interaction boundary', [
    'scope',
    'may_limit_direct_contact',
    'third_party_suppression',
    'network_deletion'
  ]);
  if (
    scopes.personal_interaction_boundary.scope !== 'actor-pair-interaction'
    || scopes.personal_interaction_boundary.may_limit_direct_contact !== true
    || scopes.personal_interaction_boundary.third_party_suppression !== false
    || scopes.personal_interaction_boundary.network_deletion !== false
  ) throw new Error('Personal interaction boundary suppresses third parties');

  exactObject(scopes.curated_lens_exclusion, 'curated lens exclusion', [
    'scope',
    'member_uncurated_access_preserved',
    'third_party_network_ban'
  ]);
  if (
    scopes.curated_lens_exclusion.scope !== 'one-declared-curated-view'
    || scopes.curated_lens_exclusion.member_uncurated_access_preserved !== true
    || scopes.curated_lens_exclusion.third_party_network_ban !== false
  ) throw new Error('Curated lens exclusion became a network ban');

  exactObject(scopes.report, 'report scope', [
    'scope',
    'guilt_claimed',
    'falsity_claimed',
    'spam_truth_claimed',
    'automatic_universal_hiding'
  ]);
  if (
    scopes.report.scope !== 'review-input'
    || scopes.report.guilt_claimed !== false
    || scopes.report.falsity_claimed !== false
    || scopes.report.spam_truth_claimed !== false
    || scopes.report.automatic_universal_hiding !== false
  ) throw new Error('Report scope became adjudication');

  exactObject(scopes.safety_legal_quarantine, 'safety/legal quarantine', [
    'scope',
    'may_override_ordinary_visibility',
    'must_not_be_inferred_from_disagreement',
    'must_not_be_inferred_from_ordinary_report'
  ]);
  if (
    scopes.safety_legal_quarantine.scope !== 'separate-high-severity-policy'
    || scopes.safety_legal_quarantine.may_override_ordinary_visibility !== true
    || scopes.safety_legal_quarantine.must_not_be_inferred_from_disagreement !== true
    || scopes.safety_legal_quarantine.must_not_be_inferred_from_ordinary_report !== true
  ) throw new Error('Safety/legal quarantine is not separately scoped');
}

function validateCuration(curation) {
  exactObject(curation, 'curation policy', [
    'founder_monopoly',
    'multiple_declared_lenses_allowed',
    'charter_may_define_curator_roles',
    'member_selects_lens',
    'uncurated_access_disableable_by_curator',
    'curator_preference_becomes_member_preference'
  ]);
  if (
    curation.founder_monopoly !== false
    || curation.multiple_declared_lenses_allowed !== true
    || curation.charter_may_define_curator_roles !== true
    || curation.member_selects_lens !== true
    || curation.uncurated_access_disableable_by_curator !== false
    || curation.curator_preference_becomes_member_preference !== false
  ) throw new Error('Curation policy grants founder or curator monopoly');
}

function validateDiversity(diversity) {
  exactObject(diversity, 'diversity policy', [
    'user_controlled',
    'default_basis_points',
    'minimum_basis_points',
    'maximum_basis_points',
    'hard_platform_minimum',
    'requires_hidden_ideological_label',
    'dimensions'
  ]);
  if (
    diversity.user_controlled !== true
    || diversity.default_basis_points !== 1000
    || diversity.minimum_basis_points !== 0
    || diversity.maximum_basis_points !== 10000
    || diversity.hard_platform_minimum !== false
    || diversity.requires_hidden_ideological_label !== false
  ) throw new Error('Diversity policy is not user controlled');
  validateExactSet(diversity.dimensions, DIVERSITY_DIMENSIONS, 'diversity dimensions');
}

function validatePresentation(presentation) {
  exactObject(presentation, 'presentation policy', [
    'canonical_original_preserved',
    'original_one_action_away_when_lawful_and_safe',
    'modes',
    'transformation_scope',
    'transformation_receipt_required',
    'source_digest_required',
    'transformed_rendering_may_claim_author_exact_words',
    'transformed_rendering_may_mutate_canonical_source'
  ]);
  if (
    presentation.canonical_original_preserved !== true
    || presentation.original_one_action_away_when_lawful_and_safe !== true
    || presentation.transformation_scope !== 'local-presentation-only'
    || presentation.transformation_receipt_required !== true
    || presentation.source_digest_required !== true
    || presentation.transformed_rendering_may_claim_author_exact_words !== false
    || presentation.transformed_rendering_may_mutate_canonical_source !== false
  ) throw new Error('Presentation policy can rewrite canonical authorship');
  validateExactSet(presentation.modes, PRESENTATION_MODES, 'presentation modes');
}

function validateProvenance(provenance) {
  exactObject(provenance, 'feed provenance policy', [
    'why_am_i_seeing_this_supported',
    'selection_reason_required_for_non_chronological_insertion',
    'curation_lens_identity_required',
    'filter_source_required',
    'opaque_ranking_score_required'
  ]);
  if (
    provenance.why_am_i_seeing_this_supported !== true
    || provenance.selection_reason_required_for_non_chronological_insertion !== true
    || provenance.curation_lens_identity_required !== true
    || provenance.filter_source_required !== true
    || provenance.opaque_ranking_score_required !== false
  ) throw new Error('Feed provenance is not explainable');
}

function validateNonClaims(nonClaims) {
  exactObject(nonClaims, 'feed non-claims', [
    'recommendation_is_endorsement',
    'opposing_view_classification_is_truth_judgment',
    'report_is_guilt',
    'mute_is_deletion',
    'curator_exclusion_is_network_ban',
    'transformation_is_source_mutation',
    'uncurated_view_is_complete_internet'
  ]);
  if (Object.values(nonClaims).some(value => value !== false)) {
    throw new Error('Feed non-claim was promoted to a claim');
  }
}

function validateExactSet(values, expected, label) {
  if (!Array.isArray(values)) throw new Error(`${label} must be an array`);
  const actual = new Set(values);
  if (actual.size !== expected.size || [...expected].some(value => !actual.has(value))) {
    throw new Error(`${label} inventory drifted`);
  }
}

function exactObject(value, label, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error(`${label} fields are invalid`);
  }
}
