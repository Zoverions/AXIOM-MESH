import { digestObject, ValidationError } from './canonical.mjs';
import {
  cognitiveTopologyDigest,
  validateCognitiveTopology
} from './cognitive-topology.mjs';
import { resolveModelAcquisitionManifest } from './model-acquisition-manifest.mjs';
import { resolvePersistenceAttestation } from './persistence-attestation.mjs';

export const COGNITIVE_CONTINUITY_REPORT_SCHEMA = 'axiom-cognitive-continuity-report.v0';

const DIGEST = /^[a-f0-9]{64}$/;
const AVAILABILITY = new Set(['available', 'unavailable', 'unknown']);
const ACQUIRED_WEIGHT_STATES = new Set(['open-acquired', 'local-proprietary']);
const OWNER_CUSTODY = new Set(['owner-local', 'owner-remote']);

const AUTHORITY_BOUNDARY = Object.freeze({
  writes_files: false,
  performs_network_effects: false,
  loads_models: false,
  synchronizes_persistence: false,
  acquires_weights: false,
  grants_execution_authority: false,
  proves_principal_continuity: false,
  proves_subjective_identity: false
});

export function buildCognitiveContinuityReport(topology, inputs) {
  validateCognitiveTopology(topology);
  validateInputs(inputs);

  const topologyDigest = cognitiveTopologyDigest(topology);
  const nodesById = new Map(topology.nodes.map(node => [node.node_id, node]));
  const observations = indexModelObservations(inputs.model_observations, nodesById);
  const acquisitions = indexAcquisitions(inputs.acquisition_manifests, topology);
  const persistence = indexPersistence(inputs.persistence_attestations, topology);

  const blockers = [];
  const warnings = [];
  const nodes = [...topology.nodes]
    .sort((left, right) => left.node_id.localeCompare(right.node_id))
    .map(node => {
      const observation = observations.get(node.node_id) ?? null;
      const modelAvailability = observation?.availability ?? 'unknown';
      const persistenceEvidence = persistence.get(node.node_id) ?? null;
      const persistenceAvailability = node.persistence.mode === 'none'
        ? 'not-applicable'
        : (persistenceEvidence?.availability ?? 'unknown');

      applyDependencyStatus({
        axis: 'continuity',
        importance: node.continuity_importance,
        nodeId: node.node_id,
        kind: 'model',
        availability: modelAvailability,
        blockers,
        warnings
      });
      applyDependencyStatus({
        axis: 'fidelity',
        importance: node.fidelity_importance,
        nodeId: node.node_id,
        kind: 'model',
        availability: modelAvailability,
        blockers,
        warnings
      });

      if (node.persistence.mode !== 'none') {
        applyDependencyStatus({
          axis: 'continuity',
          importance: node.continuity_importance,
          nodeId: node.node_id,
          kind: 'persistence',
          availability: persistenceAvailability,
          blockers,
          warnings
        });
        applyDependencyStatus({
          axis: 'fidelity',
          importance: node.fidelity_importance,
          nodeId: node.node_id,
          kind: 'persistence',
          availability: persistenceAvailability,
          blockers,
          warnings
        });
      }

      const sovereigntyState = deriveSovereigntyState(
        node,
        observation,
        acquisitions.get(node.node_id) ?? null
      );

      return {
        node_id: node.node_id,
        model_id: node.model_id,
        engagement: node.engagement,
        topology_role: node.topology_role,
        custody: node.custody,
        weight_state: node.weights.state,
        model_availability: modelAvailability,
        observed_artifact_digest: observation?.observed_artifact_digest ?? null,
        continuity_importance: node.continuity_importance,
        fidelity_importance: node.fidelity_importance,
        sovereignty_state: sovereigntyState,
        persistence_mode: node.persistence.mode,
        persistence_availability: persistenceAvailability,
        declared_exportability: node.persistence.exportability,
        observed_exportability: node.persistence.mode === 'none'
          ? 'none'
          : (persistenceEvidence?.observed_exportability ?? 'unknown')
      };
    });

  blockers.sort();
  warnings.sort();

  const body = {
    schema: COGNITIVE_CONTINUITY_REPORT_SCHEMA,
    version: 0,
    status: 'inert-evidence-report',
    topology: {
      topology_id: topology.topology_id,
      topology_digest: topologyDigest
    },
    cognitive_continuity_status: aggregateAxisStatus('continuity', blockers, warnings),
    cognitive_fidelity_status: aggregateAxisStatus('fidelity', blockers, warnings),
    sovereignty_status: aggregateSovereignty(nodes),
    blockers,
    warnings,
    nodes,
    authority_boundary: AUTHORITY_BOUNDARY
  };

  const report = {
    ...body,
    report_digest: digestObject(body)
  };
  return deepFreeze(report);
}

