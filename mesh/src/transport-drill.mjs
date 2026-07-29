import { createPublicKey, randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';
import {
  canonicalJson,
  ValidationError
} from './lib/canonical.mjs';
import { signedFetch } from './lib/client.mjs';
import {
  ensureMeshIdentity,
  verifyObjectSignature
} from './lib/identity.mjs';
import {
  findProductionPortBlock,
  operationsReportIsReady,
  productionHostEnvironment,
  startProductionHost,
  stopProductionHost
} from './lib/production-host.mjs';
import {
  loadTransportRuntime,
  rollbackTransportCredentials,
  rotateTransportCredentials,
  validateTransportCredentials
} from './lib/transport-credentials.mjs';
import { provisionProduction } from './provision-production.mjs';

const EVIDENCE_SCHEMA = 'axiom-transport-drill-evidence.v1';
const REVISION = /^[a-f0-9]{40}$/;
const SERVICE_NAMES = Object.freeze([
  'gateway',
  'grid',
  'hypervisor',
  'sandbox',
  'supervisor'
]);

export async function runTransportDrill({
  workspaceDir,
  sourceRevision = process.env.GITHUB_SHA || null,
  generatedAt = new Date().toISOString()
} = {}) {
  const revision = normalizeRevision(sourceRevision);
  const generated = normalizeTimestamp(generatedAt);
  const workspace = await prepareDisposableWorkspace(workspaceDir);
  const startedAt = performance.now();
  const provisioned = await provisionProduction({
    dataDir: join(workspace, 'data'),
    secretDir: join(workspace, 'secrets')
  });
  const gridIdentity = await ensureMeshIdentity(
    provisioned.data_dir,
    'grid',
    { create: false }
  );
  const gatewayIdentity = await ensureMeshIdentity(
    provisioned.data_dir,
    'gateway',
    { create: false }
  );
  const token = (
    await readFile(provisioned.operator_token_file, 'utf8')
  ).trim();
  const before = await validateTransportCredentials({
    secretDir: provisioned.secret_dir
  });
  const retiredGateway = await loadTransportRuntime({
    transportDir: before.transport_dir,
    service: 'gateway'
  });
  const basePort = await findProductionPortBlock('transport drill');
  const gateway = `http://127.0.0.1:${basePort}`;
  const hypervisor = `https://127.0.0.1:${basePort + 1}`;
  const environment = productionHostEnvironment(provisioned, basePort);
  let runtime;

  try {
    runtime = await startProductionHost({
      environment,
      gateway,
      drill: 'transport drill initial runtime'
    });
    const initialOperations = await requestJson(
      `${gateway}/v1/operations`,
      token
    );
    const initialDirect = await signedFetch(
      Object.assign(gatewayIdentity, { transport: retiredGateway }),
      'hypervisor',
      `${hypervisor}/internal/v1/operations`
    );
    const initialStop = await stopProductionHost(runtime.child);
    runtime = null;

    const rotation = await rotateTransportCredentials({
      secretDir: provisioned.secret_dir
    });
    const rotated = await validateTransportCredentials({
      secretDir: provisioned.secret_dir
    });
    const activeGateway = await loadTransportRuntime({
      transportDir: rotated.transport_dir,
      service: 'gateway'
    });
    runtime = await startProductionHost({
      environment,
      gateway,
      drill: 'transport drill rotated runtime'
    });
    const rotatedOperations = await requestJson(
      `${gateway}/v1/operations`,
      token
    );

    let retiredRejectionCode = null;
    gatewayIdentity.transport = {
      ...retiredGateway,
      peers: activeGateway.peers
    };
    try {
      await signedFetch(
        gatewayIdentity,
        'hypervisor',
        `${hypervisor}/internal/v1/operations`
      );
    } catch (error) {
      retiredRejectionCode = error?.code ?? error?.name ?? 'request_failed';
    }
    gatewayIdentity.transport = activeGateway;
    const activeDirect = await signedFetch(
      gatewayIdentity,
      'hypervisor',
      `${hypervisor}/internal/v1/operations`
    );
    const postRotationIntent = await submitEcho({
      gateway,
      token,
      message: 'transport-active-after-rotation'
    });
    const rotatedStop = await stopProductionHost(runtime.child);
    runtime = null;

    const rollback = await rollbackTransportCredentials({
      secretDir: provisioned.secret_dir
    });
    const restored = await validateTransportCredentials({
      secretDir: provisioned.secret_dir
    });
    runtime = await startProductionHost({
      environment,
      gateway,
      drill: 'transport drill rolled-back runtime'
    });
    const restoredOperations = await requestJson(
      `${gateway}/v1/operations`,
      token
    );
    const postRollbackIntent = await submitEcho({
      gateway,
      token,
      message: 'transport-active-after-rollback'
    });
    const finalStop = await stopProductionHost(runtime.child);
    runtime = null;

    const beforeFingerprints = serviceFingerprints(before);
    const rotatedFingerprints = serviceFingerprints(rotated);
    const restoredFingerprints = serviceFingerprints(restored);
    const checks = {
      exact_transport_identity_set: (
        canonicalJson(Object.keys(before.services).sort())
        === canonicalJson(SERVICE_NAMES)
      ),
      initial_stack_ready: (
        initialOperations.status === 200
        && operationsReportIsReady(initialOperations.payload)
      ),
      initial_mutual_transport_succeeded: (
        initialDirect?.status === 'ready'
      ),
      initial_shutdown_clean: (
        initialStop.code === 0
        && initialStop.signal === null
      ),
      leaf_generation_advanced: (
        rotation.generation.before === 1
        && rotation.generation.after === 2
        && rotated.generation === 2
      ),
      ca_anchor_unchanged: (
        before.ca_fingerprint_sha256 === rotated.ca_fingerprint_sha256
      ),
      every_leaf_rotated: SERVICE_NAMES.every(
        service => beforeFingerprints[service] !== rotatedFingerprints[service]
      ),
      rotated_stack_ready: (
        rotatedOperations.status === 200
        && operationsReportIsReady(rotatedOperations.payload)
      ),
      retired_leaf_rejected: retiredRejectionCode === 'invalid_transport_peer',
      active_leaf_accepted: activeDirect?.status === 'ready',
      post_rotation_intent_succeeded: (
        postRotationIntent.status === 200
        && postRotationIntent.payload?.status === 'completed'
      ),
      rotated_shutdown_clean: (
        rotatedStop.code === 0
        && rotatedStop.signal === null
      ),
      rollback_generation_restored: (
        rollback.generation.before === 2
        && rollback.generation.after === 1
        && restored.generation === 1
      ),
      rollback_fingerprints_exact: (
        canonicalJson(restoredFingerprints)
        === canonicalJson(beforeFingerprints)
      ),
      restored_stack_ready: (
        restoredOperations.status === 200
        && operationsReportIsReady(restoredOperations.payload)
      ),
      post_rollback_intent_succeeded: (
        postRollbackIntent.status === 200
        && postRollbackIntent.payload?.status === 'completed'
      ),
      final_shutdown_clean: finalStop.code === 0 && finalStop.signal === null
    };
    const failed = Object.entries(checks)
      .filter(([, passed]) => passed !== true)
      .map(([name]) => name);
    if (failed.length) {
      throw new ValidationError(
        `Transport drill checks failed: ${failed.join(', ')}`
      );
    }

    const packageJson = JSON.parse(
      await readFile(new URL('../package.json', import.meta.url), 'utf8')
    );
    const unsigned = {
      schema: EVIDENCE_SCHEMA,
      status: 'passed',
      generated_at: generated,
      source: {
        kernel_version: packageJson.version,
        revision
      },
      profile: {
        protocol: 'TLSv1.3',
        certificate_algorithm: 'Ed25519',
        peer_identity: 'SPIFFE URI SAN plus exact SHA-256 certificate pin',
        application_authentication: 'Ed25519 signed request with nonce and timestamp',
        rotation_mode: 'offline atomic directory swap',
        leaf_validity_days: 30
      },
      execution: {
        disposable_workspace: true,
        real_production_supervisor: true,
        total_duration_ms: elapsedMilliseconds(startedAt),
        node: process.version,
        platform: process.platform,
        architecture: process.arch
      },
      signer: {
        service: 'grid',
        key_id: gridIdentity.keyId,
        public_key_pem: String(gridIdentity.publicKey.export({
          type: 'spki',
          format: 'pem'
        }))
      },
      trust: {
        ca_fingerprint_sha256: before.ca_fingerprint_sha256,
        generation_before: before.generation,
        generation_rotated: rotated.generation,
        generation_restored: restored.generation,
        service_count: SERVICE_NAMES.length
      },
      rotation: {
        retired_rejection_code: retiredRejectionCode,
        every_leaf_rotated: true,
        exact_rollback: true
      },
      runtime: {
        initial_operations_status: initialOperations.status,
        rotated_operations_status: rotatedOperations.status,
        restored_operations_status: restoredOperations.status,
        post_rotation_intent_status: postRotationIntent.status,
        post_rollback_intent_status: postRollbackIntent.status
      },
      checks,
      limitations: [
        'single-host certificate lifecycle evidence, not a multi-host network deployment',
        'the CA signing authority uses disposable local custody; pilot custody remains external',
        'offline rotation requires a coordinated stop and restart',
        'certificate revocation is exact active-leaf pinning, not an external OCSP service'
      ]
    };
    const evidence = {
      ...unsigned,
      attestation: gridIdentity.signObject(unsigned)
    };
    verifyTransportDrillEvidence(evidence);
    await assertEvidenceContainsNoSecrets(evidence, provisioned, token);
    return evidence;
  } finally {
    if (runtime) await stopProductionHost(runtime.child);
  }
}

export function verifyTransportDrillEvidence(evidence) {
  if (
    !evidence
    || typeof evidence !== 'object'
    || Array.isArray(evidence)
    || evidence.schema !== EVIDENCE_SCHEMA
    || evidence.status !== 'passed'
    || evidence.profile?.protocol !== 'TLSv1.3'
    || evidence.profile?.certificate_algorithm !== 'Ed25519'
    || evidence.trust?.generation_before !== 1
    || evidence.trust?.generation_rotated !== 2
    || evidence.trust?.generation_restored !== 1
    || evidence.trust?.service_count !== SERVICE_NAMES.length
    || !/^[a-f0-9]{64}$/.test(evidence.trust?.ca_fingerprint_sha256 ?? '')
    || evidence.rotation?.retired_rejection_code !== 'invalid_transport_peer'
    || evidence.rotation?.every_leaf_rotated !== true
    || evidence.rotation?.exact_rollback !== true
    || (
      evidence.source?.revision !== null
      && !REVISION.test(evidence.source?.revision ?? '')
    )
    || !evidence.checks
    || Object.values(evidence.checks).some(value => value !== true)
  ) {
    throw new ValidationError('Transport drill evidence metadata or checks are invalid');
  }
  if (
    evidence.runtime?.initial_operations_status !== 200
    || evidence.runtime?.rotated_operations_status !== 200
    || evidence.runtime?.restored_operations_status !== 200
    || evidence.runtime?.post_rotation_intent_status !== 200
    || evidence.runtime?.post_rollback_intent_status !== 200
  ) {
    throw new ValidationError('Transport drill runtime evidence is invalid');
  }
  if (
    evidence.signer?.service !== 'grid'
    || typeof evidence.signer?.public_key_pem !== 'string'
    || evidence.attestation?.key_id !== evidence.signer?.key_id
  ) {
    throw new ValidationError('Transport drill signer metadata is invalid');
  }
  let publicKey;
  try {
    publicKey = createPublicKey(evidence.signer.public_key_pem);
  } catch {
    throw new ValidationError('Transport drill public key is invalid');
  }
  if (publicKey.asymmetricKeyType !== 'ed25519') {
    throw new ValidationError('Transport drill signer is not Ed25519');
  }
  const unsigned = structuredClone(evidence);
  delete unsigned.attestation;
  if (!verifyObjectSignature(unsigned, evidence.attestation, publicKey)) {
    throw new ValidationError('Transport drill attestation is invalid');
  }
  return {
    valid: true,
    schema: evidence.schema,
    source_revision: evidence.source.revision,
    ca_fingerprint_sha256: evidence.trust.ca_fingerprint_sha256
  };
}

async function submitEcho({ gateway, token, message }) {
  const response = await fetch(`${gateway}/v1/intents`, {
    method: 'POST',
    redirect: 'error',
    signal: AbortSignal.timeout(8_000),
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/json',
      'content-type': 'application/json',
      'idempotency-key': `transport-drill-${randomUUID()}`
    },
    body: JSON.stringify({
      action: 'system.echo',
      input: { message }
    })
  });
  return {
    status: response.status,
    payload: await response.json()
  };
}

