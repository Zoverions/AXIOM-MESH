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
  'assessment_at',
  'availability_attestations',
  'persistence_attestations',
  'acquisition_manifests',
  'lineage_manifests',
  'fidelity_evaluations'
];
const OWNER_ADDRESSABLE = new Set(['open-acquired', 'local-proprietary']);
const CASE_RANK = Object.freeze({
  'blocked-no-acceptable-candidate': 1,
  'candidate-available-insufficient-evidence': 2,
  'recoverable-with-degradation': 3,
  'recoverable-high-fidelity': 4
});
const AUTHORITY_BOUNDARY = Object.freeze({
  writes_files: false,
  performs_network_effects: false,
  loads_models: false,
  synchronizes_persistence: false,
  acquires_weights: false,
  performs_substitution: false,
  mutates_topology: false,
  grants_execution_authority: false,
  proves_principal_continuity: false,
  proves_subjective_identity: false
});

export function buildCognitiveRecoveryAssessment(topology, inputs) {
  validateCognitiveTopology(topology);
  validateInputs(inputs);
  const assessmentAtMs = canonicalTimestamp(inputs.assessment_at, 'assessment_at');
  const topologyDigest = cognitiveTopologyDigest(topology);
  const warnings = [];
  const blockers = [];

  const availability = resolveAvailabilityEvidence(topology, inputs.availability_attestations, assessmentAtMs, warnings);
  const persistence = resolvePersistenceEvidence(topology, inputs.persistence_attestations, warnings);
  const acquisitions = resolveAcquisitionEvidence(topology, inputs.acquisition_manifests);
  const lineages = resolveLineageEvidence(topology, inputs.lineage_manifests);
  const fidelity = resolveFidelityEvidence(topology, inputs.fidelity_evaluations, inputs.lineage_manifests);

  const nodes = topology.nodes
    .map(node => buildNodeReport(node, availability.get(node.node_id) ?? [], persistence.get(node.node_id) ?? null, acquisitions.get(node.node_id) ?? null, warnings))
    .sort(compareNodeId);

  const nodeById = new Map(nodes.map(node => [node.node_id, node]));
  const requiredIndeterminate = nodes.some(node => isRequired(node) && node.model_availability === 'indeterminate');
  const unavailableRequired = nodes.filter(node => isRequired(node) && node.model_availability === 'unavailable');

  for (const node of nodes) {
    if (!isRequired(node)) {
      if (node.model_availability === 'unavailable') warnings.push(`optional:${node.node_id}:model-unavailable`);
      else if (node.model_availability === 'indeterminate') warnings.push(`optional:${node.node_id}:model-indeterminate`);
    }
  }

  const recoveryCases = unavailableRequired
    .map(reference => buildRecoveryCase(reference, nodes, lineages, fidelity, warnings, blockers))
    .sort((left, right) => left.reference_node_id.localeCompare(right.reference_node_id));

  let recoveryReadiness;
  if (requiredIndeterminate) {
    recoveryReadiness = 'indeterminate';
  } else if (recoveryCases.length === 0) {
    recoveryReadiness = 'no-recovery-needed';
  } else {
    recoveryReadiness = weakestCaseReadiness(recoveryCases.map(item => item.readiness));
  }

  const body = {
    schema: COGNITIVE_RECOVERY_ASSESSMENT_SCHEMA,
    version: 0,
    status: 'inert-evidence-report',
    topology: {
      topology_id: topology.topology_id,
      topology_digest: topologyDigest
    },
    assessment_at: inputs.assessment_at,
    recovery_readiness: recoveryReadiness,
    blockers: uniqueSorted(blockers),
    warnings: uniqueSorted(warnings),
    nodes,
    recovery_cases: recoveryCases,
    authority_boundary: { ...AUTHORITY_BOUNDARY }
  };
  const report = { ...body, report_digest: digestObject(body) };
  return deepFreeze(report);
}

function validateInputs(inputs) {
  exactObject(inputs, 'Cognitive recovery assessment inputs', INPUT_FIELDS);
  canonicalTimestamp(inputs.assessment_at, 'assessment_at');
  for (const field of INPUT_FIELDS.slice(1)) {
    if (!Array.isArray(inputs[field])) {
      throw new ValidationError(`${field} must be an array`);
    }
  }
}

