import { createPublicKey } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { verifyBackupLifecycleEvidence } from './backup-lifecycle-drill.mjs';
import { verifyCredentialRotationDrillEvidence } from './credential-rotation-drill.mjs';
import { verifyDataKeyRotationDrillEvidence } from './data-key-rotation-drill.mjs';
import {
  createIncidentPlan,
  evaluateIncidentExercise,
  loadIncidentResponsePolicy,
  REQUIRED_CONTROL_TYPES,
  validateIncidentResponsePolicy
} from './incident-response.mjs';
import {
  canonicalJson,
  sha256,
  ValidationError
} from './lib/canonical.mjs';
import {
  ensureMeshIdentity,
  verifyObjectSignature
} from './lib/identity.mjs';
import { verifyRecoveryDrillEvidence } from './recovery-drill.mjs';
import { verifyResilienceDrillEvidence } from './resilience-drill.mjs';
import { verifyNodeSchedulingDrillEvidence } from './node-scheduling-drill.mjs';
import {
  verifyOnlineCausalSyncDrillEvidence
} from './online-causal-sync-drill.mjs';
import { verifyServiceUnitDrillEvidence } from './service-unit-drill.mjs';
import { verifySloBaselineEvidence } from './slo-drill.mjs';
import { verifyTransportDrillEvidence } from './transport-drill.mjs';

const EVIDENCE_SCHEMA = 'axiom-incident-tabletop-evidence.v1';
const REVISION = /^[a-f0-9]{40}$/;

const CONTROL_DEFINITIONS = Object.freeze({
  backup_lifecycle: Object.freeze({
    verifier: verifyBackupLifecycleEvidence,
    artifact: 'axiom-backup-lifecycle-evidence'
  }),
  credential_rotation: Object.freeze({
    verifier: verifyCredentialRotationDrillEvidence,
    artifact: 'axiom-credential-rotation-evidence'
  }),
  data_key_rotation: Object.freeze({
    verifier: verifyDataKeyRotationDrillEvidence,
    artifact: 'axiom-data-key-rotation-evidence'
  }),
  node_scheduling: Object.freeze({
    verifier: verifyNodeSchedulingDrillEvidence,
    artifact: 'axiom-node-scheduling-drill-evidence'
  }),
  online_causal_sync: Object.freeze({
    verifier: verifyOnlineCausalSyncDrillEvidence,
    artifact: 'axiom-online-causal-sync-drill-evidence'
  }),
  recovery: Object.freeze({
    verifier: verifyRecoveryDrillEvidence,
    artifact: 'axiom-recovery-drill-evidence'
  }),
  resilience: Object.freeze({
    verifier: verifyResilienceDrillEvidence,
    artifact: 'axiom-resilience-drill-evidence'
  }),
  service_units: Object.freeze({
    verifier: verifyServiceUnitDrillEvidence,
    artifact: 'axiom-service-unit-drill-evidence'
  }),
  slo_restart: Object.freeze({
    verifier: verifySloBaselineEvidence,
    artifact: 'axiom-slo-baseline-evidence'
  }),
  transport: Object.freeze({
    verifier: verifyTransportDrillEvidence,
    artifact: 'axiom-transport-drill-evidence'
  })
});

export async function loadIncidentControlEvidence(paths, {
  sourceRevision
} = {}) {
  const revision = normalizeRevision(sourceRevision);
  if (!paths || typeof paths !== 'object' || Array.isArray(paths)) {
    throw new ValidationError('Incident control-evidence paths are required');
  }
  const controls = {};
  for (const type of REQUIRED_CONTROL_TYPES) {
    const path = paths[type];
    if (typeof path !== 'string' || !path) {
      throw new ValidationError(`Incident control-evidence path is missing: ${type}`);
    }
    let serialized;
    let evidence;
    try {
      serialized = await readFile(path, 'utf8');
      evidence = JSON.parse(serialized);
    } catch {
      throw new ValidationError(`Incident control evidence cannot be read: ${type}`);
    }
    const definition = CONTROL_DEFINITIONS[type];
    const verification = definition.verifier(evidence);
    if (
      verification.valid !== true
      || verification.source_revision !== revision
    ) {
      throw new ValidationError(
        `Incident control evidence revision is invalid: ${type}`
      );
    }
    controls[type] = {
      valid: true,
      schema: verification.schema,
      source_revision: revision,
      sha256: sha256(serialized),
      artifact: `${definition.artifact}-${revision}`
    };
  }
  return controls;
}

