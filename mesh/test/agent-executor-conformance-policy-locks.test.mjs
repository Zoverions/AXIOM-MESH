import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const SOURCE_URL = new URL('../src/lib/agent-executor-conformance-sandbox.mjs', import.meta.url);
const THREAT_URL = new URL('../../agent-commons/executor-conformance-threat-model.json', import.meta.url);

test('executor conformance source retains replay, origin, redirect and DNS-rebinding fail-closed controls', async () => {
  const source = await readFile(SOURCE_URL, 'utf8');
  for (const marker of [
    "throw new SandboxPolicyError('request-replay')",
    "throw new SandboxPolicyError('step-order-violation')",
    "throw new SandboxPolicyError('network-origin-substitution')",
    "throw new SandboxPolicyError('network-method-denied')",
    "throw new SandboxPolicyError('network-redirect-denied')",
    "throw new SandboxPolicyError('dns-rebinding-detected')",
    "throw new SandboxPolicyError('environment-or-path-poisoning')",
    "throw new SandboxPolicyError('symlink-escape')"
  ]) {
    assert.equal(source.includes(marker), true, `missing conformance enforcement marker: ${marker}`);
  }
});

test('executor conformance threat model requires the matching hostile classes and no-effect blockers', async () => {
  const threat = JSON.parse(await readFile(THREAT_URL, 'utf8'));
  const ids = new Set(threat.attack_classes.map(item => item.id));
  for (const id of [
    'request-replay-or-step-reordering',
    'ssrf-origin-substitution-or-redirect',
    'dns-rebinding',
    'arbitrary-executable-or-path-poisoning',
    'argv-or-shell-injection',
    'workspace-traversal-or-normalization-escape',
    'symlink-escape',
    'resource-exhaustion',
    'lifecycle-replay-stale-prefix-or-double-consume',
    'receipt-tampering-or-signer-substitution',
    'effect-success-or-authority-claim-elevation'
  ]) {
    assert.equal(ids.has(id), true, `missing hostile class: ${id}`);
  }

  for (const boundary of [
    'host_process_execution',
    'host_filesystem_mutation',
    'live_dns_lookup',
    'live_network_io',
    'credential_or_secret_lookup',
    'service_control',
    'remote_shell_or_tunnel',
    'real_package_installation',
    'os_sandbox_claimed',
    'real_hardware_effects',
    'task_success_claimed',
    'production_node_enrollment',
    'deployment_authority',
    'capability_promotion'
  ]) {
    assert.equal(threat.boundaries[boundary], false, `${boundary} must remain false`);
  }
});
