import {
  ValidationError,
  assertPlainObject,
  assertString,
  digestObject
} from './canonical.mjs';
import { normalizeLocalContextCandidate } from './context-claim-resolution.mjs';

export const LOCAL_CONTEXT_SEMANTIC_SOURCE_EVIDENCE_SCHEMA =
  'axiom-local-context-semantic-source-evidence.v1';
export const LOCAL_CONTEXT_SEMANTIC_SOURCE_EVIDENCE_MEMORY_KIND =
  'context.semantic.source-evidence';
export const LOCAL_CONTEXT_SEMANTIC_SOURCE_EVIDENCE_MEMORY_SCHEMA =
  'axiom-local-context-semantic-source-evidence-memory.v1';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const NON_OWNER_SOURCE_CLASSES = new Set([
  'local-model-generated',
  'retrieved-external',
  'imported',
  'remote-agent',
  'remote-social',
  'tool-output'
]);
const PRINCIPAL_REQUIRED_SOURCE_CLASSES = new Set([
  'remote-agent',
  'remote-social',
  'tool-output'
]);
const EVIDENCE_KEYS = Object.freeze([
  'schema',
  'owner_subject_ref',
  'candidate_digest',
  'source_class',
  'source_principal_ref',
  'source_runtime_id',
  'source_artifact_digest',
  'content_payload_digest',
  'evidence_basis',
  'source_identity_verified',
  'artifact_authenticity_verified',
  'raw_source_bytes_embedded',
  'authority_effect',
  'downstream_effect_authorized',
  'may_authorize_tools',
  'may_modify_policy',
  'may_self_persist',
  'may_retransmit',
  'evidence_digest'
]);
const CREATE_KEYS = Object.freeze([
  'source_class',
  'source_principal_ref',
  'source_runtime_id',
  'source_artifact_digest'
]);

function exactKeys(value, allowed, label) {
  assertPlainObject(value, label);
  const actual = Object.keys(value).sort();
  const expected = [...allowed].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new ValidationError(`${label} fields are unsupported or missing`);
  }
}

function allowedKeys(value, allowed, label) {
  assertPlainObject(value, label);
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) {
      throw new ValidationError(`${label} field is unsupported: ${key}`);
    }
  }
}

function boundedId(value, label) {
  return assertString(value, label, { min: 1, max: 160, pattern: ID });
}

function optionalIdOrNull(value, label) {
  if (value === undefined || value === null) return null;
  return boundedId(value, label);
}

function digest(value, label) {
  return assertString(value, label, { min: 64, max: 64, pattern: DIGEST });
}

function sourceClass(value) {
  const normalized = assertString(value, 'semantic source evidence source_class', {
    min: 1,
    max: 64
  });
  if (!NON_OWNER_SOURCE_CLASSES.has(normalized)) {
    throw new ValidationError('semantic source evidence requires a supported non-owner source class');
  }
  return normalized;
}

function validateSourceBindings({ source_class, source_principal_ref, source_runtime_id }) {
  if (source_class === 'local-model-generated' && source_runtime_id === null) {
    throw new ValidationError(
      'local-model-generated semantic source evidence requires source_runtime_id'
    );
  }
  if (PRINCIPAL_REQUIRED_SOURCE_CLASSES.has(source_class) && source_principal_ref === null) {
    throw new ValidationError(
      `${source_class} semantic source evidence requires source_principal_ref`
    );
  }
}

function evidenceBody(value) {
  return {
    schema: value.schema,
    owner_subject_ref: value.owner_subject_ref,
    candidate_digest: value.candidate_digest,
    source_class: value.source_class,
    source_principal_ref: value.source_principal_ref,
    source_runtime_id: value.source_runtime_id,
    source_artifact_digest: value.source_artifact_digest,
    content_payload_digest: value.content_payload_digest,
    evidence_basis: value.evidence_basis,
    source_identity_verified: value.source_identity_verified,
    artifact_authenticity_verified: value.artifact_authenticity_verified,
    raw_source_bytes_embedded: value.raw_source_bytes_embedded,
    authority_effect: value.authority_effect,
    downstream_effect_authorized: value.downstream_effect_authorized,
    may_authorize_tools: value.may_authorize_tools,
    may_modify_policy: value.may_modify_policy,
    may_self_persist: value.may_self_persist,
    may_retransmit: value.may_retransmit
  };
}

