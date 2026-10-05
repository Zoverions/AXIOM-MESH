import { canonicalJson, digestObject, ValidationError } from './canonical.mjs';
import { validateRuntimeConnectorCatalogEntry } from './runtime-connector-fabric-contracts.mjs';

export const CATALOG_CANDIDATE_ASSESSMENT_SCHEMA = 'axiom-catalog-candidate-assessment.v0';

const MAX_ENTRY_BYTES = 256 * 1024;
const DIGEST = /^[a-f0-9]{64}$/;
const ACCESS_LISTS = Object.freeze([
  'capabilities', 'actions', 'purposes', 'destinations', 'data_classes',
  'credential_classes', 'network_destinations'
]);

function entry(value, label) {
  // Canonicalization rejects hidden fields, accessors, sparse arrays, and
  // custom prototypes before the existing draft contract reads any values.
  const encoded = canonicalJson(value);
  if (Buffer.byteLength(encoded, 'utf8') > MAX_ENTRY_BYTES) {
    throw new ValidationError(`${label} exceeds the catalog assessment byte limit`);
  }
  const plain = JSON.parse(encoded);
  validateRuntimeConnectorCatalogEntry(plain);
  return plain;
}

function timestamp(value) {
  if (typeof value !== 'string' || value.length !== 24) {
    throw new ValidationError('catalog assessment asOf must be a canonical UTC timestamp');
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== value) {
    throw new ValidationError('catalog assessment asOf must be a canonical UTC timestamp');
  }
  return value;
}

function listDiff(before = [], after = []) {
  const oldValues = new Set(before);
  const newValues = new Set(after);
  return {
    added: [...newValues].filter(value => !oldValues.has(value)).sort(),
    removed: [...oldValues].filter(value => !newValues.has(value)).sort()
  };
}

function permissionDiff(previous, candidate) {
  const before = previous?.requested_access ?? {};
  const after = candidate.requested_access;
  const result = {};
  for (const field of ACCESS_LISTS) {
    result[field] = listDiff(before[field], after[field]);
  }
  result.network_required = {
    from: before.network_required ?? false,
    to: after.network_required
  };
  result.resource_bounds = {
    from: before.resource_bounds ?? null,
    to: after.resource_bounds ?? null
  };
  return result;
}

function reviewChanges(previous, candidate) {
  if (!previous) return [];
  const changes = [];
  for (const field of ['entry_id', 'entry_version']) {
    if (previous[field] !== candidate[field]) changes.push(field);
  }
  for (const category of ['subject', 'lifecycle']) {
    for (const field of new Set([
      ...Object.keys(previous[category]), ...Object.keys(candidate[category])
    ])) {
      if (canonicalJson(previous[category][field] ?? null) !== canonicalJson(candidate[category][field] ?? null)) {
        changes.push(`${category}.${field}`);
      }
    }
  }
  for (const field of new Set([
    ...Object.keys(previous.provenance), ...Object.keys(candidate.provenance)
  ])) {
    if (canonicalJson(previous.provenance[field] ?? null) !== canonicalJson(candidate.provenance[field] ?? null)) {
      changes.push(`provenance.${field}`);
    }
  }
  for (const field of ['platforms', 'deployment_forms', 'adapter_contracts', 'protocol_profiles']) {
    if (canonicalJson(previous.compatibility[field] ?? null) !== canonicalJson(candidate.compatibility[field] ?? null)) {
      changes.push(`compatibility.${field}`);
    }
  }
  for (const field of ['mode', 'may_spawn_workers', 'independent_child_authority_requested', 'remote_execution_requested', 'handoff_contracts']) {
    if (canonicalJson(previous.orchestration[field] ?? null) !== canonicalJson(candidate.orchestration[field] ?? null)) {
      changes.push(`orchestration.${field}`);
    }
  }
  if (canonicalJson(previous.assurance.evidence_fresh_until ?? null) !== canonicalJson(candidate.assurance.evidence_fresh_until ?? null)) {
    changes.push('assurance.evidence_fresh_until');
  }
  for (const field of ['observations', 'last_reviewed_at', 'cataloged_at']) {
    if (canonicalJson(previous.assurance[field] ?? null) !== canonicalJson(candidate.assurance[field] ?? null)) {
      changes.push(`assurance.${field}`);
    }
  }
  if (canonicalJson(previous.non_claims) !== canonicalJson(candidate.non_claims)) {
    changes.push('non_claims');
  }
  return changes.sort();
}

