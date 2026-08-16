import {
  ValidationError,
  assertPlainObject,
  assertString,
  assertStringArray,
  digestObject
} from './canonical.mjs';
import {
  PUBLICATION_PERSONA_SCHEMA,
  normalizePublicationPersona
} from '../identity/actor-state.mjs';

export const PUBLIC_PERSONA_PROJECTION_SCHEMA = 'axiom-publication-persona-projection.v1';
export const SOCIAL_PUBLICATION_SCHEMA = 'axiom-social-publication-projection.v1';
export const SOCIAL_PUBLICATION_TRANSITION_SCHEMA = 'axiom-social-publication-transition.v1';

export const SOCIAL_AUDIENCE_MODES = Object.freeze([
  'public',
  'followers',
  'circle'
]);

export const SOCIAL_DISCOVERABILITY_MODES = Object.freeze([
  'listed',
  'unlisted'
]);

export const SOCIAL_ATTRIBUTION_MODES = Object.freeze([
  'public-identifiable',
  'pseudonymous',
  'selectively-attributable',
  'anonymous',
  'organization-delegated'
]);

export const SOCIAL_AUTHORSHIP_MODES = Object.freeze([
  'human-authored',
  'machine-assisted',
  'machine-authored-delegated',
  'continuity-persona'
]);

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$/;
const REASON = /^[a-z][a-z0-9._-]{0,63}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const PUBLIC_PERSONA_KEYS = new Set([
  'schema',
  'persona_id',
  'attribution_mode',
  'public_actor_link',
  'created_at',
  'status',
  'authority_effect',
  'projection_digest'
]);
const PUBLICATION_KEYS = new Set([
  'schema',
  'publication_id',
  'persona_id',
  'persona_projection_digest',
  'attribution_mode',
  'public_actor_link',
  'content',
  'attachment_digests',
  'audience',
  'discoverability',
  'authorship_mode',
  'created_at',
  'supersedes_digest'
]);
const PUBLICATION_OUTPUT_KEYS = new Set([
  ...PUBLICATION_KEYS,
  'authority_effect',
  'network_effect',
  'projection_digest'
]);
const CONTENT_KEYS = new Set(['media_type', 'text']);
const AUDIENCE_KEYS = new Set(['mode', 'circle_id']);
const TRANSITION_KEYS = new Set([
  'schema',
  'action',
  'publication_digest',
  'persona_id',
  'persona_projection_digest',
  'reason_code',
  'occurred_at',
  'stop_serving_requested',
  'third_party_deletion_claimed',
  'authority_effect',
  'network_effect',
  'transition_digest'
]);

function assertExactKeys(value, allowed, label) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new ValidationError(`${label} contains unsupported field ${key}`);
    }
  }
}

function enumValue(value, allowed, label) {
  if (!allowed.includes(value)) {
    throw new ValidationError(`${label} must be one of ${allowed.join(', ')}`);
  }
  return value;
}

function canonicalTimestamp(value, label) {
  const text = assertString(value, label, { min: 24, max: 24 });
  const date = new Date(text);
  if (Number.isNaN(date.valueOf()) || date.toISOString() !== text) {
    throw new ValidationError(`${label} must be a canonical UTC ISO timestamp`);
  }
  return text;
}

function digest(value, label) {
  return assertString(value, label, { min: 64, max: 64, pattern: DIGEST });
}

function identifier(value, label) {
  return assertString(value, label, { min: 1, max: 192, pattern: IDENTIFIER });
}

function nullableIdentifier(value, label) {
  return value === null ? null : identifier(value, label);
}

function uniqueDigests(value, label) {
  const items = assertStringArray(value ?? [], label, {
    maxItems: 16,
    itemMax: 64
  }).map((item, index) => digest(item, `${label}[${index}]`));
  if (new Set(items).size !== items.length) {
    throw new ValidationError(`${label} cannot contain duplicate digests`);
  }
  return items;
}

function normalizeContent(raw) {
  const content = assertPlainObject(raw, 'social publication content');
  assertExactKeys(content, CONTENT_KEYS, 'social publication content');
  const mediaType = enumValue(
    content.media_type,
    ['text/plain', 'text/markdown'],
    'social publication content media_type'
  );
  const text = assertString(content.text, 'social publication content text', {
    min: 1,
    max: 100_000
  });
  return Object.freeze({
    media_type: mediaType,
    text
  });
}

