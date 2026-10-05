import { createPublicKey, verify } from 'node:crypto';

import {
  canonicalJson,
  digestObject,
  sha256,
  ValidationError
} from './canonical.mjs';
import { validatePathObservationEvidence } from './path-observation-evidence.mjs';

export const MEASUREMENT_SOURCE_PACKAGE_SCHEMA = 'axiom-measurement-source-envelopes.v0';
export const MEASUREMENT_SOURCE_PACKAGE_STATUS = 'inert-source-evidence-laboratory';
export const MEASUREMENT_SOURCE_ENVELOPE_SCHEMA = 'axiom-measurement-source-envelope.v0';

export const SOURCE_KIND_BY_EVIDENCE_KIND = Object.freeze({
  'node-profile': 'node-profile-observation',
  'node-attestation': 'attestation-observation',
  'node-energy': 'energy-observation',
  'link-profile': 'link-profile-observation',
  'link-latency': 'latency-measurement',
  'link-regulatory': 'regulatory-query',
  'link-failure-domains': 'failure-domain-assessment'
});

export const SOURCE_RECORDER_ROLE_BY_KIND = Object.freeze({
  'node-profile-observation': 'node-profile-recorder',
  'attestation-observation': 'attestation-source-recorder',
  'energy-observation': 'energy-source-recorder',
  'link-profile-observation': 'link-profile-recorder',
  'latency-measurement': 'telemetry-source-recorder',
  'regulatory-query': 'regulatory-source-recorder',
  'failure-domain-assessment': 'failure-domain-source-recorder'
});

export const MEASUREMENT_SOURCE_KINDS = Object.freeze(
  Object.keys(SOURCE_RECORDER_ROLE_BY_KIND)
);

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const CONTENT_TYPE = /^[A-Za-z0-9][A-Za-z0-9.+/-]{0,126}$/;
const MAX_SOURCE_RECORDS = 8192;
const MAX_ARTIFACT_BYTES = 1_000_000_000;
const MAX_CLOCK_UNCERTAINTY_MS = 86_400_000;
const MAX_POLICY_AGE_SECONDS = 31_536_000;

const RESULT_KINDS = Object.freeze(['numeric', 'categorical', 'structured']);
const RETENTION_STATUSES = Object.freeze([
  'retained-local',
  'retained-external',
  'not-retained'
]);
const REPRODUCTION_STATUSES = Object.freeze([
  'not-attempted',
  'attempted-failed',
  'reported-reproduced',
  'not-applicable'
]);
const UNCERTAINTY_KINDS = Object.freeze(['unknown', 'not-applicable', 'interval']);

