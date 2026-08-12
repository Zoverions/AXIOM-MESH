import {
  ValidationError,
  assertPlainObject,
  assertString,
  digestObject,
  sha256
} from './canonical.mjs';
import { SOURCE_CONTENT_ADDRESS_PROFILE } from './source-continuity.mjs';

export const PROJECT_EVENT_SCHEMA = 'axiom-project-event.v1';
export const PROJECT_EVENT_OBSERVATION_SCHEMA = 'axiom-project-event-observation.v1';

const DIGEST = /^[a-f0-9]{64}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,255}$/;
const MEDIA_TYPE = /^[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]*\/[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]*$/;
const PROTECTED_REF = /^protected:[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$/;
const MAX_INLINE_BYTES = 256 * 1024;

const EVENT_OBJECT_KIND = new Map([
  ['issue.created', 'issue'],
  ['issue.updated', 'issue'],
  ['issue.closed', 'issue'],
  ['issue.reopened', 'issue'],
  ['change_proposal.opened', 'change_proposal'],
  ['change_proposal.updated', 'change_proposal'],
  ['change_proposal.closed', 'change_proposal'],
  ['change_proposal.merged', 'change_proposal'],
  ['review.submitted', 'review'],
  ['review.comment', 'review'],
  ['release.published', 'release'],
  ['ci.check_completed', 'ci_check'],
  ['security.finding_recorded', 'security_finding'],
  ['security.finding_updated', 'security_finding'],
  ['security.finding_closed', 'security_finding'],
  ['repository.policy_changed', 'repository_policy'],
  ['artifact.published', 'artifact']
]);
const SOURCE_STATE_REQUIRED = new Set([
  'change_proposal.merged',
  'release.published',
  'ci.check_completed',
  'artifact.published'
]);
const VISIBILITY = new Set(['public', 'private', 'sensitive']);
const CONTENT_MODES = new Set(['digest_only', 'inline_public', 'protected_reference']);
const TIME_ASSURANCE = new Set(['provider_reported', 'axiom_observed', 'independently_attested']);
const CI_OUTCOMES = new Set(['passed', 'failed', 'neutral', 'cancelled', 'skipped', 'unknown']);
const PROVIDERS = new Set(['github', 'forgejo', 'gitlab', 'radicle', 'agent_forge', 'other']);

function rejectUnknown(value, allowed, name) {
  const unknown = Object.keys(value).filter(key => !allowed.has(key));
  if (unknown.length) {
    throw new ValidationError(`${name} contains unsupported fields: ${unknown.join(', ')}`);
  }
}

function id(value, name, { max = 256 } = {}) {
  return assertString(value, name, { min: 1, max, pattern: ID });
}

function digest(value, name) {
  return assertString(value, name, { min: 64, max: 64, pattern: DIGEST });
}

function nullableDigest(value, name) {
  return value === null || value === undefined ? null : digest(value, name);
}

function iso(value, name) {
  const raw = assertString(value, name, { min: 1, max: 64 });
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.valueOf())) throw new ValidationError(`${name} must be an ISO timestamp`);
  return parsed.toISOString();
}

function integer(value, name, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new ValidationError(`${name} must be an integer between ${min} and ${max}`);
  }
  return value;
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

function contentAddress(body, prefix, suppliedId, suppliedDigest) {
  const objectDigest = digestObject(body);
  const objectId = `${prefix}:${objectDigest}`;
  if (suppliedDigest !== undefined && digest(suppliedDigest, `${prefix}_digest`) !== objectDigest) {
    throw new ValidationError(`${prefix} digest does not match canonical content`);
  }
  if (
    suppliedId !== undefined
    && assertString(suppliedId, `${prefix}_id`, { min: 1, max: 320 }) !== objectId
  ) {
    throw new ValidationError(`${prefix} id does not match canonical content`);
  }
  return { objectId, objectDigest };
}

function normalizeActor(raw) {
  const value = assertPlainObject(raw, 'project event actor');
  rejectUnknown(value, new Set(['actor_id', 'actor_binding_digest']), 'project event actor');
  const actorId = value.actor_id === null || value.actor_id === undefined
    ? null
    : id(value.actor_id, 'actor.actor_id');
  const binding = nullableDigest(value.actor_binding_digest, 'actor.actor_binding_digest');
  if (actorId === null && binding !== null) {
    throw new ValidationError('project event cannot carry an actor binding digest without an AXIOM actor id');
  }
  if (actorId !== null && binding === null) {
    throw new ValidationError('project event AXIOM actor identity requires an explicit actor binding digest');
  }
  return { actor_id: actorId, actor_binding_digest: binding };
}

