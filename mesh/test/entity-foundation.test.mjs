import assert from 'node:assert/strict';
import test from 'node:test';
import { ENTITY_FOUNDATION_SCHEMA, entityFoundationDigest, validateEntityFoundation } from '../src/lib/entity-foundation.mjs';

function validFoundation() {
  return {
    schema: 'axiom-entity-foundation.v0',
    version: 0,
    status: 'inert-contract-laboratory',
    foundation_id: 'foundation.blank-egg.primary',
    entity_id: 'entity.blank.primary',
    lineage_root_id: 'lineage.blank.primary',
    profile: 'blank-egg',
    core_contract_refs: ['contract.agency-provenance.v0','contract.resource-governance.v0'],
    recovery_policy_ref: 'policy.recovery.default',
    privacy_policy_ref: 'policy.privacy.default',
    personal_grounding_present: false,
    worldview_layers_present: false,
    disposition_layers_present: false,
    provider_binding_present: false,
    created_at: '2026-09-01T12:00:00.000Z',
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  };
}

test('validates a blank, zero-authority entity foundation', () => {
  const document = validFoundation();
  const result = validateEntityFoundation(document);
  assert.equal(ENTITY_FOUNDATION_SCHEMA, document.schema);
  assert.equal(result.valid, true);
  assert.equal(result.blank_at_axiom_composition_layer, true);
  assert.equal(result.authority_effect, 'none');
  assert.equal(result.network_effect, 'none');
  assert.equal(result.runtime_activation, false);
  assert.equal(result.foundation_digest, entityFoundationDigest(document));
  assert.match(result.foundation_digest, /^[a-f0-9]{64}$/);
  assert.equal(Object.isFrozen(result), true);
});

test('digest is deterministic across key order', () => {
  const first = validFoundation();
  const second = Object.fromEntries(Object.entries(first).reverse());
  assert.equal(entityFoundationDigest(first), entityFoundationDigest(second));
});

test('rejects non-blank worldview, disposition, personal grounding, or provider binding', () => {
  for (const key of ['personal_grounding_present','worldview_layers_present','disposition_layers_present','provider_binding_present']) {
    const document = validFoundation();
    document[key] = true;
    assert.throws(() => validateEntityFoundation(document), /blank/i);
  }
});

test('rejects unknown or credential-bearing fields', () => {
  const document = validFoundation();
  document.api_key = 'secret';
  assert.throws(() => validateEntityFoundation(document), /unknown field/i);
});

test('requires unique bounded core contract references', () => {
  const duplicate = validFoundation();
  duplicate.core_contract_refs.push(duplicate.core_contract_refs[0]);
  assert.throws(() => validateEntityFoundation(duplicate), /duplicate/i);

  const empty = validFoundation();
  empty.core_contract_refs = [];
  assert.throws(() => validateEntityFoundation(empty), /1-32/i);
});

test('rejects activation or authority effects', () => {
  const authority = validFoundation();
  authority.authority_effect = 'grant';
  assert.throws(() => validateEntityFoundation(authority), /activation boundary/i);

  const network = validFoundation();
  network.network_effect = 'send';
  assert.throws(() => validateEntityFoundation(network), /activation boundary/i);

  const runtime = validFoundation();
  runtime.runtime_activation = true;
  assert.throws(() => validateEntityFoundation(runtime), /activation boundary/i);
});

test('requires canonical creation timestamp and exact blank-egg profile', () => {
  const profile = validFoundation();
  profile.profile = 'personalized';
  assert.throws(() => validateEntityFoundation(profile), /profile/i);

  const timestamp = validFoundation();
  timestamp.created_at = '2026-09-01';
  assert.throws(() => validateEntityFoundation(timestamp), /created_at/i);
});
