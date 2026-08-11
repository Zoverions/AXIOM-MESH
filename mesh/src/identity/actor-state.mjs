import {
  ValidationError,
  assertPlainObject,
  assertString,
  assertStringArray,
  digestObject
} from '../lib/canonical.mjs';

export const ACTOR_STATE_SCHEMA = 'axiom-actor-state.v1';
export const CREDENTIAL_EPOCH_SCHEMA = 'axiom-actor-credential-epoch.v1';
export const SUCCESSION_DIRECTIVE_SCHEMA = 'axiom-actor-succession-directive.v1';
export const PUBLICATION_PERSONA_SCHEMA = 'axiom-publication-persona.v1';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const ACTOR_TYPES = new Set(['human', 'digital_agent', 'organization', 'institution', 'service']);
const LIFECYCLE = new Set([
  'active', 'restricted', 'recovery_pending', 'recovered', 'incapacitated_delegated',
  'ended', 'archived', 'succession_pending', 'succession_executed', 'continuity_successor_active'
]);
const EPOCH_STATES = new Set(['active', 'revoked', 'compromised', 'retired']);
const ATTRIBUTION = new Set([
  'public_identifiable', 'pseudonymous', 'selectively_attributable', 'anonymous'
]);
const SUCCESSION_ACTIONS = new Set([
  'destroy', 'retain_private', 'archive', 'disclose', 'transfer_control', 'steward',
  'publish', 'research_statistics', 'memorial_representation', 'continuity_successor', 'prohibit_use'
]);

function exactKeys(value, expected, name) {
  const actual = Object.keys(assertPlainObject(value, name)).sort();
  const wanted = [...expected].sort();
  if (actual.join(',') !== wanted.join(',')) {
    throw new ValidationError(`${name} fields are invalid`);
  }
}

function id(value, name) {
  return assertString(value, name, { min: 1, max: 192, pattern: ID });
}

function digest(value, name) {
  return assertString(value, name, { min: 64, max: 64, pattern: DIGEST });
}

function iso(value, name) {
  const text = assertString(value, name, { min: 20, max: 40 });
  if (Number.isNaN(Date.parse(text))) throw new ValidationError(`${name} must be an ISO timestamp`);
  return text;
}

export function normalizeCredentialEpoch(raw) {
  exactKeys(raw, [
    'schema', 'actor_id', 'epoch_id', 'sequence', 'state', 'crypto_profile_id',
    'activated_at', 'ended_at', 'predecessor_epoch_id'
  ], 'credential epoch');
  if (raw.schema !== CREDENTIAL_EPOCH_SCHEMA) throw new ValidationError('credential epoch schema is invalid');
  const state = assertString(raw.state, 'credential epoch state');
  if (!EPOCH_STATES.has(state)) throw new ValidationError('credential epoch state is invalid');
  if (!Number.isSafeInteger(raw.sequence) || raw.sequence < 1) {
    throw new ValidationError('credential epoch sequence must be a positive safe integer');
  }
  const endedAt = raw.ended_at === null ? null : iso(raw.ended_at, 'credential epoch ended_at');
  if (state === 'active' && endedAt !== null) throw new ValidationError('active credential epoch cannot have ended_at');
  if (state !== 'active' && endedAt === null) throw new ValidationError('inactive credential epoch requires ended_at');
  const predecessor = raw.predecessor_epoch_id === null
    ? null
    : id(raw.predecessor_epoch_id, 'credential epoch predecessor_epoch_id');
  if (raw.sequence === 1 && predecessor !== null) throw new ValidationError('first credential epoch cannot have a predecessor');
  if (raw.sequence > 1 && predecessor === null) throw new ValidationError('later credential epoch requires a predecessor');
  return {
    schema: CREDENTIAL_EPOCH_SCHEMA,
    actor_id: id(raw.actor_id, 'credential epoch actor_id'),
    epoch_id: id(raw.epoch_id, 'credential epoch epoch_id'),
    sequence: raw.sequence,
    state,
    crypto_profile_id: id(raw.crypto_profile_id, 'credential epoch crypto_profile_id'),
    activated_at: iso(raw.activated_at, 'credential epoch activated_at'),
    ended_at: endedAt,
    predecessor_epoch_id: predecessor
  };
}

