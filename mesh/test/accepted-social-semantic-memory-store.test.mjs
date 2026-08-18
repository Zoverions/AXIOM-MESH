import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { digestObject, sha256 } from '../src/lib/canonical.mjs';
import { ensureMeshIdentity } from '../src/lib/identity.mjs';
import {
  buildNativeInvocationEnvelope,
  invocationEnvelopeDigest
} from '../src/lib/invocation-envelope.mjs';
import { intentRequestDigest } from '../src/lib/intent-binding.mjs';
import { DataProtector } from '../src/lib/protector.mjs';
import {
  ACTOR_STATE_SCHEMA,
  CREDENTIAL_EPOCH_SCHEMA
} from '../src/identity/actor-state.mjs';
import {
  ACCEPTED_SOCIAL_STORAGE
} from '../src/grid/accepted-social-store.mjs';
import {
  ACCEPTED_SOCIAL_SEMANTIC_MEMORY_COMPOSITION_SCHEMA,
  AcceptedSocialSemanticMemoryGridStore
} from '../src/grid/accepted-social-semantic-memory-store.mjs';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'axiom-social-semantic-composed-'));
  const dataDir = join(root, 'data');
  const identity = await ensureMeshIdentity(dataDir, 'grid', { create: true });
  const protector = new DataProtector(randomBytes(32));
  const path = join(dataDir, 'grid.sqlite');
  const store = new AcceptedSocialSemanticMemoryGridStore({
    path,
    dataDir,
    identity,
    protector
  });
  let openStore = store;
  t.after(async () => {
    try {
      openStore.close();
    } catch {
      // A restart test may already have closed the active handle.
    }
    await rm(root, { recursive: true, force: true });
  });
  return {
    root,
    dataDir,
    identity,
    protector,
    path,
    store,
    setOpenStore(value) {
      openStore = value;
    }
  };
}

function actorEvent(owner = 'principal-local-custodian') {
  const actorId = 'actor-local-composed';
  const activatedAt = '2026-08-18T08:00:00.000Z';
  const actorState = {
    schema: ACTOR_STATE_SCHEMA,
    actor_id: actorId,
    actor_type: 'human',
    lifecycle_state: 'active',
    credential_epochs: [{
      schema: CREDENTIAL_EPOCH_SCHEMA,
      actor_id: actorId,
      epoch_id: 'actor-local-composed-epoch-1',
      sequence: 1,
      state: 'active',
      crypto_profile_id: 'classical-ed25519-v1',
      activated_at: activatedAt,
      ended_at: null,
      predecessor_epoch_id: null
    }],
    active_epoch_id: 'actor-local-composed-epoch-1',
    state_compartments: ['identity', 'publications'],
    continuity_predecessor_actor_id: null,
    succession_directive_digest: null
  };
  return {
    actorId,
    event: {
      kind: 'actor.local.created',
      subject: actorId,
      payload: {
        owner,
        actor_state: actorState,
        actor_state_digest: digestObject(actorState)
      }
    }
  };
}

