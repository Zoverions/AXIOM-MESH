import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { digestObject, sha256 } from '../src/lib/canonical.mjs';
import { ensureMeshIdentity } from '../src/lib/identity.mjs';
import { loadDataProtector } from '../src/lib/protector.mjs';
import { intentRequestDigest } from '../src/lib/intent-binding.mjs';
import {
  evaluateSemanticMemoryUse,
  normalizeSemanticMemoryProvenance,
  ownerReviewSemanticMemory,
  semanticMemoryReviewRequestDigest,
  verifySemanticMemoryReviewedFromProvenance
} from '../src/lib/semantic-memory-provenance.mjs';
import {
  recordedSemanticMemoryReviewIntent,
  verifySemanticMemoryGridEvidence
} from '../src/lib/semantic-memory-grid-evidence.mjs';
import { verifySemanticMemoryReviewFromGrid } from '../src/grid/semantic-memory-review-evidence.mjs';
import { GridStore } from '../src/grid/store.mjs';

async function storeFixture(t) {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-semantic-review-'));
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

function reviewedInstruction() {
  const base = normalizeSemanticMemoryProvenance({
    object_id: 'memory.remote.review-fixture',
    owner: 'owner.alice',
    content_digest: sha256('semantic content'),
    origin_class: 'remote-agent',
    origin_principal: 'agent.remote.1',
    origin_artifact_digest: sha256('remote receipt'),
    semantic_class: 'instruction-candidate'
  });
  return ownerReviewSemanticMemory(base, {
    actor_id: base.owner,
    review_request_digest: semanticMemoryReviewRequestDigest(base, 'approve-instruction'),
    decision: 'approve-instruction'
  });
}

function appendAccepted(store, record, {
  intentId = 'intent.semantic.review.1',
  traceId = 'trace.semantic.review.1',
  actor = record.owner,
  principal = record.owner,
  principalType = 'human',
  action,
  requestDigest,
  inputDigest
} = {}) {
  const reviewIntent = recordedSemanticMemoryReviewIntent(record);
  store.appendEvents({
    traceId,
    actor,
    events: [{
      kind: 'intent.accepted',
      subject: intentId,
      payload: {
        intent_id: intentId,
        principal,
        principal_type: principalType,
        action: action ?? reviewIntent.action,
        risk: 'low',
        input_digest: inputDigest ?? digestObject(reviewIntent.input),
        request_digest: requestDigest ?? intentRequestDigest(reviewIntent)
      }
    }]
  });
  return { intentId, traceId, reviewIntent };
}

function appendCompleted(store, record, {
  intentId = 'intent.semantic.review.1',
  traceId = 'trace.semantic.review.1',
  actor = record.owner,
  resultTraceId = traceId
} = {}) {
  const result = {
    intent_id: intentId,
    trace_id: resultTraceId,
    status: 'completed'
  };
  store.appendEvents({
    traceId,
    actor,
    events: [{
      kind: 'intent.completed',
      subject: intentId,
      payload: { intent_id: intentId, result }
    }]
  });
  return result;
}

function appendDenied(store, record, {
  intentId = 'intent.semantic.review.1',
  traceId = 'trace.semantic.review.1'
} = {}) {
  store.appendEvents({
    traceId,
    actor: record.owner,
    events: [{
      kind: 'intent.denied',
      subject: intentId,
      payload: {
        intent_id: intentId,
        error: { code: 'policy_denied', message: 'denied for fixture' }
      }
    }]
  });
}

function intentEvents(store, intentId) {
  return store.db.prepare(`
    SELECT * FROM events
    WHERE subject = ?
      AND kind IN ('intent.accepted', 'intent.completed', 'intent.denied', 'intent.failed')
    ORDER BY seq
  `).all(intentId).map(row => store.decodeEventRow(row));
}

test('completed owner review becomes verified Grid evidence and can unlock semantic instruction use', async t => {
  const store = await storeFixture(t);
  const record = reviewedInstruction();
  const { intentId, traceId } = appendAccepted(store, record);
  appendCompleted(store, record, { intentId, traceId });

  const evidence = verifySemanticMemoryReviewFromGrid(store, record);
  assert.equal(evidence.owner, record.owner);
  assert.equal(evidence.object_id, record.object_id);
  assert.equal(evidence.review_decision, 'approve-instruction');
  assert.equal(evidence.verified_review_request_digest, record.review_request_digest);
  assert.equal(evidence.intent_id, intentId);
  assert.equal(evidence.trace_id, traceId);
  assert.equal(evidence.downstream_effect_authorized, false);

  const decision = evaluateSemanticMemoryUse(record, 'privileged-instruction', {
    verified_review_request_digest: evidence.verified_review_request_digest
  });
  assert.equal(decision.allow, true);
});

test('accepted review without completion is not verified authority evidence', async t => {
  const store = await storeFixture(t);
  const record = reviewedInstruction();
  appendAccepted(store, record);

  assert.throws(
    () => verifySemanticMemoryReviewFromGrid(store, record),
    error => error?.code === 'semantic_memory_review_not_completed'
  );
});

test('a denied review request cannot masquerade as owner review evidence', async t => {
  const store = await storeFixture(t);
  const record = reviewedInstruction();
  const { intentId, traceId } = appendAccepted(store, record);
  appendDenied(store, record, { intentId, traceId });

  assert.throws(
    () => verifySemanticMemoryReviewFromGrid(store, record),
    error => error?.code === 'semantic_memory_review_not_completed'
  );
});

test('a later completed retry can verify the same exact review request after an earlier denial', async t => {
  const store = await storeFixture(t);
  const record = reviewedInstruction();
  appendAccepted(store, record, {
    intentId: 'intent.semantic.review.denied',
    traceId: 'trace.semantic.review.denied'
  });
  appendDenied(store, record, {
    intentId: 'intent.semantic.review.denied',
    traceId: 'trace.semantic.review.denied'
  });
  appendAccepted(store, record, {
    intentId: 'intent.semantic.review.completed',
    traceId: 'trace.semantic.review.completed'
  });
  appendCompleted(store, record, {
    intentId: 'intent.semantic.review.completed',
    traceId: 'trace.semantic.review.completed'
  });

  const evidence = verifySemanticMemoryReviewFromGrid(store, record);
  assert.equal(evidence.intent_id, 'intent.semantic.review.completed');
});

test('the Grid adapter rejects a matching digest with the wrong action binding', async t => {
  const store = await storeFixture(t);
  const record = reviewedInstruction();
  const { intentId, traceId } = appendAccepted(store, record, {
    action: 'memory.put'
  });
  appendCompleted(store, record, { intentId, traceId });

  assert.throws(
    () => verifySemanticMemoryReviewFromGrid(store, record),
    /invalid principal or action/
  );
});

test('event trace substitution is rejected even when materialized intent is completed', async t => {
  const store = await storeFixture(t);
  const record = reviewedInstruction();
  const { intentId, traceId } = appendAccepted(store, record);
  appendCompleted(store, record, {
    intentId,
    traceId: 'trace.semantic.review.other',
    resultTraceId: traceId
  });

  assert.throws(
    () => verifySemanticMemoryReviewFromGrid(store, record),
    /ordering or actor\/trace binding is invalid/
  );
});

test('low-level verifier rejects caller-supplied terminal ambiguity', async t => {
  const store = await storeFixture(t);
  const record = reviewedInstruction();
  const { intentId, traceId } = appendAccepted(store, record);
  appendCompleted(store, record, { intentId, traceId });

  const intent = store.getIntent(intentId);
  const events = intentEvents(store, intentId);
  events.push({
    ...events[1],
    kind: 'intent.failed',
    payload: {
      intent_id: intentId,
      error: { code: 'synthetic', message: 'ambiguous terminal' }
    }
  });
  assert.throws(
    () => verifySemanticMemoryGridEvidence(record, {
      intent,
      events,
      chain: store.verifyFullChain()
    }),
    /denied or failed terminal event/
  );
});

test('full-chain corruption prevents the Grid adapter from issuing verified review evidence', async t => {
  const store = await storeFixture(t);
  const record = reviewedInstruction();
  const { intentId, traceId } = appendAccepted(store, record);
  appendCompleted(store, record, { intentId, traceId });

  store.db.prepare(`
    UPDATE events SET event_hash = ? WHERE seq = 1
  `).run('0'.repeat(64));

  assert.throws(
    () => verifySemanticMemoryReviewFromGrid(store, record),
    error => error?.code === 'integrity_verification_failed'
  );
});

test('recorded review intent reconstructs the exact owner request from post-review provenance', () => {
  const record = reviewedInstruction();
  const intent = recordedSemanticMemoryReviewIntent(record);
  assert.deepEqual(intent.principal, { type: 'human', id: record.owner });
  assert.equal(intent.action, 'memory.semantic.review');
  assert.equal(intent.input.object_id, record.object_id);
  assert.equal(intent.input.content_digest, record.content_digest);
  assert.equal(intent.input.current_provenance_digest, record.reviewed_from_provenance_digest);
  assert.equal(intent.input.decision, record.review_decision);
  assert.equal(intentRequestDigest(intent), record.review_request_digest);
});

// #1918 standing rule (new exports enter the hostile-input baseline at 0):
// the record is rejected on first contact, before any trap, getter or
// Array.isArray can run. These are the 3 pairs #1144 had listed.
test('grid evidence rejects a Proxy or accessor record before any trap or getter runs', async () => {
  const { throwingProxy, recordingProxy, revokedProxy, createCounter } = await import('../test-support/hostile-input-contract.mjs');
  const valid = reviewedInstruction();
  for (const [name, make] of [
    ['throwing-proxy', counter => throwingProxy({}, counter)],
    ['recording-proxy', counter => recordingProxy({}, counter)],
    ['revoked-proxy', () => revokedProxy({})],
    // The same wrappers around a valid reviewed record: rejection does not
    // depend on the wrapped content being invalid.
    ['recording-proxy(valid record)', counter => recordingProxy({ ...valid }, counter)],
    ['revoked-proxy(valid record)', () => revokedProxy({ ...valid })]
  ]) {
    const counter = createCounter();
    assert.throws(
      () => verifySemanticMemoryGridEvidence(make(counter), {}),
      error => error.name === 'ValidationError' && /found a Proxy/.test(error.message),
      name
    );
    assert.equal(counter.traps, 0, `${name}: no trap may run`);
  }
  let getterRuns = 0;
  const accessor = { ...valid };
  Object.defineProperty(accessor, 'owner', { enumerable: true, get() { getterRuns += 1; return valid.owner; } });
  assert.throws(() => verifySemanticMemoryGridEvidence(accessor, {}), /found an accessor property/);
  assert.equal(getterRuns, 0);
});

// #1918 residual (b): every field the verifier reads from options, chain,
// intent, events, payloads and the result must be an own property. Each case
// removes one own field, plants the correct value on a polluted prototype,
// and expects a deny (or, for output-only fields, the inherited value ignored).
function withPrototypeValue(prototype, key, value, run) {
  const saved = Object.getOwnPropertyDescriptor(prototype, key);
  Object.defineProperty(prototype, key, { value, configurable: true, writable: true, enumerable: false });
  try {
    return run();
  } finally {
    if (saved) Object.defineProperty(prototype, key, saved);
    else delete prototype[key];
  }
}

test('grid evidence reads options, chain, intent and event fields as own properties only', async t => {
  const store = await storeFixture(t);
  const record = reviewedInstruction();
  const { intentId, traceId } = appendAccepted(store, record);
  appendCompleted(store, record, { intentId, traceId });
  const json = value => JSON.parse(JSON.stringify(value));
  const intent = json(store.getIntent(intentId));
  const events = json(intentEvents(store, intentId));
  const chain = json(store.verifyFullChain());
  const fresh = () => ({ intent: json(intent), events: json(events), chain: json(chain) });
  const verify = options => verifySemanticMemoryGridEvidence(record, options);
  const ok = verify(fresh());
  assert.equal(ok.intent_id, intentId);
  assert.ok(Array.isArray(chain.events) || chain.events !== undefined);

  const denied = [];
  const thrown = run => { try { run(); } catch (error) { return error; } assert.fail('expected a deny'); };
  // Polluted, the input is denied like the same input with the field absent:
  // a ValidationError, or the CanonicalJsonError a missing result_json raises.
  // (Polluting a key the provenance record also reads, such as
  // request_digest, can deny earlier, inside the record normalizer.)
  const expectDeny = (label, options, prototype, key, value) => {
    const absent = thrown(() => verify(json(options)));
    const polluted = withPrototypeValue(prototype, key, value, () => thrown(() => verify(options)));
    assert.equal(polluted.name, absent.name, label);
    assert.ok(['ValidationError', 'CanonicalJsonError'].includes(polluted.name), label);
    denied.push(label);
  };
  // The reported hole: chain.valid inherited from Object.prototype.
  for (const key of ['valid', 'head']) {
    const options = fresh();
    delete options.chain[key];
    expectDeny(`chain.${key}`, options, Object.prototype, key, chain[key]);
  }
  for (const key of ['intent', 'events', 'chain']) {
    const options = fresh();
    const value = options[key];
    delete options[key];
    expectDeny(`options.${key}`, options, Object.prototype, key, value);
  }
  for (const key of ['intent_id', 'trace_id', 'principal', 'action', 'status', 'request_digest', 'input_digest', 'result_json']) {
    const options = fresh();
    delete options.intent[key];
    expectDeny(`intent.${key}`, options, Object.prototype, key, intent[key]);
  }
  for (const [index, name] of [[0, 'accepted'], [1, 'completed']]) {
    for (const key of ['kind', 'seq', 'actor', 'trace_id', 'subject', 'payload']) {
      const options = fresh();
      delete options.events[index][key];
      expectDeny(`${name}.${key}`, options, Object.prototype, key, events[index][key]);
    }
  }
  for (const key of ['intent_id', 'principal', 'principal_type', 'action', 'request_digest', 'input_digest']) {
    const options = fresh();
    delete options.events[0].payload[key];
    expectDeny(`accepted.payload.${key}`, options, Object.prototype, key, events[0].payload[key]);
  }
  for (const key of ['intent_id', 'result']) {
    const options = fresh();
    delete options.events[1].payload[key];
    expectDeny(`completed.payload.${key}`, options, Object.prototype, key, events[1].payload[key]);
  }
  for (const key of ['intent_id', 'trace_id', 'status']) {
    const options = fresh();
    delete options.events[1].payload.result[key];
    expectDeny(`result.${key}`, options, Object.prototype, key, events[1].payload.result[key]);
    // The same field also absent from the materialized result_json, so the
    // canonical comparison agrees and only the own read can deny.
    const matched = fresh();
    delete matched.events[1].payload.result[key];
    delete matched.intent.result_json[key];
    expectDeny(`result.${key} (result_json matched)`, matched, Object.prototype, key, events[1].payload.result[key]);
  }
  {
    // A hole in the events array filled from a polluted Array.prototype.
    const options = fresh();
    const completed = options.events[1];
    options.events.length = 1;
    options.events.length = 2;
    expectDeny('events[1] inherited', options, Array.prototype, 1, completed);
  }
  {
    const options = fresh();
    const accepted = options.events[0];
    delete options.events[0];
    expectDeny('events[0] inherited', options, Array.prototype, 0, accepted);
  }
  assert.equal(denied.length, 41);

  // Output-only fields: an inherited value is ignored, never copied out.
  for (const [label, mutate, key, value, read] of [
    ['chain.events', options => delete options.chain.events, 'events', ['forged'], result => result.chain.events],
    ['accepted.event_id', options => delete options.events[0].event_id, 'event_id', 'evt.forged', result => result.accepted.event_id],
    ['accepted.event_hash', options => delete options.events[0].event_hash, 'event_hash', 'f'.repeat(64), result => result.accepted.event_hash],
    ['completed.event_id', options => delete options.events[1].event_id, 'event_id', 'evt.forged', result => result.completed.event_id],
    ['completed.event_hash', options => delete options.events[1].event_hash, 'event_hash', 'f'.repeat(64), result => result.completed.event_hash]
  ]) {
    const options = fresh();
    mutate(options);
    const result = withPrototypeValue(Object.prototype, key, value, () => verify(options));
    assert.equal(read(result), undefined, label);
  }
  // Unpolluted own data verifies exactly as before.
  assert.deepEqual(verify(fresh()), ok);
});

test('grid evidence own reads do not depend on Object.prototype and can only add denies', async t => {
  const store = await storeFixture(t);
  const record = reviewedInstruction();
  const { intentId, traceId } = appendAccepted(store, record);
  appendCompleted(store, record, { intentId, traceId });
  const json = value => JSON.parse(JSON.stringify(value));
  const intent = json(store.getIntent(intentId));
  const events = json(intentEvents(store, intentId));
  const chain = json(store.verifyFullChain());
  const fresh = () => ({ intent: json(intent), events: json(events), chain: json(chain) });
  const verify = options => verifySemanticMemoryGridEvidence(record, options);
  const ok = verify(fresh());
  // A field inherited from an object's own prototype (no global pollution;
  // request_digest is also a provenance-record field, so it is tested here).
  const inheritOne = (object, key) => {
    const { [key]: value, ...rest } = object;
    return Object.assign(Object.create({ [key]: value }), rest);
  };
  for (const [label, build] of [
    ['intent.request_digest', options => { options.intent = inheritOne(options.intent, 'request_digest'); }],
    ['accepted.payload.request_digest', options => { options.events[0].payload = inheritOne(options.events[0].payload, 'request_digest'); }],
    ['chain.valid', options => { options.chain = inheritOne(options.chain, 'valid'); }],
    ['accepted.kind', options => { options.events[0] = inheritOne(options.events[0], 'kind'); }]
  ]) {
    const options = fresh();
    build(options);
    assert.throws(() => verify(options), { name: 'ValidationError' }, label);
  }
  // Inherited entries and kinds still count toward the single accepted and
  // completed event and the adverse-event check, so they can only deny.
  for (const [label, extra] of [
    ['extra inherited accepted', Object.create({ kind: 'intent.accepted' })],
    ['extra inherited completed', Object.create({ kind: 'intent.completed' })],
    ['extra inherited failed', Object.create({ kind: 'intent.failed' })],
    ['extra inherited denied', Object.create({ kind: 'intent.denied' })]
  ]) {
    const options = fresh();
    options.events.push(extra);
    assert.throws(() => verify(options), { name: 'ValidationError' }, label);
  }
  {
    const options = fresh();
    options.events.length = 3;
    withPrototypeValue(Array.prototype, 2, { kind: 'intent.failed' }, () => {
      assert.throws(() => verify(options), /denied or failed terminal event/);
    });
  }
  // Own data in any container the old reads accepted still verifies exactly,
  // including a function object carrying own event fields.
  const asFunction = Object.assign(function event() {}, json(events[0]));
  const options = fresh();
  options.events[0] = asFunction;
  assert.deepEqual(verify(options), ok);
  assert.deepEqual(verify({ ...fresh(), chain: Object.assign(Object.create(null), json(chain)) }), ok);
});

// ---------------------------------------------------------------------------
// #1937: the review binds the claimed reviewed_from_provenance_digest; the
// reviewed record's own pre-review fields must reproduce it.

const REATTRIBUTIONS = [
  ['origin_principal', { origin_principal: 'agent.remote.evil' }],
  ['origin_artifact_digest', { origin_artifact_digest: sha256('forged receipt') }],
  ['origin_class (tool-output)', { origin_class: 'tool-output' }],
  ['origin_class (retrieved-external)', { origin_class: 'retrieved-external' }],
  ['origin_class (owner-authored)', { origin_class: 'owner-authored', origin_principal: 'owner.alice', origin_artifact_digest: undefined }],
  ['ingestion_intent_id', { ingestion_intent_id: 'intent.ingest.forged' }],
  ['origin_runtime_id', { origin_runtime_id: 'runtime.forged' }],
  ['request_digest', { request_digest: sha256('forged request') }],
  ['origin_principal + origin_artifact_digest', { origin_principal: 'agent.remote.evil', origin_artifact_digest: sha256('forged receipt') }],
  ['origin_class + origin_principal + ingestion_intent_id', { origin_class: 'tool-output', origin_principal: 'agent.remote.evil', ingestion_intent_id: 'intent.ingest.forged' }],
  ['all four origin fields', { origin_class: 'retrieved-external', origin_principal: 'agent.remote.evil', origin_artifact_digest: sha256('forged receipt'), ingestion_intent_id: 'intent.ingest.forged' }]
];
const PROVENANCE_MISMATCH = /reviewed_from_provenance_digest does not match the record's own pre-review provenance/;

function reattributed(record, change) {
  const { provenance_digest: _digest, ...fields } = record;
  const next = { ...fields, ...change };
  for (const key of Object.keys(next)) if (next[key] === undefined) delete next[key];
  // Still a self-consistent record with the original review evidence.
  const normalized = normalizeSemanticMemoryProvenance(next);
  assert.equal(normalized.review_request_digest, record.review_request_digest);
  assert.equal(normalized.reviewed_from_provenance_digest, record.reviewed_from_provenance_digest);
  return normalized;
}

test('#1937: a real GridStore review still verifies and recomputes its pre-review provenance', async t => {
  const store = await storeFixture(t);
  const record = reviewedInstruction();
  const { intentId, traceId } = appendAccepted(store, record);
  appendCompleted(store, record, { intentId, traceId });
  assert.deepEqual(verifySemanticMemoryReviewedFromProvenance(record), {
    object_id: record.object_id,
    reviewed_from_provenance_digest: record.reviewed_from_provenance_digest,
    pre_review_provenance_verified: true
  });
  const evidence = verifySemanticMemoryReviewFromGrid(store, record);
  assert.equal(evidence.verified_review_request_digest, record.review_request_digest);
  assert.equal(evaluateSemanticMemoryUse(record, 'privileged-instruction', {
    verified_review_request_digest: evidence.verified_review_request_digest
  }).allow, true);
});

test('#1937: a reviewed record whose origin was changed after review is denied by Grid verification and use', async t => {
  const store = await storeFixture(t);
  const record = reviewedInstruction();
  const { intentId, traceId } = appendAccepted(store, record);
  appendCompleted(store, record, { intentId, traceId });
  const evidence = verifySemanticMemoryReviewFromGrid(store, record);
  const events = intentEvents(store, intentId);
  const intent = store.getIntent(intentId);
  const chain = store.requireIntentEvidenceChain();
  for (const [label, change] of REATTRIBUTIONS) {
    const forged = reattributed(record, change);
    assert.throws(() => verifySemanticMemoryReviewedFromProvenance(forged),
      error => error.name === 'ValidationError' && PROVENANCE_MISMATCH.test(error.message), label);
    assert.throws(() => verifySemanticMemoryReviewFromGrid(store, forged),
      error => error.name === 'ValidationError' && PROVENANCE_MISMATCH.test(error.message), label);
    assert.throws(() => verifySemanticMemoryGridEvidence(forged, { intent, events, chain }),
      error => error.name === 'ValidationError' && PROVENANCE_MISMATCH.test(error.message), label);
    // Even with the genuine record's verified request digest, use is denied.
    assert.deepEqual(evaluateSemanticMemoryUse(forged, 'privileged-instruction', {
      verified_review_request_digest: evidence.verified_review_request_digest
    }), { allow: false, code: 'semantic_memory_review_provenance_mismatch' }, label);
  }
});

test('#1937: semantic_class changes after review are denied (control, and approve-memory)', async t => {
  const store = await storeFixture(t);
  const record = reviewedInstruction();
  const { provenance_digest: _digest, ...fields } = record;
  // Already caught before #1937 for approve-instruction, by the outcome check.
  assert.throws(() => normalizeSemanticMemoryProvenance({ ...fields, semantic_class: 'knowledge' }),
    /Approve-instruction review evidence does not match the resulting state/);

  const base = normalizeSemanticMemoryProvenance({
    object_id: 'memory.remote.knowledge-fixture',
    owner: 'owner.alice',
    content_digest: sha256('knowledge content'),
    origin_class: 'remote-agent',
    origin_principal: 'agent.remote.1',
    origin_artifact_digest: sha256('remote receipt'),
    semantic_class: 'knowledge'
  });
  const approved = ownerReviewSemanticMemory(base, {
    actor_id: base.owner,
    review_request_digest: semanticMemoryReviewRequestDigest(base, 'approve-memory'),
    decision: 'approve-memory'
  });
  appendAccepted(store, approved, { intentId: 'intent.semantic.review.mem', traceId: 'trace.semantic.review.mem' });
  appendCompleted(store, approved, { intentId: 'intent.semantic.review.mem', traceId: 'trace.semantic.review.mem' });
  assert.equal(verifySemanticMemoryReviewFromGrid(store, approved).review_decision, 'approve-memory');
  for (const [label, change] of [
    ['semantic_class', { semantic_class: 'procedure' }],
    ['origin_principal', { origin_principal: 'agent.remote.evil' }]
  ]) {
    const forged = reattributed(approved, change);
    assert.throws(() => verifySemanticMemoryReviewFromGrid(store, forged), PROVENANCE_MISMATCH, label);
  }
});

test('#1937: every consistent first review verifies; a re-review of a reviewed record fails closed', () => {
  let count = 0;
  for (const origin of ['owner-authored', 'local-model-generated', 'remote-agent', 'tool-output', 'system-derived']) {
    for (const semantic of ['knowledge', 'instruction-candidate']) {
      for (const explicitUntrusted of [false, true]) {
        const base = normalizeSemanticMemoryProvenance({
          object_id: `memory.${origin}.${semantic}`,
          owner: 'owner.alice',
          content_digest: sha256(`content ${origin} ${semantic}`),
          origin_class: origin,
          semantic_class: semantic,
          ...(origin === 'owner-authored' ? {} : { origin_artifact_digest: sha256('artifact') }),
          ...(origin === 'local-model-generated' ? { origin_runtime_id: 'runtime.local.1' } : {}),
          ...(origin === 'remote-agent' ? { origin_principal: 'agent.remote.1' } : {}),
          ...(origin === 'system-derived' ? {
            parent_object_id: 'memory.parent',
            parent_content_digest: sha256('parent'),
            parent_provenance_digest: sha256('parent provenance')
          } : {}),
          ingestion_intent_id: 'intent.ingest.1',
          request_digest: sha256('request'),
          ...(explicitUntrusted ? { authority_tier: 'untrusted-data', review_state: 'unreviewed' } : {})
        });
        for (const decision of ['approve-memory', 'approve-instruction', 'quarantine', 'reject']) {
          if (decision === 'approve-instruction' && semantic !== 'instruction-candidate') continue;
          const reviewed = ownerReviewSemanticMemory(base, {
            actor_id: 'owner.alice',
            review_request_digest: semanticMemoryReviewRequestDigest(base, decision),
            decision
          });
          assert.equal(verifySemanticMemoryReviewedFromProvenance(reviewed).pre_review_provenance_verified, true);
          count += 1;
        }
      }
    }
  }
  assert.equal(count, 70);
  // A re-review is still created and normalizes, but its reviewed_from digest
  // is the earlier reviewed record's, whose review evidence the new record
  // does not carry, so it cannot be recomputed and fails closed.
  const first = reviewedInstruction();
  const again = ownerReviewSemanticMemory(first, {
    actor_id: first.owner,
    review_request_digest: semanticMemoryReviewRequestDigest(first, 'quarantine'),
    decision: 'quarantine'
  });
  assert.equal(again.reviewed_from_provenance_digest, first.provenance_digest);
  assert.throws(() => verifySemanticMemoryReviewedFromProvenance(again), PROVENANCE_MISMATCH);
  assert.equal(evaluateSemanticMemoryUse(again, 'ordinary-retrieval').code, 'semantic_memory_quarantined');
  // A record without explicit review evidence has nothing to recompute.
  assert.throws(() => verifySemanticMemoryReviewedFromProvenance(normalizeSemanticMemoryProvenance({
    object_id: 'memory.unreviewed', owner: 'owner.alice', content_digest: sha256('x'),
    origin_class: 'tool-output', origin_artifact_digest: sha256('y'), semantic_class: 'knowledge'
  })), /no explicit owner review evidence/);
});