export function normalizeActorState(raw) {
  exactKeys(raw, [
    'schema', 'actor_id', 'actor_type', 'lifecycle_state', 'credential_epochs',
    'active_epoch_id', 'state_compartments', 'continuity_predecessor_actor_id',
    'succession_directive_digest'
  ], 'actor state');
  if (raw.schema !== ACTOR_STATE_SCHEMA) throw new ValidationError('actor state schema is invalid');
  const actorType = assertString(raw.actor_type, 'actor_type');
  if (!ACTOR_TYPES.has(actorType)) throw new ValidationError('actor_type is invalid');
  const lifecycle = assertString(raw.lifecycle_state, 'lifecycle_state');
  if (!LIFECYCLE.has(lifecycle)) throw new ValidationError('lifecycle_state is invalid');
  if (!Array.isArray(raw.credential_epochs) || raw.credential_epochs.length < 1 || raw.credential_epochs.length > 128) {
    throw new ValidationError('actor state requires 1-128 credential epochs');
  }
  const actorId = id(raw.actor_id, 'actor_id');
  const epochs = raw.credential_epochs.map(normalizeCredentialEpoch);
  const ids = new Set();
  let active = null;
  for (let index = 0; index < epochs.length; index += 1) {
    const epoch = epochs[index];
    if (epoch.actor_id !== actorId) throw new ValidationError('credential epoch actor does not match actor state');
    if (ids.has(epoch.epoch_id)) throw new ValidationError('duplicate credential epoch id');
    ids.add(epoch.epoch_id);
    if (epoch.sequence !== index + 1) throw new ValidationError('credential epochs must be contiguous and ordered');
    if (index > 0 && epoch.predecessor_epoch_id !== epochs[index - 1].epoch_id) {
      throw new ValidationError('credential epoch predecessor must bind the immediately prior epoch');
    }
    if (epoch.state === 'active') {
      if (active) throw new ValidationError('actor state may have only one active credential epoch');
      active = epoch;
    }
  }
  const activeEpochId = raw.active_epoch_id === null ? null : id(raw.active_epoch_id, 'active_epoch_id');
  if ((active?.epoch_id ?? null) !== activeEpochId) throw new ValidationError('active_epoch_id does not match active credential epoch');
  const predecessorActor = raw.continuity_predecessor_actor_id === null
    ? null
    : id(raw.continuity_predecessor_actor_id, 'continuity_predecessor_actor_id');
  const directiveDigest = raw.succession_directive_digest === null
    ? null
    : digest(raw.succession_directive_digest, 'succession_directive_digest');
  if (lifecycle === 'continuity_successor_active' && (!predecessorActor || !directiveDigest)) {
    throw new ValidationError('continuity successor requires source actor and succession directive');
  }
  if (lifecycle !== 'continuity_successor_active' && predecessorActor !== null) {
    throw new ValidationError('continuity predecessor is reserved for active continuity successors');
  }
  const compartments = assertStringArray(raw.state_compartments, 'state_compartments', { maxItems: 64, itemMax: 96 });
  if (new Set(compartments).size !== compartments.length) throw new ValidationError('state_compartments must be unique');
  return {
    schema: ACTOR_STATE_SCHEMA,
    actor_id: actorId,
    actor_type: actorType,
    lifecycle_state: lifecycle,
    credential_epochs: epochs,
    active_epoch_id: activeEpochId,
    state_compartments: [...compartments].sort(),
    continuity_predecessor_actor_id: predecessorActor,
    succession_directive_digest: directiveDigest
  };
}

