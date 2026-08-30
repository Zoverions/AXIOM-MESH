import { digestObject, ValidationError } from './canonical.mjs';
import { resolveCognitiveAvailabilityAttestation } from './cognitive-availability-attestation.mjs';
import { resolveCognitiveLineageManifest } from './cognitive-lineage-manifest.mjs';
import {
  cognitiveTopologyDigest,
  validateCognitiveTopology
} from './cognitive-topology.mjs';
import { resolveModelAcquisitionManifest } from './model-acquisition-manifest.mjs';
import { resolvePersistenceAttestation } from './persistence-attestation.mjs';
import { resolveReplacementFidelityEvaluation } from './replacement-fidelity-evaluation.mjs';

export const COGNITIVE_RECOVERY_ASSESSMENT_SCHEMA = 'axiom-cognitive-recovery-assessment.v0';

const INPUT_FIELDS = [
  'assessed_at',
  'availability_attestations',
  'acquisition_manifests',
  'persistence_attestations',
  'lineage_manifests',
  'fidelity_evaluations'
];
const ACQUIRED_WEIGHT_STATES = new Set(['open-acquired', 'local-proprietary']);
const OWNER_CUSTODY = new Set(['owner-local', 'owner-remote']);
const AUTHORITY_BOUNDARY = Object.freeze({
  writes_files: false,
  performs_network_effects: false,
  loads_models: false,
  switches_models: false,
  synchronizes_persistence: false,
  acquires_weights: false,
  trains_models: false,
  grants_execution_authority: false,
  mutates_topology: false,
  proves_principal_continuity: false,
  proves_subjective_identity: false
});

export function buildCognitiveRecoveryAssessment(topology, inputs) {
  validateCognitiveTopology(topology);
  validateInputs(inputs);
  const assessedAt = date(inputs.assessed_at, 'assessed_at');
  const topologyDigest = cognitiveTopologyDigest(topology);

  const availability = indexAvailability(inputs.availability_attestations, topology, assessedAt);
  const acquisitions = indexAcquisitions(inputs.acquisition_manifests, topology, assessedAt);
  const persistence = indexPersistence(inputs.persistence_attestations, topology, assessedAt);
  const lineages = indexLineages(inputs.lineage_manifests, topology, assessedAt);
  const fidelity = indexFidelity(inputs.fidelity_evaluations, topology, lineages, assessedAt);

  const blockers = [];
  const warnings = [];
  const conflicts = [];
  const continuityIssues = [];
  const fidelityIssues = [];
  const availabilityIssues = [];

  const nodes = [...topology.nodes]
    .sort((left, right) => compareCodeUnits(left.node_id, right.node_id))
    .map(node => {
      const modelEvidence = summarizeAvailability(node, availability.get(node.node_id) ?? [], conflicts, warnings);
      const persistenceEvidence = summarizePersistence(node, persistence.get(node.node_id) ?? [], conflicts, warnings);

      applyDependencyIssue({
        axis: 'availability',
        importance: strongestImportance(node.continuity_importance, node.fidelity_importance),
        node,
        kind: 'model',
        state: modelEvidence.state,
        blockers,
        warnings,
        issues: availabilityIssues
      });
      applyDependencyIssue({
        axis: 'continuity',
        importance: node.continuity_importance,
        node,
        kind: 'model',
        state: modelEvidence.state,
        blockers,
        warnings,
        issues: continuityIssues
      });
      applyDependencyIssue({
        axis: 'fidelity',
        importance: node.fidelity_importance,
        node,
        kind: 'model',
        state: modelEvidence.state,
        blockers,
        warnings,
        issues: fidelityIssues
      });

      if (node.persistence.mode !== 'none') {
        applyDependencyIssue({
          axis: 'continuity',
          importance: node.continuity_importance,
          node,
          kind: 'persistence',
          state: persistenceEvidence.state,
          blockers,
          warnings,
          issues: continuityIssues
        });
        applyDependencyIssue({
          axis: 'fidelity',
          importance: node.fidelity_importance,
          node,
          kind: 'persistence',
          state: persistenceEvidence.state,
          blockers,
          warnings,
          issues: fidelityIssues
        });
      }

      const nodeAcquisitions = acquisitions.get(node.node_id) ?? [];
      const sovereigntyState = deriveSovereigntyState(node, modelEvidence, nodeAcquisitions);

      return {
        node_id: node.node_id,
        model_id: node.model_id,
        engagement: node.engagement,
        topology_role: node.topology_role,
        custody: node.custody,
        weight_state: node.weights.state,
        model_availability: modelEvidence.state,
        availability_attestation_ids: modelEvidence.attestation_ids,
        continuity_importance: node.continuity_importance,
        fidelity_importance: node.fidelity_importance,
        sovereignty_state: sovereigntyState,
        acquisition_manifest_ids: nodeAcquisitions.map(item => item.acquisition_id),
        persistence_mode: node.persistence.mode,
        persistence_availability: persistenceEvidence.state,
        persistence_attestation_ids: persistenceEvidence.attestation_ids,
        declared_exportability: node.persistence.exportability,
        observed_exportability: persistenceEvidence.observed_exportability
      };
    });

  const candidates = buildCandidates(nodes, lineages, fidelity, warnings, blockers);
  const cognitiveAvailabilityStatus = aggregateAvailability(availabilityIssues);
  const cognitiveContinuityStatus = aggregateAxis(continuityIssues);
  const cognitiveFidelityStatus = aggregateAxis(fidelityIssues);
  const cognitiveSovereigntyStatus = aggregateSovereignty(nodes);
  const recoveryReadinessStatus = deriveRecoveryReadiness({
    nodes,
    candidates,
    cognitiveAvailabilityStatus,
    cognitiveContinuityStatus,
    cognitiveFidelityStatus,
    conflicts
  });

  sortNotices(blockers);
  sortNotices(warnings);
  conflicts.sort((left, right) => {
    const node = compareCodeUnits(left.node_id, right.node_id);
    if (node !== 0) return node;
    return compareCodeUnits(left.conflict_type, right.conflict_type);
  });

  const body = {
    schema: COGNITIVE_RECOVERY_ASSESSMENT_SCHEMA,
    version: 0,
    status: 'inert-evidence-report',
    assessed_at: inputs.assessed_at,
    topology: {
      topology_id: topology.topology_id,
      topology_digest: topologyDigest
    },
    cognitive_availability_status: cognitiveAvailabilityStatus,
    cognitive_continuity_status: cognitiveContinuityStatus,
    cognitive_fidelity_status: cognitiveFidelityStatus,
    cognitive_sovereignty_status: cognitiveSovereigntyStatus,
    recovery_readiness_status: recoveryReadinessStatus,
    blockers,
    warnings,
    conflicts,
    nodes,
    candidates,
    authority_boundary: AUTHORITY_BOUNDARY
  };

  return deepFreeze({
    ...body,
    report_digest: digestObject(body)
  });
}

