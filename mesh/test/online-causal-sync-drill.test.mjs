import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  runOnlineCausalSyncDrill,
  verifyOnlineCausalSyncDrillEvidence
} from '../src/online-causal-sync-drill.mjs';

test('online causal sync drill proves approved partition/rejoin convergence', async t => {
  const workspace = await mkdtemp(join(tmpdir(), 'axiom-online-sync-drill-'));
  t.after(() => rm(workspace, { recursive: true, force: true }));
  const evidence = await runOnlineCausalSyncDrill({
    workspaceDir: workspace,
    sourceRevision: 'a'.repeat(40)
  });
  assert.equal(evidence.status, 'passed');
  assert.equal(evidence.execution.production_service_processes, 8);
  assert.equal(evidence.observations.conflict_heads_per_grid, 2);
  assert.equal(evidence.observations.final_heads_per_grid, 1);
  assert.ok(evidence.observations.duplicate_receipts >= 4);
  assert.deepEqual(
    verifyOnlineCausalSyncDrillEvidence(evidence),
    {
      valid: true,
      schema: 'axiom-online-causal-sync-drill-evidence.v1',
      source_revision: 'a'.repeat(40),
      duplicate_receipts: evidence.observations.duplicate_receipts
    }
  );
});
