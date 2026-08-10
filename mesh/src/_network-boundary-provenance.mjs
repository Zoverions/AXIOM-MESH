import { createPublicKey } from 'node:crypto';
import { readFile, readlink } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { ValidationError, digestObject } from './lib/canonical.mjs';
import {
  ensureMeshIdentity,
  verifyObjectSignature
} from './lib/identity.mjs';
import { meshConfig } from './lib/config.mjs';
import {
  OUTBOUND_PROBE,
  assertDenyEgressBoundary,
  inspectLinuxRouteTables,
  probeTcpConnection
} from './_network-boundary-core.mjs';

const EVIDENCE_SCHEMA = 'axiom-deny-egress-evidence.v1';
const REVISION = /^[a-f0-9]{40}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const OBSERVER = /^[a-z][a-z0-9.-]{1,63}$/;
const SUBJECT = /^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,159}$/;
const NETWORK_NAMESPACE = /^net:\[\d+\]$/;
const PROVENANCE_SOURCES = new Set(['measured', 'derived', 'asserted']);
const REQUIRED_CHECKS = Object.freeze([
  'network_namespace_observed',
  'ipv4_default_route_absent',
  'ipv6_default_route_absent',
  'non_loopback_routes_absent',
  'loopback_gateway_ready',
  'public_tcp_egress_blocked',
  'host_unix_ingress_verified',
  'runner_public_control_verified',
  'secret_values_omitted'
]);

export {
  EVIDENCE_SCHEMA,
  OUTBOUND_PROBE,
  assertDenyEgressBoundary,
  inspectLinuxRouteTables,
  probeTcpConnection
};

