import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { verifyAgentLinuxIsolationWorkflow } from '../src/lib/agent-linux-isolation-workflow.mjs';

const ROOT = new URL('../../', import.meta.url);
const WORKFLOW = new URL('.github/workflows/agent-linux-isolation.yml', ROOT);

async function workflowText() {
  return readFile(WORKFLOW, 'utf8');
}

test('release governance accepts only the bounded Linux isolation workflow', async () => {
  const result = verifyAgentLinuxIsolationWorkflow(await workflowText());
  assert.equal(result.runner, 'ubuntu-24.04');
  assert.equal(result.node_version, '24.18.0');
  assert.equal(result.permissions, 'contents-read');
  assert.equal(result.persisted_checkout_credentials, false);
  assert.equal(result.github_secrets_referenced, false);
  assert.equal(result.fixed_probe_only, true);
  assert.equal(result.production_provisioning_reachable, false);
  assert.equal(result.receipt_reverification_required, true);
  assert.deepEqual(result.action_references, [
    'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1',
    'actions/setup-node@820762786026740c76f36085b0efc47a31fe5020',
    'actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a'
  ]);
  assert.match(result.workflow_sha256, /^[a-f0-9]{64}$/);
});

test('release governance rejects privilege, secret and remote-trigger widening', async () => {
  const workflow = await workflowText();
  for (const injected of [
    '\n    permissions: write-all\n',
    '\n        env:\n          TOKEN: ${{ secrets.AXIOM_TEST_SECRET }}\n',
    '\n      - run: node src/provision-production.mjs\n',
    '\n      - run: docker run --privileged alpine true\n',
    '\npull_request_target:\n',
    '\nrepository_dispatch:\n'
  ]) {
    assert.throws(
      () => verifyAgentLinuxIsolationWorkflow(`${workflow}${injected}`),
      /forbidden surface|expose only the conformance job/i
    );
  }
});

test('release governance rejects mutable action and runner references', async () => {
  const workflow = await workflowText();
  const mutableAction = workflow.replace(
    'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1',
    'actions/checkout@v7'
  );
  assert.throws(
    () => verifyAgentLinuxIsolationWorkflow(mutableAction),
    /immutable action references/i
  );

  const mutableRunner = workflow.replace('runs-on: ubuntu-24.04', 'runs-on: self-hosted');
  assert.throws(
    () => verifyAgentLinuxIsolationWorkflow(mutableRunner),
    /missing governed boundary|forbidden surface/i
  );
});

test('release governance rejects removal of the exact receipt re-verification call', async () => {
  const workflow = await workflowText();
  const weakened = workflow.replace(
    'verifyAgentLinuxIsolationConformanceReceipt(receipt);',
    'acceptReceiptWithoutVerification(receipt);'
  );
  assert.throws(
    () => verifyAgentLinuxIsolationWorkflow(weakened),
    /missing governed boundary/i
  );
});

test('release governance rejects any extra action or second job', async () => {
  const workflow = await workflowText();
  const extraAction = workflow.replace(
    '      - name: Upload Linux isolation conformance evidence',
    '      - uses: actions/cache@0057852bfaa89a56745cba8c7296529d2fc39830\n      - name: Upload Linux isolation conformance evidence'
  );
  assert.throws(
    () => verifyAgentLinuxIsolationWorkflow(extraAction),
    /immutable action references/i
  );

  const secondJob = `${workflow}\n  production:\n    runs-on: ubuntu-24.04\n    steps: []\n`;
  assert.throws(
    () => verifyAgentLinuxIsolationWorkflow(secondJob),
    /expose only the conformance job/i
  );
});
