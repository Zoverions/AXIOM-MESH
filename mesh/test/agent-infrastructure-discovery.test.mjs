import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const ROOT = new URL('../../', import.meta.url);

async function readJson(relative) {
  return JSON.parse(await readFile(new URL(relative, ROOT), 'utf8'));
}

test('infrastructure discovery points only to existing bounded contracts', async () => {
  const discovery = await readJson('agent-commons/infrastructure-lab.json');
  assert.equal(discovery.schema, 'axiom-agent-infrastructure-lab-discovery.v1');
  assert.equal(discovery.repository, 'Zoverions/AXIOM-MESH');
  assert.equal(discovery.architecture, 'docs/architecture/AGENT-COMMONS.md');

  const contractPaths = [
    discovery.compute_node_profile_contract,
    discovery.offer_contract,
    discovery.challenge_contract,
    discovery.result_contract
  ];
  for (const path of contractPaths) {
    assert.equal(typeof path, 'string');
    assert.ok(!path.includes('..'));
    const document = await readJson(path);
    assert.equal(typeof document.$schema, 'string');
  }

  assert.deepEqual(discovery.challenge_classes, [
    'hardware-validation',
    'test-node-provisioning',
    'deployment-reproduction',
    'infrastructure-diagnostics',
    'support-assistance',
    'device-lab-capacity'
  ]);

  for (const key of [
    'remote_execution_enabled',
    'production_node_enrollment_enabled',
    'credential_issuance_enabled',
    'secret_access_enabled',
    'firmware_changes_enabled',
    'purchases_enabled',
    'authority_granted',
    'payment_promised'
  ]) {
    assert.equal(discovery[key], false, `${key} must remain false`);
  }
});