function resolveAvailabilityEvidence(topology, documents, assessmentAtMs, warnings) {
  const ids = new Set();
  const byNode = new Map();
  for (const document of documents) {
    const resolved = resolveCognitiveAvailabilityAttestation(document, topology);
    if (ids.has(resolved.attestation_id)) {
      throw new ValidationError(`Duplicate cognitive availability attestation ${resolved.attestation_id}`);
    }
    ids.add(resolved.attestation_id);
    const stale = assessmentAtMs > Date.parse(resolved.valid_until);
    const summary = {
      attestation_id: resolved.attestation_id,
      attestation_digest: resolved.attestation_digest,
      availability: resolved.availability,
      observation_mode: resolved.observation_mode,
      evidence_class: resolved.evidence_class,
      artifact_match: resolved.artifact_match,
      observer_ref: resolved.observer_ref,
      evidence_ref: resolved.evidence_ref,
      evidence_digest: resolved.evidence_digest,
      observed_at: resolved.observed_at,
      valid_until: resolved.valid_until,
      stale
    };
    if (stale) warnings.push(`availability:${resolved.node_id}:stale:${resolved.attestation_id}`);
    if (!byNode.has(resolved.node_id)) byNode.set(resolved.node_id, []);
    byNode.get(resolved.node_id).push(summary);
  }
  for (const evidence of byNode.values()) evidence.sort((a, b) => a.attestation_id.localeCompare(b.attestation_id));
  return byNode;
}

function resolvePersistenceEvidence(topology, documents, warnings) {
  const byNode = new Map();
  const ids = new Set();
  for (const document of documents) {
    const resolved = resolvePersistenceAttestation(document, topology);
    if (byNode.has(resolved.node_id)) {
      throw new ValidationError(`Duplicate persistence evidence for node ${resolved.node_id}`);
    }
    if (ids.has(resolved.attestation_id)) {
      throw new ValidationError(`Duplicate persistence evidence attestation ${resolved.attestation_id}`);
    }
    ids.add(resolved.attestation_id);
    byNode.set(resolved.node_id, {
      attestation_id: resolved.attestation_id,
      attestation_digest: resolved.attestation_digest,
      mode: resolved.persistence_mode,
      provider_id: resolved.provider_id,
      state_ref: resolved.state_ref,
      declared_exportability: resolved.declared_exportability,
      availability: resolved.availability,
      observed_exportability: resolved.observed_exportability,
      evidence_kind: resolved.evidence_kind,
      evidence_ref: document.evidence.evidence_ref,
      evidence_digest: document.evidence.evidence_digest
    });
  }
  for (const node of topology.nodes) {
    if (node.persistence.mode !== 'none' && !byNode.has(node.node_id)) {
      warnings.push(`persistence:${node.node_id}:unknown`);
    }
  }
  return byNode;
}

function resolveAcquisitionEvidence(topology, documents) {
  const byNode = new Map();
  const ids = new Set();
  for (const document of documents) {
    const resolved = resolveModelAcquisitionManifest(document, topology);
    if (byNode.has(resolved.node_id)) {
      throw new ValidationError(`Duplicate acquisition evidence for node ${resolved.node_id}`);
    }
    if (ids.has(resolved.acquisition_id)) {
      throw new ValidationError(`Duplicate acquisition evidence ${resolved.acquisition_id}`);
    }
    ids.add(resolved.acquisition_id);
    byNode.set(resolved.node_id, {
      acquisition_id: resolved.acquisition_id,
      acquisition_digest: resolved.acquisition_digest,
      artifact_digest: resolved.artifact_digest,
      custody_mode: resolved.custody_mode
    });
  }
  return byNode;
}

function resolveLineageEvidence(topology, documents) {
  const ids = new Set();
  const byPair = new Map();
  for (const document of documents) {
    const resolved = resolveCognitiveLineageManifest(document, topology);
    if (ids.has(resolved.lineage_id)) {
      throw new ValidationError(`Duplicate cognitive lineage ${resolved.lineage_id}`);
    }
    ids.add(resolved.lineage_id);
    const key = pairKey(resolved.source.node_id, resolved.destination.node_id);
    if (!byPair.has(key)) byPair.set(key, []);
    byPair.get(key).push({
      lineage_id: resolved.lineage_id,
      lineage_digest: resolved.lineage_digest,
      relationship: resolved.relationship
    });
  }
  for (const values of byPair.values()) values.sort((a, b) => a.lineage_id.localeCompare(b.lineage_id));
  return byPair;
}

