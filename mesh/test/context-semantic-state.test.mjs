import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { digestObject } from '../src/lib/canonical.mjs';
import { ensureMeshIdentity } from '../src/lib/identity.mjs';
import { intentRequestDigest } from '../src/lib/intent-binding.mjs';
import { loadDataProtector } from '../src/lib/protector.mjs';
import {
  LOCAL_CONTEXT_CANDIDATE_SCHEMA
} from '../src/lib/context-claim-resolution.mjs';
import {
  createLocalContextSemanticTrust,
  deriveLocalContextSemanticTrust
} from '../src/lib/context-semantic-trust.mjs';
import {
  LOCAL_CONTEXT_SEMANTIC_STATE_MEMORY_KIND,
  createLocalContextSemanticStateRecord,
  createReviewedLocalContextSemanticState,
  projectLocalContextSemanticStateMemoryPut
} from '../src/lib/context-semantic-state.mjs';
import {
  createLocalContextSemanticReviewIntent
} from '../src/lib/context-semantic-review-evidence.mjs';
import { verifyLocalContextSemanticReviewFromGrid } from '../src/grid/context-semantic-review-evidence.mjs';
import {
  getCurrentLocalContextSemanticState,
  projectCurrentLocalContextSemanticDataFromGrid
} from '../src/grid/context-semantic-state.mjs';
import { GridStore } from '../src/grid/store.mjs';
import { executeBuiltin } from '../src/sandbox/executor.mjs';

function candidate({
  claimId = 'claim.semantic.state.1',
  semanticType = 'preference.communication-style',
  value = { preference: 'concise' }
} = {}) {
  return {
    schema: LOCAL_CONTEXT_CANDIDATE_SCHEMA,
    claim_id: claimId,
    owner_subject_ref: 'owner.alice',
    semantic_type: semanticType,
    value,
    disclosure_type: 'verbatim-approved',
    sensitivity: 'ordinary-private',
    confidence: 0.9,
    limitations: 'Fixture data for persisted semantic current-state evidence.',
    source_vault_id: 'vault.personal',
    source_resource_refs: ['resource.note.1'],
    observed_at: '2026-08-24T12:00:00.000Z',
    valid_from: '2026-08-24T12:00:00.000Z',
    valid_until: null,
    supersedes: [],
    contradicts: [],
    authority_effect: 'none'
  };
}

function trust(value = candidate(), {
  originClass = 'retrieved-external',
  semanticClass = 'knowledge'
} = {}) {
  return createLocalContextSemanticTrust(value, {
    origin_class: originClass,
    semantic_class: semanticClass,
    source_evidence_digest: 'a'.repeat(64),
    review_state: 'unreviewed',
    retention_mode: 'owner-controlled'
  });
}

async function fixture(t) {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-context-semantic-state-'));
  const identity = await ensureMeshIdentity(dataDir, 'grid', { create: true });
  const protector = await loadDataProtector({ dataDir, autoBootstrap: true });
  let store = new GridStore({
    path: join(dataDir, 'grid.sqlite'),
    dataDir,
    identity,
    protector
  });
  t.after(async () => {
    try {
      store?.close();
    } catch {
      // The test may have closed the first instance before a restart.
    }
    await rm(dataDir, { recursive: true, force: true });
  });
  return {
    dataDir,
    identity,
    protector,
    get store() {
      return store;
    },
    restart() {
      store.close();
      store = new GridStore({
        path: join(dataDir, 'grid.sqlite'),
        dataDir,
        identity,
        protector
      });
      return store;
    }
  };
}

function persistState(store, state, traceId) {
  const input = projectLocalContextSemanticStateMemoryPut(state);
  const execution = executeBuiltin({
    tool: 'builtin.validate-mutation',
    intent: {
      action: 'memory.put',
      principal: { id: state.owner_subject_ref, type: 'human' },
      input
    }
  });
  const [event] = store.appendEvents({
    traceId,
    actor: state.owner_subject_ref,
    events: [execution.mutation]
  });
  return {
    event,
    objectId: execution.mutation.subject,
    input
  };
}

