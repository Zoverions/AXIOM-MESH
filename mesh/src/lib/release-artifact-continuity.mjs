import {
  ValidationError,
  assertPlainObject,
  assertString,
  canonicalJson,
  digestObject,
  sha256
} from './canonical.mjs';
import { SOURCE_CONTENT_ADDRESS_PROFILE } from './source-continuity.mjs';

export const RELEASE_CONTINUITY_MANIFEST_SCHEMA = 'axiom-release-continuity-manifest.v1';
export const RELEASE_ARTIFACT_OBSERVATION_SCHEMA = 'axiom-release-artifact-observation.v1';
export const RELEASE_CONTINUITY_ASSESSMENT_SCHEMA = 'axiom-release-continuity-assessment.v1';

const DIGEST = /^[a-f0-9]{64}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,255}$/;
const MEDIA_TYPE = /^[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]*\/[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]*$/;
const PLATFORM = /^[A-Za-z0-9][A-Za-z0-9._/+:-]{0,127}$/;
const ARTIFACT_KINDS = new Set([
  'source_archive',
  'binary',
  'package',
  'container_image',
  'sbom',
  'provenance',
  'signature',
  'documentation',
  'other'
]);
const STORAGE_CLASSES = new Set([
  'local',
  'offline_archive',
  'object_store',
  'forge_release',
  'package_registry',
  'container_registry',
  'p2p',
  'other'
]);
const OBSERVATION_STATUSES = new Set([
  'reachable',
  'stale',
  'divergent',
  'unavailable',
  'compromised'
]);

function rejectUnknown(value, allowed, name) {
  const unknown = Object.keys(value).filter(key => !allowed.has(key));
  if (unknown.length) {
    throw new ValidationError(`${name} contains unsupported fields: ${unknown.join(', ')}`);
  }
}

function present(value) {
  return value !== null && value !== undefined;
}

function id(value, name, { max = 256 } = {}) {
  return assertString(value, name, { min: 1, max, pattern: ID });
}

function digest(value, name) {
  return assertString(value, name, { min: 64, max: 64, pattern: DIGEST });
}

function nullableDigest(value, name) {
  return present(value) ? digest(value, name) : null;
}

function iso(value, name) {
  const raw = assertString(value, name, { min: 1, max: 64 });
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.valueOf())) throw new ValidationError(`${name} must be an ISO timestamp`);
  return parsed.toISOString();
}

function boundedInteger(value, name, { min = 0, max = 64 * 1024 * 1024 * 1024 } = {}) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new ValidationError(`${name} must be an integer between ${min} and ${max}`);
  }
  return value;
}

function nullableInteger(value, name) {
  return present(value) ? boundedInteger(value, name) : null;
}

function nonEmptyString(value, name, { max = 256 } = {}) {
  const raw = assertString(value, name, { min: 1, max });
  if (/[\r\n\u0000]/.test(raw)) throw new ValidationError(`${name} contains control characters`);
  return raw;
}

function uniqueEnumArray(raw, name, allowed, { maxItems = 32 } = {}) {
  if (!Array.isArray(raw) || raw.length > maxItems) {
    throw new ValidationError(`${name} must be an array with at most ${maxItems} items`);
  }
  const values = raw.map((value, index) => assertString(
    value,
    `${name}[${index}]`,
    { min: 1, max: 64 }
  ));
  if (values.some(value => !allowed.has(value))) {
    throw new ValidationError(`${name} contains an unsupported value`);
  }
  if (new Set(values).size !== values.length) {
    throw new ValidationError(`${name} must contain unique values`);
  }
  return [...values].sort();
}

function uniqueIds(raw, name, { maxItems = 64 } = {}) {
  if (!Array.isArray(raw) || raw.length > maxItems) {
    throw new ValidationError(`${name} must be an array with at most ${maxItems} items`);
  }
  const values = raw.map((value, index) => id(value, `${name}[${index}]`));
  if (new Set(values).size !== values.length) {
    throw new ValidationError(`${name} must contain unique values`);
  }
  return [...values].sort();
}

function normalizeEvidenceRefs(raw) {
  const value = assertPlainObject(raw ?? {}, 'artifact evidence refs');
  rejectUnknown(
    value,
    new Set(['sbom_artifact_id', 'provenance_artifact_id', 'signature_artifact_ids']),
    'artifact evidence refs'
  );
  return {
    sbom_artifact_id: present(value.sbom_artifact_id)
      ? id(value.sbom_artifact_id, 'evidence_refs.sbom_artifact_id')
      : null,
    provenance_artifact_id: present(value.provenance_artifact_id)
      ? id(value.provenance_artifact_id, 'evidence_refs.provenance_artifact_id')
      : null,
    signature_artifact_ids: uniqueIds(
      value.signature_artifact_ids ?? [],
      'evidence_refs.signature_artifact_ids'
    )
  };
}

