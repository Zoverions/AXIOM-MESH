import { createPublicKey, randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';
import { ValidationError, canonicalJson, sha256 } from './lib/canonical.mjs';
import {
  ensureMeshIdentity,
  loadTrustedKey,
  verifyObjectSignature
} from './lib/identity.mjs';
import {
  reserveProductionPortBlock,
  productionHostEnvironment,
  startProductionHost,
  stopProductionHost,
  stopProductionHostStrict
} from './lib/production-host.mjs';
import { provisionProduction } from './provision-production.mjs';
import {
  SERVICES,
  rollbackProductionCredentials,
  rotateProductionCredentials,
  verifyCredentialRotationManifest
} from './rotate-production.mjs';

const EVIDENCE_FORMAT = 'axiom-credential-rotation-drill-evidence.v1';
const REVISION = /^[a-f0-9]{40}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const REQUEST_TIMEOUT_MS = 5_000;
const STARTUP_TIMEOUT_MS = 20_000;

export async function runCredentialRotationDrill({
  workspaceDir,
  sourceRevision = process.env.GITHUB_SHA || null
} = {}) {
  const workspace = await prepareDisposableWorkspace(workspaceDir);
  const revision = normalizeRevision(sourceRevision);
  const generatedAt = new Date().toISOString();
  const overallStartedAt = performance.now();
  const provisioned = await provisionProduction({
    dataDir: join(workspace, 'data'),
    secretDir: join(workspace, 'secrets')
  });
  const originalToken = (
    await readFile(provisioned.operator_token_file, 'utf8')
  ).trim();
  const originalTelemetryToken = (
    await readFile(provisioned.telemetry_relay_token_file, 'utf8')
  ).trim();
  const originalIdentities = await loadIdentities(provisioned.data_dir);
  const originalKeyIds = keyIds(originalIdentities);
  const dataKeyBefore = await readFile(provisioned.data_key_file);
  const portLease = await reserveProductionPortBlock(
    'credential rotation drill'
  );
  const basePort = portLease.base_port;
  const gateway = `http://127.0.0.1:${basePort}`;
  const environment = productionHostEnvironment(provisioned, basePort);
  let runtime;

  try {
    const initialStart = await startProductionHost({
      environment,
      gateway,
      startupTimeoutMs: STARTUP_TIMEOUT_MS,
      drill: 'credential rotation drill'
    });
    runtime = initialStart;
    const baselineIntent = await performEcho(gateway, originalToken, 'before-rotation');
    const baselineTelemetryStatus = await authorizationStatus(
      gateway,
      originalTelemetryToken
    );
    const baselineTelemetryBoundary = await routeStatus(
      gateway,
      originalTelemetryToken,
      '/v1/status'
    );
    const initialStop = await stopProductionHostStrict(runtime.child, {
      boundary: 'credential rotation boundary'
    });
    runtime = null;

    const rotationStartedAt = performance.now();
    const rotation = await rotateProductionCredentials({
      dataDir: provisioned.data_dir,
      secretDir: provisioned.secret_dir
    });
    const rotationDurationMs = elapsedMilliseconds(rotationStartedAt);
    const rotatedToken = (
      await readFile(provisioned.operator_token_file, 'utf8')
    ).trim();
    const rotatedTelemetryToken = (
      await readFile(provisioned.telemetry_relay_token_file, 'utf8')
    ).trim();
    const rotatedIdentities = await loadIdentities(provisioned.data_dir);
    const rotatedKeyIds = keyIds(rotatedIdentities);
    const rotatedTrust = await verifyTrustTransition({
      dataDir: provisioned.data_dir,
      accepted: rotatedIdentities,
      rejected: originalIdentities,
      label: 'rotated',
      rotationId: rotation.rotation_id
    });
    const manifestSerialized = await readFile(rotation.manifest_path);
    const manifest = JSON.parse(manifestSerialized);
    const rollbackEnvelope = await readFile(
      join(resolve(rotation.manifest_path, '..'), manifest.rollback.name)
    );
    verifyCredentialRotationManifest({ manifest, rollbackEnvelope });

    const rotatedStart = await startProductionHost({
      environment,
      gateway,
      startupTimeoutMs: STARTUP_TIMEOUT_MS,
      drill: 'credential rotation drill'
    });
    runtime = rotatedStart;
    const rotatedIntent = await performEcho(gateway, rotatedToken, 'after-rotation');
    const originalTokenRejection = await authorizationStatus(gateway, originalToken);
    const rotatedTelemetryStatus = await authorizationStatus(
      gateway,
      rotatedTelemetryToken
    );
    const originalTelemetryTokenRejection = await authorizationStatus(
      gateway,
      originalTelemetryToken
    );
    const rotatedStop = await stopProductionHostStrict(runtime.child, {
      boundary: 'credential rollback boundary'
    });
    runtime = null;

    const rollbackStartedAt = performance.now();
    const rollback = await rollbackProductionCredentials({
      manifestPath: rotation.manifest_path,
      dataDir: provisioned.data_dir,
      secretDir: provisioned.secret_dir
    });
    const rollbackDurationMs = elapsedMilliseconds(rollbackStartedAt);
    const restoredToken = (
      await readFile(provisioned.operator_token_file, 'utf8')
    ).trim();
    const restoredTelemetryToken = (
      await readFile(provisioned.telemetry_relay_token_file, 'utf8')
    ).trim();
    const restoredIdentities = await loadIdentities(provisioned.data_dir);
    const restoredKeyIds = keyIds(restoredIdentities);
    const restoredTrust = await verifyTrustTransition({
      dataDir: provisioned.data_dir,
      accepted: originalIdentities,
      rejected: rotatedIdentities,
      label: 'restored',
      rotationId: rotation.rotation_id
    });
    const dataKeyAfter = await readFile(provisioned.data_key_file);

    const restoredStart = await startProductionHost({
      environment,
      gateway,
      startupTimeoutMs: STARTUP_TIMEOUT_MS,
      drill: 'credential rotation drill'
    });
    runtime = restoredStart;
    const restoredIntent = await performEcho(gateway, restoredToken, 'after-rollback');
    const rotatedTokenRejection = await authorizationStatus(gateway, rotatedToken);
    const restoredTelemetryStatus = await authorizationStatus(
      gateway,
      restoredTelemetryToken
    );
    const rotatedTelemetryTokenRejection = await authorizationStatus(
      gateway,
      rotatedTelemetryToken
    );
    const finalStop = await stopProductionHost(runtime.child);
    runtime = null;

    const checks = {
      original_runtime_started: initialStart.startup_duration_ms <= STARTUP_TIMEOUT_MS,
      original_intent_succeeded: baselineIntent.status === 200 && baselineIntent.completed,
      original_runtime_stopped: cleanStop(initialStop),
      all_service_identities_rotated: SERVICES.every(
        service => originalKeyIds[service] !== rotatedKeyIds[service]
      ),
      operator_token_rotated: originalToken !== rotatedToken,
      telemetry_relay_token_rotated: (
        originalTelemetryToken !== rotatedTelemetryToken
      ),
      new_service_trust_accepted: rotatedTrust.accepted,
      retired_service_trust_rejected: rotatedTrust.rejected,
      rotated_runtime_started: rotatedStart.startup_duration_ms <= STARTUP_TIMEOUT_MS,
      rotated_intent_succeeded: rotatedIntent.status === 200 && rotatedIntent.completed,
      retired_operator_token_rejected: originalTokenRejection === 401,
      original_telemetry_access_succeeded: baselineTelemetryStatus === 200,
      telemetry_scope_was_route_limited: baselineTelemetryBoundary === 403,
      rotated_telemetry_access_succeeded: rotatedTelemetryStatus === 200,
      retired_telemetry_token_rejected: originalTelemetryTokenRejection === 401,
      rotated_runtime_stopped: cleanStop(rotatedStop),
      rollback_restored_service_identities: canonicalJson(restoredKeyIds) === (
        canonicalJson(originalKeyIds)
      ),
      rollback_restored_operator_token: restoredToken === originalToken,
      rollback_restored_telemetry_token: (
        restoredTelemetryToken === originalTelemetryToken
      ),
      restored_service_trust_accepted: restoredTrust.accepted,
      rotated_service_trust_rejected: restoredTrust.rejected,
      data_protection_key_unchanged: dataKeyBefore.equals(dataKeyAfter),
      rollback_forward_package_retained: rollback.forward_recovery_available === true,
      restored_runtime_started: restoredStart.startup_duration_ms <= STARTUP_TIMEOUT_MS,
      restored_intent_succeeded: restoredIntent.status === 200 && restoredIntent.completed,
      rotated_operator_token_rejected: rotatedTokenRejection === 401,
      restored_telemetry_access_succeeded: restoredTelemetryStatus === 200,
      rotated_telemetry_token_rejected: rotatedTelemetryTokenRejection === 401,
      final_runtime_stopped: cleanStop(finalStop)
    };
    const failedChecks = Object.entries(checks)
      .filter(([, passed]) => passed !== true)
      .map(([name]) => name);
    if (failedChecks.length > 0) {
      throw new ValidationError(
        `Credential rotation drill checks failed: ${failedChecks.join(', ')}`
      );
    }

    const packageJson = JSON.parse(
      await readFile(new URL('../package.json', import.meta.url), 'utf8')
    );
    const signer = restoredIdentities.grid;
    const publicKeyPem = String(signer.publicKey.export({
      type: 'spki',
      format: 'pem'
    }));
    const unsigned = {
      schema: EVIDENCE_FORMAT,
      status: 'passed',
      generated_at: generatedAt,
      source: {
        kernel_version: packageJson.version,
        revision
      },
      execution: {
        disposable_workspace: true,
        host_mode: true,
        node: process.version,
        platform: process.platform,
        architecture: process.arch
      },
      signer: {
        key_id: signer.keyId,
        public_key_pem: publicKeyPem
      },
      rotation: {
        rotation_id: rotation.rotation_id,
        manifest_sha256: sha256(manifestSerialized),
        manifest_path: portableRelative(workspace, rotation.manifest_path),
        duration_ms: rotationDurationMs,
        encrypted_rollback_available: rotation.rollback_available,
        all_four_service_identities_rotated: true,
        operator_api_token_rotated: true,
        telemetry_relay_token_rotated: true,
        data_protection_key_rotated: false
      },
      rollback: {
        duration_ms: rollbackDurationMs,
        encrypted_forward_recovery_available: rollback.forward_recovery_available,
        interrupted_rotation_recovered: rollback.interrupted_rotation_recovered,
        exact_original_key_set_restored: true,
        exact_original_operator_token_restored: true,
        exact_original_telemetry_relay_token_restored: true
      },
      key_ids: {
        before: originalKeyIds,
        rotated: rotatedKeyIds,
        restored: restoredKeyIds
      },
      authorization: {
        baseline_intent_status: baselineIntent.status,
        rotated_intent_status: rotatedIntent.status,
        restored_intent_status: restoredIntent.status,
        retired_operator_token_status: originalTokenRejection,
        rotated_operator_token_after_rollback_status: rotatedTokenRejection,
        baseline_telemetry_status: baselineTelemetryStatus,
        telemetry_scope_boundary_status: baselineTelemetryBoundary,
        rotated_telemetry_status: rotatedTelemetryStatus,
        retired_telemetry_token_status: originalTelemetryTokenRejection,
        restored_telemetry_status: restoredTelemetryStatus,
        rotated_telemetry_token_after_rollback_status: (
          rotatedTelemetryTokenRejection
        ),
        rotated_trust: rotatedTrust,
        restored_trust: restoredTrust
      },
      runtime: {
        initial_start_ms: initialStart.startup_duration_ms,
        rotated_start_ms: rotatedStart.startup_duration_ms,
        restored_start_ms: restoredStart.startup_duration_ms,
        shutdowns: {
          initial_ms: initialStop.duration_ms,
          rotated_ms: rotatedStop.duration_ms,
          final_ms: finalStop.duration_ms
        }
      },
      total_duration_ms: elapsedMilliseconds(overallStartedAt),
      checks,
      limitations: [
        'disposable single-host proof, not a live deployment rotation',
        'operator and telemetry relay API tokens plus four Ed25519 service identities',
        'data-protection-key re-encryption is a separate migration',
        'external historic credential revocation requires operator confirmation'
      ]
    };
    const evidence = {
      ...unsigned,
      attestation: signer.signObject(unsigned)
    };
    verifyCredentialRotationDrillEvidence(evidence);
    const serializedEvidence = canonicalJson(evidence);
    for (const secret of [
      originalToken,
      rotatedToken,
      originalTelemetryToken,
      rotatedTelemetryToken,
      dataKeyBefore.toString('utf8').trim()
    ]) {
      if (serializedEvidence.includes(secret)) {
        throw new ValidationError(
          'Credential rotation drill evidence contains credential material'
        );
      }
    }
    return evidence;
  } finally {
    if (runtime) await stopProductionHost(runtime.child);
    await portLease.release();
  }
}

export function verifyCredentialRotationDrillEvidence(evidence) {
  if (
    !evidence
    || typeof evidence !== 'object'
    || Array.isArray(evidence)
    || evidence.schema !== EVIDENCE_FORMAT
    || evidence.status !== 'passed'
  ) {
    throw new ValidationError('Credential rotation drill evidence format is invalid');
  }
  if (
    !evidence.checks
    || Object.values(evidence.checks).some(value => value !== true)
  ) {
    throw new ValidationError('Credential rotation drill evidence contains a failed check');
  }
  if (
    evidence.rotation?.all_four_service_identities_rotated !== true
    || evidence.rotation?.operator_api_token_rotated !== true
    || evidence.rotation?.telemetry_relay_token_rotated !== true
    || evidence.rotation?.data_protection_key_rotated !== false
    || evidence.rotation?.encrypted_rollback_available !== true
    || !DIGEST.test(evidence.rotation?.manifest_sha256 ?? '')
    || evidence.rollback?.encrypted_forward_recovery_available !== true
    || evidence.rollback?.exact_original_key_set_restored !== true
    || evidence.rollback?.exact_original_operator_token_restored !== true
    || evidence.rollback?.exact_original_telemetry_relay_token_restored !== true
  ) {
    throw new ValidationError('Credential rotation drill scope or rollback proof is invalid');
  }
  if (
    evidence.authorization?.baseline_intent_status !== 200
    || evidence.authorization?.rotated_intent_status !== 200
    || evidence.authorization?.restored_intent_status !== 200
    || evidence.authorization?.retired_operator_token_status !== 401
    || evidence.authorization?.rotated_operator_token_after_rollback_status !== 401
    || evidence.authorization?.baseline_telemetry_status !== 200
    || evidence.authorization?.telemetry_scope_boundary_status !== 403
    || evidence.authorization?.rotated_telemetry_status !== 200
    || evidence.authorization?.retired_telemetry_token_status !== 401
    || evidence.authorization?.restored_telemetry_status !== 200
    || evidence.authorization?.rotated_telemetry_token_after_rollback_status !== 401
    || evidence.authorization?.rotated_trust?.accepted !== true
    || evidence.authorization?.rotated_trust?.rejected !== true
    || evidence.authorization?.restored_trust?.accepted !== true
    || evidence.authorization?.restored_trust?.rejected !== true
  ) {
    throw new ValidationError('Credential rotation drill authorization proof is invalid');
  }
  for (const service of SERVICES) {
    if (
      typeof evidence.key_ids?.before?.[service] !== 'string'
      || evidence.key_ids.before[service] !== evidence.key_ids?.restored?.[service]
      || evidence.key_ids.before[service] === evidence.key_ids?.rotated?.[service]
    ) {
      throw new ValidationError('Credential rotation drill key transition is invalid');
    }
  }
  if (
    typeof evidence.signer?.public_key_pem !== 'string'
    || evidence.signer?.key_id !== evidence.key_ids.before.grid
    || evidence.attestation?.key_id !== evidence.signer.key_id
  ) {
    throw new ValidationError('Credential rotation drill signer metadata is invalid');
  }
  let publicKey;
  try {
    publicKey = createPublicKey(evidence.signer.public_key_pem);
  } catch {
    throw new ValidationError('Credential rotation drill public key is invalid');
  }
  const unsigned = structuredClone(evidence);
  delete unsigned.attestation;
  if (!verifyObjectSignature(unsigned, evidence.attestation, publicKey)) {
    throw new ValidationError('Credential rotation drill attestation is invalid');
  }
  return {
    valid: true,
    schema: evidence.schema,
    source_revision: evidence.source?.revision,
    rotation_id: evidence.rotation.rotation_id,
    rotation_ms: evidence.rotation.duration_ms,
    rollback_ms: evidence.rollback.duration_ms
  };
}

async function loadIdentities(dataDir) {
  const entries = await Promise.all(SERVICES.map(async service => [
    service,
    await ensureMeshIdentity(dataDir, service, { create: false })
  ]));
  return Object.fromEntries(entries);
}

function keyIds(identities) {
  return Object.fromEntries(
    SERVICES.map(service => [service, identities[service].keyId])
  );
}

async function verifyTrustTransition({
  dataDir,
  accepted,
  rejected,
  label,
  rotationId
}) {
  const acceptedByService = {};
  const rejectedByService = {};
  for (const service of SERVICES) {
    const probe = {
      format: 'axiom-credential-trust-probe.v1',
      rotation_id: rotationId,
      service,
      state: label
    };
    const trust = await loadTrustedKey(dataDir, service);
    acceptedByService[service] = verifyObjectSignature(
      probe,
      accepted[service].signObject(probe),
      trust
    );
    rejectedByService[service] = !verifyObjectSignature(
      probe,
      rejected[service].signObject(probe),
      trust
    );
  }
  return {
    accepted: Object.values(acceptedByService).every(Boolean),
    rejected: Object.values(rejectedByService).every(Boolean),
    accepted_by_service: acceptedByService,
    rejected_by_service: rejectedByService
  };
}

async function performEcho(gateway, token, label) {
  const expected = `${label}-${randomUUID()}`;
  try {
    const response = await fetch(`${gateway}/v1/intents`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/json',
        'content-type': 'application/json',
        'idempotency-key': `rotation-${randomUUID()}`
      },
      body: JSON.stringify({
        action: 'system.echo',
        input: { message: expected }
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
    const payload = await response.json();
    return {
      status: response.status,
      completed: (
        response.status === 200
        && payload?.status === 'completed'
        && payload?.message === expected
      )
    };
  } catch {
    return { status: 0, completed: false };
  }
}

async function authorizationStatus(gateway, token) {
  return routeStatus(gateway, token, '/v1/operations');
}

async function routeStatus(gateway, token, path) {
  try {
    const response = await fetch(`${gateway}${path}`, {
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/json'
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
    await response.arrayBuffer();
    return response.status;
  } catch {
    return 0;
  }
}

async function prepareDisposableWorkspace(value) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new ValidationError(
      'Credential rotation drill requires an explicit disposable workspace'
    );
  }
  const workspace = resolve(value);
  await mkdir(workspace, { recursive: true, mode: 0o700 });
  if ((await readdir(workspace)).length !== 0) {
    throw new ValidationError('Credential rotation drill workspace must be empty');
  }
  return workspace;
}

function normalizeRevision(value) {
  if (value === null || value === undefined || value === '') return null;
  if (!REVISION.test(value)) {
    throw new ValidationError(
      'Credential rotation drill source revision must be a 40-character SHA'
    );
  }
  return value;
}

function cleanStop(result) {
  return result.code === 0 && result.signal === null;
}

function elapsedMilliseconds(startedAt) {
  return Number((performance.now() - startedAt).toFixed(3));
}

function portableRelative(from, to) {
  return relative(from, to).replaceAll('\\', '/');
}

export { EVIDENCE_FORMAT };

if (
  process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href
) {
  if (process.argv.length !== 3) {
    throw new ValidationError(
      'Usage: node src/credential-rotation-drill.mjs <empty-disposable-workspace>'
    );
  }
  const evidence = await runCredentialRotationDrill({
    workspaceDir: process.argv[2]
  });
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
}
