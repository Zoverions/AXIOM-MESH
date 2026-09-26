import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { canonicalize, sha256 } from '../src/lib/canonical.mjs';
// Read-only use of the live identifier-local key. The live consumption path is
// not modified; the lab only demonstrates what that key alone would permit.
import { capabilityConsumptionEventId } from '../src/lib/capability-consumption.mjs';
import {
  LabJsonNumber,
  SEMANTIC_EFFECT_CANONICALIZATION_VERSION,
  buildSemanticAuthorizationInstance,
  buildSemanticEffectProfile,
  canonicalSemanticEffect,
  createInMemorySemanticLabStore,
  createSemanticActionConsumptionLab,
  parseStrictJson,
  semanticAuthorizationInstanceDigest,
  validateSemanticAuthorizationInstance
} from '../src/lib/semantic-action-consumption-lab.mjs';

const NOW = Date.parse('2026-09-26T12:00:00.000Z');
const ISSUED = '2026-09-26T11:00:00.000Z';
const EXPIRES = '2026-09-26T13:00:00.000Z';
const PROFILE = buildSemanticEffectProfile({
  action: 'school.grade.write',
  mcp_tool_name: 'record_grade',
  consequential: true,
  parameters: { student_id: 'id', course_id: 'id', grade: 'decimal', comment: 'text', notify_guardian: 'boolean' }
});
const PROFILES = [PROFILE];

function structuredInput(parameters = {}, overrides = {}) {
  return {
    action: 'school.grade.write',
    purpose: 'term-grade-entry',
    destination: 'sis.example-school',
    object: 'gradebook/term-3',
    parameters: {
      student_id: 'student-042',
      course_id: 'math-7',
      grade: '90',
      comment: 'Café project complete',
      notify_guardian: true,
      ...parameters
    },
    ...overrides
  };
}

function structuredEffect(parameters, overrides) {
  return {
    canonicalization_version: SEMANTIC_EFFECT_CANONICALIZATION_VERSION,
    protocol: 'axiom.structured-effect.v0',
    input: structuredInput(parameters, overrides)
  };
}

function mcpEffect({ id = 1, meta, args = {} } = {}) {
  const params = {
    name: 'record_grade',
    arguments: {
      notify_guardian: true,
      comment: 'Café project complete',
      grade: 90,
      course_id: 'math-7',
      student_id: 'student-042',
      ...args
    }
  };
  if (meta) params._meta = meta;
  return {
    canonicalization_version: SEMANTIC_EFFECT_CANONICALIZATION_VERSION,
    protocol: 'mcp.tools-call.v0',
    input: {
      message: { jsonrpc: '2.0', id, method: 'tools/call', params },
      purpose: 'term-grade-entry',
      destination: 'sis.example-school',
      object: 'gradebook/term-3'
    }
  };
}

const EFFECT_DIGEST = canonicalSemanticEffect(structuredEffect(), PROFILES).effect_identity_digest;

function instanceDocument({ id = 'authz-grade-1', mandate = 'mandate-1', budget = 1, effectDigest = EFFECT_DIGEST } = {}) {
  return buildSemanticAuthorizationInstance({
    authorization_instance_id: id,
    mandate_digest: sha256(`explicit-human-mandate:${mandate}`),
    principal_id: 'teacher.rivera',
    effect_identity_digest: effectDigest,
    execution_budget: budget,
    issued_at: ISSUED,
    expires_at: EXPIRES
  });
}

let tokenCounter = 0;
function freshToken({ instanceId = 'authz-grade-1', holder = 'agent.main', effectDigest = EFFECT_DIGEST, jti } = {}) {
  tokenCounter += 1;
  return {
    jti: jti ?? `jti-fresh-${tokenCounter}`,
    nonce: `nonce-fresh-${tokenCounter}`,
    holder_id: holder,
    authorization_instance_id: instanceId,
    effect_identity_digest: effectDigest,
    issued_at: ISSUED,
    expires_at: EXPIRES
  };
}

function newLab(store, options = {}) {
  return createSemanticActionConsumptionLab({ store, profiles: PROFILES, now: () => NOW, ...options });
}

async function registeredLab({ store = createInMemorySemanticLabStore(), budget = 1, options } = {}) {
  const lab = newLab(store, options);
  const registered = await lab.registerAuthorizationInstance(instanceDocument({ budget }));
  assert.equal(registered.decision, 'registered');
  return { lab, store };
}

// A downstream sink. Idempotent sinks dedupe on the supplied key; others mutate
// on every delivery. `mutations` counts real external writes.
function createSink({ idempotent }) {
  const seen = new Set();
  const sink = {
    mutations: 0,
    deliver(key) {
      if (idempotent && seen.has(key)) return 'deduplicated';
      seen.add(key);
      sink.mutations += 1;
      return 'mutated';
    }
  };
  return sink;
}

async function executeAdmitted(lab, decision, sink, outcome = 'committed') {
  assert.equal(decision.decision, 'admit');
  const dispatch = await lab.beginDispatch({
    authorization_instance_id: decision.receipt.authorization_instance_id,
    receipt_id: decision.receipt.receipt_id
  });
  assert.equal(dispatch.decision, 'dispatch');
  sink.deliver(dispatch.idempotency_key);
  const recorded = await lab.recordSinkOutcome({
    authorization_instance_id: decision.receipt.authorization_instance_id,
    receipt_id: decision.receipt.receipt_id,
    outcome
  });
  assert.equal(recorded.decision, 'recorded');
  return recorded.receipt;
}

