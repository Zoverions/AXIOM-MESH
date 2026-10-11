import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';

import { digestObject, sha256 } from '../src/lib/canonical.mjs';
import { ensureMeshIdentity } from '../src/lib/identity.mjs';
import { loadDataProtector } from '../src/lib/protector.mjs';
import { intentRequestDigest } from '../src/lib/intent-binding.mjs';
import {
  evaluateSemanticMemoryUse,
  normalizeSemanticMemoryProvenance,
  ownerReviewSemanticMemory,
  semanticMemoryReviewRequestDigest
} from '../src/lib/semantic-memory-provenance.mjs';
import {
  createSemanticMemoryLifecycle,
  evaluateSemanticMemoryLifecycleUse
} from '../src/lib/semantic-memory-lifecycle.mjs';
import { recordedSemanticMemoryReviewIntent } from '../src/lib/semantic-memory-grid-evidence.mjs';
import { verifySemanticMemoryReviewFromGrid } from '../src/grid/semantic-memory-review-evidence.mjs';
import { GridStore } from '../src/grid/store.mjs';

// Deny-only hardening: the Grid row checker (formerly the exported
// verifySemanticMemoryGridEvidence) does not read the Grid, so rows built from
// a forged record alone passed it and yielded semantic_memory_instruction_allowed.
// It is now internal to verifySemanticMemoryReviewFromGrid, which reads the
// rows from a GridStore itself and rejects a store-shaped object. Genuine
// GridStore reviews verify and grant exactly as before.

const SRC_ROOT = fileURLToPath(new URL('../src/', import.meta.url));
const INSTRUCTION_ALLOWED = 'semantic_memory_instruction_allowed';

async function storeFixture(t) {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-semantic-review-bound-'));
  const identity = await ensureMeshIdentity(dataDir, 'grid', { create: true });
  const protector = await loadDataProtector({ dataDir, autoBootstrap: true });
  const store = new GridStore({ path: join(dataDir, 'grid.sqlite'), dataDir, identity, protector });
  t.after(async () => {
    store.close();
    await rm(dataDir, { recursive: true, force: true });
  });
  return store;
}

function reviewed(objectId, origin = {}) {
  const base = normalizeSemanticMemoryProvenance({
    object_id: objectId,
    owner: 'owner.alice',
    content_digest: sha256(`content ${objectId}`),
    origin_class: 'retrieved-external',
    origin_artifact_digest: sha256(`source ${objectId}`),
    semantic_class: 'instruction-candidate',
    ...origin
  });
  return ownerReviewSemanticMemory(base, {
    actor_id: base.owner,
    review_request_digest: semanticMemoryReviewRequestDigest(base, 'approve-instruction'),
    decision: 'approve-instruction'
  });
}

// Grid rows fabricated from the record alone (the retrieval-audit probe).
function forgedRows(record) {
  const reviewIntent = recordedSemanticMemoryReviewIntent(record);
  const requestDigest = intentRequestDigest(reviewIntent);
  const inputDigest = digestObject(reviewIntent.input);
  const intentId = 'intent.fabricated';
  const traceId = 'trace.fabricated';
  const result = { intent_id: intentId, trace_id: traceId, status: 'completed' };
  const accepted = {
    kind: 'intent.accepted', seq: 1, actor: record.owner, trace_id: traceId, subject: intentId,
    payload: {
      intent_id: intentId, principal: record.owner, principal_type: 'human',
      action: reviewIntent.action, request_digest: requestDigest, input_digest: inputDigest
    }
  };
  const completed = {
    kind: 'intent.completed', seq: 2, actor: record.owner, trace_id: traceId, subject: intentId,
    payload: { intent_id: intentId, result }
  };
  return {
    intent: {
      intent_id: intentId, trace_id: traceId, principal: record.owner, action: reviewIntent.action,
      status: 'completed', request_digest: requestDigest, input_digest: inputDigest, result_json: result
    },
    events: [accepted, completed],
    chain: { valid: true, head: sha256('fabricated head'), events: 2 }
  };
}

