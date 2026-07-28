import { createPublicKey } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import net from 'node:net';
import { pathToFileURL } from 'node:url';
import { ValidationError } from './lib/canonical.mjs';
import {
  ensureMeshIdentity,
  verifyObjectSignature
} from './lib/identity.mjs';
import { meshConfig } from './lib/config.mjs';

const EVIDENCE_SCHEMA = 'axiom-deny-egress-evidence.v1';
const REVISION = /^[a-f0-9]{40}$/;
const OUTBOUND_PROBE = Object.freeze({
  host: '1.1.1.1',
  port: 443,
  timeout_ms: 2_000
});

export function inspectLinuxRouteTables({ ipv4, ipv6 = '' }) {
  if (typeof ipv4 !== 'string' || typeof ipv6 !== 'string') {
    throw new ValidationError('Linux route tables must be strings');
  }
  const ipv4Routes = parseIpv4Routes(ipv4);
  const ipv6Routes = parseIpv6Routes(ipv6);
  const ipv4Default = ipv4Routes.filter(route => route.up && route.default);
  const ipv6Default = ipv6Routes.filter(route => route.up && route.default);
  const nonLoopbackLinkRoutes = [...ipv4Routes, ...ipv6Routes].filter(route => (
    route.up && route.interface !== 'lo'
  ));
  return {
    valid: (
      ipv4Default.length === 0
      && ipv6Default.length === 0
      && nonLoopbackLinkRoutes.length === 0
    ),
    ipv4: {
      routes: ipv4Routes.length,
      default_routes: ipv4Default.length
    },
    ipv6: {
      routes: ipv6Routes.length,
      default_routes: ipv6Default.length
    },
    non_loopback_link_routes: nonLoopbackLinkRoutes.length
  };
}

export async function assertDenyEgressBoundary({
  platform = process.platform,
  readFileImpl = readFile
} = {}) {
  if (platform !== 'linux') {
    throw new ValidationError(
      'Enforced deny-egress requires a Linux network namespace'
    );
  }
  const ipv4 = await readRouteFile(
    '/proc/net/route',
    readFileImpl,
    { required: true }
  );
  const ipv6 = await readRouteFile(
    '/proc/net/ipv6_route',
    readFileImpl,
    { required: false }
  );
  const inspection = inspectLinuxRouteTables({ ipv4, ipv6 });
  if (!inspection.valid) {
    throw new ValidationError(
      'Production deny-egress boundary requires a loopback-only namespace with no IPv4 or IPv6 default route'
    );
  }
  return inspection;
}

export async function probeTcpConnection({
  host = OUTBOUND_PROBE.host,
  port = OUTBOUND_PROBE.port,
  timeoutMs = OUTBOUND_PROBE.timeout_ms,
  connectImpl = options => net.createConnection(options)
} = {}) {
  if (
    typeof host !== 'string'
    || !Number.isSafeInteger(port)
    || port < 1
    || port > 65_535
    || !Number.isSafeInteger(timeoutMs)
    || timeoutMs < 100
    || timeoutMs > 10_000
  ) throw new ValidationError('Outbound probe configuration is invalid');
  return new Promise(resolve => {
    let settled = false;
    let socket;
    const finish = result => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket?.destroy();
      resolve(result);
    };
    const timer = setTimeout(
      () => finish({ connected: false, outcome: 'timeout' }),
      timeoutMs
    );
    timer.unref?.();
    try {
      socket = connectImpl({ host, port });
      socket.once('connect', () => finish({
        connected: true,
        outcome: 'connected'
      }));
      socket.once('error', error => finish({
        connected: false,
        outcome: boundedErrorCode(error?.code)
      }));
    } catch (error) {
      finish({
        connected: false,
        outcome: boundedErrorCode(error?.code)
      });
    }
  });
}