function validateInputs(inputs) {
  exactObject(inputs, 'Cognitive continuity report inputs', [
    'model_observations',
    'acquisition_manifests',
    'persistence_attestations'
  ]);
  boundedArray(inputs.model_observations, 'model_observations', 64);
  boundedArray(inputs.acquisition_manifests, 'acquisition_manifests', 64);
  boundedArray(inputs.persistence_attestations, 'persistence_attestations', 64);
}

function indexModelObservations(items, nodesById) {
  const result = new Map();
  for (const item of items) {
    exactObject(item, 'Model observation', [
      'node_id',
      'model_id',
      'availability',
      'observed_artifact_digest'
    ]);
    if (typeof item.node_id !== 'string' || item.node_id.length === 0) {
      throw new ValidationError('Model observation node_id is invalid');
    }
    if (typeof item.model_id !== 'string' || item.model_id.length === 0) {
      throw new ValidationError('Model observation model_id is invalid');
    }
    if (!AVAILABILITY.has(item.availability)) {
      throw new ValidationError('Model observation availability is invalid');
    }
    if (result.has(item.node_id)) {
      throw new ValidationError(`duplicate model observation for node ${item.node_id}`);
    }

    const node = nodesById.get(item.node_id);
    if (!node) {
      throw new ValidationError(`Model observation references unknown node ${item.node_id} not declared in the Cognitive Topology`);
    }
    if (item.model_id !== node.model_id) {
      throw new ValidationError('Model observation model_id does not match the Cognitive Topology node model');
    }

    const ownerAddressableArtifact = ACQUIRED_WEIGHT_STATES.has(node.weights.state);
    if (ownerAddressableArtifact) {
      if (item.availability === 'available') {
        if (typeof item.observed_artifact_digest !== 'string' || !DIGEST.test(item.observed_artifact_digest)) {
          throw new ValidationError('Model observation observed_artifact_digest is required for an available acquired artifact');
        }
      } else if (item.observed_artifact_digest !== null) {
        throw new ValidationError('Model observation observed_artifact_digest must be null when an acquired artifact is not available');
      }
    } else if (item.observed_artifact_digest !== null) {
      throw new ValidationError('Model observation observed_artifact_digest must be null when the topology does not declare an acquired artifact digest');
    }

    result.set(item.node_id, item);
  }
  return result;
}

function indexAcquisitions(items, topology) {
  const result = new Map();
  for (const item of items) {
    const resolved = resolveModelAcquisitionManifest(item, topology);
    if (result.has(resolved.node_id)) {
      throw new ValidationError(`duplicate acquisition evidence for node ${resolved.node_id}`);
    }
    result.set(resolved.node_id, resolved);
  }
  return result;
}

function indexPersistence(items, topology) {
  const result = new Map();
  for (const item of items) {
    const resolved = resolvePersistenceAttestation(item, topology);
    if (result.has(resolved.node_id)) {
      throw new ValidationError(`duplicate persistence evidence for node ${resolved.node_id}`);
    }
    result.set(resolved.node_id, resolved);
  }
  return result;
}

function deriveSovereigntyState(node, observation, acquisition) {
  if (node.persistence.mode === 'mirrored') return 'mirrored';
  if (node.custody === 'provider-controlled') return 'provider-dependent';

  if (OWNER_CUSTODY.has(node.custody) && ACQUIRED_WEIGHT_STATES.has(node.weights.state)) {
    if (!acquisition) return 'declared-owner-artifact-unverified';
    if (observation?.availability !== 'available') return 'declared-owner-artifact-unverified';
    if (observation.observed_artifact_digest !== node.weights.artifact_digest) {
      return 'artifact-digest-mismatch';
    }
    return 'verified-owner-artifact';
  }

  if (node.custody === 'shared') return 'shared-dependent';
  return 'owner-controlled';
}

function applyDependencyStatus({
  axis,
  importance,
  nodeId,
  kind,
  availability,
  blockers,
  warnings
}) {
  if (availability === 'available' || availability === 'not-applicable') return;
  const suffix = `${kind}-${availability}`;

  if (importance === 'optional') {
    warnings.push(`optional:${nodeId}:${suffix}`);
    return;
  }
  if (importance === 'critical' && availability === 'unavailable') {
    blockers.push(`${axis}:${nodeId}:${suffix}`);
    return;
  }
  warnings.push(`${axis}:${nodeId}:${suffix}`);
}

function aggregateAxisStatus(axis, blockers, warnings) {
  if (blockers.some(item => item.startsWith(`${axis}:`))) return 'blocked';
  if (warnings.some(item => item.startsWith(`${axis}:`))) return 'degraded';
  return 'full';
}

function aggregateSovereignty(nodes) {
  const states = new Set(nodes.map(node => node.sovereignty_state));
  if (states.has('declared-owner-artifact-unverified') || states.has('artifact-digest-mismatch')) {
    return 'unverified';
  }
  if (states.size === 1 && states.has('verified-owner-artifact')) return 'owner-controlled';
  if (states.size === 1 && states.has('owner-controlled')) return 'owner-controlled';
  if (states.size === 1 && states.has('provider-dependent')) return 'provider-dependent';
  return 'mixed';
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

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
