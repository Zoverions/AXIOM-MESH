import {
  assertPlainObject,
  assertString,
  canonicalJson,
  ValidationError
} from './canonical.mjs';
import {
  contractDigest,
  verifyThreatHypothesis,
  verifyThreatObservation
} from './threat-intelligence-contracts.mjs';

export const THREAT_BUILD_FACTS_SCHEMA = 'axiom-threat-build-facts.v0';

const FACT_FIELDS = Object.freeze([
  'schema',
  'source_revision',
  'supported_runtime',
  'boundaries',
  'implemented_protocols',
  'absent_capabilities',
  'active_controls',
  'dependencies',
  'fact_digest'
]);
const SET_FIELDS = Object.freeze([
  'boundaries',
  'implemented_protocols',
  'absent_capabilities',
  'active_controls',
  'dependencies'
]);
const MAX_FACT_ITEMS = 256;
const MAX_FACT_BYTES = 65_536;

export function verifyBuildFacts(value) {
  assertPlainObject(value, 'buildFacts');
  assertExactFields(value, FACT_FIELDS, 'buildFacts');
  if (value.schema !== THREAT_BUILD_FACTS_SCHEMA) {
    throw new ValidationError(`buildFacts.schema must equal ${THREAT_BUILD_FACTS_SCHEMA}`);
  }
  assertString(value.source_revision, 'buildFacts.source_revision', { max: 512 });
  assertString(value.supported_runtime, 'buildFacts.supported_runtime', { max: 512 });
  assertString(value.fact_digest, 'buildFacts.fact_digest', {
    max: 71,
    pattern: /^sha256:[0-9a-f]{64}$/
  });

  const normalized = {
    schema: value.schema,
    source_revision: value.source_revision,
    supported_runtime: value.supported_runtime,
    boundaries: normalizeSet(value.boundaries, 'buildFacts.boundaries'),
    implemented_protocols: normalizeSet(value.implemented_protocols, 'buildFacts.implemented_protocols'),
    absent_capabilities: normalizeSet(value.absent_capabilities, 'buildFacts.absent_capabilities'),
    active_controls: normalizeSet(value.active_controls, 'buildFacts.active_controls'),
    dependencies: normalizeSet(value.dependencies, 'buildFacts.dependencies')
  };

  const totalFacts = SET_FIELDS.reduce((count, field) => count + normalized[field].length, 0);
  if (totalFacts > MAX_FACT_ITEMS) {
    throw new ValidationError('build facts must contain at most 256 fact entries');
  }

  const expected = contractDigest(normalized, 'fact_digest');
  if (value.fact_digest !== expected) {
    throw new ValidationError('buildFacts digest mismatch');
  }

  const verified = { ...normalized, fact_digest: value.fact_digest };
  if (Buffer.byteLength(canonicalJson(verified), 'utf8') > MAX_FACT_BYTES) {
    throw new ValidationError('buildFacts exceeds 65536 bytes');
  }
  return verified;
}

export function evaluateThreatApplicability({
  observation,
  buildFacts,
  hypothesisId,
  createdAt,
  reviewAt
}) {
  const verifiedObservation = verifyThreatObservation(observation);
  const facts = verifyBuildFacts(buildFacts);
  assertString(hypothesisId, 'hypothesisId', { max: 512 });
  assertTimestamp(createdAt, 'createdAt');
  assertTimestamp(reviewAt, 'reviewAt');

  const affected = [...verifiedObservation.affected_technology_or_boundary];
  const absentMatches = affected.filter(item => facts.absent_capabilities.includes(item));
  const boundaryMatches = affected.filter(item =>
    facts.boundaries.includes(item) || facts.implemented_protocols.includes(item)
  );

  let applicabilityState = 'unassessed';
  if (absentMatches.length > 0) {
    applicabilityState = 'not_applicable';
  } else if (boundaryMatches.length > 0) {
    applicabilityState = 'plausible';
  }

  const preconditionMapping = [];
  for (const item of absentMatches) preconditionMapping.push(`absent_capability:${item}`);
  for (const item of boundaryMatches) preconditionMapping.push(`matched_surface:${item}`);
  for (const control of facts.active_controls) preconditionMapping.push(`active_control:${control}`);
  preconditionMapping.sort();

  const namedSurfaces = boundaryMatches.length > 0
    ? boundaryMatches
    : affected;

  const raw = {
    schema: 'axiom-threat-hypothesis.v0',
    hypothesis_id: hypothesisId,
    observation_ids: [verifiedObservation.observation_digest],
    axiom_boundary_or_component: uniqueSorted(namedSurfaces),
    precondition_mapping: preconditionMapping,
    expected_failure_mode: verifiedObservation.reported_effects.length > 0
      ? verifiedObservation.reported_effects.join('; ')
      : 'No reported effect was supplied.',
    applicability_state: applicabilityState,
    confidence: applicabilityState === 'unassessed' ? 'unassessed' : 'deterministic_mapping',
    contradicting_evidence: [],
    required_reproduction: applicabilityState === 'plausible'
      ? ['bounded reproduction or other accepted evidence is required before confirmed state']
      : [],
    confirmation_basis: 'deterministic_build_fact_mapping',
    evidence_bindings: uniqueSorted([
      verifiedObservation.observation_digest,
      facts.fact_digest
    ]),
    created_by_principal_or_process: 'deterministic_threat_applicability_v0',
    created_at: createdAt,
    review_at: reviewAt
  };

  return verifyThreatHypothesis({
    ...raw,
    hypothesis_digest: contractDigest(raw, 'hypothesis_digest')
  });
}

function normalizeSet(value, name) {
  if (!Array.isArray(value)) throw new ValidationError(`${name} must be an array`);
  const seen = new Set();
  const items = value.map((item, index) => {
    const checked = assertString(item, `${name}[${index}]`, { max: 512 });
    if (seen.has(checked)) throw new ValidationError(`${name} items must be unique`);
    seen.add(checked);
    return checked;
  });
  return items.sort();
}

function uniqueSorted(value) {
  return [...new Set(value)].sort();
}

function assertExactFields(object, fields, name) {
  const allowed = new Set(fields);
  for (const key of Object.keys(object)) {
    if (!allowed.has(key)) throw new ValidationError(`${name} contains unsupported field: ${key}`);
  }
  for (const key of fields) {
    if (!Object.hasOwn(object, key)) throw new ValidationError(`${name} is missing field: ${key}`);
  }
}

function assertTimestamp(value, name) {
  assertString(value, name, { max: 64 });
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new ValidationError(`${name} must be a canonical UTC ISO-8601 timestamp`);
  }
}
