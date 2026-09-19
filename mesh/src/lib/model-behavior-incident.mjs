import {
  ValidationError,
  assertPlainObject,
  assertString,
  assertStringArray,
  digestObject
} from './canonical.mjs';

export const MODEL_BEHAVIOR_INCIDENT_SCHEMA = 'axiom-model-behavior-incident.v0';
const SCHEMA = MODEL_BEHAVIOR_INCIDENT_SCHEMA;
const STATUS = 'inert-model-behavior-incident-evidence';
const ZERO_DIGEST = '0'.repeat(64);
const DIGEST_PATTERN = /^[0-9a-f]{64}$/;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const UNKNOWN_TOKENS = new Set(['unknown', 'not-yet-established']);

const TOP_LEVEL_KEYS = Object.freeze([
  'schema',
  'version',
  'status',
  'incident_id',
  'observed_range',
  'discovery_at',
  'subject',
  'lifecycle_stage',
  'environment',
  'expected_boundary',
  'observed_behavior',
  'behavior_classes',
  'consequential_effects',
  'third_party_or_data_impact',
  'detection',
  'evidence_refs',
  'reproduction',
  'severity_triage',
  'uncertainty',
  'containment',
  'mitigation',
  'disclosure',
  'affected_party_notification',
  'lineage',
  'sensitive_evidence_routing',
  'created_at',
  'incident_digest',
  'authority_effect',
  'assurance_effect',
  'network_effect',
  'credential_visibility',
  'runtime_activation',
  'selection_effect'
]);

const OBSERVED_RANGE_KEYS = Object.freeze(['from', 'to', 'state']);
const SUBJECT_KEYS = Object.freeze([
  'model_id',
  'model_digest',
  'runtime_id',
  'runtime_digest',
  'build_id',
  'provider_id',
  'binding_strength'
]);
const ENVIRONMENT_KEYS = Object.freeze(['task_id', 'isolation', 'notes']);
const EFFECTS_KEYS = Object.freeze(['attempted', 'completed', 'uncertain']);
const IMPACT_KEYS = Object.freeze(['state', 'summary']);
const DETECTION_KEYS = Object.freeze(['mechanism', 'monitoring_coverage', 'notes']);
const EVIDENCE_REF_KEYS = Object.freeze(['ref_id', 'digest', 'kind', 'authority_effect']);
const REPRODUCTION_KEYS = Object.freeze(['status', 'scoped_frequency']);
const SCOPED_FREQUENCY_KEYS = Object.freeze([
  'state',
  'count',
  'population_size',
  'population_id',
  'population_digest',
  'refuses_universal_prevalence'
]);
const SEVERITY_TRIAGE_KEYS = Object.freeze([
  'declared_level',
  'priority',
  'basis',
  'is_truth_claim'
]);
const UNCERTAINTY_KEYS = Object.freeze(['causal_explanation', 'open_questions']);
const STATE_BLOCK_KEYS = Object.freeze(['state', 'summary']);
const DISCLOSURE_KEYS = Object.freeze([
  'track',
  'state',
  'subordinate_to_security_md',
  'subordinate_to_incident_response',
  'automation'
]);
const NOTIFICATION_KEYS = Object.freeze(['state', 'summary']);
const LINEAGE_KEYS = Object.freeze(['supersedes', 'updates', 'superseded_by']);
const LINEAGE_REF_KEYS = Object.freeze(['incident_id', 'incident_digest']);
const SENSITIVE_ROUTING_KEYS = Object.freeze([
  'public_artifact_contains_secrets',
  'routing',
  'private_evidence_ref'
]);

