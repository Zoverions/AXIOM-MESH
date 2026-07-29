import { readFile } from 'node:fs/promises';
import { digestObject, ValidationError } from './lib/canonical.mjs';

const POLICY_SCHEMA = 'axiom-incident-response-policy.v1';
const PLAN_SCHEMA = 'axiom-incident-plan.v1';
const SEVERITY_ORDER = Object.freeze(['SEV-1', 'SEV-2', 'SEV-3', 'SEV-4']);
const SEVERITY_LABELS = Object.freeze({
  'SEV-1': 'critical',
  'SEV-2': 'high',
  'SEV-3': 'moderate',
  'SEV-4': 'low'
});
const REQUIRED_ROLES = Object.freeze([
  'incident_commander',
  'security_lead',
  'operations_lead',
  'communications_lead',
  'evidence_custodian',
  'independent_reviewer'
]);
const REQUIRED_CLOSURE = Object.freeze([
  'containment_verified',
  'recovery_verified',
  'evidence_manifested',
  'communications_recorded',
  'retrospective_scheduled',
  'independent_review_required'
]);
const REQUIRED_SEV1_TRIGGERS = Object.freeze([
  'confirmed_service_identity_compromise',
  'evidence_integrity_failure',
  'sandbox_boundary_failure',
  'unauthorized_high_risk_effect'
]);
const REQUIRED_SEV1_ACTIONS = Object.freeze([
  'declare_incident',
  'disable_gateway',
  'revoke_api_principals',
  'rotate_service_identities',
  'preserve_forensic_state',
  'restore_verified_backup',
  'rotate_data_key',
  'notify_stakeholders',
  'schedule_retrospective'
]);
const ACTION_EFFECTS = new Set([
  'communicate',
  'preserve',
  'recover',
  'reduce',
  'review'
]);
const REQUIRED_CONTROL_TYPES = Object.freeze([
  'backup_lifecycle',
  'credential_rotation',
  'data_key_rotation',
  'node_scheduling',
  'online_causal_sync',
  'provider_runtime',
  'recovery',
  'resilience',
  'service_units',
  'slo_restart',
  'transport'
]);
const CONTROL_SCHEMAS = Object.freeze({
  backup_lifecycle: 'axiom-backup-lifecycle-evidence.v1',
  credential_rotation: 'axiom-credential-rotation-drill-evidence.v1',
  data_key_rotation: 'axiom-data-key-rotation-drill-evidence.v1',
  node_scheduling: 'axiom-node-scheduling-drill-evidence.v1',
  online_causal_sync: 'axiom-online-causal-sync-drill-evidence.v1',
  provider_runtime: 'axiom-provider-conformance-evidence.v1',
  recovery: 'axiom-recovery-drill-evidence.v1',
  resilience: 'axiom-resilience-drill-evidence.v1',
  service_units: 'axiom-service-unit-drill-evidence.v1',
  slo_restart: 'axiom-slo-baseline-evidence.v1',
  transport: 'axiom-transport-drill-evidence.v1'
});
const IDENTIFIER = /^[a-z][a-z0-9_]{2,63}$/;
const INCIDENT_ID = /^incident_[a-z0-9][a-z0-9_-]{7,95}$/;
const REVISION = /^[a-f0-9]{40}$/;

export async function loadIncidentResponsePolicy(
  path = new URL('../config/incident-response.json', import.meta.url)
) {
  let policy;
  try {
    policy = JSON.parse(await readFile(path, 'utf8'));
  } catch {
    throw new ValidationError('Incident response policy cannot be read');
  }
  validateIncidentResponsePolicy(policy);
  return policy;
}