export function validateMeasurementSourceEnvelopes(
  pathFabricDocument,
  evidencePackage,
  sourcePackage,
  {
    trustedSigners,
    evaluatedAt,
    maxAgeSecondsByKind,
    trustedSourceRecorders,
    maxSourceAgeSecondsByKind,
    maxClaimLagSecondsByKind,
    maxClockUncertaintyMsByKind
  } = {}
) {
  const evidenceVerification = validatePathObservationEvidence(
    pathFabricDocument,
    evidencePackage,
    { trustedSigners, evaluatedAt, maxAgeSecondsByKind }
  );
  const evaluationTime = parseTimestamp(evaluatedAt, 'evaluatedAt');
  const sourceTrust = normalizeTrustedSourceRecorders(trustedSourceRecorders);
  const sourceAgePolicy = normalizeSourcePolicy(
    maxSourceAgeSecondsByKind,
    'maxSourceAgeSecondsByKind',
    1,
    MAX_POLICY_AGE_SECONDS
  );
  const claimLagPolicy = normalizeSourcePolicy(
    maxClaimLagSecondsByKind,
    'maxClaimLagSecondsByKind',
    0,
    MAX_POLICY_AGE_SECONDS
  );
  const clockPolicy = normalizeSourcePolicy(
    maxClockUncertaintyMsByKind,
    'maxClockUncertaintyMsByKind',
    0,
    MAX_CLOCK_UNCERTAINTY_MS
  );

  exactObject(sourcePackage, 'Measurement source package', [
    'schema',
    'version',
    'status',
    'portfolio_digest',
    'evidence_verification_digest',
    'envelopes',
    'authority_effect',
    'network_effect',
    'runtime_activation'
  ]);

  if (
    sourcePackage.schema !== MEASUREMENT_SOURCE_PACKAGE_SCHEMA
    || sourcePackage.version !== 0
    || sourcePackage.status !== MEASUREMENT_SOURCE_PACKAGE_STATUS
    || sourcePackage.authority_effect !== 'none'
    || sourcePackage.network_effect !== 'none'
    || sourcePackage.runtime_activation !== false
  ) {
    throw new ValidationError('Measurement source package activation boundary is invalid');
  }

  digest(sourcePackage.portfolio_digest, 'sourcePackage.portfolio_digest');
  digest(
    sourcePackage.evidence_verification_digest,
    'sourcePackage.evidence_verification_digest'
  );
  if (sourcePackage.portfolio_digest !== evidenceVerification.portfolio_digest) {
    throw new ValidationError('Measurement source package does not bind the exact path portfolio');
  }
  if (
    sourcePackage.evidence_verification_digest
    !== evidenceVerification.verification_digest
  ) {
    throw new ValidationError('Measurement source package does not bind the exact evidence verification');
  }

  if (
    !Array.isArray(sourcePackage.envelopes)
    || sourcePackage.envelopes.length < 1
    || sourcePackage.envelopes.length > MAX_SOURCE_RECORDS
  ) {
    throw new ValidationError(`Measurement source package requires 1-${MAX_SOURCE_RECORDS} envelopes`);
  }

  const expectedSources = buildExpectedSources(evidencePackage);
  const seenSourceRefs = new Set();
  const envelopeDigests = [];

  for (let index = 0; index < sourcePackage.envelopes.length; index += 1) {
    const normalized = validateSourceRecord(
      sourcePackage.envelopes[index],
      index,
      expectedSources,
      sourceTrust.byRecorderId,
      evaluationTime,
      sourceAgePolicy,
      claimLagPolicy,
      clockPolicy
    );

    if (seenSourceRefs.has(normalized.envelope.source_ref)) {
      throw new ValidationError(
        `Measurement source ${normalized.envelope.source_ref} is duplicated`
      );
    }
    seenSourceRefs.add(normalized.envelope.source_ref);
    envelopeDigests.push(normalized.envelope_digest);
  }

  if (seenSourceRefs.size !== expectedSources.size) {
    const missing = [...expectedSources.keys()]
      .filter(sourceRef => !seenSourceRefs.has(sourceRef))
      .sort();
    throw new ValidationError(
      `Measurement source coverage is incomplete${missing.length ? `: missing ${missing.join(', ')}` : ''}`
    );
  }

  for (const sourceRef of seenSourceRefs) {
    if (!expectedSources.has(sourceRef)) {
      throw new ValidationError(`Measurement source package contains unexpected source ${sourceRef}`);
    }
  }

  envelopeDigests.sort();
  const sourceVerificationPolicyDigest = digestObject({
    evaluated_at: evaluationTime.toISOString(),
    source_age_policy: sourceAgePolicy,
    claim_lag_policy: claimLagPolicy,
    clock_uncertainty_policy: clockPolicy,
    trusted_source_recorders: sourceTrust.digestEntries
  });
  const sourceVerificationDigest = digestObject({
    schema: MEASUREMENT_SOURCE_PACKAGE_SCHEMA,
    portfolio_digest: evidenceVerification.portfolio_digest,
    evidence_verification_digest: evidenceVerification.verification_digest,
    source_verification_policy_digest: sourceVerificationPolicyDigest,
    envelope_digests: envelopeDigests
  });

  return Object.freeze({
    valid: true,
    schema: MEASUREMENT_SOURCE_PACKAGE_SCHEMA,
    portfolio_digest: evidenceVerification.portfolio_digest,
    evidence_verification_digest: evidenceVerification.verification_digest,
    evaluated_at: evaluationTime.toISOString(),
    evidence_count: evidenceVerification.evidence_count,
    source_count: envelopeDigests.length,
    evidence_signatures_verified: true,
    source_signatures_verified: true,
    source_coverage_complete: true,
    method_identity_bound: true,
    artifact_digests_bound: true,
    clock_uncertainty_bound: true,
    source_freshness_satisfied: true,
    claim_lag_satisfied: true,
    independent_reproduction_verified: false,
    measurement_accuracy_established: false,
    truth_established: false,
    source_verification_policy_digest: sourceVerificationPolicyDigest,
    source_verification_digest: sourceVerificationDigest,
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false,
    live_routing_changed: false,
    radio_control_performed: false
  });
}