const LIFECYCLE_STAGES = new Set([
  'training',
  'evaluation',
  'testing',
  'deployment',
  'simulation',
  'unknown',
  'not-yet-established'
]);
const BINDING_STRENGTHS = new Set([
  'exact-artifact',
  'provider-versioned',
  'bounded-harness',
  'mutable-alias',
  'unknown',
  'not-yet-established'
]);
const ISOLATIONS = new Set([
  'offline-fixture',
  'isolated-lab',
  'shared-lab',
  'deployment-observed',
  'unknown',
  'not-yet-established'
]);
const BEHAVIOR_CLASSES = new Set([
  'self-authored-summary-instruction',
  'concealment-reporting-integrity-failure',
  'fabricated-unavailable-source-data',
  'unauthorized-credential-use',
  'public-upload-egress-workaround',
  'shared-state-cross-agent-communication',
  'broken-collaboration-channel-widening',
  'monitoring-treated-as-authorization',
  'other-reviewed',
  'unknown',
  'not-yet-established'
]);
const EFFECT_KINDS = new Set([
  'public-upload',
  'credential-use',
  'account-registration',
  'egress-widening',
  'cross-agent-communication',
  'shared-state-mutation',
  'fabricated-provenance',
  'instruction-authority-widening',
  'other-reviewed',
  'unknown',
  'not-yet-established'
]);
const IMPACT_STATES = new Set([
  'none-observed',
  'suspected',
  'confirmed',
  'unknown',
  'not-yet-established'
]);
const DETECTION_MECHANISMS = new Set([
  'deterministic-checker',
  'human-review',
  'monitor-verdict',
  'external-report',
  'self-report',
  'unknown',
  'not-yet-established'
]);
const MONITORING_COVERAGE = new Set([
  'covered',
  'partial',
  'uncovered',
  'unknown',
  'not-yet-established'
]);
const EVIDENCE_KINDS = new Set([
  'transcript',
  'checker-output',
  'monitor-verdict',
  'artifact',
  'derived-summary',
  'other-reviewed'
]);
const REPRODUCTION_STATUS = new Set([
  'reproduced',
  'not-reproduced',
  'partial',
  'unknown',
  'not-yet-established'
]);
const FREQUENCY_STATES = new Set([
  'measured',
  'unknown',
  'not-yet-established',
  'not-applicable'
]);
const SEVERITY_LEVELS = new Set([
  'SEV-1',
  'SEV-2',
  'SEV-3',
  'SEV-4',
  'unknown',
  'not-yet-established'
]);
const PRIORITIES = new Set(['p0', 'p1', 'p2', 'p3', 'unknown', 'not-yet-established']);
const CAUSAL_STATES = new Set(['established', 'partial', 'unknown', 'not-yet-established']);
const STATE_BLOCK_STATES = new Set([
  'none',
  'planned',
  'in-progress',
  'complete',
  'unknown',
  'not-yet-established'
]);
const DISCLOSURE_TRACKS = new Set([
  'ready-for-disclosure',
  'minor-investigation',
  'coordinated-slow-investigation'
]);
const DISCLOSURE_STATES = new Set([
  'internal-only',
  'ready',
  'deferred',
  'disclosed',
  'unknown',
  'not-yet-established'
]);
const NOTIFICATION_STATES = new Set([
  'not-applicable',
  'pending',
  'completed',
  'unknown',
  'not-yet-established'
]);
const SENSITIVE_ROUTING = new Set([
  'none',
  'private-ir-channel',
  'security-md-process',
  'unknown',
  'not-yet-established'
]);
const OBSERVED_RANGE_STATES = new Set([
  'known',
  'partial',
  'unknown',
  'not-yet-established'
]);

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const item of Object.values(value)) deepFreeze(item);
  return Object.freeze(value);
}

function clone(value) {
  return structuredClone(value);
}

function assertExactKeys(value, allowedKeys, name) {
  const object = assertPlainObject(value, name);
  const allowed = new Set(allowedKeys);
  for (const key of Object.keys(object)) {
    if (!allowed.has(key)) throw new ValidationError(`${name} contains unknown field ${key}`);
  }
  for (const key of allowedKeys) {
    if (!Object.hasOwn(object, key)) throw new ValidationError(`${name} is missing required field ${key}`);
  }
  return object;
}

function assertEnum(value, allowed, name) {
  assertString(value, name, { max: 160 });
  if (!allowed.has(value)) throw new ValidationError(`${name} is invalid`);
  return value;
}

function assertId(value, name) {
  return assertString(value, name, { min: 1, max: 160, pattern: ID_PATTERN });
}

function assertDigest(value, name) {
  return assertString(value, name, { min: 64, max: 64, pattern: DIGEST_PATTERN });
}