// Identifier-local baseline: a parameter-bound, expiring, single-use token
// consumed durably under the live key capabilityConsumptionEventId(jti). This is
// the "one-shot token" shape from the issue; it is RED on semantic replay.
function createJtiKeyedBaseline(store) {
  return {
    async admit({ presentation, effect }) {
      const digest = canonicalSemanticEffect(effect, PROFILES).effect_identity_digest;
      if (digest !== presentation.effect_identity_digest) return { decision: 'deny', perform: false };
      if (!(Date.parse(presentation.issued_at) <= NOW && NOW < Date.parse(presentation.expires_at))) {
        return { decision: 'deny', perform: false };
      }
      const eventId = capabilityConsumptionEventId(presentation.jti);
      const key = `baseline:${eventId}`;
      if (await store.read(key)) return { decision: 'deny', perform: false, reason: 'capability_consumed' };
      if (!(await store.compareAndSwap(key, 0, { consumed: true }))) {
        return { decision: 'deny', perform: false, reason: 'capability_consumed' };
      }
      return { decision: 'admit', perform: true, idempotency_key: eventId };
    }
  };
}

async function baselineExecute(baseline, presentation, effect, sink) {
  const decision = await baseline.admit({ presentation, effect });
  if (decision.perform) sink.deliver(decision.idempotency_key);
  return decision;
}

function sqliteStore(path) {
  const db = new DatabaseSync(path, { timeout: 5_000 });
  let closed = false;
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('CREATE TABLE IF NOT EXISTS lab_state (key TEXT PRIMARY KEY, version INTEGER NOT NULL, value TEXT NOT NULL)');
  const select = db.prepare('SELECT version, value FROM lab_state WHERE key = ?');
  const insert = db.prepare('INSERT INTO lab_state (key, version, value) VALUES (?, 1, ?) ON CONFLICT(key) DO NOTHING');
  const update = db.prepare('UPDATE lab_state SET version = version + 1, value = ? WHERE key = ? AND version = ?');
  return {
    read(key) {
      const row = select.get(key);
      return row ? { version: Number(row.version), value: JSON.parse(row.value) } : null;
    },
    compareAndSwap(key, expectedVersion, value) {
      const text = JSON.stringify(canonicalize(value));
      const result = expectedVersion === 0 ? insert.run(key, text) : update.run(text, key, expectedVersion);
      return Number(result.changes) === 1;
    },
    close() {
      if (closed) return;
      closed = true;
      db.close();
    }
  };
}

function barrier(parties) {
  let arrived = 0;
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  return async () => {
    arrived += 1;
    if (arrived >= parties) release();
    await gate;
  };
}

// Every opened SQLite store is closed before the directory is removed, so
// Windows can unlink the database files (EBUSY otherwise).
async function sqliteLedgerDir(t) {
  const dir = await mkdtemp(join(tmpdir(), 'axiom-semantic-lab-'));
  const path = join(dir, 'ledger.sqlite');
  const opened = [];
  t.after(async () => {
    for (const store of opened) store.close();
    await rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  });
  return {
    open() {
      const store = sqliteStore(path);
      opened.push(store);
      return store;
    }
  };
}

// ---------------------------------------------------------------------------
// Fixture 1: fresh-token semantic replay (and replan with a new nonce)
// ---------------------------------------------------------------------------

test('F1 fresh-token semantic replay: jti-keyed baseline performs A twice; lab returns the prior committed receipt', async () => {
  const baselineSink = createSink({ idempotent: false });
  const baseline = createJtiKeyedBaseline(createInMemorySemanticLabStore());
  const first = freshToken();
  const replanned = freshToken();
  assert.notEqual(first.nonce, replanned.nonce);
  assert.equal((await baselineExecute(baseline, first, structuredEffect(), baselineSink)).perform, true);
  assert.equal((await baselineExecute(baseline, replanned, structuredEffect(), baselineSink)).perform, true);
  assert.equal(baselineSink.mutations, 2, 'RED: identifier-local consumption lets a fresh token repeat A');

  const { lab } = await registeredLab();
  const sink = createSink({ idempotent: false });
  const admitted = await lab.admit({ presentation: freshToken(), effect: structuredEffect() });
  const committed = await executeAdmitted(lab, admitted, sink);
  assert.equal(committed.effect_committed, 'yes');
  const replay = await lab.admit({ presentation: freshToken(), effect: structuredEffect() });
  assert.equal(replay.decision, 'prior_receipt');
  assert.equal(replay.perform, false);
  assert.equal(replay.reason, 'semantic_budget_exhausted');
  assert.equal(replay.receipt.receipt_id, committed.receipt_id);
  assert.equal(replay.receipt.lifecycle_state, 'effect_committed');
  assert.equal(sink.mutations, 1, 'GREEN: durable semantic consumption performs A once');
});

test('F1 token_unused stays a separate predicate: a literal token replay is refused by both models without consuming budget', async () => {
  const baseline = createJtiKeyedBaseline(createInMemorySemanticLabStore());
  const token = freshToken();
  assert.equal((await baseline.admit({ presentation: token, effect: structuredEffect() })).perform, true);
  assert.equal((await baseline.admit({ presentation: token, effect: structuredEffect() })).perform, false);

  const { lab } = await registeredLab({ budget: 2 });
  const sink = createSink({ idempotent: false });
  const literal = freshToken();
  const admitted = await lab.admit({ presentation: literal, effect: structuredEffect() });
  await executeAdmitted(lab, admitted, sink);
  const replay = await lab.admit({ presentation: literal, effect: structuredEffect() });
  assert.equal(replay.decision, 'prior_receipt');
  assert.equal(replay.reason, 'token_replayed');
  assert.equal(replay.receipt.admissions_consumed, 1, 'literal replay does not consume the remaining budget');
  const second = await lab.admit({ presentation: freshToken(), effect: structuredEffect() });
  assert.equal(second.decision, 'admit', 'remaining budget (2) is still usable by a distinct token');
  assert.equal(second.receipt.admission_ordinal, 2);
  const third = await lab.admit({ presentation: freshToken(), effect: structuredEffect() });
  assert.notEqual(third.decision, 'admit', 'a fresh token never replenishes the budget');
});