function normalizeAudience(raw) {
  const audience = assertPlainObject(raw, 'social publication audience');
  assertExactKeys(audience, AUDIENCE_KEYS, 'social publication audience');
  const mode = enumValue(
    audience.mode,
    SOCIAL_AUDIENCE_MODES,
    'social publication audience mode'
  );
  if (mode === 'circle') {
    return Object.freeze({
      mode,
      circle_id: identifier(audience.circle_id, 'social publication circle_id')
    });
  }
  if (audience.circle_id !== undefined) {
    throw new ValidationError('social publication circle_id is allowed only for circle audience');
  }
  return Object.freeze({ mode });
}

function publicPersonaBodyFromProtected(raw) {
  const persona = normalizePublicationPersona(raw);
  if (persona.schema !== PUBLICATION_PERSONA_SCHEMA) {
    throw new ValidationError('unsupported protected publication persona schema');
  }
  return Object.freeze({
    schema: PUBLIC_PERSONA_PROJECTION_SCHEMA,
    persona_id: persona.persona_id,
    attribution_mode: persona.attribution_mode,
    public_actor_link: persona.public_actor_link,
    created_at: persona.created_at,
    status: persona.status,
    authority_effect: 'none'
  });
}

export function createPublicPersonaProjection(protectedPersona) {
  const body = publicPersonaBodyFromProtected(protectedPersona);
  return Object.freeze({
    ...body,
    projection_digest: digestObject(body)
  });
}

export function validatePublicPersonaProjection(raw) {
  const value = assertPlainObject(raw, 'public persona projection');
  assertExactKeys(value, PUBLIC_PERSONA_KEYS, 'public persona projection');
  if (value.schema !== PUBLIC_PERSONA_PROJECTION_SCHEMA) {
    throw new ValidationError('unsupported public persona projection schema');
  }
  if (value.authority_effect !== 'none') {
    throw new ValidationError('public persona projection cannot grant authority');
  }
  const attributionMode = enumValue(
    value.attribution_mode,
    SOCIAL_ATTRIBUTION_MODES,
    'public persona attribution_mode'
  );
  const publicActorLink = nullableIdentifier(value.public_actor_link, 'public persona public_actor_link');
  if (
    ['pseudonymous', 'selectively-attributable', 'anonymous'].includes(attributionMode)
    && publicActorLink !== null
  ) {
    throw new ValidationError('private attribution mode cannot expose a public actor link');
  }
  if (
    ['public-identifiable', 'organization-delegated'].includes(attributionMode)
    && publicActorLink === null
  ) {
    throw new ValidationError('public attribution mode requires a public actor link');
  }
  if (!['active', 'retired', 'revoked'].includes(value.status)) {
    throw new ValidationError('public persona status is invalid');
  }
  const body = Object.freeze({
    schema: PUBLIC_PERSONA_PROJECTION_SCHEMA,
    persona_id: identifier(value.persona_id, 'public persona persona_id'),
    attribution_mode: attributionMode,
    public_actor_link: publicActorLink,
    created_at: canonicalTimestamp(value.created_at, 'public persona created_at'),
    status: value.status,
    authority_effect: 'none'
  });
  const projectionDigest = digest(value.projection_digest, 'public persona projection_digest');
  if (projectionDigest !== digestObject(body)) {
    throw new ValidationError('public persona projection digest does not match canonical content');
  }
  return Object.freeze({ ...body, projection_digest: projectionDigest });
}

function normalizePublicationBody(raw, { projection = false } = {}) {
  const input = assertPlainObject(raw, 'social publication');
  assertExactKeys(
    input,
    projection ? PUBLICATION_OUTPUT_KEYS : PUBLICATION_KEYS,
    'social publication'
  );
  if (input.schema !== undefined && input.schema !== SOCIAL_PUBLICATION_SCHEMA) {
    throw new ValidationError('unsupported social publication schema');
  }

  const attributionMode = enumValue(
    input.attribution_mode,
    SOCIAL_ATTRIBUTION_MODES,
    'social publication attribution_mode'
  );
  const publicActorLink = nullableIdentifier(input.public_actor_link, 'social publication public_actor_link');
  if (
    ['pseudonymous', 'selectively-attributable', 'anonymous'].includes(attributionMode)
    && publicActorLink !== null
  ) {
    throw new ValidationError('private attribution mode cannot expose a public actor link');
  }
  if (
    ['public-identifiable', 'organization-delegated'].includes(attributionMode)
    && publicActorLink === null
  ) {
    throw new ValidationError('public attribution mode requires a public actor link');
  }

  const supersedesDigest = input.supersedes_digest === null || input.supersedes_digest === undefined
    ? null
    : digest(input.supersedes_digest, 'social publication supersedes_digest');

  return Object.freeze({
    schema: SOCIAL_PUBLICATION_SCHEMA,
    publication_id: identifier(input.publication_id, 'social publication publication_id'),
    persona_id: identifier(input.persona_id, 'social publication persona_id'),
    persona_projection_digest: digest(
      input.persona_projection_digest,
      'social publication persona_projection_digest'
    ),
    attribution_mode: attributionMode,
    public_actor_link: publicActorLink,
    content: normalizeContent(input.content),
    attachment_digests: Object.freeze(uniqueDigests(
      input.attachment_digests,
      'social publication attachment_digests'
    )),
    audience: normalizeAudience(input.audience),
    discoverability: enumValue(
      input.discoverability,
      SOCIAL_DISCOVERABILITY_MODES,
      'social publication discoverability'
    ),
    authorship_mode: enumValue(
      input.authorship_mode,
      SOCIAL_AUTHORSHIP_MODES,
      'social publication authorship_mode'
    ),
    created_at: canonicalTimestamp(input.created_at, 'social publication created_at'),
    supersedes_digest: supersedesDigest,
    authority_effect: 'none',
    network_effect: 'none'
  });
}

