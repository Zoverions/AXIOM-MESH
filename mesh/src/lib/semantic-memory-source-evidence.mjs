import {
  ValidationError,
  assertPlainObject,
  assertString,
  canonicalJson,
  digestObject
} from './canonical.mjs';

export const SEMANTIC_MEMORY_SOURCE_EVIDENCE_SCHEMA =
  'axiom-semantic-memory-source-evidence.v1';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const SOURCE_CLASS = /^(remote-agent|local-model-generated|imported|external-tool)$/;
const SEMANTIC_CLASS = /^(knowledge|preference|procedure|instruction-candidate)$/;

export function normalizeSemanticMemorySourceEvidence(input, { now = Date.now() } = {}) {
  const value = assertPlainObject(input, 'semantic memory source evidence');
  assertExactKeys(value, [
    'schema',
    'owner',
    'source_class',
    'source_principal',
    'source_runtime_id',
    'source_artifact_digest',
    'content_payload_digest',
    'semantic_class',
    'observed_at',
    'claim_limits',
    'evidence_digest'
  ], 'semantic memory source evidence');
  if (value.schema !== SEMANTIC_MEMORY_SOURCE_EVIDENCE_SCHEMA) {
    throw new ValidationError('Semantic memory source evidence schema is invalid');
  }

  const owner = requiredId(value.owner, 'semantic source owner');
  const sourceClass = assertString(
    value.source_class,
    'semantic source source_class',
    { max: 64, pattern: SOURCE_CLASS }
  );
  const sourcePrincipal = optionalId(
    value.source_principal,
    'semantic source source_principal'
  );
  const sourceRuntimeId = optionalId(
    value.source_runtime_id,
    'semantic source source_runtime_id'
  );
  const sourceArtifactDigest = requiredDigest(
    value.source_artifact_digest,
    'semantic source source_artifact_digest'
  );
  const contentPayloadDigest = requiredDigest(
    value.content_payload_digest,
    'semantic source content_payload_digest'
  );
  const semanticClass = assertString(
    value.semantic_class,
    'semantic source semantic_class',
    { max: 64, pattern: SEMANTIC_CLASS }
  );
  const observedAt = validDate(value.observed_at, 'semantic source observed_at');
  if (new Date(observedAt).valueOf() > Number(now) + 5 * 60 * 1000) {
    throw new ValidationError('Semantic source evidence cannot be far future dated');
  }

  const limits = normalizeClaimLimits(value.claim_limits);
  const normalized = {
    schema: SEMANTIC_MEMORY_SOURCE_EVIDENCE_SCHEMA,
    owner,
    source_class: sourceClass,
    ...(sourcePrincipal ? { source_principal: sourcePrincipal } : {}),
    ...(sourceRuntimeId ? { source_runtime_id: sourceRuntimeId } : {}),
    source_artifact_digest: sourceArtifactDigest,
    content_payload_digest: contentPayloadDigest,
    semantic_class: semanticClass,
    observed_at: observedAt,
    claim_limits: limits
  };
  const evidenceDigest = digestObject(normalized);
  if (value.evidence_digest !== evidenceDigest) {
    throw new ValidationError('Semantic memory source evidence digest is invalid');
  }
  return Object.freeze({
    ...normalized,
    evidence_digest: evidenceDigest
  });
}

export function createSemanticMemorySourceEvidence(input, { now = Date.now() } = {}) {
  const value = assertPlainObject(input, 'semantic memory source evidence input');
  assertExactKeys(value, [
    'owner',
    'source_class',
    'source_principal',
    'source_runtime_id',
    'source_artifact_digest',
    'content_payload_digest',
    'semantic_class',
    'observed_at'
  ], 'semantic memory source evidence input');
  const draft = {
    schema: SEMANTIC_MEMORY_SOURCE_EVIDENCE_SCHEMA,
    owner: value.owner,
    source_class: value.source_class,
    ...(value.source_principal !== undefined
      ? { source_principal: value.source_principal }
      : {}),
    ...(value.source_runtime_id !== undefined
      ? { source_runtime_id: value.source_runtime_id }
      : {}),
    source_artifact_digest: value.source_artifact_digest,
    content_payload_digest: value.content_payload_digest,
    semantic_class: value.semantic_class,
    observed_at: value.observed_at,
    claim_limits: semanticSourceClaimLimits()
  };
  return normalizeSemanticMemorySourceEvidence({
    ...draft,
    evidence_digest: digestObject(draft)
  }, { now });
}

export function semanticSourceClaimLimits() {
  return Object.freeze({
    source_identity_verified: false,
    artifact_authenticity_verified: false,
    content_truth_verified: false,
    personal_authorship_verified: false,
    owner_approval_verified: false,
    instruction_authority_granted: false,
    propagation_authority_granted: false,
    downstream_effect_authority_granted: false,
    may_affect_axiom_authority: false
  });
}

export function assertSemanticSourceEvidenceEquivalent(a, b) {
  const left = normalizeSemanticMemorySourceEvidence(a);
  const right = normalizeSemanticMemorySourceEvidence(b);
  if (canonicalJson(left) !== canonicalJson(right)) {
    throw new ValidationError('Semantic source evidence records are not equivalent');
  }
  return left;
}

function normalizeClaimLimits(input) {
  const value = assertPlainObject(input, 'semantic source claim_limits');
  const expected = semanticSourceClaimLimits();
  assertExactKeys(value, Object.keys(expected), 'semantic source claim_limits');
  for (const [key, expectedValue] of Object.entries(expected)) {
    if (value[key] !== expectedValue) {
      throw new ValidationError(`Semantic source claim limit ${key} must remain ${expectedValue}`);
    }
  }
  return expected;
}

function requiredId(value, label) {
  return assertString(value, label, { min: 1, max: 160, pattern: ID });
}

function optionalId(value, label) {
  if (value === undefined) return undefined;
  return requiredId(value, label);
}

function requiredDigest(value, label) {
  return assertString(value, label, { min: 64, max: 64, pattern: DIGEST });
}

function validDate(value, label) {
  const text = assertString(value, label, { max: 64 });
  if (Number.isNaN(new Date(text).valueOf())) throw new ValidationError(`${label} is invalid`);
  return text;
}

function assertExactKeys(value, allowed, label) {
  const actual = Object.keys(value).sort();
  const expected = [...allowed].sort();
  if (
    actual.length !== expected.length
    || actual.some((key, index) => key !== expected[index])
  ) {
    throw new ValidationError(`${label} contains unsupported or missing fields`);
  }
}