function assertTimestamp(value, name) {
  assertString(value, name, { min: 20, max: 40 });
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || !value.endsWith('Z')) {
    throw new ValidationError(`${name} must be an RFC3339 UTC timestamp`);
  }
  return value;
}

function assertTimestampOrUnknown(value, name) {
  if (UNKNOWN_TOKENS.has(value)) return value;
  return assertTimestamp(value, name);
}

function assertIdOrUnknown(value, name) {
  if (UNKNOWN_TOKENS.has(value)) return value;
  return assertId(value, name);
}

function assertOptionalDigest(value, name) {
  if (value === null) return null;
  return assertDigest(value, name);
}

function assertOptionalId(value, name) {
  if (value === null) return null;
  return assertId(value, name);
}

function assertInteger(value, name, { min = 0 } = {}) {
  if (!Number.isSafeInteger(value) || value < min) {
    throw new ValidationError(`${name} must be an integer >= ${min}`);
  }
  return value;
}

function assertArray(value, name, { minItems = 0, maxItems = 64 } = {}) {
  if (!Array.isArray(value) || value.length < minItems || value.length > maxItems) {
    throw new ValidationError(`${name} must be an array with ${minItems}-${maxItems} items`);
  }
  return value;
}

function assertEnumArray(values, allowed, name, { maxItems = 32 } = {}) {
  const items = assertArray(values, name, { maxItems });
  const seen = new Set();
  items.forEach((item, index) => {
    assertEnum(item, allowed, `${name}[${index}]`);
    if (seen.has(item)) throw new ValidationError(`${name} contains duplicate ${item}`);
    seen.add(item);
  });
  return items;
}

function validateObservedRange(range) {
  assertExactKeys(range, OBSERVED_RANGE_KEYS, 'observed_range');
  const from = assertTimestampOrUnknown(range.from, 'observed_range.from');
  const to = assertTimestampOrUnknown(range.to, 'observed_range.to');
  assertEnum(range.state, OBSERVED_RANGE_STATES, 'observed_range.state');
  if (!UNKNOWN_TOKENS.has(from) && !UNKNOWN_TOKENS.has(to) && Date.parse(from) > Date.parse(to)) {
    throw new ValidationError('observed_range.from must not be after observed_range.to');
  }
  if (range.state === 'known' && (UNKNOWN_TOKENS.has(from) || UNKNOWN_TOKENS.has(to))) {
    throw new ValidationError('observed_range.state known cannot use unknown timestamps');
  }
}

function validateSubject(subject) {
  assertExactKeys(subject, SUBJECT_KEYS, 'subject');
  assertIdOrUnknown(subject.model_id, 'subject.model_id');
  assertOptionalDigest(subject.model_digest, 'subject.model_digest');
  assertIdOrUnknown(subject.runtime_id, 'subject.runtime_id');
  assertOptionalDigest(subject.runtime_digest, 'subject.runtime_digest');
  assertIdOrUnknown(subject.build_id, 'subject.build_id');
  assertIdOrUnknown(subject.provider_id, 'subject.provider_id');
  assertEnum(subject.binding_strength, BINDING_STRENGTHS, 'subject.binding_strength');
}

function validateEnvironment(environment) {
  assertExactKeys(environment, ENVIRONMENT_KEYS, 'environment');
  assertIdOrUnknown(environment.task_id, 'environment.task_id');
  assertEnum(environment.isolation, ISOLATIONS, 'environment.isolation');
  assertString(environment.notes, 'environment.notes', { min: 1, max: 2048 });
}

function validateConsequentialEffects(effects) {
  assertExactKeys(effects, EFFECTS_KEYS, 'consequential_effects');
  assertEnumArray(effects.attempted, EFFECT_KINDS, 'consequential_effects.attempted');
  assertEnumArray(effects.completed, EFFECT_KINDS, 'consequential_effects.completed');
  assertEnumArray(effects.uncertain, EFFECT_KINDS, 'consequential_effects.uncertain');
}

function validateImpact(impact) {
  assertExactKeys(impact, IMPACT_KEYS, 'third_party_or_data_impact');
  assertEnum(impact.state, IMPACT_STATES, 'third_party_or_data_impact.state');
  assertString(impact.summary, 'third_party_or_data_impact.summary', { min: 1, max: 2048 });
}

