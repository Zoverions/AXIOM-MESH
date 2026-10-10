import assert from 'node:assert/strict';
import test from 'node:test';

import {
  deriveSemanticMemoryProvenance,
  evaluateSemanticMemoryUse,
  normalizeSemanticMemoryProvenance,
  ownerReviewSemanticMemory,
  semanticMemoryReviewRequestDigest
} from '../src/lib/semantic-memory-provenance.mjs';
import {
  createSemanticMemoryLifecycle,
  deriveSemanticMemoryLifecycle,
  evaluateSemanticMemoryLifecycleUse,
  verifySemanticMemoryLifecycle
} from '../src/lib/semantic-memory-lifecycle.mjs';

// #1918: semantic-memory-lifecycle.mjs reads every option and caller-supplied
// field own-property only. Inherited values read as absent; whenever any
// inherited value was visible, a deny that main's ordinary reads produce,
// thrown OR returned as { allow: false }, is what the caller gets.

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);
const C = 'c'.repeat(64);
const FUTURE = '2099-01-01T00:00:00.000Z';
const PAST = '2026-01-01T00:00:00.000Z';
const REVIEW_KEYS = ['authority_tier', 'review_state', 'review_actor', 'review_request_digest', 'reviewed_from_provenance_digest', 'review_decision'];
const PROVENANCE_KEYS = new Set([
  'schema', 'object_id', 'owner', 'content_digest', 'origin_class', 'origin_principal', 'origin_runtime_id',
  'origin_artifact_digest', 'semantic_class', 'authority_tier', 'review_state', 'review_actor',
  'review_request_digest', 'reviewed_from_provenance_digest', 'review_decision', 'parent_object_id',
  'parent_content_digest', 'parent_provenance_digest', 'ingestion_intent_id', 'request_digest',
  'may_affect_authority', 'provenance_digest'
]);
const LIFECYCLE_KEYS = [
  'schema', 'object_id', 'owner', 'provenance_digest', 'origin_class', 'retention_mode', 'expires_at',
  'inheritance_policy', 'parent_provenance_digest', 'authority_inheritance', 'instruction_inheritance',
  'lifecycle_effect', 'lifecycle_digest'
];

function rawRemote() {
  return {
    object_id: 'memory.remote.lifecycle-own', owner: 'owner.alice', content_digest: A,
    origin_class: 'remote-agent', origin_principal: 'agent.remote.1', origin_artifact_digest: B,
    semantic_class: 'instruction-candidate'
  };
}
function review(record, decision) {
  return ownerReviewSemanticMemory(record, {
    actor_id: 'owner.alice',
    review_request_digest: semanticMemoryReviewRequestDigest(record, decision),
    decision
  });
}

// Fixtures are built before any pollution.
const base = normalizeSemanticMemoryProvenance(rawRemote());
// Self-asserted: ownerReviewSemanticMemory is not authenticated and no Grid review exists.
const selfApproved = review(base, 'approve-instruction');
const quarantined = review(base, 'quarantine');
const rejected = review(base, 'reject');
const ownerKnowledge = normalizeSemanticMemoryProvenance({
  object_id: 'memory.owner.lifecycle-own', owner: 'owner.alice', content_digest: C,
  origin_class: 'owner-authored', semantic_class: 'knowledge'
});
const derived = deriveSemanticMemoryProvenance(ownerKnowledge, { object_id: 'memory.derived.lifecycle-own', content_digest: B });
const lcApproved = createSemanticMemoryLifecycle(selfApproved);
const lcBase = createSemanticMemoryLifecycle(base);
const lcExpired = createSemanticMemoryLifecycle(ownerKnowledge, { retention_mode: 'bounded', expires_at: PAST });
const lcFuture = createSemanticMemoryLifecycle(ownerKnowledge, { retention_mode: 'bounded', expires_at: FUTURE });
const lcDerivedParent = createSemanticMemoryLifecycle(ownerKnowledge, { retention_mode: 'bounded', expires_at: FUTURE });
const lcDerived = deriveSemanticMemoryLifecycle(ownerKnowledge, lcDerivedParent, derived);

