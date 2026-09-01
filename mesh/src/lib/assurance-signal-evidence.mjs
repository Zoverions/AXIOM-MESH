import {
  ValidationError,
  assertPlainObject,
  assertString,
  digestObject
} from './canonical.mjs';
import { ADAPTIVE_ASSURANCE_INPUT_SCHEMA } from './adaptive-assurance.mjs';

export const ASSURANCE_SIGNAL_EVIDENCE_SCHEMA = 'axiom-assurance-signal-evidence.v1';
export const ASSURANCE_SIGNAL_POLICY_SCHEMA = 'axiom-assurance-signal-policy.v1';
export const ASSURANCE_SIGNAL_RESOLUTION_SCHEMA = 'axiom-assurance-signal-resolution.v1';

export const ASSURANCE_RISK_SIGNALS = Object.freeze([
  'consequence',
  'uncertainty',
  'irreversibility',
  'authority_exposure',
  'anomaly',
  'provenance_weakness',
  'correlation_risk',
  'context_integrity_risk'
]);

const SIGNALS = new Set([...ASSURANCE_RISK_SIGNALS, 'reputation']);
const SOURCE_CLASSES = new Set([
  'measurement',
  'policy-derived',
  'independently-verified',
  'entity-assurance'
]);
const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]*(?:-[A-Za-z0-9_.:-]+)*$/;
const DIGEST = /^[a-f0-9]{64}$/;
const EVIDENCE_FIELDS = new Set([
  'schema',
  'evidence_id',
  'task_id',
  'signal',
  'value',
  'confidence',
  'source_id',
  'source_class',
  'basis_digest',
  'source_verification_digest',
  'observed_at',
  'expires_at',
  'non_authorizing'
]);
const POLICY_FIELDS = new Set([
  'schema',
  'policy_id',
  'accepted_source_classes',
  'maximum_age_ms',
  'require_reputation',
  'authority_effect'
]);

function rejectUnknown(value, allowed, label) {
  const unknown = Object.keys(value).filter(key => !allowed.has(key));
  if (unknown.length) {
    throw new ValidationError(`${label} contains unsupported fields: ${unknown.join(', ')}`);
  }
}

function id(value, label) {
  return assertString(value, label, { min: 1, max: 192, pattern: ID });
}

function digest(value, label) {
  return assertString(value, label, { min: 64, max: 64, pattern: DIGEST });
}

function score(value, label) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 100) {
    throw new ValidationError(`${label} must be an integer between 0 and 100`);
  }
  return value;
}

function timestamp(value, label) {
  const text = assertString(value, label, { min: 24, max: 24 });
  const date = new Date(text);
  if (Number.isNaN(date.valueOf()) || date.toISOString() !== text) {
    throw new ValidationError(`${label} must be a canonical UTC ISO timestamp`);
  }
  return text;
}

export function normalizeAssuranceSignalEvidence(raw) {
  const value = assertPlainObject(raw, 'assurance signal evidence');
  rejectUnknown(value, EVIDENCE_FIELDS, 'assurance signal evidence');
  if (value.schema !== ASSURANCE_SIGNAL_EVIDENCE_SCHEMA) {
    throw new ValidationError(
      `assurance signal evidence schema must be ${ASSURANCE_SIGNAL_EVIDENCE_SCHEMA}`
    );
  }
  if (value.non_authorizing !== true) {
    throw new ValidationError('assurance signal evidence must remain non-authorizing');
  }
  if (!SIGNALS.has(value.signal)) {
    throw new ValidationError('assurance signal evidence signal is unsupported');
  }
  if (!SOURCE_CLASSES.has(value.source_class)) {
    throw new ValidationError('assurance signal evidence source_class is unsupported');
  }
  const observedAt = timestamp(value.observed_at, 'assurance signal evidence observed_at');
  const expiresAt = value.expires_at === null || value.expires_at === undefined
    ? null
    : timestamp(value.expires_at, 'assurance signal evidence expires_at');
  if (expiresAt !== null && new Date(expiresAt).valueOf() <= new Date(observedAt).valueOf()) {
    throw new ValidationError('assurance signal evidence expires_at must follow observed_at');
  }
  const body = Object.freeze({
    schema: ASSURANCE_SIGNAL_EVIDENCE_SCHEMA,
    evidence_id: id(value.evidence_id, 'assurance signal evidence evidence_id'),
    task_id: id(value.task_id, 'assurance signal evidence task_id'),
    signal: value.signal,
    value: score(value.value, 'assurance signal evidence value'),
    confidence: score(value.confidence, 'assurance signal evidence confidence'),
    source_id: id(value.source_id, 'assurance signal evidence source_id'),
    source_class: value.source_class,
    basis_digest: digest(value.basis_digest, 'assurance signal evidence basis_digest'),
    source_verification_digest: digest(
      value.source_verification_digest,
      'assurance signal evidence source_verification_digest'
    ),
    observed_at: observedAt,
    expires_at: expiresAt,
    non_authorizing: true
  });
  return Object.freeze({ ...body, evidence_digest: digestObject(body) });
}