// A store-shaped object that serves the fabricated rows to the adapter.
function storeShaped({ intent, events, chain }) {
  return {
    requireIntentEvidenceChain: () => chain,
    getIntent: () => intent,
    decodeEventRow: row => row,
    db: {
      prepare: sql => ({
        all: () => (/kind = 'intent\.accepted' AND actor/.test(sql) ? [events[0]] : events)
      })
    }
  };
}

function appendCompletedReview(store, record, intentId = 'intent.semantic.review.genuine') {
  const traceId = `trace.${intentId}`;
  const reviewIntent = recordedSemanticMemoryReviewIntent(record);
  store.appendEvents({
    traceId,
    actor: record.owner,
    events: [{
      kind: 'intent.accepted',
      subject: intentId,
      payload: {
        intent_id: intentId,
        principal: record.owner,
        principal_type: 'human',
        action: reviewIntent.action,
        risk: 'low',
        input_digest: digestObject(reviewIntent.input),
        request_digest: intentRequestDigest(reviewIntent)
      }
    }]
  });
  store.appendEvents({
    traceId,
    actor: record.owner,
    events: [{
      kind: 'intent.completed',
      subject: intentId,
      payload: { intent_id: intentId, result: { intent_id: intentId, trace_id: traceId, status: 'completed' } }
    }]
  });
  return { intentId, traceId };
}

async function srcModules(directory = SRC_ROOT) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await srcModules(path));
    else if (/^semantic-memory-.*\.mjs$/.test(entry.name)) files.push(path);
  }
  return files.sort();
}

function attempt(fn, args) {
  try {
    return { ok: true, value: fn(...args) };
  } catch (error) {
    return { ok: false, error };
  }
}

function grantsInstruction(record, digest) {
  if (typeof digest !== 'string') return false;
  const lifecycle = createSemanticMemoryLifecycle(record);
  return [
    attempt(evaluateSemanticMemoryUse, [record, 'privileged-instruction', { verified_review_request_digest: digest }]),
    attempt(evaluateSemanticMemoryLifecycleUse, [record, lifecycle, 'privileged-instruction', { verified_review_request_digest: digest }])
  ].some(outcome => outcome.ok && outcome.value?.code === INSTRUCTION_ALLOWED);
}

test('red/green: the Grid row checker is exported by no semantic-memory module', async () => {
  const exported = {};
  for (const file of await srcModules()) {
    const namespace = await import(pathToFileURL(file).href);
    exported[file.slice(SRC_ROOT.length).replaceAll('\\', '/')] = Object.keys(namespace).sort();
  }
  for (const [file, names] of Object.entries(exported)) {
    assert.ok(!names.includes('verifySemanticMemoryGridEvidence'), `${file} exports the row checker`);
  }
  // The modules that carry Grid evidence export nothing that takes rows.
  assert.deepEqual(exported['lib/semantic-memory-grid-evidence.mjs'],
    ['SEMANTIC_MEMORY_GRID_EVIDENCE_SCHEMA', 'recordedSemanticMemoryReviewIntent']);
  assert.deepEqual(exported['grid/semantic-memory-review-evidence.mjs'], ['verifySemanticMemoryReviewFromGrid']);
});