function validateDetection(detection) {
  assertExactKeys(detection, DETECTION_KEYS, 'detection');
  assertEnum(detection.mechanism, DETECTION_MECHANISMS, 'detection.mechanism');
  assertEnum(detection.monitoring_coverage, MONITORING_COVERAGE, 'detection.monitoring_coverage');
  assertString(detection.notes, 'detection.notes', { min: 1, max: 2048 });
}

function validateEvidenceRef(ref, index) {
  const name = `evidence_refs[${index}]`;
  assertExactKeys(ref, EVIDENCE_REF_KEYS, name);
  assertId(ref.ref_id, `${name}.ref_id`);
  assertDigest(ref.digest, `${name}.digest`);
  assertEnum(ref.kind, EVIDENCE_KINDS, `${name}.kind`);
  if (ref.authority_effect !== 'none') {
    throw new ValidationError(`${name}.authority_effect must be none`);
  }
  if (ref.kind === 'derived-summary' && ref.authority_effect !== 'none') {
    throw new ValidationError(`${name} derived-summary evidence cannot be authoritative`);
  }
}

function validateScopedFrequency(frequency) {
  assertExactKeys(frequency, SCOPED_FREQUENCY_KEYS, 'reproduction.scoped_frequency');
  assertEnum(frequency.state, FREQUENCY_STATES, 'reproduction.scoped_frequency.state');
  if (frequency.refuses_universal_prevalence !== true) {
    throw new ValidationError('scoped_frequency.refuses_universal_prevalence must be true');
  }
  if (frequency.state === 'measured') {
    assertInteger(frequency.count, 'reproduction.scoped_frequency.count', { min: 0 });
    assertInteger(frequency.population_size, 'reproduction.scoped_frequency.population_size', { min: 1 });
    if (frequency.count > frequency.population_size) {
      throw new ValidationError('scoped_frequency.count cannot exceed population_size');
    }
    assertId(frequency.population_id, 'reproduction.scoped_frequency.population_id');
    assertDigest(frequency.population_digest, 'reproduction.scoped_frequency.population_digest');
  } else {
    if (frequency.count !== null) {
      throw new ValidationError('scoped_frequency.count must be null unless measured');
    }
    if (frequency.population_size !== null) {
      throw new ValidationError('scoped_frequency.population_size must be null unless measured');
    }
    if (frequency.population_id !== null || frequency.population_digest !== null) {
      throw new ValidationError('scoped_frequency population binding must be null unless measured');
    }
  }
}

function validateReproduction(reproduction) {
  assertExactKeys(reproduction, REPRODUCTION_KEYS, 'reproduction');
  assertEnum(reproduction.status, REPRODUCTION_STATUS, 'reproduction.status');
  validateScopedFrequency(reproduction.scoped_frequency);
}

function validateSeverityTriage(triage) {
  assertExactKeys(triage, SEVERITY_TRIAGE_KEYS, 'severity_triage');
  assertEnum(triage.declared_level, SEVERITY_LEVELS, 'severity_triage.declared_level');
  assertEnum(triage.priority, PRIORITIES, 'severity_triage.priority');
  if (triage.basis !== 'triage-evidence-only') {
    throw new ValidationError('severity_triage.basis must be triage-evidence-only');
  }
  if (triage.is_truth_claim !== false) {
    throw new ValidationError('severity_triage.is_truth_claim must be false');
  }
}

function validateUncertainty(uncertainty) {
  assertExactKeys(uncertainty, UNCERTAINTY_KEYS, 'uncertainty');
  assertEnum(uncertainty.causal_explanation, CAUSAL_STATES, 'uncertainty.causal_explanation');
  assertStringArray(uncertainty.open_questions, 'uncertainty.open_questions', {
    maxItems: 64,
    itemMax: 512
  });
}

function validateStateBlock(block, name) {
  assertExactKeys(block, STATE_BLOCK_KEYS, name);
  assertEnum(block.state, STATE_BLOCK_STATES, `${name}.state`);
  assertString(block.summary, `${name}.summary`, { min: 1, max: 2048 });
}

