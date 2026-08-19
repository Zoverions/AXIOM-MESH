import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflowPath = new URL('../../.github/workflows/security-cell-scout.yml', import.meta.url);

async function workflowText() {
  return readFile(workflowPath, 'utf8');
}

test('Security Cell Scout is read-only evidence automation', async () => {
  const source = await workflowText();

  assert.match(source, /permissions:\s*\n\s+contents:\s+read\b/);
  assert.doesNotMatch(source, /pull_request_target\s*:/);
  assert.doesNotMatch(source, /\bissues:\s*write\b/);
  assert.doesNotMatch(source, /\bpull-requests:\s*write\b/);
  assert.doesNotMatch(source, /\bcontents:\s*write\b/);
  assert.doesNotMatch(source, /secrets\./);
  assert.match(source, /persist-credentials:\s*false/);

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

  assert.match(source, /if:\s*always\(\)/);
  assert.match(source, /actions\/upload-artifact@[a-f0-9]{40}/);
  assert.match(source, /retention-days:\s*30/);
});