function resolveFidelityEvidence(topology, documents, lineageDocuments) {
  const ids = new Set();
  const byPair = new Map();
  for (const document of documents) {
    const resolved = resolveReplacementFidelityEvaluation(document, topology, lineageDocuments);
    if (ids.has(resolved.evaluation_id)) {
      throw new ValidationError(`Duplicate replacement fidelity evaluation ${resolved.evaluation_id}`);
    }
    ids.add(resolved.evaluation_id);
    const key = pairKey(resolved.reference.node_id, resolved.candidate.node_id);
    if (!byPair.has(key)) byPair.set(key, []);
    byPair.get(key).push({
      evaluation_id: resolved.evaluation_id,
      evaluation_digest: resolved.evaluation_digest,
      aggregate_class: resolved.aggregate_class,
      suite_id: resolved.suite_id,
      suite_digest: resolved.suite_digest
    });
  }
  for (const values of byPair.values()) values.sort((a, b) => a.evaluation_id.localeCompare(b.evaluation_id));
  return byPair;
}

function buildNodeReport(node, availabilityEvidence, persistenceEvidence, acquisitionEvidence, warnings) {
  const fresh = availabilityEvidence.filter(item => !item.stale);
  const artifactMismatch = fresh.some(item => item.availability === 'available' && item.artifact_match === false);
  if (artifactMismatch) warnings.push(`availability:${node.node_id}:artifact-digest-mismatch`);

  const states = new Set();
  for (const item of fresh) {
    if (item.availability === 'available' && item.artifact_match === false) states.add('indeterminate');
    else states.add(item.availability);
  }
  let modelAvailability;
  if (states.size === 0) modelAvailability = 'indeterminate';
  else if (states.size === 1) modelAvailability = [...states][0];
  else {
    modelAvailability = 'indeterminate';
    warnings.push(`availability:${node.node_id}:conflict`);
  }

  const persistence = node.persistence.mode === 'none'
    ? {
        mode: 'none', provider_id: null, state_ref: null,
        declared_exportability: node.persistence.exportability,
        availability: 'not-applicable', observed_exportability: null,
        attestation_id: null, attestation_digest: null, evidence_kind: null, evidence_ref: null, evidence_digest: null
      }
    : persistenceEvidence ?? {
        mode: node.persistence.mode, provider_id: node.persistence.provider_id, state_ref: node.persistence.state_ref,
        declared_exportability: node.persistence.exportability,
        availability: 'unknown', observed_exportability: 'unknown',
        attestation_id: null, attestation_digest: null, evidence_kind: null, evidence_ref: null, evidence_digest: null
      };

  let sovereigntyState;
  if (node.persistence.mode === 'mirrored') sovereigntyState = 'mirrored';
  else if (node.custody === 'provider-controlled') sovereigntyState = 'provider-dependent';
  else if (node.custody === 'shared') sovereigntyState = 'shared-dependent';
  else if (OWNER_ADDRESSABLE.has(node.weights.state)) {
    if (artifactMismatch) sovereigntyState = 'artifact-digest-mismatch';
    else if (acquisitionEvidence && modelAvailability === 'available') sovereigntyState = 'verified-owner-artifact';
    else sovereigntyState = 'declared-owner-artifact-unverified';
  } else sovereigntyState = 'owner-controlled';

  return {
    node_id: node.node_id,
    model_id: node.model_id,
    engagement: node.engagement,
    topology_role: node.topology_role,
    access_mode: node.access_mode,
    custody: node.custody,
    weight_state: node.weights.state,
    continuity_importance: node.continuity_importance,
    fidelity_importance: node.fidelity_importance,
    model_availability: modelAvailability,
    availability_evidence: availabilityEvidence.map(item => ({ ...item })),
    persistence: { ...persistence },
    acquisition: acquisitionEvidence ? { ...acquisitionEvidence } : null,
    sovereignty_state: sovereigntyState
  };
}

