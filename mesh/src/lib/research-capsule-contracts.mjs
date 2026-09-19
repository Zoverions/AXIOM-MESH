import {
  assertPlainObject,
  assertString,
  canonicalJson,
  digestObject,
  ValidationError
} from './canonical.mjs';

export const RESEARCH_SOURCE_MANIFEST_SCHEMA = 'axiom-research-source-manifest.v0';
export const RESEARCH_KNOWLEDGE_PROJECTION_SCHEMA = 'axiom-research-knowledge-projection.v0';
export const RESEARCH_OPERATION_CANDIDATE_SCHEMA = 'axiom-research-operation-candidate.v0';
export const RESEARCH_REPRODUCTION_EVIDENCE_SCHEMA = 'axiom-research-reproduction-evidence.v0';
export const RESEARCH_CLAIM_ADJUDICATION_SCHEMA = 'axiom-research-claim-adjudication.v0';

const MAX_OBJECT_BYTES = 65_536;
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;
const TOKEN_PATTERN = /^[a-z][a-z0-9_:-]*$/;
const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/;

const CURRENTNESS_STATES = new Set([
  'current',
  'stale_revision',
  'corrected',
  'retracted',
  'withdrawn',
  'unknown'
]);

const ENTRY_KINDS = new Set([
  'source_statement',
  'extracted_structure',
  'model_inference',
  'unresolved_ambiguity'
]);

const CONFIDENCE_STATES = new Set([
  'source_bound',
  'extracted',
  'inferred',
  'unresolved'
]);

const INTERFACE_KINDS = new Set([
  'mcp_metadata',
  'function',
  'notebook',
  'script',
  'workflow'
]);

const NETWORK_REQUIREMENTS = new Set([
  'none',
  'synthetic_loopback_only',
  'external_required',
  'unknown'
]);

const EFFECT_CLASSES = new Set([
  'read_only',
  'local_mutation',
  'external_mutation',
  'external_message',
  'publication',
  'unknown'
]);

const REPRODUCTION_DISPOSITIONS = new Set([
  'pass',
  'fail',
  'excluded',
  'not_run'
]);

const REPRODUCTION_NETWORK_PROFILES = new Set([
  'none',
  'synthetic_loopback_only'
]);

const CLAIM_ADJUDICATION_STATUSES = new Set([
  'supported',
  'corrected',
  'contested',
  'unsupported',
  'insufficient_evidence'
]);

const SOURCE_MANIFEST_FIELDS = Object.freeze([
  'schema',
  'manifest_id',
  'source_kind',
  'canonical_identifier',
  'source_locator',
  'title',
  'published_at',
  'retrieved_at',
  'manuscript_digest',
  'source_version',
  'supplement_refs',
  'data_refs',
  'code_refs',
  'code_revision',
  'license_refs',
  'authorship_refs',
  'correction_refs',
  'currentness_state',
  'manifest_digest'
]);

const KNOWLEDGE_PROJECTION_FIELDS = Object.freeze([
  'schema',
  'projection_id',
  'source_manifest_digest',
  'entries',
  'projection_digest'
]);

const KNOWLEDGE_ENTRY_FIELDS = Object.freeze([
  'entry_id',
  'entry_kind',
  'source_ref',
  'content_digest',
  'summary',
  'confidence_state',
  'instruction_authority'
]);

const OPERATION_CANDIDATE_FIELDS = Object.freeze([
  'schema',
  'operation_id',
  'source_manifest_digest',
  'source_revision',
  'adapter_kind',
  'interface_kind',
  'source_code_ref',
  'declared_inputs',
  'declared_outputs',
  'dependency_refs',
  'environment_digest',
  'network_requirement',
  'filesystem_requirement',
  'credential_requirement',
  'declared_effect_class',
  'data_classes',
  'determinism_class',
  'reference_output_digests',
  'domain_constraints',
  'execution_authority',
  'operation_digest'
]);