export function validateIncidentResponsePolicy(policy) {
  if (
    !plainObject(policy)
    || policy.schema !== POLICY_SCHEMA
    || policy.version !== 1
    || JSON.stringify(policy.severity_order) !== JSON.stringify(SEVERITY_ORDER)
  ) {
    throw new ValidationError('Incident response policy schema or severity order is invalid');
  }
  const roles = uniqueIdentifiers(
    policy.required_roles,
    'Incident response required roles'
  );
  if (JSON.stringify(roles) !== JSON.stringify(REQUIRED_ROLES)) {
    throw new ValidationError('Incident response policy lacks independent role coverage');
  }
  const closure = uniqueIdentifiers(
    policy.closure_requirements,
    'Incident response closure requirements'
  );
  if (JSON.stringify(closure) !== JSON.stringify(REQUIRED_CLOSURE)) {
    throw new ValidationError('Incident response closure requirements are incomplete');
  }
  if (!plainObject(policy.actions) || !Object.keys(policy.actions).length) {
    throw new ValidationError('Incident response actions are missing');
  }
  for (const [id, action] of Object.entries(policy.actions)) {
    requireIdentifier(id, 'Incident response action');
    if (
      !plainObject(action)
      || !IDENTIFIER.test(action.category ?? '')
      || !ACTION_EFFECTS.has(action.authority_effect)
      || !roles.includes(action.owner_role)
    ) {
      throw new ValidationError(`Incident response action is invalid: ${id}`);
    }
  }
  const assignedSignals = new Set();
  let priorTargets;
  for (const severity of SEVERITY_ORDER) {
    const rule = policy.severities?.[severity];
    if (
      !plainObject(rule)
      || rule.label !== SEVERITY_LABELS[severity]
      || !boundedInteger(rule.activation_minutes, 1, 10_080)
      || !boundedInteger(rule.containment_target_minutes, 1, 10_080)
      || rule.containment_target_minutes < rule.activation_minutes
      || !boundedInteger(rule.update_interval_minutes, 1, 10_080)
    ) {
      throw new ValidationError(`Incident severity policy is invalid: ${severity}`);
    }
    const targets = [
      rule.activation_minutes,
      rule.containment_target_minutes,
      rule.update_interval_minutes
    ];
    if (
      priorTargets
      && targets.some((value, index) => value < priorTargets[index])
    ) {
      throw new ValidationError('Incident response targets weaken severity ordering');
    }
    priorTargets = targets;
    const triggers = uniqueIdentifiers(
      rule.triggers,
      `Incident ${severity} triggers`
    );
    const requiredActions = uniqueIdentifiers(
      rule.required_actions,
      `Incident ${severity} actions`
    );
    if (!triggers.length || !requiredActions.length) {
      throw new ValidationError(`Incident severity policy is incomplete: ${severity}`);
    }
    for (const trigger of triggers) {
      if (assignedSignals.has(trigger)) {
        throw new ValidationError(`Incident trigger is assigned more than once: ${trigger}`);
      }
      assignedSignals.add(trigger);
    }
    for (const action of requiredActions) {
      if (!Object.hasOwn(policy.actions, action)) {
        throw new ValidationError(
          `Incident severity references an unknown action: ${action}`
        );
      }
    }
    if (
      severity === 'SEV-1'
      && (
        REQUIRED_SEV1_TRIGGERS.some(trigger => !triggers.includes(trigger))
        || REQUIRED_SEV1_ACTIONS.some(action => !requiredActions.includes(action))
      )
    ) {
      throw new ValidationError('SEV-1 incident response policy is incomplete');
    }
  }
  if (
    !Array.isArray(policy.frameworks)
    || policy.frameworks.length < 2
    || policy.frameworks.some(value => (
      typeof value !== 'string' || value.length < 3 || value.length > 160
    ))
  ) {
    throw new ValidationError('Incident response framework references are invalid');
  }
  return {
    valid: true,
    schema: policy.schema,
    digest: digestObject(policy),
    severities: SEVERITY_ORDER.length,
    actions: Object.keys(policy.actions).length
  };
}

