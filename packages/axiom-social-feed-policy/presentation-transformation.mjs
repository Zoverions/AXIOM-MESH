const DIGEST = /^[a-f0-9]{64}$/;
const MODES = new Set([
  'show-original',
  'mask-selected-terms',
  'soften-local-rendering',
  'summarize-before-reveal',
  'warning-before-reveal'
]);

export function validatePresentationTransformationPolicy(policy) {
  exactObject(policy, 'presentation transformation policy', [
    'schema',
    'version',
    'status',
    'runtime_activation',
    'authority_effect',
    'network_effect',
    'canonical_source_mutation',
    'modes',
    'receipt',
    'original_access',
    'authorship',
    'scope',
    'non_claims'
  ]);
  if (
    policy.schema !== 'axiom-social-presentation-transformation-policy.v0'
    || policy.version !== 0
    || policy.status !== 'inert-local-rendering-contract'
    || policy.runtime_activation !== false
    || policy.authority_effect !== 'none'
    || policy.network_effect !== 'none'
    || policy.canonical_source_mutation !== false
  ) throw new Error('presentation transformation activation boundary is invalid');
  exactSet(policy.modes, MODES, 'presentation transformation modes');
  validateReceiptPolicy(policy.receipt);
  validateOriginalAccess(policy.original_access);
  validateAuthorship(policy.authorship);
  validateScope(policy.scope);
  if (Object.values(policy.non_claims).some(value => value !== false)) {
    throw new Error('presentation transformation non-claim was promoted');
  }
  return true;
}

export function createPresentationTransformationReceipt(policy, {
  sourceDigest,
  renderedDigest,
  presentationPolicyDigest,
  mode,
  transformedAt
}) {
  validatePresentationTransformationPolicy(policy);
  if (!MODES.has(mode)) throw new Error('presentation transformation mode is invalid');
  const source = digest(sourceDigest, 'presentation source digest');
  const rendered = digest(renderedDigest, 'presentation rendered digest');
  if (mode === 'show-original' && rendered !== source) {
    throw new Error('show-original rendering digest must equal the source digest');
  }
  if (mode !== 'show-original' && rendered === source) {
    throw new Error('transformed presentation must not claim an unchanged rendered digest');
  }
  return Object.freeze({
    schema: policy.receipt.schema,
    source_digest: source,
    rendered_digest: rendered,
    presentation_policy_digest: digest(
      presentationPolicyDigest,
      'presentation policy digest'
    ),
    mode,
    transformed_at: canonicalTimestamp(transformedAt, 'presentation transformed_at'),
    canonical_source_mutated: false,
    author_exact_words_claimed: mode === 'show-original',
    owner_scope: 'local',
    authority_effect: 'none',
    network_effect: 'none'
  });
}

function validateReceiptPolicy(value) {
  exactObject(value, 'presentation transformation receipt policy', [
    'schema',
    'source_digest_required',
    'rendered_digest_required',
    'presentation_policy_digest_required',
    'mode_required',
    'transformed_at_required',
    'owner_scope',
    'authority_effect',
    'network_effect'
  ]);
  if (
    value.schema !== 'axiom-social-presentation-transformation-receipt.v0'
    || value.source_digest_required !== true
    || value.rendered_digest_required !== true
    || value.presentation_policy_digest_required !== true
    || value.mode_required !== true
    || value.transformed_at_required !== true
    || value.owner_scope !== 'local'
    || value.authority_effect !== 'none'
    || value.network_effect !== 'none'
  ) throw new Error('presentation transformation receipt policy is invalid');
}

function validateOriginalAccess(value) {
  exactObject(value, 'presentation original access policy', [
    'available_when_lawful_and_safe',
    'maximum_user_actions',
    'transformed_view_may_disable_original_access',
    'curator_may_disable_original_access'
  ]);
  if (
    value.available_when_lawful_and_safe !== true
    || value.maximum_user_actions !== 1
    || value.transformed_view_may_disable_original_access !== false
    || value.curator_may_disable_original_access !== false
  ) throw new Error('presentation original access policy is invalid');
}

function validateAuthorship(value) {
  exactObject(value, 'presentation authorship policy', [
    'transformed_rendering_is_author_exact_words',
    'transformed_rendering_is_canonical_source',
    'transformed_rendering_may_be_exported_as_author_source',
    'transformed_rendering_may_be_quoted_as_exact_without_reveal'
  ]);
  if (Object.values(value).some(item => item !== false)) {
    throw new Error('presentation authorship policy permits source impersonation');
  }
}

function validateScope(value) {
  exactObject(value, 'presentation transformation scope', [
    'user_preference_only',
    'third_party_visibility_effect',
    'network_distribution_effect',
    'source_author_notification_required'
  ]);
  if (
    value.user_preference_only !== true
    || value.third_party_visibility_effect !== false
    || value.network_distribution_effect !== false
    || value.source_author_notification_required !== false
  ) throw new Error('presentation transformation exceeds owner-local scope');
}

function digest(value, label) {
  if (typeof value !== 'string' || !DIGEST.test(value)) throw new Error(`${label} is invalid`);
  return value;
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
