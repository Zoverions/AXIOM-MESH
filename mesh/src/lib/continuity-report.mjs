import { digestObject, ValidationError } from './canonical.mjs';
import {
  selfBundleIndexDigest,
  validateSelfBundleIndex
} from './self-bundle-index.mjs';

export const CONTINUITY_REPORT_SCHEMA = 'axiom-continuity-report.v0';

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const DIGEST = /^[a-f0-9]{64}$/;

export function buildContinuityReport(predecessor, successor, observations) {
  validateSelfBundleIndex(predecessor);
  validateSelfBundleIndex(successor);
  const predecessorDigest = selfBundleIndexDigest(predecessor);
  const successorDigest = selfBundleIndexDigest(successor);
  const observationMap = normalizeObservations(observations);
  const blockers = [];
  const warnings = [];

  const principal = comparePrincipal(predecessor, successor, blockers);
  const lineage = compareLineage(predecessor, successor, predecessorDigest, blockers);
  const composition = compareComposition(predecessor, successor, warnings);
  const portableState = comparePortableState(predecessor, successor, observationMap, blockers, warnings);
  const semanticState = compareSemanticState(predecessor, successor, observationMap, blockers, warnings);
  const evidenceCompleteness = assessEvidenceCompleteness(
    successor,
    portableState,
    semanticState
  );

  const uniqueBlockers = [...new Set(blockers)].sort();
  const uniqueWarnings = [...new Set(warnings)].sort();
  const continuityStatus = uniqueBlockers.length > 0
    ? 'blocked'
    : uniqueWarnings.length > 0
      ? 'degraded'
      : 'full';

  const authorityBoundary = {
    writes_files: false,
    performs_network_effects: false,
    opens_or_decrypts_vaults: false,
    activates_runtimes: false,
    loads_models: false,
    issues_or_refreshes_credentials: false,
    substitutes_missing_artifacts: false,
    grants_vault_access: false,
    grants_execution_authority: false,
    proves_subjective_identity: false
  };

  const unsignedReport = {
    schema: CONTINUITY_REPORT_SCHEMA,
    predecessor: {
      bundle_id: predecessor.bundle_id,
      bundle_digest: predecessorDigest
    },
    successor: {
      bundle_id: successor.bundle_id,
      bundle_digest: successorDigest
    },
    continuity_status: continuityStatus,
    blockers: uniqueBlockers,
    warnings: uniqueWarnings,
    dimensions: {
      principal,
      lineage,
      composition,
      portable_state: portableState,
      semantic_state: semanticState,
      evidence_completeness: evidenceCompleteness
    },
    authority_boundary: authorityBoundary
  };

  return deepFreeze({
    ...unsignedReport,
    report_digest: digestObject(unsignedReport)
  });
}

function comparePrincipal(predecessor, successor, blockers) {
  const retained = predecessor.principal_id === successor.principal_id;
  if (!retained) blockers.push('principal-mismatch');
  return {
    state: retained ? 'retained' : 'blocked',
    predecessor_principal_id: predecessor.principal_id,
    successor_principal_id: successor.principal_id
  };
}

function compareLineage(predecessor, successor, predecessorDigest, blockers) {
  const claimed = successor.predecessor_bundle;
  const referenceMatch = claimed?.ref === predecessor.bundle_id;
  const digestMatch = claimed?.digest === predecessorDigest;
  if (!referenceMatch) blockers.push('predecessor-reference-mismatch');
  if (!digestMatch) blockers.push('predecessor-digest-mismatch');
  return {
    state: referenceMatch && digestMatch ? 'retained' : 'blocked',
    expected_predecessor_ref: predecessor.bundle_id,
    expected_predecessor_digest: predecessorDigest,
    claimed_predecessor_ref: claimed?.ref ?? null,
    claimed_predecessor_digest: claimed?.digest ?? null
  };
}

function compareComposition(predecessor, successor, warnings) {
  const retained = sameReference(predecessor.agent_composition, successor.agent_composition);
  if (!retained) warnings.push('composition-changed');
  return {
    state: retained ? 'retained' : 'changed',
    predecessor: copyReference(predecessor.agent_composition),
    successor: copyReference(successor.agent_composition)
  };
}