export function classifyIncident(policy, { signals }) {
  validateIncidentResponsePolicy(policy);
  const normalized = uniqueIdentifiers(signals, 'Incident signals');
  if (!normalized.length) throw new ValidationError('Incident signals are required');
  const known = new Set(
    SEVERITY_ORDER.flatMap(severity => policy.severities[severity].triggers)
  );
  for (const signal of normalized) {
    if (!known.has(signal)) {
      throw new ValidationError(`Incident signal is not classified: ${signal}`);
    }
  }
  for (const severity of SEVERITY_ORDER) {
    const rule = policy.severities[severity];
    const matched = normalized.filter(signal => rule.triggers.includes(signal));
    if (matched.length) {
      return {
        severity,
        label: rule.label,
        matched_signals: matched,
        activation_minutes: rule.activation_minutes,
        containment_target_minutes: rule.containment_target_minutes,
        update_interval_minutes: rule.update_interval_minutes,
        required_actions: [...rule.required_actions]
      };
    }
  }
  throw new ValidationError('Incident could not be classified');
}

export function createIncidentPlan(policy, {
  incidentId,
  sourceRevision,
  declaredAt,
  signals,
  affectedAssetClasses,
  roles,
  actions
}) {
  const classification = classifyIncident(policy, { signals });
  if (!INCIDENT_ID.test(incidentId ?? '')) {
    throw new ValidationError('Incident identifier is invalid');
  }
  if (!REVISION.test(sourceRevision ?? '')) {
    throw new ValidationError('Incident source revision is invalid');
  }
  const declared = normalizeTimestamp(declaredAt, 'Incident declaration');
  const assets = uniqueIdentifiers(
    affectedAssetClasses,
    'Incident affected asset classes'
  );
  if (!assets.length) throw new ValidationError('Incident affected assets are required');
  if (!plainObject(roles)) throw new ValidationError('Incident role assignments are missing');
  const assignments = {};
  for (const role of policy.required_roles) {
    const assignee = roles[role];
    if (
      typeof assignee !== 'string'
      || !/^exercise-role:[a-z][a-z-]{2,63}$/.test(assignee)
    ) {
      throw new ValidationError(`Incident role assignment is invalid: ${role}`);
    }
    assignments[role] = assignee;
  }
  if (new Set(Object.values(assignments)).size !== policy.required_roles.length) {
    throw new ValidationError('Incident roles must be independently assigned');
  }
  const selected = uniqueIdentifiers(actions, 'Incident selected actions');
  const missing = classification.required_actions.filter(id => !selected.includes(id));
  if (missing.length) {
    throw new ValidationError(
      `Incident plan is missing required actions: ${missing.join(', ')}`
    );
  }
  const plannedActions = selected.map(id => {
    const action = policy.actions[id];
    if (!action) throw new ValidationError(`Incident plan action is unknown: ${id}`);
    return {
      id,
      category: action.category,
      authority_effect: action.authority_effect,
      owner_role: action.owner_role
    };
  });
  return {
    schema: PLAN_SCHEMA,
    incident_id: incidentId,
    source_revision: sourceRevision,
    declared_at: declared,
    signals: [...signals],
    affected_asset_classes: assets,
    classification,
    roles: assignments,
    actions: plannedActions,
    closure_requirements: [...policy.closure_requirements]
  };
}