function semanticFixture({
  owner = 'principal-local-custodian',
  suffix = 'composed-1'
} = {}) {
  const content = { text: 'One Grid can retain social state and governed semantic memory.' };
  const metadata = {
    axiom_semantic_class: 'knowledge',
    axiom_semantic_origin: 'owner-authored'
  };
  const input = {
    kind: 'semantic.memory',
    content,
    metadata
  };
  const intentId = `intent.semantic.${suffix}`;
  const traceId = `trace.semantic.${suffix}`;
  const intent = {
    intent_id: intentId,
    principal: {
      id: owner,
      type: 'human',
      roles: ['owner'],
      scopes: ['memory:write']
    },
    action: 'memory.put',
    input,
    purpose: 'owner-memory-ingestion',
    data_scopes: ['memory:write'],
    confirmations: [],
    approval_ids: [],
    submitted_at: '2026-08-18T08:01:00.000Z'
  };
  const policyDigest = sha256(`composed-policy:${suffix}`);
  const decision = {
    policy_version: 'composed-test.v1',
    policy_digest: policyDigest,
    risk: 'low',
    required_assurance: 'A1',
    requires_independent_approval: false,
    timeout_ms: 10_000
  };
  const invocation = buildNativeInvocationEnvelope(intent, decision);
  const invocationDigest = invocationEnvelopeDigest(invocation);
  const contentDigest = digestObject({
    owner,
    kind: 'semantic.memory',
    content,
    metadata
  });
  const objectId = `memory_${contentDigest}`;
  const assurance = { required: 'A1', achieved: 'A1' };
  const mutation = {
    kind: 'memory.put',
    subject: objectId,
    payload: {
      object_id: objectId,
      owner,
      kind: 'semantic.memory',
      content,
      metadata,
      content_digest: contentDigest
    }
  };
  const sandboxResult = {
    output: {
      object_id: objectId,
      content_digest: contentDigest,
      status: 'active',
      assurance
    },
    mutation
  };
  const resultDigest = digestObject(sandboxResult);
  const planDigest = sha256(`composed-plan:${suffix}`);
  const execution = {
    statement: {
      trace_id: traceId,
      intent_id: intentId,
      intent_digest: digestObject(intent),
      invocation_digest: invocationDigest,
      capability_id: `cap.semantic.${suffix}`,
      tool: 'builtin.validate-mutation',
      policy_digest: policyDigest,
      assurance,
      started_at: '2026-08-18T08:01:01.000Z',
      completed_at: '2026-08-18T08:01:02.000Z',
      result_digest: resultDigest
    },
    signature: {
      algorithm: 'Ed25519',
      key_id: `sandbox:test:${suffix}`,
      signature: `fixture-signature-${suffix}`
    }
  };
  return {
    owner,
    traceId,
    intentId,
    objectId,
    accepted: {
      kind: 'intent.accepted',
      subject: intentId,
      payload: {
        intent_id: intentId,
        principal: owner,
        principal_type: 'human',
        action: 'memory.put',
        risk: 'low',
        input_digest: digestObject(input),
        request_digest: intentRequestDigest(intent),
        policy_version: decision.policy_version,
        policy_digest: policyDigest,
        invocation,
        invocation_digest: invocationDigest
      }
    },
    memory: {
      ...mutation,
      payload: {
        ...mutation.payload,
        evidence: {
          plan_digest: planDigest,
          invocation_digest: invocationDigest,
          execution
        }
      }
    },
    completed: {
      kind: 'intent.completed',
      subject: intentId,
      payload: {
        intent_id: intentId,
        result: {
          object_id: objectId,
          content_digest: contentDigest,
          status: 'completed',
          assurance,
          intent_id: intentId,
          trace_id: traceId,
          evidence: {
            plan_digest: planDigest,
            invocation_digest: invocationDigest,
            execution_digest: resultDigest,
            policy_digest: policyDigest
          }
        }
      }
    }
  };
}

test('one laboratory store initializes accepted social and converged semantic schemas without transport or production selection', async t => {
  const setup = await fixture(t);
  const status = setup.store.getStatus();

  assert.deepEqual(status.accepted_social_storage, ACCEPTED_SOCIAL_STORAGE);
  assert.equal(status.remote_social_runtime_store.activation_state, 'accepted-local-storage');
  assert.equal(status.remote_social_runtime_store.network_egress, false);
  assert.equal(status.remote_social_runtime_store.transport_included, false);
  assert.equal(status.semantic_memory_state_store.activation_state, 'opt-in-local-laboratory');
  assert.equal(status.converged_semantic_memory_ingestion.activation_state, 'opt-in-local-laboratory');
  assert.equal(
    status.accepted_social_semantic_memory_composition.schema,
    ACCEPTED_SOCIAL_SEMANTIC_MEMORY_COMPOSITION_SCHEMA
  );
  assert.equal(status.accepted_social_semantic_memory_composition.one_grid_store, true);
  assert.equal(status.accepted_social_semantic_memory_composition.one_sqlite_database, true);
  assert.equal(status.accepted_social_semantic_memory_composition.one_signed_evidence_chain, true);
  assert.equal(status.accepted_social_semantic_memory_composition.production_store_selected, false);
  assert.equal(status.accepted_social_semantic_memory_composition.public_mutation_routes_added, false);

  const tables = new Set(setup.store.db.prepare(`
    SELECT name FROM sqlite_master WHERE type = 'table'
  `).all().map(row => row.name));
  for (const name of [
    'actor_states',
    'remote_social_staging',
    'remote_social_admissions',
    'remote_social_observations',
    'remote_social_follows',
    'remote_social_retention_receipts',
    'remote_social_abuse_preferences',
    'semantic_memory_provenance_state'
  ]) {
    assert.equal(tables.has(name), true, `${name} missing from composed store`);
  }
  assert.equal(tables.has('remote_social_transport_jobs'), false);
  assert.equal(typeof setup.store.queueRemoteSocialTransportJob, 'undefined');
});