function buildExpectedSources(evidencePackage) {
  const expected = new Map();
  for (const record of evidencePackage.evidence_records) {
    const statement = record.statement;
    const sourceKind = SOURCE_KIND_BY_EVIDENCE_KIND[statement.kind];
    if (!sourceKind) {
      throw new ValidationError(`Unsupported evidence kind ${statement.kind} for source binding`);
    }
    const prior = expected.get(statement.source_ref);
    if (!prior) {
      expected.set(statement.source_ref, {
        artifact_sha256: statement.source_digest,
        source_kind: sourceKind,
        evidence: [statement]
      });
      continue;
    }
    if (prior.artifact_sha256 !== statement.source_digest) {
      throw new ValidationError(
        `Evidence source ${statement.source_ref} maps to inconsistent artifact digests`
      );
    }
    if (prior.source_kind !== sourceKind) {
      throw new ValidationError(
        `Measurement Source v0 does not permit heterogeneous evidence kinds for source ${statement.source_ref}`
      );
    }
    prior.evidence.push(statement);
  }
  return expected;
}

function validateSourceRecord(
  record,
  index,
  expectedSources,
  trustedRecorderById,
  evaluationTime,
  sourceAgePolicy,
  claimLagPolicy,
  clockPolicy
) {
  exactObject(record, `sourcePackage.envelopes[${index}]`, ['envelope', 'signature']);
  const envelope = record.envelope;
  exactObject(envelope, `sourcePackage.envelopes[${index}].envelope`, [
    'schema',
    'source_ref',
    'artifact_sha256',
    'source_kind',
    'source_recorder_id',
    'capture',
    'method',
    'artifact',
    'result',
    'supports_evidence_ids',
    'reproduction',
    'authority_effect',
    'network_effect',
    'runtime_activation'
  ]);

  if (
    envelope.schema !== MEASUREMENT_SOURCE_ENVELOPE_SCHEMA
    || envelope.authority_effect !== 'none'
    || envelope.network_effect !== 'none'
    || envelope.runtime_activation !== false
  ) {
    throw new ValidationError(`Measurement source envelope ${index} activation boundary is invalid`);
  }

  identifier(envelope.source_ref, `sourcePackage.envelopes[${index}].envelope.source_ref`);
  digest(envelope.artifact_sha256, `sourcePackage.envelopes[${index}].envelope.artifact_sha256`);
  if (!MEASUREMENT_SOURCE_KINDS.includes(envelope.source_kind)) {
    throw new ValidationError(`Measurement source ${envelope.source_ref} kind is invalid`);
  }
  identifier(
    envelope.source_recorder_id,
    `sourcePackage.envelopes[${index}].envelope.source_recorder_id`
  );

  const expected = expectedSources.get(envelope.source_ref);
  if (!expected) {
    throw new ValidationError(`Measurement source ${envelope.source_ref} is not referenced by evidence`);
  }
  if (envelope.artifact_sha256 !== expected.artifact_sha256) {
    throw new ValidationError(
      `Measurement source ${envelope.source_ref} does not bind the evidence source artifact digest`
    );
  }
  if (envelope.source_kind !== expected.source_kind) {
    throw new ValidationError(
      `Measurement source ${envelope.source_ref} kind does not match the evidence claim class`
    );
  }

  validateCapture(envelope.capture, envelope.source_ref);
  validateMethod(envelope.method, envelope.source_ref);
  validateArtifact(envelope.artifact, envelope.source_ref);
  validateResult(envelope.result, envelope.source_ref);
  validateReproduction(envelope.reproduction, envelope.source_ref);
  validateSupportSet(envelope.supports_evidence_ids, expected.evidence, envelope.source_ref);

  const recorder = trustedRecorderById.get(envelope.source_recorder_id);
  if (!recorder) {
    throw new ValidationError(
      `Measurement source recorder ${envelope.source_recorder_id} is not in the evaluator trust set`
    );
  }
  const requiredRole = SOURCE_RECORDER_ROLE_BY_KIND[envelope.source_kind];
  if (!recorder.roles.has(requiredRole)) {
    throw new ValidationError(
      `Measurement source recorder ${envelope.source_recorder_id} is not trusted for required role ${requiredRole}`
    );
  }
  verifySourceSignature(envelope, record.signature, recorder.publicKey);

  const startedAt = parseTimestamp(envelope.capture.started_at, 'capture.started_at');
  const completedAt = parseTimestamp(envelope.capture.completed_at, 'capture.completed_at');
  if (completedAt < startedAt) {
    throw new ValidationError(`Measurement source ${envelope.source_ref} capture window is invalid`);
  }
  const uncertaintyMs = envelope.capture.clock_uncertainty_ms;
  if (uncertaintyMs > clockPolicy[envelope.source_kind]) {
    throw new ValidationError(
      `Measurement source ${envelope.source_ref} exceeds the configured clock uncertainty limit`
    );
  }

  const latestPossibleCompletion = completedAt.valueOf() + uncertaintyMs;
  if (latestPossibleCompletion > evaluationTime.valueOf()) {
    throw new ValidationError(
      `Measurement source ${envelope.source_ref} may be future-dated under its clock uncertainty`
    );
  }
  const earliestPossibleCompletion = completedAt.valueOf() - uncertaintyMs;
  const sourceAgeMs = evaluationTime.valueOf() - earliestPossibleCompletion;
  if (sourceAgeMs > sourceAgePolicy[envelope.source_kind] * 1000) {
    throw new ValidationError(
      `Measurement source ${envelope.source_ref} exceeds the configured source freshness limit`
    );
  }

  for (const statement of expected.evidence) {
    const observedAt = parseTimestamp(statement.observed_at, 'evidence observed_at');
    if (observedAt.valueOf() < latestPossibleCompletion) {
      throw new ValidationError(
        `Evidence ${statement.evidence_id} predates definite completion of source ${envelope.source_ref}`
      );
    }
    const worstCaseClaimLagMs = observedAt.valueOf() - earliestPossibleCompletion;
    if (worstCaseClaimLagMs > claimLagPolicy[envelope.source_kind] * 1000) {
      throw new ValidationError(
        `Evidence ${statement.evidence_id} exceeds the configured source-to-claim lag limit`
      );
    }
  }

  return Object.freeze({
    envelope,
    envelope_digest: digestObject(envelope)
  });
}