function normalizeArtifact(raw, index, sourceStateDigest) {
  const value = assertPlainObject(raw, `artifacts[${index}]`);
  rejectUnknown(value, new Set([
    'artifact_id',
    'kind',
    'media_type',
    'sha256',
    'byte_length',
    'platform',
    'required_for_reconstruction',
    'minimum_verified_copies',
    'required_storage_classes',
    'source_state_digest',
    'evidence_refs'
  ]), `artifacts[${index}]`);
  if (!ARTIFACT_KINDS.has(value.kind)) {
    throw new ValidationError(`artifacts[${index}].kind is unsupported`);
  }
  if (value.required_for_reconstruction !== true && value.required_for_reconstruction !== false) {
    throw new ValidationError(`artifacts[${index}].required_for_reconstruction must be boolean`);
  }
  const boundSource = digest(value.source_state_digest, `artifacts[${index}].source_state_digest`);
  if (boundSource !== sourceStateDigest) {
    throw new ValidationError('release artifact is bound to a different source state than its manifest');
  }
  return {
    artifact_id: id(value.artifact_id, `artifacts[${index}].artifact_id`),
    kind: value.kind,
    media_type: assertString(value.media_type, `artifacts[${index}].media_type`, {
      min: 3,
      max: 128,
      pattern: MEDIA_TYPE
    }),
    sha256: digest(value.sha256, `artifacts[${index}].sha256`),
    byte_length: boundedInteger(value.byte_length, `artifacts[${index}].byte_length`),
    platform: present(value.platform)
      ? assertString(value.platform, `artifacts[${index}].platform`, {
          min: 1,
          max: 128,
          pattern: PLATFORM
        })
      : null,
    required_for_reconstruction: value.required_for_reconstruction,
    minimum_verified_copies: boundedInteger(
      value.minimum_verified_copies,
      `artifacts[${index}].minimum_verified_copies`,
      { min: 1, max: 32 }
    ),
    required_storage_classes: uniqueEnumArray(
      value.required_storage_classes ?? [],
      `artifacts[${index}].required_storage_classes`,
      STORAGE_CLASSES,
      { maxItems: STORAGE_CLASSES.size }
    ),
    source_state_digest: boundSource,
    evidence_refs: normalizeEvidenceRefs(value.evidence_refs)
  };
}

function verifyArtifactRelationships(artifacts) {
  const byId = new Map();
  for (const artifact of artifacts) {
    if (byId.has(artifact.artifact_id)) {
      throw new ValidationError(`release manifest contains duplicate artifact id ${artifact.artifact_id}`);
    }
    byId.set(artifact.artifact_id, artifact);
  }
  for (const artifact of artifacts) {
    const { sbom_artifact_id: sbom, provenance_artifact_id: provenance, signature_artifact_ids: signatures } =
      artifact.evidence_refs;
    if (sbom !== null) requireEvidenceTarget(byId, artifact, sbom, 'sbom');
    if (provenance !== null) requireEvidenceTarget(byId, artifact, provenance, 'provenance');
    for (const signature of signatures) requireEvidenceTarget(byId, artifact, signature, 'signature');
  }
}

function requireEvidenceTarget(byId, source, targetId, expectedKind) {
  if (targetId === source.artifact_id) {
    throw new ValidationError('release artifact cannot cite itself as evidence');
  }
  const target = byId.get(targetId);
  if (!target) throw new ValidationError(`release artifact evidence target ${targetId} is missing`);
  if (target.kind !== expectedKind) {
    throw new ValidationError(
      `release artifact evidence target ${targetId} must have kind ${expectedKind}`
    );
  }
}