test('social and semantic mutations share one signed Grid chain and both materialize', async t => {
  const setup = await fixture(t);
  const owner = 'principal-local-custodian';
  const social = actorEvent(owner);
  setup.store.appendEvents({
    traceId: 'trace.social.composed',
    actor: owner,
    events: [social.event]
  });

  const semantic = semanticFixture({ owner });
  setup.store.appendEvents({
    traceId: semantic.traceId,
    actor: owner,
    events: [semantic.accepted]
  });
  const receipt = setup.store.appendEvents({
    traceId: semantic.traceId,
    actor: owner,
    events: [semantic.memory, semantic.completed]
  });

  assert.equal(receipt.object_id, semantic.objectId);
  assert.equal(receipt.semantic_record.origin_class, 'owner-authored');
  assert.equal(receipt.downstream_effect_authorized, false);
  assert.equal(receipt.propagation_authorized, false);

  const actor = setup.store.db.prepare(`
    SELECT actor_id, owner FROM actor_states WHERE actor_id = ?
  `).get(social.actorId);
  assert.equal(actor.actor_id, social.actorId);
  assert.equal(actor.owner, owner);

  const provenance = setup.store.getCurrentSemanticMemoryProvenance(owner, semantic.objectId);
  assert.equal(provenance.object_id, semantic.objectId);
  assert.equal(provenance.authority_tier, 'owner-memory');

  const events = setup.store.db.prepare(`
    SELECT seq, kind FROM events ORDER BY seq
  `).all();
  assert.deepEqual(events.map(row => row.kind), [
    'actor.local.created',
    'intent.accepted',
    'memory.put',
    'intent.completed'
  ]);
  assert.deepEqual(events.map(row => row.seq), [1, 2, 3, 4]);
  assert.equal(setup.store.verifyChain().valid, true);
});

test('combined store rebuilds both domains after restart from the same database and evidence chain', async t => {
  const setup = await fixture(t);
  const owner = 'principal-local-custodian';
  const social = actorEvent(owner);
  setup.store.appendEvents({
    traceId: 'trace.social.restart.composed',
    actor: owner,
    events: [social.event]
  });
  const semantic = semanticFixture({ owner, suffix: 'composed-restart' });
  setup.store.appendEvents({
    traceId: semantic.traceId,
    actor: owner,
    events: [semantic.accepted]
  });
  setup.store.appendEvents({
    traceId: semantic.traceId,
    actor: owner,
    events: [semantic.memory, semantic.completed]
  });
  setup.store.close();

  const reopened = new AcceptedSocialSemanticMemoryGridStore({
    path: setup.path,
    dataDir: setup.dataDir,
    identity: setup.identity,
    protector: setup.protector
  });
  setup.setOpenStore(reopened);

  assert.equal(reopened.verifyChain().valid, true);
  assert.equal(reopened.verifyConvergedSemanticMemoryHistory().valid, true);
  assert.equal(
    reopened.db.prepare('SELECT COUNT(*) AS count FROM actor_states WHERE actor_id = ?')
      .get(social.actorId).count,
    1
  );
  assert.equal(
    reopened.getCurrentSemanticMemoryProvenance(owner, semantic.objectId).object_id,
    semantic.objectId
  );
});

test('production Grid remains AcceptedSocialGridStore and does not select the combined laboratory', async () => {
  const source = await readFile(new URL('../src/grid/server.mjs', import.meta.url), 'utf8');
  assert.match(source, /import \{ AcceptedSocialGridStore \} from '\.\/accepted-social-store\.mjs';/);
  assert.match(source, /new AcceptedSocialGridStore\s*\(/);
  assert.equal(source.includes('AcceptedSocialSemanticMemoryGridStore'), false);
  assert.equal(source.includes('ConvergedSemanticMemoryGridStore'), false);
  assert.equal(source.includes('AXIOM_SEMANTIC_MEMORY'), false);
});
