import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { sha256 } from '../src/lib/canonical.mjs';
import { ensureMeshIdentity } from '../src/lib/identity.mjs';
import { loadDataProtector } from '../src/lib/protector.mjs';
import {
  SOURCE_CONTENT_ADDRESS_PROFILE,
  SOURCE_REPLICA_OBSERVATION_SCHEMA,
  SOURCE_STATE_SCHEMA,
  SOURCE_TRANSITION_SCHEMA,
  normalizeSourceReplicaObservation,
  normalizeSourceState,
  normalizeSourceTransition
} from '../src/lib/source-continuity.mjs';
import {
  SOURCE_TRANSITION_DECISION_SCHEMA,
  SourceContinuityGridStore
} from '../src/grid/source-continuity-store.mjs';

const DIGEST = value => sha256(value);
const OID = value => sha256(value).slice(0, 40);

function sourceState(label) {
  return normalizeSourceState({
    schema: SOURCE_STATE_SCHEMA,
    repository_id: 'axiom-mesh',
    vcs: 'git',
    object_format: 'sha1',
    commit_oid: OID(`commit:${label}`),
    tree_oid: OID(`tree:${label}`),
    source_manifest_digest: DIGEST(`manifest:${label}`),
    build: {
      kernel_version: '0.12.0-dev.3',
      capability_registry_digest: DIGEST(`registry:${label}`),
      capability_evidence_digest: DIGEST(`evidence:${label}`),
      release_boundary_digest: DIGEST(`release:${label}`)
    },
    content_address_profile: SOURCE_CONTENT_ADDRESS_PROFILE
  });
}

function transition({ parent = null, child, sequence, type }) {
  return normalizeSourceTransition({
    schema: SOURCE_TRANSITION_SCHEMA,
    repository_id: child.repository_id,
    parent_state_digest: parent?.state_digest ?? null,
    child_state_digest: child.state_digest,
    transition_type: type,
    sequence,
    authority_digest: DIGEST(`authority:${sequence}`),
    evidence_digest: DIGEST(`evidence-transition:${sequence}`),
    accepted_at: new Date(Date.now() + 10_000 + sequence).toISOString(),
    content_address_profile: SOURCE_CONTENT_ADDRESS_PROFILE
  });
}

async function storeFixture(t) {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-source-continuity-'));
  const identity = await ensureMeshIdentity(dataDir, 'grid', { create: true });
  const protector = await loadDataProtector({ dataDir, autoBootstrap: true });
  const path = join(dataDir, 'grid.sqlite');
  let store = new SourceContinuityGridStore({ path, dataDir, identity, protector });
  t.after(async () => {
    try {
      store.close();
    } catch {
      // Restart tests replace the active handle.
    }
    await rm(dataDir, { recursive: true, force: true });
  });
  return {
    dataDir,
    identity,
    protector,
    path,
    get store() {
      return store;
    },
    replaceStore(next) {
      store = next;
    }
  };
}