export function normalizeReleaseContinuityManifest(raw) {
  const value = assertPlainObject(raw, 'release continuity manifest');
  rejectUnknown(value, new Set([
    'schema',
    'project_id',
    'release_id',
    'version',
    'channel',
    'created_at',
    'source_state_digest',
    'artifacts',
    'provider_release_is_identity',
    'production_promotion_claimed',
    'content_address_profile',
    'manifest_id',
    'manifest_digest'
  ]), 'release continuity manifest');
  if (value.schema !== RELEASE_CONTINUITY_MANIFEST_SCHEMA) {
    throw new ValidationError(`release continuity manifest schema must be ${RELEASE_CONTINUITY_MANIFEST_SCHEMA}`);
  }
  if (value.provider_release_is_identity !== false || value.production_promotion_claimed !== false) {
    throw new ValidationError('release continuity manifest authority/identity claim boundary is weakened');
  }
  if (value.content_address_profile !== SOURCE_CONTENT_ADDRESS_PROFILE) {
    throw new ValidationError('release continuity manifest content-address profile is unsupported');
  }
  const sourceStateDigest = digest(value.source_state_digest, 'source_state_digest');
  if (!Array.isArray(value.artifacts) || value.artifacts.length === 0 || value.artifacts.length > 512) {
    throw new ValidationError('release continuity manifest must contain 1-512 artifacts');
  }
  const artifacts = value.artifacts
    .map((artifact, index) => normalizeArtifact(artifact, index, sourceStateDigest))
    .sort((a, b) => a.artifact_id.localeCompare(b.artifact_id));
  verifyArtifactRelationships(artifacts);
  if (!artifacts.some(artifact => artifact.required_for_reconstruction)) {
    throw new ValidationError('release continuity manifest requires at least one reconstruction-required artifact');
  }
  const body = {
    schema: RELEASE_CONTINUITY_MANIFEST_SCHEMA,
    project_id: id(value.project_id, 'project_id'),
    release_id: id(value.release_id, 'release_id'),
    version: nonEmptyString(value.version, 'version', { max: 128 }),
    channel: id(value.channel, 'channel', { max: 128 }),
    created_at: iso(value.created_at, 'created_at'),
    source_state_digest: sourceStateDigest,
    artifacts,
    provider_release_is_identity: false,
    production_promotion_claimed: false,
    content_address_profile: SOURCE_CONTENT_ADDRESS_PROFILE
  };
  const manifestDigest = digestObject(body);
  const manifestId = `release-continuity-manifest:${manifestDigest}`;
  if (present(value.manifest_digest) && digest(value.manifest_digest, 'manifest_digest') !== manifestDigest) {
    throw new ValidationError('release continuity manifest digest does not match canonical content');
  }
  if (
    present(value.manifest_id)
    && assertString(value.manifest_id, 'manifest_id', { min: 1, max: 320 }) !== manifestId
  ) {
    throw new ValidationError('release continuity manifest id does not match canonical content');
  }
  return { ...body, manifest_id: manifestId, manifest_digest: manifestDigest };
}

export function releaseManifestProjectContent(manifest) {
  const normalized = normalizeReleaseContinuityManifest(manifest);
  const bytes = Buffer.from(canonicalJson(normalized), 'utf8');
  return {
    visibility: 'public',
    mode: 'digest_only',
    media_type: 'application/json',
    content_digest: sha256(bytes),
    byte_length: bytes.length
  };
}

