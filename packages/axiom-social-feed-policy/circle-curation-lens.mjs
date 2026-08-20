const ALLOWED_EFFECTS = new Set([
  'include',
  'exclude-from-this-lens',
  'annotate',
  'deprioritize-within-this-lens'
]);
const PROHIBITED_EFFECTS = new Set([
  'network-ban',
  'network-delete',
  'block-for-members',
  'disable-uncurated-view',
  'safety-legal-quarantine',
  'mutate-canonical-source'
]);
const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const DIGEST = /^[a-f0-9]{64}$/;

export function validateCircleCurationLensContract(contract) {
  exactObject(contract, 'Circle curation lens contract', [
    'schema',
    'version',
    'status',
    'runtime_activation',
    'authority_effect',
    'network_effect',
    'charter_binding',
    'lens_model',
    'allowed_rule_effects',
    'prohibited_rule_effects',
    'lens_record',
    'selection_record',
    'explainability'
  ]);
  if (
    contract.schema !== 'axiom-social-circle-curation-lens.v0'
    || contract.version !== 0
    || contract.status !== 'inert-curation-lens-contract'
    || contract.runtime_activation !== false
    || contract.authority_effect !== 'none'
    || contract.network_effect !== 'none'
  ) throw new Error('Circle curation lens activation boundary is invalid');

  validateCharterBinding(contract.charter_binding);
  validateLensModel(contract.lens_model);
  validateExactSet(contract.allowed_rule_effects, ALLOWED_EFFECTS, 'allowed curation effects');
  validateExactSet(contract.prohibited_rule_effects, PROHIBITED_EFFECTS, 'prohibited curation effects');
  validateLensRecordPolicy(contract.lens_record);
  validateSelectionPolicy(contract.selection_record);
  validateExplainability(contract.explainability);
  return true;
}

export function validateCircleCurationLensRecord(
  contract,
  record,
  { charterDigest, charterRoleIds } = {}
) {
  validateCircleCurationLensContract(contract);
  exactObject(record, 'Circle curation lens record', [
    'schema',
    'circle_id',
    'lens_id',
    'label',
    'charter_digest',
    'curator_role_ids',
    'rules_digest',
    'created_at',
    'status',
    'member_uncurated_access_preserved',
    'third_party_suppression',
    'network_effect',
    'authority_effect'
  ]);
  if (
    record.schema !== contract.lens_record.schema
    || !identifier(record.circle_id)
    || !identifier(record.lens_id)
    || typeof record.label !== 'string'
    || record.label.length < 1
    || record.label.length > 160
    || !DIGEST.test(record.charter_digest)
    || !identifierArray(record.curator_role_ids, 1, 32)
    || !DIGEST.test(record.rules_digest)
    || !validTimestamp(record.created_at)
    || !['active', 'retired'].includes(record.status)
    || record.member_uncurated_access_preserved !== true
    || record.third_party_suppression !== false
    || record.network_effect !== 'none'
    || record.authority_effect !== 'none'
  ) throw new Error('Circle curation lens record is invalid');

  if (typeof charterDigest !== 'string' || !DIGEST.test(charterDigest)) {
    throw new Error('Circle curation lens validation requires the exact charter digest');
  }
  if (record.charter_digest !== charterDigest) {
    throw new Error('Circle curation lens record is bound to a different charter digest');
  }
  if (!identifierArray(charterRoleIds, 1, 64)) {
    throw new Error('Circle curation lens validation requires the exact charter role inventory');
  }
  const charterRoles = new Set(charterRoleIds);
  if (record.curator_role_ids.some(roleId => !charterRoles.has(roleId))) {
    throw new Error('Circle curation lens curator role is not present in the bound charter');
  }
  return true;
}

export function validateCircleCurationSelection(contract, selection) {
  validateCircleCurationLensContract(contract);
  exactObject(selection, 'Circle curation selection', [
    'schema',
    'owner',
    'circle_id',
    'selected_view',
    'selected_lens_id',
    'selected_at',
    'scope',
    'network_effect',
    'authority_effect'
  ]);
  const uncurated = selection.selected_view === 'uncurated';
  const curated = selection.selected_view === 'curated';
  if (
    selection.schema !== contract.selection_record.schema
    || !identifier(selection.owner)
    || !identifier(selection.circle_id)
    || (!uncurated && !curated)
    || (uncurated && selection.selected_lens_id !== null)
    || (curated && !identifier(selection.selected_lens_id))
    || !validTimestamp(selection.selected_at)
    || selection.scope !== 'owner-local-preference'
    || selection.network_effect !== 'none'
    || selection.authority_effect !== 'none'
  ) throw new Error('Circle curation selection is invalid');
  return true;
}