function validateInputs(inputs) {
  exactObject(inputs, 'Cognitive recovery assessment inputs', INPUT_FIELDS);
  date(inputs.assessed_at, 'assessed_at');
  boundedArray(inputs.availability_attestations, 'availability_attestations', 128);
  boundedArray(inputs.acquisition_manifests, 'acquisition_manifests', 128);
  boundedArray(inputs.persistence_attestations, 'persistence_attestations', 128);
  boundedArray(inputs.lineage_manifests, 'lineage_manifests', 128);
  boundedArray(inputs.fidelity_evaluations, 'fidelity_evaluations', 128);
}

function indexAvailability(items, topology, assessedAt) {
  const seen = new Set();
  const byNode = new Map();
  for (const item of items) {
    const resolved = resolveCognitiveAvailabilityAttestation(item, topology);
    uniqueId(seen, resolved.attestation_id, 'availability attestation');
    ensureRecordedBy(item.recorded_at, assessedAt, 'availability attestation');
    const entry = {
      ...resolved,
      fresh: date(item.valid_until, 'availability valid_until') >= assessedAt
    };
    pushGrouped(byNode, resolved.node_id, entry);
  }
  sortGrouped(byNode, item => item.attestation_id);
  return byNode;
}

function indexAcquisitions(items, topology, assessedAt) {
  const seen = new Set();
  const byNode = new Map();
  for (const item of items) {
    const resolved = resolveModelAcquisitionManifest(item, topology);
    uniqueId(seen, resolved.acquisition_id, 'acquisition manifest');
    ensureRecordedBy(item.recorded_at, assessedAt, 'acquisition manifest');
    pushGrouped(byNode, resolved.node_id, resolved);
  }
  sortGrouped(byNode, item => item.acquisition_id);
  return byNode;
}