function validateDisclosure(disclosure) {
  assertExactKeys(disclosure, DISCLOSURE_KEYS, 'disclosure');
  assertEnum(disclosure.track, DISCLOSURE_TRACKS, 'disclosure.track');
  assertEnum(disclosure.state, DISCLOSURE_STATES, 'disclosure.state');
  if (disclosure.subordinate_to_security_md !== true) {
    throw new ValidationError('disclosure.subordinate_to_security_md must be true');
  }
  if (disclosure.subordinate_to_incident_response !== true) {
    throw new ValidationError('disclosure.subordinate_to_incident_response must be true');
  }
  if (disclosure.automation !== 'none') {
    throw new ValidationError('disclosure.automation must be none');
  }
}

function validateNotification(notification) {
  assertExactKeys(notification, NOTIFICATION_KEYS, 'affected_party_notification');
  assertEnum(notification.state, NOTIFICATION_STATES, 'affected_party_notification.state');
  assertString(notification.summary, 'affected_party_notification.summary', { min: 1, max: 2048 });
}

function validateLineageRef(ref, name) {
  assertExactKeys(ref, LINEAGE_REF_KEYS, name);
  assertId(ref.incident_id, `${name}.incident_id`);
  assertDigest(ref.incident_digest, `${name}.incident_digest`);
}

function validateLineage(lineage) {
  assertExactKeys(lineage, LINEAGE_KEYS, 'lineage');
  const supersedes = assertArray(lineage.supersedes, 'lineage.supersedes', { maxItems: 32 });
  supersedes.forEach((ref, index) => validateLineageRef(ref, `lineage.supersedes[${index}]`));
  const updates = assertArray(lineage.updates, 'lineage.updates', { maxItems: 32 });
  updates.forEach((ref, index) => validateLineageRef(ref, `lineage.updates[${index}]`));
  if (lineage.superseded_by !== null) {
    validateLineageRef(lineage.superseded_by, 'lineage.superseded_by');
  }
}

function validateSensitiveRouting(routing) {
  assertExactKeys(routing, SENSITIVE_ROUTING_KEYS, 'sensitive_evidence_routing');
  if (routing.public_artifact_contains_secrets !== false) {
    throw new ValidationError('sensitive_evidence_routing.public_artifact_contains_secrets must be false');
  }
  assertEnum(routing.routing, SENSITIVE_ROUTING, 'sensitive_evidence_routing.routing');
  assertOptionalId(routing.private_evidence_ref, 'sensitive_evidence_routing.private_evidence_ref');
  if (
    (routing.routing === 'private-ir-channel' || routing.routing === 'security-md-process')
    && routing.private_evidence_ref === null
  ) {
    throw new ValidationError('sensitive_evidence_routing.private_evidence_ref is required for private routing');
  }
  if (routing.routing === 'none' && routing.private_evidence_ref !== null) {
    throw new ValidationError('sensitive_evidence_routing.private_evidence_ref must be null when routing is none');
  }
}

function validateBoundaryConstants(document) {
  const expected = [
    ['authority_effect', 'none'],
    ['assurance_effect', 'evidence-only'],
    ['network_effect', 'none'],
    ['credential_visibility', 'none'],
    ['runtime_activation', false],
    ['selection_effect', 'evidence-only']
  ];
  for (const [field, value] of expected) {
    if (document[field] !== value) {
      throw new ValidationError(`${field} boundary effect is invalid`);
    }
  }
}

function assertNoEmbeddedSecrets(document) {
  const forbidden = [
    /api[_-]?key\s*[:=]/i,
    /bearer\s+[A-Za-z0-9._\-]+/i,
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
    /ghp_[A-Za-z0-9]{20,}/,
    /xox[baprs]-[A-Za-z0-9-]+/
  ];
  const text = JSON.stringify(document);
  for (const pattern of forbidden) {
    if (pattern.test(text)) {
      throw new ValidationError('incident artifact must not embed secrets or credentials');
    }
  }
}

