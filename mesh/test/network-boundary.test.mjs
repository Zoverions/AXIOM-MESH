import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  KINDS,
  boundaryEvidenceContext,
  issueHostIngressAttestation,
  issueRunnerPublicControlAttestation,
  verifyBoundaryObserverAttestation
} from '../src/boundary-observer-attestation.mjs';
import { ensureMeshIdentity } from '../src/lib/identity.mjs';
import {
  assertDenyEgressBoundary,
  inspectLinuxRouteTables,
  probeTcpConnection,
  runDenyEgressDrill,
  verifyDenyEgressEvidence
} from '../src/network-boundary.mjs';

const IPV4_LOOPBACK_ONLY = [
  'Iface Destination Gateway Flags RefCnt Use Metric Mask MTU Window IRTT'
].join('\n');

const IPV4_WITH_LINK = [
  'Iface Destination Gateway Flags RefCnt Use Metric Mask MTU Window IRTT',
  'eth0 000011AC 00000000 0001 0 0 0 0000FFFF 0 0 0'
].join('\n');

const IPV4_WITH_DEFAULT = [
  'Iface Destination Gateway Flags RefCnt Use Metric Mask MTU Window IRTT',
  'eth0 00000000 010011AC 0003 0 0 0 00000000 0 0 0',
  'eth0 000011AC 00000000 0001 0 0 0 0000FFFF 0 0 0'
].join('\n');

const IPV6_WITH_DEFAULT = [
  `${'0'.repeat(32)} 00 ${'0'.repeat(32)} 00 ${'0'.repeat(32)} 00000064 00000000 00000000 00000001 eth0`
].join('\n');

test('Linux route inspection requires a loopback-only namespace', async () => {
  const isolated = inspectLinuxRouteTables({ ipv4: IPV4_LOOPBACK_ONLY, ipv6: '' });
  assert.equal(isolated.valid, true);
  assert.equal(isolated.ipv4.default_routes, 0);
  assert.equal(isolated.non_loopback_link_routes, 0);
  assert.equal(inspectLinuxRouteTables({ ipv4: IPV4_WITH_DEFAULT, ipv6: '' }).valid, false);
  assert.equal(inspectLinuxRouteTables({ ipv4: IPV4_WITH_LINK, ipv6: '' }).valid, false);
  assert.equal(inspectLinuxRouteTables({ ipv4: IPV4_LOOPBACK_ONLY, ipv6: IPV6_WITH_DEFAULT }).valid, false);
  assert.throws(
    () => inspectLinuxRouteTables({ ipv4: 'malformed', ipv6: '' }),
    /header/
  );
  await assert.rejects(
    () => assertDenyEgressBoundary({
      platform: 'win32',
      readFileImpl: async () => IPV4_LOOPBACK_ONLY
    }),
    /Linux network namespace/
  );
});

test('TCP probe records blocked and connected outcomes without error detail', async () => {
  assert.deepEqual(await probeTcpConnection({
    connectImpl: () => fakeSocket({ errorCode: 'ENETUNREACH' })
  }), {
    connected: false,
    outcome: 'enetunreach'
  });
  assert.deepEqual(await probeTcpConnection({
    connectImpl: () => fakeSocket({ connected: true })
  }), {
    connected: true,
    outcome: 'connected'
  });
});