function reviewEvidence(store, value, priorTrust, {
  decision = 'accept-data',
  targetSemanticClass = 'preference',
  suffix = '1'
} = {}) {
  const intent = createLocalContextSemanticReviewIntent(value, priorTrust, {
    decision,
    targetSemanticClass
  });
  const intentId = `intent.semantic.state.review.${suffix}`;
  const traceId = `trace.semantic.state.review.${suffix}`;
  store.appendEvents({
    traceId,
    actor: value.owner_subject_ref,
    events: [{
      kind: 'intent.accepted',
      subject: intentId,
      payload: {
        intent_id: intentId,
        principal: value.owner_subject_ref,
        action: intent.action,
        risk: 'low',
        input_digest: digestObject(intent.input),
        request_digest: intentRequestDigest(intent)
      }
    }]
  });
  store.appendEvents({
    traceId,
    actor: value.owner_subject_ref,
    events: [{
      kind: 'intent.completed',
      subject: intentId,
      payload: {
        intent_id: intentId,
        result: {
          intent_id: intentId,
          trace_id: traceId,
          status: 'completed'
        }
      }
    }]
  });
  return verifyLocalContextSemanticReviewFromGrid(store, {
    candidate: value,
    trust: priorTrust,
    intent
  });
}

function tombstoneState(store, owner, objectId, traceId) {
  const execution = executeBuiltin({
    tool: 'builtin.validate-mutation',
    intent: {
      action: 'memory.tombstone',
      principal: { id: owner, type: 'human' },
      input: {
        object_id: objectId,
        reason: 'semantic current-state fixture tombstone'
      }
    }
  });
  store.appendEvents({
    traceId,
    actor: owner,
    events: [execution.mutation]
  });
}

test('semantic state projects only an ordinary memory.put input and stays non-authorizing', () => {
  const value = candidate();
  const initialTrust = trust(value);
  const state = createLocalContextSemanticStateRecord(value, initialTrust);
  const input = projectLocalContextSemanticStateMemoryPut(state);

  assert.equal(input.kind, LOCAL_CONTEXT_SEMANTIC_STATE_MEMORY_KIND);
  assert.equal(input.content.state_digest, state.state_digest);
  assert.equal(input.metadata.state_digest, state.state_digest);
  assert.equal(state.persistence_path, 'existing-memory.put-only');
  assert.equal(state.downstream_effect_authorized, false);
  assert.equal(state.instruction_semantics, false);
  assert.equal(state.owner_instruction_use_enabled, false);
  assert.equal(state.may_authorize_tools, false);
  assert.equal(state.may_modify_policy, false);
  assert.equal(state.may_self_persist, false);
});

test('completed review advances one unique persisted state and is reverified from Grid history', async t => {
  const fx = await fixture(t);
  const value = candidate();
  const initialTrust = trust(value);
  const initial = createLocalContextSemanticStateRecord(value, initialTrust);
  persistState(fx.store, initial, 'trace.semantic.state.birth.1');

  const evidence = reviewEvidence(fx.store, value, initialTrust);
  const { state: reviewed } = createReviewedLocalContextSemanticState(
    value,
    initial,
    evidence
  );
  persistState(fx.store, reviewed, 'trace.semantic.state.review.persist.1');

  const current = getCurrentLocalContextSemanticState(fx.store, {
    owner: 'owner.alice',
    claimId: value.claim_id
  });
  assert.equal(current.state_digest, reviewed.state_digest);
  assert.equal(current.trust.review_state, 'owner-reviewed');
  assert.equal(current.trust.review_evidence_digest, evidence.review_evidence_digest);
  assert.equal(current.review_evidence_reverified, true);
  assert.equal(current.current_state_verified, true);
  assert.equal(current.full_grid_chain_verified, true);
  assert.equal(current.downstream_effect_authorized, false);
});

test('multiple observed genesis states for one claim fail closed as ambiguous history', async t => {
  const fx = await fixture(t);
  const value = candidate();
  const first = createLocalContextSemanticStateRecord(
    value,
    trust(value, { semanticClass: 'knowledge' })
  );
  const second = createLocalContextSemanticStateRecord(
    value,
    trust(value, { semanticClass: 'preference' })
  );
  persistState(fx.store, first, 'trace.semantic.state.branch.1');
  persistState(fx.store, second, 'trace.semantic.state.branch.2');

  assert.throws(
    () => getCurrentLocalContextSemanticState(fx.store, {
      owner: 'owner.alice',
      claimId: value.claim_id
    }),
    /exactly one observed genesis/
  );
});

