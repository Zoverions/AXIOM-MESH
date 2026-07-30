import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { ValidationError, digestObject } from './lib/canonical.mjs';
import { ensureMeshIdentity } from './lib/identity.mjs';
import {
  EVIDENCE_SCHEMA,
  OUTBOUND_PROBE,
  assertDenyEgressBoundary,
  inspectLinuxRouteTables,
  probeTcpConnection,
  runDenyEgressDrill as runProvenanceDrill,
  verifyDenyEgressEvidence as verifyProvenanceEvidence
} from './_network-boundary-provenance.mjs';
import {
  KINDS,
  OBSERVER_TRUST,
  boundaryEvidenceContext,
  verifyBoundaryObserverAttestation
} from './boundary-observer-attestation.mjs';

const OBSERVER_LIMITATION = (
  'host ingress and runner public-control measurements are signed by ephemeral CI observer keys embedded in this package; the CI platform remains a trust anchor'
);

export {
  EVIDENCE_SCHEMA,
  OUTBOUND_PROBE,
  assertDenyEgressBoundary,
  inspectLinuxRouteTables,
  probeTcpConnection
};

export async function runDenyEgressDrill({
  config,
  sourceRevision = process.env.GITHUB_SHA || null,
  generatedAt = new Date().toISOString(),
  platform = process.platform,
  routeInspection,
  readinessProbe,
  outboundProbe,
  signer,
  hostIngressAttestation,
  runnerPublicControlAttestation,
  hostIngressAttestationPath = process.env.AXIOM_HOST_INGRESS_ATTESTATION_FILE,
  runnerPublicControlAttestationPath = process.env.AXIOM_RUNNER_PUBLIC_CONTROL_ATTESTATION_FILE,
  evidenceContext = process.env.AXIOM_BOUNDARY_EVIDENCE_CONTEXT,
  runId = process.env.GITHUB_RUN_ID,
  runAttempt = Number(process.env.GITHUB_RUN_ATTEMPT),
  runJob = process.env.GITHUB_JOB,
  hostSocketPath = process.env.AXIOM_HOST_SOCKET_PATH,
  runnerHost = '1.1.1.1',
  runnerPort = 443
} = {}) {
  const context = {
    ...boundaryEvidenceContext({
      sourceRevision,
      evidenceContext,
      run: { id: runId, attempt: runAttempt, job: runJob },
      hostSocketPath,
      runnerHost,
      runnerPort
    }),
    host_socket_path: hostSocketPath
  };
  const [hostEvidence, runnerEvidence] = await Promise.all([
    loadObserverAttestation(hostIngressAttestation, hostIngressAttestationPath, 'host ingress'),
    loadObserverAttestation(
      runnerPublicControlAttestation,
      runnerPublicControlAttestationPath,
      'runner public-control'
    )
  ]);
  const hostVerification = verifyBoundaryObserverAttestation(hostEvidence, {
    kind: KINDS.host,
    context,
    finalGeneratedAt: generatedAt
  });
  const runnerVerification = verifyBoundaryObserverAttestation(runnerEvidence, {
    kind: KINDS.runner,
    context,
    finalGeneratedAt: generatedAt
  });
  const gridIdentity = signer ?? await ensureMeshIdentity(
    config.dataDir,
    'grid',
    { create: false }
  );
  const baseEvidence = await runProvenanceDrill({
    config,
    sourceRevision,
    generatedAt,
    platform,
    routeInspection,
    hostIngressVerified: true,
    runnerPublicControlVerified: true,
    readinessProbe,
    outboundProbe,
    signer: gridIdentity
  });
  const unsigned = structuredClone(baseEvidence);
  delete unsigned.attestation;
  unsigned.assurance = 'passed_measured';
  unsigned.asserted_checks = [];
  unsigned.observer_context = {
    context,
    context_digest: digestObject(context),
    trust: OBSERVER_TRUST
  };
  unsigned.observer_attestations = {
    host_unix_ingress: hostEvidence,
    runner_public_control: runnerEvidence
  };
  unsigned.observer_attestation_digests = {
    host_unix_ingress: hostVerification.digest,
    runner_public_control: runnerVerification.digest
  };
  unsigned.check_provenance.host_unix_ingress_verified = {
    source: 'measured',
    observer: hostVerification.observer,
    observed_at: hostVerification.observed_at,
    subject: `host-unix-socket:${context.targets.host_unix_socket_path_digest}`,
    input_artifact_digest: hostVerification.digest
  };
  unsigned.check_provenance.runner_public_control_verified = {
    source: 'measured',
    observer: runnerVerification.observer,
    observed_at: runnerVerification.observed_at,
    subject: `runner-public-control:${runnerHost}:${runnerPort}`,
    input_artifact_digest: runnerVerification.digest
  };
  unsigned.limitations = [
    ...unsigned.limitations.filter(value => (
      typeof value === 'string'
      && !value.startsWith('required checks with asserted provenance:')
    )),
    OBSERVER_LIMITATION
  ];
  const evidence = {
    ...unsigned,
    attestation: gridIdentity.signObject(unsigned)
  };
  verifyDenyEgressEvidence(evidence);
  return evidence;
}