function validateCapture(capture, sourceRef) {
  exactObject(capture, `Measurement source ${sourceRef} capture`, [
    'started_at',
    'completed_at',
    'clock_source',
    'clock_uncertainty_ms'
  ]);
  parseTimestamp(capture.started_at, 'capture.started_at');
  parseTimestamp(capture.completed_at, 'capture.completed_at');
  identifier(capture.clock_source, `Measurement source ${sourceRef} clock_source`);
  if (
    !Number.isSafeInteger(capture.clock_uncertainty_ms)
    || capture.clock_uncertainty_ms < 0
    || capture.clock_uncertainty_ms > MAX_CLOCK_UNCERTAINTY_MS
  ) {
    throw new ValidationError(
      `Measurement source ${sourceRef} clock_uncertainty_ms must be an integer from 0 through ${MAX_CLOCK_UNCERTAINTY_MS}`
    );
  }
}

function validateMethod(method, sourceRef) {
  exactObject(method, `Measurement source ${sourceRef} method`, [
    'method_id',
    'method_version',
    'implementation_sha256',
    'configuration_sha256',
    'environment_sha256'
  ]);
  identifier(method.method_id, `Measurement source ${sourceRef} method_id`);
  boundedText(method.method_version, `Measurement source ${sourceRef} method_version`, 1, 80);
  digest(method.implementation_sha256, `Measurement source ${sourceRef} implementation_sha256`);
  digest(method.configuration_sha256, `Measurement source ${sourceRef} configuration_sha256`);
  digest(method.environment_sha256, `Measurement source ${sourceRef} environment_sha256`);
}

function validateArtifact(artifact, sourceRef) {
  exactObject(artifact, `Measurement source ${sourceRef} artifact`, [
    'content_type',
    'byte_length',
    'retention_status',
    'raw_artifact_included'
  ]);
  if (typeof artifact.content_type !== 'string' || !CONTENT_TYPE.test(artifact.content_type)) {
    throw new ValidationError(`Measurement source ${sourceRef} artifact content_type is invalid`);
  }
  if (
    !Number.isSafeInteger(artifact.byte_length)
    || artifact.byte_length < 0
    || artifact.byte_length > MAX_ARTIFACT_BYTES
  ) {
    throw new ValidationError(
      `Measurement source ${sourceRef} artifact byte_length must be 0-${MAX_ARTIFACT_BYTES}`
    );
  }
  if (!RETENTION_STATUSES.includes(artifact.retention_status)) {
    throw new ValidationError(`Measurement source ${sourceRef} artifact retention_status is invalid`);
  }
  if (artifact.raw_artifact_included !== false) {
    throw new ValidationError(`Measurement source ${sourceRef} must not embed the raw artifact in v0`);
  }
}

