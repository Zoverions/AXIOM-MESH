import {
  ValidationError,
  assertPlainObject,
  assertString,
  digestObject
} from './canonical.mjs';
import { verifyObjectSignature } from './identity.mjs';
import {
  PROJECT_EVENT_KINDS,
  assertProjectEventObservationMatchesEvent,
  normalizeProjectEvent,
  normalizeProjectEventObservation
} from './project-continuity-events.mjs';
import { SOURCE_CONTENT_ADDRESS_PROFILE } from './source-continuity.mjs';

export const PROJECT_CONTINUITY_PACKAGE_SCHEMA = 'axiom-project-continuity-package.v1';
export const PROJECT_CONTINUITY_IMPORT_PLAN_SCHEMA = 'axiom-project-continuity-import-plan.v1';

const DIGEST = /^[a-f0-9]{64}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,255}$/;
const MAX_CANONICAL_EVENTS = 4_096;
const MAX_PROVIDER_OBSERVATIONS = 16_384;
const MAX_INLINE_PUBLIC_BYTES = 16 * 1024 * 1024;

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

function iso(value, name) {
  const raw = assertString(value, name, { min: 1, max: 64 });
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.valueOf())) throw new ValidationError(`${name} must be an ISO timestamp`);
  return parsed.toISOString();
}

function positiveInteger(value, name) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new ValidationError(`${name} must be a positive safe integer`);
  }
  return value;
}

function nonNegativeInteger(value, name) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new ValidationError(`${name} must be a non-negative safe integer`);
  }
  return value;
}

function exactStringSet(raw, name, { pattern = DIGEST, maxItems = 32_768, itemMax = 256 } = {}) {
  if (!Array.isArray(raw) || raw.length > maxItems) {
    throw new ValidationError(`${name} must be an array with at most ${maxItems} items`);
  }
  const values = raw.map((value, index) => assertString(
    value,
    `${name}[${index}]`,
    { min: 1, max: itemMax, pattern }
  ));
  if (new Set(values).size !== values.length) {
    throw new ValidationError(`${name} must contain unique values`);
  }
  return [...values].sort();
}

function normalizeAnchor(raw, name) {
  const value = assertPlainObject(raw, name);
  rejectUnknown(value, new Set(['event_seq', 'event_hash', 'recorded_at', 'event', 'observation']), name);
  return {
    event_seq: positiveInteger(value.event_seq, `${name}.event_seq`),
    event_hash: digest(value.event_hash, `${name}.event_hash`),
    recorded_at: iso(value.recorded_at, `${name}.recorded_at`)
  };
}

function normalizeCanonicalEntry(raw, index) {
  const value = assertPlainObject(raw, `canonical_events[${index}]`);
  rejectUnknown(
    value,
    new Set(['event', 'event_seq', 'event_hash', 'recorded_at']),
    `canonical_events[${index}]`
  );
  return {
    event: normalizeProjectEvent(value.event),
    ...normalizeAnchor(value, `canonical_events[${index}]`)
  };
}

function normalizeObservationEntry(raw, index) {
  const value = assertPlainObject(raw, `provider_observations[${index}]`);
  rejectUnknown(
    value,
    new Set(['observation', 'event_seq', 'event_hash', 'recorded_at']),
    `provider_observations[${index}]`
  );
  return {
    observation: normalizeProjectEventObservation(value.observation),
    ...normalizeAnchor(value, `provider_observations[${index}]`)
  };
}

function assertStrictAscending(entries, name) {
  let prior = 0;
  for (const entry of entries) {
    if (entry.event_seq <= prior) {
      throw new ValidationError(`${name} Grid sequences must be strictly ascending`);
    }
    prior = entry.event_seq;
  }
}