// ---------------------------------------------------------------------------
// Fixture 2: concurrent reissuance across evaluators / replicas
// ---------------------------------------------------------------------------

test('F2 concurrent reissuance: two fresh tokens raced through two evaluators admit at most the budget', async () => {
  const baselineStore = createInMemorySemanticLabStore();
  const baselineA = createJtiKeyedBaseline(baselineStore);
  const baselineB = createJtiKeyedBaseline(baselineStore);
  const baselineResults = await Promise.all([
    baselineA.admit({ presentation: freshToken(), effect: structuredEffect() }),
    baselineB.admit({ presentation: freshToken(), effect: mcpEffect() })
  ]);
  assert.equal(baselineResults.filter(result => result.perform).length, 2, 'RED: both racers admitted');

  const store = createInMemorySemanticLabStore();
  await newLab(store).registerAuthorizationInstance(instanceDocument());
  const arrive = barrier(2);
  const interleave = async ({ label, attempt }) => { if (label === 'admit' && attempt === 0) await arrive(); };
  const evaluatorA = newLab(store, { interleave });
  const evaluatorB = newLab(store, { interleave });
  const results = await Promise.all([
    evaluatorA.admit({ presentation: freshToken({ holder: 'worker.a' }), effect: structuredEffect() }),
    evaluatorB.admit({ presentation: freshToken({ holder: 'worker.b' }), effect: mcpEffect() })
  ]);
  assert.equal(results.filter(result => result.perform).length, 1, 'GREEN: CAS serializes the stale readers');
  assert.equal(results.filter(result => result.decision === 'deny').length, 1);
});

test('F2 concurrent reissuance: budget 2 with six racers across two SQLite replicas admits exactly two over time', async t => {
  const ledger = await sqliteLedgerDir(t);
  const replicaA = ledger.open();
  const replicaB = ledger.open();
  await newLab(replicaA).registerAuthorizationInstance(instanceDocument({ budget: 2 }));
  const arrive = barrier(6);
  const interleave = async ({ label, attempt }) => { if (label === 'admit' && attempt === 0) await arrive(); };
  const racers = Array.from({ length: 6 }, (_, index) => {
    const lab = newLab(index % 2 ? replicaB : replicaA, { interleave });
    return lab.admit({ presentation: freshToken({ holder: `worker.${index}` }), effect: structuredEffect() });
  });
  const round = await Promise.all(racers);
  assert.equal(round.filter(result => result.perform).length, 1, 'unresolved prior admission blocks the second unit');
  const sink = createSink({ idempotent: false });
  await executeAdmitted(newLab(replicaA), round.find(result => result.perform), sink);
  const later = await Promise.all(Array.from({ length: 4 }, (_, index) => newLab(index % 2 ? replicaB : replicaA)
    .admit({ presentation: freshToken(), effect: structuredEffect() })));
  const admitted = later.filter(result => result.perform);
  assert.equal(admitted.length, 1);
  await executeAdmitted(newLab(replicaB), admitted[0], sink);
  const exhausted = await newLab(replicaB).admit({ presentation: freshToken(), effect: structuredEffect() });
  assert.equal(exhausted.decision, 'prior_receipt');
  assert.equal(exhausted.receipt.admissions_consumed, 2);
  assert.equal(sink.mutations, 2, 'never more than the authorized budget');
});

test('F2 RT-CONC-011 falsifier: per-evaluator serialization without an atomic shared CAS double-admits', async () => {
  const shared = createInMemorySemanticLabStore();
  // Blind write: ignores the version it read (a per-process lock cannot help).
  const blind = {
    read: key => shared.read(key),
    compareAndSwap: (key, _expected, value) => shared.compareAndSwap(key, shared.read(key)?.version ?? 0, value)
  };
  await newLab(shared).registerAuthorizationInstance(instanceDocument());
  const arrive = barrier(2);
  const interleave = async ({ label, attempt }) => { if (label === 'admit' && attempt === 0) await arrive(); };
  const results = await Promise.all([
    newLab(blind, { interleave }).admit({ presentation: freshToken(), effect: structuredEffect() }),
    newLab(blind, { interleave }).admit({ presentation: freshToken(), effect: structuredEffect() })
  ]);
  assert.equal(results.filter(result => result.perform).length, 2, 'RED without atomic compare-and-swap');
});

// ---------------------------------------------------------------------------
// Fixture 3: canonicalization equivalence and fail-closed ambiguity
// ---------------------------------------------------------------------------

const EQUIVALENT_SHAPES = Object.freeze([
  ['reordered keys', () => {
    const input = structuredInput();
    const reordered = { parameters: {}, object: input.object, destination: input.destination, purpose: input.purpose, action: input.action };
    for (const key of Object.keys(input.parameters).reverse()) reordered.parameters[key] = input.parameters[key];
    return { canonicalization_version: SEMANTIC_EFFECT_CANONICALIZATION_VERSION, protocol: 'axiom.structured-effect.v0', input: reordered };
  }],
  ['numeric grade 90', () => structuredEffect({ grade: 90 })],
  ['decimal string 90.00', () => structuredEffect({ grade: '90.00' })],
  ['JSON number token 90.0', () => structuredEffect({ grade: new LabJsonNumber('90.0') })],
  ['NFD comment text', () => structuredEffect({ comment: 'Café project complete'.normalize('NFD') })],
  ['MCP tools/call shape', () => mcpEffect()],
  ['MCP with different JSON-RPC id', () => mcpEffect({ id: 'req-7781' })],
  ['MCP with progress token metadata', () => mcpEffect({ meta: { progressToken: 'p-1' } })],
  ['raw JSON structured text', () => ({
    canonicalization_version: SEMANTIC_EFFECT_CANONICALIZATION_VERSION,
    protocol: 'axiom.structured-effect.v0',
    input: JSON.stringify(structuredInput({ grade: '90.0' }), null, 2)
  })],
  ['raw JSON MCP text', () => ({
    canonicalization_version: SEMANTIC_EFFECT_CANONICALIZATION_VERSION,
    protocol: 'mcp.tools-call.v0',
    input: JSON.stringify(mcpEffect({ id: 99 }).input)
  })]
]);