const REPRODUCTION_EVIDENCE_FIELDS = Object.freeze([
  'schema',
  'evidence_id',
  'source_manifest_digest',
  'operation_digest',
  'source_revision',
  'environment_digest',
  'fixture_digests',
  'expected_output_digests',
  'observed_output_digests',
  'tolerance_method',
  'attempt_count',
  'disposition',
  'failure_diagnostics',
  'verifier_id',
  'network_profile',
  'claim_scope',
  'truth_established',
  'authority_effect',
  'evidence_digest'
]);

const CLAIM_ADJUDICATION_FIELDS = Object.freeze([
  'schema',
  'adjudication_id',
  'source_manifest_digest',
  'knowledge_projection_digest',
  'entry_id',
  'entry_content_digest',
  'assessed_at',
  'adjudication_method',
  'evidence_refs',
  'evidence_digests',
  'status',
  'correction_summary',
  'source_statement_mutation',
  'truth_established',
  'instruction_authority',
  'authority_effect',
  'adjudication_digest'
]);

export function researchContractDigest(value, digestField) {
  assertPlainObject(value, 'contract');
  assertString(digestField, 'digestField', { max: 128 });
  const copy = { ...value };
  delete copy[digestField];
  return `sha256:${digestObject(copy)}`;
}

export function verifyResearchSourceManifest(value) {
  const object = boundedCanonical(value, 'ResearchSourceManifest');
  assertExactFields(object, SOURCE_MANIFEST_FIELDS, 'ResearchSourceManifest');
  assertSchema(object.schema, RESEARCH_SOURCE_MANIFEST_SCHEMA, 'ResearchSourceManifest');
  assertIdentifier(object.manifest_id, 'ResearchSourceManifest.manifest_id');
  assertToken(object.source_kind, 'ResearchSourceManifest.source_kind');
  assertNonEmptyString(object.canonical_identifier, 'ResearchSourceManifest.canonical_identifier', 2048);
  assertNonEmptyString(object.source_locator, 'ResearchSourceManifest.source_locator', 2048);
  assertNonEmptyString(object.title, 'ResearchSourceManifest.title', 2048);
  assertTimestamp(object.published_at, 'ResearchSourceManifest.published_at');
  assertTimestamp(object.retrieved_at, 'ResearchSourceManifest.retrieved_at');
  assertDigest(object.manuscript_digest, 'ResearchSourceManifest.manuscript_digest');
  assertNonEmptyString(object.source_version, 'ResearchSourceManifest.source_version', 512);
  assertUniqueStrings(object.supplement_refs, 'ResearchSourceManifest.supplement_refs', { maxItems: 32, itemMax: 2048 });
  assertUniqueStrings(object.data_refs, 'ResearchSourceManifest.data_refs', { maxItems: 32, itemMax: 2048 });
  assertUniqueStrings(object.code_refs, 'ResearchSourceManifest.code_refs', { maxItems: 32, itemMax: 2048 });
  assertNullableString(object.code_revision, 'ResearchSourceManifest.code_revision', 512);
  assertUniqueStrings(object.license_refs, 'ResearchSourceManifest.license_refs', { maxItems: 32, itemMax: 2048 });
  assertUniqueStrings(object.authorship_refs, 'ResearchSourceManifest.authorship_refs', { maxItems: 32, itemMax: 2048 });
  assertUniqueStrings(object.correction_refs, 'ResearchSourceManifest.correction_refs', { maxItems: 32, itemMax: 2048 });
  assertEnum(object.currentness_state, CURRENTNESS_STATES, 'ResearchSourceManifest.currentness_state');
  assertDigest(object.manifest_digest, 'ResearchSourceManifest.manifest_digest');
  assertSelfDigest(object, 'manifest_digest', 'ResearchSourceManifest');
  return object;
}