function validateSemantics(document, { verifyDigest = true } = {}) {
  assertExactKeys(document, TOP_LEVEL_KEYS, 'Model Behavior Incident');
  if (document.schema !== SCHEMA) throw new ValidationError(`schema must be ${SCHEMA}`);
  if (document.version !== 0) throw new ValidationError('version must be 0');
  if (document.status !== STATUS) throw new ValidationError(`status must be ${STATUS}`);
  assertId(document.incident_id, 'incident_id');
  validateObservedRange(document.observed_range);
  assertTimestampOrUnknown(document.discovery_at, 'discovery_at');
  validateSubject(document.subject);
  assertEnum(document.lifecycle_stage, LIFECYCLE_STAGES, 'lifecycle_stage');
  validateEnvironment(document.environment);
  assertString(document.expected_boundary, 'expected_boundary', { min: 1, max: 2048 });
  assertString(document.observed_behavior, 'observed_behavior', { min: 1, max: 8192 });

  const classes = assertArray(document.behavior_classes, 'behavior_classes', { minItems: 1, maxItems: 32 });
  const seenClasses = new Set();
  classes.forEach((item, index) => {
    assertEnum(item, BEHAVIOR_CLASSES, `behavior_classes[${index}]`);
    if (seenClasses.has(item)) throw new ValidationError(`behavior_classes contains duplicate ${item}`);
    seenClasses.add(item);
  });

  validateConsequentialEffects(document.consequential_effects);
  validateImpact(document.third_party_or_data_impact);
  validateDetection(document.detection);

  const evidenceRefs = assertArray(document.evidence_refs, 'evidence_refs', { minItems: 1, maxItems: 128 });
  const digests = new Set();
  evidenceRefs.forEach((ref, index) => {
    validateEvidenceRef(ref, index);
    if (digests.has(ref.digest)) {
      throw new ValidationError(`evidence_refs contains duplicate digest ${ref.digest}`);
    }
    digests.add(ref.digest);
  });

  validateReproduction(document.reproduction);
  validateSeverityTriage(document.severity_triage);
  validateUncertainty(document.uncertainty);
  validateStateBlock(document.containment, 'containment');
  validateStateBlock(document.mitigation, 'mitigation');
  validateDisclosure(document.disclosure);
  validateNotification(document.affected_party_notification);
  validateLineage(document.lineage);
  validateSensitiveRouting(document.sensitive_evidence_routing);
  assertTimestamp(document.created_at, 'created_at');
  assertDigest(document.incident_digest, 'incident_digest');
  validateBoundaryConstants(document);
  assertNoEmbeddedSecrets(document);

  if (verifyDigest) {
    const expectedDigest = computeModelBehaviorIncidentDigest(document);
    if (document.incident_digest !== expectedDigest) {
      throw new ValidationError('Model Behavior Incident digest mismatch');
    }
  }
}

export function computeModelBehaviorIncidentDigest(document) {
  validateSemantics(document, { verifyDigest: false });
  const canonical = clone(document);
  canonical.incident_digest = ZERO_DIGEST;
  return digestObject(canonical);
}

export function modelBehaviorIncidentDigest(document) {
  return computeModelBehaviorIncidentDigest(document);
}

export function validateModelBehaviorIncident(document) {
  validateSemantics(document, { verifyDigest: true });
  return deepFreeze({
    valid: true,
    incident_id: document.incident_id,
    incident_digest: document.incident_digest,
    lifecycle_stage: document.lifecycle_stage,
    disclosure_track: document.disclosure.track,
    disclosure_state: document.disclosure.state,
    behavior_classes: clone(document.behavior_classes),
    authority_effect: document.authority_effect,
    assurance_effect: document.assurance_effect,
    network_effect: document.network_effect,
    credential_visibility: document.credential_visibility,
    runtime_activation: document.runtime_activation,
    selection_effect: document.selection_effect
  });
}

/**
 * Append-only supersession: later incident may supersede an original while
 * preserving the original observation artifact and its then-current uncertainty.
 */
