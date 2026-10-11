import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { DatabaseSync, StatementSync } from 'node:sqlite';
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
import * as Adapter from '../src/grid/semantic-memory-review-evidence.mjs';
import { GridStore } from '../src/grid/store.mjs';
import { AcceptedSocialGridStore } from '../src/grid/accepted-social-store.mjs';

// Deny-only hardening of semantic-memory Grid review evidence.
//
// - The row checker (formerly the exported verifySemanticMemoryGridEvidence)
//   is internal to verifySemanticMemoryReviewFromGrid.
// - A store is genuine only by GridStore's private #brand; the adapter reads
//   the Grid through GridStore and node:sqlite methods captured at load,
//   through a captured Reflect.apply, and the GridStore class chain and the
//   node:sqlite classes are frozen when it loads.
// - Evidence is a frozen object carrying a private #digest stamped by an
//   unexported class; consumers read the digest with
//   semanticMemoryGridEvidenceDigest, which admits that exact object only.
//
// Every must-fail case below is red on b8762186 (main before this change) and
// a deny on this head. Each test restores every global it patches.

const { verifySemanticMemoryReviewFromGrid } = Adapter;
// On b8762186 there is no evidence checker: a consumer reads the digest field.
const evidenceDigest = Adapter.semanticMemoryGridEvidenceDigest
  ?? (evidence => evidence.verified_review_request_digest);
const isEvidence = Adapter.isSemanticMemoryGridEvidence
  ?? (evidence => typeof evidence?.verified_review_request_digest === 'string');
const isGridStore = GridStore.isGridStore ?? (() => undefined);

const SRC_ROOT = fileURLToPath(new URL('../src/', import.meta.url));
const INSTRUCTION_ALLOWED = 'semantic_memory_instruction_allowed';
const NOT_A_GRID_STORE = { name: 'ValidationError', message: 'Semantic memory review verification requires a Grid store' };
const MODIFIED_GRID_STORE = { name: 'ValidationError', message: 'Semantic memory review verification requires an unmodified Grid store' };
const NOT_GRID_EVIDENCE = {
  name: 'ValidationError',
  message: 'Semantic memory Grid evidence was not issued by verifySemanticMemoryReviewFromGrid'
};

