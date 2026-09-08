import { ValidationError, canonicalJson, canonicalize, sha256 } from './canonical.mjs';

const MAX_OBJECT_BYTES = 64 * 1024;
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;
const EMPTY_SHA256 = `sha256:${sha256(Buffer.alloc(0))}`;

const COMMON_FIELDS = new Set([
  'schema',
  'id',
  'object_type',
  'schema_version',
  'created_at',
  'created_by',
  'revision',
  'previous_revision',
  'content_digest',
  'provenance_refs',
  'canonical_state',
  'machine_generated',
  'generation_metadata',
  'authority_effect'
]);

const SOURCE_FIELDS = new Set([
  ...COMMON_FIELDS,
  'source_type',
  'title',
  'authors',
  'published_at',
  'retrieved_at',
  'external_identifiers',
  'original_content_digest',
  'parent_source_refs',
  'raw_artifact_ref'
]);

const CLAIM_FIELDS = new Set([
  ...COMMON_FIELDS,
  'proposition',
  'claim_kind',
  'scope',
  'qualifiers',
  'assumption_refs',
  'source_anchors'
]);

const EVIDENCE_FIELDS = new Set([
  ...COMMON_FIELDS,
  'target_claim_ref',
  'direction',
  'evidence_type',
  'source_refs',
  'observation_refs',
  'methodology_refs',
  'independence_state',
  'limitations',
  'applicability_scope'
]);

const SOURCE_TYPES = new Set([
  'paper', 'preprint', 'dataset', 'book', 'thesis', 'patent', 'report', 'standard',
  'recording', 'webpage', 'archive', 'instrument_output', 'simulation', 'other'
]);
const CLAIM_KINDS = new Set([
  'observation_report', 'empirical_generalization', 'causal', 'mechanistic', 'interpretive',
  'theoretical', 'mathematical', 'forecast', 'normative', 'hypothesis', 'speculative'
]);
const EVIDENCE_DIRECTIONS = new Set(['supports', 'weakens', 'contradicts', 'discriminates', 'neutral']);
const EVIDENCE_TYPES = new Set([
  'direct_observation', 'experiment', 'replication', 'dataset', 'statistical_result',
  'logical_derivation', 'mathematical_proof', 'simulation', 'testimony', 'historical_record', 'other'
]);
const INDEPENDENCE_STATES = new Set(['independent', 'partially_independent', 'dependent', 'unknown']);

function fail(message) {
  throw new ValidationError(message);
}

