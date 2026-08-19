import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

const repositoryRoot = resolve(import.meta.dirname, '../..');

async function text(path) {
  return readFile(resolve(repositoryRoot, path), 'utf8');
}

test('repository discovery exposes the public red-team triage policy without expanding authority', async () => {
  const [triage, discoveryRaw, llms, issueForm] = await Promise.all([
    text('RED-TEAM-TRIAGE.txt'),
    text('agent-discovery.json'),
    text('llms.txt'),
    text('.github/ISSUE_TEMPLATE/agent-authority-boundary.yml')
  ]);
  const discovery = JSON.parse(discoveryRaw);

  assert.equal(discovery.community.red_team_triage, 'RED-TEAM-TRIAGE.txt');
  assert.match(llms, /RED-TEAM-TRIAGE\.txt/);
  assert.match(issueForm, /RED-TEAM-TRIAGE\.txt/);

  for (const required of [
    'RECEIVED',
    'NEEDS_REPRODUCTION',
    'REPRODUCED_BOUNDARY_FAILURE',
    'REPRODUCED_CLAIM_DRIFT',
    'PRIVATE_SECURITY_ROUTE',
    'FIX_VERIFIED',
    'production candidate, not production-promoted',
    'do not themselves grant AXIOM-MESH runtime authority, merge authority, deployment authority, protocol activation, or production promotion'
  ]) {
    assert.match(triage, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }

  assert.doesNotMatch(triage, /production-promoted build/i);
  assert.doesNotMatch(triage, /grants? (?:runtime|merge|deployment) authority/i);
});
