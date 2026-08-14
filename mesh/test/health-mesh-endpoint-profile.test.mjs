import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(TEST_DIR, '../..');

async function json(path) {
  return JSON.parse(await readFile(resolve(ROOT, path), 'utf8'));
}

test('endpoint profile contract separates identity from authority', async () => {
  const schema = await json('mesh/contracts/health-mesh-endpoint-profile.v0.1.schema.json');
  const p = schema.properties;

  assert.equal(schema.additionalProperties, false);
  assert.equal(p.registration_grants_authority.const, false);
  assert.equal(p.runtime_authority_granted.const, false);
  assert.equal(p.clinical_authorization_claimed.const, false);
  assert.equal(p.secret_material_included.const, false);
  assert.equal(p.data_governance.properties.raw_media_export_default.const, 'DENY');
  assert.equal(p.local_safety.properties.model_independent_stop.const, true);
  assert.equal(p.emergency_interface.properties.may_directly_dispatch_resources.const, false);
});

test('planning health booth binds module hardware/software/data classes without runnable effects', async () => {
  const endpoint = await json('mesh/test/fixtures/health-mesh/planning-health-booth-endpoint.json');

  assert.equal(endpoint.endpoint_class, 'HEALTH_BOOTH');
  assert.equal(endpoint.registration_grants_authority, false);
  assert.equal(endpoint.runtime_authority_granted, false);
  assert.equal(endpoint.clinical_authorization_claimed, false);
  assert.equal(endpoint.secret_material_included, false);
  assert.equal(endpoint.data_governance.minimum_necessary, true);
  assert.equal(endpoint.data_governance.raw_media_export_default, 'DENY');
  assert.equal(endpoint.local_safety.model_independent_stop, true);
  assert.equal(endpoint.local_safety.physical_fail_safe, true);
  assert.equal(endpoint.emergency_interface.may_directly_dispatch_resources, false);

  for (const module of endpoint.modules) {
    assert.equal(module.runnable_clinical_action_granted, false, module.module_id);
    assert.match(module.software_identity.digest, /^[a-f0-9]{64}$/);
    assert.ok(module.data_classes.length > 0);
  }
});

test('venipuncture module remains bound to external eligibility research and absent from production registry', async () => {
  const endpoint = await json('mesh/test/fixtures/health-mesh/planning-health-booth-endpoint.json');
  const registry = await json('mesh/config/capabilities.json');
  const serialized = JSON.stringify(registry);
  const venipuncture = endpoint.modules.find(module => module.module_class === 'VENIPUNCTURE_ROBOT');

  assert.deepEqual(
    venipuncture.regulatory_eligibility_refs,
    ['health-reg:ontario.supervised-robotic-venipuncture.research.v0.1']
  );
  assert.equal(venipuncture.planning_autonomy_ceiling, 'H3');
  assert.ok(venipuncture.planned_action_identifiers.includes('health.specimen.venipuncture.supervised'));
  assert.equal(serialized.includes('health.specimen.venipuncture.supervised'), false);
});

test('sensitive safety video defaults to local ephemeral processing', async () => {
  const endpoint = await json('mesh/test/fixtures/health-mesh/planning-health-booth-endpoint.json');
  const safety = endpoint.modules.find(module => module.module_class === 'SAFETY_MONITOR');

  assert.ok(safety.data_classes.includes('TRANSIENT_SENSITIVE_VIDEO'));
  assert.equal(endpoint.data_governance.transient_media_default, 'LOCAL_EPHEMERAL');
  assert.equal(endpoint.data_governance.raw_media_export_default, 'DENY');
});