function comparePortableState(predecessor, successor, observations, blockers, warnings) {
  const changed = !sameReference(predecessor.personal_agent_pack, successor.personal_agent_pack);
  const observationState = artifactObservationState(successor.personal_agent_pack, observations);
  let state;

  if (observationState === 'missing') {
    state = 'missing';
    blockers.push('personal-agent-pack-missing');
  } else if (observationState === 'digest-mismatch') {
    state = 'digest-mismatch';
    blockers.push('personal-agent-pack-digest-mismatch');
  } else if (observationState === 'unassessed') {
    state = 'unassessed';
    warnings.push('personal-agent-pack-unassessed');
    if (changed) warnings.push('personal-agent-pack-changed');
  } else if (changed) {
    state = 'changed';
    warnings.push('personal-agent-pack-changed');
  } else {
    state = 'retained';
  }

  return {
    state,
    observation_state: observationState,
    predecessor: copyReference(predecessor.personal_agent_pack),
    successor: copyReference(successor.personal_agent_pack)
  };
}

function compareSemanticState(predecessor, successor, observations, blockers, warnings) {
  const before = new Map(predecessor.semantic_state.map(entry => [entry.claim_id, entry]));
  const after = new Map(successor.semantic_state.map(entry => [entry.claim_id, entry]));
  const added = [];
  const removed = [];
  const changed = [];
  const retained = [];

  for (const claimId of [...after.keys()].sort()) {
    const current = after.get(claimId);
    const prior = before.get(claimId);
    if (!prior) added.push(claimId);
    else if (sameSemanticEntry(prior, current)) retained.push(claimId);
    else changed.push(claimId);
  }
  for (const claimId of [...before.keys()].sort()) {
    if (!after.has(claimId)) removed.push(claimId);
  }

  if (added.length) warnings.push('semantic-claims-added');
  if (removed.length) warnings.push('semantic-claims-removed');
  if (changed.length) warnings.push('semantic-claims-changed');

  let requiredEvidenceBlocked = false;
  let evidenceDegraded = false;
  const observationResults = [...successor.semantic_state]
    .sort((left, right) => left.claim_id.localeCompare(right.claim_id))
    .map(entry => {
      const state = artifactObservationState(entry, observations);
      if (state === 'missing' || state === 'digest-mismatch') {
        if (entry.required_for_continuity) {
          blockers.push(`required-semantic-${state}:${entry.claim_id}`);
          requiredEvidenceBlocked = true;
        } else {
          warnings.push(`optional-semantic-${state}:${entry.claim_id}`);
          evidenceDegraded = true;
        }
      } else if (state === 'unassessed') {
        warnings.push(
          `${entry.required_for_continuity ? 'required' : 'optional'}-semantic-unassessed:${entry.claim_id}`
        );
        evidenceDegraded = true;
      }
      return {
        claim_id: entry.claim_id,
        ref: entry.ref,
        expected_digest: entry.digest,
        required_for_continuity: entry.required_for_continuity,
        observation_state: state
      };
    });

  const claimSetChanged = added.length > 0 || removed.length > 0 || changed.length > 0;
  const state = requiredEvidenceBlocked
    ? 'blocked'
    : claimSetChanged || evidenceDegraded
      ? 'changed'
      : 'retained';

  return {
    state,
    added_claim_ids: added,
    removed_claim_ids: removed,
    changed_claim_ids: changed,
    retained_claim_ids: retained,
    observations: observationResults
  };
}