export async function runIncidentTabletopDrill({
  workspaceDir,
  sourceRevision = process.env.GITHUB_SHA,
  generatedAt = new Date().toISOString(),
  policy,
  controls,
  signer
} = {}) {
  const revision = normalizeRevision(sourceRevision);
  const activePolicy = policy ?? await loadIncidentResponsePolicy();
  const policyVerification = validateIncidentResponsePolicy(activePolicy);
  const generated = normalizeTimestamp(generatedAt);
  const identity = signer ?? await createExerciseIdentity(workspaceDir);
  const plan = createIncidentPlan(activePolicy, {
    incidentId: `incident_tabletop_${revision.slice(0, 20)}`,
    sourceRevision: revision,
    declaredAt: generated,
    signals: [
      'evidence_integrity_failure',
      'resource_exhaustion',
      'confirmed_service_identity_compromise',
      'suspected_credential_exposure'
    ],
    affectedAssetClasses: [
      'api_credentials',
      'grid_evidence',
      'protected_state'
    ],
    roles: exerciseRoles(activePolicy.required_roles),
    actions: activePolicy.severities['SEV-1'].required_actions
  });
  const timeline = exerciseTimeline(generated);
  const communications = exerciseCommunications(generated);
  const closure = Object.fromEntries(
    activePolicy.closure_requirements.map(requirement => [requirement, true])
  );
  const checks = evaluateIncidentExercise(activePolicy, {
    plan,
    timeline,
    communications,
    controls,
    closure
  });
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
    generated_at: generated,
    source: {
      kernel_version: packageJson.version,
      revision
    },
    execution: {
      exercise_type: 'automated-tabletop',
      disposable_workspace: true,
      real_incident: false,
      node: process.version,
      platform: process.platform,
      architecture: process.arch
    },
    policy: {
      schema: activePolicy.schema,
      version: activePolicy.version,
      sha256: policyVerification.digest,
      frameworks: [...activePolicy.frameworks]
    },
    signer: {
      key_id: identity.keyId,
      public_key_pem: publicKeyPem
    },
    scenario: {
      id: 'candidate-credential-and-evidence-compromise',
      title: 'Suspected operator credential exposure with Grid integrity alarm',
      objectives: [
        'classify without averaging away a critical integrity signal',
        'select only authority-reducing or recovery actions',
        'preserve evidence before containment changes',
        'exercise communication cadence and independent closure review',
        'bind recovery, resilience, scheduling, online causal exchange, transport, and rotation controls to the same source revision'
      ]
    },
    plan,
    timeline,
    communications,
    controls,
    closure,
    checks,
    limitations: [
      'automated candidate-host tabletop, not a real incident record',
      'role identifiers are exercise placeholders, not a live on-call roster',
      'notification obligations require deployment-specific legal review',
      'linked controls are disposable-host evidence, not pilot-owned custody',
      'external communications and independent human review are not executed'
    ]
  };
  const evidence = {
    ...unsigned,
    attestation: identity.signObject(unsigned)
  };
  verifyIncidentTabletopEvidence(evidence, activePolicy);
  const serialized = canonicalJson(evidence);
  if (/PRIVATE KEY|authorization:\s*bearer|operator\.token/i.test(serialized)) {
    throw new ValidationError('Incident tabletop evidence contains secret material');
  }
  return evidence;
}

export function verifyIncidentTabletopEvidence(evidence, policy) {
  const policyVerification = validateIncidentResponsePolicy(policy);
  if (
    !evidence
    || typeof evidence !== 'object'
    || Array.isArray(evidence)
    || evidence.schema !== EVIDENCE_SCHEMA
    || evidence.status !== 'passed'
    || evidence.execution?.exercise_type !== 'automated-tabletop'
    || evidence.execution?.real_incident !== false
    || !REVISION.test(evidence.source?.revision ?? '')
    || evidence.plan?.source_revision !== evidence.source.revision
    || evidence.plan?.classification?.severity !== 'SEV-1'
    || evidence.policy?.schema !== policy.schema
    || evidence.policy?.version !== policy.version
    || evidence.policy?.sha256 !== policyVerification.digest
  ) {
    throw new ValidationError('Incident tabletop evidence metadata is invalid');
  }
  const recomputedChecks = evaluateIncidentExercise(policy, {
    plan: evidence.plan,
    timeline: evidence.timeline,
    communications: evidence.communications,
    controls: evidence.controls,
    closure: evidence.closure
  });
  if (
    canonicalJson(recomputedChecks) !== canonicalJson(evidence.checks)
    || Object.values(evidence.checks).some(value => value !== true)
  ) {
    throw new ValidationError('Incident tabletop evidence checks are invalid');
  }
  if (
    typeof evidence.signer?.public_key_pem !== 'string'
    || evidence.attestation?.key_id !== evidence.signer?.key_id
  ) {
    throw new ValidationError('Incident tabletop signer metadata is invalid');
  }
  let publicKey;
  try {
    publicKey = createPublicKey(evidence.signer.public_key_pem);
  } catch {
    throw new ValidationError('Incident tabletop signer public key is invalid');
  }
  if (publicKey.asymmetricKeyType !== 'ed25519') {
    throw new ValidationError('Incident tabletop signer is not Ed25519');
  }
  const unsigned = structuredClone(evidence);
  delete unsigned.attestation;
  if (!verifyObjectSignature(unsigned, evidence.attestation, publicKey)) {
    throw new ValidationError('Incident tabletop attestation is invalid');
  }
  return {
    valid: true,
    schema: evidence.schema,
    source_revision: evidence.source.revision,
    incident_id: evidence.plan.incident_id,
    severity: evidence.plan.classification.severity,
    policy_sha256: evidence.policy.sha256,
    linked_controls: REQUIRED_CONTROL_TYPES.length
  };
}