export function rotateCredentialEpoch(actorState, nextEpoch) {
  const current = normalizeActorState(actorState);
  const next = normalizeCredentialEpoch(nextEpoch);
  if (next.actor_id !== current.actor_id) throw new ValidationError('credential rotation cannot change actor identity');
  if (next.sequence !== current.credential_epochs.length + 1) throw new ValidationError('next credential epoch sequence is invalid');
  if (next.predecessor_epoch_id !== current.active_epoch_id) throw new ValidationError('next credential epoch must bind current active epoch');
  if (next.state !== 'active') throw new ValidationError('new credential epoch must start active');
  if (!current.active_epoch_id) throw new ValidationError('credential rotation requires a current active epoch');
  const endedAt = next.activated_at;
  const epochs = current.credential_epochs.map(epoch => (
    epoch.epoch_id === current.active_epoch_id
      ? { ...epoch, state: 'retired', ended_at: endedAt }
      : epoch
  ));
  epochs.push(next);
  return normalizeActorState({
    ...current,
    credential_epochs: epochs,
    active_epoch_id: next.epoch_id
  });
}

export function normalizeSuccessionDirective(raw) {
  exactKeys(raw, [
    'schema', 'directive_id', 'source_actor_id', 'state_rules', 'continuity',
    'created_at', 'effective_trigger', 'revocable_while_source_active'
  ], 'succession directive');
  if (raw.schema !== SUCCESSION_DIRECTIVE_SCHEMA) throw new ValidationError('succession directive schema is invalid');
  if (!Array.isArray(raw.state_rules) || raw.state_rules.length < 1 || raw.state_rules.length > 64) {
    throw new ValidationError('succession directive requires state rules');
  }
  const seen = new Set();
  const stateRules = raw.state_rules.map((rule, index) => {
    exactKeys(rule, ['state_class', 'action', 'recipient_actor_ids'], `state_rules[${index}]`);
    const stateClass = id(rule.state_class, `state_rules[${index}].state_class`);
    if (seen.has(stateClass)) throw new ValidationError('succession state rules must be unique by state class');
    seen.add(stateClass);
    const action = assertString(rule.action, `state_rules[${index}].action`);
    if (!SUCCESSION_ACTIONS.has(action)) throw new ValidationError('succession state action is invalid');
    const recipients = assertStringArray(rule.recipient_actor_ids, `state_rules[${index}].recipient_actor_ids`, { maxItems: 32, itemMax: 192 }).map((value, recipientIndex) => id(value, `state_rules[${index}].recipient_actor_ids[${recipientIndex}]`));
    if (['disclose', 'transfer_control', 'steward'].includes(action) && recipients.length === 0) {
      throw new ValidationError(`${action} succession rule requires recipient actors`);
    }
    if (!['disclose', 'transfer_control', 'steward'].includes(action) && recipients.length !== 0) {
      throw new ValidationError(`${action} succession rule cannot name recipient actors`);
    }
    return { state_class: stateClass, action, recipient_actor_ids: recipients };
  });
  const continuity = assertPlainObject(raw.continuity, 'continuity');
  exactKeys(continuity, [
    'mode', 'authorized_state_classes', 'excluded_state_classes', 'persona_marker',
    'may_evolve', 'ordinary_authority_inherited'
  ], 'continuity');
  if (!['none', 'memorial', 'persona_successor'].includes(continuity.mode)) {
    throw new ValidationError('continuity mode is invalid');
  }
  const authorized = assertStringArray(continuity.authorized_state_classes, 'continuity.authorized_state_classes', { maxItems: 64, itemMax: 96 });
  const excluded = assertStringArray(continuity.excluded_state_classes, 'continuity.excluded_state_classes', { maxItems: 64, itemMax: 96 });
  if (authorized.some(value => excluded.includes(value))) throw new ValidationError('continuity state class cannot be both authorized and excluded');
  if (continuity.ordinary_authority_inherited !== false) {
    throw new ValidationError('persona continuity cannot inherit ordinary authority');
  }
  const marker = continuity.persona_marker === null
    ? null
    : assertString(continuity.persona_marker, 'continuity.persona_marker', { min: 1, max: 64 });
  if (continuity.mode === 'persona_successor' && !marker) throw new ValidationError('persona successor requires a continuity marker');
  return {
    schema: SUCCESSION_DIRECTIVE_SCHEMA,
    directive_id: id(raw.directive_id, 'directive_id'),
    source_actor_id: id(raw.source_actor_id, 'source_actor_id'),
    state_rules: stateRules,
    continuity: {
      mode: continuity.mode,
      authorized_state_classes: [...authorized].sort(),
      excluded_state_classes: [...excluded].sort(),
      persona_marker: marker,
      may_evolve: continuity.may_evolve === true,
      ordinary_authority_inherited: false
    },
    created_at: iso(raw.created_at, 'created_at'),
    effective_trigger: id(raw.effective_trigger, 'effective_trigger'),
    revocable_while_source_active: raw.revocable_while_source_active === true
  };
}