test('tombstoning an ancestor invalidates its reviewed descendant', async t => {
  const fx = await fixture(t);
  const value = candidate();
  const initialTrust = trust(value);
  const initial = createLocalContextSemanticStateRecord(value, initialTrust);
  const persistedInitial = persistState(
    fx.store,
    initial,
    'trace.semantic.state.tombstone.birth'
  );
  const evidence = reviewEvidence(fx.store, value, initialTrust, { suffix: 'tombstone' });
  const { state: reviewed } = createReviewedLocalContextSemanticState(
    value,
    initial,
    evidence
  );
  persistState(fx.store, reviewed, 'trace.semantic.state.tombstone.review');
  tombstoneState(
    fx.store,
    value.owner_subject_ref,
    persistedInitial.objectId,
    'trace.semantic.state.tombstone.apply'
  );

  assert.throws(
    () => getCurrentLocalContextSemanticState(fx.store, {
      owner: 'owner.alice',
      claimId: value.claim_id
    }),
    error => error?.code === 'context_semantic_state_ancestor_tombstoned'
  );
});

test('persisted semantic state survives restart and review evidence is reverified', async t => {
  const fx = await fixture(t);
  const value = candidate();
  const initialTrust = trust(value);
  const initial = createLocalContextSemanticStateRecord(value, initialTrust);
  persistState(fx.store, initial, 'trace.semantic.state.restart.birth');
  const evidence = reviewEvidence(fx.store, value, initialTrust, { suffix: 'restart' });
  const { state: reviewed } = createReviewedLocalContextSemanticState(
    value,
    initial,
    evidence
  );
  persistState(fx.store, reviewed, 'trace.semantic.state.restart.review');

  const reopened = fx.restart();
  const current = getCurrentLocalContextSemanticState(reopened, {
    owner: 'owner.alice',
    claimId: value.claim_id
  });
  assert.equal(current.state_digest, reviewed.state_digest);
  assert.equal(current.review_evidence_reverified, true);
  assert.equal(current.current_state_verified, true);
});

test('a parent review makes a derived child that names the old parent trust stale', async t => {
  const fx = await fixture(t);
  const parent = candidate({
    claimId: 'claim.semantic.parent',
    semanticType: 'preference.response-style',
    value: { style: 'concise' }
  });
  const child = candidate({
    claimId: 'claim.semantic.child',
    semanticType: 'preference.response-format',
    value: { format: 'bullets' }
  });
  const parentTrust = trust(parent);
  const childTrust = deriveLocalContextSemanticTrust(parent, parentTrust, child, {
    semantic_class: 'preference'
  });
  const parentState = createLocalContextSemanticStateRecord(parent, parentTrust);
  const childState = createLocalContextSemanticStateRecord(child, childTrust);
  persistState(fx.store, parentState, 'trace.semantic.parent.birth');
  persistState(fx.store, childState, 'trace.semantic.child.birth');

  const evidence = reviewEvidence(fx.store, parent, parentTrust, {
    targetSemanticClass: 'knowledge',
    suffix: 'parent'
  });
  const { state: reviewedParent } = createReviewedLocalContextSemanticState(
    parent,
    parentState,
    evidence
  );
  persistState(fx.store, reviewedParent, 'trace.semantic.parent.review');

  const projection = projectCurrentLocalContextSemanticDataFromGrid(fx.store, {
    owner: 'owner.alice',
    asOf: '2026-08-24T13:00:00.000Z'
  });
  assert.deepEqual(
    projection.admitted_candidates.map(item => item.claim_id),
    ['claim.semantic.parent']
  );
  assert.deepEqual(projection.excluded, [{
    claim_id: 'claim.semantic.child',
    code: 'semantic_trust_parent_stale'
  }]);
  assert.equal(projection.persisted_current_state_verified, true);
  assert.equal(projection.downstream_effect_authorized, false);
});

test('full Grid-chain corruption blocks semantic current-state evidence', async t => {
  const fx = await fixture(t);
  const value = candidate();
  const initial = createLocalContextSemanticStateRecord(value, trust(value));
  const persisted = persistState(
    fx.store,
    initial,
    'trace.semantic.state.corrupt.birth'
  );
  fx.store.db.prepare(
    'UPDATE events SET event_hash = ? WHERE event_id = ?'
  ).run('f'.repeat(64), persisted.event.event_id);

  assert.throws(
    () => getCurrentLocalContextSemanticState(fx.store, {
      owner: 'owner.alice',
      claimId: value.claim_id
    }),
    error => error?.code === 'integrity_verification_failed'
  );
});