export function verifyResearchKnowledgeProjection(value) {
  const object = boundedCanonical(value, 'ResearchKnowledgeProjection');
  assertExactFields(object, KNOWLEDGE_PROJECTION_FIELDS, 'ResearchKnowledgeProjection');
  assertSchema(object.schema, RESEARCH_KNOWLEDGE_PROJECTION_SCHEMA, 'ResearchKnowledgeProjection');
  assertIdentifier(object.projection_id, 'ResearchKnowledgeProjection.projection_id');
  assertDigest(object.source_manifest_digest, 'ResearchKnowledgeProjection.source_manifest_digest');

  if (!Array.isArray(object.entries)) {
    throw new ValidationError('ResearchKnowledgeProjection.entries must be an array');
  }
  if (object.entries.length < 1 || object.entries.length > 64) {
    throw new ValidationError('ResearchKnowledgeProjection.entries must contain between 1 and 64 items');
  }
  const entryIds = new Set();
  for (let index = 0; index < object.entries.length; index += 1) {
    const entry = object.entries[index];
    assertPlainObject(entry, `ResearchKnowledgeProjection.entries[${index}]`);
    assertExactFields(entry, KNOWLEDGE_ENTRY_FIELDS, `ResearchKnowledgeProjection.entries[${index}]`);
    assertIdentifier(entry.entry_id, `ResearchKnowledgeProjection.entries[${index}].entry_id`);
    if (entryIds.has(entry.entry_id)) {
      throw new ValidationError('ResearchKnowledgeProjection entry IDs must be unique');
    }
    entryIds.add(entry.entry_id);
    assertEnum(entry.entry_kind, ENTRY_KINDS, `ResearchKnowledgeProjection.entries[${index}].entry_kind`);
    assertNonEmptyString(entry.source_ref, `ResearchKnowledgeProjection.entries[${index}].source_ref`, 2048);
    assertDigest(entry.content_digest, `ResearchKnowledgeProjection.entries[${index}].content_digest`);
    assertNonEmptyString(entry.summary, `ResearchKnowledgeProjection.entries[${index}].summary`, 8192);
    assertEnum(entry.confidence_state, CONFIDENCE_STATES, `ResearchKnowledgeProjection.entries[${index}].confidence_state`);
    if (entry.instruction_authority !== 'none') {
      throw new ValidationError(`ResearchKnowledgeProjection.entries[${index}].instruction_authority must equal none`);
    }
  }

  assertDigest(object.projection_digest, 'ResearchKnowledgeProjection.projection_digest');
  assertSelfDigest(object, 'projection_digest', 'ResearchKnowledgeProjection');
  return object;
}

export function verifyResearchOperationCandidate(value) {
  const object = boundedCanonical(value, 'ResearchOperationCandidate');
  assertExactFields(object, OPERATION_CANDIDATE_FIELDS, 'ResearchOperationCandidate');
  assertSchema(object.schema, RESEARCH_OPERATION_CANDIDATE_SCHEMA, 'ResearchOperationCandidate');
  assertIdentifier(object.operation_id, 'ResearchOperationCandidate.operation_id');
  assertDigest(object.source_manifest_digest, 'ResearchOperationCandidate.source_manifest_digest');
  assertNonEmptyString(object.source_revision, 'ResearchOperationCandidate.source_revision', 512);
  assertToken(object.adapter_kind, 'ResearchOperationCandidate.adapter_kind');
  assertEnum(object.interface_kind, INTERFACE_KINDS, 'ResearchOperationCandidate.interface_kind');
  assertNonEmptyString(object.source_code_ref, 'ResearchOperationCandidate.source_code_ref', 2048);
  assertUniqueStrings(object.declared_inputs, 'ResearchOperationCandidate.declared_inputs', { maxItems: 32, itemMax: 2048 });
  assertUniqueStrings(object.declared_outputs, 'ResearchOperationCandidate.declared_outputs', { maxItems: 32, itemMax: 2048 });
  assertUniqueStrings(object.dependency_refs, 'ResearchOperationCandidate.dependency_refs', { maxItems: 32, itemMax: 2048 });
  assertDigest(object.environment_digest, 'ResearchOperationCandidate.environment_digest');
  assertEnum(object.network_requirement, NETWORK_REQUIREMENTS, 'ResearchOperationCandidate.network_requirement');
  assertToken(object.filesystem_requirement, 'ResearchOperationCandidate.filesystem_requirement');
  assertToken(object.credential_requirement, 'ResearchOperationCandidate.credential_requirement');
  assertEnum(object.declared_effect_class, EFFECT_CLASSES, 'ResearchOperationCandidate.declared_effect_class');
  assertUniqueStrings(object.data_classes, 'ResearchOperationCandidate.data_classes', { maxItems: 32, itemMax: 2048 });
  assertToken(object.determinism_class, 'ResearchOperationCandidate.determinism_class');
  assertUniqueDigests(object.reference_output_digests, 'ResearchOperationCandidate.reference_output_digests', 32);
  assertUniqueStrings(object.domain_constraints, 'ResearchOperationCandidate.domain_constraints', { maxItems: 32, itemMax: 2048 });
  if (object.execution_authority !== 'none') {
    throw new ValidationError('ResearchOperationCandidate.execution_authority must equal none');
  }
  assertDigest(object.operation_digest, 'ResearchOperationCandidate.operation_digest');
  assertSelfDigest(object, 'operation_digest', 'ResearchOperationCandidate');
  return object;
}

