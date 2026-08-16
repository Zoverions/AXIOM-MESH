import {
  ValidationError,
  assertPlainObject,
  assertString,
  assertStringArray,
  digestObject
} from './canonical.mjs';

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

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const REASON = /^[a-z][a-z0-9._-]{0,63}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const PUBLICATION_KEYS = new Set([
  'schema',
  'publication_id',
  'persona_id',
  'content',
  'attachment_digests',
  'audience',
  'discoverability',
  'attribution_mode',
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
      circle_id: assertString(audience.circle_id, 'social publication circle_id', {
        min: 1,
        max: 160,
        pattern: IDENTIFIER
      })
    });
  }
  if (audience.circle_id !== undefined) {
    throw new ValidationError('social publication circle_id is allowed only for circle audience');
  }
  return Object.freeze({ mode });
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

  const supersedesDigest = input.supersedes_digest === null || input.supersedes_digest === undefined
    ? null
    : digest(input.supersedes_digest, 'social publication supersedes_digest');

  return Object.freeze({
    schema: SOCIAL_PUBLICATION_SCHEMA,
    publication_id: assertString(input.publication_id, 'social publication publication_id', {
      min: 1,
      max: 160,
      pattern: IDENTIFIER
    }),
    persona_id: assertString(input.persona_id, 'social publication persona_id', {
      min: 1,
      max: 160,
      pattern: IDENTIFIER
    }),
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
    attribution_mode: enumValue(
      input.attribution_mode,
      SOCIAL_ATTRIBUTION_MODES,
      'social publication attribution_mode'
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

export function createSocialPublicationProjection(raw) {
  const body = normalizePublicationBody(raw);
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
  const projectionDigest = digest(
    publication.projection_digest,
    'social publication projection_digest'
  );
  if (projectionDigest !== digestObject(body)) {
    throw new ValidationError('social publication projection digest does not match canonical content');
  }
  return Object.freeze({
    ...body,
    projection_digest: projectionDigest
  });
}

export function createSupersedingSocialPublication(previousRaw, nextRaw) {
  const previous = validateSocialPublicationProjection(previousRaw);
  const nextInput = assertPlainObject(nextRaw, 'superseding social publication');
  if (
    nextInput.supersedes_digest !== undefined
    && nextInput.supersedes_digest !== previous.projection_digest
  ) {
    throw new ValidationError('superseding social publication must name the exact previous projection digest');
  }
  if (nextInput.persona_id !== previous.persona_id) {
    throw new ValidationError('social publication persona cannot change across a supersession lineage');
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
  });
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
    persona_id: assertString(transition.persona_id, 'social publication transition persona_id', {
      min: 1,
      max: 160,
      pattern: IDENTIFIER
    }),
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
  const transitionDigest = digest(
    transition.transition_digest,
    'social publication transition_digest'
  );
  if (transitionDigest !== digestObject(body)) {
    throw new ValidationError('social publication transition digest does not match canonical content');
  }
  return Object.freeze({
    ...body,
    transition_digest: transitionDigest
  });
}
