import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflowPath = new URL('../../.github/workflows/chain-verification-benchmark.yml', import.meta.url);

async function workflowText() {
  return readFile(workflowPath, 'utf8');
}

test('Security Cell Scout is read-only evidence automation', async () => {
  const source = await workflowText();

  const permissionBlocks = [...source.matchAll(/^permissions:\s*\n((?:^[ \t]+[^\n]*\n?)*)/gm)];
  assert.equal(permissionBlocks.length, 1);
  assert.equal(permissionBlocks[0][1].trim(), 'contents: read');
  assert.doesNotMatch(source, /pull_request_target\s*:/);
  assert.doesNotMatch(source, /\bissues:\s*write\b/);
  assert.doesNotMatch(source, /\bpull-requests:\s*write\b/);
  assert.doesNotMatch(source, /\bcontents:\s*write\b/);
  assert.doesNotMatch(source, /\bid-token:\s*write\b/);
  assert.doesNotMatch(source, /secrets\./);
  assert.match(source, /persist-credentials:\s*false/);
  assert.match(source, /security-cell-scout:\s*\n\s+if:\s+github\.event_name == 'schedule' \|\| github\.event_name == 'workflow_dispatch'/);

  assert.match(source, /Initialize scout evidence before setup/);
  assert.match(source, /result\": \"setup_not_completed\"/);
  assert.match(source, /placeholder exists so setup failures still preserve an evidence artifact/);
  assert.match(source, /target_id:\s*'RT-AUTH-001'/);
  assert.match(source, /finding_disposition:\s*'not_assigned_by_workflow'/);
  assert.match(source, /authority_effect:\s*'none'/);
  assert.match(source, /security_certification_claimed:\s*false/);
  assert.match(source, /A passing run is not a NOT_REPRODUCED disposition/);
  assert.match(source, /A failing run requires human or agent reproduction and triage/);

  for (const path of [
    'test/machine-principal.test.mjs',
    'test/principal-registry.test.mjs',
    'test/machine-principal-e2e.test.mjs',
    'test/machine-discovery.test.mjs',
    'test/machine-discovery-e2e.test.mjs',
    'test/machine-ingress.test.mjs',
    'test/machine-receipt-e2e.test.mjs'
  ]) {
    assert.match(source, new RegExp(path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }

  const alwaysSteps = source.match(/if:\s*always\(\)/g) ?? [];
  assert.ok(alwaysSteps.length >= 2);
  assert.match(source, /actions\/upload-artifact@[a-f0-9]{40}/);
  assert.match(source, /retention-days:\s*30/);
});
