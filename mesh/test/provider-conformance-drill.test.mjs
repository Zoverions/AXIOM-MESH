import assert from 'node:assert/strict';
import {
  mkdtemp,
  readFile,
  rm
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  runProviderConformanceDrill,
  verifyProviderConformanceEvidence
} from '../src/provider-conformance-drill.mjs';

test('provider conformance drill proves signed startup, rotation, and fail-closed cleanup', async t => {
  const workspace = await mkdtemp(join(tmpdir(), 'axiom-provider-drill-'));
  await rm(workspace, { recursive: true, force: true });
  t.after(() => rm(workspace, { recursive: true, force: true }));
  const evidence = await runProviderConformanceDrill({
    workspaceDir: workspace,
    sourceRevision: 'a'.repeat(40),
    generatedAt: '2026-07-29T00:00:00.000Z'
  });
  const verification = verifyProviderConformanceEvidence(evidence);
  assert.equal(verification.valid, true);
  assert.equal(verification.resources_per_start, 16);
  assert.equal(verification.provider_responses_per_start, 2);
  assert.equal(Object.values(evidence.checks).every(Boolean), true);
  const serialized = JSON.stringify(evidence);
  assert.equal(serialized.includes('PRIVATE KEY'), false);
  assert.equal(
    serialized.includes(
      (await readFile(
        join(workspace, 'custody', 'secret', 'operator.token'),
        'utf8'
      )).trim()
    ),
    false
  );
  const tampered = structuredClone(evidence);
  tampered.cycles[0].resources[0].bytes += 1;
  assert.throws(
    () => verifyProviderConformanceEvidence(tampered),
    /attestation is invalid/
  );
});