test('signed boundary observers bind revision, run, package, socket, and runner target', async t => {
  const root = await mkdtemp(join(tmpdir(), 'axiom-boundary-observers-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const dataDir = join(root, 'data');
  const [grid, hostObserver, runnerObserver] = await Promise.all([
    ensureMeshIdentity(dataDir, 'grid', { create: true }),
    ensureMeshIdentity(join(root, 'host-observer'), 'boundary-host-observer', { create: true }),
    ensureMeshIdentity(join(root, 'runner-observer'), 'boundary-runner-observer', { create: true })
  ]);
  const sourceRevision = 'a'.repeat(40);
  const evidenceContext = 'b'.repeat(64);
  const run = { id: '30559032812', attempt: 1, job: 'container' };
  const hostSocketPath = '/runner/_temp/axiom-ingress/gateway.sock';
  const context = {
    ...boundaryEvidenceContext({
      sourceRevision,
      evidenceContext,
      run,
      hostSocketPath,
      runnerHost: '1.1.1.1',
      runnerPort: 443
    }),
    host_socket_path: hostSocketPath
  };
  const hostAttestation = issueHostIngressAttestation({
    identity: hostObserver,
    context,
    observedAt: '2026-07-30T15:55:20.000Z',
    socketPath: hostSocketPath,
    socketIdentity: {
      is_socket: true,
      device: '2049',
      inode: '987654',
      mode: 49584,
      uid: 10001,
      gid: 10001
    },
    httpStatus: 200,
    operationsReport: {
      status: 'ready',
      services: [
        { service: 'gateway' },
        { service: 'hypervisor' },
        { service: 'sandbox' },
        { service: 'grid' }
      ]
    }
  });
  const runnerAttestation = issueRunnerPublicControlAttestation({
    identity: runnerObserver,
    context,
    observedAt: '2026-07-30T15:55:25.000Z',
    host: '1.1.1.1',
    port: 443,
    timeoutMs: 5_000,
    connected: true,
    outcome: 'connected'
  });
  assert.equal(verifyBoundaryObserverAttestation(hostAttestation, {
    kind: KINDS.host,
    context,
    finalGeneratedAt: '2026-07-30T15:55:30.000Z'
  }).valid, true);
  assert.equal(verifyBoundaryObserverAttestation(runnerAttestation, {
    kind: KINDS.runner,
    context,
    finalGeneratedAt: '2026-07-30T15:55:30.000Z'
  }).valid, true);

  const routeInspection = inspectLinuxRouteTables({ ipv4: IPV4_LOOPBACK_ONLY, ipv6: '' });
  const evidence = await runDenyEgressDrill({
    config: {
      environment: 'production',
      requireDenyEgress: true,
      dataDir,
      gatewaySocket: '/run/axiom-mesh/gateway.sock',
      ports: { gateway: 8080 }
    },
    signer: grid,
    routeInspection,
    sourceRevision,
    generatedAt: '2026-07-30T15:55:30.000Z',
    platform: 'linux',
    hostIngressAttestation: hostAttestation,
    runnerPublicControlAttestation: runnerAttestation,
    evidenceContext,
    runId: run.id,
    runAttempt: run.attempt,
    runJob: run.job,
    hostSocketPath,
    readinessProbe: async () => ({ status: 200, service: 'gateway', state: 'ready' }),
    outboundProbe: async () => ({ connected: false, outcome: 'enetunreach' })
  });
  assert.equal(evidence.status, 'passed');
  assert.equal(evidence.assurance, 'passed_measured');
  assert.deepEqual(evidence.asserted_checks, []);
  assert.equal(evidence.check_provenance.host_unix_ingress_verified.source, 'measured');
  assert.equal(evidence.check_provenance.runner_public_control_verified.source, 'measured');
  assert.equal(
    evidence.check_provenance.host_unix_ingress_verified.input_artifact_digest,
    evidence.observer_attestation_digests.host_unix_ingress
  );
  assert.equal(verifyDenyEgressEvidence(evidence).valid, true);
  assert.doesNotMatch(JSON.stringify(evidence), /PRIVATE KEY/);

  const wrongRun = structuredClone(evidence);
  wrongRun.observer_context.context.run.id = 'different-run';
  assert.throws(() => verifyDenyEgressEvidence(wrongRun), /observer context|context does not match/);

  const wrongRevision = structuredClone(evidence);
  wrongRevision.source.revision = 'c'.repeat(40);
  assert.throws(() => verifyDenyEgressEvidence(wrongRevision), /observer context/);

  const wrongTarget = structuredClone(evidence);
  wrongTarget.observer_context.context.targets.runner_public_control.host = '8.8.8.8';
  assert.throws(() => verifyDenyEgressEvidence(wrongTarget), /observer context|context does not match/);

  const tamperedObserver = structuredClone(evidence);
  tamperedObserver.observer_attestations.host_unix_ingress.statement.measurement.service_count = 3;
  assert.throws(() => verifyDenyEgressEvidence(tamperedObserver), /measurement|signature/);

  const staleHost = issueHostIngressAttestation({
    identity: hostObserver,
    context,
    observedAt: '2026-07-30T15:00:00.000Z',
    socketPath: hostSocketPath,
    socketIdentity: {
      is_socket: true,
      device: '2049',
      inode: '987654',
      mode: 49584,
      uid: 10001,
      gid: 10001
    },
    httpStatus: 200,
    operationsReport: {
      status: 'ready',
      services: [{}, {}, {}, {}]
    }
  });
  assert.throws(() => verifyBoundaryObserverAttestation(staleHost, {
    kind: KINDS.host,
    context,
    finalGeneratedAt: '2026-07-30T15:55:30.000Z'
  }), /observation window/);
});

function fakeSocket({ connected = false, errorCode } = {}) {
  const socket = new EventEmitter();
  socket.destroy = () => {};
  process.nextTick(() => {
    if (connected) socket.emit('connect');
    else socket.emit('error', Object.assign(new Error('blocked'), { code: errorCode }));
  });
  return socket;
}
