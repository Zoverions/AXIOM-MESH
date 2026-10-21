import {
  validateSocialPublicationProjection
} from '../../mesh/src/lib/social-publication.mjs';

const DIGEST = /^[a-f0-9]{64}$/;

export function createActivityPubObjectBinding(publicationRaw, {
  externalObjectId,
  boundAt
}) {
  const publication = validateSocialPublicationProjection(publicationRaw);
  if (publication.supersedes_digest !== null) {
    throw new Error('ActivityPub object binding must begin at a publication lineage root');
  }
  const objectId = httpsUrl(externalObjectId, 'ActivityPub external object id');
  const timestamp = canonicalTimestamp(boundAt, 'ActivityPub object binding bound_at');
  return Object.freeze({
    schema: 'axiom-social-activitypub-object-binding.v0',
    status: 'active',
    external_object_id: objectId,
    persona_id: publication.persona_id,
    persona_projection_digest: publication.persona_projection_digest,
    lineage_root_projection_digest: publication.projection_digest,
    current_projection_digest: publication.projection_digest,
    bound_at: timestamp,
    advanced_at: timestamp,
    external_identity_is_axiom_identity: false,
    authority_effect: 'none',
    network_effect: 'none'
  });
}

export function validateActivityPubObjectBinding(bindingRaw) {
  exactObject(bindingRaw, 'ActivityPub object binding', [
    'schema',
    'status',
    'external_object_id',
    'persona_id',
    'persona_projection_digest',
    'lineage_root_projection_digest',
    'current_projection_digest',
    'bound_at',
    'advanced_at',
    'external_identity_is_axiom_identity',
    'authority_effect',
    'network_effect'
  ]);
  if (
    bindingRaw.schema !== 'axiom-social-activitypub-object-binding.v0'
    || bindingRaw.status !== 'active'
    || bindingRaw.external_identity_is_axiom_identity !== false
    || bindingRaw.authority_effect !== 'none'
    || bindingRaw.network_effect !== 'none'
  ) throw new Error('ActivityPub object binding claim boundary is invalid');
  const binding = Object.freeze({
    ...bindingRaw,
    external_object_id: httpsUrl(bindingRaw.external_object_id, 'ActivityPub external object id'),
    persona_id: identifier(bindingRaw.persona_id, 'ActivityPub object binding persona id'),
    persona_projection_digest: digest(bindingRaw.persona_projection_digest, 'ActivityPub object binding persona digest'),
    lineage_root_projection_digest: digest(
      bindingRaw.lineage_root_projection_digest,
      'ActivityPub object binding lineage root digest'
    ),
    current_projection_digest: digest(
      bindingRaw.current_projection_digest,
      'ActivityPub object binding current projection digest'
    ),
    bound_at: canonicalTimestamp(bindingRaw.bound_at, 'ActivityPub object binding bound_at'),
    advanced_at: canonicalTimestamp(bindingRaw.advanced_at, 'ActivityPub object binding advanced_at')
  });
  if (binding.advanced_at < binding.bound_at) {
    throw new Error('ActivityPub object binding advanced_at cannot precede bound_at');
  }
  return binding;
}

export function advanceActivityPubObjectBinding(bindingRaw, previousRaw, nextRaw, {
  advancedAt
}) {
  const binding = validateActivityPubObjectBinding(bindingRaw);
  const previous = validateSocialPublicationProjection(previousRaw);
  const next = validateSocialPublicationProjection(nextRaw);
  if (binding.current_projection_digest !== previous.projection_digest) {
    throw new Error('ActivityPub object binding is stale for the previous projection');
  }
  if (next.supersedes_digest !== previous.projection_digest) {
    throw new Error('ActivityPub object binding advance requires exact AXIOM supersession');
  }
  if (
    next.persona_id !== previous.persona_id
    || next.persona_projection_digest !== previous.persona_projection_digest
    || binding.persona_id !== previous.persona_id
    || binding.persona_projection_digest !== previous.persona_projection_digest
  ) {
    throw new Error('ActivityPub object binding cannot cross persona lineage');
  }
  const timestamp = canonicalTimestamp(advancedAt, 'ActivityPub object binding advanced_at');
  if (timestamp <= binding.advanced_at || timestamp < next.created_at) {
    throw new Error('ActivityPub object binding advance time is invalid');
  }
  return Object.freeze({
    ...binding,
    current_projection_digest: next.projection_digest,
    advanced_at: timestamp
  });
}

export function planBoundActivityPubUpdate(bindingRaw, previousRaw, nextRaw, options) {
  const advancedBinding = advanceActivityPubObjectBinding(
    bindingRaw,
    previousRaw,
    nextRaw,
    options
  );
  const next = validateSocialPublicationProjection(nextRaw);
  return Object.freeze({
    schema: 'axiom-social-activitypub-bound-update-plan.v0',
    status: 'non-executing-projection-plan',
    activity_type: 'Update',
    object_type: 'Note',
    external_object_id: advancedBinding.external_object_id,
    previous_projection_digest: next.supersedes_digest,
    next_projection_digest: next.projection_digest,
    binding: advancedBinding,
    requires_live_activitypub_transport: true,
    transport_effect: 'none',
    authority_effect: 'none',
    network_effect: 'none'
  });
}

function httpsUrl(value, label) {
  if (typeof value !== 'string' || value.length < 9 || value.length > 2048) {
    throw new Error(`${label} is invalid`);
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} is invalid`);
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash) {
    throw new Error(`${label} must be a credential-free HTTPS URL without a fragment`);
  }
  if (url.href !== value) {
    throw new Error(`${label} must be canonical`);
  }
  return value;
}

function identifier(value, label) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$/.test(value)) {
    throw new Error(`${label} is invalid`);
  }
  return value;
}

function digest(value, label) {
  if (typeof value !== 'string' || !DIGEST.test(value)) throw new Error(`${label} is invalid`);
  return value;
}

function canonicalTimestamp(value, label) {
  if (typeof value !== 'string') throw new Error(`${label} is invalid`);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== value) {
    throw new Error(`${label} must be canonical UTC`);
  }
  return value;
}

function exactObject(value, label, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error(`${label} fields are invalid`);
  }
}