test('F3 canonicalization equivalence: protocol-shape variations share one action identity', () => {
  for (const [label, build] of EQUIVALENT_SHAPES) {
    assert.equal(canonicalSemanticEffect(build(), PROFILES).effect_identity_digest, EFFECT_DIGEST, label);
  }
  const parsed = parseStrictJson('{"grade": 90.50, "n": [1, true, null]}');
  assert.ok(parsed.grade instanceof LabJsonNumber);
  assert.equal(parsed.grade.raw, '90.50');
});

test('F3 canonicalization equivalence: baseline admits every equivalent shape under a fresh token; lab admits once', async () => {
  const baselineSink = createSink({ idempotent: false });
  const baseline = createJtiKeyedBaseline(createInMemorySemanticLabStore());
  const { lab } = await registeredLab();
  const sink = createSink({ idempotent: false });
  await executeAdmitted(lab, await lab.admit({ presentation: freshToken(), effect: structuredEffect() }), sink);
  for (const [label, build] of EQUIVALENT_SHAPES) {
    await baselineExecute(baseline, freshToken(), build(), baselineSink);
    const result = await lab.admit({ presentation: freshToken(), effect: build() });
    assert.equal(result.decision, 'prior_receipt', label);
  }
  assert.equal(baselineSink.mutations, EQUIVALENT_SHAPES.length, 'RED: every shape re-executed');
  assert.equal(sink.mutations, 1, 'GREEN');
});

test('F3 canonicalization ambiguity fails closed for consequential effects', async () => {
  const ambiguous = [
    ['duplicate JSON key', { canonicalization_version: SEMANTIC_EFFECT_CANONICALIZATION_VERSION, protocol: 'mcp.tools-call.v0', input: '{"message":{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"record_grade","arguments":{"student_id":"student-042","course_id":"math-7","grade":90,"grade":95,"comment":"ok","notify_guardian":true}}},"purpose":"term-grade-entry","destination":"sis.example-school","object":"gradebook/term-3"}' }],
    ['__proto__ key in JSON text', { canonicalization_version: SEMANTIC_EFFECT_CANONICALIZATION_VERSION, protocol: 'axiom.structured-effect.v0', input: '{"action":"school.grade.write","purpose":"p","destination":"d","object":"o","parameters":{"__proto__":{"grade":"1"},"student_id":"s","course_id":"c","grade":"1","comment":"x","notify_guardian":true}}' }],
    ['exponent number token', structuredEffect({ grade: new LabJsonNumber('9e1') })],
    ['exponent decimal string', structuredEffect({ grade: '9E1' })],
    ['leading plus', structuredEffect({ grade: '+90' })],
    ['leading zero', structuredEffect({ grade: '090' })],
    ['bare fraction', structuredEffect({ grade: '.5' })],
    ['unsafe integer', structuredEffect({ grade: 2 ** 53 + 2 })],
    ['boolean as string', structuredEffect({ notify_guardian: 'true' })],
    ['zero-width space', structuredEffect({ comment: 'Caf\u200Be' })],
    ['bidi override', structuredEffect({ comment: 'grade \u202E09' })],
    ['undeclared parameter', structuredEffect({ weight: '1' })],
    ['missing parameter', (() => { const effect = structuredEffect(); delete effect.input.parameters.comment; return effect; })()],
    ['unknown canonicalization version', { ...structuredEffect(), canonicalization_version: 'axiom-effect-canon.v1' }],
    ['unknown protocol', { ...structuredEffect(), protocol: 'a2a.message.v0' }],
    ['unknown MCP metadata', mcpEffect({ meta: { progressToken: 'p', idempotencyKey: 'x' } })],
    ['MCP non-call method', (() => { const effect = mcpEffect(); effect.input.message.method = 'tools/list'; return effect; })()],
    ['lone surrogate in JSON text', { canonicalization_version: SEMANTIC_EFFECT_CANONICALIZATION_VERSION, protocol: 'axiom.structured-effect.v0', input: '{"action":"school.grade.write","purpose":"p","destination":"d","object":"o","parameters":{"student_id":"s","course_id":"c","grade":"1","comment":"\\ud800","notify_guardian":true}}' }],
    ['trailing JSON data', { canonicalization_version: SEMANTIC_EFFECT_CANONICALIZATION_VERSION, protocol: 'axiom.structured-effect.v0', input: `${JSON.stringify(structuredInput())} {}` }]
  ];
  const { lab } = await registeredLab();
  for (const [label, effect] of ambiguous) {
    assert.throws(() => canonicalSemanticEffect(effect, PROFILES), /failing closed|invalid|must|unsupported|missing|no unique|not a tools/, label);
    const result = await lab.admit({ presentation: freshToken(), effect });
    assert.equal(result.decision, 'deny', label);
    assert.equal(result.reason, 'canonicalization_ambiguous', label);
  }
});

