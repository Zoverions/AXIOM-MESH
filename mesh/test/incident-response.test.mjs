import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  classifyIncident,
  createIncidentPlan,
  loadIncidentResponsePolicy,
  validateIncidentResponsePolicy
} from '../src/incident-response.mjs';
import {
  runIncidentTabletopDrill,
  verifyIncidentTabletopEvidence
} from '../src/incident-tabletop-drill.mjs';

const REVISION = 'a'.repeat(40);
const GENERATED_AT = '2026-07-28T21:00:00.000Z';

test('incident policy classifies by the highest-impact signal and rejects drift', async () => {
  const policy = await loadIncidentResponsePolicy();
  const verification = validateIncidentResponsePolicy(policy);
  assert.equal(verification.valid, true);
  assert.equal(verification.severities, 4);
  assert.equal(
    classifyIncident(policy, {
      signals: [
        'resource_exhaustion',
        'evidence_integrity_failure'
      ]
    }).severity,
    'SEV-1'
  );
  assert.throws(
    () => classifyIncident(policy, {
      signals: ['unclassified_signal']
    }),
    /not classified/
  );
  const authorityExpanding = structuredClone(policy);
  authorityExpanding.actions.disable_gateway.authority_effect = 'expand';
  assert.throws(
    () => validateIncidentResponsePolicy(authorityExpanding),
    /action is invalid/
  );
  const weakenedCritical = structuredClone(policy);
  weakenedCritical.severities['SEV-1'].required_actions = (
    weakenedCritical.severities['SEV-1'].required_actions.filter(
      action => action !== 'rotate_data_key'
    )
  );
  assert.throws(
    () => validateIncidentResponsePolicy(weakenedCritical),
    /SEV-1 incident response policy is incomplete/
  );
});

test('incident plans require independent roles and every severity action', async () => {
  const policy = await loadIncidentResponsePolicy();
  const input = planInput(policy);
  assert.equal(
    createIncidentPlan(policy, input).classification.severity,
    'SEV-1'
  );
  const duplicateRoles = structuredClone(input);
  for (const role of policy.required_roles) {
    duplicateRoles.roles[role] = 'exercise-role:same-person';
  }
  assert.throws(
    () => createIncidentPlan(policy, duplicateRoles),
    /independently assigned/
  );
  const missingAction = structuredClone(input);
  missingAction.actions = missingAction.actions.filter(
    action => action !== 'preserve_forensic_state'
  );
  assert.throws(
    () => createIncidentPlan(policy, missingAction),
    /missing required actions/
  );
});

test('incident tabletop emits signed evidence linked to all control drills', async t => {
  const workspace = await mkdtemp(join(tmpdir(), 'axiom-incident-tabletop-'));
  t.after(() => rm(workspace, { recursive: true, force: true }));
  const policy = await loadIncidentResponsePolicy();
  const evidence = await runIncidentTabletopDrill({
    workspaceDir: workspace,
    sourceRevision: REVISION,
    generatedAt: GENERATED_AT,
    policy,
    controls: controlSummaries(REVISION)
  });
  const verification = verifyIncidentTabletopEvidence(evidence, policy);
  assert.equal(verification.valid, true);
  assert.equal(verification.severity, 'SEV-1');
  assert.equal(verification.linked_controls, 9);
  assert.ok(Object.values(evidence.checks).every(Boolean));
  assert.doesNotMatch(JSON.stringify(evidence), /PRIVATE KEY|operator\.token/i);

  const delayedContainment = structuredClone(evidence);
  delayedContainment.timeline.contained_at = new Date(
    Date.parse(evidence.plan.declared_at) + 61 * 60_000
  ).toISOString();
  assert.throws(
    () => verifyIncidentTabletopEvidence(delayedContainment, policy),
    /containment_target_met/
  );

  const tampered = structuredClone(evidence);
  tampered.scenario.title = 'tampered';
  assert.throws(
    () => verifyIncidentTabletopEvidence(tampered, policy),
    /attestation/
  );
});

test('incident tabletop rejects stale or incomplete linked controls', async t => {
  const workspace = await mkdtemp(join(tmpdir(), 'axiom-incident-tabletop-'));
  t.after(() => rm(workspace, { recursive: true, force: true }));
  const policy = await loadIncidentResponsePolicy();
  const controls = controlSummaries(REVISION);
  controls.recovery.source_revision = 'b'.repeat(40);
  await assert.rejects(
    () => runIncidentTabletopDrill({
      workspaceDir: workspace,
      sourceRevision: REVISION,
      generatedAt: GENERATED_AT,
      policy,
      controls
    }),
    /linked_control_evidence_verified/
  );
});

function planInput(policy) {
  return {
    incidentId: `incident_tabletop_${REVISION.slice(0, 20)}`,
    sourceRevision: REVISION,
    declaredAt: GENERATED_AT,
    signals: [
      'evidence_integrity_failure',
      'suspected_credential_exposure'
    ],
    affectedAssetClasses: [
      'api_credentials',
      'grid_evidence'
    ],
    roles: Object.fromEntries(policy.required_roles.map(role => [
      role,
      `exercise-role:${role.replaceAll('_', '-')}`
    ])),
    actions: [...policy.severities['SEV-1'].required_actions]
  };
}

function controlSummaries(revision) {
  return {
    backup_lifecycle: control(
      'axiom-backup-lifecycle-evidence.v1',
      'axiom-backup-lifecycle-evidence',
      '1',
      revision
    ),
    credential_rotation: control(
      'axiom-credential-rotation-drill-evidence.v1',
      'axiom-credential-rotation-evidence',
      '2',
      revision
    ),
    data_key_rotation: control(
      'axiom-data-key-rotation-drill-evidence.v1',
      'axiom-data-key-rotation-evidence',
      '3',
      revision
    ),
    node_scheduling: control(
      'axiom-node-scheduling-drill-evidence.v1',
      'axiom-node-scheduling-drill-evidence',
      '9',
      revision
    ),
    recovery: control(
      'axiom-recovery-drill-evidence.v1',
      'axiom-recovery-drill-evidence',
      '4',
      revision
    ),
    resilience: control(
      'axiom-resilience-drill-evidence.v1',
      'axiom-resilience-drill-evidence',
      '5',
      revision
    ),
    service_units: control(
      'axiom-service-unit-drill-evidence.v1',
      'axiom-service-unit-drill-evidence',
      '8',
      revision
    ),
    slo_restart: control(
      'axiom-slo-baseline-evidence.v1',
      'axiom-slo-baseline-evidence',
      '6',
      revision
    ),
    transport: control(
      'axiom-transport-drill-evidence.v1',
      'axiom-transport-drill-evidence',
      '7',
      revision
    )
  };
}

function control(schema, prefix, digestSeed, revision) {
  return {
    valid: true,
    schema,
    source_revision: revision,
    sha256: digestSeed.repeat(64),
    artifact: `${prefix}-${revision}`
  };
}