function verifiedDecision(store, t, sourceTransition, proposalId) {
  const now = Date.now();
  const votingEndsAt = new Date(now + 1_000).toISOString();
  const activateAfter = new Date(now + 2_000).toISOString();
  const decision = {
    schema: SOURCE_TRANSITION_DECISION_SCHEMA,
    repository_id: sourceTransition.repository_id,
    transition_digest: sourceTransition.transition_digest,
    decision: 'accept',
    authority_digest: sourceTransition.authority_digest,
    evidence_digest: sourceTransition.evidence_digest
  };
  store.appendEvents({
    traceId: `trace:${proposalId}:propose`,
    actor: 'human:source-governor',
    events: [{
      kind: 'governance.proposed',
      subject: proposalId,
      payload: {
        proposal_id: proposalId,
        proposer: 'human:source-governor',
        title: 'Accept source transition',
        body: 'Bind the exact source transition into accepted AXIOM lineage.',
        action: {
          type: 'record.decision',
          payload: decision,
          rollback: {}
        },
        voting_ends_at: votingEndsAt,
        activate_after: activateAfter
      }
    }]
  });
  store.appendEvents({
    traceId: `trace:${proposalId}:vote`,
    actor: 'human:source-reviewer',
    events: [{
      kind: 'governance.voted',
      subject: proposalId,
      payload: {
        proposal_id: proposalId,
        voter: 'human:source-reviewer',
        chamber: 'human',
        choice: 'for',
        weight: 1
      }
    }]
  });
  t.mock.timers.tick(1_001);
  store.appendEvents({
    traceId: `trace:${proposalId}:finalize`,
    actor: 'human:source-governor',
    events: [{
      kind: 'governance.finalized',
      subject: proposalId,
      payload: { proposal_id: proposalId, finalized_by: 'human:source-governor' }
    }]
  });
  t.mock.timers.tick(1_000);
  store.appendEvents({
    traceId: `trace:${proposalId}:activate`,
    actor: 'human:source-activator',
    events: [{
      kind: 'governance.activated',
      subject: proposalId,
      payload: { proposal_id: proposalId, activated_by: 'human:source-activator' }
    }]
  });
  store.appendEvents({
    traceId: `trace:${proposalId}:verify`,
    actor: 'service:source-verifier',
    events: [{
      kind: 'governance.verified',
      subject: proposalId,
      payload: {
        proposal_id: proposalId,
        verification_digest: DIGEST(`verified:${proposalId}`)
      }
    }]
  });
  return decision;
}

function enableClock(t) {
  t.mock.timers.enable({
    apis: ['Date'],
    now: new Date('2026-08-11T16:30:00.000Z')
  });
}

test('verified governance decision creates durable accepted source lineage across restart', async t => {
  enableClock(t);
  const fixture = await storeFixture(t);
  const genesisState = sourceState('genesis');
  const genesis = transition({ child: genesisState, sequence: 0, type: 'genesis' });

  fixture.store.recordSourceState({
    actor: 'service:source-recorder',
    traceId: 'trace:source:genesis-state',
    state: genesisState
  });
  verifiedDecision(fixture.store, t, genesis, 'proposal:source-genesis');
  fixture.store.acceptSourceTransition({
    actor: 'service:source-recorder',
    traceId: 'trace:source:genesis-accept',
    transition: genesis,
    childState: genesisState,
    governanceProposalId: 'proposal:source-genesis'
  });

  const before = fixture.store.getSourceContinuity('axiom-mesh');
  assert.equal(before.accepted_sequence, 0);
  assert.equal(before.accepted_head_state_digest, genesisState.state_digest);
  assert.equal(before.accepted_transitions.length, 1);
  assert.equal(before.authority_from_replica_observation, false);

  fixture.store.close();
  const restarted = new SourceContinuityGridStore({
    path: fixture.path,
    dataDir: fixture.dataDir,
    identity: fixture.identity,
    protector: fixture.protector
  });
  fixture.replaceStore(restarted);
  const after = restarted.getSourceContinuity('axiom-mesh');
  assert.equal(after.accepted_head_state_digest, genesisState.state_digest);
  assert.equal(after.accepted_transitions[0].transition.transition_digest, genesis.transition_digest);
});