test('F3 exact binding: a different parameter, purpose, destination or object is a different effect and is not authorized', async () => {
  const { lab } = await registeredLab();
  const variants = [
    structuredEffect({ grade: '91' }),
    structuredEffect({ student_id: 'student-043' }),
    structuredEffect({}, { purpose: 'report-card-correction' }),
    structuredEffect({}, { destination: 'sis.other-school' }),
    structuredEffect({}, { object: 'gradebook/term-4' })
  ];
  for (const effect of variants) {
    const digest = canonicalSemanticEffect(effect, PROFILES).effect_identity_digest;
    assert.notEqual(digest, EFFECT_DIGEST);
    const result = await lab.admit({ presentation: freshToken({ effectDigest: digest }), effect });
    assert.equal(result.reason, 'effect_not_authorized');
  }
  const mismatch = await lab.admit({ presentation: freshToken(), effect: structuredEffect({ grade: '91' }) });
  assert.equal(mismatch.reason, 'effect_mismatch', 'a token bound to A cannot carry B');
});

// ---------------------------------------------------------------------------
// Fixture 4: crash after commit / lost response
// ---------------------------------------------------------------------------

test('F4 crash after commit / lost response: restarted evaluator returns the durable prior receipt, no duplicate', async t => {
  const ledger = await sqliteLedgerDir(t);
  const baselineSink = createSink({ idempotent: false });
  const sink = createSink({ idempotent: false });

  const before = ledger.open();
  const baselineBefore = createJtiKeyedBaseline(before);
  await baselineExecute(baselineBefore, freshToken(), structuredEffect(), baselineSink);
  const lab = newLab(before);
  await lab.registerAuthorizationInstance(instanceDocument());
  const committed = await executeAdmitted(lab, await lab.admit({ presentation: freshToken(), effect: structuredEffect() }), sink);
  before.close(); // crash: the admission/commit response never reached the agent

  const after = ledger.open();
  await baselineExecute(createJtiKeyedBaseline(after), freshToken(), structuredEffect(), baselineSink);
  assert.equal(baselineSink.mutations, 2, 'RED: retry with a fresh token repeats the effect');

  const retry = await newLab(after).admit({ presentation: freshToken(), effect: structuredEffect() });
  assert.equal(retry.decision, 'prior_receipt');
  assert.equal(retry.receipt.receipt_id, committed.receipt_id);
  assert.equal(retry.receipt.effect_committed, 'yes');
  assert.equal(sink.mutations, 1, 'GREEN');
});

test('F4 crash before dispatch: retry cannot consume again; the existing admission is resumed by receipt', async t => {
  const ledger = await sqliteLedgerDir(t);
  const before = ledger.open();
  const lab = newLab(before);
  await lab.registerAuthorizationInstance(instanceDocument({ budget: 2 }));
  const admitted = await lab.admit({ presentation: freshToken(), effect: structuredEffect() });
  assert.equal(admitted.decision, 'admit');
  before.close();

  const after = ledger.open();
  const resumed = newLab(after);
  const retry = await resumed.admit({ presentation: freshToken({ holder: 'worker.resumed' }), effect: structuredEffect() });
  assert.equal(retry.decision, 'deny');
  assert.equal(retry.reason, 'prior_admission_unresolved');
  assert.equal(retry.receipt.lifecycle_state, 'admission_consumed');
  assert.equal(retry.receipt.admissions_consumed, 1, 'budget unit 2 is not spent on a retry of unit 1');
  const sink = createSink({ idempotent: false });
  const dispatch = await resumed.beginDispatch({ authorization_instance_id: 'authz-grade-1', receipt_id: retry.receipt.receipt_id });
  assert.equal(dispatch.decision, 'dispatch');
  sink.deliver(dispatch.idempotency_key);
  const again = await resumed.beginDispatch({ authorization_instance_id: 'authz-grade-1', receipt_id: retry.receipt.receipt_id });
  assert.equal(again.reason, 'dispatch_already_started', 'a resumed dispatch cannot be started twice');
  assert.equal(sink.mutations, 1);
});

// ---------------------------------------------------------------------------
// Fixture 5: downstream at-least-once retry and explicit effect uncertainty
// ---------------------------------------------------------------------------

test('F5 downstream retry: stable idempotency key dedupes at an idempotent sink; jti-derived keys do not survive reissuance', async () => {
  const baselineSink = createSink({ idempotent: true });
  const baseline = createJtiKeyedBaseline(createInMemorySemanticLabStore());
  await baselineExecute(baseline, freshToken(), structuredEffect(), baselineSink);
  await baselineExecute(baseline, freshToken(), structuredEffect(), baselineSink); // retry after timeout via reissued token
  assert.equal(baselineSink.mutations, 2, 'RED: key derived from jti changes with every reissued token');

  const { lab } = await registeredLab();
  const sink = createSink({ idempotent: true });
  const admitted = await lab.admit({ presentation: freshToken(), effect: structuredEffect() });
  const ids = { authorization_instance_id: 'authz-grade-1', receipt_id: admitted.receipt.receipt_id };
  const dispatch = await lab.beginDispatch(ids);
  sink.deliver(dispatch.idempotency_key);
  const timeout = await lab.recordSinkOutcome({ ...ids, outcome: 'unknown' });
  assert.equal(timeout.receipt.lifecycle_state, 'effect_uncertain');
  assert.equal(timeout.receipt.reconciliation, 'required');
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const redeliver = await lab.retryDispatch({ ...ids, sink_idempotent: true });
    assert.equal(redeliver.decision, 'redeliver');
    assert.equal(redeliver.idempotency_key, dispatch.idempotency_key);
    sink.deliver(redeliver.idempotency_key);
  }
  const ack = await lab.recordSinkOutcome({ ...ids, outcome: 'committed' });
  assert.equal(ack.receipt.reconciliation, 'reconciled_by_sink_ack');
  assert.equal(sink.mutations, 1, 'GREEN');
});

