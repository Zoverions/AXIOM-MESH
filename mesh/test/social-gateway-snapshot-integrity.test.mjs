import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ACTOR_STATE_SCHEMA,
  CREDENTIAL_EPOCH_SCHEMA
} from '../src/identity/actor-state.mjs';
import { digestObject } from '../src/lib/canonical.mjs';
import { buildLocalSocialSnapshot } from '../src/gateway/social-snapshot.mjs';

const OWNER = 'principal-social-integrity';

function actorState() {
  return {
    schema: ACTOR_STATE_SCHEMA,
    actor_id: 'actor-social-integrity',
    actor_type: 'human',
    lifecycle_state: 'active',
    credential_epochs: [{
      schema: CREDENTIAL_EPOCH_SCHEMA,
      actor_id: 'actor-social-integrity',
      epoch_id: 'epoch-social-integrity-1',
      sequence: 1,
      state: 'active',
      crypto_profile_id: 'local-principal-custody-v1',
      activated_at: '2026-08-16T18:00:00.000Z',
      ended_at: null,
      predecessor_epoch_id: null
    }],
    active_epoch_id: 'epoch-social-integrity-1',
    state_compartments: ['identity', 'publications'],
    continuity_predecessor_actor_id: null,
    succession_directive_digest: null
  };
}

test('social snapshot recomputes canonical actor state digest', () => {
  const state = actorState();
  const event = {
    seq: 1,
    actor: OWNER,
    kind: 'actor.local.created',
    subject: state.actor_id,
    payload: {
      owner: OWNER,
      actor_state: state,
      actor_state_digest: digestObject(state)
    }
  };
  assert.equal(buildLocalSocialSnapshot([event], OWNER).actors.length, 1);

  const tampered = structuredClone(event);
  tampered.payload.actor_state_digest = '0'.repeat(64);
  assert.throws(
    () => buildLocalSocialSnapshot([tampered], OWNER),
    /actor state digest is invalid/
  );
});