async function storeFixture(t, StoreClass = GridStore) {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-semantic-review-bound-'));
  const identity = await ensureMeshIdentity(dataDir, 'grid', { create: true });
  const protector = await loadDataProtector({ dataDir, autoBootstrap: true });
  const store = new StoreClass({ path: join(dataDir, 'grid.sqlite'), dataDir, identity, protector });
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

// The four store reads the adapter makes, serving the fabricated rows.
function forgedReads(rows) {
  return {
    requireIntentEvidenceChain: () => rows.chain,
    getIntent: () => rows.intent,
    decodeEventRow: row => row,
    db: {
      prepare: sql => ({
        all: () => (/kind = 'intent\.accepted' AND actor/.test(sql) ? [rows.events[0]] : rows.events)
      })
    }
  };
}

// Own data properties (a frozen prototype makes inherited methods read-only,
// so plain assignment would throw).
function withOwn(target, properties) {
  for (const [key, value] of Object.entries(properties)) {
    Object.defineProperty(target, key, { value, configurable: true, writable: true, enumerable: true });
  }
  return target;
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

function attempt(fn) {
  try {
    return { ok: true, value: fn() };
  } catch (error) {
    return { ok: false, error };
  }
}

// Every way a caller could turn evidence into instruction use.
function grantsInstruction(record, evidence) {
  const digest = attempt(() => evidenceDigest(evidence));
  if (!digest.ok) return false;
  const lifecycle = createSemanticMemoryLifecycle(record);
  const options = { verified_review_request_digest: digest.value };
  return [
    attempt(() => evaluateSemanticMemoryUse(record, 'privileged-instruction', options)),
    attempt(() => evaluateSemanticMemoryLifecycleUse(record, lifecycle, 'privileged-instruction', options))
  ].some(outcome => outcome.ok && outcome.value?.code === INSTRUCTION_ALLOWED);
}

// The forged evidence a reader could obtain, or the deny it got.
function forgedOutcome(fn) {
  const outcome = attempt(fn);
  return outcome.ok ? { evidence: outcome.value } : { error: outcome.error };
}

async function fixtures(t) {
  const store = await storeFixture(t);
  const genuine = reviewed('memory.genuine', { origin_class: 'remote-agent', origin_principal: 'agent.remote.1' });
  appendCompletedReview(store, genuine);
  const expected = verifySemanticMemoryReviewFromGrid(store, genuine);
  const forged = reviewed('memory.forged');
  return { store, genuine, expected, forged, rows: forgedRows(forged) };
}

// ---------------------------------------------------------------------------
// Store genuineness

test('must-fail: a store built via Object.create(GridStore.prototype) is not a Grid store', async t => {
  const { forged, rows } = await fixtures(t);
  const fake = withOwn(Object.create(GridStore.prototype), forgedReads(rows));
  const outcome = forgedOutcome(() => verifySemanticMemoryReviewFromGrid(fake, forged));
  assert.equal(grantsInstruction(forged, outcome.evidence), false);
  assert.throws(() => { if (outcome.error) throw outcome.error; }, NOT_A_GRID_STORE);
  assert.equal(isGridStore(fake), false);
});

test('must-fail: a Proxy over a real GridStore is not a Grid store', async t => {
  const { store, genuine, forged, rows } = await fixtures(t);
  const reads = forgedReads(rows);
  const proxy = new Proxy(store, {
    get(target, key) {
      if (Object.hasOwn(reads, key)) return reads[key];
      const value = Reflect.get(target, key, target);
      return typeof value === 'function' ? value.bind(target) : value;
    }
  });
  const plain = new Proxy(store, {});
  const outcome = forgedOutcome(() => verifySemanticMemoryReviewFromGrid(proxy, forged));
  assert.equal(grantsInstruction(forged, outcome.evidence), false);
  assert.throws(() => { if (outcome.error) throw outcome.error; }, NOT_A_GRID_STORE);
  // #brand in proxy is false: private names do not pass through a Proxy.
  assert.equal(isGridStore(proxy), false);
  assert.equal(isGridStore(plain), false);
  assert.equal(isGridStore(store), true);
  // Even a transparent Proxy over the genuine store is refused.
  assert.throws(() => verifySemanticMemoryReviewFromGrid(plain, genuine), NOT_A_GRID_STORE);
});

test('must-fail: an instance method or db swap on a genuine GridStore is denied', async t => {
  const { store, expected, genuine, forged, rows } = await fixtures(t);
  const reads = forgedReads(rows);
  for (const keys of [['requireIntentEvidenceChain'], ['getIntent'], ['decodeEventRow'], ['db'], Object.keys(reads)]) {
    const saved = keys.map(key => [key, Object.getOwnPropertyDescriptor(store, key)]);
    for (const key of keys) Object.defineProperty(store, key, { value: reads[key], configurable: true, writable: true });
    let outcome;
    try {
      outcome = forgedOutcome(() => verifySemanticMemoryReviewFromGrid(store, forged));
    } finally {
      for (const [key, descriptor] of saved) {
        if (descriptor) Object.defineProperty(store, key, descriptor);
        else delete store[key];
      }
    }
    assert.equal(grantsInstruction(forged, outcome.evidence), false, keys.join('+'));
    assert.throws(() => { if (outcome.error) throw outcome.error; }, MODIFIED_GRID_STORE, keys.join('+'));
  }
  assert.deepEqual(verifySemanticMemoryReviewFromGrid(store, genuine), expected);
});

test('must-fail: a GridStore.prototype or node:sqlite method swap after load cannot change the result', async t => {
  const { store, expected, genuine, forged, rows } = await fixtures(t);
  const reads = forgedReads(rows);
  const forgedStatement = { all: () => rows.events, get: () => rows.intent };
  const swaps = [
    [GridStore.prototype, 'requireIntentEvidenceChain', reads.requireIntentEvidenceChain],
    [GridStore.prototype, 'getIntent', reads.getIntent],
    [GridStore.prototype, 'decodeEventRow', reads.decodeEventRow],
    [DatabaseSync.prototype, 'prepare', () => forgedStatement],
    [StatementSync.prototype, 'all', () => rows.events],
    [StatementSync.prototype, 'get', () => rows.intent]
  ];
  for (const [prototype, key, replacement] of swaps) {
    const saved = Object.getOwnPropertyDescriptor(prototype, key);
    let swapped = true;
    try {
      Object.defineProperty(prototype, key, { value: replacement, configurable: true, writable: true });
    } catch {
      swapped = false;
    }
    let forgedRun;
    let genuineRun;
    try {
      forgedRun = forgedOutcome(() => verifySemanticMemoryReviewFromGrid(store, forged));
      genuineRun = attempt(() => verifySemanticMemoryReviewFromGrid(store, genuine));
    } finally {
      if (swapped) Object.defineProperty(prototype, key, saved);
    }
    // Frozen at load: the swap itself throws, so nothing changed.
    assert.equal(swapped, false, `${key} could be swapped after load`);
    assert.equal(grantsInstruction(forged, forgedRun.evidence), false, key);
    assert.equal(forgedRun.error?.code, 'semantic_memory_review_evidence_not_found', key);
    assert.deepEqual(genuineRun.value, expected, key);
  }
});

test('must-fail (R1): the Grid store classes cannot be re-parented to stamp the brand', async t => {
  const { store, forged } = await fixtures(t);
  const target = Object.assign({}, forgedReads(forgedRows(forged)));
  const chain = [];
  for (let current = GridStore; typeof current === 'function' && current !== Function.prototype; current = Object.getPrototypeOf(current)) {
    chain.push(current);
  }
  assert.ok(chain.length >= 3, 'GridStore and its base classes');
  for (const StoreClass of chain) {
    const parent = Object.getPrototypeOf(StoreClass);
    let reparented = false;
    try {
      Object.setPrototypeOf(StoreClass, function stamp() { return target; });
      reparented = true;
      // The "super returns an arbitrary object" stamp, if re-parenting worked.
      try { new GridStore({}); } catch {}
    } catch {
      // expected: frozen at load
    } finally {
      if (reparented) Object.setPrototypeOf(StoreClass, parent);
    }
    assert.equal(reparented, false, `${StoreClass.name} could be re-parented after load`);
    assert.ok(Object.isFrozen(StoreClass) && Object.isFrozen(StoreClass.prototype), StoreClass.name);
  }
  assert.equal(isGridStore(target), false);
  assert.throws(() => verifySemanticMemoryReviewFromGrid(target, forged), NOT_A_GRID_STORE);
  assert.equal(isGridStore(store), true);
});

test('must-fail: patched WeakSet/WeakMap.prototype.has cannot admit a fake store or fake evidence', async t => {
  const { store, expected, genuine, forged, rows } = await fixtures(t);
  const fakeStore = forgedReads(rows);
  const fakeEvidence = { ...expected, object_id: forged.object_id, verified_review_request_digest: forged.review_request_digest };
  const saved = [WeakSet.prototype.has, WeakMap.prototype.has];
  let storeRun;
  let evidenceRun;
  let genuineRun;
  WeakSet.prototype.has = () => true;
  WeakMap.prototype.has = () => true;
  try {
    storeRun = forgedOutcome(() => verifySemanticMemoryReviewFromGrid(fakeStore, forged));
    evidenceRun = attempt(() => evidenceDigest(fakeEvidence));
    genuineRun = attempt(() => verifySemanticMemoryReviewFromGrid(store, genuine));
  } finally {
    [WeakSet.prototype.has, WeakMap.prototype.has] = saved;
  }
  assert.equal(grantsInstruction(forged, storeRun.evidence), false);
  assert.throws(() => { if (storeRun.error) throw storeRun.error; }, NOT_A_GRID_STORE);
  assert.equal(grantsInstruction(forged, fakeEvidence), false);
  assert.throws(() => { if (!evidenceRun.ok) throw evidenceRun.error; }, NOT_GRID_EVIDENCE);
  assert.deepEqual(genuineRun.value, expected);
});

test('must-fail: a post-load Function.prototype.call/apply patch leaves a genuine review genuine and fakes denied', async t => {
  const { store, expected, genuine, forged, rows } = await fixtures(t);
  const reads = forgedReads(rows);
  const targets = new Map([
    [GridStore.prototype.requireIntentEvidenceChain, reads.requireIntentEvidenceChain],
    [GridStore.prototype.getIntent, reads.getIntent],
    [GridStore.prototype.decodeEventRow, reads.decodeEventRow],
    [DatabaseSync.prototype.prepare, reads.db.prepare]
  ]);
  const { call, apply } = Function.prototype;
  const reflectApply = Reflect.apply;
  let genuineRun;
  let forgedRun;
  let fakeStoreRun;
  // Forward everything, except that a GridStore/sqlite read invoked through
  // .call/.apply returns the fabricated rows.
  Function.prototype.call = function patchedCall(thisArg, ...args) {
    const swap = targets.get(this);
    return swap ? reflectApply(swap, thisArg, args) : reflectApply(this, thisArg, args);
  };
  Function.prototype.apply = function patchedApply(thisArg, args) {
    const swap = targets.get(this);
    return swap ? reflectApply(swap, thisArg, args ?? []) : reflectApply(this, thisArg, args ?? []);
  };
  try {
    genuineRun = attempt(() => verifySemanticMemoryReviewFromGrid(store, genuine));
    forgedRun = forgedOutcome(() => verifySemanticMemoryReviewFromGrid(store, forged));
    fakeStoreRun = forgedOutcome(() => verifySemanticMemoryReviewFromGrid(withOwn(Object.create(GridStore.prototype), reads), forged));
  } finally {
    Function.prototype.call = call;
    Function.prototype.apply = apply;
  }
  assert.equal(genuineRun.ok, true, genuineRun.error?.stack);
  assert.deepEqual(genuineRun.value, expected);
  assert.equal(grantsInstruction(forged, forgedRun.evidence), false);
  assert.equal(forgedRun.error?.code, 'semantic_memory_review_evidence_not_found');
  assert.equal(grantsInstruction(forged, fakeStoreRun.evidence), false);
  assert.throws(() => { if (fakeStoreRun.error) throw fakeStoreRun.error; }, NOT_A_GRID_STORE);
});

// ---------------------------------------------------------------------------
// Evidence

test('must-fail: a structurally identical hand-built evidence object is not evidence', async t => {
  const { expected, genuine } = await fixtures(t);
  const handBuilt = Object.freeze({
    ...JSON.parse(JSON.stringify(expected)),
    accepted: Object.freeze({ ...expected.accepted }),
    completed: Object.freeze({ ...expected.completed }),
    chain: Object.freeze({ ...expected.chain })
  });
  assert.deepEqual(handBuilt, expected);
  assert.equal(isEvidence(expected), true);
  assert.equal(isEvidence(handBuilt), false);
  assert.equal(grantsInstruction(genuine, handBuilt), false);
  assert.throws(() => evidenceDigest(handBuilt), NOT_GRID_EVIDENCE);
  // The genuine object itself still grants.
  assert.equal(evidenceDigest(expected), genuine.review_request_digest);
  assert.equal(grantsInstruction(genuine, expected), true);
});

test('must-fail: mutated or re-wrapped genuine evidence is not evidence', async t => {
  const { expected, genuine, forged } = await fixtures(t);
  assert.ok(Object.isFrozen(expected));
  assert.throws(() => { 'use strict'; expected.verified_review_request_digest = forged.review_request_digest; }, TypeError);
  assert.equal(Reflect.set(expected, 'verified_review_request_digest', forged.review_request_digest), false);
  const wrapped = [
    ['spread', genuine, { ...expected }],
    ['spread, mutated digest', forged, { ...expected, object_id: forged.object_id, verified_review_request_digest: forged.review_request_digest }],
    ['structuredClone', genuine, structuredClone(expected)],
    ['Object.assign copy', genuine, Object.assign({}, expected)],
    ['Object.create(evidence)', genuine, Object.create(expected)],
    ['Proxy(evidence)', genuine, new Proxy(expected, {})],
    ['Proxy(evidence), mutated digest', forged, new Proxy(expected, {
      get: (target, key) => (key === 'verified_review_request_digest' ? forged.review_request_digest : Reflect.get(target, key))
    })]
  ];
  for (const [label, record, value] of wrapped) {
    assert.equal(isEvidence(value), false, label);
    assert.equal(grantsInstruction(record, value), false, label);
    assert.throws(() => evidenceDigest(value), NOT_GRID_EVIDENCE, label);
  }
  assert.equal(grantsInstruction(genuine, expected), true);
});

// ---------------------------------------------------------------------------
// No export can mint evidence

async function moduleFiles() {
  const files = [];
  const walk = async directory => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (/^semantic-memory-.*\.mjs$/.test(entry.name) || (directory.endsWith(`${'grid'}`) && entry.name.endsWith('.mjs'))) {
        files.push(path);
      }
    }
  };
  await walk(SRC_ROOT);
  return files.sort();
}