test('replica observations cannot alter accepted source head', async t => {
  enableClock(t);
  const { store } = await storeFixture(t);
  const state = sourceState('replicas');
  const genesis = transition({ child: state, sequence: 0, type: 'genesis' });
  store.recordSourceState({
    actor: 'service:source-recorder',
    traceId: 'trace:state:replicas',
    state
  });
  verifiedDecision(store, t, genesis, 'proposal:source-replicas');
  store.acceptSourceTransition({
    actor: 'service:source-recorder',
    traceId: 'trace:source:replicas-accept',
    transition: genesis,
    childState: state,
    governanceProposalId: 'proposal:source-replicas'
  });

  for (const [replicaId, transport, locator, status] of [
    ['github.primary', 'github', 'github:Zoverions/AXIOM-MESH', 'reachable'],
    ['radicle.peer', 'radicle', 'rad:example', 'reachable'],
    ['offline.bare', 'bare_git', 'file:offline-bare', 'divergent']
  ]) {
    const observation = normalizeSourceReplicaObservation({
      schema: SOURCE_REPLICA_OBSERVATION_SCHEMA,
      repository_id: state.repository_id,
      source_state_digest: state.state_digest,
      replica_id: replicaId,
      transport,
      locator,
      object_format: state.object_format,
      observed_commit_oid: state.commit_oid,
      object_complete: true,
      digest_verified: status !== 'divergent',
      status,
      observed_at: new Date().toISOString(),
      non_authoritative: true,
      content_address_profile: SOURCE_CONTENT_ADDRESS_PROFILE
    });
    store.recordReplicaObservation({
      actor: 'service:replica-observer',
      traceId: `trace:replica:${replicaId}`,
      observation
    });
  }

  const ledger = store.getSourceContinuity('axiom-mesh');
  assert.equal(ledger.replica_count, 3);
  assert.equal(ledger.accepted_head_state_digest, state.state_digest);
  assert.equal(ledger.authority_from_replica_observation, false);
  assert.equal(ledger.replicas.find(item => item.replica_id === 'offline.bare').status, 'divergent');
});

test('wrong or unverified governance cannot create accepted source lineage', async t => {
  enableClock(t);
  const { store } = await storeFixture(t);
  const state = sourceState('denied');
  const genesis = transition({ child: state, sequence: 0, type: 'genesis' });
  store.recordSourceState({
    actor: 'service:source-recorder',
    traceId: 'trace:source:denied-state',
    state
  });

  assert.throws(() => store.acceptSourceTransition({
    actor: 'service:source-recorder',
    traceId: 'trace:source:unverified',
    transition: genesis,
    childState: state,
    governanceProposalId: 'proposal:missing'
  }), /not verified/);

  const other = transition({
    child: sourceState('other'),
    sequence: 0,
    type: 'genesis'
  });
  verifiedDecision(store, t, other, 'proposal:source-wrong');
  assert.throws(() => store.acceptSourceTransition({
    actor: 'service:source-recorder',
    traceId: 'trace:source:wrong-governance',
    transition: genesis,
    childState: state,
    governanceProposalId: 'proposal:source-wrong'
  }), /does not authorize this exact source transition/);
  assert.equal(store.getSourceContinuity('axiom-mesh').accepted_sequence, -1);
});

test('accepted source lineage is linear and refuses parent substitution', async t => {
  enableClock(t);
  const { store } = await storeFixture(t);
  const first = sourceState('linear-first');
  const genesis = transition({ child: first, sequence: 0, type: 'genesis' });
  store.recordSourceState({ actor: 'service:source-recorder', traceId: 'trace:first', state: first });
  verifiedDecision(store, t, genesis, 'proposal:linear-genesis');
  store.acceptSourceTransition({
    actor: 'service:source-recorder',
    traceId: 'trace:first-accept',
    transition: genesis,
    childState: first,
    governanceProposalId: 'proposal:linear-genesis'
  });

  const wrongParent = sourceState('wrong-parent');
  const second = sourceState('linear-second');
  store.recordSourceState({ actor: 'service:source-recorder', traceId: 'trace:wrong-parent', state: wrongParent });
  store.recordSourceState({ actor: 'service:source-recorder', traceId: 'trace:second', state: second });
  const badAdvance = transition({
    parent: wrongParent,
    child: second,
    sequence: 1,
    type: 'advance'
  });
  verifiedDecision(store, t, badAdvance, 'proposal:linear-bad');
  assert.throws(() => store.acceptSourceTransition({
    actor: 'service:source-recorder',
    traceId: 'trace:bad-advance',
    transition: badAdvance,
    parentState: wrongParent,
    childState: second,
    governanceProposalId: 'proposal:linear-bad'
  }), /parent is not the current accepted head/);

  assert.equal(store.getSourceContinuity('axiom-mesh').accepted_head_state_digest, first.state_digest);
});
