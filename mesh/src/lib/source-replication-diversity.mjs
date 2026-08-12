import {
  ValidationError,
  assertPlainObject,
  assertString,
  digestObject
} from './canonical.mjs';
import {
  SOURCE_CONTENT_ADDRESS_PROFILE,
  normalizeSourceReplicaObservation,
  normalizeSourceState
} from './source-continuity.mjs';

export const SOURCE_REPLICATION_POLICY_SCHEMA = 'axiom-source-replication-policy.v1';
export const SOURCE_REPLICA_PLACEMENT_SCHEMA = 'axiom-source-replica-placement.v1';
export const SOURCE_REPLICATION_ASSESSMENT_SCHEMA = 'axiom-source-replication-assessment.v1';

const DIGEST = /^[a-f0-9]{64}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$/;
const TRANSPORTS = new Set([
  'local_git',
  'bare_git',
  'github',
  'forgejo',
  'gitlab',
  'radicle',
  'agent_forge',
  'other'
]);
const AVAILABILITY_CLASSES = new Set([
  'local',
  'offline',
  'self_hosted',
  'third_party',
  'p2p',
  'agent_forge'
]);
const ASSURANCE_RANK = new Map([
  ['self_reported', 0],
  ['operator_attested', 1],
  ['independent_attested', 2]
]);
const DOMAIN_KEYS = Object.freeze([
  'storage',
  'operator',
  'provider',
  'network',
  'jurisdiction'
]);

function rejectUnknown(value, allowed, name) {
  const unknown = Object.keys(value).filter(key => !allowed.has(key));
  if (unknown.length) {
    throw new ValidationError(`${name} contains unsupported fields: ${unknown.join(', ')}`);
  }
}

function id(value, name) {
  return assertString(value, name, { min: 1, max: 192, pattern: ID });
}

function digest(value, name) {
  return assertString(value, name, { min: 64, max: 64, pattern: DIGEST });
}

function iso(value, name) {
  const raw = assertString(value, name, { min: 1, max: 64 });
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.valueOf())) throw new ValidationError(`${name} must be an ISO timestamp`);
  return parsed.toISOString();
}

function boundedInteger(value, name, { min = 0, max = 32 } = {}) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new ValidationError(`${name} must be an integer between ${min} and ${max}`);
  }
  return value;
}

