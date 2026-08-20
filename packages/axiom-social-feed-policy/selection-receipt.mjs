const DIGEST = /^[a-f0-9]{64}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const REASONS = new Set([
  'followed-source',
  'circle-curated',
  'chronological',
  'topic-match',
  'diversity-counterview',
  'underrepresented-source',
  'user-requested-discovery',
  'suspected-spam-visible-by-choice'
]);
const SOURCE_CLASSES = new Set([
  'local-authored',
  'followed-remote-observation',
  'admitted-remote-observation',
  'circle-shared-observation',
  'user-imported-public-observation'
]);
const PERSONALIZED_REASONS = new Set([
  'topic-match',
  'diversity-counterview',
  'underrepresented-source',
  'user-requested-discovery'
]);

export function createFeedSelectionReceipt(policy, {
  owner,
  contentDigest,
  selectionReason,
  sourceClass,
  selectedAt,
  preferenceDigest = null,
  curationLensDigest = null
}) {
  validateFeedSelectionReceiptPolicy(policy);
  const reason = enumValue(selectionReason, REASONS, 'feed selection reason');
  const source = enumValue(sourceClass, SOURCE_CLASSES, 'feed source class');
  const preference = nullableDigest(preferenceDigest, 'feed preference digest');
  const lens = nullableDigest(curationLensDigest, 'feed curation lens digest');
  if (PERSONALIZED_REASONS.has(reason) && preference === null) {
    throw new Error('personalized feed selection requires a preference digest');
  }
  if (reason === 'circle-curated' && lens === null) {
    throw new Error('circle-curated feed selection requires a curation lens digest');
  }
  if (reason !== 'circle-curated' && lens !== null) {
    throw new Error('curation lens digest is allowed only for circle-curated selection');
  }
  return Object.freeze({
    schema: policy.receipt.schema,
    owner: identifier(owner, 'feed selection owner'),
    content_digest: digest(contentDigest, 'feed content digest'),
    selection_reason: reason,
    source_class: source,
    selected_at: canonicalTimestamp(selectedAt, 'feed selected_at'),
    preference_digest: preference,
    curation_lens_digest: lens,
    endorsement_claimed: false,
    truth_judgment_claimed: false,
    authority_effect: 'none',
    network_effect: 'none'
  });
}

export function validateFeedSelectionReceiptPolicy(policy) {
  exactObject(policy, 'feed selection receipt policy', [
    'schema',
    'version',
    'status',
    'runtime_activation',
    'authority_effect',
    'network_effect',
    'receipt',
    'selection_reasons',
    'source_classes',
    'diversity_evidence',
    'explainability',
    'privacy'
  ]);
  if (
    policy.schema !== 'axiom-social-feed-selection-receipt-policy.v0'
    || policy.version !== 0
    || policy.status !== 'inert-selection-evidence-contract'
    || policy.runtime_activation !== false
    || policy.authority_effect !== 'none'
    || policy.network_effect !== 'none'
  ) throw new Error('feed selection receipt activation boundary is invalid');
  validateReceiptPolicy(policy.receipt);
  exactSet(policy.selection_reasons, REASONS, 'feed selection reasons');
  exactSet(policy.source_classes, SOURCE_CLASSES, 'feed source classes');
  validateDiversityEvidence(policy.diversity_evidence);
  validateExplainability(policy.explainability);
  validatePrivacy(policy.privacy);
  return true;
}

function validateReceiptPolicy(value) {
  exactObject(value, 'feed selection receipt shape policy', [
    'schema',
    'owner_scope',
    'content_digest_required',
    'selection_reason_required',
    'source_class_required',
    'selected_at_required',
    'preference_digest_required_for_personalized_reason',
    'curation_lens_digest_required_for_circle_curated_reason',
    'authority_effect',
    'network_effect'
  ]);
  if (
    value.schema !== 'axiom-social-feed-selection-receipt.v0'
    || value.owner_scope !== 'local'
    || value.content_digest_required !== true
    || value.selection_reason_required !== true
    || value.source_class_required !== true
    || value.selected_at_required !== true
    || value.preference_digest_required_for_personalized_reason !== true
    || value.curation_lens_digest_required_for_circle_curated_reason !== true
    || value.authority_effect !== 'none'
    || value.network_effect !== 'none'
  ) throw new Error('feed selection receipt shape policy is invalid');
}

function validateDiversityEvidence(value) {
  exactObject(value, 'feed diversity evidence policy', [
    'allowed_dimensions',
    'must_be_user_enabled',
    'must_bind_user_preference_digest',
    'may_use_hidden_political_label',
    'may_infer_religion',
    'may_infer_race_or_ethnicity',
    'may_infer_sexual_orientation',
    'may_infer_health_status',
    'may_infer_criminal_history',
    'opposing_view_is_truth_judgment',
    'underrepresented_source_is_quality_judgment',
    'diversity_insertion_is_endorsement'
  ]);
  if (
    value.must_be_user_enabled !== true
    || value.must_bind_user_preference_digest !== true
    || value.may_use_hidden_political_label !== false
    || value.may_infer_religion !== false
    || value.may_infer_race_or_ethnicity !== false
    || value.may_infer_sexual_orientation !== false
    || value.may_infer_health_status !== false
    || value.may_infer_criminal_history !== false
    || value.opposing_view_is_truth_judgment !== false
    || value.underrepresented_source_is_quality_judgment !== false
    || value.diversity_insertion_is_endorsement !== false
  ) throw new Error('feed diversity evidence policy exceeds the user-sovereign privacy boundary');
  if (!Array.isArray(value.allowed_dimensions) || value.allowed_dimensions.length !== 6) {
    throw new Error('feed diversity dimension inventory is invalid');
  }
}

function validateExplainability(value) {
  exactObject(value, 'feed explainability policy', [
    'human_reason_available',
    'raw_selection_receipt_available',
    'non_chronological_insertion_must_be_explainable',
    'opaque_score_alone_is_sufficient'
  ]);
  if (
    value.human_reason_available !== true
    || value.raw_selection_receipt_available !== true
    || value.non_chronological_insertion_must_be_explainable !== true
    || value.opaque_score_alone_is_sufficient !== false
  ) throw new Error('feed explainability policy is invalid');
}

function validatePrivacy(value) {
  exactObject(value, 'feed selection privacy policy', [
    'selection_receipt_is_owner_private_by_default',
    'may_publish_inferred_user_profile',
    'may_export_without_user_action'
  ]);
  if (
    value.selection_receipt_is_owner_private_by_default !== true
    || value.may_publish_inferred_user_profile !== false
    || value.may_export_without_user_action !== false
  ) throw new Error('feed selection privacy policy is invalid');
}

function enumValue(value, values, label) {
  if (typeof value !== 'string' || !values.has(value)) throw new Error(`${label} is invalid`);
  return value;
}

function identifier(value, label) {
  if (typeof value !== 'string' || !ID.test(value)) throw new Error(`${label} is invalid`);
  return value;
}

function digest(value, label) {
  if (typeof value !== 'string' || !DIGEST.test(value)) throw new Error(`${label} is invalid`);
  return value;
}

function nullableDigest(value, label) {
  return value === null ? null : digest(value, label);
}

function canonicalTimestamp(value, label) {
  if (typeof value !== 'string') throw new Error(`${label} is invalid`);
  const date = new Date(value);
  if (Number.isNaN(date.valueOf()) || date.toISOString() !== value) {
    throw new Error(`${label} must be canonical UTC`);
  }
  return value;
}

function exactSet(values, expected, label) {
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