export function evaluateIncidentExercise(policy, {
  plan,
  timeline,
  communications,
  controls,
  closure
}) {
  validateIncidentResponsePolicy(policy);
  if (plan?.schema !== PLAN_SCHEMA) {
    throw new ValidationError('Incident exercise plan schema is invalid');
  }
  const classification = classifyIncident(policy, { signals: plan.signals });
  if (
    classification.severity !== plan.classification?.severity
    || JSON.stringify(classification.required_actions)
      !== JSON.stringify(plan.classification?.required_actions)
  ) {
    throw new ValidationError('Incident exercise classification drifted');
  }
  const roleValues = Object.values(plan.roles ?? {});
  const requiredRolesAssigned = (
    policy.required_roles.every(role => typeof plan.roles?.[role] === 'string')
    && Object.keys(plan.roles ?? {}).length === policy.required_roles.length
    && new Set(roleValues).size === policy.required_roles.length
  );
  const selectedActions = new Set((plan.actions ?? []).map(action => action.id));
  const requiredActionsSelected = classification.required_actions.every(
    action => selectedActions.has(action)
  );
  const authorityReducing = (plan.actions ?? []).every(action => (
    ACTION_EFFECTS.has(action.authority_effect)
    && action.authority_effect !== 'expand'
    && policy.actions[action.id]?.authority_effect === action.authority_effect
    && policy.actions[action.id]?.category === action.category
    && policy.actions[action.id]?.owner_role === action.owner_role
  ));
  const declaredAt = timestampMs(plan.declared_at, 'Incident declaration');
  const acknowledgedAt = timestampMs(timeline?.acknowledged_at, 'Incident acknowledgement');
  const classifiedAt = timestampMs(timeline?.classified_at, 'Incident classification');
  const evidencePreservedAt = timestampMs(
    timeline?.evidence_preserved_at,
    'Incident evidence preservation'
  );
  const containmentStartedAt = timestampMs(
    timeline?.containment_started_at,
    'Incident containment start'
  );
  const containedAt = timestampMs(timeline?.contained_at, 'Incident containment');
  const recoveryVerifiedAt = timestampMs(
    timeline?.recovery_verified_at,
    'Incident recovery verification'
  );
  const closedAt = timestampMs(timeline?.closed_at, 'Incident closure');
  const retrospectiveDueAt = timestampMs(
    timeline?.retrospective_due_at,
    'Incident retrospective due date'
  );
  const activationLimit = classification.activation_minutes * 60_000;
  const containmentLimit = classification.containment_target_minutes * 60_000;
  const chronologyValid = (
    declaredAt <= acknowledgedAt
    && acknowledgedAt <= classifiedAt
    && classifiedAt <= evidencePreservedAt
    && evidencePreservedAt <= containmentStartedAt
    && containmentStartedAt <= containedAt
    && containedAt <= recoveryVerifiedAt
    && recoveryVerifiedAt <= closedAt
  );
  const communicationsValid = validateCommunications(
    communications,
    declaredAt,
    closedAt,
    classification.update_interval_minutes
  );
  const controlsValid = validateControlSummaries(
    controls,
    plan.source_revision
  );
  const closureValid = (
    plainObject(closure)
    && policy.closure_requirements.every(requirement => closure[requirement] === true)
  );
  const checks = {
    classification_deterministic: true,
    required_roles_assigned_independently: requiredRolesAssigned,
    required_actions_selected: requiredActionsSelected,
    containment_reduces_or_preserves_authority: authorityReducing,
    chronology_valid: chronologyValid,
    activation_target_met: (
      acknowledgedAt - declaredAt <= activationLimit
      && classifiedAt - declaredAt <= activationLimit
    ),
    evidence_preserved_before_containment: evidencePreservedAt <= containmentStartedAt,
    containment_target_met: containedAt - declaredAt <= containmentLimit,
    communications_cadence_met: communicationsValid,
    linked_control_evidence_verified: controlsValid,
    recovery_verified_before_closure: recoveryVerifiedAt <= closedAt,
    retrospective_due_date_bounded: (
      retrospectiveDueAt > closedAt
      && retrospectiveDueAt - closedAt <= 7 * 24 * 60 * 60_000
    ),
    closure_requirements_met: closureValid
  };
  const failed = Object.entries(checks)
    .filter(([, value]) => value !== true)
    .map(([name]) => name);
  if (failed.length) {
    throw new ValidationError(
      `Incident exercise checks failed: ${failed.join(', ')}`
    );
  }
  return checks;
}