function withPollution(target, entries, fn) {
  const restores = [];
  try {
    for (const [key, value] of entries) {
      const had = Object.hasOwn(target, key);
      const previous = Object.getOwnPropertyDescriptor(target, key);
      Object.defineProperty(target, key, { value, configurable: true, writable: true, enumerable: false });
      restores.push(() => (had ? Object.defineProperty(target, key, previous) : delete target[key]));
    }
    return fn();
  } finally {
    for (const restore of restores.reverse()) restore();
  }
}
function outcome(fn) {
  try {
    return { ok: true, value: fn() };
  } catch (error) {
    return { ok: false, name: error?.name, message: error?.message };
  }
}
const denied = result => !result.ok || result.value?.allow === false;

test('red/green: inherited verified_review_request_digest cannot allow a self-asserted review with no Grid review', () => {
  withPollution(Object.prototype, [['verified_review_request_digest', selfApproved.review_request_digest]], () => {
    // On main 1c21fc49 this returned semantic_memory_instruction_allowed.
    assert.equal(evaluateSemanticMemoryLifecycleUse(selfApproved, lcApproved, 'privileged-instruction').code,
      'semantic_memory_review_evidence_unverified');
    assert.equal(evaluateSemanticMemoryLifecycleUse(selfApproved, lcApproved, 'privileged-instruction', {}).code,
      'semantic_memory_review_evidence_unverified');
    // An own option still works exactly as before.
    assert.equal(evaluateSemanticMemoryLifecycleUse(selfApproved, lcApproved, 'privileged-instruction', {
      verified_review_request_digest: selfApproved.review_request_digest
    }).code, 'semantic_memory_instruction_allowed');
  });
  assert.equal(Object.hasOwn(Object.prototype, 'verified_review_request_digest'), false);
});

test('red/green: an inherited now cannot revive an expired bounded lifecycle; absent now keeps the real clock', () => {
  withPollution(Object.prototype, [['now', '2025-01-01T00:00:00.000Z']], () => {
    // On main 1c21fc49 this returned semantic_memory_retrieval_allowed.
    assert.equal(evaluateSemanticMemoryLifecycleUse(ownerKnowledge, lcExpired, 'ordinary-retrieval').code, 'semantic_memory_expired');
    assert.equal(evaluateSemanticMemoryLifecycleUse(ownerKnowledge, lcExpired, 'ordinary-retrieval', {}).code, 'semantic_memory_expired');
    assert.equal(evaluateSemanticMemoryLifecycleUse(ownerKnowledge, lcFuture, 'ordinary-retrieval').code, 'semantic_memory_retrieval_allowed');
  });
  // Own now is honoured.
  assert.equal(evaluateSemanticMemoryLifecycleUse(ownerKnowledge, lcExpired, 'ordinary-retrieval', {
    now: new Date('2025-01-01T00:00:00.000Z')
  }).code, 'semantic_memory_retrieval_allowed');
  // Returned-deny dominance: an inherited future now makes main return expired, so head does too.
  withPollution(Object.prototype, [['now', '2100-01-01T00:00:00.000Z']], () => {
    assert.equal(evaluateSemanticMemoryLifecycleUse(ownerKnowledge, lcFuture, 'ordinary-retrieval').code, 'semantic_memory_expired');
  });
  // Thrown-deny dominance: an inherited invalid now still throws main's error.
  withPollution(Object.prototype, [['now', 'not a time']], () => {
    assert.throws(() => evaluateSemanticMemoryLifecycleUse(ownerKnowledge, lcFuture, 'ordinary-retrieval'), /now is invalid/);
  });
});

test('red/green: a returned allow:false under pollution dominates (consistent quarantine / reject review)', () => {
  for (const [reviewed, code] of [[quarantined, 'semantic_memory_quarantined'], [rejected, 'semantic_memory_rejected']]) {
    const entries = REVIEW_KEYS.map(key => [key, reviewed[key]]);
    withPollution(Object.prototype, entries, () => {
      // On main 1c21fc49 these returned semantic_memory_retrieval_allowed.
      assert.deepEqual(evaluateSemanticMemoryUse(rawRemote(), 'ordinary-retrieval'), { allow: false, code });
      assert.deepEqual(evaluateSemanticMemoryUse(rawRemote(), 'privileged-instruction'), { allow: false, code });
      // Lifecycle path: main's ordinary reads deny (throw), so head denies.
      assert.ok(denied(outcome(() => evaluateSemanticMemoryLifecycleUse(rawRemote(), lcBase, 'ordinary-retrieval'))));
    });
  }
});