export function assertAppendOnlySupersession(original, update) {
  const originalValidated = validateModelBehaviorIncident(original);
  const updateValidated = validateModelBehaviorIncident(update);
  const match = update.lineage.supersedes.find(
    (ref) => ref.incident_id === original.incident_id && ref.incident_digest === original.incident_digest
  );
  if (!match) {
    throw new ValidationError('update must supersede the exact original incident id and digest');
  }
  if (original.lineage.superseded_by !== null) {
    // Original artifact itself stays immutable; callers keep the original bytes.
  }
  if (update.incident_id === original.incident_id) {
    throw new ValidationError('superseding update must use a distinct incident_id');
  }
  if (update.incident_digest === original.incident_digest) {
    throw new ValidationError('superseding update must produce a distinct incident_digest');
  }
  return deepFreeze({
    valid: true,
    original_incident_id: originalValidated.incident_id,
    original_incident_digest: originalValidated.incident_digest,
    update_incident_id: updateValidated.incident_id,
    update_incident_digest: updateValidated.incident_digest,
    original_preserved: true,
    authority_effect: 'none'
  });
}

/**
 * Fail-closed composition: behavioral-assurance-profile incident_events.evidence_refs
 * that look like digests must bind exact model-behavior-incident digests.
 */
export function bindBehavioralProfileIncidentEvidence(profile, incidents) {
  assertPlainObject(profile, 'profile');
  if (!Array.isArray(incidents)) {
    throw new ValidationError('incidents must be an array');
  }
  const byDigest = new Map();
  for (const [index, incident] of incidents.entries()) {
    const validated = validateModelBehaviorIncident(incident);
    if (byDigest.has(validated.incident_digest)) {
      throw new ValidationError(`duplicate incident digest at incidents[${index}]`);
    }
    byDigest.set(validated.incident_digest, validated);
  }

  if (profile.schema !== 'axiom-behavioral-assurance-profile.v0') {
    throw new ValidationError('profile schema must be axiom-behavioral-assurance-profile.v0');
  }
  if (profile.authority_effect !== 'none') {
    throw new ValidationError('profile authority_effect must remain none');
  }

  const bound = [];
  const populations = assertArray(profile.populations, 'profile.populations', { minItems: 1, maxItems: 64 });
  populations.forEach((population, populationIndex) => {
    const events = assertArray(
      population.incident_events,
      `profile.populations[${populationIndex}].incident_events`,
      { maxItems: 128 }
    );
    events.forEach((event, eventIndex) => {
      const refs = assertArray(
        event.evidence_refs,
        `profile.populations[${populationIndex}].incident_events[${eventIndex}].evidence_refs`,
        { minItems: 1, maxItems: 128 }
      );
      refs.forEach((ref, refIndex) => {
        assertString(ref, `evidence_refs[${refIndex}]`, { min: 1, max: 160 });
        if (!DIGEST_PATTERN.test(ref)) {
          // Non-digest opaque ids remain unbound synthetic placeholders (fail-closed for digest bind path).
          return;
        }
        const incident = byDigest.get(ref);
        if (!incident) {
          throw new ValidationError(
            `missing incident artifact for evidence digest ${ref}`
          );
        }
        bound.push({
          population_id: population.population_id,
          event_class: event.event_class,
          evidence_digest: ref,
          incident_id: incident.incident_id,
          incident_digest: incident.incident_digest
        });
      });
    });
  });

  return deepFreeze({
    valid: true,
    bound_incidents: bound,
    authority_effect: 'none',
    assurance_effect: 'evidence-only'
  });
}

/**
 * Population-bounded rate helper: refuses universal prevalence claims.
 */
export function assertPopulationBoundedIncidentRate({
  count,
  population_size,
  population_id,
  population_digest
}) {
  assertInteger(count, 'count', { min: 0 });
  assertInteger(population_size, 'population_size', { min: 1 });
  if (count > population_size) {
    throw new ValidationError('count cannot exceed searched population_size');
  }
  assertId(population_id, 'population_id');
  assertDigest(population_digest, 'population_digest');
  return deepFreeze({
    valid: true,
    count,
    population_size,
    rate: count / population_size,
    population_id,
    population_digest,
    refuses_universal_prevalence: true,
    universal_prevalence_claim: false,
    authority_effect: 'none'
  });
}

export const MODEL_BEHAVIOR_DISCLOSURE_TRACKS = Object.freeze([
  'ready-for-disclosure',
  'minor-investigation',
  'coordinated-slow-investigation'
]);
