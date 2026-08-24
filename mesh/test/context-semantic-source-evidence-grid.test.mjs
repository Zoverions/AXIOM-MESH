import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { ensureMeshIdentity } from '../src/lib/identity.mjs';
import { loadDataProtector } from '../src/lib/protector.mjs';
import { LOCAL_CONTEXT_CANDIDATE_SCHEMA } from '../src/lib/context-claim-resolution.mjs';
import {
  createLocalContextSemanticSourceEvidence,
  localContextSemanticSourceEvidenceMemoryDigest,
  projectLocalContextSemanticSourceEvidenceMemoryPut
} from '../src/lib/context-semantic-source-evidence.mjs';
import {
  getCurrentLocalContextSemanticSourceEvidence
} from '../src/grid/context-semantic-source-evidence.mjs';
import { GridStore } from '../src/grid/store.mjs';
import { executeBuiltin } from '../src/sandbox/executor.mjs';

function candidate({
  claimId = 'claim.semantic.source.grid.1',
  value = { preference: 'concise' }
} = {}) {
  return {
    schema: LOCAL_CONTEXT_CANDIDATE_SCHEMA,
    claim_id: claimId,
    owner_subject_ref: 'owner.alice',
    semantic_type: 'preference.communication-style',
    value,
    disclosure_type: 'verbatim-approved',
    sensitivity: 'ordinary-private',
    confidence: 0.9,
    limitations: 'Fixture data for retained semantic source evidence.',
    source_vault_id: 'vault.personal',
    source_resource_refs: ['resource.external.note.1'],
    observed_at: '2026-08-24T12:00:00.000Z',
    valid_from: '2026-08-24T12:00:00.000Z',
    valid_until: null,
    supersedes: [],
    contradicts: [],
    authority_effect: 'none'
  };
}

