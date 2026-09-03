import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../../', import.meta.url);

async function text(path) {
  return readFile(new URL(path, root), 'utf8');
}

async function json(path) {
  return JSON.parse(await text(path));
}

test('current Health foundation preserves the authority and sovereignty boundaries', async () => {
  const [foundation, threatModel, roadmap, todo] = await Promise.all([
    text('docs/architecture/HEALTH-MESH-FOUNDATION.md'),
    text('docs/security/HEALTH-MESH-THREAT-MODEL.md'),
    text('docs/ROADMAP-EXTENSION-HEALTH-MESH.md'),
    text('docs/MASTER-TODO-HEALTH-MESH.md')
  ]);

  assert.match(foundation, /Gateway -> Hypervisor -> Sandbox -> Grid/);
  assert.match(foundation, /\bH0\b/);
  assert.match(foundation, /\bH5\b/);
  assert.match(foundation, /Sovereign Vault/i);
  assert.match(foundation, /Context Capsule/i);
  assert.match(foundation, /evidence.*not authority|evidence.*distinguishable from.*claims/i);
  assert.match(foundation, /model inference.*not.*clinical authority|model.*not.*clinical authority/i);

  assert.match(threatModel, /epistemic laundering/i);
  assert.match(threatModel, /cross-patient/i);
  assert.match(threatModel, /neural/i);
  assert.match(threatModel, /regulatory laundering/i);

  assert.match(roadmap, /adapter_required/);
  assert.match(roadmap, /Health Evidence Graph/i);
  assert.match(todo, /Health Evidence Graph/i);
  assert.match(todo, /Clinical Inference Receipt/i);
});

test('forward-ported Health planning schemas preserve non-authority semantics', async () => {
  const [clinical, workflow, regulatory, endpoint] = await Promise.all([
    json('docs/architecture/contracts/health-mesh-clinical-envelope.v0.1.schema.json'),
    json('mesh/config/health-mesh-workflow.v0.1.schema.json'),
    json('mesh/config/health-mesh-regulatory-eligibility.v0.1.schema.json'),
    json('mesh/config/health-mesh-endpoint-profile.v0.1.schema.json')
  ]);

  assert.deepEqual(clinical.properties.autonomy_level.enum, ['H0', 'H1', 'H2', 'H3', 'H4', 'H5']);
  assert.deepEqual(workflow.properties.maximum_autonomy_level.enum, ['H0', 'H1', 'H2', 'H3', 'H4', 'H5']);
  assert.equal(workflow.properties.runtime_authority_granted.const, false);
  assert.equal(workflow.properties.clinical_authorization_claimed.const, false);
  assert.equal(workflow.properties.escalation_policy.properties.supervision_loss_cannot_raise_autonomy.const, true);
  assert.equal(workflow.properties.escalation_policy.properties.emergency_authority_is_separate.const, true);
  assert.equal(workflow.properties.escalation_policy.properties.uncertain_physical_effects_are_not_retried.const, true);

  assert.equal(regulatory.properties.absence_behavior.const, 'DENY_CONSEQUENTIAL');
  assert.equal(regulatory.properties.axiom_may_expand_scope.const, false);
  assert.equal(regulatory.properties.runtime_authority_granted.const, false);
  assert.equal(regulatory.properties.regulatory_truth_claimed_by_axiom.const, false);

  assert.equal(endpoint.properties.registration_grants_authority.const, false);
  assert.equal(endpoint.properties.runtime_authority_granted.const, false);
  assert.equal(endpoint.properties.clinical_authorization_claimed.const, false);
  assert.equal(endpoint.properties.local_safety.properties.model_independent_stop.const, true);
  assert.equal(endpoint.properties.local_safety.properties.physical_fail_safe.const, true);
  assert.equal(endpoint.properties.emergency_interface.properties.may_directly_dispatch_resources.const, false);
});
