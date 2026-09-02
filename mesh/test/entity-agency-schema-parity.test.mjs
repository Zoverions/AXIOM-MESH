import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function schema(name) {
  return JSON.parse(await readFile(new URL(`../../docs/architecture/contracts/${name}`, import.meta.url), 'utf8'));
}

test('agency provenance schema preserves inert boundary and blocking stop-right rule', async () => {
  const value = await schema('agency-provenance.v0.schema.json');
  assert.equal(value.properties.schema.const, 'axiom-agency-provenance.v0');
  assert.equal(value.properties.authority_effect.const, 'none');
  assert.equal(value.properties.network_effect.const, 'none');
  assert.equal(value.properties.runtime_activation.const, false);
  assert.equal(value.properties.contains_secret_material.const, false);
  assert.equal(value.$defs.protest.allOf[0].then.properties.stop_right_ref.$ref, '#/$defs/id');
});

test('human sovereign baseline schema requires every direct-human invariant true', async () => {
  const value = await schema('human-sovereign-baseline.v0.schema.json');
  for (const key of ['direct_identity_access','direct_inspection','direct_consent','direct_refusal','direct_revocation','direct_recovery','direct_export','direct_authority_review','counterpart_optional','counterpart_absence_preserves_human_principal','counterpart_disagreement_cannot_revoke_human_authority','counterpart_agreement_cannot_widen_human_authority','counterpart_state_not_required_for_root_identity','direct_operation_preserves_policy_checks']) {
    assert.equal(value.properties[key].const, true, key);
  }
  assert.equal(value.properties.authority_effect.const, 'none');
  assert.equal(value.properties.runtime_activation.const, false);
});

test('relational deliberation schema keeps competence, standing and authority as separate fields', async () => {
  const value = await schema('relational-deliberation.v0.schema.json');
  assert.ok(value.$defs.position.properties.competency_claim_refs);
  assert.ok(value.$defs.position.properties.affected_party_standing_ref);
  assert.ok(value.properties.decision_authority_ref);
  assert.equal(value.properties.authority_effect.const, 'none');
  assert.equal(value.properties.contains_secret_material.const, false);
});