function verifyProjectEntries({ projectId, canonicalEntries, observationEntries }) {
  if (canonicalEntries.length > MAX_CANONICAL_EVENTS) {
    throw new ValidationError(`project continuity package exceeds ${MAX_CANONICAL_EVENTS} canonical events`);
  }
  if (observationEntries.length > MAX_PROVIDER_OBSERVATIONS) {
    throw new ValidationError(`project continuity package exceeds ${MAX_PROVIDER_OBSERVATIONS} provider observations`);
  }
  assertStrictAscending(canonicalEntries, 'canonical project events');
  assertStrictAscending(observationEntries, 'project provider observations');

  const usedGridSeq = new Set();
  const canonicalByDigest = new Map();
  let inlinePublicBytes = 0;
  const sourceDependencies = new Set();
  const protectedReferences = new Set();

  for (const entry of canonicalEntries) {
    const event = entry.event;
    if (event.project_id !== projectId) {
      throw new ValidationError('project continuity package contains a canonical event for another project');
    }
    if (usedGridSeq.has(entry.event_seq)) {
      throw new ValidationError('project continuity package reuses a Grid event sequence');
    }
    usedGridSeq.add(entry.event_seq);
    if (canonicalByDigest.has(event.event_digest)) {
      throw new ValidationError('project continuity package contains a duplicate canonical event');
    }
    if (event.previous_event_digest !== null) {
      const predecessor = canonicalByDigest.get(event.previous_event_digest);
      if (!predecessor) {
        throw new ValidationError('project continuity package explicit predecessor is absent or not earlier');
      }
      if (predecessor.event.project_object_id !== event.project_object_id) {
        throw new ValidationError('project continuity package predecessor belongs to another project object');
      }
    }
    canonicalByDigest.set(event.event_digest, entry);
    if (event.source_state_digest !== null) sourceDependencies.add(event.source_state_digest);
    if (event.content.mode === 'inline_public') inlinePublicBytes += event.content.byte_length;
    if (event.content.mode === 'protected_reference') {
      protectedReferences.add(event.content.protected_ref);
    }
  }

  if (inlinePublicBytes > MAX_INLINE_PUBLIC_BYTES) {
    throw new ValidationError(
      `project continuity package exceeds ${MAX_INLINE_PUBLIC_BYTES} inline public bytes`
    );
  }

  const observationDigests = new Set();
  for (const entry of observationEntries) {
    const observation = entry.observation;
    if (observation.project_id !== projectId) {
      throw new ValidationError('project continuity package contains a provider observation for another project');
    }
    if (usedGridSeq.has(entry.event_seq)) {
      throw new ValidationError('project continuity package reuses a Grid event sequence');
    }
    usedGridSeq.add(entry.event_seq);
    if (observationDigests.has(observation.observation_digest)) {
      throw new ValidationError('project continuity package contains a duplicate provider observation');
    }
    observationDigests.add(observation.observation_digest);
    const canonical = canonicalByDigest.get(observation.event_digest);
    if (!canonical) {
      throw new ValidationError('project continuity package observation references an unknown canonical event');
    }
    if (entry.event_seq <= canonical.event_seq) {
      throw new ValidationError('project continuity package observation must follow its canonical event in Grid history');
    }
    assertProjectEventObservationMatchesEvent(observation, canonical.event);
  }

  return {
    sourceDependencies: [...sourceDependencies].sort(),
    protectedReferences: [...protectedReferences].sort(),
    inlinePublicBytes,
    allGridSeq: [...usedGridSeq].sort((a, b) => a - b)
  };
}