export function verifyDenyEgressEvidence(evidence) {
  const context = evidence?.observer_context?.context;
  if (
    !context
    || evidence.observer_context.context_digest !== digestObject(context)
    || evidence.observer_context.trust !== OBSERVER_TRUST
    || context.source_revision !== evidence.source?.revision
  ) throw new ValidationError('Deny-egress observer context is invalid');
  const hostEvidence = evidence.observer_attestations?.host_unix_ingress;
  const runnerEvidence = evidence.observer_attestations?.runner_public_control;
  const hostVerification = verifyBoundaryObserverAttestation(hostEvidence, {
    kind: KINDS.host,
    context,
    finalGeneratedAt: evidence.generated_at
  });
  const runnerVerification = verifyBoundaryObserverAttestation(runnerEvidence, {
    kind: KINDS.runner,
    context,
    finalGeneratedAt: evidence.generated_at
  });
  if (
    evidence.observer_attestation_digests?.host_unix_ingress !== hostVerification.digest
    || evidence.observer_attestation_digests?.runner_public_control !== runnerVerification.digest
    || evidence.check_provenance?.host_unix_ingress_verified?.source !== 'measured'
    || evidence.check_provenance.host_unix_ingress_verified.observer !== hostVerification.observer
    || evidence.check_provenance.host_unix_ingress_verified.observed_at !== hostVerification.observed_at
    || evidence.check_provenance.host_unix_ingress_verified.input_artifact_digest !== hostVerification.digest
    || evidence.check_provenance?.runner_public_control_verified?.source !== 'measured'
    || evidence.check_provenance.runner_public_control_verified.observer !== runnerVerification.observer
    || evidence.check_provenance.runner_public_control_verified.observed_at !== runnerVerification.observed_at
    || evidence.check_provenance.runner_public_control_verified.input_artifact_digest !== runnerVerification.digest
  ) throw new ValidationError('Deny-egress observer provenance binding is invalid');
  if (
    evidence.assurance !== 'passed_measured'
    || !Array.isArray(evidence.asserted_checks)
    || evidence.asserted_checks.length !== 0
    || !Array.isArray(evidence.limitations)
    || !evidence.limitations.includes(OBSERVER_LIMITATION)
  ) throw new ValidationError('Deny-egress signed-observer assurance is invalid');
  const verified = verifyProvenanceEvidence(evidence);
  return {
    ...verified,
    observer_context_digest: evidence.observer_context.context_digest,
    observers: {
      host_unix_ingress: hostVerification,
      runner_public_control: runnerVerification
    }
  };
}

async function loadObserverAttestation(value, path, label) {
  if (value) return structuredClone(value);
  if (typeof path !== 'string' || !path.length) {
    throw new ValidationError(`Deny-egress ${label} attestation file is required`);
  }
  let serialized;
  try {
    serialized = await readFile(path, 'utf8');
  } catch {
    throw new ValidationError(`Deny-egress ${label} attestation file cannot be read`);
  }
  try {
    return JSON.parse(serialized);
  } catch {
    throw new ValidationError(`Deny-egress ${label} attestation file is invalid JSON`);
  }
}

async function main() {
  const evidence = await runDenyEgressDrill();
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