function exerciseRoles(requiredRoles) {
  return Object.fromEntries(requiredRoles.map(role => [
    role,
    `exercise-role:${role.replaceAll('_', '-')}`
  ]));
}

function exerciseTimeline(declaredAt) {
  return {
    acknowledged_at: addMinutes(declaredAt, 5),
    classified_at: addMinutes(declaredAt, 8),
    evidence_preserved_at: addMinutes(declaredAt, 10),
    containment_started_at: addMinutes(declaredAt, 15),
    contained_at: addMinutes(declaredAt, 35),
    recovery_verified_at: addMinutes(declaredAt, 48),
    closed_at: addMinutes(declaredAt, 55),
    retrospective_due_at: addMinutes(declaredAt, 7_200)
  };
}

function exerciseCommunications(declaredAt) {
  return [
    {
      kind: 'initial',
      audience: 'exercise-audience:response-team',
      at: addMinutes(declaredAt, 10)
    },
    {
      kind: 'status-update',
      audience: 'exercise-audience:affected-stakeholders',
      at: addMinutes(declaredAt, 35)
    },
    {
      kind: 'resolution',
      audience: 'exercise-audience:affected-stakeholders',
      at: addMinutes(declaredAt, 55)
    }
  ];
}

async function createExerciseIdentity(workspaceDir) {
  if (typeof workspaceDir !== 'string' || !workspaceDir) {
    throw new ValidationError('Incident tabletop workspace is required');
  }
  const workspace = resolve(workspaceDir);
  const dataDir = join(workspace, 'data');
  await mkdir(dataDir, { recursive: true, mode: 0o700 });
  return ensureMeshIdentity(dataDir, 'grid', { create: true });
}

function addMinutes(timestamp, minutes) {
  return new Date(Date.parse(timestamp) + minutes * 60_000).toISOString();
}

function normalizeRevision(value) {
  if (typeof value !== 'string' || !REVISION.test(value)) {
    throw new ValidationError(
      'Incident tabletop revision must be a 40-character SHA'
    );
  }
  return value;
}

function normalizeTimestamp(value) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
    throw new ValidationError('Incident tabletop timestamp is invalid');
  }
  return new Date(value).toISOString();
}

async function main() {
  const [
    workspaceDir,
    recoveryPath,
    backupLifecyclePath,
    sloPath,
    resiliencePath,
    serviceUnitsPath,
    nodeSchedulingPath,
    onlineCausalSyncPath,
    transportPath,
    credentialRotationPath,
    dataKeyRotationPath
  ] = process.argv.slice(2);
  const sourceRevision = process.env.GITHUB_SHA;
  const controls = await loadIncidentControlEvidence({
    recovery: recoveryPath,
    backup_lifecycle: backupLifecyclePath,
    slo_restart: sloPath,
    resilience: resiliencePath,
    service_units: serviceUnitsPath,
    node_scheduling: nodeSchedulingPath,
    online_causal_sync: onlineCausalSyncPath,
    transport: transportPath,
    credential_rotation: credentialRotationPath,
    data_key_rotation: dataKeyRotationPath
  }, { sourceRevision });
  const evidence = await runIncidentTabletopDrill({
    workspaceDir,
    sourceRevision,
    controls
  });
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
}

export { CONTROL_DEFINITIONS, EVIDENCE_SCHEMA };

if (
  process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
