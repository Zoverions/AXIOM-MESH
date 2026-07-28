import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
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
  const isolated = inspectLinuxRouteTables({
    ipv4: IPV4_LOOPBACK_ONLY,
    ipv6: ''
  });
  assert.equal(isolated.valid, true);
  assert.equal(isolated.ipv4.default_routes, 0);
  assert.equal(isolated.non_loopback_link_routes, 0);

  assert.equal(inspectLinuxRouteTables({
    ipv4: IPV4_WITH_DEFAULT,
    ipv6: ''
  }).valid, false);
  assert.equal(inspectLinuxRouteTables({
    ipv4: IPV4_WITH_LINK,
    ipv6: ''
  }).valid, false);
  assert.equal(inspectLinuxRouteTables({
    ipv4: IPV4_LOOPBACK_ONLY,
    ipv6: IPV6_WITH_DEFAULT
  }).valid, false);
  assert.throws(
    () => inspectLinuxRouteTables({
      ipv4: 'malformed',
      ipv6: ''
    }),
    /header/
  );

  await assert.rejects(
    () => assertDenyEgressBoundary({
      platform: 'win32',
      readFileImpl: async () => IPV4_LOOPBACK_ONLY
    }),
    /Linux network namespace/
  );
  await assert.rejects(
    () => assertDenyEgressBoundary({
      platform: 'linux',
      readFileImpl: async path => (
        path.endsWith('ipv6_route') ? '' : IPV4_WITH_DEFAULT
      )
    }),
    /loopback-only namespace/
  );
});

test('TCP probe records blocked and connected outcomes without error detail', async () => {
  const blocked = await probeTcpConnection({
    connectImpl: () => fakeSocket({ errorCode: 'ENETUNREACH' })
  });
  assert.deepEqual(blocked, {
    connected: false,
    outcome: 'enetunreach'
  });

  const connected = await probeTcpConnection({
    connectImpl: () => fakeSocket({ connected: true })
  });
  assert.deepEqual(connected, {
    connected: true,
    outcome: 'connected'
  });
});

test('deny-egress drill emits tamper-evident secret-free evidence', async t => {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-deny-egress-'));
  t.after(() => rm(dataDir, { recursive: true, force: true }));
  const signer = await ensureMeshIdentity(dataDir, 'grid', { create: true });
  const routeInspection = inspectLinuxRouteTables({
    ipv4: IPV4_LOOPBACK_ONLY,
    ipv6: ''
  });
  const config = {
    environment: 'production',
    requireDenyEgress: true,
    dataDir,
    gatewaySocket: '/run/axiom-mesh/gateway.sock',
    ports: { gateway: 8080 }
  };
  const evidence = await runDenyEgressDrill({
    config,
    signer,
    routeInspection,
    sourceRevision: 'a'.repeat(40),
    generatedAt: '2026-07-28T20:00:00.000Z',
    platform: 'linux',
    hostIngressVerified: true,
    runnerPublicControlVerified: true,
    readinessProbe: async () => ({
      status: 200,
      service: 'gateway',
      state: 'ready'
    }),
    outboundProbe: async () => ({
      connected: false,
      outcome: 'enetunreach'
    })
  });
  assert.equal(evidence.status, 'passed');
  assert.ok(Object.values(evidence.checks).every(Boolean));
  assert.equal(evidence.boundary.ipv4_default_routes, 0);
  assert.equal(evidence.boundary.ipv6_default_routes, 0);
  assert.equal(evidence.boundary.non_loopback_link_routes, 0);
  assert.equal(
    evidence.boundary.local_ingress_transport,
    'unix-domain-socket'
  );
  assert.equal(evidence.probes.public_tcp_connected, false);
  assert.equal(verifyDenyEgressEvidence(evidence).valid, true);
  assert.doesNotMatch(JSON.stringify(evidence), /PRIVATE KEY/);

  const tampered = structuredClone(evidence);
  tampered.probes.public_tcp_connected = true;
  assert.throws(
    () => verifyDenyEgressEvidence(tampered),
    /boundary check/
  );

  await assert.rejects(
    () => runDenyEgressDrill({
      config,
      signer,
      routeInspection,
      readinessProbe: async () => ({
        status: 200,
        service: 'gateway',
        state: 'ready'
      }),
      outboundProbe: async () => ({
        connected: false,
        outcome: 'enetunreach'
      })
    }),
    /host_unix_ingress_verified, runner_public_control_verified/
  );

  await assert.rejects(
    () => runDenyEgressDrill({
      config,
      signer,
      routeInspection,
      hostIngressVerified: true,
      runnerPublicControlVerified: true,
      readinessProbe: async () => ({
        status: 200,
        service: 'gateway',
        state: 'ready'
      }),
      outboundProbe: async () => ({
        connected: true,
        outcome: 'connected'
      })
    }),
    /public_tcp_egress_blocked/
  );
});

function fakeSocket({ connected = false, errorCode } = {}) {
  const socket = new EventEmitter();
  socket.destroy = () => {};
  process.nextTick(() => {
    if (connected) socket.emit('connect');
    else socket.emit('error', Object.assign(new Error('blocked'), {
      code: errorCode
    }));
  });
  return socket;
}
