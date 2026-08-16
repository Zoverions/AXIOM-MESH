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

const T0 = '2026-08-16T16:00:00.000Z';
const T1 = '2026-08-16T16:05:00.000Z';
const T2 = '2026-08-16T16:10:00.000Z';

function epoch(actorId, sequence = 1, overrides = {}) {
  return {
    schema: CREDENTIAL_EPOCH_SCHEMA,
    actor_id: actorId,
    epoch_id: `epoch-${sequence}`,
    sequence,
    state: 'active',
    crypto_profile_id: 'classical-ed25519-v1',
    activated_at: sequence === 1 ? T0 : T1,
    ended_at: null,
    predecessor_epoch_id: sequence === 1 ? null : `epoch-${sequence - 1}`,
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

function directive(sourceActorId = 'actor-alice') {
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
    revocable_while_source_active: true
  };
}

function persona(overrides = {}) {
  return {
    schema: PUBLICATION_PERSONA_SCHEMA,
    persona_id: 'persona-alice',
    controller_actor_id: 'actor-alice',
    represented_actor_id: null,
    attribution_mode: 'pseudonymous',
    public_actor_link: null,
    selective_link_commitment: null,
    delegation_authority_digest: null,
    created_at: T0,
    status: 'active',
    ...overrides
  };
}

test('rotation preserves actor identity and retires the prior epoch', () => {
  const before = normalizeActorState(actor());
  const after = rotateCredentialEpoch(before, epoch('actor-alice', 2));
  assert.equal(after.actor_id, before.actor_id);
  assert.equal(after.credential_epochs[0].state, 'retired');
  assert.equal(after.active_epoch_id, 'epoch-2');
});

test('actor state rejects multiple active epochs and cross-actor rotation', () => {
  const raw = actor();
  raw.credential_epochs.push(epoch('actor-alice', 2));
  raw.active_epoch_id = 'epoch-2';
  assert.throws(() => normalizeActorState(raw), /only one active/);
  assert.throws(() => rotateCredentialEpoch(actor(), epoch('actor-other', 2)), /cannot change actor identity/);
});

test('persona succession starts a distinct scoped actor lineage', () => {
  const source = actor('actor-alice', {
    lifecycle_state: 'ended',
    credential_epochs: [epoch('actor-alice', 1, { state: 'retired', ended_at: T2 })],
    active_epoch_id: null
  });
  const successor = buildContinuitySuccessor({
    sourceActorState: source,
    directive: directive('actor-alice'),
    successorActorId: 'actor-alice-echo',
    credentialEpoch: epoch('actor-alice-echo', 1, {
      epoch_id: 'echo-epoch-1',
      activated_at: T2
    })
  });
  assert.equal(successor.actor_id, 'actor-alice-echo');
  assert.equal(successor.continuity_predecessor_actor_id, 'actor-alice');
  assert.deepEqual(successor.state_compartments, ['private_memory', 'publications']);
});

test('persona continuity cannot inherit ordinary authority', () => {
  const raw = directive();
  raw.continuity.ordinary_authority_inherited = true;
  assert.throws(() => normalizeSuccessionDirective(raw), /cannot inherit ordinary authority/);
});

test('public-identifiable and private attribution modes expose only allowed links', () => {
  const publicPersona = normalizePublicationPersona(persona({
    attribution_mode: 'public-identifiable',
    public_actor_link: 'actor-alice'
  }));
  assert.equal(publicPersona.public_actor_link, 'actor-alice');
  assert.throws(
    () => normalizePublicationPersona(persona({ public_actor_link: 'actor-alice' })),
    /cannot expose controller actor link/
  );
});

test('selectively attributable persona requires one protected linkage commitment', () => {
  assert.throws(
    () => normalizePublicationPersona(persona({ attribution_mode: 'selectively-attributable' })),
    /requires a private-link commitment/
  );
  const selective = normalizePublicationPersona(persona({
    attribution_mode: 'selectively-attributable',
    selective_link_commitment: sha256('private actor-to-persona linkage')
  }));
  assert.match(selective.selective_link_commitment, /^[a-f0-9]{64}$/);
});

test('organization-delegated persona requires represented actor and authority evidence', () => {
  const authority = sha256('bounded organization delegation');
  const delegated = normalizePublicationPersona(persona({
    controller_actor_id: 'actor-alice',
    represented_actor_id: 'organization-axiom-lab',
    attribution_mode: 'organization-delegated',
    public_actor_link: 'organization-axiom-lab',
    delegation_authority_digest: authority
  }));
  assert.equal(delegated.represented_actor_id, 'organization-axiom-lab');
  assert.equal(delegated.delegation_authority_digest, authority);
  assert.throws(
    () => normalizePublicationPersona(persona({
      represented_actor_id: 'organization-axiom-lab',
      attribution_mode: 'organization-delegated',
      public_actor_link: 'organization-axiom-lab'
    })),
    /requires delegation authority evidence/
  );
});