test('F5 downstream retry: non-idempotent sink becomes effect-uncertain and is never silently re-executed', async () => {
  const { lab } = await registeredLab();
  const sink = createSink({ idempotent: false });
  const admitted = await lab.admit({ presentation: freshToken(), effect: structuredEffect() });
  const ids = { authorization_instance_id: 'authz-grade-1', receipt_id: admitted.receipt.receipt_id };
  sink.deliver((await lab.beginDispatch(ids)).idempotency_key);
  const retry = await lab.retryDispatch({ ...ids, sink_idempotent: false });
  assert.equal(retry.decision, 'deny');
  assert.equal(retry.reason, 'effect_uncertain_requires_reconciliation');
  assert.equal(retry.receipt.effect_committed, 'unknown');
  const reissue = await lab.admit({ presentation: freshToken(), effect: structuredEffect() });
  assert.equal(reissue.reason, 'effect_uncertain_requires_reconciliation');
  assert.equal(reissue.perform, false);
  const reconciled = await lab.recordObservation({ ...ids, observed: 'absent', evidence_digest: sha256('sis-audit-log-query') });
  assert.equal(reconciled.receipt.lifecycle_state, 'reconciled_absent');
  assert.equal(reconciled.receipt.effect_observed, 'observed_absent');
  const after = await lab.admit({ presentation: freshToken(), effect: structuredEffect() });
  assert.equal(after.decision, 'prior_receipt', 'reconciled absence does not replenish the consumed budget');
  assert.equal(sink.mutations, 1);
});

test('F5 receipts keep admission_consumed, effect_committed, effect_observed and reconciliation distinct', async () => {
  const { lab } = await registeredLab();
  const admitted = await lab.admit({ presentation: freshToken(), effect: structuredEffect() });
  const ids = { authorization_instance_id: 'authz-grade-1', receipt_id: admitted.receipt.receipt_id };
  assert.deepEqual(pick(admitted.receipt), ['admission_consumed', true, 'no', 'not_observed', 'not_required']);
  await lab.beginDispatch(ids);
  const committed = await lab.recordSinkOutcome({ ...ids, outcome: 'committed' });
  assert.deepEqual(pick(committed.receipt), ['effect_committed', true, 'yes', 'not_observed', 'not_required']);
  const contradiction = await lab.recordObservation({ ...ids, observed: 'absent', evidence_digest: sha256('x') });
  assert.equal(contradiction.reason, 'observation_contradicts_state');
  const observed = await lab.recordObservation({ ...ids, observed: 'present', evidence_digest: sha256('sis-row-v2') });
  assert.deepEqual(pick(observed.receipt), ['effect_observed', true, 'yes', 'observed_present', 'not_required']);
  for (const receipt of [admitted.receipt, committed.receipt, observed.receipt]) {
    assert.equal(receipt.exactly_once_claimed, false);
    assert.equal(receipt.receipt_is_authority, false);
    assert.equal(receipt.token_is_authority, false);
    assert.equal(receipt.runtime_activation, false);
    assert.equal(receipt.authority_effect, 'none');
    assert.ok(Object.isFrozen(receipt));
  }
});

function pick(receipt) {
  return [receipt.lifecycle_state, receipt.admission_consumed, receipt.effect_committed, receipt.effect_observed, receipt.reconciliation];
}

// ---------------------------------------------------------------------------
// Fixture 6: delegation / restart / resume paths
// ---------------------------------------------------------------------------

test('F6 delegation/restart: child, resumed, and replacement workers cannot reset the semantic budget', async () => {
  const baselineSink = createSink({ idempotent: false });
  const baseline = createJtiKeyedBaseline(createInMemorySemanticLabStore());
  await baselineExecute(baseline, freshToken(), structuredEffect(), baselineSink);
  await baselineExecute(baseline, freshToken({ holder: 'agent.child' }), structuredEffect(), baselineSink);
  assert.equal(baselineSink.mutations, 2, 'RED: delegated child with a fresh local token repeats A');

  const store = createInMemorySemanticLabStore();
  const { lab } = await registeredLab({ store });
  const sink = createSink({ idempotent: false });
  await executeAdmitted(lab, await lab.admit({ presentation: freshToken(), effect: structuredEffect() }), sink);

  const child = await lab.admit({ presentation: freshToken({ holder: 'agent.child' }), effect: mcpEffect({ id: 'child-1' }) });
  assert.equal(child.decision, 'prior_receipt');
  const replacement = newLab(store); // replacement worker: new process, same durable store
  const replaced = await replacement.admit({ presentation: freshToken({ holder: 'worker.replacement' }), effect: structuredEffect() });
  assert.equal(replaced.decision, 'prior_receipt');

  const reRegister = await replacement.registerAuthorizationInstance(instanceDocument());
  assert.equal(reRegister.decision, 'already_registered');
  const stillExhausted = await replacement.admit({ presentation: freshToken(), effect: structuredEffect() });
  assert.equal(stillExhausted.receipt.admissions_consumed, 1, 're-registration never resets the budget');

  const widened = await replacement.registerAuthorizationInstance(instanceDocument({ budget: 5 }));
  assert.equal(widened.reason, 'mandate_already_bound');
  const sameMandateNewId = await replacement.registerAuthorizationInstance(instanceDocument({ id: 'authz-grade-child' }));
  assert.equal(sameMandateNewId.reason, 'mandate_already_bound', 'a child cannot mint a new instance from the parent mandate');
  const sameIdNewMandate = await replacement.registerAuthorizationInstance(instanceDocument({ mandate: 'child-invented', budget: 3 }));
  assert.equal(sameIdNewMandate.reason, 'authorization_instance_conflict');
  const unknown = await replacement.admit({ presentation: freshToken({ instanceId: 'authz-never-registered' }), effect: structuredEffect() });
  assert.equal(unknown.reason, 'unknown_authorization_instance');
  assert.equal(sink.mutations, 1, 'GREEN');
});

// ---------------------------------------------------------------------------
// Fixture 7: legitimate later repetition under a distinct explicit mandate
// ---------------------------------------------------------------------------