export function normalizeReleaseArtifactObservation(raw) {
  const value = assertPlainObject(raw, 'release artifact observation');
  rejectUnknown(value, new Set([
    'schema',
    'project_id',
    'release_manifest_digest',
    'artifact_id',
    'expected_artifact_sha256',
    'expected_byte_length',
    'replica_id',
    'storage_class',
    'locator',
    'observed_sha256',
    'observed_byte_length',
    'object_complete',
    'digest_verified',
    'status',
    'observed_at',
    'non_authoritative',
    'content_address_profile',
    'observation_id',
    'observation_digest'
  ]), 'release artifact observation');
  if (value.schema !== RELEASE_ARTIFACT_OBSERVATION_SCHEMA) {
    throw new ValidationError(
      `release artifact observation schema must be ${RELEASE_ARTIFACT_OBSERVATION_SCHEMA}`
    );
  }
  if (!STORAGE_CLASSES.has(value.storage_class)) {
    throw new ValidationError('release artifact observation storage class is unsupported');
  }
  if (!OBSERVATION_STATUSES.has(value.status)) {
    throw new ValidationError('release artifact observation status is unsupported');
  }
  if (typeof value.object_complete !== 'boolean' || typeof value.digest_verified !== 'boolean') {
    throw new ValidationError('release artifact observation completeness and digest facts must be boolean');
  }
  if (value.non_authoritative !== true) {
    throw new ValidationError('release artifact observation must remain explicitly non-authoritative');
  }
  if (value.content_address_profile !== SOURCE_CONTENT_ADDRESS_PROFILE) {
    throw new ValidationError('release artifact observation content-address profile is unsupported');
  }
  const observedSha = nullableDigest(value.observed_sha256, 'observed_sha256');
  const observedLength = nullableInteger(value.observed_byte_length, 'observed_byte_length');
  if (value.status === 'unavailable') {
    if (observedSha !== null || observedLength !== null || value.object_complete || value.digest_verified) {
      throw new ValidationError('unavailable release artifact observation cannot claim observed bytes');
    }
  } else if (observedSha === null || observedLength === null) {
    throw new ValidationError('non-unavailable release artifact observation requires observed digest and length');
  }
  const body = {
    schema: RELEASE_ARTIFACT_OBSERVATION_SCHEMA,
    project_id: id(value.project_id, 'project_id'),
    release_manifest_digest: digest(value.release_manifest_digest, 'release_manifest_digest'),
    artifact_id: id(value.artifact_id, 'artifact_id'),
    expected_artifact_sha256: digest(value.expected_artifact_sha256, 'expected_artifact_sha256'),
    expected_byte_length: boundedInteger(value.expected_byte_length, 'expected_byte_length'),
    replica_id: id(value.replica_id, 'replica_id'),
    storage_class: value.storage_class,
    locator: nonEmptyString(value.locator, 'locator', { max: 2048 }),
    observed_sha256: observedSha,
    observed_byte_length: observedLength,
    object_complete: value.object_complete,
    digest_verified: value.digest_verified,
    status: value.status,
    observed_at: iso(value.observed_at, 'observed_at'),
    non_authoritative: true,
    content_address_profile: SOURCE_CONTENT_ADDRESS_PROFILE
  };
  const observationDigest = digestObject(body);
  const observationId = `release-artifact-observation:${observationDigest}`;
  if (
    present(value.observation_digest)
    && digest(value.observation_digest, 'observation_digest') !== observationDigest
  ) {
    throw new ValidationError('release artifact observation digest does not match canonical content');
  }
  if (
    present(value.observation_id)
    && assertString(value.observation_id, 'observation_id', { min: 1, max: 320 }) !== observationId
  ) {
    throw new ValidationError('release artifact observation id does not match canonical content');
  }
  return { ...body, observation_id: observationId, observation_digest: observationDigest };
}

function latestObservations(rawObservations, manifest) {
  if (!Array.isArray(rawObservations)) {
    throw new ValidationError('release artifact observations must be an array');
  }
  const artifactById = new Map(manifest.artifacts.map(artifact => [artifact.artifact_id, artifact]));
  const latest = new Map();
  for (const raw of rawObservations) {
    const observation = normalizeReleaseArtifactObservation(raw);
    if (
      observation.project_id !== manifest.project_id
      || observation.release_manifest_digest !== manifest.manifest_digest
    ) {
      throw new ValidationError('release artifact observation belongs to another release manifest');
    }
    const artifact = artifactById.get(observation.artifact_id);
    if (!artifact) throw new ValidationError('release artifact observation names an unknown artifact');
    if (
      observation.expected_artifact_sha256 !== artifact.sha256
      || observation.expected_byte_length !== artifact.byte_length
    ) {
      throw new ValidationError('release artifact observation expected bytes do not match the manifest');
    }
    const key = `${observation.artifact_id}\u0000${observation.replica_id}`;
    const prior = latest.get(key);
    if (!prior) {
      latest.set(key, observation);
      continue;
    }
    const observedMs = new Date(observation.observed_at).valueOf();
    const priorMs = new Date(prior.observed_at).valueOf();
    if (observedMs > priorMs) latest.set(key, observation);
    else if (observedMs === priorMs && observation.observation_digest !== prior.observation_digest) {
      throw new ValidationError('release artifact replica has contradictory same-time observations');
    }
  }
  return latest;
}