export async function runDenyEgressDrill({
  config = meshConfig(),
  sourceRevision = process.env.GITHUB_SHA || null,
  generatedAt = new Date().toISOString(),
  platform = process.platform,
  routeInspection,
  hostIngressVerified = process.env.AXIOM_HOST_INGRESS_VERIFIED === 'true',
  runnerPublicControlVerified = (
    process.env.AXIOM_RUNNER_PUBLIC_CONTROL_VERIFIED === 'true'
  ),
  readinessProbe = probeReadiness,
  outboundProbe = probeTcpConnection,
  signer
} = {}) {
  if (config.environment !== 'production' || config.requireDenyEgress !== true) {
    throw new ValidationError(
      'Deny-egress drill requires production mode with enforcement enabled'
    );
  }
  const routes = routeInspection ?? await assertDenyEgressBoundary();
  if (routes?.valid !== true) {
    throw new ValidationError('Deny-egress route inspection did not pass');
  }
  const readiness = await readinessProbe({
    url: `http://127.0.0.1:${config.ports.gateway}/ready`
  });
  const outbound = await outboundProbe({
    host: OUTBOUND_PROBE.host,
    port: OUTBOUND_PROBE.port,
    timeoutMs: OUTBOUND_PROBE.timeout_ms
  });
  const checks = {
    ipv4_default_route_absent: routes.ipv4?.default_routes === 0,
    ipv6_default_route_absent: routes.ipv6?.default_routes === 0,
    non_loopback_routes_absent: routes.non_loopback_link_routes === 0,
    loopback_gateway_ready: (
      readiness?.status === 200
      && readiness?.service === 'gateway'
      && readiness?.state === 'ready'
    ),
    public_tcp_egress_blocked: outbound?.connected === false,
    host_unix_ingress_verified: hostIngressVerified === true,
    runner_public_control_verified: runnerPublicControlVerified === true,
    secret_values_omitted: true
  };
  const failed = Object.entries(checks)
    .filter(([, value]) => value !== true)
    .map(([name]) => name);
  if (failed.length) {
    throw new ValidationError(
      `Deny-egress drill checks failed: ${failed.join(', ')}`
    );
  }
  const identity = signer ?? await ensureMeshIdentity(
    config.dataDir,
    'grid',
    { create: false }
  );
  const packageJson = JSON.parse(
    await readFile(new URL('../package.json', import.meta.url), 'utf8')
  );
  const publicKeyPem = String(identity.publicKey.export({
    type: 'spki',
    format: 'pem'
  }));
  const unsigned = {
    schema: EVIDENCE_SCHEMA,
    status: 'passed',
    generated_at: normalizeTimestamp(generatedAt),
    source: {
      kernel_version: packageJson.version,
      revision: normalizeRevision(sourceRevision)
    },
    execution: {
      platform,
      architecture: process.arch,
      network_namespace: true
    },
    signer: {
      key_id: identity.keyId,
      public_key_pem: publicKeyPem
    },
    boundary: {
      compose_network_mode_none_required: true,
      local_ingress_transport: config.gatewaySocket
        ? 'unix-domain-socket'
        : 'loopback-tcp',
      loopback_gateway_port: config.ports.gateway,
      ipv4_routes_observed: routes.ipv4.routes,
      ipv6_routes_observed: routes.ipv6.routes,
      non_loopback_link_routes: routes.non_loopback_link_routes,
      ipv4_default_routes: routes.ipv4.default_routes,
      ipv6_default_routes: routes.ipv6.default_routes
    },
    probes: {
      loopback_gateway_status: readiness.status,
      host_unix_ingress_verified: hostIngressVerified,
      runner_public_control_verified: runnerPublicControlVerified,
      public_tcp_target: 'public-ipv4:443',
      public_tcp_connected: outbound.connected,
      public_tcp_outcome: boundedErrorCode(outbound.outcome)
    },
    checks,
    limitations: [
      'single-container loopback-only namespace evidence, not a multi-host network policy',
      'the container host and Docker daemon remain trusted',
      'future external adapters require explicit destination allowlists and separate evidence'
    ]
  };
  const evidence = {
    ...unsigned,
    attestation: identity.signObject(unsigned)
  };
  verifyDenyEgressEvidence(evidence);
  return evidence;
}