test('deeper prototype chains are detected, not only the direct prototype', () => {
  const deep = value => Object.create(Object.create({ verified_review_request_digest: value }));
  // Inherited two levels down, a malformed digest still raises main's deny...
  assert.throws(() => evaluateSemanticMemoryUse(selfApproved, 'privileged-instruction', deep('bad')), /verified_review_request_digest/);
  assert.throws(() => evaluateSemanticMemoryLifecycleUse(selfApproved, lcApproved, 'privileged-instruction', deep('bad')), /verified_review_request_digest/);
  // ...and a well-formed one reads as absent.
  assert.equal(evaluateSemanticMemoryUse(selfApproved, 'privileged-instruction', deep(selfApproved.review_request_digest)).code,
    'semantic_memory_review_evidence_unverified');
  assert.equal(evaluateSemanticMemoryLifecycleUse(selfApproved, lcApproved, 'privileged-instruction', deep(selfApproved.review_request_digest)).code,
    'semantic_memory_review_evidence_unverified');
  const deepNow = Object.create(Object.create({ now: new Date('2025-01-01T00:00:00.000Z') }));
  assert.equal(evaluateSemanticMemoryLifecycleUse(ownerKnowledge, lcExpired, 'ordinary-retrieval', deepNow).code, 'semantic_memory_expired');
  const deepCreate = Object.create(Object.create({ retention_mode: 'bounded', expires_at: FUTURE }));
  assert.deepEqual(createSemanticMemoryLifecycle(ownerKnowledge, deepCreate), createSemanticMemoryLifecycle(ownerKnowledge));
  // Deep pollution of a record's prototype chain is impossible: records must be plain (#1935).
  assert.throws(() => normalizeSemanticMemoryProvenance(Object.assign(Object.create(Object.create({ review_state: 'owner-reviewed' })), rawRemote())));
});

test('provenance_digest is read own-only (no own digest, consistent polluted content + digest)', () => {
  const pollutedContent = normalizeSemanticMemoryProvenance({ ...rawRemote(), ingestion_intent_id: 'intent.x' });
  withPollution(Object.prototype, [['ingestion_intent_id', 'intent.x'], ['provenance_digest', pollutedContent.provenance_digest]], () => {
    // Main's ordinary reads accept this as the polluted record; head gives the unpolluted result.
    assert.deepEqual(normalizeSemanticMemoryProvenance(rawRemote()), base);
    assert.equal(Object.hasOwn(normalizeSemanticMemoryProvenance(rawRemote()), 'ingestion_intent_id'), false);
  });
});

test('every lifecycle field on Object.prototype reads as absent, or adds the deny an own field would raise', () => {
  const lifecycles = { lcApproved, lcBase, lcExpired, lcFuture, lcDerived };
  const records = { lcApproved: selfApproved, lcBase: base, lcExpired: ownerKnowledge, lcFuture: ownerKnowledge, lcDerived: derived };
  const variants = {};
  for (const [name, lifecycle] of Object.entries(lifecycles)) {
    variants[name] = { ...lifecycle };
    for (const key of LIFECYCLE_KEYS) {
      const { [key]: _omitted, ...rest } = lifecycle;
      variants[`${name}-missing-${key}`] = rest;
    }
  }
  const donors = key => [...new Set([lcApproved[key], lcFuture[key], lcDerived[key], null, 'bad', 1].filter(v => v !== undefined))];
  let cases = 0;
  for (const [name, lifecycle] of Object.entries(variants)) {
    const record = records[name.split('-')[0]];
    const baseline = outcome(() => verifySemanticMemoryLifecycle({ ...lifecycle }, record));
    for (const key of LIFECYCLE_KEYS) {
      for (const value of donors(key)) {
        // Main reads an inherited key as if it were own on every object that
        // lacks it: the lifecycle and, for shared keys, the provenance record.
        const ownLifecycle = Object.hasOwn(lifecycle, key) ? { ...lifecycle } : { ...lifecycle, [key]: value };
        const ownRecord = !PROVENANCE_KEYS.has(key) || Object.hasOwn(record, key) ? { ...record } : { ...record, [key]: value };
        const asOwn = outcome(() => verifySemanticMemoryLifecycle(ownLifecycle, ownRecord));
        const polluted = withPollution(Object.prototype, [[key, value]], () => outcome(() => verifySemanticMemoryLifecycle({ ...lifecycle }, record)));
        const label = `${name}.${key}=${JSON.stringify(value)}`;
        if (!asOwn.ok) assert.deepEqual(polluted, asOwn, `${label}: inherited deny must dominate`);
        else assert.deepEqual(polluted, baseline, `${label}: inherited value must read as absent`);
        cases += 1;
      }
    }
  }
  assert.ok(cases > 1000, `swept ${cases}`);
});

