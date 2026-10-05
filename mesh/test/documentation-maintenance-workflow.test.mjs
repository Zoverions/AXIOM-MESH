import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

function documentationMaintenanceJob(workflow) {
  const start = workflow.indexOf('\n  documentation-maintenance:\n');
  assert.notEqual(start, -1, 'Clean Kernel is missing documentation-maintenance job');
  const bodyStart = start + 1;
  const nextJob = workflow.indexOf('\n  compatibility-node-22:\n', bodyStart);
  assert.notEqual(nextJob, -1, 'documentation-maintenance job has no bounded end marker');
  return workflow.slice(bodyStart, nextJob);
}

test('documentation-maintenance job owns the rebuild-clean documentation invariant', async () => {
  const workflow = await readFile(
    new URL('../../.github/workflows/kernel.yml', import.meta.url),
    'utf8'
  );
  const job = documentationMaintenanceJob(workflow);

  for (const required of [
    'documentation-maintenance:',
    'runs-on: ubuntu-24.04',
    'persist-credentials: false',
    'node-version: "24.18.0"',
    'npm ci --ignore-scripts',
    'npm --prefix mesh ci --ignore-scripts',
    'npm --prefix mesh run status:check',
    'npm --prefix mesh run docs:check',
    'npm --prefix mesh run status:generate',
    'git diff --exit-code'
  ]) {
    assert.ok(job.includes(required), `documentation-maintenance job is missing: ${required}`);
  }

  assert.ok(
    workflow.includes('permissions:\n  contents: read'),
    'Clean Kernel must remain read-only at workflow scope'
  );
});
