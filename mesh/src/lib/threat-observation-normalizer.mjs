import {
  assertPlainObject,
  assertString,
  sha256,
  ValidationError
} from './canonical.mjs';
import {
  contractDigest,
  verifyThreatObservation
} from './threat-intelligence-contracts.mjs';

const MAX_SOURCE_BYTES = 131_072;
const MAX_CLAIMS = 64;
const MAX_CORPUS_OBSERVATIONS = 4096;
const SOURCE_FIELDS = new Set([
  'source_class',
  'source_identity_or_locator',
  'source_version_or_published_at',
  'retrieved_at',
  'source_text',
  'claims'
]);
const CLAIM_FIELDS = new Set([
  'observation_id',
  'claim_class',
  'summary',
  'indicators',
  'affected_technology_or_boundary',
  'reported_preconditions',
  'reported_effects',
  'source_confidence',
  'collector_confidence',
  'sensitivity_class',
  'supersedes_observation_ids',
  'contradicts_observation_ids',
  'lifecycle_state',
  'expiry_or_review_at'
]);
const SOURCE_CLASSES = new Set([
  'vendor_security_report',
  'vulnerability_advisory',
  'upstream_project_advisory',
  'cert_or_government_advisory',
  'peer_reviewed_security_research',
  'trusted_partner_disclosure',
  'axiom_local_incident',
  'axiom_lab_finding',
  'community_submission',
  'untrusted_open_web_observation'
]);
const LIFECYCLE_STATES = new Set([
  'current',
  'superseded',
  'contradicted',
  'source_withdrawn',
  'fixed_upstream',
  'not_applicable_current_build',
  'historical_regression',
  'expired_pending_reassessment'
]);

export function normalizeOfflineThreatSource(source) {
  assertPlainObject(source, 'source');
  assertExactFields(source, SOURCE_FIELDS, 'source');

  const sourceClass = assertString(source.source_class, 'source.source_class', { max: 128 });
  if (!SOURCE_CLASSES.has(sourceClass)) {
    throw new ValidationError('source.source_class is not an allowed source class');
  }
  const sourceIdentity = assertString(
    source.source_identity_or_locator,
    'source.source_identity_or_locator',
    { max: 2048 }
  );
  const sourceVersion = assertString(
    source.source_version_or_published_at,
    'source.source_version_or_published_at',
    { max: 512 }
  );
  assertCanonicalTimestamp(source.retrieved_at, 'source.retrieved_at');
  const sourceText = assertString(source.source_text, 'source.source_text', { max: MAX_SOURCE_BYTES });
  if (Buffer.byteLength(sourceText, 'utf8') > MAX_SOURCE_BYTES) {
    throw new ValidationError('source text exceeds 131072 bytes');
  }
  if (!Array.isArray(source.claims) || source.claims.length > MAX_CLAIMS) {
    throw new ValidationError('source claims must contain at most 64 entries');
  }

  const sourceDigest = `sha256:${sha256(sourceText)}`;
  const seenIds = new Set();
  const observations = source.claims.map((claim, index) => {
    assertPlainObject(claim, `source.claims[${index}]`);
    assertAllowedFields(claim, CLAIM_FIELDS, `source.claims[${index}]`);

    const observationId = assertString(
      claim.observation_id,
      `source.claims[${index}].observation_id`,
      { max: 512 }
    );
    if (seenIds.has(observationId)) {
      throw new ValidationError(`duplicate observation_id: ${observationId}`);
    }
    seenIds.add(observationId);

    const expiry = claim.expiry_or_review_at ?? defaultReviewAt(source.retrieved_at);
    assertCanonicalTimestamp(expiry, `source.claims[${index}].expiry_or_review_at`);
    const lifecycleState = claim.lifecycle_state ?? 'current';
    if (!LIFECYCLE_STATES.has(lifecycleState)) {
      throw new ValidationError(`source.claims[${index}].lifecycle_state is not allowed`);
    }

    const raw = {
      schema: 'axiom-threat-observation.v0',
      observation_id: observationId,
      source_class: sourceClass,
      source_identity_or_locator: sourceIdentity,
      source_version_or_published_at: sourceVersion,
      retrieved_at: source.retrieved_at,
      content_digest: sourceDigest,
      claim_class: assertString(claim.claim_class, `source.claims[${index}].claim_class`, { max: 128 }),
      summary: assertString(claim.summary, `source.claims[${index}].summary`, { max: 8192 }),
      indicators: copyStringArray(claim.indicators, `source.claims[${index}].indicators`, 32, 512),
      affected_technology_or_boundary: copyStringArray(
        claim.affected_technology_or_boundary,
        `source.claims[${index}].affected_technology_or_boundary`,
        32,
        512
      ),
      reported_preconditions: copyStringArray(
        claim.reported_preconditions,
        `source.claims[${index}].reported_preconditions`,
        32,
        2048
      ),
      reported_effects: copyStringArray(
        claim.reported_effects,
        `source.claims[${index}].reported_effects`,
        32,
        2048
      ),
      source_confidence: claim.source_confidence ?? defaultSourceConfidence(sourceClass),
      collector_confidence: claim.collector_confidence ?? 'unassessed_for_axiom',
      sensitivity_class: claim.sensitivity_class ?? 'security_sensitive',
      raw_content_reference: null,
      provenance_chain: [sourceDigest],
      supersedes_observation_ids: copyStringArray(
        claim.supersedes_observation_ids ?? [],
        `source.claims[${index}].supersedes_observation_ids`,
        16,
        512
      ),
      contradicts_observation_ids: copyStringArray(
        claim.contradicts_observation_ids ?? [],
        `source.claims[${index}].contradicts_observation_ids`,
        16,
        512
      ),
      lifecycle_state: lifecycleState,
      expiry_or_review_at: expiry
    };

    return verifyThreatObservation({
      ...raw,
      observation_digest: contractDigest(raw, 'observation_digest')
    });
  });

  return {
    source_digest: sourceDigest,
    observations: linkObservationLifecycle(observations)
  };
}