export function verifyResearchReproductionEvidence(value) {
  const object = boundedCanonical(value, 'ResearchReproductionEvidence');
  assertExactFields(object, REPRODUCTION_EVIDENCE_FIELDS, 'ResearchReproductionEvidence');
  assertSchema(object.schema, RESEARCH_REPRODUCTION_EVIDENCE_SCHEMA, 'ResearchReproductionEvidence');
  assertIdentifier(object.evidence_id, 'ResearchReproductionEvidence.evidence_id');
  assertDigest(object.source_manifest_digest, 'ResearchReproductionEvidence.source_manifest_digest');
  assertDigest(object.operation_digest, 'ResearchReproductionEvidence.operation_digest');
  assertNonEmptyString(object.source_revision, 'ResearchReproductionEvidence.source_revision', 512);
  assertDigest(object.environment_digest, 'ResearchReproductionEvidence.environment_digest');
  assertUniqueDigests(object.fixture_digests, 'ResearchReproductionEvidence.fixture_digests', 32);
  assertUniqueDigests(object.expected_output_digests, 'ResearchReproductionEvidence.expected_output_digests', 32);
  assertUniqueDigests(object.observed_output_digests, 'ResearchReproductionEvidence.observed_output_digests', 32);
  assertNonEmptyString(object.tolerance_method, 'ResearchReproductionEvidence.tolerance_method', 2048);
  assertInteger(object.attempt_count, 'ResearchReproductionEvidence.attempt_count', { min: 0, max: 1000 });
  assertEnum(object.disposition, REPRODUCTION_DISPOSITIONS, 'ResearchReproductionEvidence.disposition');
  assertUniqueStrings(object.failure_diagnostics, 'ResearchReproductionEvidence.failure_diagnostics', { maxItems: 32, itemMax: 8192 });
  assertNonEmptyString(object.verifier_id, 'ResearchReproductionEvidence.verifier_id', 512);
  assertEnum(object.network_profile, REPRODUCTION_NETWORK_PROFILES, 'ResearchReproductionEvidence.network_profile');
  assertNonEmptyString(object.claim_scope, 'ResearchReproductionEvidence.claim_scope', 8192);
  if (object.truth_established !== false) {
    throw new ValidationError('ResearchReproductionEvidence.truth_established must equal false');
  }
  if (object.authority_effect !== 'none') {
    throw new ValidationError('ResearchReproductionEvidence.authority_effect must equal none');
  }
  assertDigest(object.evidence_digest, 'ResearchReproductionEvidence.evidence_digest');
  assertSelfDigest(object, 'evidence_digest', 'ResearchReproductionEvidence');
  return object;
}