function validateResult(result, sourceRef) {
  exactObject(result, `Measurement source ${sourceRef} result`, [
    'result_kind',
    'normalized_result_sha256',
    'uncertainty'
  ]);
  if (!RESULT_KINDS.includes(result.result_kind)) {
    throw new ValidationError(`Measurement source ${sourceRef} result_kind is invalid`);
  }
  digest(
    result.normalized_result_sha256,
    `Measurement source ${sourceRef} normalized_result_sha256`
  );
  validateUncertainty(result.uncertainty, sourceRef);
}

function validateUncertainty(uncertainty, sourceRef) {
  exactObject(uncertainty, `Measurement source ${sourceRef} uncertainty`, [
    'kind',
    'unit',
    'lower_bound',
    'upper_bound',
    'confidence'
  ]);
  if (!UNCERTAINTY_KINDS.includes(uncertainty.kind)) {
    throw new ValidationError(`Measurement source ${sourceRef} uncertainty kind is invalid`);
  }

  if (uncertainty.kind !== 'interval') {
    if (
      uncertainty.unit !== null
      || uncertainty.lower_bound !== null
      || uncertainty.upper_bound !== null
      || uncertainty.confidence !== null
    ) {
      throw new ValidationError(
        `Measurement source ${sourceRef} ${uncertainty.kind} uncertainty must not invent numeric bounds`
      );
    }
    return;
  }

  boundedText(uncertainty.unit, `Measurement source ${sourceRef} uncertainty unit`, 1, 32);
  if (
    !Number.isFinite(uncertainty.lower_bound)
    || !Number.isFinite(uncertainty.upper_bound)
    || uncertainty.lower_bound > uncertainty.upper_bound
  ) {
    throw new ValidationError(`Measurement source ${sourceRef} uncertainty interval is invalid`);
  }
  if (
    uncertainty.confidence !== null
    && (
      !Number.isFinite(uncertainty.confidence)
      || uncertainty.confidence <= 0
      || uncertainty.confidence > 1
    )
  ) {
    throw new ValidationError(`Measurement source ${sourceRef} uncertainty confidence is invalid`);
  }
}

function validateReproduction(reproduction, sourceRef) {
  exactObject(reproduction, `Measurement source ${sourceRef} reproduction`, [
    'status',
    'independent_reproduction_verified'
  ]);
  if (!REPRODUCTION_STATUSES.includes(reproduction.status)) {
    throw new ValidationError(`Measurement source ${sourceRef} reproduction status is invalid`);
  }
  if (reproduction.independent_reproduction_verified !== false) {
    throw new ValidationError(
      `Measurement source ${sourceRef} cannot claim independently verified reproduction in v0`
    );
  }
}

function validateSupportSet(supports, evidenceStatements, sourceRef) {
  if (!Array.isArray(supports) || supports.length < 1 || supports.length > MAX_SOURCE_RECORDS) {
    throw new ValidationError(`Measurement source ${sourceRef} supports_evidence_ids is invalid`);
  }
  const actual = new Set();
  for (const evidenceId of supports) {
    identifier(evidenceId, `Measurement source ${sourceRef} supports_evidence_ids`);
    if (actual.has(evidenceId)) {
      throw new ValidationError(`Measurement source ${sourceRef} repeats evidence id ${evidenceId}`);
    }
    actual.add(evidenceId);
  }
  const expected = new Set(evidenceStatements.map(statement => statement.evidence_id));
  if (actual.size !== expected.size || [...actual].some(id => !expected.has(id))) {
    throw new ValidationError(
      `Measurement source ${sourceRef} does not bind the exact evidence support set`
    );
  }
}

function verifySourceSignature(envelope, signature, publicKey) {
  if (typeof signature !== 'string' || signature.length < 1 || signature.length > 1024) {
    throw new ValidationError('Measurement source envelope signature is invalid');
  }
  let valid = false;
  try {
    valid = verify(
      null,
      Buffer.from(canonicalJson(envelope)),
      publicKey,
      Buffer.from(signature, 'base64url')
    );
  } catch {
    valid = false;
  }
  if (!valid) throw new ValidationError('Measurement source envelope signature is invalid');
}