test('F7 legitimate later repetition: a distinct explicit mandate may repeat identical parameters; no global dedupe', async () => {
  const store = createInMemorySemanticLabStore();
  const { lab } = await registeredLab({ store });
  const sink = createSink({ idempotent: true });
  const first = await executeAdmitted(lab, await lab.admit({ presentation: freshToken(), effect: structuredEffect() }), sink);
  const second = instanceDocument({ id: 'authz-grade-2', mandate: 'mandate-2-regrade-requested-by-teacher' });
  assert.equal((await lab.registerAuthorizationInstance(second)).decision, 'registered');
  const repeated = await lab.admit({ presentation: freshToken({ instanceId: 'authz-grade-2' }), effect: structuredEffect() });
  assert.equal(repeated.decision, 'admit');
  const repeatedReceipt = await executeAdmitted(lab, repeated, sink);
  assert.equal(repeatedReceipt.effect_identity_digest, first.effect_identity_digest);
  assert.notEqual(repeatedReceipt.idempotency_key, first.idempotency_key, 'distinct mandates keep distinct effect keys');
  assert.equal(sink.mutations, 2);

  // Strawman: global dedupe on identical parameters wrongly collapses distinct mandates.
  const seen = new Set();
  const globalDedupe = digest => (seen.has(digest) ? false : (seen.add(digest), true));
  assert.equal(globalDedupe(EFFECT_DIGEST), true);
  assert.equal(globalDedupe(EFFECT_DIGEST), false, 'global parameter dedupe would deny legitimate repetition');
});

// ---------------------------------------------------------------------------
// RT-ABORT-012: abort / commit race
// ---------------------------------------------------------------------------

test('abort/commit race: abort between admission and dispatch terminates the outstanding effect authority', async () => {
  const baselineSink = createSink({ idempotent: false });
  const baseline = createJtiKeyedBaseline(createInMemorySemanticLabStore());
  // The jti-keyed model has no per-authorization abort state: a fresh token still admits.
  await baselineExecute(baseline, freshToken(), structuredEffect(), baselineSink);
  assert.equal(baselineSink.mutations, 1, 'RED: identifier-local consumption alone does not observe the abort');

  const { lab } = await registeredLab({ budget: 2 });
  const sink = createSink({ idempotent: false });
  const admitted = await lab.admit({ presentation: freshToken(), effect: structuredEffect() });
  assert.equal((await lab.abort({ authorization_instance_id: 'authz-grade-1' })).decision, 'aborted');
  const dispatch = await lab.beginDispatch({ authorization_instance_id: 'authz-grade-1', receipt_id: admitted.receipt.receipt_id });
  assert.equal(dispatch.reason, 'authorization_aborted');
  assert.equal(dispatch.receipt.lifecycle_state, 'aborted_before_dispatch');
  assert.equal(dispatch.receipt.admissions_consumed, 1, 'abort does not refund the consumed unit');
  const fresh = await lab.admit({ presentation: freshToken(), effect: structuredEffect() });
  assert.equal(fresh.reason, 'authorization_aborted');
  assert.equal(sink.mutations, 0);
});

test('abort/commit race: concurrent abort and admission linearize; no effect is dispatched after abort', async () => {
  for (const abortFirst of [true, false]) {
    const store = createInMemorySemanticLabStore();
    await newLab(store).registerAuthorizationInstance(instanceDocument());
    const arrive = barrier(2);
    const interleave = async ({ label, attempt }) => {
      if (attempt !== 0) return;
      await arrive();
      if ((label === 'admit') === abortFirst) await new Promise(resolve => setImmediate(resolve));
    };
    const [admission, aborted] = await Promise.all([
      newLab(store, { interleave }).admit({ presentation: freshToken(), effect: structuredEffect() }),
      newLab(store, { interleave }).abort({ authorization_instance_id: 'authz-grade-1' })
    ]);
    assert.equal(aborted.decision, 'aborted');
    assert.equal(admission.decision, abortFirst ? 'deny' : 'admit', 'both linearization orders are exercised');
    if (admission.decision === 'admit') {
      const dispatch = await newLab(store).beginDispatch({ authorization_instance_id: 'authz-grade-1', receipt_id: admission.receipt.receipt_id });
      assert.equal(dispatch.decision, 'deny', `abortFirst=${abortFirst}`);
      assert.equal(dispatch.reason, 'authorization_aborted');
      assert.equal(dispatch.receipt.lifecycle_state, 'aborted_before_dispatch');
    } else {
      assert.equal(admission.reason, 'authorization_aborted', `abortFirst=${abortFirst}`);
    }
  }
});

test('abort/commit race: abort after dispatch cannot un-commit, and blocks idempotent redelivery', async () => {
  const { lab } = await registeredLab();
  const admitted = await lab.admit({ presentation: freshToken(), effect: structuredEffect() });
  const ids = { authorization_instance_id: 'authz-grade-1', receipt_id: admitted.receipt.receipt_id };
  await lab.beginDispatch(ids);
  await lab.abort({ authorization_instance_id: 'authz-grade-1' });
  const redeliver = await lab.retryDispatch({ ...ids, sink_idempotent: true });
  assert.equal(redeliver.reason, 'authorization_aborted');
  assert.equal(redeliver.receipt.abort_state, 'abort_after_dispatch');
  assert.equal(redeliver.receipt.lifecycle_state, 'effect_uncertain');
  const late = await lab.recordSinkOutcome({ ...ids, outcome: 'committed' });
  assert.equal(late.receipt.effect_committed, 'yes', 'a sink commit that already happened is recorded, not erased');
  assert.equal(late.receipt.abort_state, 'abort_after_dispatch');
});

// ---------------------------------------------------------------------------
// No token, identity, confirmation UI, or receipt is authority by itself.
// ---------------------------------------------------------------------------