function normalizeContent(raw) {
  const value = assertPlainObject(raw, 'project event content');
  rejectUnknown(value, new Set([
    'visibility',
    'mode',
    'media_type',
    'content_digest',
    'byte_length',
    'inline_utf8',
    'protected_ref'
  ]), 'project event content');
  if (!VISIBILITY.has(value.visibility)) {
    throw new ValidationError('project event content visibility is unsupported');
  }
  if (!CONTENT_MODES.has(value.mode)) {
    throw new ValidationError('project event content mode is unsupported');
  }
  const mediaType = assertString(value.media_type, 'content.media_type', {
    min: 3,
    max: 128,
    pattern: MEDIA_TYPE
  });
  const contentDigest = digest(value.content_digest, 'content.content_digest');
  const byteLength = integer(value.byte_length, 'content.byte_length', {
    min: 0,
    max: 64 * 1024 * 1024
  });

  if (value.mode === 'inline_public') {
    if (value.visibility !== 'public') {
      throw new ValidationError('private or sensitive project content cannot be retained inline');
    }
    if (typeof value.inline_utf8 !== 'string' || value.protected_ref !== undefined) {
      throw new ValidationError('inline public project content requires only inline_utf8 payload');
    }
    const bytes = Buffer.from(value.inline_utf8, 'utf8');
    if (bytes.length > MAX_INLINE_BYTES) {
      throw new ValidationError('inline public project content exceeds the portable event byte ceiling');
    }
    if (bytes.length !== byteLength || sha256(bytes) !== contentDigest) {
      throw new ValidationError('inline public project content does not match its byte commitment');
    }
    return {
      visibility: value.visibility,
      mode: value.mode,
      media_type: mediaType,
      content_digest: contentDigest,
      byte_length: byteLength,
      inline_utf8: value.inline_utf8,
      protected_ref: null
    };
  }

  if (value.mode === 'protected_reference') {
    if (value.inline_utf8 !== undefined) {
      throw new ValidationError('protected project content cannot also be retained inline');
    }
    const protectedRef = assertString(value.protected_ref, 'content.protected_ref', {
      min: 11,
      max: 202,
      pattern: PROTECTED_REF
    });
    return {
      visibility: value.visibility,
      mode: value.mode,
      media_type: mediaType,
      content_digest: contentDigest,
      byte_length: byteLength,
      inline_utf8: null,
      protected_ref: protectedRef
    };
  }

  if (value.inline_utf8 !== undefined || value.protected_ref !== undefined) {
    throw new ValidationError('digest-only project content cannot carry inline bytes or a protected reference');
  }
  return {
    visibility: value.visibility,
    mode: value.mode,
    media_type: mediaType,
    content_digest: contentDigest,
    byte_length: byteLength,
    inline_utf8: null,
    protected_ref: null
  };
}

export function normalizeProjectEvent(raw) {
  const value = assertPlainObject(raw, 'project event');
  rejectUnknown(value, new Set([
    'schema',
    'project_id',
    'project_object_id',
    'object_kind',
    'event_kind',
    'occurred_at',
    'time_assurance',
    'actor',
    'content',
    'source_state_digest',
    'previous_event_digest',
    'related_object_ids',
    'ci_outcome',
    'governance_authority_granted',
    'capability_promotion',
    'content_address_profile',
    'event_id',
    'event_digest'
  ]), 'project event');
  if (value.schema !== PROJECT_EVENT_SCHEMA) {
    throw new ValidationError(`project event schema must be ${PROJECT_EVENT_SCHEMA}`);
  }
  const eventKind = assertString(value.event_kind, 'event_kind', { min: 1, max: 96 });
  const expectedObjectKind = EVENT_OBJECT_KIND.get(eventKind);
  if (!expectedObjectKind) throw new ValidationError('project event kind is unsupported');
  if (value.object_kind !== expectedObjectKind) {
    throw new ValidationError('project event object kind does not match event kind');
  }
  if (!TIME_ASSURANCE.has(value.time_assurance)) {
    throw new ValidationError('project event time assurance is unsupported');
  }
  if (value.governance_authority_granted !== false || value.capability_promotion !== false) {
    throw new ValidationError('portable project event cannot itself grant governance authority or promote capability');
  }
  if (value.content_address_profile !== SOURCE_CONTENT_ADDRESS_PROFILE) {
    throw new ValidationError('project event content-address profile is unsupported');
  }
  const sourceStateDigest = nullableDigest(value.source_state_digest, 'source_state_digest');
  if (SOURCE_STATE_REQUIRED.has(eventKind) && sourceStateDigest === null) {
    throw new ValidationError(`${eventKind} requires an exact source-state digest`);
  }
  const ciOutcome = value.ci_outcome === null || value.ci_outcome === undefined
    ? null
    : assertString(value.ci_outcome, 'ci_outcome', { min: 1, max: 32 });
  if (eventKind === 'ci.check_completed') {
    if (!CI_OUTCOMES.has(ciOutcome)) throw new ValidationError('CI completion event requires a supported outcome');
  } else if (ciOutcome !== null) {
    throw new ValidationError('CI outcome is valid only for CI completion events');
  }

  const body = {
    schema: PROJECT_EVENT_SCHEMA,
    project_id: id(value.project_id, 'project_id'),
    project_object_id: id(value.project_object_id, 'project_object_id'),
    object_kind: expectedObjectKind,
    event_kind: eventKind,
    occurred_at: iso(value.occurred_at, 'occurred_at'),
    time_assurance: value.time_assurance,
    actor: normalizeActor(value.actor ?? { actor_id: null, actor_binding_digest: null }),
    content: normalizeContent(value.content),
    source_state_digest: sourceStateDigest,
    previous_event_digest: nullableDigest(value.previous_event_digest, 'previous_event_digest'),
    related_object_ids: uniqueIds(value.related_object_ids ?? [], 'related_object_ids'),
    ci_outcome: ciOutcome,
    governance_authority_granted: false,
    capability_promotion: false,
    content_address_profile: SOURCE_CONTENT_ADDRESS_PROFILE
  };
  const addressed = contentAddress(body, 'project-event', value.event_id, value.event_digest);
  return {
    ...body,
    event_id: addressed.objectId,
    event_digest: addressed.objectDigest
  };
}

