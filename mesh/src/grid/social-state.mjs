import {
  ValidationError,
  assertPlainObject,
  assertString,
  canonicalJson,
  digestObject
} from '../lib/canonical.mjs';
import { normalizeActorState } from '../identity/actor-state.mjs';
import {
  normalizeStateAccessEnvelope,
  verifyStateAccessUse
} from '../identity/actor-state-access.mjs';
import {
  createPublicPersonaProjection,
  validatePublicPersonaProjection,
  validateSocialPublicationProjection,
  validateSocialPublicationRetraction
} from '../lib/social-publication.mjs';
import { normalizePublicationPersona } from '../identity/actor-state.mjs';

export const SOCIAL_GRID_EVENT_KINDS = Object.freeze({
  actorCreated: 'actor.local.created',
  personaSaved: 'social.persona.saved',
  publicationSaved: 'social.publication.saved',
  publicationRetracted: 'social.publication.retracted'
});

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const B64URL = /^[A-Za-z0-9_-]+$/;

function id(value, label) {
  return assertString(value, label, { min: 1, max: 192, pattern: ID });
}

function digest(value, label) {
  return assertString(value, label, { min: 64, max: 64, pattern: DIGEST });
}

function exactKeys(value, required, label, { optional = [] } = {}) {
  const object = assertPlainObject(value, label);
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(object)) {
    if (!allowed.has(key)) throw new ValidationError(`${label} fields are invalid`);
  }
  for (const key of required) {
    if (!(key in object)) throw new ValidationError(`${label} fields are invalid`);
  }
  return object;
}

function normalizeMutationEvidence(raw) {
  const evidence = exactKeys(
    raw,
    ['plan_digest', 'invocation_digest', 'execution'],
    'social mutation evidence',
    { optional: ['effect_destination', 'machine_authority_digest'] }
  );
  const execution = exactKeys(
    evidence.execution,
    ['statement', 'signature'],
    'social execution attestation'
  );
  const statement = exactKeys(
    execution.statement,
    [
      'trace_id',
      'intent_id',
      'intent_digest',
      'invocation_digest',
      'capability_id',
      'tool',
      'policy_digest',
      'assurance',
      'started_at',
      'completed_at',
      'result_digest'
    ],
    'social execution statement',
    { optional: ['effect_destination'] }
  );
  const signature = exactKeys(
    execution.signature,
    ['algorithm', 'key_id', 'digest', 'signature'],
    'social execution signature'
  );
  const assurance = exactKeys(
    statement.assurance,
    ['required', 'achieved', 'basis'],
    'social execution assurance',
    { optional: ['approval_digest'] }
  );
  const normalized = {
    plan_digest: digest(evidence.plan_digest, 'social mutation plan_digest'),
    invocation_digest: digest(evidence.invocation_digest, 'social mutation invocation_digest'),
    execution: {
      statement: {
        trace_id: id(statement.trace_id, 'social execution trace_id'),
        intent_id: id(statement.intent_id, 'social execution intent_id'),
        intent_digest: digest(statement.intent_digest, 'social execution intent_digest'),
        invocation_digest: digest(
          statement.invocation_digest,
          'social execution invocation_digest'
        ),
        capability_id: id(statement.capability_id, 'social execution capability_id'),
        tool: assertString(statement.tool, 'social execution tool', {
          min: 1,
          max: 128,
          pattern: /^[a-z][a-z0-9.-]+$/
        }),
        policy_digest: digest(statement.policy_digest, 'social execution policy_digest'),
        assurance: {
          required: assuranceTier(assurance.required, 'social assurance required'),
          achieved: assuranceTier(assurance.achieved, 'social assurance achieved'),
          basis: assertString(assurance.basis, 'social assurance basis', {
            min: 1,
            max: 128,
            pattern: /^[a-z][a-z0-9._-]{0,127}$/
          }),
          ...(assurance.approval_digest === undefined ? {} : {
            approval_digest: digest(
              assurance.approval_digest,
              'social assurance approval_digest'
            )
          })
        },
        started_at: iso(statement.started_at, 'social execution started_at'),
        completed_at: iso(statement.completed_at, 'social execution completed_at'),
        result_digest: digest(statement.result_digest, 'social execution result_digest'),
        ...(statement.effect_destination === undefined ? {} : {
          effect_destination: assertString(
            statement.effect_destination,
            'social execution effect_destination',
            { min: 1, max: 256 }
          )
        })
      },
      signature: {
        algorithm: assertString(signature.algorithm, 'social execution signature algorithm', {
          min: 7,
          max: 7,
          pattern: /^Ed25519$/
        }),
        key_id: assertString(signature.key_id, 'social execution key_id', {
          min: 1,
          max: 160,
          pattern: /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/
        }),
        digest: digest(signature.digest, 'social execution signature digest'),
        signature: assertString(signature.signature, 'social execution signature bytes', {
          min: 1,
          max: 1024,
          pattern: B64URL
        })
      }
    },
    ...(evidence.effect_destination === undefined ? {} : {
      effect_destination: assertString(evidence.effect_destination, 'social mutation effect_destination', {
        min: 1,
        max: 256
      })
    }),
    ...(evidence.machine_authority_digest === undefined ? {} : {
      machine_authority_digest: digest(
        evidence.machine_authority_digest,
        'social mutation machine_authority_digest'
      )
    })
  };
  if (normalized.execution.statement.invocation_digest !== normalized.invocation_digest) {
    throw new ValidationError('social execution invocation evidence is inconsistent');
  }
  if (
    normalized.effect_destination !== undefined
    && normalized.execution.statement.effect_destination !== normalized.effect_destination
  ) {
    throw new ValidationError('social execution effect destination evidence is inconsistent');
  }
  return Object.freeze(normalized);
}

