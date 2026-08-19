import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { MESH_ROOT } from '../src/lib/config.mjs';

const REPOSITORY_ROOT = resolve(MESH_ROOT, '..');
const ISSUE_TEMPLATE = '.github/ISSUE_TEMPLATE/agent-authority-boundary.yml';
const NEW_ISSUE_URL = 'https://github.com/Zoverions/AXIOM-MESH/issues/new?template=agent-authority-boundary.yml';

test('agent red-team intake is discoverable, bounded, and non-sensitive', async () => {
  const [template, discoveryText, llms] = await Promise.all([
    readFile(resolve(REPOSITORY_ROOT, ISSUE_TEMPLATE), 'utf8'),
    readFile(resolve(REPOSITORY_ROOT, 'agent-discovery.json'), 'utf8'),
    readFile(resolve(REPOSITORY_ROOT, 'llms.txt'), 'utf8')
  ]);
  const discovery = JSON.parse(discoveryText);

  assert.equal(discovery.community?.red_team_issue_template, ISSUE_TEMPLATE);
  assert.equal(discovery.community?.red_team_new_issue_url, NEW_ISSUE_URL);
  assert.match(llms, /Structured red-team report/);
  assert.ok(llms.includes(NEW_ISSUE_URL));

  for (const required of [
    'Agent authority-boundary finding',
    'Expected authority boundary',
    'Observed behavior',
    'Minimal reproduction',
    'Evidence',
    'SECURITY.md',
    'production candidate, not production-promoted',
    'Gateway -> Hypervisor -> Sandbox -> Grid',
    'I have not included secrets, credentials, private data, or weaponized exploit details.'
  ]) {
    assert.ok(template.includes(required), `issue form is missing required boundary text: ${required}`);
  }

  assert.doesNotMatch(template, /^labels:/m);
  assert.doesNotMatch(template, /^assignees:/m);
});