export function normalizeProjectEventObservation(raw) {
  const value = assertPlainObject(raw, 'project event observation');
  rejectUnknown(value, new Set([
    'schema',
    'project_id',
    'event_digest',
    'provider',
    'external_project_id',
    'external_object_id',
    'external_event_id',
    'external_revision',
    'external_actor_id',
    'actor_binding_digest',
    'actor_binding_verified',
    'locator',
    'provider_evidence_digest',
    'provider_authenticity_verified',
    'event_content_reproduced',
    'observed_at',
    'non_authoritative',
    'content_address_profile',
    'observation_id',
    'observation_digest'
  ]), 'project event observation');
  if (value.schema !== PROJECT_EVENT_OBSERVATION_SCHEMA) {
    throw new ValidationError(
      `project event observation schema must be ${PROJECT_EVENT_OBSERVATION_SCHEMA}`
    );
  }
  if (!PROVIDERS.has(value.provider)) {
    throw new ValidationError('project event observation provider is unsupported');
  }
  if (value.non_authoritative !== true) {
    throw new ValidationError('project event observation must remain explicitly non-authoritative');
  }
  if (value.content_address_profile !== SOURCE_CONTENT_ADDRESS_PROFILE) {
    throw new ValidationError('project event observation content-address profile is unsupported');
  }
  const externalActorId = value.external_actor_id === null || value.external_actor_id === undefined
    ? null
    : assertString(value.external_actor_id, 'external_actor_id', { min: 1, max: 256 });
  const actorBindingDigest = nullableDigest(value.actor_binding_digest, 'actor_binding_digest');
  const actorBindingVerified = value.actor_binding_verified === true;
  if (actorBindingVerified && (externalActorId === null || actorBindingDigest === null)) {
    throw new ValidationError('verified provider actor binding requires external actor id and binding digest');
  }
  if (!actorBindingVerified && actorBindingDigest !== null) {
    throw new ValidationError('unverified provider actor observation cannot carry a trusted actor binding digest');
  }

  const body = {
    schema: PROJECT_EVENT_OBSERVATION_SCHEMA,
    project_id: id(value.project_id, 'project_id'),
    event_digest: digest(value.event_digest, 'event_digest'),
    provider: value.provider,
    external_project_id: assertString(value.external_project_id, 'external_project_id', {
      min: 1,
      max: 256
    }),
    external_object_id: assertString(value.external_object_id, 'external_object_id', {
      min: 1,
      max: 256
    }),
    external_event_id: value.external_event_id === null || value.external_event_id === undefined
      ? null
      : assertString(value.external_event_id, 'external_event_id', { min: 1, max: 256 }),
    external_revision: value.external_revision === null || value.external_revision === undefined
      ? null
      : assertString(value.external_revision, 'external_revision', { min: 1, max: 256 }),
    external_actor_id: externalActorId,
    actor_binding_digest: actorBindingDigest,
    actor_binding_verified: actorBindingVerified,
    locator: value.locator === null || value.locator === undefined
      ? null
      : assertString(value.locator, 'locator', { min: 1, max: 2048 }),
    provider_evidence_digest: digest(value.provider_evidence_digest, 'provider_evidence_digest'),
    provider_authenticity_verified: value.provider_authenticity_verified === true,
    event_content_reproduced: value.event_content_reproduced === true,
    observed_at: iso(value.observed_at, 'observed_at'),
    non_authoritative: true,
    content_address_profile: SOURCE_CONTENT_ADDRESS_PROFILE
  };
  const addressed = contentAddress(
    body,
    'project-event-observation',
    value.observation_id,
    value.observation_digest
  );
  return {
    ...body,
    observation_id: addressed.objectId,
    observation_digest: addressed.objectDigest
  };
}

export function assertProjectEventObservationMatchesEvent(observation, event) {
  const observed = normalizeProjectEventObservation(observation);
  const canonical = normalizeProjectEvent(event);
  if (observed.project_id !== canonical.project_id || observed.event_digest !== canonical.event_digest) {
    throw new ValidationError('project event observation is bound to a different canonical event');
  }
  return { event: canonical, observation: observed };
}

export const PROJECT_EVENT_KINDS = Object.freeze([...EVENT_OBJECT_KIND.keys()].sort());
export const PROJECT_EVENT_PROVIDERS = Object.freeze([...PROVIDERS].sort());