function uniqueEnumArray(raw, name, allowed, { maxItems = 16 } = {}) {
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

function contentAddress(body, prefix, suppliedId, suppliedDigest) {
  const objectDigest = digestObject(body);
  const objectId = `${prefix}:${objectDigest}`;
  if (suppliedDigest !== undefined && digest(suppliedDigest, `${prefix}_digest`) !== objectDigest) {
    throw new ValidationError(`${prefix} digest does not match canonical content`);
  }
  if (suppliedId !== undefined && assertString(suppliedId, `${prefix}_id`, { max: 256 }) !== objectId) {
    throw new ValidationError(`${prefix} id does not match canonical content`);
  }
  return { objectId, objectDigest };
}

function normalizeDomainMinimums(raw) {
  const value = assertPlainObject(raw, 'minimum_distinct_domains');
  rejectUnknown(value, new Set(DOMAIN_KEYS), 'minimum_distinct_domains');
  return Object.fromEntries(DOMAIN_KEYS.map(key => [
    key,
    boundedInteger(value[key] ?? 0, `minimum_distinct_domains.${key}`, { min: 0, max: 32 })
  ]));
}

function normalizeDomains(raw) {
  const value = assertPlainObject(raw, 'replica placement domains');
  rejectUnknown(value, new Set(DOMAIN_KEYS), 'replica placement domains');
  return Object.fromEntries(DOMAIN_KEYS.map(key => {
    const item = value[key];
    return [key, item === null || item === undefined ? null : id(item, `domains.${key}`)];
  }));
}

export function normalizeSourceReplicationPolicy(raw) {
  const value = assertPlainObject(raw, 'source replication policy');
  rejectUnknown(value, new Set([
    'schema',
    'source_state_digest',
    'minimum_verified_replicas',
    'maximum_observation_age_seconds',
    'maximum_unhealthy_replicas',
    'required_transports',
    'required_availability_classes',
    'minimum_placement_assurance',
    'minimum_distinct_domains',
    'content_address_profile',
    'policy_id',
    'policy_digest'
  ]), 'source replication policy');
  if (value.schema !== SOURCE_REPLICATION_POLICY_SCHEMA) {
    throw new ValidationError(`source replication policy schema must be ${SOURCE_REPLICATION_POLICY_SCHEMA}`);
  }
  if (value.content_address_profile !== SOURCE_CONTENT_ADDRESS_PROFILE) {
    throw new ValidationError('source replication policy content-address profile is unsupported');
  }
  if (!ASSURANCE_RANK.has(value.minimum_placement_assurance)) {
    throw new ValidationError('source replication policy placement assurance is unsupported');
  }
  const body = {
    schema: SOURCE_REPLICATION_POLICY_SCHEMA,
    source_state_digest: digest(value.source_state_digest, 'source_state_digest'),
    minimum_verified_replicas: boundedInteger(
      value.minimum_verified_replicas,
      'minimum_verified_replicas',
      { min: 1, max: 32 }
    ),
    maximum_observation_age_seconds: boundedInteger(
      value.maximum_observation_age_seconds,
      'maximum_observation_age_seconds',
      { min: 1, max: 31_536_000 }
    ),
    maximum_unhealthy_replicas: boundedInteger(
      value.maximum_unhealthy_replicas,
      'maximum_unhealthy_replicas',
      { min: 0, max: 32 }
    ),
    required_transports: uniqueEnumArray(
      value.required_transports ?? [],
      'required_transports',
      TRANSPORTS,
      { maxItems: TRANSPORTS.size }
    ),
    required_availability_classes: uniqueEnumArray(
      value.required_availability_classes ?? [],
      'required_availability_classes',
      AVAILABILITY_CLASSES,
      { maxItems: AVAILABILITY_CLASSES.size }
    ),
    minimum_placement_assurance: value.minimum_placement_assurance,
    minimum_distinct_domains: normalizeDomainMinimums(value.minimum_distinct_domains ?? {}),
    content_address_profile: SOURCE_CONTENT_ADDRESS_PROFILE
  };
  const addressed = contentAddress(body, 'source-replication-policy', value.policy_id, value.policy_digest);
  return {
    ...body,
    policy_id: addressed.objectId,
    policy_digest: addressed.objectDigest
  };
}

export function normalizeSourceReplicaPlacement(raw) {
  const value = assertPlainObject(raw, 'source replica placement');
  rejectUnknown(value, new Set([
    'schema',
    'repository_id',
    'source_state_digest',
    'replica_id',
    'availability_classes',
    'domains',
    'assurance',
    'evidence_digest',
    'evidence_verified',
    'observed_at',
    'non_authoritative',
    'content_address_profile',
    'placement_id',
    'placement_digest'
  ]), 'source replica placement');
  if (value.schema !== SOURCE_REPLICA_PLACEMENT_SCHEMA) {
    throw new ValidationError(`source replica placement schema must be ${SOURCE_REPLICA_PLACEMENT_SCHEMA}`);
  }
  if (!ASSURANCE_RANK.has(value.assurance)) {
    throw new ValidationError('source replica placement assurance is unsupported');
  }
  if (value.non_authoritative !== true) {
    throw new ValidationError('source replica placement must remain explicitly non-authoritative');
  }
  if (value.content_address_profile !== SOURCE_CONTENT_ADDRESS_PROFILE) {
    throw new ValidationError('source replica placement content-address profile is unsupported');
  }
  const body = {
    schema: SOURCE_REPLICA_PLACEMENT_SCHEMA,
    repository_id: id(value.repository_id, 'repository_id'),
    source_state_digest: digest(value.source_state_digest, 'source_state_digest'),
    replica_id: id(value.replica_id, 'replica_id'),
    availability_classes: uniqueEnumArray(
      value.availability_classes ?? [],
      'availability_classes',
      AVAILABILITY_CLASSES,
      { maxItems: AVAILABILITY_CLASSES.size }
    ),
    domains: normalizeDomains(value.domains ?? {}),
    assurance: value.assurance,
    evidence_digest: digest(value.evidence_digest, 'evidence_digest'),
    evidence_verified: value.evidence_verified === true,
    observed_at: iso(value.observed_at, 'observed_at'),
    non_authoritative: true,
    content_address_profile: SOURCE_CONTENT_ADDRESS_PROFILE
  };
  const addressed = contentAddress(
    body,
    'source-replica-placement',
    value.placement_id,
    value.placement_digest
  );
  return {
    ...body,
    placement_id: addressed.objectId,
    placement_digest: addressed.objectDigest
  };
}

function latestBy(items, keyName, timeName, digestName, label) {
  const latest = new Map();
  for (const item of items) {
    const key = item[keyName];
    const prior = latest.get(key);
    if (!prior) {
      latest.set(key, item);
      continue;
    }
    const currentMs = new Date(item[timeName]).valueOf();
    const priorMs = new Date(prior[timeName]).valueOf();
    if (currentMs > priorMs) {
      latest.set(key, item);
    } else if (currentMs === priorMs && item[digestName] !== prior[digestName]) {
      throw new ValidationError(`${label} has ambiguous same-time records for ${key}`);
    }
  }
  return latest;
}

function currentEnough(observedAt, nowMs, maximumAgeMs, name) {
  const observedMs = new Date(observedAt).valueOf();
  if (observedMs > nowMs) throw new ValidationError(`${name} cannot be observed in the future`);
  return nowMs - observedMs <= maximumAgeMs;
}

function assuranceAtLeast(actual, minimum) {
  return ASSURANCE_RANK.get(actual) >= ASSURANCE_RANK.get(minimum);
}

export function evaluateSourceReplicationReadiness({
  source_state,
  policy,
  observations,
  placements = [],
  now = new Date().toISOString()
}) {
  const state = normalizeSourceState(source_state);
  const rules = normalizeSourceReplicationPolicy(policy);
  if (rules.source_state_digest !== state.state_digest) {
    throw new ValidationError('source replication policy is bound to a different source state');
  }
  if (!Array.isArray(observations) || !Array.isArray(placements)) {
    throw new ValidationError('source replication observations and placements must be arrays');
  }
  const evaluatedAt = iso(now, 'now');
  const nowMs = new Date(evaluatedAt).valueOf();
  const maximumAgeMs = rules.maximum_observation_age_seconds * 1000;

  const normalizedObservations = observations.map(normalizeSourceReplicaObservation);
  for (const observation of normalizedObservations) {
    if (
      observation.repository_id !== state.repository_id
      || observation.source_state_digest !== state.state_digest
      || observation.object_format !== state.object_format
    ) {
      throw new ValidationError('source replica observation belongs to a different source state');
    }
  }
  const latestObservations = latestBy(
    normalizedObservations,
    'replica_id',
    'observed_at',
    'observation_digest',
    'source replica observation'
  );

  const healthy = [];
  const unhealthy = [];
  for (const observation of latestObservations.values()) {
    const fresh = currentEnough(
      observation.observed_at,
      nowMs,
      maximumAgeMs,
      'source replica observation'
    );
    const exact = (
      fresh
      && observation.status === 'reachable'
      && observation.object_complete === true
      && observation.digest_verified === true
      && observation.observed_commit_oid === state.commit_oid
    );
    (exact ? healthy : unhealthy).push({ observation, fresh });
  }
  healthy.sort((a, b) => a.observation.replica_id.localeCompare(b.observation.replica_id));
  unhealthy.sort((a, b) => a.observation.replica_id.localeCompare(b.observation.replica_id));
  const healthyIds = new Set(healthy.map(item => item.observation.replica_id));

  const normalizedPlacements = placements.map(normalizeSourceReplicaPlacement);
  for (const placement of normalizedPlacements) {
    if (
      placement.repository_id !== state.repository_id
      || placement.source_state_digest !== state.state_digest
    ) {
      throw new ValidationError('source replica placement belongs to a different source state');
    }
  }
  const latestPlacements = latestBy(
    normalizedPlacements,
    'replica_id',
    'observed_at',
    'placement_digest',
    'source replica placement'
  );

  const qualifiedPlacements = new Map();
  for (const [replicaId, placement] of latestPlacements) {
    if (!healthyIds.has(replicaId)) continue;
    const fresh = currentEnough(
      placement.observed_at,
      nowMs,
      maximumAgeMs,
      'source replica placement'
    );
    if (
      fresh
      && placement.evidence_verified === true
      && assuranceAtLeast(placement.assurance, rules.minimum_placement_assurance)
    ) {
      qualifiedPlacements.set(replicaId, placement);
    }
  }

  const transportSet = new Set(healthy.map(item => item.observation.transport));
  const missingTransports = rules.required_transports.filter(value => !transportSet.has(value));

  const availabilitySet = new Set();
  for (const placement of qualifiedPlacements.values()) {
    for (const value of placement.availability_classes) availabilitySet.add(value);
  }
  const missingAvailability = rules.required_availability_classes.filter(
    value => !availabilitySet.has(value)
  );

  const domainCounts = {};
  const domainUnknown = [];
  const domainLow = [];
  for (const key of DOMAIN_KEYS) {
    const required = rules.minimum_distinct_domains[key];
    const knownByReplica = new Map();
    for (const [replicaId, placement] of qualifiedPlacements) {
      if (placement.domains[key] !== null) knownByReplica.set(replicaId, placement.domains[key]);
    }
    const distinct = new Set(knownByReplica.values()).size;
    domainCounts[key] = distinct;
    if (required === 0 || distinct >= required) continue;
    const unknownHealthy = healthy.length - knownByReplica.size;
    const maximumPossible = distinct + unknownHealthy;
    if (maximumPossible < required) domainLow.push(key);
    else domainUnknown.push(key);
  }

  const placementCoverageComplete = healthy.every(
    item => qualifiedPlacements.has(item.observation.replica_id)
  );
  const availabilityUnknown = missingAvailability.length > 0 && !placementCoverageComplete;
  const availabilityLow = missingAvailability.length > 0 && placementCoverageComplete;

  let readiness;
  if (healthy.length === 0) readiness = 'unreplicated';
  else if (healthy.length < rules.minimum_verified_replicas) readiness = 'under_replicated';
  else if (domainUnknown.length > 0 || availabilityUnknown) readiness = 'continuity_unverified';
  else if (missingTransports.length > 0 || domainLow.length > 0 || availabilityLow) {
    readiness = 'replicated_low_diversity';
  } else if (unhealthy.length > rules.maximum_unhealthy_replicas) readiness = 'degraded';
  else readiness = 'continuity_ready';

  const body = {
    schema: SOURCE_REPLICATION_ASSESSMENT_SCHEMA,
    repository_id: state.repository_id,
    source_state_digest: state.state_digest,
    policy_digest: rules.policy_digest,
    evaluated_at: evaluatedAt,
    readiness,
    policy_satisfied: readiness === 'continuity_ready',
    healthy_verified_replicas: healthy.length,
    unhealthy_or_stale_replicas: unhealthy.length,
    latest_replica_observations: latestObservations.size,
    qualified_placement_evidence: qualifiedPlacements.size,
    observed_transports: [...transportSet].sort(),
    observed_availability_classes: [...availabilitySet].sort(),
    distinct_domains: domainCounts,
    missing_required_transports: missingTransports,
    missing_required_availability_classes: missingAvailability,
    unverified_domain_requirements: domainUnknown.sort(),
    low_diversity_domain_requirements: domainLow.sort(),
    healthy_replica_ids: [...healthyIds].sort(),
    unhealthy_replica_ids: unhealthy.map(item => item.observation.replica_id),
    replica_locator_counted_as_failure_domain_evidence: false,
    replica_consensus_grants_lineage_authority: false,
    accepted_lineage_changed: false,
    authority_granted: false,
    content_address_profile: SOURCE_CONTENT_ADDRESS_PROFILE
  };
  const assessmentDigest = digestObject(body);
  return {
    ...body,
    assessment_id: `source-replication-assessment:${assessmentDigest}`,
    assessment_digest: assessmentDigest
  };
}

export const SOURCE_REPLICATION_AVAILABILITY_CLASSES = Object.freeze(
  [...AVAILABILITY_CLASSES].sort()
);
export const SOURCE_REPLICATION_ASSURANCE_LEVELS = Object.freeze(
  [...ASSURANCE_RANK.keys()]
);