function bindPublicationToPersona(raw, protectedPersona) {
  const personaProjection = createPublicPersonaProjection(protectedPersona);
  if (personaProjection.status !== 'active') {
    throw new ValidationError('social publication requires an active publication persona');
  }
  const input = assertPlainObject(raw, 'actor-bound social publication');
  if (input.persona_id !== undefined && input.persona_id !== personaProjection.persona_id) {
    throw new ValidationError('social publication persona_id does not match the protected persona');
  }
  if (
    input.attribution_mode !== undefined
    && input.attribution_mode !== personaProjection.attribution_mode
  ) {
    throw new ValidationError('social publication attribution_mode does not match the protected persona');
  }
  if (
    input.public_actor_link !== undefined
    && input.public_actor_link !== personaProjection.public_actor_link
  ) {
    throw new ValidationError('social publication public_actor_link does not match the protected persona');
  }
  if (
    input.persona_projection_digest !== undefined
    && input.persona_projection_digest !== personaProjection.projection_digest
  ) {
    throw new ValidationError('social publication persona projection digest does not match the protected persona');
  }
  return {
    ...input,
    persona_id: personaProjection.persona_id,
    persona_projection_digest: personaProjection.projection_digest,
    attribution_mode: personaProjection.attribution_mode,
    public_actor_link: personaProjection.public_actor_link
  };
}

export function createSocialPublicationProjection(raw, { persona } = {}) {
  if (!persona) {
    throw new ValidationError('social publication creation requires a protected actor-owned persona');
  }
  const body = normalizePublicationBody(bindPublicationToPersona(raw, persona));
  return Object.freeze({
    ...body,
    projection_digest: digestObject(body)
  });
}

export function validateSocialPublicationProjection(raw) {
  const publication = assertPlainObject(raw, 'social publication projection');
  assertExactKeys(publication, PUBLICATION_OUTPUT_KEYS, 'social publication projection');
  if (publication.schema !== SOCIAL_PUBLICATION_SCHEMA) {
    throw new ValidationError('unsupported social publication schema');
  }
  if (publication.authority_effect !== 'none') {
    throw new ValidationError('social publication projection cannot grant authority');
  }
  if (publication.network_effect !== 'none') {
    throw new ValidationError('social publication projection cannot perform network effects');
  }
  const body = normalizePublicationBody(publication, { projection: true });
  const projectionDigest = digest(publication.projection_digest, 'social publication projection_digest');
  if (projectionDigest !== digestObject(body)) {
    throw new ValidationError('social publication projection digest does not match canonical content');
  }
  return Object.freeze({ ...body, projection_digest: projectionDigest });
}

export function validateSocialPublicationPersonaBinding(publicationRaw, protectedPersona) {
  const publication = validateSocialPublicationProjection(publicationRaw);
  const personaProjection = createPublicPersonaProjection(protectedPersona);
  if (publication.persona_id !== personaProjection.persona_id) {
    throw new ValidationError('social publication is bound to a different persona');
  }
  if (publication.persona_projection_digest !== personaProjection.projection_digest) {
    throw new ValidationError('social publication is bound to a different public persona projection');
  }
  if (publication.attribution_mode !== personaProjection.attribution_mode) {
    throw new ValidationError('social publication attribution does not match the persona projection');
  }
  if (publication.public_actor_link !== personaProjection.public_actor_link) {
    throw new ValidationError('social publication public actor link does not match the persona projection');
  }
  return publication;
}