async function requestJson(url, token) {
  const response = await fetch(url, {
    redirect: 'error',
    signal: AbortSignal.timeout(8_000),
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/json'
    }
  });
  return {
    status: response.status,
    payload: await response.json()
  };
}

function serviceFingerprints(credentials) {
  return Object.fromEntries(SERVICE_NAMES.map(service => [
    service,
    credentials.services[service].fingerprint_sha256
  ]));
}

async function assertEvidenceContainsNoSecrets(evidence, provisioned, token) {
  const serialized = canonicalJson(evidence);
  const transport = provisioned.transport;
  const secrets = [
    token,
    (await readFile(provisioned.data_key_file, 'utf8')).trim(),
    await readFile(transport.ca_private_key_file, 'utf8'),
    ...await Promise.all(SERVICE_NAMES.map(service => (
      readFile(transport.services[service].key_file, 'utf8')
    )))
  ];
  if (
    secrets.some(secret => serialized.includes(secret))
    || /PRIVATE KEY|authorization:\s*bearer|operator\.token/i.test(serialized)
  ) {
    throw new ValidationError('Transport drill evidence contains secret material');
  }
}

async function prepareDisposableWorkspace(value) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new ValidationError(
      'Transport drill requires an explicit disposable workspace'
    );
  }
  const workspace = resolve(value);
  await mkdir(workspace, { recursive: true, mode: 0o700 });
  if ((await readdir(workspace)).length !== 0) {
    throw new ValidationError('Transport drill workspace must be empty');
  }
  return workspace;
}

function normalizeRevision(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string' || !REVISION.test(value)) {
    throw new ValidationError(
      'Transport drill revision must be a 40-character SHA'
    );
  }
  return value;
}

function normalizeTimestamp(value) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    throw new ValidationError('Transport drill timestamp is invalid');
  }
  return new Date(timestamp).toISOString();
}

function elapsedMilliseconds(startedAt) {
  return Number((performance.now() - startedAt).toFixed(3));
}

if (
  process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href
) {
  if (process.argv.length !== 3) {
    throw new ValidationError(
      'Usage: node src/transport-drill.mjs <empty-disposable-workspace>'
    );
  }
  const evidence = await runTransportDrill({
    workspaceDir: process.argv[2]
  });
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
}

export { EVIDENCE_SCHEMA };