function record(value, label = 'epistemic proposal') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object`);
  return value;
}

function exact(value, expected, label) {
  if (value !== expected) fail(`${label} must equal ${expected}`);
  return value;
}

function text(value, label, { min = 1, max = 4096 } = {}) {
  if (typeof value !== 'string') fail(`${label} must be a string`);
  if (value.length < min || value.length > max) fail(`${label} must contain ${min}-${max} characters`);
  return value;
}

function integer(value, label, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (!Number.isInteger(value) || value < min || value > max) fail(`${label} must be an integer from ${min} to ${max}`);
  return value;
}

function canonicalTimestamp(value, label) {
  const raw = text(value, label, { min: 24, max: 64 });
  const parsed = new Date(raw);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== raw) fail(`${label} must be a canonical ISO timestamp`);
  return raw;
}

function digest(value, label) {
  if (typeof value !== 'string' || !DIGEST_PATTERN.test(value)) fail(`${label} must be a sha256 digest`);
  return value;
}

function enumeration(value, allowed, label) {
  if (typeof value !== 'string' || !allowed.has(value)) fail(`${label} has an unsupported value`);
  return value;
}

function stringArray(value, label, { minItems = 0, maxItems = 64, itemMax = 256, unique = false } = {}) {
  if (!Array.isArray(value) || value.length < minItems || value.length > maxItems) {
    fail(`${label} must contain ${minItems}-${maxItems} items`);
  }
  const output = value.map((item, index) => text(item, `${label}[${index}]`, { max: itemMax }));
  if (unique && new Set(output).size !== output.length) fail(`${label} must contain unique items`);
  return output;
}

function rejectUnknownFields(value, allowed, label) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) fail(`${label} contains unknown field ${key}`);
  }
}

function validateGenerationMetadata(value) {
  const metadata = record(value, 'generation_metadata');
  const allowed = new Set(['actor_id', 'version', 'run_id', 'input_digest', 'generated_at', 'role']);
  rejectUnknownFields(metadata, allowed, 'generation_metadata');
  for (const required of ['actor_id', 'run_id', 'input_digest', 'generated_at', 'role']) {
    if (!Object.hasOwn(metadata, required)) fail(`generation_metadata.${required} is required`);
  }
  text(metadata.actor_id, 'generation_metadata.actor_id', { max: 256 });
  if (Object.hasOwn(metadata, 'version')) text(metadata.version, 'generation_metadata.version', { max: 128 });
  text(metadata.run_id, 'generation_metadata.run_id', { max: 256 });
  digest(metadata.input_digest, 'generation_metadata.input_digest');
  canonicalTimestamp(metadata.generated_at, 'generation_metadata.generated_at');
  text(metadata.role, 'generation_metadata.role', { max: 128 });
}

function validateCommon(value) {
  for (const required of [
    'schema', 'id', 'object_type', 'schema_version', 'created_at', 'created_by', 'revision',
    'content_digest', 'provenance_refs', 'canonical_state', 'machine_generated', 'authority_effect'
  ]) {
    if (!Object.hasOwn(value, required)) fail(`${required} is required`);
  }

  exact(value.schema, 'axiom-epistemic-record.v0', 'schema');
  text(value.id, 'id', { max: 256 });
  enumeration(value.object_type, new Set(['source', 'claim', 'evidence']), 'object_type');
  exact(value.schema_version, '0.1.0', 'schema_version');
  canonicalTimestamp(value.created_at, 'created_at');
  text(value.created_by, 'created_by', { max: 256 });
  integer(value.revision, 'revision', { min: 1, max: 2147483647 });
  digest(value.content_digest, 'content_digest');
  stringArray(value.provenance_refs, 'provenance_refs', { maxItems: 64, itemMax: 256, unique: true });
  exact(value.canonical_state, 'proposal', 'canonical_state');
  if (typeof value.machine_generated !== 'boolean') fail('machine_generated must be a boolean');
  exact(value.authority_effect, 'none', 'authority_effect');

  if (value.revision === 1 && Object.hasOwn(value, 'previous_revision')) fail('previous_revision must be absent for revision 1');
  if (value.revision > 1) {
    if (!Object.hasOwn(value, 'previous_revision')) fail('previous_revision is required after revision 1');
    digest(value.previous_revision, 'previous_revision');
  }

  if (value.machine_generated) {
    if (!Object.hasOwn(value, 'generation_metadata')) fail('generation_metadata is required when machine_generated is true');
    validateGenerationMetadata(value.generation_metadata);
  } else if (Object.hasOwn(value, 'generation_metadata')) {
    fail('generation_metadata must be absent when machine_generated is false');
  }
}

function validateSource(value) {
  rejectUnknownFields(value, SOURCE_FIELDS, 'source proposal');
  for (const required of ['source_type', 'retrieved_at', 'original_content_digest']) {
    if (!Object.hasOwn(value, required)) fail(`${required} is required for source proposals`);
  }
  enumeration(value.source_type, SOURCE_TYPES, 'source_type');
  canonicalTimestamp(value.retrieved_at, 'retrieved_at');
  digest(value.original_content_digest, 'original_content_digest');
  if (value.original_content_digest === EMPTY_SHA256) fail('original_content_digest cannot represent empty source bytes');
  if (Object.hasOwn(value, 'title')) text(value.title, 'title', { min: 0, max: 1024 });
  if (Object.hasOwn(value, 'authors')) stringArray(value.authors, 'authors', { maxItems: 64, itemMax: 256 });
  if (Object.hasOwn(value, 'published_at')) canonicalTimestamp(value.published_at, 'published_at');
  if (Object.hasOwn(value, 'external_identifiers')) {
    stringArray(value.external_identifiers, 'external_identifiers', { maxItems: 32, itemMax: 1024, unique: true });
  }
  if (Object.hasOwn(value, 'parent_source_refs')) {
    stringArray(value.parent_source_refs, 'parent_source_refs', { maxItems: 32, itemMax: 256, unique: true });
  }
  if (Object.hasOwn(value, 'raw_artifact_ref')) text(value.raw_artifact_ref, 'raw_artifact_ref', { max: 2048 });
}

function validateSourceAnchor(value, index) {
  const anchor = record(value, `source_anchors[${index}]`);
  const allowed = new Set(['source_ref', 'page', 'section', 'start_offset', 'end_offset', 'quote_digest']);
  rejectUnknownFields(anchor, allowed, `source_anchors[${index}]`);
  if (!Object.hasOwn(anchor, 'source_ref')) fail(`source_anchors[${index}].source_ref is required`);
  text(anchor.source_ref, `source_anchors[${index}].source_ref`, { max: 256 });
  if (Object.hasOwn(anchor, 'page')) integer(anchor.page, `source_anchors[${index}].page`, { min: 1, max: 1000000 });
  if (Object.hasOwn(anchor, 'section')) text(anchor.section, `source_anchors[${index}].section`, { min: 0, max: 1024 });
  if (Object.hasOwn(anchor, 'start_offset')) {
    integer(anchor.start_offset, `source_anchors[${index}].start_offset`, { min: 0, max: 1073741824 });
  }
  if (Object.hasOwn(anchor, 'end_offset')) {
    integer(anchor.end_offset, `source_anchors[${index}].end_offset`, { min: 0, max: 1073741824 });
  }
  if (Object.hasOwn(anchor, 'start_offset') && Object.hasOwn(anchor, 'end_offset') && anchor.start_offset > anchor.end_offset) {
    fail(`source_anchors[${index}] offset range is reversed`);
  }
  if (Object.hasOwn(anchor, 'quote_digest')) digest(anchor.quote_digest, `source_anchors[${index}].quote_digest`);
}

function validateClaim(value) {
  rejectUnknownFields(value, CLAIM_FIELDS, 'claim proposal');
  for (const required of ['proposition', 'claim_kind', 'scope', 'source_anchors']) {
    if (!Object.hasOwn(value, required)) fail(`${required} is required for claim proposals`);
  }
  text(value.proposition, 'proposition', { max: 16384 });
  enumeration(value.claim_kind, CLAIM_KINDS, 'claim_kind');
  text(value.scope, 'scope', { max: 4096 });
  if (Object.hasOwn(value, 'qualifiers')) stringArray(value.qualifiers, 'qualifiers', { maxItems: 32, itemMax: 1024 });
  if (Object.hasOwn(value, 'assumption_refs')) {
    stringArray(value.assumption_refs, 'assumption_refs', { maxItems: 64, itemMax: 256, unique: true });
  }
  if (!Array.isArray(value.source_anchors) || value.source_anchors.length < 1 || value.source_anchors.length > 32) {
    fail('source_anchors must contain 1-32 items');
  }
  value.source_anchors.forEach(validateSourceAnchor);
}

function validateEvidence(value) {
  rejectUnknownFields(value, EVIDENCE_FIELDS, 'evidence proposal');
  for (const required of ['target_claim_ref', 'direction', 'evidence_type', 'source_refs', 'independence_state', 'applicability_scope']) {
    if (!Object.hasOwn(value, required)) fail(`${required} is required for evidence proposals`);
  }
  text(value.target_claim_ref, 'target_claim_ref', { max: 256 });
  enumeration(value.direction, EVIDENCE_DIRECTIONS, 'direction');
  enumeration(value.evidence_type, EVIDENCE_TYPES, 'evidence_type');
  stringArray(value.source_refs, 'source_refs', { minItems: 1, maxItems: 64, itemMax: 256, unique: true });
  if (Object.hasOwn(value, 'observation_refs')) {
    stringArray(value.observation_refs, 'observation_refs', { maxItems: 64, itemMax: 256, unique: true });
  }
  if (Object.hasOwn(value, 'methodology_refs')) {
    stringArray(value.methodology_refs, 'methodology_refs', { maxItems: 64, itemMax: 256, unique: true });
  }
  enumeration(value.independence_state, INDEPENDENCE_STATES, 'independence_state');
  if (Object.hasOwn(value, 'limitations')) stringArray(value.limitations, 'limitations', { maxItems: 64, itemMax: 2048 });
  text(value.applicability_scope, 'applicability_scope', { max: 4096 });
}

function validateSemantics(value) {
  validateCommon(value);
  if (value.object_type === 'source') validateSource(value);
  else if (value.object_type === 'claim') validateClaim(value);
  else if (value.object_type === 'evidence') validateEvidence(value);
}

function assertObjectSize(value) {
  const bytes = Buffer.byteLength(canonicalJson(value), 'utf8');
  if (bytes > MAX_OBJECT_BYTES) fail(`serialized epistemic object exceeds 64 KiB (${MAX_OBJECT_BYTES} bytes)`);
}

export function computeEpistemicContentDigest(value) {
  const normalized = canonicalize(value);
  record(normalized);
  if (Object.hasOwn(normalized, 'content_digest')) delete normalized.content_digest;
  return `sha256:${sha256(canonicalJson(normalized))}`;
}

export function validateEpistemicProposal(value) {
  const normalized = canonicalize(value);
  record(normalized);
  validateSemantics(normalized);
  const expectedDigest = computeEpistemicContentDigest(normalized);
  if (normalized.content_digest !== expectedDigest) fail('content_digest does not match canonical proposal content');
  assertObjectSize(normalized);
  return normalized;
}

export function finalizeEpistemicProposal(value) {
  const normalized = canonicalize(value);
  record(normalized);
  const expectedDigest = computeEpistemicContentDigest(normalized);
  if (Object.hasOwn(normalized, 'content_digest') && normalized.content_digest !== expectedDigest) {
    fail('content_digest does not match canonical proposal content');
  }
  normalized.content_digest = expectedDigest;
  return validateEpistemicProposal(normalized);
}

export const EPISTEMIC_CONTRACT_LIMITS = Object.freeze({
  serialized_object_bytes: MAX_OBJECT_BYTES,
  live_model_provider_calls: 0,
  network_requests: 0,
  external_effects: 0,
  production_credentials: 0
});