export function canonicalObservationKey(observation) {
  return verifyThreatObservation(observation).observation_digest;
}

export function linkObservationLifecycle(observations) {
  if (!Array.isArray(observations) || observations.length > MAX_CLAIMS) {
    throw new ValidationError('observations must contain at most 64 entries');
  }

  const verified = observations.map(verifyThreatObservation);
  validateObservationIdentityAndLinks(verified);
  return [...verified].sort(compareObservations);
}

export function mergeOfflineObservationCorpus(existing, incoming, { now } = {}) {
  if (!Array.isArray(existing) || !Array.isArray(incoming)) {
    throw new ValidationError('existing and incoming must be arrays');
  }
  if (existing.length + incoming.length > MAX_CORPUS_OBSERVATIONS) {
    throw new ValidationError(`observation corpus must contain at most ${MAX_CORPUS_OBSERVATIONS} entries`);
  }
  assertCanonicalTimestamp(now, 'now');

  const all = [...existing, ...incoming].map(verifyThreatObservation);
  const byDigest = new Map();
  const byId = new Map();

  for (const observation of all) {
    const existingById = byId.get(observation.observation_id);
    if (existingById && existingById.observation_digest !== observation.observation_digest) {
      throw new ValidationError(`observation substitution detected for ${observation.observation_id}: different digest`);
    }
    byId.set(observation.observation_id, observation);
    if (!byDigest.has(observation.observation_digest)) {
      byDigest.set(observation.observation_digest, observation);
    }
  }

  const unique = [...byDigest.values()];
  validateObservationIdentityAndLinks(unique);

  const supersededTargets = new Set();
  const contradicted = new Set();
  for (const observation of unique) {
    for (const targetId of observation.supersedes_observation_ids) {
      if (byId.has(targetId)) supersededTargets.add(targetId);
    }
    for (const targetId of observation.contradicts_observation_ids) {
      if (byId.has(targetId)) {
        contradicted.add(targetId);
        contradicted.add(observation.observation_id);
      }
    }
  }

  return unique
    .sort(compareObservations)
    .map(observation => ({
      observation,
      derived_lifecycle_state: deriveLifecycleState({
        observation,
        now,
        supersededTargets,
        contradicted
      })
    }));
}

function validateObservationIdentityAndLinks(observations) {
  const byId = new Map();
  for (const observation of observations) {
    const existing = byId.get(observation.observation_id);
    if (existing && existing.observation_digest !== observation.observation_digest) {
      throw new ValidationError(`observation substitution detected for ${observation.observation_id}`);
    }
    byId.set(observation.observation_id, observation);
  }

  for (const observation of observations) {
    for (const linkedId of [
      ...observation.supersedes_observation_ids,
      ...observation.contradicts_observation_ids
    ]) {
      const target = byId.get(linkedId);
      if (!target) continue;
      if (
        target.source_identity_or_locator !== observation.source_identity_or_locator ||
        target.source_class !== observation.source_class
      ) {
        throw new ValidationError('cross-source lifecycle link lacks matching source provenance');
      }
    }
  }
}

function deriveLifecycleState({ observation, now, supersededTargets, contradicted }) {
  if (observation.lifecycle_state !== 'current') return observation.lifecycle_state;
  if (supersededTargets.has(observation.observation_id)) return 'superseded';
  if (contradicted.has(observation.observation_id)) return 'contradicted';
  if (Date.parse(observation.expiry_or_review_at) <= Date.parse(now)) {
    return 'expired_pending_reassessment';
  }
  return 'current';
}

function assertExactFields(object, fields, name) {
  for (const key of Object.keys(object)) {
    if (!fields.has(key)) throw new ValidationError(`${name} contains unsupported field: ${key}`);
  }
  for (const key of fields) {
    if (!Object.hasOwn(object, key)) throw new ValidationError(`${name} is missing field: ${key}`);
  }
}

function assertAllowedFields(object, fields, name) {
  for (const key of Object.keys(object)) {
    if (!fields.has(key)) throw new ValidationError(`${name} contains unsupported field: ${key}`);
  }
}

function assertCanonicalTimestamp(value, name) {
  assertString(value, name, { max: 64 });
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new ValidationError(`${name} must be a canonical UTC ISO-8601 timestamp`);
  }
}

function copyStringArray(value, name, maxItems, itemMax) {
  if (!Array.isArray(value) || value.length > maxItems) {
    throw new ValidationError(`${name} must be an array with at most ${maxItems} items`);
  }
  const seen = new Set();
  return value.map((item, index) => {
    const checked = assertString(item, `${name}[${index}]`, { max: itemMax });
    if (seen.has(checked)) throw new ValidationError(`${name} items must be unique`);
    seen.add(checked);
    return checked;
  });
}

function defaultReviewAt(retrievedAt) {
  const time = new Date(retrievedAt).getTime();
  return new Date(time + (90 * 24 * 60 * 60 * 1000)).toISOString();
}

function defaultSourceConfidence(sourceClass) {
  if (sourceClass === 'axiom_local_incident' || sourceClass === 'axiom_lab_finding') {
    return 'locally_observed';
  }
  if (sourceClass === 'untrusted_open_web_observation' || sourceClass === 'community_submission') {
    return 'unverified_source';
  }
  return 'source_reported';
}

function compareObservations(left, right) {
  return left.retrieved_at.localeCompare(right.retrieved_at)
    || left.observation_id.localeCompare(right.observation_id)
    || left.observation_digest.localeCompare(right.observation_digest);
}