export function evaluateReleaseContinuity({
  manifest,
  observations,
  now = new Date().toISOString(),
  maximum_observation_age_seconds = 86_400
}) {
  const release = normalizeReleaseContinuityManifest(manifest);
  const evaluatedAt = iso(now, 'now');
  const nowMs = new Date(evaluatedAt).valueOf();
  const maximumAgeSeconds = boundedInteger(
    maximum_observation_age_seconds,
    'maximum_observation_age_seconds',
    { min: 1, max: 31_536_000 }
  );
  const maximumAgeMs = maximumAgeSeconds * 1000;
  const latest = latestObservations(observations, release);
  const byArtifact = new Map(release.artifacts.map(artifact => [artifact.artifact_id, []]));
  for (const observation of latest.values()) byArtifact.get(observation.artifact_id).push(observation);

  const artifactAssessments = [];
  for (const artifact of release.artifacts) {
    const rows = byArtifact.get(artifact.artifact_id);
    const healthy = [];
    const unhealthy = [];
    for (const observation of rows) {
      const observedMs = new Date(observation.observed_at).valueOf();
      if (observedMs > nowMs) {
        throw new ValidationError('release artifact observation cannot be in the future');
      }
      const fresh = nowMs - observedMs <= maximumAgeMs;
      const exact = (
        fresh
        && observation.status === 'reachable'
        && observation.object_complete === true
        && observation.digest_verified === true
        && observation.observed_sha256 === artifact.sha256
        && observation.observed_byte_length === artifact.byte_length
      );
      (exact ? healthy : unhealthy).push(observation);
    }
    healthy.sort((a, b) => a.replica_id.localeCompare(b.replica_id));
    unhealthy.sort((a, b) => a.replica_id.localeCompare(b.replica_id));
    const storageClasses = [...new Set(healthy.map(row => row.storage_class))].sort();
    const missingStorageClasses = artifact.required_storage_classes.filter(
      storageClass => !storageClasses.includes(storageClass)
    );

    let status = 'optional_ready';
    if (artifact.required_for_reconstruction) {
      if (rows.length === 0) status = 'continuity_unverified';
      else if (healthy.length < artifact.minimum_verified_copies) status = 'under_replicated';
      else if (missingStorageClasses.length > 0) status = 'low_storage_diversity';
      else if (unhealthy.length > 0) status = 'degraded';
      else status = 'ready';
    } else if (rows.length === 0) status = 'optional_unobserved';
    else if (healthy.length < artifact.minimum_verified_copies || missingStorageClasses.length > 0) {
      status = 'optional_degraded';
    } else if (unhealthy.length > 0) status = 'optional_degraded';

    artifactAssessments.push({
      artifact_id: artifact.artifact_id,
      kind: artifact.kind,
      required_for_reconstruction: artifact.required_for_reconstruction,
      minimum_verified_copies: artifact.minimum_verified_copies,
      required_storage_classes: artifact.required_storage_classes,
      latest_replica_observations: rows.length,
      healthy_verified_copies: healthy.length,
      unhealthy_or_stale_copies: unhealthy.length,
      observed_storage_classes: storageClasses,
      missing_required_storage_classes: missingStorageClasses,
      healthy_replica_ids: healthy.map(row => row.replica_id),
      unhealthy_replica_ids: unhealthy.map(row => row.replica_id),
      status
    });
  }

  const required = artifactAssessments.filter(item => item.required_for_reconstruction);
  let readiness = 'release_continuity_ready';
  if (required.some(item => item.status === 'continuity_unverified')) {
    readiness = 'release_continuity_unverified';
  } else if (required.some(item => item.status === 'under_replicated')) {
    readiness = 'release_under_replicated';
  } else if (required.some(item => item.status === 'low_storage_diversity')) {
    readiness = 'release_low_storage_diversity';
  } else if (required.some(item => item.status === 'degraded')) {
    readiness = 'release_degraded';
  }

  const body = {
    schema: RELEASE_CONTINUITY_ASSESSMENT_SCHEMA,
    project_id: release.project_id,
    release_id: release.release_id,
    release_manifest_digest: release.manifest_digest,
    source_state_digest: release.source_state_digest,
    evaluated_at: evaluatedAt,
    maximum_observation_age_seconds: maximumAgeSeconds,
    readiness,
    policy_satisfied: readiness === 'release_continuity_ready',
    artifact_assessments: artifactAssessments,
    latest_replica_observations: latest.size,
    provider_release_page_grants_release_identity: false,
    replica_consensus_grants_release_authority: false,
    production_promotion_granted: false,
    manifest_identity_changed: false,
    content_address_profile: SOURCE_CONTENT_ADDRESS_PROFILE
  };
  const assessmentDigest = digestObject(body);
  return {
    ...body,
    assessment_id: `release-continuity-assessment:${assessmentDigest}`,
    assessment_digest: assessmentDigest
  };
}

export const RELEASE_ARTIFACT_KINDS = Object.freeze([...ARTIFACT_KINDS].sort());
export const RELEASE_STORAGE_CLASSES = Object.freeze([...STORAGE_CLASSES].sort());