function reasonCodes(candidate, asOf) {
  const reasons = new Set([
    'artifact_unverified', 'needs_review', 'sbom_unverified', 'signature_unverified'
  ]);
  if (candidate.provenance.artifact_sha256 === undefined) reasons.add('artifact_digest_missing');
  if (candidate.provenance.sbom_sha256 === undefined) reasons.add('sbom_digest_missing');
  if (candidate.assurance.observations.length === 0) reasons.add('assurance_missing');
  const expiry = candidate.assurance.evidence_fresh_until;
  if (expiry === undefined && candidate.assurance.observations.length > 0) {
    reasons.add('assurance_currentness_unknown');
  }
  if (expiry !== undefined && Date.parse(expiry) <= Date.parse(asOf)) {
    reasons.add('assurance_stale');
  }
  for (const observation of candidate.assurance.observations) {
    if (Date.parse(observation.observed_at) > Date.parse(asOf)) reasons.add('assurance_future');
    if (observation.result !== 'pass') reasons.add('assurance_nonpassing');
    if (observation.fresh_until !== undefined && Date.parse(observation.fresh_until) <= Date.parse(asOf)) {
      reasons.add('assurance_stale');
    }
  }
  return [...reasons].sort();
}

function deepFreeze(value) {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

export function assessCatalogCandidate(input = {}) {
  const encoded = canonicalJson(input);
  if (Buffer.byteLength(encoded, 'utf8') > 2 * MAX_ENTRY_BYTES + 4096) {
    throw new ValidationError('catalog assessment input exceeds the byte limit');
  }
  const request = JSON.parse(encoded);
  if (request === null || typeof request !== 'object' || Array.isArray(request)) {
    throw new ValidationError('catalog assessment input must be an object');
  }
  for (const field of Object.keys(request)) {
    if (!['candidate', 'previousEntry', 'expectedPriorDigest', 'asOf'].includes(field)) {
      throw new ValidationError(`catalog assessment contains unsupported field ${field}`);
    }
  }
  const { candidate, previousEntry = null, expectedPriorDigest, asOf } = request;
  if (previousEntry === null && expectedPriorDigest !== undefined) {
    throw new ValidationError('catalog assessment cannot bind a prior digest without a prior entry');
  }
  if (previousEntry !== null && (typeof expectedPriorDigest !== 'string' || !DIGEST.test(expectedPriorDigest))) {
    throw new ValidationError('catalog assessment expectedPriorDigest must be a lowercase SHA-256 digest');
  }
  const assessedAt = timestamp(asOf);
  const current = entry(candidate, 'catalog candidate');
  const prior = previousEntry === null ? null : entry(previousEntry, 'prior catalog entry');
  const currentDigest = digestObject(current);
  const priorDigest = prior === null ? null : digestObject(prior);
  if (prior) {
    if (expectedPriorDigest !== priorDigest) {
      throw new ValidationError('catalog assessment prior digest does not match the supplied prior entry');
    }
    if (prior.subject.subject_id !== current.subject.subject_id || prior.integration_class !== current.integration_class) {
      throw new ValidationError('catalog comparison requires the same subject and integration class');
    }
    if (prior.entry_id !== current.entry_id && current.lifecycle.supersedes_entry_id !== prior.entry_id) {
      throw new ValidationError('catalog comparison requires the same entry ID or exact supersession');
    }
    if (prior.entry_id === current.entry_id && prior.entry_version === current.entry_version && priorDigest !== currentDigest) {
      throw new ValidationError('catalog immutable same entry ID and version changed content');
    }
  }
  return deepFreeze({
    schema: CATALOG_CANDIDATE_ASSESSMENT_SCHEMA,
    entry_id: current.entry_id,
    entry_version: current.entry_version,
    entry_digest: currentDigest,
    prior_entry_digest: priorDigest,
    assessed_at: assessedAt,
    disposition: 'quarantined_inert',
    assurance_status: 'unverified',
    reason_codes: reasonCodes(current, assessedAt),
    permission_diff: permissionDiff(prior, current),
    review_changes: reviewChanges(prior, current),
    authority_effect: 'none',
    runtime_activation: false,
    capability_promoted: false
  });
}