export function createSupersedingSocialPublication(previousRaw, nextRaw, { persona } = {}) {
  const previous = validateSocialPublicationProjection(previousRaw);
  if (!persona) {
    throw new ValidationError('social publication edit requires the protected actor-owned persona');
  }
  const personaProjection = createPublicPersonaProjection(persona);
  if (personaProjection.status !== 'active') {
    throw new ValidationError('social publication edit requires an active publication persona');
  }
  if (personaProjection.persona_id !== previous.persona_id) {
    throw new ValidationError('social publication persona cannot change across a supersession lineage');
  }
  if (personaProjection.projection_digest !== previous.persona_projection_digest) {
    throw new ValidationError('social publication persona projection cannot change across a supersession lineage');
  }
  const nextInput = assertPlainObject(nextRaw, 'superseding social publication');
  if (
    nextInput.supersedes_digest !== undefined
    && nextInput.supersedes_digest !== null
    && nextInput.supersedes_digest !== previous.projection_digest
  ) {
    throw new ValidationError('superseding social publication must name the exact previous projection digest');
  }
  const nextCreatedAt = canonicalTimestamp(
    nextInput.created_at,
    'superseding social publication created_at'
  );
  if (nextCreatedAt <= previous.created_at) {
    throw new ValidationError('superseding social publication must be created after the previous projection');
  }
  return createSocialPublicationProjection({
    ...nextInput,
    supersedes_digest: previous.projection_digest
  }, { persona });
}

export function createSocialPublicationRetraction(previousRaw, {
  reason_code,
  occurred_at
}) {
  const previous = validateSocialPublicationProjection(previousRaw);
  const body = Object.freeze({
    schema: SOCIAL_PUBLICATION_TRANSITION_SCHEMA,
    action: 'retract',
    publication_digest: previous.projection_digest,
    persona_id: previous.persona_id,
    persona_projection_digest: previous.persona_projection_digest,
    reason_code: assertString(reason_code, 'social publication retraction reason_code', {
      min: 1,
      max: 64,
      pattern: REASON
    }),
    occurred_at: canonicalTimestamp(occurred_at, 'social publication retraction occurred_at'),
    stop_serving_requested: true,
    third_party_deletion_claimed: false,
    authority_effect: 'none',
    network_effect: 'none'
  });
  if (body.occurred_at <= previous.created_at) {
    throw new ValidationError('social publication retraction must occur after the publication');
  }
  return Object.freeze({
    ...body,
    transition_digest: digestObject(body)
  });
}

export function validateSocialPublicationRetraction(raw) {
  const transition = assertPlainObject(raw, 'social publication transition');
  assertExactKeys(transition, TRANSITION_KEYS, 'social publication transition');
  if (
    transition.schema !== SOCIAL_PUBLICATION_TRANSITION_SCHEMA
    || transition.action !== 'retract'
  ) {
    throw new ValidationError('unsupported social publication transition');
  }
  if (
    transition.stop_serving_requested !== true
    || transition.third_party_deletion_claimed !== false
  ) {
    throw new ValidationError('social publication retraction must preserve truthful third-party deletion semantics');
  }
  if (transition.authority_effect !== 'none' || transition.network_effect !== 'none') {
    throw new ValidationError('social publication transition cannot grant authority or perform network effects');
  }
  const body = Object.freeze({
    schema: SOCIAL_PUBLICATION_TRANSITION_SCHEMA,
    action: 'retract',
    publication_digest: digest(
      transition.publication_digest,
      'social publication transition publication_digest'
    ),
    persona_id: identifier(transition.persona_id, 'social publication transition persona_id'),
    persona_projection_digest: digest(
      transition.persona_projection_digest,
      'social publication transition persona_projection_digest'
    ),
    reason_code: assertString(transition.reason_code, 'social publication transition reason_code', {
      min: 1,
      max: 64,
      pattern: REASON
    }),
    occurred_at: canonicalTimestamp(
      transition.occurred_at,
      'social publication transition occurred_at'
    ),
    stop_serving_requested: true,
    third_party_deletion_claimed: false,
    authority_effect: 'none',
    network_effect: 'none'
  });
  const transitionDigest = digest(transition.transition_digest, 'social publication transition_digest');
  if (transitionDigest !== digestObject(body)) {
    throw new ValidationError('social publication transition digest does not match canonical content');
  }
  return Object.freeze({ ...body, transition_digest: transitionDigest });
}
