import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { sha256 } from '../src/lib/canonical.mjs';
import { ensureMeshIdentity } from '../src/lib/identity.mjs';
import { loadDataProtector } from '../src/lib/protector.mjs';
import {
  buildObservedSemanticMemorySourceEvidence
} from '../src/lib/semantic-memory-source-evidence.mjs';
import {
  SEMANTIC_MEMORY_SOURCE_EVENT,
  SemanticMemorySourceEvidenceGridStore
} from '../src/grid/semantic-memory-source-evidence-store.mjs';

async function storeFixture(t) {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-semantic-source-evidence-'));
  const identity = await ensureMeshIdentity(dataDir, 'grid', { create: true });
  const protector = await loadDataProtector({ dataDir, autoBootstrap: true });
  const store = new SemanticMemorySourceEvidenceGridStore({
    path: join(dataDir, 'grid.sqlite'),
    dataDir,
    identity,
    protector
  });
  t.after(async () => {
    store.close();
    await rm(dataDir, { recursive: true, force: true });
  });
  return store;
}

function sourceEvidence(overrides = {}) {
  return buildObservedSemanticMemorySourceEvidence({
    owner: 'owner.alice',
    source_class: 'remote-agent',
    source_principal: 'agent.remote.7',
    source_artifact_digest: sha256('remote agent artifact'),
    content: { text: 'External semantic candidate.' },
    semantic_class: 'instruction-candidate',
    ...overrides
  });
}

test('Grid retains one signed owner-scoped non-authorizing source observation', async t => {
  const store = await storeFixture(t);
  const evidence = sourceEvidence();
  const recorded = store.recordSemanticMemorySourceEvidence({
    traceId: 'trace.semantic.source.1',
    actor: evidence.owner,
    evidence
  });

  assert.equal(recorded.evidence.evidence_digest, evidence.evidence_digest);
  assert.equal(recorded.exact_replay, false);
  assert.equal(recorded.downstream_effect_authorized, false);

  const retained = store.getSemanticMemorySourceEvidence(
    evidence.owner,
    evidence.evidence_digest
  );
  assert.deepEqual(retained.evidence, evidence);
  assert.equal(retained.downstream_effect_authorized, false);
  assert.equal(store.db.prepare(`
    SELECT COUNT(*) AS count FROM events
    WHERE kind = ? AND subject = ?
  `).get(SEMANTIC_MEMORY_SOURCE_EVENT, evidence.evidence_digest).count, 1);

  assert.equal(store.listMemory(evidence.owner, evidence.owner).objects.length, 0);
  assert.equal(store.db.prepare(`
    SELECT COUNT(*) AS count FROM semantic_memory_provenance_state
  `).get().count, 0);
});

test('exact source observation replay is idempotent and does not append duplicate history', async t => {
  const store = await storeFixture(t);
  const evidence = sourceEvidence();
  const first = store.recordSemanticMemorySourceEvidence({
    traceId: 'trace.semantic.source.replay.1',
    actor: evidence.owner,
    evidence
  });
  const replay = store.recordSemanticMemorySourceEvidence({
    traceId: 'trace.semantic.source.replay.2',
    actor: evidence.owner,
    evidence
  });

  assert.equal(replay.exact_replay, true);
  assert.equal(replay.source_event_id, first.source_event_id);
  assert.equal(replay.source_seq, first.source_seq);
  assert.equal(store.db.prepare(`
    SELECT COUNT(*) AS count FROM events
    WHERE kind = ? AND subject = ?
  `).get(SEMANTIC_MEMORY_SOURCE_EVENT, evidence.evidence_digest).count, 1);
});

test('cross-owner source evidence recording and retrieval fail closed', async t => {
  const store = await storeFixture(t);
  const evidence = sourceEvidence();

  assert.throws(
    () => store.recordSemanticMemorySourceEvidence({
      traceId: 'trace.semantic.source.cross-owner',
      actor: 'owner.bob',
      evidence
    }),
    /actor must equal the local memory owner observer/
  );

  store.recordSemanticMemorySourceEvidence({
    traceId: 'trace.semantic.source.owner',
    actor: evidence.owner,
    evidence
  });
  assert.throws(
    () => store.getSemanticMemorySourceEvidence(
      'owner.bob',
      evidence.evidence_digest
    ),
    /not owned by the requesting observer/
  );
});

test('generic event append cannot forge a semantic source observation', async t => {
  const store = await storeFixture(t);
  const evidence = sourceEvidence();

  assert.throws(
    () => store.appendEvents({
      traceId: 'trace.semantic.source.bare',
      actor: evidence.owner,
      events: [{
        kind: SEMANTIC_MEMORY_SOURCE_EVENT,
        subject: evidence.evidence_digest,
        payload: { evidence }
      }]
    }),
    /rejects bare source-observation append/
  );
  assert.equal(store.db.prepare(`
    SELECT COUNT(*) AS count FROM events WHERE kind = ?
  `).get(SEMANTIC_MEMORY_SOURCE_EVENT).count, 0);
});

test('source evidence status makes verification and authority non-claims explicit', async t => {
  const store = await storeFixture(t);
  const status = store.getStatus().semantic_memory_source_evidence;

  assert.equal(status.activation_state, 'opt-in-local-laboratory');
  assert.equal(status.evidence_basis, 'owner-observed-artifact');
  assert.equal(status.source_identity_verified, false);
  assert.equal(status.artifact_authenticity_verified, false);
  assert.equal(status.non_authorizing, true);
  assert.equal(status.raw_source_bytes_retained, false);
  assert.equal(status.memory_write_authority, false);
  assert.equal(status.provider_trust_imported, false);
  assert.equal(status.public_routes, false);
  assert.equal(status.production_store_selected, false);
});