export function normalizeAssuranceSignalPolicy(raw) {
  const value = assertPlainObject(raw, 'assurance signal policy');
  rejectUnknown(value, POLICY_FIELDS, 'assurance signal policy');
  if (value.schema !== ASSURANCE_SIGNAL_POLICY_SCHEMA) {
    throw new ValidationError(
      `assurance signal policy schema must be ${ASSURANCE_SIGNAL_POLICY_SCHEMA}`
    );
  }
  if (value.authority_effect !== 'none') {
    throw new ValidationError('assurance signal policy authority_effect must be none');
  }
  if (!Array.isArray(value.accepted_source_classes) || value.accepted_source_classes.length < 1) {
    throw new ValidationError('assurance signal policy accepted_source_classes is required');
  }
  const classes = value.accepted_source_classes.map((item, index) => {
    if (!SOURCE_CLASSES.has(item)) {
      throw new ValidationError(
        `assurance signal policy accepted_source_classes[${index}] is unsupported`
      );
    }
    return item;
  });
  if (new Set(classes).size !== classes.length) {
    throw new ValidationError('assurance signal policy source classes must be unique');
  }
  if (
    !Number.isSafeInteger(value.maximum_age_ms)
    || value.maximum_age_ms < 1
    || value.maximum_age_ms > 31_536_000_000
  ) {
    throw new ValidationError(
      'assurance signal policy maximum_age_ms must be 1-31536000000'
    );
  }
  if (typeof value.require_reputation !== 'boolean') {
    throw new ValidationError('assurance signal policy require_reputation must be boolean');
  }
  const body = Object.freeze({
    schema: ASSURANCE_SIGNAL_POLICY_SCHEMA,
    policy_id: id(value.policy_id, 'assurance signal policy policy_id'),
    accepted_source_classes: Object.freeze([...classes].sort()),
    maximum_age_ms: value.maximum_age_ms,
    require_reputation: value.require_reputation,
    authority_effect: 'none'
  });
  return Object.freeze({ ...body, policy_digest: digestObject(body) });
}

function isCurrent(item, nowMs, maximumAgeMs) {
  const observedMs = new Date(item.observed_at).valueOf();
  if (observedMs > nowMs) return false;
  if (nowMs - observedMs > maximumAgeMs) return false;
  return item.expires_at === null || new Date(item.expires_at).valueOf() > nowMs;
}

