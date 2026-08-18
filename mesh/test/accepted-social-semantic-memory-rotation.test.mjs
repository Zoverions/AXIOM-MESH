import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { digestObject, sha256 } from '../src/lib/canonical.mjs';
import { ensureMeshIdentity } from '../src/lib/identity.mjs';
import { DataProtector } from '../src/lib/protector.mjs';
import {
  ACTOR_STATE_SCHEMA,
  CREDENTIAL_EPOCH_SCHEMA
} from '../src/identity/actor-state.mjs';
import {
  AcceptedSocialSemanticMemoryGridStore,
  reencryptAcceptedSocialSemanticMemoryProtectedColumns
} from '../src/grid/accepted-social-semantic-memory-store.mjs';

function actorFixture() {
  const owner = 'principal-rotation-owner';
  const actorId = 'actor-rotation-owner';
  const actorState = {
    schema: ACTOR_STATE_SCHEMA,
    actor_id: actorId,
    actor_type: 'human',
    lifecycle_state: 'active',
    credential_epochs: [{
      schema: CREDENTIAL_EPOCH_SCHEMA,
      actor_id: actorId,
      epoch_id: 'actor-rotation-owner-epoch-1',
      sequence: 1,
      state: 'active',
      crypto_profile_id: 'classical-ed25519-v1',
      activated_at: '2026-08-18T08:00:00.000Z',
      ended_at: null,
      predecessor_epoch_id: null
    }],
    active_epoch_id: 'actor-rotation-owner-epoch-1',
    state_compartments: ['identity'],
    continuity_predecessor_actor_id: null,
    succession_directive_digest: null
  };
  return { owner, actorId, actorState };
}

test('composition-aware offline rotation re-encrypts accepted-social and semantic protected rows', async t => {
  const root = await mkdtemp(join(tmpdir(), 'axiom-social-semantic-rotation-'));
  const dataDir = join(root, 'data');
  const identity = await ensureMeshIdentity(dataDir, 'grid', { create: true });
  const sourceProtector = new DataProtector(randomBytes(32));
  const path = join(dataDir, 'grid.sqlite');
  const store = new AcceptedSocialSemanticMemoryGridStore({
    path,
    dataDir,
    identity,
    protector: sourceProtector
  });
  t.after(async () => {
    try {
      store.close();
    } catch {
      // Closed before offline rotation.
    }
    await rm(root, { recursive: true, force: true });
  });

  const actor = actorFixture();
  store.appendEvents({
    traceId: 'trace.composed.rotation.social',
    actor: actor.owner,
    events: [{
      kind: 'actor.local.created',
      subject: actor.actorId,
      payload: {
        owner: actor.owner,
        actor_state: actor.actorState,
        actor_state_digest: digestObject(actor.actorState)
      }
    }]
  });

  const objectId = `memory_${sha256('synthetic-semantic-rotation-row')}`;
  const semanticRecord = {
    marker: 'semantic-protected-state',
    object_id: objectId
  };
  const semanticContext =
    `axiom:semantic_memory_provenance_state.record_json:${objectId}`;
  store.db.prepare(`
    INSERT INTO semantic_memory_provenance_state(
      object_id, owner, content_digest, provenance_digest,
      authority_tier, review_state, record_json,
      source_event_id, source_seq, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    objectId,
    actor.owner,
    sha256('semantic-content'),
    sha256('semantic-provenance'),
    'untrusted-data',
    'unreviewed',
    sourceProtector.seal(JSON.stringify(semanticRecord), semanticContext),
    'event.synthetic.rotation',
    1,
    '2026-08-18T08:00:00.000Z',
    '2026-08-18T08:00:00.000Z'
  );

  store.close();

  const targetProtector = new DataProtector(randomBytes(32));
  const db = new DatabaseSync(path);
  const result = reencryptAcceptedSocialSemanticMemoryProtectedColumns({
    db,
    sourceProtector,
    targetProtector
  });

  assert.ok(result.protected_values >= 2);
  assert.equal(result.tables.actor_states, 1);
  assert.equal(result.tables.semantic_memory_provenance_state, 1);

  const actorRow = db.prepare(`
    SELECT state_json FROM actor_states WHERE actor_id = ?
  `).get(actor.actorId);
  const actorContext = `axiom:actor_states.state_json:${actor.actorId}`;
  const reopenedActor = JSON.parse(targetProtector.open(actorRow.state_json, actorContext));
  assert.equal(reopenedActor.actor_id, actor.actorId);

  const semanticRow = db.prepare(`
    SELECT record_json FROM semantic_memory_provenance_state WHERE object_id = ?
  `).get(objectId);
  const reopenedSemantic = JSON.parse(
    targetProtector.open(semanticRow.record_json, semanticContext)
  );
  assert.deepEqual(reopenedSemantic, semanticRecord);
  assert.throws(() => sourceProtector.open(semanticRow.record_json, semanticContext));
  db.close();
});