export function verifyResearchClaimAdjudication(value) {
  const object = boundedCanonical(value, 'ResearchClaimAdjudication');
  assertExactFields(object, CLAIM_ADJUDICATION_FIELDS, 'ResearchClaimAdjudication');
  assertSchema(object.schema, RESEARCH_CLAIM_ADJUDICATION_SCHEMA, 'ResearchClaimAdjudication');
  assertIdentifier(object.adjudication_id, 'ResearchClaimAdjudication.adjudication_id');
  assertDigest(object.source_manifest_digest, 'ResearchClaimAdjudication.source_manifest_digest');
  assertDigest(object.knowledge_projection_digest, 'ResearchClaimAdjudication.knowledge_projection_digest');
  assertIdentifier(object.entry_id, 'ResearchClaimAdjudication.entry_id');
  assertDigest(object.entry_content_digest, 'ResearchClaimAdjudication.entry_content_digest');
  assertTimestamp(object.assessed_at, 'ResearchClaimAdjudication.assessed_at');
  assertToken(object.adjudication_method, 'ResearchClaimAdjudication.adjudication_method');
  assertUniqueStrings(object.evidence_refs, 'ResearchClaimAdjudication.evidence_refs', { maxItems: 32, itemMax: 2048 });
  assertUniqueDigests(object.evidence_digests, 'ResearchClaimAdjudication.evidence_digests', 32);
  assertEnum(object.status, CLAIM_ADJUDICATION_STATUSES, 'ResearchClaimAdjudication.status');
  if (
    object.status !== 'insufficient_evidence' &&
    (object.evidence_refs.length === 0 || object.evidence_digests.length === 0)
  ) {
    throw new ValidationError('ResearchClaimAdjudication substantive status requires evidence refs and digests');
  }
  assertNullableString(object.correction_summary, 'ResearchClaimAdjudication.correction_summary', 8192);
  if (object.status === 'corrected' && object.correction_summary === null) {
    throw new ValidationError('ResearchClaimAdjudication.correction_summary is required when status is corrected');
  }
  if (object.status !== 'corrected' && object.correction_summary !== null) {
    throw new ValidationError('ResearchClaimAdjudication.correction_summary must be null unless status is corrected');
  }
  if (object.source_statement_mutation !== 'none') {
    throw new ValidationError('ResearchClaimAdjudication.source_statement_mutation must equal none');
  }
  if (object.truth_established !== false) {
    throw new ValidationError('ResearchClaimAdjudication.truth_established must equal false');
  }
  if (object.instruction_authority !== 'none') {
    throw new ValidationError('ResearchClaimAdjudication.instruction_authority must equal none');
  }
  if (object.authority_effect !== 'none') {
    throw new ValidationError('ResearchClaimAdjudication.authority_effect must equal none');
  }
  assertDigest(object.adjudication_digest, 'ResearchClaimAdjudication.adjudication_digest');
  assertSelfDigest(object, 'adjudication_digest', 'ResearchClaimAdjudication');
  return object;
}

export function verifyResearchClaimAdjudicationBinding(
  adjudicationValue,
  knowledgeProjectionValue,
  sourceManifestValue
) {
  const adjudication = verifyResearchClaimAdjudication(adjudicationValue);
  const knowledgeProjection = verifyResearchKnowledgeProjection(knowledgeProjectionValue);
  const sourceManifest = verifyResearchSourceManifest(sourceManifestValue);

  if (knowledgeProjection.source_manifest_digest !== sourceManifest.manifest_digest) {
    throw new ValidationError('ResearchKnowledgeProjection source manifest digest binding mismatch');
  }
  if (adjudication.source_manifest_digest !== sourceManifest.manifest_digest) {
    throw new ValidationError('ResearchClaimAdjudication source manifest digest binding mismatch');
  }
  if (adjudication.knowledge_projection_digest !== knowledgeProjection.projection_digest) {
    throw new ValidationError('ResearchClaimAdjudication knowledge projection digest binding mismatch');
  }

  const entry = knowledgeProjection.entries.find(item => item.entry_id === adjudication.entry_id);
  if (!entry) {
    throw new ValidationError('ResearchClaimAdjudication entry binding not found');
  }
  if (entry.content_digest !== adjudication.entry_content_digest) {
    throw new ValidationError('ResearchClaimAdjudication entry content digest binding mismatch');
  }

  return adjudication;
}