test('no export of any semantic-memory or grid module can mint or register evidence', async t => {
  const { store, expected, genuine, forged, rows } = await fixtures(t);
  const handBuilt = Object.freeze({ ...expected });
  const forgedEvidence = Object.freeze({ ...expected, object_id: forged.object_id, verified_review_request_digest: forged.review_request_digest });
  const fakeStore = forgedReads(rows);
  const candidates = [handBuilt, forgedEvidence];
  const argumentLists = [
    [handBuilt], [forgedEvidence], [forgedEvidence, forgedEvidence],
    [fakeStore, forged], [forged, rows], [forged, rows.intent, rows.events, rows.chain],
    [withOwn(Object.create(GridStore.prototype), fakeStore), forged], [handBuilt, forged], [forged, handBuilt], [forged, 'privileged-instruction', handBuilt]
  ];
  const files = await moduleFiles();
  assert.ok(files.some(file => file.endsWith('semantic-memory-review-evidence.mjs')));
  let calls = 0;
  const minted = [];
  for (const file of files) {
    const namespace = await import(pathToFileURL(file).href);
    for (const [name, value] of Object.entries(namespace)) {
      if (typeof value !== 'function') continue;
      // Classes (the Grid store classes) cannot be called without new; their
      // constructors open databases from a path and never return evidence.
      if (/^class\b/.test(Function.prototype.toString.call(value))) continue;
      for (const args of argumentLists) {
        calls += 1;
        const outcome = attempt(() => value(...args));
        const returned = outcome.ok ? outcome.value : undefined;
        if (returned && typeof returned.then === 'function') returned.then(() => {}, () => {});
        const id = `${file.slice(SRC_ROOT.length)}#${name}`;
        if (isEvidence(returned) && !(name === 'verifySemanticMemoryReviewFromGrid' && args[0] === store && args[1] === genuine)) {
          minted.push(id);
        }
        if (outcome.ok && returned && typeof returned === 'object') {
          for (const field of Object.values(returned)) if (isEvidence(field)) minted.push(`${id} (field)`);
        }
      }
      // Nothing an export was handed became evidence.
      for (const candidate of candidates) assert.equal(isEvidence(candidate), false, `${name} registered evidence`);
    }
  }
  assert.ok(calls > 0);
  assert.deepEqual(minted, []);
  // The sanctioned path: a genuine store and a genuinely reviewed record.
  const fresh = verifySemanticMemoryReviewFromGrid(store, genuine);
  assert.equal(isEvidence(fresh), true);
  assert.notEqual(fresh, expected);
  assert.deepEqual(fresh, expected);
  // The evidence exposes no route to the minting class.
  assert.equal(Object.getPrototypeOf(expected), Object.prototype);
  assert.equal(expected.constructor, Object);
});

