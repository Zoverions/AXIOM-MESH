import assert from 'node:assert/strict';
import test from 'node:test';

import { sha256 } from '../src/lib/canonical.mjs';
import {
  ACTOR_STATE_SCHEMA,
  CREDENTIAL_EPOCH_SCHEMA,
  PUBLICATION_PERSONA_SCHEMA,
  SUCCESSION_DIRECTIVE_SCHEMA,
  buildContinuitySuccessor,
  normalizeActorState,
  normalizePublicationPersona,
  normalizeSuccessionDirective,
  rotateCredentialEpoch
} from '../src/identity/actor-state.mjs';

const T0 = '2026-08-11T13:00:00.000Z';
const T1 = '2026-08-11T13:05:00.000Z';
const T2 = '2026-08-11T13:10:00.000Z';

function epoch(actorId, sequence = 1, overrides = {}) {
  return {
    schema: CREDENTIAL_EPOCH_SCHEMA,
    actor_id: actorId,
    epoch_id: `credential-${sequence}`,
    sequence,
    state: 'active',
    crypto_profile_id: 'classical-ed25519-v1',
    activated_at: sequence === 1 ? T0 : T1,
    ended_at: null,
    predecessor_epoch_id: sequence === 1 ? null : `credential-${sequence - 1}`,
    ...overrides
  };
}

function actor(actorId = 'actor-alice', overrides = {}) {
  const first = epoch(actorId);
  return {
    schema: ACTOR_STATE_SCHEMA,
    actor_id: actorId,
    actor_type: 'human',
    lifecycle_state: 'active',
    credential_epochs: [first],
    active_epoch_id: first.epoch_id,
    state_compartments: ['identity', 'private_memory', 'publications', 'succession'],
    continuity_predecessor_actor_id: null,
    succession_directive_digest: null,
    ...overrides
  };
}

function directive(sourceActorId = 'actor-alice', overrides = {}) {
  return {
    schema: SUCCESSION_DIRECTIVE_SCHEMA,
    directive_id: 'succession-alice-v1',
    source_actor_id: sourceActorId,
    state_rules: [
      { state_class: 'private_memory', action: 'continuity_successor', recipient_actor_ids: [] },
      { state_class: 'publications', action: 'publish', recipient_actor_ids: [] },
      { state_class: 'recovery', action: 'destroy', recipient_actor_ids: [] }
    ],
    continuity: {
      mode: 'persona_successor',
      authorized_state_classes: ['private_memory', 'publications'],
      excluded_state_classes: ['recovery'],
      persona_marker: 'Echo',
      may_evolve: true,
      ordinary_authority_inherited: false
    },
    created_at: T0,
    effective_trigger: 'verified-source-actor-end',
    revocable_while_source_active: true,
    ...overrides
  };
}

test('credential rotation changes control epoch without changing actor identity', () => {
  const before = normalizeActorState(actor());
  const after = rotateCredentialEpoch(before, epoch('actor-alice', 2));
  assert.equal(after.actor_id, before.actor_id);
  assert.equal(after.credential_epochs.length, 2);
  assert.equal(after.credential_epochs[0].state, 'retired');
  assert.equal(after.credential_epochs[0].ended_at, T1);
  assert.equal(after.active_epoch_id, 'credential-2');
});

test('credential rotation cannot substitute another actor', () => {
  assert.throws(
    () => rotateCredentialEpoch(actor(), epoch('actor-mallory', 2)),
    /cannot change actor identity/
  );
});

test('actor state fails closed on multiple active credential epochs', () => {
  const raw = actor();
  raw.credential_epochs.push(epoch('actor-alice', 2));
  raw.active_epoch_id = 'credential-2';
  assert.throws(() => normalizeActorState(raw), /only one active credential epoch/);
});

