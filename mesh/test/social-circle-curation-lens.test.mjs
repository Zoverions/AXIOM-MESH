import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  validateCircleCurationLensContract,
  validateCircleCurationLensRecord,
  validateCircleCurationSelection,
  validateCurationRuleEffect
} from '../../packages/axiom-social-feed-policy/circle-curation-lens.mjs';

const contractUrl = new URL('../config/social-circle-curation-lens.v0.json', import.meta.url);

async function loadContract() {
  return JSON.parse(await readFile(contractUrl, 'utf8'));
}

function lensFixture() {
  return {
    schema: 'axiom-circle-curation-lens-record.v0',
    circle_id: 'circle.example',
    lens_id: 'lens.evidence-first',
    label: 'Evidence First',
    charter_digest: 'a'.repeat(64),
    curator_role_ids: ['role.curator'],
    rules_digest: 'b'.repeat(64),
    created_at: '2026-08-20T16:00:00.000Z',
    status: 'active',
    member_uncurated_access_preserved: true,
    third_party_suppression: false,
    network_effect: 'none',
    authority_effect: 'none'
  };
}

test('Circle curation contract is inert and grants no implicit founder authority', async () => {
  const contract = await loadContract();
  assert.equal(validateCircleCurationLensContract(contract), true);
  assert.equal(contract.runtime_activation, false);
  assert.equal(contract.network_effect, 'none');
  assert.equal(contract.authority_effect, 'none');
  assert.equal(contract.charter_binding.charter_digest_required, true);
  assert.equal(contract.charter_binding.curator_role_binding_required, true);
  assert.equal(contract.charter_binding.founder_has_implicit_curation_authority, false);
  assert.equal(contract.charter_binding.role_label_alone_grants_authority, false);
});

test('multiple curation lenses are compatible with local member choice and an always-available uncurated view', async () => {
  const contract = await loadContract();
  validateCircleCurationLensContract(contract);
  assert.equal(contract.lens_model.multiple_lenses_allowed, true);
  assert.equal(contract.lens_model.member_selects_lens_locally, true);
  assert.equal(contract.lens_model.uncurated_view_remains_available, true);
  assert.equal(contract.lens_model.lens_may_define_default_presentation, true);
  assert.equal(contract.lens_model.lens_may_control_network_visibility, false);
  assert.equal(contract.lens_model.lens_may_control_personal_interaction_boundaries, false);
  assert.equal(contract.lens_model.lens_may_invoke_safety_legal_quarantine, false);
});

test('a Circle curation lens record is charter and role bound but non-authorizing', async () => {
  const contract = await loadContract();
  const lens = lensFixture();
  assert.equal(validateCircleCurationLensRecord(contract, lens), true);

  const weakened = structuredClone(lens);
  weakened.third_party_suppression = true;
  assert.throws(
    () => validateCircleCurationLensRecord(contract, weakened),
    /record is invalid/
  );
});

test('curation rule effects can alter one lens but cannot become network bans, blocks, deletion or quarantine', async () => {
  const contract = await loadContract();
  for (const effect of [
    'include',
    'exclude-from-this-lens',
    'annotate',
    'deprioritize-within-this-lens'
  ]) {
    assert.equal(validateCurationRuleEffect(contract, effect), effect);
  }
  for (const effect of [
    'network-ban',
    'network-delete',
    'block-for-members',
    'disable-uncurated-view',
    'safety-legal-quarantine',
    'mutate-canonical-source'
  ]) {
    assert.throws(
      () => validateCurationRuleEffect(contract, effect),
      /is prohibited/
    );
  }
});

test('member curation selection is owner-local and curator cannot override uncurated choice', async () => {
  const contract = await loadContract();
  const curated = {
    schema: 'axiom-circle-curation-selection.v0',
    owner: 'human.owner',
    circle_id: 'circle.example',
    selected_view: 'curated',
    selected_lens_id: 'lens.evidence-first',
    selected_at: '2026-08-20T16:10:00.000Z',
    scope: 'owner-local-preference',
    network_effect: 'none',
    authority_effect: 'none'
  };
  assert.equal(validateCircleCurationSelection(contract, curated), true);

  const uncurated = {
    ...curated,
    selected_view: 'uncurated',
    selected_lens_id: null
  };
  assert.equal(validateCircleCurationSelection(contract, uncurated), true);
  assert.equal(contract.selection_record.user_may_select_uncurated, true);
  assert.equal(contract.selection_record.curator_may_override_user_selection, false);
});

test('Circle curation remains explainable', async () => {
  const contract = await loadContract();
  validateCircleCurationLensContract(contract);
  assert.deepEqual(contract.explainability, {
    lens_identity_visible: true,
    curator_role_visible: true,
    rule_reason_required: true,
    exclusion_reason_available: true,
    why_am_i_seeing_this_supported: true
  });
});
