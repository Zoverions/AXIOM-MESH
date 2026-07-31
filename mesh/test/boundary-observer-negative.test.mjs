import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  KINDS,
  boundaryEvidenceContext,
  issueRunnerPublicControlAttestation,
  verifyBoundaryObserverAttestation
} from '../src/boundary-observer-attestation.mjs';
import { ensureMeshIdentity } from '../src/lib/identity.mjs';
import { runDenyEgressDrill } from '../src/network-boundary.mjs';

const REVISION = 'a'.repeat(40);
const PACKAGE_ID = 'b'.repeat(64);
const HOST_SOCKET = '/runner/_temp/axiom-ingress/gateway.sock';
const RUN = { id: '30560757058', attempt: 1, job: 'container' };

test('boundary observer verification rejects forged signatures and missing attestations', async t => {
  const root = await mkdtemp(join(tmpdir(), 'axiom-boundary-negative-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const runnerIdentity = await ensureMeshIdentity(
    join(root, 'runner'),
    'boundary-runner-observer',
    { create: true }
  );
  const context = {
    ...boundaryEvidenceContext({
      sourceRevision: REVISION,
      evidenceContext: PACKAGE_ID,
      run: RUN,
      hostSocketPath: HOST_SOCKET,
      runnerHost: '1.1.1.1',
      runnerPort: 443
    }),
    host_socket_path: HOST_SOCKET
  };
  const runnerAttestation = issueRunnerPublicControlAttestation({
    identity: runnerIdentity,
    context,
    observedAt: '2026-07-30T16:20:00.000Z',
    host: '1.1.1.1',
    port: 443,
    timeoutMs: 5_000,
    connected: true,
    outcome: 'connected'
  });

  const forged = structuredClone(runnerAttestation);
  const replacement = forged.attestation.signature[0] === 'A' ? 'B' : 'A';
  forged.attestation.signature = `${replacement}${forged.attestation.signature.slice(1)}`;
  assert.throws(
    () => verifyBoundaryObserverAttestation(forged, {
      kind: KINDS.runner,
      context,
      finalGeneratedAt: '2026-07-30T16:20:05.000Z'
    }),
    /signature is invalid/
  );

  await assert.rejects(
    () => runDenyEgressDrill({
      config: {
        environment: 'production',
        requireDenyEgress: true,
        dataDir: join(root, 'grid'),
        gatewaySocket: '/run/axiom-mesh/gateway.sock',
        ports: { gateway: 8080 }
      },
      sourceRevision: REVISION,
      generatedAt: '2026-07-30T16:20:05.000Z',
      evidenceContext: PACKAGE_ID,
      runId: RUN.id,
      runAttempt: RUN.attempt,
      runJob: RUN.job,
      hostSocketPath: HOST_SOCKET,
      runnerPublicControlAttestation: runnerAttestation
    }),
    /host ingress attestation file is required/
  );
});

test('kernel workflow executes signed observers and never executes retired booleans', async () => {
  const workflow = await readFile(
    new URL('../../.github/workflows/kernel.yml', import.meta.url),
    'utf8'
  );
  const executable = workflow
    .split(/\r?\n/)
    .filter(line => !line.trimStart().startsWith('#'))
    .join('\n');

  for (const retired of [
    'AXIOM_HOST_INGRESS_VERIFIED="$AXIOM_HOST_INGRESS_VERIFIED"',
    'AXIOM_RUNNER_PUBLIC_CONTROL_VERIFIED="$AXIOM_RUNNER_PUBLIC_CONTROL_VERIFIED"'
  ]) {
    assert.equal(executable.includes(retired), false);
    assert.equal(workflow.includes(retired), true);
  }
  for (const required of [
    'Run container readiness and sign host ingress observation',
    'Sign runner public-control observation',
    'src/boundary-observer-attestation.mjs host-ingress',
    'src/boundary-observer-attestation.mjs runner-public-control',
    'AXIOM_BOUNDARY_EVIDENCE_CONTEXT',
    'AXIOM_HOST_INGRESS_ATTESTATION_FILE',
    'AXIOM_RUNNER_PUBLIC_CONTROL_ATTESTATION_FILE'
  ]) {
    assert.equal(executable.includes(required), true);
  }
});