function assessEvidenceCompleteness(successor, portableState, semanticState) {
  const missingRefs = [];
  const digestMismatchRefs = [];
  const unassessedRefs = [];
  let hardFailure = false;
  let degraded = false;

  classifyEvidence(
    successor.personal_agent_pack.ref,
    portableState.observation_state,
    true,
    missingRefs,
    digestMismatchRefs,
    unassessedRefs,
    value => { hardFailure ||= value; },
    value => { degraded ||= value; }
  );

  for (const observation of semanticState.observations) {
    classifyEvidence(
      observation.ref,
      observation.observation_state,
      observation.required_for_continuity,
      missingRefs,
      digestMismatchRefs,
      unassessedRefs,
      value => { hardFailure ||= value; },
      value => { degraded ||= value; }
    );
  }

  return {
    state: hardFailure ? 'blocked' : degraded ? 'degraded' : 'full',
    missing_refs: [...new Set(missingRefs)].sort(),
    digest_mismatch_refs: [...new Set(digestMismatchRefs)].sort(),
    unassessed_refs: [...new Set(unassessedRefs)].sort()
  };
}

function classifyEvidence(
  ref,
  state,
  required,
  missingRefs,
  digestMismatchRefs,
  unassessedRefs,
  markHardFailure,
  markDegraded
) {
  if (state === 'missing') {
    missingRefs.push(ref);
    required ? markHardFailure(true) : markDegraded(true);
  } else if (state === 'digest-mismatch') {
    digestMismatchRefs.push(ref);
    required ? markHardFailure(true) : markDegraded(true);
  } else if (state === 'unassessed') {
    unassessedRefs.push(ref);
    markDegraded(true);
  }
}

function artifactObservationState(reference, observations) {
  const observation = observations.get(reference.ref);
  if (!observation) return 'unassessed';
  if (!observation.available) return 'missing';
  return observation.observed_digest === reference.digest
    ? 'digest-match'
    : 'digest-mismatch';
}

function normalizeObservations(value) {
  if (!Array.isArray(value) || value.length > 1024) {
    throw new ValidationError('continuity observations must be an array with at most 1024 items');
  }
  const output = new Map();
  for (const [index, observation] of value.entries()) {
    exactObservation(observation, index);
    if (output.has(observation.ref)) {
      throw new ValidationError(`duplicate observation ref: ${observation.ref}`);
    }
    output.set(observation.ref, observation);
  }
  return output;
}

function exactObservation(observation, index) {
  if (!observation || typeof observation !== 'object' || Array.isArray(observation)) {
    throw new ValidationError(`continuity observations[${index}] must be an object`);
  }
  const prototype = Object.getPrototypeOf(observation);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new ValidationError(`continuity observations[${index}] must be a plain object`);
  }
  const allowed = new Set(['ref', 'available', 'observed_digest']);
  for (const key of Object.keys(observation)) {
    if (!allowed.has(key)) {
      throw new ValidationError(`continuity observations[${index}] contains unknown field ${key}`);
    }
  }
  if (!Object.hasOwn(observation, 'ref') || !Object.hasOwn(observation, 'available')) {
    throw new ValidationError(`continuity observations[${index}] is missing a required field`);
  }
  if (typeof observation.ref !== 'string' || !IDENTIFIER.test(observation.ref)) {
    throw new ValidationError(`continuity observations[${index}].ref is invalid`);
  }
  if (typeof observation.available !== 'boolean') {
    throw new ValidationError(`continuity observations[${index}].available must be boolean`);
  }
  if (observation.available) {
    if (!Object.hasOwn(observation, 'observed_digest')) {
      throw new ValidationError(`available observation ${observation.ref} requires observed_digest`);
    }
    if (typeof observation.observed_digest !== 'string' || !DIGEST.test(observation.observed_digest)) {
      throw new ValidationError(`observation ${observation.ref} observed_digest is invalid`);
    }
  } else if (Object.hasOwn(observation, 'observed_digest')) {
    throw new ValidationError(
      `unavailable observation ${observation.ref} cannot carry observed_digest`
    );
  }
}

function sameReference(left, right) {
  return left.ref === right.ref && left.digest === right.digest;
}

function sameSemanticEntry(left, right) {
  return left.ref === right.ref
    && left.digest === right.digest
    && left.required_for_continuity === right.required_for_continuity;
}

function copyReference(reference) {
  return { ref: reference.ref, digest: reference.digest };
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