test('no token, identity, confirmation UI, or receipt is treated as authority by itself', async () => {
  const { lab } = await registeredLab();
  const admitted = await lab.admit({ presentation: freshToken(), effect: structuredEffect() });
  const withReceipt = await lab.admit({ presentation: { ...freshToken(), receipt: admitted.receipt }, effect: structuredEffect() });
  assert.equal(withReceipt.reason, 'invalid_input');
  const withConfirmation = await lab.admit({ presentation: freshToken(), effect: structuredEffect(), confirmation_ui: { confirmed: true } });
  assert.equal(withConfirmation.reason, 'invalid_input');
  const privileged = await lab.admit({ presentation: freshToken({ holder: 'owner.administrator' }), effect: structuredEffect() });
  assert.equal(privileged.perform, false, 'holder identity does not add budget');
  const unregistered = await newLab(createInMemorySemanticLabStore())
    .admit({ presentation: freshToken(), effect: structuredEffect() });
  assert.equal(unregistered.reason, 'unknown_authorization_instance', 'a valid, bound token without a durable instance is not authority');
  const expired = await lab.admit({ presentation: { ...freshToken(), expires_at: '2026-09-26T11:30:00.000Z' }, effect: structuredEffect() });
  assert.equal(expired.reason, 'token_not_current');
  const lateLab = newLab(createInMemorySemanticLabStore(), { now: () => Date.parse('2026-09-26T14:00:00.000Z') });
  await lateLab.registerAuthorizationInstance(instanceDocument());
  const stale = await lateLab.admit({ presentation: { ...freshToken(), expires_at: '2026-09-26T15:00:00.000Z' }, effect: structuredEffect() });
  assert.equal(stale.reason, 'authorization_not_current');
});

test('exotic, cyclic, or throwing inputs fail closed', async () => {
  const { lab } = await registeredLab();
  const cyclic = { presentation: freshToken(), effect: structuredEffect() };
  cyclic.effect.input.parameters.self = cyclic;
  const throwing = new Proxy({}, { ownKeys() { throw new Error('boom'); }, getPrototypeOf() { return Object.prototype; } });
  const getter = { get presentation() { return freshToken(); }, effect: structuredEffect() };
  for (const input of [cyclic, throwing, getter, null, [], 'admit', { presentation: freshToken() }]) {
    const result = await lab.admit(input);
    assert.equal(result.decision, 'deny');
    assert.equal(result.perform, false);
  }
  for (const input of [throwing, { authorization_instance_id: 'authz-grade-1' }]) {
    assert.equal((await lab.beginDispatch(input)).decision, 'deny');
  }
  assert.equal((await lab.registerAuthorizationInstance(throwing)).decision, 'deny');
  assert.throws(() => createSemanticActionConsumptionLab({ profiles: PROFILES }), /store/);
});

// ---------------------------------------------------------------------------
// Inert contract and live-boundary guards
// ---------------------------------------------------------------------------

test('authorization instance pins hard zeros and rejects runtime activation or unknown fields', () => {
  const document = instanceDocument();
  assert.equal(document.runtime_activation, false);
  assert.equal(document.authority_effect, 'none');
  assert.equal(document.status, 'inert-reference-model');
  assert.match(semanticAuthorizationInstanceDigest(document), /^[a-f0-9]{64}$/);
  assert.throws(() => validateSemanticAuthorizationInstance({ ...document, runtime_activation: true }), /runtime_activation/);
  assert.throws(() => validateSemanticAuthorizationInstance({ ...document, authority_effect: 'grant' }), /authority_effect/);
  assert.throws(() => validateSemanticAuthorizationInstance({ ...document, execution_budget: 0 }), /budget/);
  assert.throws(() => validateSemanticAuthorizationInstance({ ...document, model_intent: 'x' }), /unsupported/);
  const { schema: _s, version: _v, status: _st, canonicalization_version: _c, authority_effect: _a, execution_effect: _e,
    network_effect: _n, runtime_activation: _r, ...body } = document;
  assert.throws(() => buildSemanticAuthorizationInstance({ ...body, runtime_activation: true }), /unsupported/);
  assert.throws(() => buildSemanticEffectProfile({ ...PROFILE, consequential: false }), /consequential/);
});

test('lab stays inert: pure module, not wired into runtime, capabilities, or live consumption', async () => {
  const libUrl = new URL('../src/lib/semantic-action-consumption-lab.mjs', import.meta.url);
  const source = await readFile(libUrl, 'utf8');
  const imports = [...source.matchAll(/^import .* from '([^']+)';$/gm)].map(found => found[1]);
  assert.deepEqual(imports, ['./canonical.mjs']);
  assert.doesNotMatch(source, /node:|process\.|fetch\(|require\(/);

  const srcRoot = new URL('../src/', import.meta.url);
  const offenders = [];
  async function walk(url) {
    for (const entry of await readdir(url, { withFileTypes: true })) {
      const child = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, url);
      if (entry.isDirectory()) await walk(child);
      else if (entry.name.endsWith('.mjs') && entry.name !== 'semantic-action-consumption-lab.mjs') {
        if ((await readFile(child, 'utf8')).includes('semantic-action-consumption-lab')) offenders.push(child.pathname);
      }
    }
  }
  await walk(srcRoot);
  assert.deepEqual(offenders, [], 'no runtime module imports the lab');

  const capabilities = await readFile(new URL('../config/capabilities.json', import.meta.url), 'utf8');
  assert.doesNotMatch(capabilities, /semantic-action-consumption|semantic_action_consumption/);
  // Live identifier-local key is unchanged by the lab.
  assert.equal(capabilityConsumptionEventId('jti-live'), `evt_capability_consume_${sha256('jti-live')}`);
});