function buildRecoveryCase(reference, nodes, lineages, fidelity, warnings, blockers) {
  const candidates = nodes
    .filter(candidate => candidate.node_id !== reference.node_id && candidate.model_availability === 'available')
    .map(candidate => buildCandidate(reference, candidate, lineages, fidelity, warnings))
    .sort((a, b) => a.candidate_node_id.localeCompare(b.candidate_node_id));

  let readiness;
  if (candidates.length === 0) readiness = 'blocked-no-acceptable-candidate';
  else readiness = bestCandidateReadiness(candidates.map(candidate => candidate.readiness));

  if (readiness === 'blocked-no-acceptable-candidate') {
    blockers.push(`recovery:${reference.node_id}:no-acceptable-candidate`);
  }

  return {
    reference_node_id: reference.node_id,
    reference_model_id: reference.model_id,
    readiness,
    candidates
  };
}

function buildCandidate(reference, candidate, lineages, fidelity, warnings) {
  const key = pairKey(reference.node_id, candidate.node_id);
  const matchingLineages = lineages.get(key) ?? [];
  const matchingEvaluations = fidelity.get(key) ?? [];

  const lineageSummary = summarizeLineage(matchingLineages);
  const fidelitySummary = summarizeFidelity(matchingEvaluations);
  let readiness;
  if (matchingLineages.length === 0 || matchingEvaluations.length === 0 || fidelitySummary.aggregate_class === 'conflict') {
    readiness = 'candidate-available-insufficient-evidence';
  } else if (fidelitySummary.aggregate_class === 'high-fidelity') {
    readiness = 'recoverable-high-fidelity';
  } else if (fidelitySummary.aggregate_class === 'acceptable-with-degradation') {
    readiness = 'recoverable-with-degradation';
  } else if (fidelitySummary.aggregate_class === 'insufficient-evidence') {
    readiness = 'candidate-available-insufficient-evidence';
  } else {
    readiness = 'blocked-no-acceptable-candidate';
  }

  if (readiness === 'candidate-available-insufficient-evidence') {
    warnings.push(`recovery:${reference.node_id}:candidate-insufficient:${candidate.node_id}`);
  }

  return {
    candidate_node_id: candidate.node_id,
    candidate_model_id: candidate.model_id,
    readiness,
    sovereignty_state: candidate.sovereignty_state,
    lineage: lineageSummary,
    fidelity: fidelitySummary
  };
}

function summarizeLineage(values) {
  if (values.length === 0) {
    return { relationship: 'missing', lineage_ids: [], lineage_digests: [] };
  }
  const relationships = uniqueSorted(values.map(value => value.relationship));
  return {
    relationship: relationships.length === 1 ? relationships[0] : 'conflict',
    lineage_ids: values.map(value => value.lineage_id),
    lineage_digests: values.map(value => value.lineage_digest)
  };
}

function summarizeFidelity(values) {
  if (values.length === 0) {
    return { aggregate_class: 'missing', evaluation_ids: [], evaluation_digests: [] };
  }
  const classes = uniqueSorted(values.map(value => value.aggregate_class));
  return {
    aggregate_class: classes.length === 1 ? classes[0] : 'conflict',
    evaluation_ids: values.map(value => value.evaluation_id),
    evaluation_digests: values.map(value => value.evaluation_digest)
  };
}

function bestCandidateReadiness(values) {
  return [...values].sort((a, b) => CASE_RANK[b] - CASE_RANK[a])[0];
}

function weakestCaseReadiness(values) {
  return [...values].sort((a, b) => CASE_RANK[a] - CASE_RANK[b])[0];
}

function isRequired(node) {
  return node.continuity_importance !== 'optional' || node.fidelity_importance !== 'optional';
}

function pairKey(source, destination) {
  return `${source}\u0000${destination}`;
}

function compareNodeId(left, right) {
  return left.node_id.localeCompare(right.node_id);
}

function uniqueSorted(values) {
  return [...new Set(values)].sort();
}

function exactObject(value, label, fields) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError(`${label} must be an object`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new ValidationError(`${label} must be a plain object`);
  }
  const allowed = new Set(fields);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new ValidationError(`${label} contains unknown field ${key}`);
  }
  for (const key of fields) {
    if (!Object.hasOwn(value, key)) throw new ValidationError(`${label} is missing required field ${key}`);
  }
}

function canonicalTimestamp(value, label) {
  if (typeof value !== 'string') throw new ValidationError(`${label} must be a canonical ISO timestamp`);
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new ValidationError(`${label} must be a canonical ISO timestamp`);
  }
  return parsed.getTime();
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