function optionalEvidence(value) {
  return value.evidence === undefined ? undefined : normalizeMutationEvidence(value.evidence);
}

export function normalizeActorCreatedPayload(raw) {
  const value = exactKeys(
    raw,
    ['owner', 'actor_state', 'actor_state_digest'],
    'actor-created payload',
    { optional: ['evidence'] }
  );
  const owner = id(value.owner, 'actor-created owner');
  const actorState = normalizeActorState(value.actor_state);
  const actorStateDigest = digest(value.actor_state_digest, 'actor-created actor_state_digest');
  if (actorStateDigest !== digestObject(actorState)) {
    throw new ValidationError('actor-created state digest does not match canonical actor state');
  }
  if (actorState.lifecycle_state !== 'active') {
    throw new ValidationError('initial local actor custody requires an active actor state');
  }
  return Object.freeze({
    owner,
    actor_state: actorState,
    actor_state_digest: actorStateDigest,
    ...(value.evidence === undefined ? {} : { evidence: optionalEvidence(value) })
  });
}

export function normalizePersonaSavedPayload(raw) {
  const value = exactKeys(
    raw,
    ['owner', 'actor_id', 'protected_persona', 'public_projection'],
    'persona-saved payload',
    { optional: ['evidence'] }
  );
  const owner = id(value.owner, 'persona-saved owner');
  const actorId = id(value.actor_id, 'persona-saved actor_id');
  const protectedPersona = normalizePublicationPersona(value.protected_persona);
  if (protectedPersona.controller_actor_id !== actorId) {
    throw new ValidationError('publication persona controller must match the locally custodied actor');
  }
  const publicProjection = validatePublicPersonaProjection(value.public_projection);
  const expectedProjection = createPublicPersonaProjection(protectedPersona);
  if (canonicalJson(publicProjection) !== canonicalJson(expectedProjection)) {
    throw new ValidationError('public persona projection does not match protected persona');
  }
  return Object.freeze({
    owner,
    actor_id: actorId,
    protected_persona: protectedPersona,
    public_projection: publicProjection,
    ...(value.evidence === undefined ? {} : { evidence: optionalEvidence(value) })
  });
}