export async function runDenyEgressDrill({
  config = meshConfig(),
  sourceRevision = process.env.GITHUB_SHA || null,
  generatedAt = new Date().toISOString(),
  platform = process.platform,
  routeInspection,
  networkNamespaceIdentity,
  readlinkImpl = readlink,
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
  const namespaceIdentity = await resolveNetworkNamespaceIdentity({
    platform,
    value: networkNamespaceIdentity,
    readlinkImpl
  });
  const namespaceDigest = digestObject({ identity: namespaceIdentity });

  const readiness = await readinessProbe({
    url: `http://127.0.0.1:${config.ports.gateway}/ready`
  });
  const outbound = await outboundProbe({
    host: OUTBOUND_PROBE.host,
    port: OUTBOUND_PROBE.port,
    timeoutMs: OUTBOUND_PROBE.timeout_ms
  });
  const checks = {
    network_namespace_observed: NETWORK_NAMESPACE.test(namespaceIdentity),
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

  const observedAt = normalizeTimestamp(generatedAt);
  const checkProvenance = buildCheckProvenance({
    observedAt,
    routes,
    readiness,
    outbound,
    namespaceDigest,
    hostIngressVerified,
    runnerPublicControlVerified
  });
  const assertedChecks = REQUIRED_CHECKS.filter(
    name => checkProvenance[name].source === 'asserted'
  );
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
  const limitations = [
    'single-container loopback-only namespace evidence, not a multi-host network policy',
    'static Compose topology is verified by release/deployment checks rather than asserted in runtime evidence',
    'the container host and Docker daemon remain trusted',
    'future external adapters require explicit destination allowlists and separate evidence',
    assertionLimitation(assertedChecks)
  ];
  const unsigned = {
    schema: EVIDENCE_SCHEMA,
    status: 'passed',
    assurance: assertedChecks.length
      ? 'passed_with_assertions'
      : 'passed_measured',
    asserted_checks: assertedChecks,
    generated_at: observedAt,
    source: {
      kernel_version: packageJson.version,
      revision: normalizeRevision(sourceRevision)
    },
    execution: {
      platform,
      architecture: process.arch,
      network_namespace: checks.network_namespace_observed,
      network_namespace_identity_digest: namespaceDigest
    },
    signer: {
      key_id: identity.keyId,
      public_key_pem: publicKeyPem
    },
    boundary: {
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
    check_provenance: checkProvenance,
    limitations
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
    || !DIGEST.test(evidence.execution?.network_namespace_identity_digest ?? '')
    || Object.hasOwn(evidence.boundary ?? {}, 'compose_network_mode_none_required')
    || evidence.boundary?.ipv4_default_routes !== 0
    || evidence.boundary?.ipv6_default_routes !== 0
    || evidence.boundary?.non_loopback_link_routes !== 0
    || evidence.probes?.loopback_gateway_status !== 200
    || evidence.probes?.host_unix_ingress_verified !== true
    || evidence.probes?.runner_public_control_verified !== true
    || evidence.probes?.public_tcp_connected !== false
    || !isPlainObject(evidence.checks)
    || Object.values(evidence.checks).some(value => value !== true)
  ) throw new ValidationError('Deny-egress evidence contains a failed boundary check');
  const provenance = verifyCheckProvenance(evidence);
  if (
    evidence.check_provenance.network_namespace_observed.input_artifact_digest
      !== evidence.execution.network_namespace_identity_digest
  ) throw new ValidationError('Deny-egress namespace provenance binding is invalid');
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
    assurance: evidence.assurance,
    source_revision: evidence.source.revision,
    ipv4_default_routes: evidence.boundary.ipv4_default_routes,
    ipv6_default_routes: evidence.boundary.ipv6_default_routes,
    outbound_connected: evidence.probes.public_tcp_connected,
    provenance
  };
}

function buildCheckProvenance({
  observedAt,
  routes,
  readiness,
  outbound,
  namespaceDigest,
  hostIngressVerified,
  runnerPublicControlVerified
}) {
  const routeDigest = digestObject({
    ipv4: routes.ipv4,
    ipv6: routes.ipv6,
    non_loopback_link_routes: routes.non_loopback_link_routes
  });
  return {
    network_namespace_observed: provenanceRecord({
      source: 'measured',
      observer: 'network-boundary',
      observedAt,
      subject: 'linux:/proc/self/ns/net',
      inputArtifactDigest: namespaceDigest
    }),
    ipv4_default_route_absent: provenanceRecord({
      source: 'measured',
      observer: 'network-boundary',
      observedAt,
      subject: 'linux:/proc/net/route',
      inputArtifactDigest: routeDigest
    }),
    ipv6_default_route_absent: provenanceRecord({
      source: 'measured',
      observer: 'network-boundary',
      observedAt,
      subject: 'linux:/proc/net/ipv6_route',
      inputArtifactDigest: routeDigest
    }),
    non_loopback_routes_absent: provenanceRecord({
      source: 'derived',
      observer: 'network-boundary',
      observedAt,
      subject: 'linux:combined-route-inspection',
      inputArtifactDigest: routeDigest
    }),
    loopback_gateway_ready: provenanceRecord({
      source: 'measured',
      observer: 'network-boundary',
      observedAt,
      subject: 'gateway:/ready',
      inputArtifactDigest: digestObject(readiness)
    }),
    public_tcp_egress_blocked: provenanceRecord({
      source: 'measured',
      observer: 'network-boundary',
      observedAt,
      subject: 'public-ipv4:443',
      inputArtifactDigest: digestObject({
        target: OUTBOUND_PROBE,
        outcome: outbound
      })
    }),
    host_unix_ingress_verified: provenanceRecord({
      source: 'asserted',
      observer: 'ci-environment',
      observedAt,
      subject: 'env:AXIOM_HOST_INGRESS_VERIFIED',
      inputArtifactDigest: digestObject({ value: hostIngressVerified })
    }),
    runner_public_control_verified: provenanceRecord({
      source: 'asserted',
      observer: 'ci-environment',
      observedAt,
      subject: 'env:AXIOM_RUNNER_PUBLIC_CONTROL_VERIFIED',
      inputArtifactDigest: digestObject({ value: runnerPublicControlVerified })
    }),
    secret_values_omitted: provenanceRecord({
      source: 'derived',
      observer: 'network-boundary',
      observedAt,
      subject: 'evidence:secret-free-projection',
      inputArtifactDigest: digestObject({
        schema: EVIDENCE_SCHEMA,
        secret_fields_permitted: false
      })
    })
  };
}

function provenanceRecord({
  source,
  observer,
  observedAt,
  subject,
  inputArtifactDigest
}) {
  return {
    source,
    observer,
    observed_at: observedAt,
    subject,
    input_artifact_digest: inputArtifactDigest
  };
}

function verifyCheckProvenance(evidence) {
  if (!isPlainObject(evidence.check_provenance)) {
    throw new ValidationError('Deny-egress check provenance is required');
  }
  const checkNames = Object.keys(evidence.checks);
  const provenanceNames = Object.keys(evidence.check_provenance);
  if (
    checkNames.length !== REQUIRED_CHECKS.length
    || provenanceNames.length !== REQUIRED_CHECKS.length
    || REQUIRED_CHECKS.some(name => (
      !Object.hasOwn(evidence.checks, name)
      || !Object.hasOwn(evidence.check_provenance, name)
    ))
    || checkNames.some(name => !REQUIRED_CHECKS.includes(name))
    || provenanceNames.some(name => !REQUIRED_CHECKS.includes(name))
  ) throw new ValidationError('Deny-egress check provenance inventory is invalid');

  const summary = { measured: [], derived: [], asserted: [] };
  for (const name of REQUIRED_CHECKS) {
    const record = evidence.check_provenance[name];
    if (
      !isPlainObject(record)
      || !PROVENANCE_SOURCES.has(record.source)
      || typeof record.observer !== 'string'
      || !OBSERVER.test(record.observer)
      || typeof record.subject !== 'string'
      || !SUBJECT.test(record.subject)
      || typeof record.input_artifact_digest !== 'string'
      || !DIGEST.test(record.input_artifact_digest)
    ) throw new ValidationError(`Deny-egress check provenance is invalid for ${name}`);
    normalizeTimestamp(record.observed_at);
    summary[record.source].push(name);
  }

  const expectedAsserted = summary.asserted;
  if (
    !Array.isArray(evidence.asserted_checks)
    || evidence.asserted_checks.length !== expectedAsserted.length
    || evidence.asserted_checks.some((name, index) => name !== expectedAsserted[index])
  ) throw new ValidationError('Deny-egress asserted-check inventory is invalid');
  const expectedAssurance = expectedAsserted.length
    ? 'passed_with_assertions'
    : 'passed_measured';
  if (evidence.assurance !== expectedAssurance) {
    throw new ValidationError('Deny-egress assurance classification is invalid');
  }
  if (
    expectedAsserted.length
    && (
      !Array.isArray(evidence.limitations)
      || !evidence.limitations.includes(assertionLimitation(expectedAsserted))
    )
  ) throw new ValidationError('Deny-egress asserted-check limitation is missing');
  return summary;
}

function assertionLimitation(assertedChecks) {
  return assertedChecks.length
    ? `required checks with asserted provenance: ${assertedChecks.join(', ')}; signed observer sub-attestations are not yet implemented`
    : 'all required checks carry measured or derived provenance';
}

async function resolveNetworkNamespaceIdentity({ platform, value, readlinkImpl }) {
  if (platform !== 'linux') {
    throw new ValidationError('Deny-egress namespace observation requires Linux');
  }
  let identity = value;
  if (identity === undefined) {
    try {
      identity = await readlinkImpl('/proc/self/ns/net');
    } catch {
      throw new ValidationError('Deny-egress network namespace identity cannot be observed');
    }
  }
  if (typeof identity !== 'string' || !NETWORK_NAMESPACE.test(identity)) {
    throw new ValidationError('Deny-egress network namespace identity is invalid');
  }
  return identity;
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

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

async function main() {
  const evidence = await runDenyEgressDrill();
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
}

if (
  process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
