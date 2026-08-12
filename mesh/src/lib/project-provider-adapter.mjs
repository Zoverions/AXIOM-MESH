import {
  ValidationError,
  assertPlainObject,
  assertString,
  digestObject,
  sha256
} from './canonical.mjs';
import {
  PROJECT_EVENT_OBSERVATION_SCHEMA,
  PROJECT_EVENT_SCHEMA,
  normalizeProjectEvent,
  normalizeProjectEventObservation
} from './project-continuity-events.mjs';
import { SOURCE_CONTENT_ADDRESS_PROFILE } from './source-continuity.mjs';

export const PROJECT_PROVIDER_CAPTURE_SCHEMA = 'axiom-project-provider-capture.v1';
export const PROJECT_PROVIDER_ADAPTATION_SCHEMA = 'axiom-project-provider-adaptation.v1';

const DIGEST = /^[a-f0-9]{64}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,255}$/;
const SEMANTIC = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$/;
const PROVIDERS = new Set(['github', 'forgejo', 'gitlab', 'radicle', 'agent_forge', 'other']);
const CONTENT_MODES = new Set(['digest_only', 'inline_public', 'protected_reference']);

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

function stringOrNull(value, name, { max = 2048 } = {}) {
  return present(value) ? assertString(value, name, { min: 1, max }) : null;
}

function iso(value, name) {
  const raw = assertString(value, name, { min: 1, max: 64 });
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.valueOf())) throw new ValidationError(`${name} must be an ISO timestamp`);
  return parsed.toISOString();
}