export function resolveAdaptiveAssuranceSignals({
  taskId,
  policy,
  evidence,
  verifiedSourceBindings,
  now
} = {}) {
  const task = id(taskId, 'assurance signal resolution taskId');
  const normalizedPolicy = normalizeAssuranceSignalPolicy(policy);
  const evaluationTime = timestamp(now, 'assurance signal resolution now');
  if (!Array.isArray(evidence) || evidence.length > 4096) {
    throw new ValidationError('assurance signal resolution evidence must contain at most 4096 items');
  }
  if (!(verifiedSourceBindings instanceof Map) || verifiedSourceBindings.size < 1) {
    throw new ValidationError(
      'assurance signal resolution requires a non-empty verifiedSourceBindings Map'
    );
  }
  for (const [verificationDigest, binding] of verifiedSourceBindings) {
    digest(verificationDigest, 'assurance signal resolution verified source digest');
    const sourceBinding = assertPlainObject(
      binding,
      'assurance signal resolution verified source binding'
    );
    id(sourceBinding.source_id, 'assurance signal resolution verified source_id');
    if (!SOURCE_CLASSES.has(sourceBinding.source_class)) {
      throw new ValidationError(
        'assurance signal resolution verified source_class is unsupported'
      );
    }
  }
  const normalized = evidence.map(normalizeAssuranceSignalEvidence);
  const evidenceIds = normalized.map(item => item.evidence_id);
  if (new Set(evidenceIds).size !== evidenceIds.length) {
    throw new ValidationError('assurance signal evidence IDs must be unique');
  }
  for (const item of normalized) {
    if (item.task_id !== task) {
      throw new ValidationError('assurance signal evidence task_id does not match resolution task');
    }
  }

  const nowMs = new Date(evaluationTime).valueOf();
  const eligible = normalized.filter(item => (
    normalizedPolicy.accepted_source_classes.includes(item.source_class)
    && verifiedSourceBindings.has(item.source_verification_digest)
    && verifiedSourceBindings.get(item.source_verification_digest).source_id === item.source_id
    && verifiedSourceBindings.get(item.source_verification_digest).source_class === item.source_class
    && isCurrent(item, nowMs, normalizedPolicy.maximum_age_ms)
  ));

  const signals = {};
  const signalEvidence = {};
  const missingSignals = [];
  for (const signal of ASSURANCE_RISK_SIGNALS) {
    const candidates = eligible.filter(item => item.signal === signal);
    if (!candidates.length) {
      missingSignals.push(signal);
      continue;
    }
    // Risk values are conservative: disagreement resolves upward, never by averaging
    // a high-risk observation away with a low-risk observation.
    signals[signal] = Math.max(...candidates.map(item => item.value));
    signalEvidence[signal] = Object.freeze(
      candidates.map(item => item.evidence_digest).sort()
    );
  }

  const reputationCandidates = eligible.filter(item => item.signal === 'reputation');
  if (normalizedPolicy.require_reputation && !reputationCandidates.length) {
    missingSignals.push('reputation');
  }

  if (missingSignals.length) {
    throw new ValidationError(
      `assurance signal resolution missing current attributable evidence: ${missingSignals.sort().join(', ')}`
    );
  }

  let reputationScore = 50;
  let reputationConfidence = 0;
  let reputationEvidence = [];
  if (reputationCandidates.length) {
    // Reputation is friction-reducing, so disagreement resolves conservatively
    // toward the lowest score. Confidence is bounded by the selected source.
    const selected = [...reputationCandidates].sort((left, right) => (
      left.value - right.value
      || right.confidence - left.confidence
      || left.evidence_digest.localeCompare(right.evidence_digest)
    ))[0];
    reputationScore = selected.value;
    reputationConfidence = selected.confidence;
    reputationEvidence = reputationCandidates.map(item => item.evidence_digest).sort();
  }

  const resolutionBody = Object.freeze({
    schema: ASSURANCE_SIGNAL_RESOLUTION_SCHEMA,
    task_id: task,
    policy_id: normalizedPolicy.policy_id,
    policy_digest: normalizedPolicy.policy_digest,
    evaluated_at: evaluationTime,
    signals: Object.freeze({ ...signals }),
    signal_evidence: Object.freeze({ ...signalEvidence }),
    reputation_score: reputationScore,
    reputation_confidence: reputationConfidence,
    reputation_evidence: Object.freeze(reputationEvidence),
    conservative_disagreement_resolution: true,
    authority_effect: 'none'
  });

  return Object.freeze({
    ...resolutionBody,
    resolution_digest: digestObject(resolutionBody)
  });
}

export function buildAdaptiveAssuranceInputFromEvidence({
  taskId,
  riskClass,
  policyFloor,
  signalPolicy,
  evidence,
  verifiedSourceBindings,
  now
} = {}) {
  const resolution = resolveAdaptiveAssuranceSignals({
    taskId,
    policy: signalPolicy,
    evidence,
    verifiedSourceBindings,
    now
  });
  return Object.freeze({
    input: Object.freeze({
      schema: ADAPTIVE_ASSURANCE_INPUT_SCHEMA,
      task_id: resolution.task_id,
      risk_class: riskClass,
      signals: resolution.signals,
      reputation_score: resolution.reputation_score,
      reputation_confidence: resolution.reputation_confidence,
      ...(policyFloor === undefined ? {} : { policy_floor: policyFloor })
    }),
    resolution
  });
}