function indexPersistence(items, topology, assessedAt) {
  const seen = new Set();
  const byNode = new Map();
  for (const item of items) {
    const resolved = resolvePersistenceAttestation(item, topology);
    uniqueId(seen, resolved.attestation_id, 'persistence attestation');
    ensureRecordedBy(item.recorded_at, assessedAt, 'persistence attestation');
    pushGrouped(byNode, resolved.node_id, resolved);
  }
  sortGrouped(byNode, item => item.attestation_id);
  return byNode;
}

function indexLineages(items, topology, assessedAt) {
  const seen = new Set();
  const byId = new Map();
  for (const item of items) {
    const resolved = resolveCognitiveLineageManifest(item, topology);
    uniqueId(seen, resolved.lineage_id, 'lineage manifest');
    ensureRecordedBy(item.recorded_at, assessedAt, 'lineage manifest');
    byId.set(resolved.lineage_id, resolved);
  }
  return byId;
}

function indexFidelity(items, topology, lineages, assessedAt) {
  const seen = new Set();
  const byLineage = new Map();
  const unbound = [];
  for (const item of items) {
    uniqueId(seen, item?.evaluation_id, 'fidelity evaluation');
    ensureRecordedBy(item?.recorded_at, assessedAt, 'fidelity evaluation');
    const lineageId = item?.candidate?.lineage_id ?? null;
    const lineage = lineageId === null ? null : (lineages.get(lineageId) ?? null);
    const resolved = resolveReplacementFidelityEvaluation(item, topology, lineage);
    if (lineageId !== null && lineage === null) {
      unbound.push(resolved);
      continue;
    }
    if (lineageId === null) {
      unbound.push(resolved);
      continue;
    }
    if (byLineage.has(lineageId)) {
      throw new ValidationError(`multiple fidelity evaluations bind lineage ${lineageId}`);
    }
    byLineage.set(lineageId, resolved);
  }
  return { byLineage, unbound };
}

function summarizeAvailability(node, entries, conflicts, warnings) {
  const ids = entries.map(item => item.attestation_id);
  const fresh = entries.filter(item => item.fresh);
  if (fresh.length === 0) {
    if (entries.length > 0) {
      warnings.push(notice('availability-stale', node.node_id));
      return { state: 'stale', attestation_ids: ids };
    }
    return { state: 'indeterminate', attestation_ids: ids };
  }

  const values = uniqueSorted(fresh.map(item => item.availability));
  if (values.length > 1) {
    conflicts.push({
      node_id: node.node_id,
      conflict_type: 'availability-conflict',
      attestation_ids: fresh.map(item => item.attestation_id).sort(compareCodeUnits),
      observed_values: values
    });
    return { state: 'conflict', attestation_ids: ids };
  }
  return { state: values[0], attestation_ids: ids };
}

function summarizePersistence(node, entries, conflicts, warnings) {
  if (node.persistence.mode === 'none') {
    return {
      state: 'not-applicable',
      attestation_ids: [],
      observed_exportability: 'none'
    };
  }
  const ids = entries.map(item => item.attestation_id);
  if (entries.length === 0) {
    return {
      state: 'unknown',
      attestation_ids: ids,
      observed_exportability: 'unknown'
    };
  }

  const availabilityValues = uniqueSorted(entries.map(item => item.availability));
  if (availabilityValues.length > 1) {
    conflicts.push({
      node_id: node.node_id,
      conflict_type: 'persistence-conflict',
      attestation_ids: ids,
      observed_values: availabilityValues
    });
    warnings.push(notice('persistence-conflict', node.node_id));
    return {
      state: 'conflict',
      attestation_ids: ids,
      observed_exportability: 'unknown'
    };
  }

  const exportabilityValues = uniqueSorted(entries.map(item => item.observed_exportability));
  return {
    state: availabilityValues[0],
    attestation_ids: ids,
    observed_exportability: exportabilityValues.length === 1 ? exportabilityValues[0] : 'unknown'
  };
}

function deriveSovereigntyState(node, modelEvidence, acquisitions) {
  if (node.persistence.mode === 'mirrored') return 'mirrored';
  if (node.custody === 'provider-controlled') return 'provider-dependent';
  if (node.custody === 'shared') return 'shared-dependent';

  if (OWNER_CUSTODY.has(node.custody) && ACQUIRED_WEIGHT_STATES.has(node.weights.state)) {
    if (acquisitions.length === 0) return 'unverified';
    if (modelEvidence.state !== 'available') return 'unverified';
    return 'owner-controlled';
  }
  return 'owner-controlled';
}