function requireLedger(raw) {
  const ledger = assertPlainObject(raw, 'project continuity ledger');
  if (ledger.schema !== 'axiom-project-continuity-ledger.v1') {
    throw new ValidationError('project continuity package requires an M1 project ledger');
  }
  const projectId = id(ledger.project_id, 'ledger.project_id');
  if (
    ledger.history_completeness_claimed !== false
    || ledger.provider_observation_grants_authority !== false
    || ledger.portable_event_grants_governance_authority !== false
    || ledger.portable_event_promotes_capability !== false
    || ledger.source_state_bindings_reverified !== true
    || ledger.predecessor_bindings_reverified !== true
  ) {
    throw new ValidationError('project continuity ledger safety facts are missing or weakened');
  }
  if (!Array.isArray(ledger.canonical_events) || !Array.isArray(ledger.provider_observations)) {
    throw new ValidationError('project continuity ledger event collections are invalid');
  }
  if (ledger.canonical_event_count !== ledger.canonical_events.length) {
    throw new ValidationError('project continuity ledger canonical event count is inconsistent');
  }
  if (ledger.provider_observation_count !== ledger.provider_observations.length) {
    throw new ValidationError('project continuity ledger observation count is inconsistent');
  }
  const canonicalEntries = ledger.canonical_events.map(normalizeCanonicalEntry);
  const observationEntries = ledger.provider_observations.map(normalizeObservationEntry);
  const derived = verifyProjectEntries({ projectId, canonicalEntries, observationEntries });
  return { projectId, canonicalEntries, observationEntries, derived };
}

function requireGridIdentity(identity) {
  if (
    !identity
    || typeof identity.signObject !== 'function'
    || typeof identity.keyId !== 'string'
    || !identity.keyId.startsWith('grid:')
  ) {
    throw new ValidationError('project continuity package export requires Grid identity');
  }
  return identity;
}

export function buildProjectContinuityPackage({
  ledger,
  identity,
  exported_at = new Date().toISOString()
}) {
  const exporter = requireGridIdentity(identity);
  const retained = requireLedger(ledger);
  const exportedAt = iso(exported_at, 'exported_at');
  const firstGridSeq = retained.derived.allGridSeq.length
    ? retained.derived.allGridSeq[0]
    : null;
  const lastGridSeq = retained.derived.allGridSeq.length
    ? retained.derived.allGridSeq.at(-1)
    : null;

  const core = {
    schema: PROJECT_CONTINUITY_PACKAGE_SCHEMA,
    project_id: retained.projectId,
    exported_at: exportedAt,
    producer_key_id: exporter.keyId,
    canonical_events: retained.canonicalEntries,
    provider_observations: retained.observationEntries,
    canonical_event_count: retained.canonicalEntries.length,
    provider_observation_count: retained.observationEntries.length,
    source_state_dependencies: retained.derived.sourceDependencies,
    protected_references: retained.derived.protectedReferences,
    inline_public_bytes: retained.derived.inlinePublicBytes,
    first_grid_seq: firstGridSeq,
    last_grid_seq: lastGridSeq,
    producer_claimed_grid_chain_verified_at_export: true,
    producer_claimed_retained_project_snapshot_complete: true,
    history_completeness_claimed: false,
    originating_full_grid_chain_included: false,
    protected_content_bytes_included: false,
    provider_restore_performed: false,
    import_authorized: false,
    content_address_profile: SOURCE_CONTENT_ADDRESS_PROFILE
  };
  const packageDigest = digestObject(core);
  const signedBody = {
    ...core,
    package_id: `project-continuity-package:${packageDigest}`,
    package_digest: packageDigest
  };
  return {
    ...signedBody,
    signature: exporter.signObject(signedBody)
  };
}

function normalizeSignature(raw) {
  const value = assertPlainObject(raw, 'project continuity package signature');
  rejectUnknown(value, new Set(['algorithm', 'key_id', 'digest', 'signature']), 'project continuity package signature');
  if (value.algorithm !== 'Ed25519') {
    throw new ValidationError('project continuity package signature algorithm is unsupported');
  }
  return {
    algorithm: value.algorithm,
    key_id: assertString(value.key_id, 'signature.key_id', { min: 1, max: 192 }),
    digest: digest(value.digest, 'signature.digest'),
    signature: assertString(value.signature, 'signature.signature', { min: 1, max: 256 })
  };
}