test('red/green: rows forged from a record alone produce no verification or instruction_allowed through any export', async t => {
  const store = await storeFixture(t);
  const forged = reviewed('memory.forged');
  // A genuine review of a different record sits in the store.
  const other = reviewed('memory.other');
  appendCompletedReview(store, other);
  const rows = forgedRows(forged);
  // The record's own claims alone never grant (precondition, unchanged).
  assert.equal(evaluateSemanticMemoryUse(forged, 'privileged-instruction').code, 'semantic_memory_review_evidence_unverified');

  const argumentShapes = [
    [forged, rows],
    [forged, { ...rows }],
    [forged, rows.intent, rows.events, rows.chain],
    [storeShaped(rows), forged],
    [Object.assign(Object.create(null), storeShaped(rows)), forged],
    [store, forged],
    [forged, store],
    [store, forged, rows]
  ];
  let probed = 0;
  for (const file of await srcModules()) {
    const namespace = await import(pathToFileURL(file).href);
    for (const [name, fn] of Object.entries(namespace)) {
      if (typeof fn !== 'function') continue;
      for (const args of argumentShapes) {
        probed += 1;
        const outcome = attempt(fn, args);
        if (!outcome.ok) continue;
        const value = outcome.value;
        assert.notEqual(value?.code, INSTRUCTION_ALLOWED, name);
        assert.equal(typeof value?.verified_review_request_digest, 'undefined', `${name} verified forged rows`);
        assert.equal(grantsInstruction(forged, value?.verified_review_request_digest), false, name);
      }
    }
  }
  assert.ok(probed > 0);

  // The adapter rejects the store-shaped object outright (it accepted it and
  // returned verified evidence before this change) ...
  assert.throws(() => verifySemanticMemoryReviewFromGrid(storeShaped(rows), forged),
    { name: 'TypeError', message: 'Semantic memory review verification requires a Grid store' });
  for (const notAStore of [null, undefined, {}, rows, Object.create(null)]) {
    assert.throws(() => verifySemanticMemoryReviewFromGrid(notAStore, forged), TypeError);
  }
  // ... and a GridStore that holds no review of the record has no evidence.
  assert.throws(() => verifySemanticMemoryReviewFromGrid(store, forged),
    error => error?.code === 'semantic_memory_review_evidence_not_found');
});

test('green: a genuine GridStore review still verifies and grants exactly as before', async t => {
  const store = await storeFixture(t);
  const record = reviewed('memory.genuine', {
    origin_class: 'remote-agent',
    origin_principal: 'agent.remote.1'
  });
  const { intentId, traceId } = appendCompletedReview(store, record);
  const evidence = verifySemanticMemoryReviewFromGrid(store, record);
  const chain = store.requireIntentEvidenceChain();
  const [accepted, completed] = store.db.prepare(
    'SELECT * FROM events WHERE subject = ? ORDER BY seq'
  ).all(intentId).map(row => store.decodeEventRow(row));
  assert.deepEqual(evidence, {
    schema: 'axiom-semantic-memory-grid-evidence.v1',
    owner: record.owner,
    object_id: record.object_id,
    review_decision: 'approve-instruction',
    verified_review_request_digest: record.review_request_digest,
    intent_id: intentId,
    trace_id: traceId,
    accepted: { seq: accepted.seq, event_id: accepted.event_id, event_hash: accepted.event_hash },
    completed: { seq: completed.seq, event_id: completed.event_id, event_hash: completed.event_hash },
    chain: { valid: true, head: chain.head, events: chain.events },
    downstream_effect_authorized: false
  });
  assert.ok(Object.isFrozen(evidence));
  assert.deepEqual(evaluateSemanticMemoryUse(record, 'privileged-instruction', {
    verified_review_request_digest: evidence.verified_review_request_digest
  }), {
    allow: true,
    code: INSTRUCTION_ALLOWED,
    provenance_digest: record.provenance_digest,
    review_request_digest: record.review_request_digest
  });
  const lifecycle = createSemanticMemoryLifecycle(record);
  assert.deepEqual(evaluateSemanticMemoryLifecycleUse(record, lifecycle, 'privileged-instruction', {
    verified_review_request_digest: evidence.verified_review_request_digest
  }), {
    allow: true,
    code: INSTRUCTION_ALLOWED,
    provenance_digest: record.provenance_digest,
    review_request_digest: record.review_request_digest,
    lifecycle_digest: lifecycle.lifecycle_digest
  });
});
