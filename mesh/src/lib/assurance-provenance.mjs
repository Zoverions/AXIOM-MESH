import {
  ValidationError,
  assertPlainObject,
  assertString,
  digestObject
} from './canonical.mjs';

export const ASSURANCE_PROVENANCE_SCHEMA = 'axiom-assurance-provenance-bundle.v1';
export const ASSURANCE_PROVENANCE_RECORD_KIND = 'assurance.provenance.recorded';

const DIGEST = /^[a-f0-9]{64}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]*(?:-[A-Za-z0-9_.:-]+)*$/;
const PHASES = new Set(['planned', 'completed']);

function digest(value, label) {
  return assertString(value, label, { min: 64, max: 64, pattern: DIGEST });
}

function id(value, label) {
  return assertString(value, label, { min: 1, max: 192, pattern: ID });
}

export function buildAssuranceProvenanceBundle({
  taskId,
  phase,
  selectedTier,
  signalResolutionDigest,
  assuranceDecisionDigest,
  workOrderDigest,
  completionDigest = null,
  completionSatisfied = false
} = {}) {
  const normalizedPhase = assertString(phase, 'assurance provenance phase', { max: 32 });
  if (!PHASES.has(normalizedPhase)) {
    throw new ValidationError('assurance provenance phase is unsupported');
  }
  if (!['A1', 'A2', 'A3'].includes(selectedTier)) {
    throw new ValidationError('assurance provenance selectedTier must be A1-A3');
  }
  if (typeof completionSatisfied !== 'boolean') {
    throw new ValidationError('assurance provenance completionSatisfied must be boolean');
  }

  const completed = normalizedPhase === 'completed';
  if (completed && completionDigest === null) {
    throw new ValidationError('completed assurance provenance requires completionDigest');
  }
  if (!completed && completionDigest !== null) {
    throw new ValidationError('planned assurance provenance cannot contain completionDigest');
  }
  if (!completed && completionSatisfied !== false) {
    throw new ValidationError('planned assurance provenance cannot claim completion');
  }
  if (completed && completionSatisfied !== true) {
    throw new ValidationError('completed assurance provenance must represent satisfied completion');
  }

  const body = Object.freeze({
    schema: ASSURANCE_PROVENANCE_SCHEMA,
    task_id: id(taskId, 'assurance provenance taskId'),
    phase: normalizedPhase,
    selected_tier: selectedTier,
    signal_resolution_digest: digest(
      signalResolutionDigest,
      'assurance provenance signalResolutionDigest'
    ),
    assurance_decision_digest: digest(
      assuranceDecisionDigest,
      'assurance provenance assuranceDecisionDigest'
    ),
    work_order_digest: digest(
      workOrderDigest,
      'assurance provenance workOrderDigest'
    ),
    completion_digest: completionDigest === null
      ? null
      : digest(completionDigest, 'assurance provenance completionDigest'),
    completion_satisfied: completionSatisfied,
    authority_effect: 'none',
    execution_effect: 'none'
  });

  return Object.freeze({
    ...body,
    provenance_digest: digestObject(body)
  });
}

export function normalizeAssuranceProvenanceBundle(raw) {
  const value = assertPlainObject(raw, 'assurance provenance bundle');
  const rebuilt = buildAssuranceProvenanceBundle({
    taskId: value.task_id,
    phase: value.phase,
    selectedTier: value.selected_tier,
    signalResolutionDigest: value.signal_resolution_digest,
    assuranceDecisionDigest: value.assurance_decision_digest,
    workOrderDigest: value.work_order_digest,
    completionDigest: value.completion_digest ?? null,
    completionSatisfied: value.completion_satisfied
  });
  if (
    value.schema !== ASSURANCE_PROVENANCE_SCHEMA
    || value.authority_effect !== 'none'
    || value.execution_effect !== 'none'
  ) {
    throw new ValidationError('assurance provenance activation boundary is invalid');
  }
  if (
    digest(value.provenance_digest, 'assurance provenance provenance_digest')
    !== rebuilt.provenance_digest
  ) {
    throw new ValidationError('assurance provenance provenance_digest mismatch');
  }
  return rebuilt;
}

export function assuranceProvenanceIntentEvidence(
  rawBundle,
  {
    obligation = 'adaptive-assurance-provenance',
    ref
  } = {}
) {
  const bundle = normalizeAssuranceProvenanceBundle(rawBundle);
  const evidence = {
    obligation: assertString(obligation, 'assurance provenance obligation', {
      min: 1,
      max: 256
    }),
    artifact_digest: bundle.provenance_digest,
    artifact_type: ASSURANCE_PROVENANCE_SCHEMA
  };
  if (ref !== undefined) {
    evidence.ref = assertString(ref, 'assurance provenance ref', {
      min: 1,
      max: 512
    });
  }
  return Object.freeze(evidence);
}


export function assuranceProvenanceMemoryInput(rawBundle) {
  const bundle = normalizeAssuranceProvenanceBundle(rawBundle);
  return Object.freeze({
    kind: ASSURANCE_PROVENANCE_RECORD_KIND,
    content: bundle,
    metadata: Object.freeze({})
  });
}