function uniqueIds(raw, name, { maxItems = 64, pattern = ID, itemMax = 256 } = {}) {
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

function normalizeExternal(raw) {
  const value = assertPlainObject(raw, 'provider capture external identity');
  rejectUnknown(value, new Set([
    'project_id',
    'object_id',
    'event_id',
    'revision',
    'actor_id',
    'locator',
    'semantic_kind'
  ]), 'provider capture external identity');
  return {
    project_id: assertString(value.project_id, 'external.project_id', { min: 1, max: 256 }),
    object_id: assertString(value.object_id, 'external.object_id', { min: 1, max: 256 }),
    event_id: stringOrNull(value.event_id, 'external.event_id', { max: 256 }),
    revision: stringOrNull(value.revision, 'external.revision', { max: 256 }),
    actor_id: stringOrNull(value.actor_id, 'external.actor_id', { max: 256 }),
    locator: stringOrNull(value.locator, 'external.locator'),
    semantic_kind: assertString(value.semantic_kind, 'external.semantic_kind', {
      min: 1,
      max: 192,
      pattern: SEMANTIC
    })
  };
}

function normalizeActorBinding(raw) {
  if (!present(raw)) {
    return { actor_id: null, binding_digest: null, verified: false };
  }
  const value = assertPlainObject(raw, 'provider capture actor binding');
  rejectUnknown(value, new Set(['actor_id', 'binding_digest', 'verified']), 'provider capture actor binding');
  const verified = value.verified === true;
  const actorId = present(value.actor_id) ? id(value.actor_id, 'actor_binding.actor_id') : null;
  const bindingDigest = nullableDigest(value.binding_digest, 'actor_binding.binding_digest');
  if (verified && (actorId === null || bindingDigest === null)) {
    throw new ValidationError('verified provider actor binding requires AXIOM actor id and binding digest');
  }
  if (!verified && (actorId !== null || bindingDigest !== null)) {
    throw new ValidationError('unverified provider actor binding cannot nominate AXIOM actor identity');
  }
  return { actor_id: actorId, binding_digest: bindingDigest, verified };
}

function normalizeContent(raw) {
  const value = assertPlainObject(raw, 'provider capture content');
  rejectUnknown(value, new Set([
    'visibility',
    'mode',
    'media_type',
    'inline_utf8',
    'content_digest',
    'byte_length',
    'protected_ref'
  ]), 'provider capture content');
  if (!CONTENT_MODES.has(value.mode)) {
    throw new ValidationError('provider capture content mode is unsupported');
  }

  if (value.mode === 'inline_public') {
    if (typeof value.inline_utf8 !== 'string') {
      throw new ValidationError('inline provider content requires UTF-8 text');
    }
    const bytes = Buffer.from(value.inline_utf8, 'utf8');
    const computedDigest = sha256(bytes);
    if (present(value.content_digest) && digest(value.content_digest, 'content.content_digest') !== computedDigest) {
      throw new ValidationError('provider inline content digest does not match supplied bytes');
    }
    if (present(value.byte_length) && value.byte_length !== bytes.length) {
      throw new ValidationError('provider inline content byte length does not match supplied bytes');
    }
    return {
      visibility: value.visibility,
      mode: value.mode,
      media_type: value.media_type,
      content_digest: computedDigest,
      byte_length: bytes.length,
      inline_utf8: value.inline_utf8
    };
  }

  if (!Number.isSafeInteger(value.byte_length) || value.byte_length < 0) {
    throw new ValidationError('provider captured non-inline content requires a non-negative byte length');
  }
  const output = {
    visibility: value.visibility,
    mode: value.mode,
    media_type: value.media_type,
    content_digest: digest(value.content_digest, 'content.content_digest'),
    byte_length: value.byte_length
  };
  if (value.mode === 'protected_reference') output.protected_ref = value.protected_ref;
  return output;
}

export function adaptProjectProviderCapture(raw) {
  const value = assertPlainObject(raw, 'project provider capture');
  rejectUnknown(value, new Set([
    'schema',
    'provider',
    'project_id',
    'project_object_id',
    'object_kind',
    'event_kind',
    'occurred_at',
    'external',
    'content',
    'source_state_digest',
    'previous_event_digest',
    'related_object_ids',
    'ci_outcome',
    'actor_binding',
    'provider_evidence_digest',
    'provider_authenticity_verified',
    'event_content_reproduced',
    'unsupported_semantics',
    'content_address_profile'
  ]), 'project provider capture');
  if (value.schema !== PROJECT_PROVIDER_CAPTURE_SCHEMA) {
    throw new ValidationError(`project provider capture schema must be ${PROJECT_PROVIDER_CAPTURE_SCHEMA}`);
  }
  if (!PROVIDERS.has(value.provider)) {
    throw new ValidationError('project provider capture provider is unsupported');
  }
  if (value.content_address_profile !== SOURCE_CONTENT_ADDRESS_PROFILE) {
    throw new ValidationError('project provider capture content-address profile is unsupported');
  }

  const external = normalizeExternal(value.external);
  const actorBinding = normalizeActorBinding(value.actor_binding);
  if (actorBinding.verified && external.actor_id === null) {
    throw new ValidationError('verified AXIOM actor binding requires the provider external actor id being bound');
  }
  const unsupported = uniqueIds(
    value.unsupported_semantics ?? [],
    'unsupported_semantics',
    { maxItems: 64, pattern: SEMANTIC, itemMax: 192 }
  );

  const event = normalizeProjectEvent({
    schema: PROJECT_EVENT_SCHEMA,
    project_id: id(value.project_id, 'project_id'),
    project_object_id: id(value.project_object_id, 'project_object_id'),
    object_kind: value.object_kind,
    event_kind: value.event_kind,
    occurred_at: iso(value.occurred_at, 'occurred_at'),
    time_assurance: 'provider_reported',
    actor: actorBinding.verified
      ? {
          actor_id: actorBinding.actor_id,
          actor_binding_digest: actorBinding.binding_digest
        }
      : { actor_id: null, actor_binding_digest: null },
    content: normalizeContent(value.content),
    source_state_digest: nullableDigest(value.source_state_digest, 'source_state_digest'),
    previous_event_digest: nullableDigest(value.previous_event_digest, 'previous_event_digest'),
    related_object_ids: uniqueIds(value.related_object_ids ?? [], 'related_object_ids'),
    ci_outcome: present(value.ci_outcome) ? value.ci_outcome : null,
    governance_authority_granted: false,
    capability_promotion: false,
    content_address_profile: SOURCE_CONTENT_ADDRESS_PROFILE
  });

  const observation = normalizeProjectEventObservation({
    schema: PROJECT_EVENT_OBSERVATION_SCHEMA,
    project_id: event.project_id,
    event_digest: event.event_digest,
    provider: value.provider,
    external_project_id: external.project_id,
    external_object_id: external.object_id,
    external_event_id: external.event_id,
    external_revision: external.revision,
    external_actor_id: external.actor_id,
    actor_binding_digest: actorBinding.verified ? actorBinding.binding_digest : null,
    actor_binding_verified: actorBinding.verified,
    locator: external.locator,
    provider_evidence_digest: digest(value.provider_evidence_digest, 'provider_evidence_digest'),
    provider_authenticity_verified: value.provider_authenticity_verified === true,
    event_content_reproduced: value.event_content_reproduced === true,
    observed_at: iso(value.occurred_at, 'occurred_at'),
    non_authoritative: true,
    content_address_profile: SOURCE_CONTENT_ADDRESS_PROFILE
  });

  const body = {
    schema: PROJECT_PROVIDER_ADAPTATION_SCHEMA,
    provider: value.provider,
    project_id: event.project_id,
    project_object_id: event.project_object_id,
    provider_semantic_kind: external.semantic_kind,
    event_digest: event.event_digest,
    observation_digest: observation.observation_digest,
    unsupported_provider_semantics: unsupported,
    semantics_complete: unsupported.length === 0,
    actor_identity_bound: actorBinding.verified,
    canonical_identity_derived_from_provider: false,
    provider_observation_grants_authority: false,
    adaptation_grants_authority: false,
    network_access_performed: false,
    provider_mutation_performed: false,
    content_address_profile: SOURCE_CONTENT_ADDRESS_PROFILE
  };
  const adaptationDigest = digestObject(body);
  return {
    ...body,
    adaptation_id: `project-provider-adaptation:${adaptationDigest}`,
    adaptation_digest: adaptationDigest,
    event,
    observation
  };
}

export const PROJECT_PROVIDER_ADAPTER_PROVIDERS = Object.freeze([...PROVIDERS].sort());