function boundedCanonical(value, name) {
  assertPlainObject(value, name);
  const encoded = canonicalJson(value);
  if (Buffer.byteLength(encoded, 'utf8') > MAX_OBJECT_BYTES) {
    throw new ValidationError(`${name} exceeds 65536 bytes`);
  }
  return JSON.parse(encoded);
}

function assertExactFields(object, fields, name) {
  const allowed = new Set(fields);
  for (const key of Object.keys(object)) {
    if (!allowed.has(key)) {
      throw new ValidationError(`${name} contains unsupported field: ${key}`);
    }
  }
  for (const key of fields) {
    if (!Object.hasOwn(object, key)) {
      throw new ValidationError(`${name} is missing field: ${key}`);
    }
  }
}

function assertSchema(value, expected, name) {
  if (value !== expected) {
    throw new ValidationError(`${name}.schema must equal ${expected}`);
  }
}

function assertIdentifier(value, name) {
  assertString(value, name, { max: 512 });
  if (!IDENTIFIER_PATTERN.test(value)) {
    throw new ValidationError(`${name} has invalid identifier syntax`);
  }
}

function assertToken(value, name) {
  assertString(value, name, { max: 128 });
  if (!TOKEN_PATTERN.test(value)) {
    throw new ValidationError(`${name} must be a lowercase token`);
  }
}

function assertEnum(value, allowed, name) {
  assertString(value, name, { max: 128 });
  if (!allowed.has(value)) {
    throw new ValidationError(`${name} is not an allowed value`);
  }
}

function assertTimestamp(value, name) {
  assertString(value, name, { max: 64 });
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new ValidationError(`${name} must be a canonical UTC ISO-8601 timestamp`);
  }
}

function assertDigest(value, name) {
  assertString(value, name, { max: 71 });
  if (!DIGEST_PATTERN.test(value)) {
    throw new ValidationError(`${name} must be a sha256 digest`);
  }
}

function assertNonEmptyString(value, name, max) {
  assertString(value, name, { max });
  if (value.length === 0) {
    throw new ValidationError(`${name} must not be empty`);
  }
}

function assertNullableString(value, name, max) {
  if (value === null) return;
  assertNonEmptyString(value, name, max);
}

function assertUniqueStrings(value, name, {
  minItems = 0,
  maxItems = 32,
  itemMax = 2048
} = {}) {
  if (!Array.isArray(value)) {
    throw new ValidationError(`${name} must be an array`);
  }
  if (value.length < minItems) {
    throw new ValidationError(`${name} must contain at least ${minItems} items`);
  }
  if (value.length > maxItems) {
    throw new ValidationError(`${name} must contain at most ${maxItems} items`);
  }
  const seen = new Set();
  for (let index = 0; index < value.length; index += 1) {
    const item = value[index];
    assertNonEmptyString(item, `${name}[${index}]`, itemMax);
    if (seen.has(item)) {
      throw new ValidationError(`${name} items must be unique`);
    }
    seen.add(item);
  }
}

function assertUniqueDigests(value, name, maxItems) {
  assertUniqueStrings(value, name, { maxItems, itemMax: 71 });
  for (let index = 0; index < value.length; index += 1) {
    assertDigest(value[index], `${name}[${index}]`);
  }
}

function assertInteger(value, name, { min, max }) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new ValidationError(`${name} must be an integer between ${min} and ${max}`);
  }
}

function assertSelfDigest(object, digestField, name) {
  const expected = researchContractDigest(object, digestField);
  if (object[digestField] !== expected) {
    throw new ValidationError(`${name} digest mismatch`);
  }
}
