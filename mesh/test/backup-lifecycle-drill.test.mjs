import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  runBackupLifecycleDrill,
  verifyBackupLifecycleEvidence
} from '../src/backup-lifecycle-drill.mjs';

test('backup lifecycle drill emits signed, secret-free restore evidence', async t => {
  const root = await mkdtemp(join(tmpdir(), 'axiom-backup-lifecycle-drill-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const workspace = join(root, 'workspace');
  const evidence = await runBackupLifecycleDrill({
    workspaceDir: workspace,
    sourceRevision: 'a'.repeat(40),
    workflowEvent: 'schedule'
  });
  const verified = verifyBackupLifecycleEvidence(evidence);
  assert.equal(verified.valid, true);
  assert.equal(verified.source_revision, 'a'.repeat(40));
  assert.equal(evidence.source.workflow_event, 'schedule');
  assert.equal(evidence.lifecycle.source_backups, 4);
  assert.equal(evidence.lifecycle.retained_backups, 2);
  assert.equal(evidence.lifecycle.retired_backups, 2);
  assert.equal(evidence.checks.retained_backup_exact_digest_restored, true);
  assert.equal(evidence.checks.no_backup_deleted, true);
  const serialized = JSON.stringify(evidence);
  for (const forbidden of [
    'data-protection.key',
    'api-tokens.json',
    'operator.token',
    '"private_key"',
    '"ciphertext"',
    '"token"'
  ]) {
    assert.equal(serialized.includes(forbidden), false);
  }

  const tampered = structuredClone(evidence);
  tampered.lifecycle.retained_backups = 3;
  assert.throws(
    () => verifyBackupLifecycleEvidence(tampered),
    /metadata|attestation/
  );
});