function validateCommunications(
  communications,
  declaredAt,
  closedAt,
  updateIntervalMinutes
) {
  if (!Array.isArray(communications) || communications.length < 2) return false;
  const entries = communications.map((entry, index) => {
    if (
      !plainObject(entry)
      || !['initial', 'status-update', 'resolution'].includes(entry.kind)
      || typeof entry.audience !== 'string'
      || !/^exercise-audience:[a-z-]{3,63}$/.test(entry.audience)
    ) return null;
    return {
      ...entry,
      at_ms: timestampMs(entry.at, `Incident communication ${index}`)
    };
  });
  if (entries.some(entry => entry === null)) return false;
  const maxGap = updateIntervalMinutes * 60_000;
  if (
    entries[0].kind !== 'initial'
    || entries.at(-1).kind !== 'resolution'
    || entries[0].at_ms < declaredAt
    || entries[0].at_ms - declaredAt > maxGap
    || entries.at(-1).at_ms > closedAt
  ) return false;
  for (let index = 1; index < entries.length; index += 1) {
    if (
      entries[index].at_ms < entries[index - 1].at_ms
      || entries[index].at_ms - entries[index - 1].at_ms > maxGap
    ) return false;
  }
  return true;
}

function validateControlSummaries(controls, sourceRevision) {
  if (
    !plainObject(controls)
    || Object.keys(controls).length !== REQUIRED_CONTROL_TYPES.length
  ) return false;
  return REQUIRED_CONTROL_TYPES.every(type => {
    const control = controls[type];
    return (
      plainObject(control)
      && control.valid === true
      && control.schema === CONTROL_SCHEMAS[type]
      && /^[a-f0-9]{64}$/.test(control.sha256 ?? '')
      && control.source_revision === sourceRevision
      && control.artifact === `${artifactPrefix(type)}-${sourceRevision}`
    );
  });
}

function artifactPrefix(type) {
  return {
    backup_lifecycle: 'axiom-backup-lifecycle-evidence',
    credential_rotation: 'axiom-credential-rotation-evidence',
    data_key_rotation: 'axiom-data-key-rotation-evidence',
    node_scheduling: 'axiom-node-scheduling-drill-evidence',
    online_causal_sync: 'axiom-online-causal-sync-drill-evidence',
    provider_runtime: 'axiom-provider-conformance-evidence',
    recovery: 'axiom-recovery-drill-evidence',
    resilience: 'axiom-resilience-drill-evidence',
    service_units: 'axiom-service-unit-drill-evidence',
    slo_restart: 'axiom-slo-baseline-evidence',
    transport: 'axiom-transport-drill-evidence'
  }[type];
}

function uniqueIdentifiers(value, name) {
  if (!Array.isArray(value) || value.length > 64) {
    throw new ValidationError(`${name} must be a bounded array`);
  }
  const normalized = value.map(item => requireIdentifier(item, name));
  if (new Set(normalized).size !== normalized.length) {
    throw new ValidationError(`${name} must not contain duplicates`);
  }
  return normalized;
}

function requireIdentifier(value, name) {
  if (typeof value !== 'string' || !IDENTIFIER.test(value)) {
    throw new ValidationError(`${name} contains an invalid identifier`);
  }
  return value;
}

function normalizeTimestamp(value, name) {
  const milliseconds = timestampMs(value, name);
  return new Date(milliseconds).toISOString();
}

function timestampMs(value, name) {
  if (typeof value !== 'string') {
    throw new ValidationError(`${name} timestamp is invalid`);
  }
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) {
    throw new ValidationError(`${name} timestamp is invalid`);
  }
  return milliseconds;
}

function boundedInteger(value, minimum, maximum) {
  return Number.isSafeInteger(value) && value >= minimum && value <= maximum;
}

function plainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export {
  PLAN_SCHEMA,
  POLICY_SCHEMA,
  REQUIRED_CONTROL_TYPES,
  SEVERITY_ORDER
};