export function normalizePublicationSavedPayload(raw, { now } = {}) {
  const value = exactKeys(
    raw,
    ['owner', 'actor_id', 'publication', 'state_access_envelope', 'state_access_use'],
    'publication-saved payload',
    { optional: ['evidence'] }
  );
  const owner = id(value.owner, 'publication-saved owner');
  const actorId = id(value.actor_id, 'publication-saved actor_id');
  const publication = validateSocialPublicationProjection(value.publication);
  const envelope = normalizeStateAccessEnvelope(value.state_access_envelope);
  if (
    envelope.subject_actor_id !== actorId
    || envelope.state_class !== 'publications'
    || envelope.action !== 'publish'
    || envelope.raw_state_allowed !== false
  ) {
    throw new ValidationError('publication state-access envelope is not bound to the actor publication projection');
  }
  const use = verifyStateAccessUse(
    envelope,
    value.state_access_use,
    now ?? new Date().toISOString()
  );
  if (use.payload_digest !== publication.projection_digest) {
    throw new ValidationError('publication state-access use is not bound to the publication projection digest');
  }
  return Object.freeze({
    owner,
    actor_id: actorId,
    publication,
    state_access_envelope: envelope,
    state_access_use: use,
    ...(value.evidence === undefined ? {} : { evidence: optionalEvidence(value) })
  });
}

export function normalizePublicationRetractedPayload(raw) {
  const value = exactKeys(
    raw,
    ['owner', 'actor_id', 'transition'],
    'publication-retracted payload',
    { optional: ['evidence'] }
  );
  return Object.freeze({
    owner: id(value.owner, 'publication-retracted owner'),
    actor_id: id(value.actor_id, 'publication-retracted actor_id'),
    transition: validateSocialPublicationRetraction(value.transition),
    ...(value.evidence === undefined ? {} : { evidence: optionalEvidence(value) })
  });
}

export function validateSocialGridEvent(event, actor, { now } = {}) {
  const value = assertPlainObject(event, 'social Grid event');
  if (!Object.values(SOCIAL_GRID_EVENT_KINDS).includes(value.kind)) return null;
  if (!value.payload || typeof value.payload !== 'object' || Array.isArray(value.payload)) {
    throw new ValidationError('social Grid event payload is invalid');
  }
  let payload;
  if (value.kind === SOCIAL_GRID_EVENT_KINDS.actorCreated) {
    payload = normalizeActorCreatedPayload(value.payload);
    if (value.subject !== payload.actor_state.actor_id) {
      throw new ValidationError('actor-created event subject must equal actor_id');
    }
  } else if (value.kind === SOCIAL_GRID_EVENT_KINDS.personaSaved) {
    payload = normalizePersonaSavedPayload(value.payload);
    if (value.subject !== payload.protected_persona.persona_id) {
      throw new ValidationError('persona-saved event subject must equal persona_id');
    }
  } else if (value.kind === SOCIAL_GRID_EVENT_KINDS.publicationSaved) {
    payload = normalizePublicationSavedPayload(value.payload, { now });
    if (value.subject !== payload.publication.projection_digest) {
      throw new ValidationError('publication-saved event subject must equal projection digest');
    }
  } else {
    payload = normalizePublicationRetractedPayload(value.payload);
    if (value.subject !== payload.transition.transition_digest) {
      throw new ValidationError('publication-retracted event subject must equal transition digest');
    }
  }
  if (payload.owner !== actor) {
    throw new ValidationError('social Grid owner must match the authenticated custodian principal');
  }
  return payload;
}

function assuranceTier(value, label) {
  return assertString(value, label, { min: 2, max: 2, pattern: /^A[0-4]$/ });
}

function iso(value, label) {
  const text = assertString(value, label, { min: 20, max: 40 });
  const parsed = new Date(text);
  if (!Number.isFinite(parsed.valueOf()) || parsed.toISOString() !== text) {
    throw new ValidationError(`${label} must be canonical ISO-8601 UTC`);
  }
  return text;
}