test('persona succession is explicit, scoped, and starts a distinct actor lineage', () => {
  const source = actor('actor-alice', {
    lifecycle_state: 'ended',
    credential_epochs: [epoch('actor-alice', 1, { state: 'retired', ended_at: T2 })],
    active_epoch_id: null
  });
  const succession = directive('actor-alice');
  const successorEpoch = epoch('actor-alice-echo', 1, {
    epoch_id: 'echo-credential-1',
    crypto_profile_id: 'agile-signature-profile-v1',
    activated_at: T2
  });
  const successor = buildContinuitySuccessor({
    sourceActorState: source,
    directive: succession,
    successorActorId: 'actor-alice-echo',
    credentialEpoch: successorEpoch
  });
  assert.equal(successor.actor_id, 'actor-alice-echo');
  assert.equal(successor.actor_type, 'digital_agent');
  assert.equal(successor.lifecycle_state, 'continuity_successor_active');
  assert.equal(successor.continuity_predecessor_actor_id, 'actor-alice');
  assert.deepEqual(successor.state_compartments, ['private_memory', 'publications']);
  assert.equal(successor.active_epoch_id, 'echo-credential-1');
  assert.match(successor.succession_directive_digest, /^[a-f0-9]{64}$/);
});

test('persona continuity cannot silently inherit ordinary authority', () => {
  const raw = directive();
  raw.continuity.ordinary_authority_inherited = true;
  assert.throws(() => normalizeSuccessionDirective(raw), /cannot inherit ordinary authority/);
});

test('succession cannot transfer undeclared recipients through non-recipient actions', () => {
  const raw = directive();
  raw.state_rules[2].recipient_actor_ids = ['actor-bob'];
  assert.throws(() => normalizeSuccessionDirective(raw), /cannot name recipient actors/);
});

test('continuity successor cannot silently reuse source actor identity', () => {
  const source = actor('actor-alice', {
    lifecycle_state: 'ended',
    credential_epochs: [epoch('actor-alice', 1, { state: 'retired', ended_at: T2 })],
    active_epoch_id: null
  });
  assert.throws(
    () => buildContinuitySuccessor({
      sourceActorState: source,
      directive: directive('actor-alice'),
      successorActorId: 'actor-alice',
      credentialEpoch: epoch('actor-alice', 1)
    }),
    /distinct actor identity/
  );
});

test('public-identifiable publication persona explicitly exposes controller link', () => {
  const persona = normalizePublicationPersona({
    schema: PUBLICATION_PERSONA_SCHEMA,
    persona_id: 'persona-public-alice',
    controller_actor_id: 'actor-alice',
    attribution_mode: 'public_identifiable',
    public_actor_link: 'actor-alice',
    selective_link_commitment: null,
    created_at: T0,
    status: 'active'
  });
  assert.equal(persona.public_actor_link, 'actor-alice');
});

test('pseudonymous and anonymous personas cannot expose the controller link', () => {
  for (const attribution_mode of ['pseudonymous', 'anonymous']) {
    assert.throws(() => normalizePublicationPersona({
      schema: PUBLICATION_PERSONA_SCHEMA,
      persona_id: `persona-${attribution_mode}`,
      controller_actor_id: 'actor-alice',
      attribution_mode,
      public_actor_link: 'actor-alice',
      selective_link_commitment: null,
      created_at: T0,
      status: 'active'
    }), /cannot expose controller actor link/);
  }
});

test('selectively attributable persona requires protected linkage commitment', () => {
  assert.throws(() => normalizePublicationPersona({
    schema: PUBLICATION_PERSONA_SCHEMA,
    persona_id: 'persona-selective',
    controller_actor_id: 'actor-alice',
    attribution_mode: 'selectively_attributable',
    public_actor_link: null,
    selective_link_commitment: null,
    created_at: T0,
    status: 'active'
  }), /requires a private-link commitment/);

  const persona = normalizePublicationPersona({
    schema: PUBLICATION_PERSONA_SCHEMA,
    persona_id: 'persona-selective',
    controller_actor_id: 'actor-alice',
    attribution_mode: 'selectively_attributable',
    public_actor_link: null,
    selective_link_commitment: sha256('actor-alice->persona-selective private linkage'),
    created_at: T0,
    status: 'active'
  });
  assert.equal(persona.public_actor_link, null);
  assert.match(persona.selective_link_commitment, /^[a-f0-9]{64}$/);
});