function applyDependencyIssue({ axis, importance, node, kind, state, blockers, warnings, issues }) {
  if (state === 'available' || state === 'not-applicable') return;
  const issue = { importance, state, node_id: node.node_id, kind };
  issues.push(issue);

  if (importance === 'optional') {
    warnings.push(notice(`optional-${kind}-${state}`, node.node_id));
    return;
  }

  if (importance === 'critical' && state === 'unavailable') {
    const code = `critical-${kind}-unavailable`;
    if (axis !== 'availability' || kind === 'model') addUniqueNotice(blockers, notice(code, node.node_id));
    return;
  }

  if (axis === 'availability' && state === 'unavailable') {
    warnings.push(notice(`${importance}-${kind}-unavailable`, node.node_id));
    return;
  }
  warnings.push(notice(`${axis}-${kind}-${state}`, node.node_id));
}

function aggregateAvailability(issues) {
  const relevant = issues.filter(item => item.importance !== 'optional');
  if (relevant.some(item => item.importance === 'critical' && item.state === 'unavailable')) {
    return 'blocked';
  }
  if (relevant.some(item => ['conflict', 'stale', 'indeterminate', 'unknown'].includes(item.state))) {
    return 'indeterminate';
  }
  if (relevant.some(item => item.state === 'unavailable')) return 'degraded';
  return 'available';
}

function aggregateAxis(issues) {
  const relevant = issues.filter(item => item.importance !== 'optional');
  if (relevant.some(item => item.importance === 'critical' && item.state === 'unavailable')) {
    return 'blocked';
  }
  if (relevant.length > 0) return 'degraded';
  return 'full';
}

function aggregateSovereignty(nodes) {
  const states = new Set(nodes.map(node => node.sovereignty_state));
  if (states.has('unverified')) return 'unverified';
  if (states.size === 1 && states.has('owner-controlled')) return 'owner-controlled';
  if (states.size === 1 && states.has('provider-dependent')) return 'provider-dependent';
  return 'mixed';
}

function buildCandidates(nodes, lineages, fidelity, warnings, blockers) {
  const nodeById = new Map(nodes.map(node => [node.node_id, node]));
  const candidates = [];
  const ordered = [...lineages.values()].sort((left, right) => compareCodeUnits(left.lineage_id, right.lineage_id));

  for (const lineage of ordered) {
    const referenceNode = nodeById.get(lineage.reference.node_id);
    if (!referenceNode || referenceNode.model_availability !== 'unavailable') continue;
    const evaluation = fidelity.byLineage.get(lineage.lineage_id) ?? null;
    const aggregate = evaluation?.aggregate_fidelity ?? null;

    if (lineage.assurance_class !== 'verified') {
      warnings.push(notice('candidate-lineage-unverified', referenceNode.node_id));
    }
    if (aggregate === 'acceptable-with-degradation') {
      warnings.push(notice('candidate-fidelity-degraded', referenceNode.node_id));
    }
    if (aggregate === 'materially-degraded' || aggregate === 'incompatible') {
      addUniqueNotice(blockers, notice('candidate-fidelity-incompatible', referenceNode.node_id));
    }

    candidates.push({
      reference_node_id: lineage.reference.node_id,
      reference_model_id: lineage.reference.model_id,
      candidate_node_id: lineage.candidate.node_id,
      candidate_model_id: lineage.candidate.model_id,
      candidate_artifact_digest: lineage.candidate.artifact_digest,
      relationship: lineage.relationship,
      lineage_id: lineage.lineage_id,
      lineage_assurance_class: lineage.assurance_class,
      fidelity_evaluation_id: evaluation?.evaluation_id ?? null,
      aggregate_fidelity: aggregate,
      confidence: evaluation?.confidence ?? null,
      candidate_active: false
    });
  }
  return candidates;
}