export function verifyProjectContinuityPackage(raw, { public_key } = {}) {
  const value = assertPlainObject(raw, 'project continuity package');
  rejectUnknown(value, new Set([
    'schema',
    'project_id',
    'exported_at',
    'producer_key_id',
    'canonical_events',
    'provider_observations',
    'canonical_event_count',
    'provider_observation_count',
    'source_state_dependencies',
    'protected_references',
    'inline_public_bytes',
    'first_grid_seq',
    'last_grid_seq',
    'producer_claimed_grid_chain_verified_at_export',
    'producer_claimed_retained_project_snapshot_complete',
    'history_completeness_claimed',
    'originating_full_grid_chain_included',
    'protected_content_bytes_included',
    'provider_restore_performed',
    'import_authorized',
    'content_address_profile',
    'package_id',
    'package_digest',
    'signature'
  ]), 'project continuity package');
  if (value.schema !== PROJECT_CONTINUITY_PACKAGE_SCHEMA) {
    throw new ValidationError(`project continuity package schema must be ${PROJECT_CONTINUITY_PACKAGE_SCHEMA}`);
  }
  if (!public_key) throw new ValidationError('project continuity package public key is required');
  if (value.content_address_profile !== SOURCE_CONTENT_ADDRESS_PROFILE) {
    throw new ValidationError('project continuity package content-address profile is unsupported');
  }

  const projectId = id(value.project_id, 'project_id');
  const canonicalEntries = Array.isArray(value.canonical_events)
    ? value.canonical_events.map(normalizeCanonicalEntry)
    : (() => { throw new ValidationError('project continuity package canonical events must be an array'); })();
  const observationEntries = Array.isArray(value.provider_observations)
    ? value.provider_observations.map(normalizeObservationEntry)
    : (() => { throw new ValidationError('project continuity package provider observations must be an array'); })();
  const derived = verifyProjectEntries({ projectId, canonicalEntries, observationEntries });

  if (nonNegativeInteger(value.canonical_event_count, 'canonical_event_count') !== canonicalEntries.length) {
    throw new ValidationError('project continuity package canonical event count is inconsistent');
  }
  if (
    nonNegativeInteger(value.provider_observation_count, 'provider_observation_count')
    !== observationEntries.length
  ) {
    throw new ValidationError('project continuity package provider observation count is inconsistent');
  }
  if (nonNegativeInteger(value.inline_public_bytes, 'inline_public_bytes') !== derived.inlinePublicBytes) {
    throw new ValidationError('project continuity package inline public byte count is inconsistent');
  }

  const suppliedDependencies = exactStringSet(
    value.source_state_dependencies,
    'source_state_dependencies'
  );
  if (JSON.stringify(suppliedDependencies) !== JSON.stringify(derived.sourceDependencies)) {
    throw new ValidationError('project continuity package source-state dependencies are incomplete or substituted');
  }
  const suppliedProtected = exactStringSet(
    value.protected_references,
    'protected_references',
    { pattern: /^protected:[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$/, itemMax: 202 }
  );
  if (JSON.stringify(suppliedProtected) !== JSON.stringify(derived.protectedReferences)) {
    throw new ValidationError('project continuity package protected references are incomplete or substituted');
  }

  const expectedFirst = derived.allGridSeq.length ? derived.allGridSeq[0] : null;
  const expectedLast = derived.allGridSeq.length ? derived.allGridSeq.at(-1) : null;
  if ((value.first_grid_seq ?? null) !== expectedFirst || (value.last_grid_seq ?? null) !== expectedLast) {
    throw new ValidationError('project continuity package Grid sequence bounds are inconsistent');
  }
  if (
    value.producer_claimed_grid_chain_verified_at_export !== true
    || value.producer_claimed_retained_project_snapshot_complete !== true
    || value.history_completeness_claimed !== false
    || value.originating_full_grid_chain_included !== false
    || value.protected_content_bytes_included !== false
    || value.provider_restore_performed !== false
    || value.import_authorized !== false
  ) {
    throw new ValidationError('project continuity package safety or claim boundary is weakened');
  }

  const core = {
    schema: PROJECT_CONTINUITY_PACKAGE_SCHEMA,
    project_id: projectId,
    exported_at: iso(value.exported_at, 'exported_at'),
    producer_key_id: assertString(value.producer_key_id, 'producer_key_id', { min: 1, max: 192 }),
    canonical_events: canonicalEntries,
    provider_observations: observationEntries,
    canonical_event_count: canonicalEntries.length,
    provider_observation_count: observationEntries.length,
    source_state_dependencies: suppliedDependencies,
    protected_references: suppliedProtected,
    inline_public_bytes: derived.inlinePublicBytes,
    first_grid_seq: expectedFirst,
    last_grid_seq: expectedLast,
    producer_claimed_grid_chain_verified_at_export: true,
    producer_claimed_retained_project_snapshot_complete: true,
    history_completeness_claimed: false,
    originating_full_grid_chain_included: false,
    protected_content_bytes_included: false,
    provider_restore_performed: false,
    import_authorized: false,
    content_address_profile: SOURCE_CONTENT_ADDRESS_PROFILE
  };
  const packageDigest = digestObject(core);
  if (digest(value.package_digest, 'package_digest') !== packageDigest) {
    throw new ValidationError('project continuity package digest does not match canonical content');
  }
  const packageId = `project-continuity-package:${packageDigest}`;
  if (assertString(value.package_id, 'package_id', { min: 1, max: 320 }) !== packageId) {
    throw new ValidationError('project continuity package id does not match canonical content');
  }
  const signedBody = { ...core, package_id: packageId, package_digest: packageDigest };
  const signature = normalizeSignature(value.signature);
  if (signature.key_id !== core.producer_key_id) {
    throw new ValidationError('project continuity package signature key does not match producer');
  }
  if (!verifyObjectSignature(signedBody, signature, public_key)) {
    throw new ValidationError('project continuity package signature is invalid');
  }

  return { ...signedBody, signature };
}

export function buildProjectContinuityImportPlan({
  package: rawPackage,
  public_key,
  target_provider,
  supported_event_kinds,
  created_at = new Date().toISOString()
}) {
  const verified = verifyProjectContinuityPackage(rawPackage, { public_key });
  const targetProvider = id(target_provider, 'target_provider');
  const allowedKinds = new Set(PROJECT_EVENT_KINDS);
  const supported = exactStringSet(
    supported_event_kinds,
    'supported_event_kinds',
    { pattern: /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$/, maxItems: PROJECT_EVENT_KINDS.length, itemMax: 192 }
  );
  for (const kind of supported) {
    if (!allowedKinds.has(kind)) {
      throw new ValidationError(`import plan target declares unsupported canonical event kind: ${kind}`);
    }
  }
  const supportedSet = new Set(supported);
  const restorable = [];
  const unmapped = [];
  for (const entry of verified.canonical_events) {
    (supportedSet.has(entry.event.event_kind) ? restorable : unmapped).push(entry.event.event_digest);
  }
  const observationEvidence = verified.provider_observations
    .map(entry => entry.observation.observation_digest)
    .sort();

  const body = {
    schema: PROJECT_CONTINUITY_IMPORT_PLAN_SCHEMA,
    project_id: verified.project_id,
    package_digest: verified.package_digest,
    target_provider: targetProvider,
    created_at: iso(created_at, 'created_at'),
    supported_event_kinds: supported,
    restorable_event_digests: restorable.sort(),
    retained_unmapped_event_digests: unmapped.sort(),
    retained_provider_observation_digests: observationEvidence,
    provider_observations_replayed_as_provider_state: false,
    unmapped_evidence_discarded: false,
    canonical_project_ids_preserved: true,
    provider_mutation_performed: false,
    execution_authorized: false,
    content_address_profile: SOURCE_CONTENT_ADDRESS_PROFILE
  };
  const planDigest = digestObject(body);
  return {
    ...body,
    plan_id: `project-continuity-import-plan:${planDigest}`,
    plan_digest: planDigest
  };
}

export const PROJECT_CONTINUITY_PACKAGE_LIMITS = Object.freeze({
  max_canonical_events: MAX_CANONICAL_EVENTS,
  max_provider_observations: MAX_PROVIDER_OBSERVATIONS,
  max_inline_public_bytes: MAX_INLINE_PUBLIC_BYTES
});