// ---------------------------------------------------------------------------
// Genuine reviews are unchanged

test('green: a genuine GridStore review still verifies and grants exactly as before', async t => {
  const store = await storeFixture(t);
  const record = reviewed('memory.genuine', { origin_class: 'remote-agent', origin_principal: 'agent.remote.1' });
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
    verified_review_request_digest: evidenceDigest(evidence)
  }), {
    allow: true,
    code: INSTRUCTION_ALLOWED,
    provenance_digest: record.provenance_digest,
    review_request_digest: record.review_request_digest,
    lifecycle_digest: lifecycle.lifecycle_digest
  });
});

test('green: the server store class (AcceptedSocialGridStore, a GridStore subclass) verifies a genuine review', async t => {
  const store = await storeFixture(t, AcceptedSocialGridStore);
  const record = reviewed('memory.server-store');
  appendCompletedReview(store, record);
  assert.equal(isGridStore(store) ?? true, true);
  const evidence = verifySemanticMemoryReviewFromGrid(store, record);
  assert.equal(evidenceDigest(evidence), record.review_request_digest);
  assert.equal(grantsInstruction(record, evidence), true);
});

test('must-fail: an instance swap of a subclass-only method on the server store class is denied', async t => {
  const store = await storeFixture(t, AcceptedSocialGridStore);
  const record = reviewed('memory.server-store.swap');
  appendCompletedReview(store, record);
  const gridStoreMembers = new Set();
  for (let prototype = GridStore.prototype; prototype !== Object.prototype; prototype = Object.getPrototypeOf(prototype)) {
    for (const key of Reflect.ownKeys(prototype)) gridStoreMembers.add(key);
  }
  let subclassOnly;
  for (let prototype = AcceptedSocialGridStore.prototype; !subclassOnly && prototype !== GridStore.prototype; prototype = Object.getPrototypeOf(prototype)) {
    subclassOnly = Reflect.ownKeys(prototype).find(key =>
      key !== 'constructor' && !gridStoreMembers.has(key)
      && typeof Object.getOwnPropertyDescriptor(prototype, key).value === 'function');
  }
  assert.ok(subclassOnly, 'a method defined only by the subclass');
  Object.defineProperty(store, subclassOnly, { value: () => undefined, configurable: true, writable: true });
  try {
    assert.throws(() => verifySemanticMemoryReviewFromGrid(store, record), MODIFIED_GRID_STORE);
  } finally {
    delete store[subclassOnly];
  }
  assert.equal(evidenceDigest(verifySemanticMemoryReviewFromGrid(store, record)), record.review_request_digest);
});

test('red/green: the Grid row checker is exported by no semantic-memory module', async () => {
  for (const file of await moduleFiles()) {
    if (!/semantic-memory-/.test(file)) continue;
    const namespace = await import(pathToFileURL(file).href);
    assert.ok(!Object.hasOwn(namespace, 'verifySemanticMemoryGridEvidence'), `${file} exports the row checker`);
  }
  assert.deepEqual(Object.keys(await import('../src/lib/semantic-memory-grid-evidence.mjs')).sort(),
    ['SEMANTIC_MEMORY_GRID_EVIDENCE_SCHEMA', 'recordedSemanticMemoryReviewIntent']);
  assert.deepEqual(Object.keys(Adapter).sort(),
    ['isSemanticMemoryGridEvidence', 'semanticMemoryGridEvidenceDigest', 'verifySemanticMemoryReviewFromGrid']);
});
