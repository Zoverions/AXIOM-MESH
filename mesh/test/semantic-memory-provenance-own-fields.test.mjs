import assert from 'node:assert/strict';
import test from 'node:test';
import {
  deriveSemanticMemoryProvenance,
  evaluateSemanticMemoryUse,
  normalizeSemanticMemoryProvenance,
  ownerReviewSemanticMemory,
  semanticMemoryReviewIntent,
  semanticMemoryReviewRequestDigest
} from '../src/lib/semantic-memory-provenance.mjs';

// #1918: every caller-supplied field in semantic-memory-provenance.mjs is read
// own-property only. Inherited (prototype-polluted) fields read as absent and
// can never escalate; inherited data may only add denies (deny dominance).

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);
const C = 'c'.repeat(64);

const FIELDS = [
  'schema', 'object_id', 'owner', 'content_digest', 'origin_class', 'origin_principal',
  'origin_runtime_id', 'origin_artifact_digest', 'semantic_class', 'authority_tier',
  'review_state', 'review_actor', 'review_request_digest', 'reviewed_from_provenance_digest',
  'review_decision', 'parent_object_id', 'parent_content_digest', 'parent_provenance_digest',
  'ingestion_intent_id', 'request_digest', 'may_affect_authority', 'provenance_digest'
];
const OPTION_FIELDS = [
  'actor_id', 'decision', 'semantic_class', 'ingestion_intent_id', 'request_digest',
  'object_id', 'content_digest', 'review_request_digest', 'verified_review_request_digest'
];