function normalizeTrustedSourceRecorders(trustedSourceRecorders) {
  if (
    !trustedSourceRecorders
    || typeof trustedSourceRecorders !== 'object'
    || Array.isArray(trustedSourceRecorders)
  ) {
    throw new ValidationError(
      'trustedSourceRecorders must be an externally supplied recorder map'
    );
  }
  const byRecorderId = new Map();
  const digestEntries = [];

  for (const recorderId of Object.keys(trustedSourceRecorders).sort()) {
    identifier(recorderId, `trustedSourceRecorders.${recorderId}`);
    const recorder = trustedSourceRecorders[recorderId];
    exactObject(recorder, `trustedSourceRecorders.${recorderId}`, ['public_key', 'roles']);
    if (
      typeof recorder.public_key !== 'string'
      || recorder.public_key.length < 1
      || recorder.public_key.length > 8192
    ) {
      throw new ValidationError(`trustedSourceRecorders.${recorderId}.public_key is invalid`);
    }
    if (!Array.isArray(recorder.roles) || recorder.roles.length < 1 || recorder.roles.length > 32) {
      throw new ValidationError(
        `trustedSourceRecorders.${recorderId}.roles must contain 1-32 roles`
      );
    }
    const roles = new Set();
    for (const role of recorder.roles) {
      identifier(role, `trustedSourceRecorders.${recorderId}.roles`);
      if (roles.has(role)) {
        throw new ValidationError(`trustedSourceRecorders.${recorderId}.roles contains duplicates`);
      }
      roles.add(role);
    }

    let publicKey;
    try {
      publicKey = createPublicKey(recorder.public_key);
    } catch {
      throw new ValidationError(`trustedSourceRecorders.${recorderId}.public_key is invalid`);
    }
    if (publicKey.asymmetricKeyType !== 'ed25519') {
      throw new ValidationError(`trustedSourceRecorders.${recorderId}.public_key must use Ed25519`);
    }

    byRecorderId.set(recorderId, Object.freeze({ publicKey, roles }));
    digestEntries.push({
      recorder_id: recorderId,
      public_key_digest: sha256(publicKey.export({ type: 'spki', format: 'der' })),
      roles: [...roles].sort()
    });
  }

  if (byRecorderId.size < 1) {
    throw new ValidationError('trustedSourceRecorders must contain at least one recorder');
  }
  return Object.freeze({ byRecorderId, digestEntries });
}

function normalizeSourcePolicy(value, label, minimum, maximum) {
  exactObject(value, label, MEASUREMENT_SOURCE_KINDS);
  const normalized = {};
  for (const sourceKind of MEASUREMENT_SOURCE_KINDS) {
    const amount = value[sourceKind];
    if (!Number.isSafeInteger(amount) || amount < minimum || amount > maximum) {
      throw new ValidationError(
        `${label}.${sourceKind} must be an integer from ${minimum} through ${maximum}`
      );
    }
    normalized[sourceKind] = amount;
  }
  return Object.freeze(normalized);
}

function parseTimestamp(value, label) {
  if (typeof value !== 'string' || !value.endsWith('Z')) {
    throw new ValidationError(`${label} must be a UTC date-time`);
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== value) {
    throw new ValidationError(`${label} must be a canonical ISO UTC date-time`);
  }
  return parsed;
}

function exactObject(value, label, fields) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError(`${label} must be an object`);
  }
  const expected = new Set(fields);
  for (const key of Object.keys(value)) {
    if (!expected.has(key)) throw new ValidationError(`${label} contains unknown field ${key}`);
  }
  for (const field of fields) {
    if (!Object.hasOwn(value, field)) throw new ValidationError(`${label} is missing required field ${field}`);
  }
}

function identifier(value, label) {
  if (typeof value !== 'string' || !IDENTIFIER.test(value)) {
    throw new ValidationError(`${label} must be a bounded identifier`);
  }
  return value;
}

function digest(value, label) {
  if (typeof value !== 'string' || !DIGEST.test(value)) {
    throw new ValidationError(`${label} must be a lowercase SHA-256 digest`);
  }
  return value;
}

function boundedText(value, label, minimum, maximum) {
  if (typeof value !== 'string' || value.length < minimum || value.length > maximum) {
    throw new ValidationError(`${label} must contain ${minimum}-${maximum} characters`);
  }
  return value;
}