function normalizeEvidenceShape(raw) {
  exactKeys(raw, EVIDENCE_KEYS, 'semantic source evidence');
  if (raw.schema !== LOCAL_CONTEXT_SEMANTIC_SOURCE_EVIDENCE_SCHEMA) {
    throw new ValidationError(
      `semantic source evidence schema must be ${LOCAL_CONTEXT_SEMANTIC_SOURCE_EVIDENCE_SCHEMA}`
    );
  }
  const normalized = {
    schema: LOCAL_CONTEXT_SEMANTIC_SOURCE_EVIDENCE_SCHEMA,
    owner_subject_ref: boundedId(raw.owner_subject_ref, 'semantic source evidence owner_subject_ref'),
    candidate_digest: digest(raw.candidate_digest, 'semantic source evidence candidate_digest'),
    source_class: sourceClass(raw.source_class),
    source_principal_ref: optionalIdOrNull(
      raw.source_principal_ref,
      'semantic source evidence source_principal_ref'
    ),
    source_runtime_id: optionalIdOrNull(
      raw.source_runtime_id,
      'semantic source evidence source_runtime_id'
    ),
    source_artifact_digest: digest(
      raw.source_artifact_digest,
      'semantic source evidence source_artifact_digest'
    ),
    content_payload_digest: digest(
      raw.content_payload_digest,
      'semantic source evidence content_payload_digest'
    ),
    evidence_basis: raw.evidence_basis,
    source_identity_verified: raw.source_identity_verified,
    artifact_authenticity_verified: raw.artifact_authenticity_verified,
    raw_source_bytes_embedded: raw.raw_source_bytes_embedded,
    authority_effect: raw.authority_effect,
    downstream_effect_authorized: raw.downstream_effect_authorized,
    may_authorize_tools: raw.may_authorize_tools,
    may_modify_policy: raw.may_modify_policy,
    may_self_persist: raw.may_self_persist,
    may_retransmit: raw.may_retransmit
  };

  validateSourceBindings(normalized);
  if (normalized.evidence_basis !== 'owner-observed-artifact') {
    throw new ValidationError(
      'semantic source evidence basis must remain owner-observed-artifact'
    );
  }
  if (normalized.source_identity_verified !== false) {
    throw new ValidationError('semantic source evidence source identity must remain unverified');
  }
  if (normalized.artifact_authenticity_verified !== false) {
    throw new ValidationError('semantic source evidence artifact authenticity must remain unverified');
  }
  if (normalized.raw_source_bytes_embedded !== false) {
    throw new ValidationError('semantic source evidence must not embed raw source bytes');
  }
  if (normalized.authority_effect !== 'none') {
    throw new ValidationError('semantic source evidence authority_effect must remain none');
  }
  for (const key of [
    'downstream_effect_authorized',
    'may_authorize_tools',
    'may_modify_policy',
    'may_self_persist',
    'may_retransmit'
  ]) {
    if (normalized[key] !== false) {
      throw new ValidationError(`semantic source evidence ${key} must remain false`);
    }
  }

  const expectedDigest = digestObject(evidenceBody(normalized));
  if (digest(raw.evidence_digest, 'semantic source evidence evidence_digest') !== expectedDigest) {
    throw new ValidationError('semantic source evidence digest does not match normalized evidence');
  }
  return Object.freeze({ ...normalized, evidence_digest: expectedDigest });
}

export function createLocalContextSemanticSourceEvidence(candidateInput, options = {}) {
  const candidate = normalizeLocalContextCandidate(candidateInput);
  allowedKeys(options, CREATE_KEYS, 'semantic source evidence options');
  const normalizedSourceClass = sourceClass(options.source_class);
  const sourcePrincipalRef = optionalIdOrNull(
    options.source_principal_ref,
    'semantic source evidence source_principal_ref'
  );
  const sourceRuntimeId = optionalIdOrNull(
    options.source_runtime_id,
    'semantic source evidence source_runtime_id'
  );
  const sourceArtifactDigest = digest(
    options.source_artifact_digest,
    'semantic source evidence source_artifact_digest'
  );
  validateSourceBindings({
    source_class: normalizedSourceClass,
    source_principal_ref: sourcePrincipalRef,
    source_runtime_id: sourceRuntimeId
  });

  const body = {
    schema: LOCAL_CONTEXT_SEMANTIC_SOURCE_EVIDENCE_SCHEMA,
    owner_subject_ref: candidate.owner_subject_ref,
    candidate_digest: digestObject(candidate),
    source_class: normalizedSourceClass,
    source_principal_ref: sourcePrincipalRef,
    source_runtime_id: sourceRuntimeId,
    source_artifact_digest: sourceArtifactDigest,
    content_payload_digest: digestObject(candidate.value),
    evidence_basis: 'owner-observed-artifact',
    source_identity_verified: false,
    artifact_authenticity_verified: false,
    raw_source_bytes_embedded: false,
    authority_effect: 'none',
    downstream_effect_authorized: false,
    may_authorize_tools: false,
    may_modify_policy: false,
    may_self_persist: false,
    may_retransmit: false
  };
  return Object.freeze({
    ...body,
    evidence_digest: digestObject(body)
  });
}

export function verifyLocalContextSemanticSourceEvidence(evidenceInput, candidateInput) {
  const candidate = normalizeLocalContextCandidate(candidateInput);
  const evidence = normalizeEvidenceShape(evidenceInput);
  if (evidence.owner_subject_ref !== candidate.owner_subject_ref) {
    throw new ValidationError('semantic source evidence owner does not match context candidate');
  }
  if (evidence.candidate_digest !== digestObject(candidate)) {
    throw new ValidationError('semantic source evidence candidate digest does not match context candidate');
  }
  if (evidence.content_payload_digest !== digestObject(candidate.value)) {
    throw new ValidationError('semantic source evidence content digest does not match context candidate');
  }
  return evidence;
}

function memoryMetadata(evidence) {
  return Object.freeze({
    schema: LOCAL_CONTEXT_SEMANTIC_SOURCE_EVIDENCE_MEMORY_SCHEMA,
    evidence_digest: evidence.evidence_digest,
    candidate_digest: evidence.candidate_digest,
    source_class: evidence.source_class,
    authority_effect: 'none'
  });
}

export function projectLocalContextSemanticSourceEvidenceMemoryPut(evidenceInput) {
  const evidence = normalizeEvidenceShape(evidenceInput);
  return Object.freeze({
    kind: LOCAL_CONTEXT_SEMANTIC_SOURCE_EVIDENCE_MEMORY_KIND,
    content: evidence,
    metadata: memoryMetadata(evidence)
  });
}

export function localContextSemanticSourceEvidenceMemoryDigest(evidenceInput) {
  const evidence = normalizeEvidenceShape(evidenceInput);
  const metadata = memoryMetadata(evidence);
  return digestObject({
    owner: evidence.owner_subject_ref,
    kind: LOCAL_CONTEXT_SEMANTIC_SOURCE_EVIDENCE_MEMORY_KIND,
    content: evidence,
    metadata
  });
}