async function fixture(t) {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-context-semantic-source-grid-'));
  const identity = await ensureMeshIdentity(dataDir, 'grid', { create: true });
  const protector = await loadDataProtector({ dataDir, autoBootstrap: true });
  const store = new GridStore({
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

function persistSourceEvidence(store, value, {
  sourceClass = 'retrieved-external',
  sourceArtifactDigest = 'b'.repeat(64),
  traceId = 'trace.semantic.source.grid.1'
} = {}) {
  const evidence = createLocalContextSemanticSourceEvidence(value, {
    source_class: sourceClass,
    source_artifact_digest: sourceArtifactDigest
  });
  const input = projectLocalContextSemanticSourceEvidenceMemoryPut(evidence);
  const execution = executeBuiltin({
    tool: 'builtin.validate-mutation',
    intent: {
      action: 'memory.put',
      principal: { id: value.owner_subject_ref, type: 'human' },
      input
    }
  });
  const [event] = store.appendEvents({
    traceId,
    actor: value.owner_subject_ref,
    events: [execution.mutation]
  });
  return {
    evidence,
    input,
    mutation: execution.mutation,
    event,
    memoryDigest: localContextSemanticSourceEvidenceMemoryDigest(evidence)
  };
}

function tombstone(store, owner, objectId) {
  const execution = executeBuiltin({
    tool: 'builtin.validate-mutation',
    intent: {
      action: 'memory.tombstone',
      principal: { id: owner, type: 'human' },
      input: {
        object_id: objectId,
        reason: 'semantic source evidence fixture tombstone'
      }
    }
  });
  store.appendEvents({
    traceId: 'trace.semantic.source.grid.tombstone',
    actor: owner,
    events: [execution.mutation]
  });
}

test('retained source evidence resolves through ordinary content-addressed Grid memory', async t => {
  const store = await fixture(t);
  const value = candidate();
  const persisted = persistSourceEvidence(store, value);

  assert.equal(persisted.mutation.payload.content_digest, persisted.memoryDigest);
  assert.equal(persisted.mutation.subject, `memory_${persisted.memoryDigest}`);

  const current = getCurrentLocalContextSemanticSourceEvidence(store, {
    owner: value.owner_subject_ref,
    candidate: value,
    sourceEvidenceDigest: persisted.memoryDigest,
    beforeSeq: persisted.event.seq + 1
  });
  assert.deepEqual(current.evidence, persisted.evidence);
  assert.equal(current.memory_digest, persisted.memoryDigest);
  assert.equal(current.object_id, persisted.mutation.subject);
  assert.equal(current.source_event_seq, persisted.event.seq);
  assert.equal(current.equivalent_source_events, 1);
  assert.equal(current.current_source_evidence_verified, true);
  assert.equal(current.full_grid_chain_verified, true);
  assert.equal(current.downstream_effect_authorized, false);
});

test('exact source-evidence memory.put retry is equivalent rather than ambiguous', async t => {
  const store = await fixture(t);
  const value = candidate();
  const persisted = persistSourceEvidence(store, value);
  const retry = executeBuiltin({
    tool: 'builtin.validate-mutation',
    intent: {
      action: 'memory.put',
      principal: { id: value.owner_subject_ref, type: 'human' },
      input: persisted.input
    }
  });
  store.appendEvents({
    traceId: 'trace.semantic.source.grid.retry',
    actor: value.owner_subject_ref,
    events: [retry.mutation]
  });

  const current = getCurrentLocalContextSemanticSourceEvidence(store, {
    owner: value.owner_subject_ref,
    candidate: value,
    sourceEvidenceDigest: persisted.memoryDigest
  });
  assert.equal(current.equivalent_source_events, 2);
  assert.equal(current.source_event_seq, persisted.event.seq);
});

test('source evidence must predate the semantic state it is intended to ground', async t => {
  const store = await fixture(t);
  const value = candidate();
  const persisted = persistSourceEvidence(store, value);

  assert.doesNotThrow(() => getCurrentLocalContextSemanticSourceEvidence(store, {
    owner: value.owner_subject_ref,
    candidate: value,
    sourceEvidenceDigest: persisted.memoryDigest,
    beforeSeq: persisted.event.seq + 1
  }));
  assert.throws(
    () => getCurrentLocalContextSemanticSourceEvidence(store, {
      owner: value.owner_subject_ref,
      candidate: value,
      sourceEvidenceDigest: persisted.memoryDigest,
      beforeSeq: persisted.event.seq
    }),
    error => error?.code === 'context_semantic_source_evidence_postdates_state'
  );
});

test('tombstoned source evidence cannot support current semantic context', async t => {
  const store = await fixture(t);
  const value = candidate();
  const persisted = persistSourceEvidence(store, value);
  tombstone(store, value.owner_subject_ref, persisted.mutation.subject);

  assert.throws(
    () => getCurrentLocalContextSemanticSourceEvidence(store, {
      owner: value.owner_subject_ref,
      candidate: value,
      sourceEvidenceDigest: persisted.memoryDigest
    }),
    error => error?.code === 'context_semantic_source_evidence_tombstoned'
  );
});

test('candidate substitution and owner substitution cannot reuse retained source evidence', async t => {
  const store = await fixture(t);
  const value = candidate();
  const persisted = persistSourceEvidence(store, value);

  assert.throws(
    () => getCurrentLocalContextSemanticSourceEvidence(store, {
      owner: value.owner_subject_ref,
      candidate: candidate({ value: { preference: 'verbose' } }),
      sourceEvidenceDigest: persisted.memoryDigest
    }),
    /candidate/i
  );
  assert.throws(
    () => getCurrentLocalContextSemanticSourceEvidence(store, {
      owner: 'owner.bob',
      candidate: value,
      sourceEvidenceDigest: persisted.memoryDigest
    }),
    /owner/i
  );
});

test('full Grid-chain corruption blocks retained semantic source evidence', async t => {
  const store = await fixture(t);
  const value = candidate();
  const persisted = persistSourceEvidence(store, value);
  store.db.prepare('UPDATE events SET event_hash = ? WHERE event_id = ?')
    .run('f'.repeat(64), persisted.event.event_id);

  assert.throws(
    () => getCurrentLocalContextSemanticSourceEvidence(store, {
      owner: value.owner_subject_ref,
      candidate: value,
      sourceEvidenceDigest: persisted.memoryDigest
    }),
    error => error?.code === 'integrity_verification_failed'
  );
});