export function validateCurationRuleEffect(contract, effect) {
  validateCircleCurationLensContract(contract);
  if (PROHIBITED_EFFECTS.has(effect)) {
    throw new Error(`Curation effect ${effect} is prohibited`);
  }
  if (!ALLOWED_EFFECTS.has(effect)) {
    throw new Error(`Curation effect ${effect} is unsupported`);
  }
  return effect;
}

function validateCharterBinding(value) {
  exactObject(value, 'Circle curation charter binding', [
    'charter_digest_required',
    'curator_role_binding_required',
    'founder_has_implicit_curation_authority',
    'role_label_alone_grants_authority'
  ]);
  if (
    value.charter_digest_required !== true
    || value.curator_role_binding_required !== true
    || value.founder_has_implicit_curation_authority !== false
    || value.role_label_alone_grants_authority !== false
  ) throw new Error('Circle curation charter binding grants implicit authority');
}

function validateLensModel(value) {
  exactObject(value, 'Circle curation lens model', [
    'multiple_lenses_allowed',
    'member_selects_lens_locally',
    'uncurated_view_remains_available',
    'lens_may_define_default_presentation',
    'lens_may_control_network_visibility',
    'lens_may_control_personal_interaction_boundaries',
    'lens_may_invoke_safety_legal_quarantine'
  ]);
  if (
    value.multiple_lenses_allowed !== true
    || value.member_selects_lens_locally !== true
    || value.uncurated_view_remains_available !== true
    || value.lens_may_define_default_presentation !== true
    || value.lens_may_control_network_visibility !== false
    || value.lens_may_control_personal_interaction_boundaries !== false
    || value.lens_may_invoke_safety_legal_quarantine !== false
  ) throw new Error('Circle curation lens model grants excessive authority');
}

function validateLensRecordPolicy(value) {
  exactObject(value, 'Circle curation lens record policy', [
    'schema',
    'requires_circle_id',
    'requires_lens_id',
    'requires_charter_digest',
    'requires_curator_role_ids',
    'requires_rules_digest',
    'requires_explanation_policy',
    'member_uncurated_access_preserved',
    'third_party_suppression',
    'network_effect',
    'authority_effect'
  ]);
  if (
    value.schema !== 'axiom-circle-curation-lens-record.v0'
    || value.requires_circle_id !== true
    || value.requires_lens_id !== true
    || value.requires_charter_digest !== true
    || value.requires_curator_role_ids !== true
    || value.requires_rules_digest !== true
    || value.requires_explanation_policy !== true
    || value.member_uncurated_access_preserved !== true
    || value.third_party_suppression !== false
    || value.network_effect !== 'none'
    || value.authority_effect !== 'none'
  ) throw new Error('Circle curation lens record policy is invalid');
}

function validateSelectionPolicy(value) {
  exactObject(value, 'Circle curation selection policy', [
    'schema',
    'scope',
    'user_may_change_lens',
    'user_may_select_uncurated',
    'curator_may_override_user_selection',
    'network_effect',
    'authority_effect'
  ]);
  if (
    value.schema !== 'axiom-circle-curation-selection.v0'
    || value.scope !== 'owner-local-preference'
    || value.user_may_change_lens !== true
    || value.user_may_select_uncurated !== true
    || value.curator_may_override_user_selection !== false
    || value.network_effect !== 'none'
    || value.authority_effect !== 'none'
  ) throw new Error('Circle curation selection policy is invalid');
}

function validateExplainability(value) {
  exactObject(value, 'Circle curation explainability', [
    'lens_identity_visible',
    'curator_role_visible',
    'rule_reason_required',
    'exclusion_reason_available',
    'why_am_i_seeing_this_supported'
  ]);
  if (Object.values(value).some(item => item !== true)) {
    throw new Error('Circle curation explainability is incomplete');
  }
}

function validateExactSet(values, expected, label) {
  if (!Array.isArray(values)) throw new Error(`${label} must be an array`);
  const actual = new Set(values);
  if (actual.size !== expected.size || [...expected].some(value => !actual.has(value))) {
    throw new Error(`${label} inventory drifted`);
  }
}

function identifier(value) {
  return typeof value === 'string' && ID.test(value);
}

function identifierArray(value, minimum, maximum) {
  return Array.isArray(value)
    && value.length >= minimum
    && value.length <= maximum
    && new Set(value).size === value.length
    && value.every(identifier);
}

function validTimestamp(value) {
  if (typeof value !== 'string') return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
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