test('dominance sweep: options on the prototype read as absent, and own-equivalent denies (thrown or returned) dominate', () => {
  const optionDonors = {
    now: [new Date('2025-01-01T00:00:00.000Z'), new Date('2100-01-01T00:00:00.000Z'), 'not a time', PAST],
    verified_review_request_digest: [selfApproved.review_request_digest, C, 'bad'],
    retention_mode: ['bounded', 'owner-controlled', 'bad'],
    expires_at: [FUTURE, PAST, null, 'bad']
  };
  const calls = {
    evaluateApproved: opts => evaluateSemanticMemoryLifecycleUse(selfApproved, lcApproved, 'privileged-instruction', opts),
    evaluateExpired: opts => evaluateSemanticMemoryLifecycleUse(ownerKnowledge, lcExpired, 'ordinary-retrieval', opts),
    evaluateFuture: opts => evaluateSemanticMemoryLifecycleUse(ownerKnowledge, lcFuture, 'ordinary-retrieval', opts),
    create: opts => createSemanticMemoryLifecycle(ownerKnowledge, opts),
    derive: opts => deriveSemanticMemoryLifecycle(ownerKnowledge, lcDerivedParent, derived, opts),
    useDirect: opts => evaluateSemanticMemoryUse(selfApproved, 'privileged-instruction', opts)
  };
  let cases = 0;
  for (const [name, call] of Object.entries(calls)) {
    for (const ownOptions of [undefined, {}]) {
      const baseline = outcome(() => call(ownOptions));
      for (const [key, values] of Object.entries(optionDonors)) {
        for (const value of values) {
          const asOwn = outcome(() => call({ ...(ownOptions ?? {}), [key]: value }));
          const polluted = withPollution(Object.prototype, [[key, value]], () => outcome(() => call(ownOptions)));
          const label = `${name}(${ownOptions === undefined ? 'undefined' : '{}'}).${key}=${String(value)}`;
          if (denied(asOwn)) {
            assert.ok(denied(polluted), `${label}: main denies, head must deny`);
            assert.deepEqual(polluted, asOwn, `${label}: main's deny surfaces unchanged`);
          } else {
            assert.deepEqual(polluted, baseline, `${label}: inherited option reads as absent`);
          }
          cases += 1;
        }
      }
    }
  }
  assert.ok(cases > 100, `swept ${cases}`);
});

test('inherited derive options read as absent (owner-controlled parent stays owner-controlled)', () => {
  const lcOwnerParent = createSemanticMemoryLifecycle(ownerKnowledge);
  const expected = deriveSemanticMemoryLifecycle(ownerKnowledge, lcOwnerParent, derived);
  assert.equal(expected.retention_mode, 'owner-controlled');
  withPollution(Object.prototype, [['retention_mode', 'bounded'], ['expires_at', FUTURE]], () => {
    // Main's ordinary reads made this child bounded from the prototype.
    assert.deepEqual(deriveSemanticMemoryLifecycle(ownerKnowledge, lcOwnerParent, derived), expected);
    assert.deepEqual(deriveSemanticMemoryLifecycle(ownerKnowledge, lcOwnerParent, derived, {}), expected);
  });
});

test('null options keep the TypeError main throws (pinned)', () => {
  assert.throws(() => createSemanticMemoryLifecycle(ownerKnowledge, null), TypeError);
  assert.throws(() => evaluateSemanticMemoryLifecycleUse(ownerKnowledge, lcFuture, 'ordinary-retrieval', null), TypeError);
  assert.throws(() => deriveSemanticMemoryLifecycle(ownerKnowledge, lcDerivedParent, derived, null), TypeError);
});