export function buildContinuitySuccessor({ sourceActorState, directive, successorActorId, credentialEpoch }) {
  const source = normalizeActorState(sourceActorState);
  const succession = normalizeSuccessionDirective(directive);
  if (succession.source_actor_id !== source.actor_id) throw new ValidationError('succession directive source does not match actor');
  if (succession.continuity.mode !== 'persona_successor') throw new ValidationError('directive does not authorize persona succession');
  if (source.lifecycle_state !== 'ended' && source.lifecycle_state !== 'succession_pending' && source.lifecycle_state !== 'succession_executed') {
    throw new ValidationError('source actor is not in a succession-eligible lifecycle state');
  }
  const successorId = id(successorActorId, 'successorActorId');
  if (successorId === source.actor_id) throw new ValidationError('continuity successor must have a distinct actor identity');
  const epoch = normalizeCredentialEpoch(credentialEpoch);
  if (epoch.actor_id !== successorId || epoch.sequence !== 1 || epoch.predecessor_epoch_id !== null || epoch.state !== 'active') {
    throw new ValidationError('continuity successor must begin with its own first active credential epoch');
  }
  return normalizeActorState({
    schema: ACTOR_STATE_SCHEMA,
    actor_id: successorId,
    actor_type: 'digital_agent',
    lifecycle_state: 'continuity_successor_active',
    credential_epochs: [epoch],
    active_epoch_id: epoch.epoch_id,
    state_compartments: succession.continuity.authorized_state_classes,
    continuity_predecessor_actor_id: source.actor_id,
    succession_directive_digest: digestObject(succession)
  });
}

export function normalizePublicationPersona(raw) {
  exactKeys(raw, [
    'schema', 'persona_id', 'controller_actor_id', 'attribution_mode',
    'public_actor_link', 'selective_link_commitment', 'created_at', 'status'
  ], 'publication persona');
  if (raw.schema !== PUBLICATION_PERSONA_SCHEMA) throw new ValidationError('publication persona schema is invalid');
  const mode = assertString(raw.attribution_mode, 'attribution_mode');
  if (!ATTRIBUTION.has(mode)) throw new ValidationError('attribution_mode is invalid');
  if (!['active', 'retired', 'revoked'].includes(raw.status)) throw new ValidationError('publication persona status is invalid');
  const publicActorLink = raw.public_actor_link === null ? null : id(raw.public_actor_link, 'public_actor_link');
  const commitment = raw.selective_link_commitment === null ? null : digest(raw.selective_link_commitment, 'selective_link_commitment');
  if (mode === 'public_identifiable' && publicActorLink !== raw.controller_actor_id) {
    throw new ValidationError('public-identifiable persona must expose its controller actor link');
  }
  if (mode !== 'public_identifiable' && publicActorLink !== null) {
    throw new ValidationError('non-public attribution mode cannot expose controller actor link');
  }
  if (mode === 'selectively_attributable' && commitment === null) {
    throw new ValidationError('selectively attributable persona requires a private-link commitment');
  }
  return {
    schema: PUBLICATION_PERSONA_SCHEMA,
    persona_id: id(raw.persona_id, 'persona_id'),
    controller_actor_id: id(raw.controller_actor_id, 'controller_actor_id'),
    attribution_mode: mode,
    public_actor_link: publicActorLink,
    selective_link_commitment: commitment,
    created_at: iso(raw.created_at, 'created_at'),
    status: raw.status
  };
}