function remoteInstruction() {
  return {
    object_id: 'memory.remote.1',
    owner: 'owner.alice',
    content_digest: A,
    origin_class: 'remote-agent',
    origin_principal: 'agent.remote.1',
    origin_artifact_digest: B,
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

// Build every fixture BEFORE any pollution.
const unreviewed = normalizeSemanticMemoryProvenance(remoteInstruction());
const approved = review(unreviewed, 'approve-instruction');
const quarantined = review(unreviewed, 'quarantine');
const ownerKnowledge = normalizeSemanticMemoryProvenance({
  object_id: 'memory.owner.1', owner: 'owner.alice', content_digest: A,
  origin_class: 'owner-authored', semantic_class: 'knowledge'
});
const localModel = normalizeSemanticMemoryProvenance({
  object_id: 'memory.local.1', owner: 'owner.alice', content_digest: A,
  origin_class: 'local-model-generated', origin_runtime_id: 'runtime.local.1',
  origin_artifact_digest: B, semantic_class: 'procedure'
});
const derived = deriveSemanticMemoryProvenance(approved, {
  object_id: 'memory.derived.1', content_digest: C, ingestion_intent_id: 'intent.1', request_digest: B
});
const FIXTURES = {
  rawRemote: remoteInstruction(),
  rawOwner: { object_id: 'memory.owner.2', owner: 'owner.alice', content_digest: A, origin_class: 'owner-authored', semantic_class: 'preference' },
  unreviewed, approved, quarantined, ownerKnowledge, localModel, derived
};
// Records missing a required field or one element of the parent tuple: an
// inherited value must not complete them (they stay denied).
for (const field of ['object_id', 'owner', 'content_digest', 'origin_class', 'semantic_class']) {
  const { [field]: _omitted, ...rest } = remoteInstruction();
  FIXTURES[`rawRemoteMissing_${field}`] = rest;
}
for (const field of ['parent_object_id', 'parent_content_digest', 'parent_provenance_digest']) {
  const { [field]: _omitted, ...rest } = derived;
  FIXTURES[`derivedMissing_${field}`] = rest;
}
const approvedDigest = approved.review_request_digest;

// Values an attacker might plant: a genuine reviewed record's values (the
// escalation payload), other valid-looking values, and invalid values.
function donorValues(field) {
  const values = [approved[field], derived[field], quarantined[field], 'owner.mallory', C, true, 'not a valid value!', 1];
  return [...new Set(values.filter(value => value !== undefined))];
}

function definePolluted(target, key, value) {
  const had = Object.hasOwn(target, key);
  const previous = Object.getOwnPropertyDescriptor(target, key);
  Object.defineProperty(target, key, { value, configurable: true, writable: true, enumerable: false });
  return () => {
    if (had) Object.defineProperty(target, key, previous);
    else delete target[key];
  };
}

function withPollution(target, entries, fn) {
  const restores = [];
  try {
    for (const [key, value] of entries) restores.push(definePolluted(target, key, value));
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

test('red/green: Object.prototype review fields cannot promote an unreviewed record to instruction authority', () => {
  const entries = Object.entries({
    authority_tier: approved.authority_tier,
    review_state: approved.review_state,
    review_actor: approved.review_actor,
    review_request_digest: approved.review_request_digest,
    reviewed_from_provenance_digest: approved.reviewed_from_provenance_digest,
    review_decision: approved.review_decision,
    verified_review_request_digest: approvedDigest
  });
  withPollution(Object.prototype, entries, () => {
    // On main 04eccbbd this normalized to owner-approved-instruction / owner-reviewed
    // and evaluated to semantic_memory_instruction_allowed.
    const result = normalizeSemanticMemoryProvenance(remoteInstruction());
    assert.equal(result.authority_tier, 'untrusted-data');
    assert.equal(result.review_state, 'unreviewed');
    for (const key of ['review_actor', 'review_request_digest', 'reviewed_from_provenance_digest', 'review_decision']) {
      assert.equal(Object.hasOwn(result, key), false, key);
    }
    assert.deepEqual(result, unreviewed);
    assert.deepEqual(
      evaluateSemanticMemoryUse(remoteInstruction(), 'privileged-instruction'),
      { allow: false, code: 'semantic_memory_instruction_denied' }
    );
  });
  // Restored in finally: nothing left on the prototype.
  for (const [key] of entries) assert.equal(Object.hasOwn(Object.prototype, key), false);
});

test('every field on Object.prototype reads as absent, or adds the deny an own field would raise (never removes one)', () => {
  let cases = 0;
  for (const [name, fixture] of Object.entries(FIXTURES)) {
    const baseline = outcome(() => normalizeSemanticMemoryProvenance({ ...fixture }));
    for (const field of FIELDS) {
      for (const value of donorValues(field)) {
        // Main reads an inherited field exactly as if it were own, so the
        // own-field variant is main's polluted behaviour (when not shadowed).
        const asOwn = Object.hasOwn(fixture, field)
          ? baseline
          : outcome(() => normalizeSemanticMemoryProvenance({ ...fixture, [field]: value }));
        const polluted = withPollution(Object.prototype, [[field, value]], () => outcome(() => normalizeSemanticMemoryProvenance({ ...fixture })));
        const label = `${name}.${field}=${JSON.stringify(value)}`;
        if (!asOwn.ok) {
          // Main denies under this pollution: the same deny (same error) must surface.
          assert.deepEqual(polluted, asOwn, `${label}: inherited deny must dominate`);
        } else {
          // Main accepts under this pollution: the inherited value reads as
          // absent, so the result is exactly the unpolluted one (accept or deny).
          assert.deepEqual(polluted, baseline, `${label}: inherited value must read as absent`);
        }
        cases += 1;
      }
    }
  }
  assert.ok(cases > 1000, `swept ${cases} cases`);
});

test('all fields on Object.prototype at once never change an accepted result or escalate any export', () => {
  for (const donor of [approved, derived, quarantined]) {
    const entries = FIELDS.filter(field => donor[field] !== undefined).map(field => [field, donor[field]])
      .concat([['verified_review_request_digest', approvedDigest], ['actor_id', 'owner.alice'], ['decision', 'approve-instruction']]);
    withPollution(Object.prototype, entries, () => {
      for (const fixture of [unreviewed, FIXTURES.rawRemote, localModel]) {
        const result = outcome(() => normalizeSemanticMemoryProvenance({ ...fixture }));
        if (result.ok) assert.equal(result.value.authority_tier, 'untrusted-data');
        const use = outcome(() => evaluateSemanticMemoryUse({ ...fixture }, 'privileged-instruction'));
        assert.notEqual(use.ok && use.value.allow, true);
        assert.equal(outcome(() => ownerReviewSemanticMemory({ ...fixture }, {})).ok, false);
      }
    });
  }
});

test('Array.prototype pollution (fields and indices) does not change any export', () => {
  const entries = [...FIELDS, ...OPTION_FIELDS, '0', '1', '2', '3'].map(key => [key, approved[key] ?? 'owner.alice']);
  const expected = Object.fromEntries(Object.entries(FIXTURES).map(([name, fixture]) => [name, [
    outcome(() => normalizeSemanticMemoryProvenance({ ...fixture })),
    outcome(() => evaluateSemanticMemoryUse({ ...fixture }, 'privileged-instruction', { verified_review_request_digest: approvedDigest })),
    outcome(() => semanticMemoryReviewIntent({ ...fixture }, 'approve-memory'))
  ]]));
  withPollution(Array.prototype, entries, () => {
    for (const [name, fixture] of Object.entries(FIXTURES)) {
      assert.deepEqual([
        outcome(() => normalizeSemanticMemoryProvenance({ ...fixture })),
        outcome(() => evaluateSemanticMemoryUse({ ...fixture }, 'privileged-instruction', { verified_review_request_digest: approvedDigest })),
        outcome(() => semanticMemoryReviewIntent({ ...fixture }, 'approve-memory'))
      ], expected[name], name);
    }
  });
  for (const [key] of entries) assert.equal(Object.hasOwn(Array.prototype, key), false);
});

test('inherited verified_review_request_digest cannot authorize privileged instruction use', () => {
  withPollution(Object.prototype, [['verified_review_request_digest', approvedDigest]], () => {
    assert.deepEqual(evaluateSemanticMemoryUse(approved, 'privileged-instruction'),
      { allow: false, code: 'semantic_memory_review_evidence_unverified' });
    assert.deepEqual(evaluateSemanticMemoryUse(approved, 'privileged-instruction', {}),
      { allow: false, code: 'semantic_memory_review_evidence_unverified' });
    // Own option still works.
    assert.equal(evaluateSemanticMemoryUse(approved, 'privileged-instruction', { verified_review_request_digest: approvedDigest }).allow, true);
  });
  // Deny dominance: an inherited malformed digest still raises main's deny.
  withPollution(Object.prototype, [['verified_review_request_digest', 'not-a-digest']], () => {
    assert.throws(() => evaluateSemanticMemoryUse(approved, 'privileged-instruction'), /verified_review_request_digest/);
  });
});

test('inherited ownerReview options cannot perform a review transition', () => {
  const requestDigest = semanticMemoryReviewRequestDigest(unreviewed, 'approve-instruction');
  withPollution(Object.prototype, [['actor_id', 'owner.alice'], ['decision', 'approve-instruction']], () => {
    // On main both of these produced the owner-approved instruction record.
    assert.throws(() => ownerReviewSemanticMemory(unreviewed, { review_request_digest: requestDigest }), /actor_id/);
    assert.throws(() => ownerReviewSemanticMemory(unreviewed, { actor_id: 'owner.alice', review_request_digest: requestDigest }), /decision is invalid/);
    // Own options are unaffected.
    assert.deepEqual(ownerReviewSemanticMemory(unreviewed, { actor_id: 'owner.alice', review_request_digest: requestDigest, decision: 'approve-instruction' }), approved);
  });
  // A record that carries review_request_digest as an own field shadows the
  // pollution, so only the option read is exercised: it must read as absent.
  const quarantineDigest = semanticMemoryReviewRequestDigest(approved, 'quarantine');
  withPollution(Object.prototype, [['review_request_digest', quarantineDigest]], () => {
    assert.throws(() => ownerReviewSemanticMemory(approved, { actor_id: 'owner.alice', decision: 'quarantine' }), /review_request_digest/);
  });
  // review_request_digest is also a record field: inherited, it still denies (as on main).
  withPollution(Object.prototype, [['review_request_digest', requestDigest]], () => {
    assert.throws(() => ownerReviewSemanticMemory(unreviewed, { actor_id: 'owner.alice', decision: 'approve-instruction' }));
  });
});

test('inherited derive options read as absent; own options and the knowledge default are unchanged', () => {
  const own = { object_id: 'memory.derived.1', content_digest: C, ingestion_intent_id: 'intent.1', request_digest: B };
  withPollution(Object.prototype, [['semantic_class', 'instruction-candidate']], () => {
    const plain = deriveSemanticMemoryProvenance(approved, { object_id: 'memory.derived.1', content_digest: C });
    assert.equal(plain.semantic_class, 'knowledge');
    assert.deepEqual(deriveSemanticMemoryProvenance(approved, own), derived);
  });
  // Optional parent fields (origin_principal / origin_runtime_id) absent on the
  // normalized parent read as absent, not from the prototype.
  const rawLocalParent = { ...localModel };
  delete rawLocalParent.provenance_digest;
  withPollution(Object.prototype, [['origin_principal', 'agent.evil']], () => {
    const child = deriveSemanticMemoryProvenance(rawLocalParent, { object_id: 'memory.derived.3', content_digest: C });
    assert.equal(child.origin_principal, 'owner.alice');
  });
  const ownerRaw = { ...FIXTURES.rawOwner };
  withPollution(Object.prototype, [['origin_runtime_id', 'runtime.evil']], () => {
    const child = deriveSemanticMemoryProvenance(ownerRaw, { object_id: 'memory.derived.4', content_digest: C });
    assert.equal(Object.hasOwn(child, 'origin_runtime_id'), false);
  });
  // ingestion_intent_id / request_digest share names with record fields, so use
  // a parent that carries them as own fields (shadowing the pollution).
  withPollution(Object.prototype, [['ingestion_intent_id', 'intent.evil'], ['request_digest', C]], () => {
    const child = deriveSemanticMemoryProvenance(derived, { object_id: 'memory.derived.2', content_digest: A });
    assert.equal(Object.hasOwn(child, 'ingestion_intent_id'), false);
    assert.equal(Object.hasOwn(child, 'request_digest'), false);
  });
  // ...and with an un-shadowed parent the inherited value still denies, as on main.
  withPollution(Object.prototype, [['request_digest', C]], () => {
    assert.throws(() => deriveSemanticMemoryProvenance(approved, own), /provenance digest does not match/);
  });
  withPollution(Object.prototype, [['object_id', 'memory.evil']], () => {
    assert.throws(() => deriveSemanticMemoryProvenance(approved, { content_digest: C }), /object_id/);
  });
  withPollution(Object.prototype, [['content_digest', C]], () => {
    assert.throws(() => deriveSemanticMemoryProvenance(approved, { object_id: 'memory.derived.1' }), /content_digest/);
  });
  // Deny dominance: an inherited invalid semantic_class still denies.
  withPollution(Object.prototype, [['semantic_class', 'not-a-class']], () => {
    assert.throws(() => deriveSemanticMemoryProvenance(approved, { object_id: 'memory.derived.1', content_digest: C }), /semantic_class/);
  });
});

test('deny dominance: inherited may_affect_authority, schema, or a throwing getter still deny', () => {
  withPollution(Object.prototype, [['may_affect_authority', true]], () => {
    assert.throws(() => normalizeSemanticMemoryProvenance(remoteInstruction()), /may_affect_authority/);
  });
  withPollution(Object.prototype, [['schema', 'axiom-semantic-memory-provenance.v0']], () => {
    assert.throws(() => normalizeSemanticMemoryProvenance(remoteInstruction()), /schema is unsupported/);
  });
  const sentinel = new Error('inherited getter sentinel');
  Object.defineProperty(Object.prototype, 'review_state', { configurable: true, get() { throw sentinel; } });
  try {
    assert.throws(() => normalizeSemanticMemoryProvenance(remoteInstruction()), error => error === sentinel);
  } finally {
    delete Object.prototype.review_state;
  }
});

test('null and non-object options keep the TypeError main throws', () => {
  assert.throws(() => ownerReviewSemanticMemory(unreviewed, null), TypeError);
  assert.throws(() => deriveSemanticMemoryProvenance(approved, null), TypeError);
  assert.throws(() => evaluateSemanticMemoryUse(approved, 'privileged-instruction', null), TypeError);
  assert.deepEqual(evaluateSemanticMemoryUse(approved, 'privileged-instruction', 7),
    { allow: false, code: 'semantic_memory_review_evidence_unverified' });
});
