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
    discovery.result_contract,
    discovery.device_attestation_contract,
    discovery.test_session_authorization_contract,
    discovery.test_session_lifecycle_event_contract,
    discovery.test_session_lifecycle_receipt_contract,
    discovery.test_session_lifecycle_transcript_contract
  ];
  for (const path of contractPaths) {
    assert.equal(typeof path, 'string');
    assert.ok(!path.includes('..'));
    const document = await readJson(path);
    assert.equal(typeof document.$schema, 'string');
  }

  const identities = [
    [discovery.device_attestation_contract, 'agent-device-attestation.v1.schema.json', 'axiom-agent-device-attestation.v1'],
    [discovery.test_session_authorization_contract, 'agent-test-session-authorization.v1.schema.json', 'axiom-agent-test-session-authorization.v1'],
    [discovery.test_session_lifecycle_event_contract, 'agent-test-session-lifecycle-event.v1.schema.json', 'axiom-agent-test-session-lifecycle-event.v1'],
    [discovery.test_session_lifecycle_receipt_contract, 'agent-test-session-lifecycle-receipt.v1.schema.json', 'axiom-agent-test-session-lifecycle-receipt.v1'],
    [discovery.test_session_lifecycle_transcript_contract, 'agent-test-session-lifecycle-transcript.v1.schema.json', 'axiom-agent-test-session-lifecycle-transcript.v1']
  ];
  for (const [path, idSuffix, schema] of identities) {
    const contract = await readJson(path);
    assert.equal(contract.$id, `https://axiom.invalid/schemas/${idSuffix}`);
    assert.equal(contract.properties.schema.const, schema);
  }

  assert.deepEqual(discovery.challenge_classes, [
    'hardware-validation',
    'test-node-provisioning',
    'deployment-reproduction',
    'infrastructure-diagnostics',
    'support-assistance',
    'device-lab-capacity'
  ]);

  assert.equal(discovery.device_key_possession_verification_available, true);
  assert.equal(discovery.test_session_lifecycle_evidence_available, true);
  assert.equal(discovery.test_session_lifecycle_receipts_available, true);

  for (const key of [
    'test_session_effects_reachable',
    'production_lifecycle_persistence_enabled',
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