export function verifyDenyEgressEvidence(evidence) {
  if (
    !evidence
    || evidence.schema !== EVIDENCE_SCHEMA
    || evidence.status !== 'passed'
  ) throw new ValidationError('Deny-egress evidence schema or status is invalid');
  normalizeTimestamp(evidence.generated_at);
  normalizeRevision(evidence.source?.revision);
  if (
    evidence.execution?.platform !== 'linux'
    || evidence.execution?.network_namespace !== true
    || evidence.boundary?.compose_network_mode_none_required !== true
    || evidence.boundary?.ipv4_default_routes !== 0
    || evidence.boundary?.ipv6_default_routes !== 0
    || evidence.boundary?.non_loopback_link_routes !== 0
    || evidence.probes?.loopback_gateway_status !== 200
    || evidence.probes?.host_unix_ingress_verified !== true
    || evidence.probes?.runner_public_control_verified !== true
    || evidence.probes?.public_tcp_connected !== false
    || !evidence.checks
    || Object.values(evidence.checks).some(value => value !== true)
  ) throw new ValidationError('Deny-egress evidence contains a failed boundary check');
  if (
    typeof evidence.signer?.public_key_pem !== 'string'
    || evidence.attestation?.key_id !== evidence.signer?.key_id
  ) throw new ValidationError('Deny-egress evidence signer metadata is invalid');
  const unsigned = structuredClone(evidence);
  delete unsigned.attestation;
  let publicKey;
  try {
    publicKey = createPublicKey(evidence.signer.public_key_pem);
  } catch {
    throw new ValidationError('Deny-egress evidence public key is invalid');
  }
  if (!verifyObjectSignature(unsigned, evidence.attestation, publicKey)) {
    throw new ValidationError('Deny-egress evidence attestation is invalid');
  }
  return {
    valid: true,
    source_revision: evidence.source.revision,
    ipv4_default_routes: evidence.boundary.ipv4_default_routes,
    ipv6_default_routes: evidence.boundary.ipv6_default_routes,
    outbound_connected: evidence.probes.public_tcp_connected
  };
}

async function probeReadiness({ url, fetchImpl = fetch }) {
  let response;
  try {
    response = await fetchImpl(url, {
      redirect: 'error',
      signal: AbortSignal.timeout(2_000)
    });
  } catch {
    return { status: 0, service: null, state: null };
  }
  let payload;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  return {
    status: response.status,
    service: payload?.service ?? null,
    state: payload?.status ?? null
  };
}

function parseIpv4Routes(serialized) {
  const lines = serialized.trim().split(/\r?\n/).filter(Boolean);
  if (!lines.length || !/^Iface\s+Destination\s+Gateway\s+Flags\b/.test(lines[0])) {
    throw new ValidationError('IPv4 route table header is invalid');
  }
  return lines.slice(1).map(line => {
    const fields = line.trim().split(/\s+/);
    if (
      fields.length < 8
      || !/^[A-Za-z0-9_.:-]{1,32}$/.test(fields[0])
      || !/^[A-Fa-f0-9]{8}$/.test(fields[1])
      || !/^[A-Fa-f0-9]{4}$/.test(fields[3])
      || !/^[A-Fa-f0-9]{8}$/.test(fields[7])
    ) throw new ValidationError('IPv4 route table row is invalid');
    const flags = Number.parseInt(fields[3], 16);
    return {
      interface: fields[0],
      up: (flags & 0x1) === 0x1,
      default: fields[1] === '00000000' && fields[7] === '00000000'
    };
  });
}

function parseIpv6Routes(serialized) {
  const trimmed = serialized.trim();
  if (!trimmed) return [];
  return trimmed.split(/\r?\n/).map(line => {
    const fields = line.trim().split(/\s+/);
    if (
      fields.length < 10
      || !/^[A-Fa-f0-9]{32}$/.test(fields[0])
      || !/^[A-Fa-f0-9]{2}$/.test(fields[1])
      || !/^[A-Fa-f0-9]{8}$/.test(fields[8])
      || !/^[A-Za-z0-9_.:-]{1,32}$/.test(fields[9])
    ) throw new ValidationError('IPv6 route table row is invalid');
    const flags = Number.parseInt(fields[8], 16);
    return {
      interface: fields[9],
      up: (flags & 0x1) === 0x1,
      default: /^0{32}$/.test(fields[0]) && fields[1] === '00'
    };
  });
}

async function readRouteFile(path, readFileImpl, { required }) {
  try {
    return await readFileImpl(path, 'utf8');
  } catch (error) {
    if (!required && error?.code === 'ENOENT') return '';
    throw new ValidationError(`Cannot read required network route table: ${path}`);
  }
}

function boundedErrorCode(value) {
  return (
    typeof value === 'string'
    && /^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(value)
  ) ? value.toLowerCase() : 'blocked';
}

function normalizeRevision(value) {
  if (value === null || value === undefined || value === '') return null;
  if (!REVISION.test(value)) {
    throw new ValidationError(
      'Deny-egress evidence revision must be a 40-character SHA'
    );
  }
  return value;
}

function normalizeTimestamp(value) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
    throw new ValidationError('Deny-egress evidence timestamp is invalid');
  }
  return new Date(value).toISOString();
}

async function main() {
  const evidence = await runDenyEgressDrill();
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
}

export { EVIDENCE_SCHEMA, OUTBOUND_PROBE };

if (
  process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