function deriveRecoveryReadiness({
  nodes,
  candidates,
  cognitiveAvailabilityStatus,
  cognitiveContinuityStatus,
  cognitiveFidelityStatus,
  conflicts
}) {
  const impaired = nodes.filter(node =>
    node.model_availability !== 'available'
    || (node.persistence_availability !== 'available' && node.persistence_availability !== 'not-applicable')
  );
  const relevantImpaired = impaired.filter(node =>
    node.continuity_importance !== 'optional' || node.fidelity_importance !== 'optional'
  );

  if (
    relevantImpaired.length === 0
    && cognitiveAvailabilityStatus === 'available'
    && cognitiveContinuityStatus === 'full'
    && cognitiveFidelityStatus === 'full'
  ) return 'ready-no-substitution';

  if (conflicts.length > 0 || cognitiveAvailabilityStatus === 'indeterminate') {
    return 'insufficient-evidence';
  }

  const unavailableModels = relevantImpaired.filter(node => node.model_availability === 'unavailable');
  const persistenceFailures = relevantImpaired.filter(node => node.persistence_availability === 'unavailable');
  if (persistenceFailures.length > 0 && unavailableModels.length === 0) {
    return 'no-supported-recovery-path';
  }

  if (unavailableModels.length === 0) return 'insufficient-evidence';

  const candidateByReference = new Map();
  for (const candidate of candidates) {
    if (!candidateByReference.has(candidate.reference_node_id)) candidateByReference.set(candidate.reference_node_id, []);
    candidateByReference.get(candidate.reference_node_id).push(candidate);
  }

  for (const node of unavailableModels) {
    const nodeCandidates = candidateByReference.get(node.node_id) ?? [];
    if (nodeCandidates.length === 0) return 'no-supported-recovery-path';
    if (nodeCandidates.every(item => item.lineage_assurance_class !== 'verified')) return 'insufficient-evidence';
    if (nodeCandidates.every(item => item.aggregate_fidelity === null || item.aggregate_fidelity === 'insufficient-evidence')) {
      return 'insufficient-evidence';
    }
    if (nodeCandidates.every(item => ['materially-degraded', 'incompatible'].includes(item.aggregate_fidelity))) {
      return 'no-supported-recovery-path';
    }
  }

  const supported = unavailableModels.flatMap(node => candidateByReference.get(node.node_id) ?? [])
    .filter(item => item.lineage_assurance_class === 'verified');
  if (supported.some(item => item.aggregate_fidelity === 'high-fidelity')) {
    if (unavailableModels.every(node =>
      (candidateByReference.get(node.node_id) ?? []).some(item =>
        item.lineage_assurance_class === 'verified' && item.aggregate_fidelity === 'high-fidelity'
      )
    )) return 'ready-with-candidate-evidence';
  }
  if (unavailableModels.every(node =>
    (candidateByReference.get(node.node_id) ?? []).some(item =>
      item.lineage_assurance_class === 'verified'
      && ['high-fidelity', 'acceptable-with-degradation'].includes(item.aggregate_fidelity)
    )
  )) return 'recoverable-with-degradation';

  return 'insufficient-evidence';
}

function strongestImportance(left, right) {
  const rank = { optional: 0, important: 1, critical: 2 };
  return rank[left] >= rank[right] ? left : right;
}

function ensureRecordedBy(value, assessedAt, label) {
  if (date(value, `${label} recorded_at`) > assessedAt) {
    throw new ValidationError(`${label} recorded_at cannot follow assessed_at`);
  }
}

function uniqueId(seen, value, label) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new ValidationError(`${label} identity is invalid`);
  }
  if (seen.has(value)) throw new ValidationError(`duplicate ${label} identity ${value}`);
  seen.add(value);
}

function pushGrouped(map, key, value) {
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(value);
}

function sortGrouped(map, selector) {
  for (const values of map.values()) {
    values.sort((left, right) => compareCodeUnits(selector(left), selector(right)));
  }
}

function uniqueSorted(values) {
  return [...new Set(values)].sort(compareCodeUnits);
}

function notice(code, nodeId) {
  return { code, node_id: nodeId };
}

function addUniqueNotice(items, value) {
  if (!items.some(item => item.code === value.code && item.node_id === value.node_id)) items.push(value);
}

function sortNotices(items) {
  items.sort((left, right) => {
    const node = compareCodeUnits(left.node_id ?? '', right.node_id ?? '');
    if (node !== 0) return node;
    return compareCodeUnits(left.code, right.code);
  });
}

function exactObject(value, label, allowedFields) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError(`${label} must be an object`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new ValidationError(`${label} must be a plain object`);
  }
  const allowed = new Set(allowedFields);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new ValidationError(`${label} contains unknown field ${key}`);
  }
  for (const key of allowedFields) {
    if (!Object.hasOwn(value, key)) throw new ValidationError(`${label} is missing required field ${key}`);
  }
}

function boundedArray(value, label, maxItems) {
  if (!Array.isArray(value) || value.length > maxItems) {
    throw new ValidationError(`${label} must be an array with at most ${maxItems} items`);
  }
}

function date(value, label) {
  if (typeof value !== 'string' || value.length > 64) {
    throw new ValidationError(`${label} must be a canonical ISO timestamp`);
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new ValidationError(`${label} must be a canonical ISO timestamp`);
  }
  return parsed.getTime();
}

function compareCodeUnits(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
