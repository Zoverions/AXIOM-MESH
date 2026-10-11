import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';

import { digestObject, sha256 } from '../src/lib/canonical.mjs';
import { ensureMeshIdentity } from '../src/lib/identity.mjs';
import { intentRequestDigest } from '../src/lib/intent-binding.mjs';
import { loadDataProtector } from '../src/lib/protector.mjs';
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

// Retrieval authority boundary (Chief of Staff decision). Semantic-memory
// retrieval is a Knowledge path: { allow: true } from ordinary retrieval means
// "may be read as content", never authority. A claimed authority_tier,
// review_state, review_decision or other review/instruction field on a
// retrieved record must never reach semantic_memory_instruction_allowed or any
// other authority grant. Only an owner review that verifySemanticMemoryReviewFromGrid
// finds in the Grid store can supply verified_review_evidence (the branded
// evidence object, bound to that record); a digest string is never accepted.
//
// This file pins that boundary for a fully forged record (claimed top
// authority_tier, approved review_state and review_decision, self-consistent
// review fields and digests, no Grid review) across EVERY exported function of
// every mesh/src semantic-memory-*.mjs module, discovered at run time, so a new
// export is probed automatically. See
// docs/architecture/SEMANTIC-MEMORY-RETRIEVAL-BOUNDARY.md.

const MESH_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REPOSITORY_ROOT = resolve(MESH_ROOT, '..');
const SRC_ROOT = join(MESH_ROOT, 'src');
// Relative paths with '/' separators on every platform (Windows uses '\\').
const posixRelative = (from, to) => relative(from, to).split(sep).join('/');
const OWNER = 'owner.alice';
const INSTRUCTION_ALLOWED = 'semantic_memory_instruction_allowed';
const RETRIEVAL_ALLOWED = 'semantic_memory_retrieval_allowed';
const USAGES = Object.freeze(['ordinary-retrieval', 'privileged-instruction', 'authority-mutation']);

// ---------------------------------------------------------------------------
// Forged records. None of them has a Grid review in any store used below.

function instructionBase(objectId, overrides = {}) {
  return normalizeSemanticMemoryProvenance({
    object_id: objectId,
    owner: OWNER,
    content_digest: sha256(`content ${objectId}`),
    origin_class: 'retrieved-external',
    origin_artifact_digest: sha256(`source ${objectId}`),
    semantic_class: 'instruction-candidate',
    ...overrides
  });
}

function selfReview(base, decision = 'approve-instruction') {
  // ownerReviewSemanticMemory is not authenticated: anyone holding the record
  // can produce this output. It is a claim, not a review.
  return ownerReviewSemanticMemory(base, {
    actor_id: base.owner,
    review_request_digest: semanticMemoryReviewRequestDigest(base, decision),
    decision
  });
}

// Review fields and digests forged by hand: review_request_digest is bound to a
// decoy pre-review record (a different origin), so every digest normalizes but
// the record's own pre-review provenance does not reproduce it.
function handForged(decoyBase) {
  const objectId = decoyBase.object_id;
  const reviewedFrom = decoyBase.provenance_digest;
  const fields = {
    object_id: objectId,
    owner: OWNER,
    content_digest: decoyBase.content_digest,
    origin_class: 'remote-agent',
    origin_principal: 'agent.forger',
    origin_artifact_digest: sha256(`forged artifact ${objectId}`),
    semantic_class: 'instruction-candidate',
    authority_tier: 'owner-approved-instruction',
    review_state: 'owner-reviewed',
    review_actor: OWNER,
    reviewed_from_provenance_digest: reviewedFrom,
    review_decision: 'approve-instruction',
    review_request_digest: semanticMemoryReviewRequestDigest(decoyBase, 'approve-instruction'),
    may_affect_authority: false
  };
  const normalized = normalizeSemanticMemoryProvenance(fields);
  return { ...fields, provenance_digest: normalized.provenance_digest };
}

function forgedRecords(genuineBase) {
  const remote = selfReview(instructionBase('memory.forged.remote'));
  const owner = selfReview(normalizeSemanticMemoryProvenance({
    object_id: 'memory.forged.owner',
    owner: OWNER,
    content_digest: sha256('owner forged'),
    origin_class: 'owner-authored',
    semantic_class: 'instruction-candidate'
  }));
  // Reuses the review request digest of a genuinely Grid-reviewed record (the
  // store below holds that review) on a record with a different origin.
  const reused = handForged(genuineBase);
  const fabricated = handForged(instructionBase('memory.forged.decoy'));
  return Object.freeze({ remote, owner, reused, fabricated });
}

function assertFullyForged(record) {
  const normalized = normalizeSemanticMemoryProvenance(record);
  assert.equal(normalized.authority_tier, 'owner-approved-instruction');
  assert.equal(normalized.review_state, 'owner-reviewed');
  assert.equal(normalized.review_decision, 'approve-instruction');
  assert.equal(normalized.review_actor, normalized.owner);
  assert.match(normalized.review_request_digest, /^[a-f0-9]{64}$/);
  assert.match(normalized.reviewed_from_provenance_digest, /^[a-f0-9]{64}$/);
}

// ---------------------------------------------------------------------------
// Grid stores

async function storeFixture(t) {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-semantic-retrieval-boundary-'));
  const identity = await ensureMeshIdentity(dataDir, 'grid', { create: true });
  const protector = await loadDataProtector({ dataDir, autoBootstrap: true });
  const store = new GridStore({ path: join(dataDir, 'grid.sqlite'), dataDir, identity, protector });
  t.after(async () => {
    store.close();
    await rm(dataDir, { recursive: true, force: true });
  });
  return store;
}

function appendCompletedReview(store, record, intentId, traceId) {
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
}

async function fixtures(t) {
  const genuineBase = instructionBase('memory.genuine.reviewed');
  const genuine = selfReview(genuineBase);
  const emptyStore = await storeFixture(t);
  const reviewStore = await storeFixture(t);
  appendCompletedReview(reviewStore, genuine, 'intent.genuine.review', 'trace.genuine.review');
  // Genuine evidence for the genuine record: replaying it onto a forged record
  // must never grant (the 'reused' forged record even shares its request digest).
  const genuineEvidence = verifySemanticMemoryReviewFromGrid(reviewStore, genuine);
  return { genuine, genuineEvidence, emptyStore, reviewStore, forged: forgedRecords(genuineBase) };
}

// ---------------------------------------------------------------------------
// Grant detector. Reads own properties only, so it is unaffected by
// Object.prototype pollution. A forged record with no Grid review must never
// produce any of these markers.

function grantMarkers(value, path = '$', seen = new Set(), found = []) {
  if (value === null || (typeof value !== 'object' && typeof value !== 'function')) return found;
  if (seen.has(value)) return found;
  seen.add(value);
  const has = key => Object.hasOwn(value, key);
  if (has('code') && value.code === INSTRUCTION_ALLOWED) found.push(`${path}.code=${INSTRUCTION_ALLOWED}`);
  if (has('allow') && value.allow === true && !(has('code') && value.code === RETRIEVAL_ALLOWED)) {
    found.push(`${path}.allow=true (code ${has('code') ? value.code : 'absent'})`);
  }
  if (has('allow') && value.allow === true && has('code') && value.code === RETRIEVAL_ALLOWED
    && has('review_request_digest')) {
    found.push(`${path}: retrieval allow carries review_request_digest`);
  }
  if (has('downstream_effect_authorized') && value.downstream_effect_authorized === true) {
    found.push(`${path}.downstream_effect_authorized=true`);
  }
  if (has('verified_review_request_digest') && value.verified_review_request_digest !== undefined) {
    found.push(`${path}.verified_review_request_digest`);
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => grantMarkers(entry, `${path}[${index}]`, seen, found));
  } else {
    for (const key of Object.keys(value)) grantMarkers(value[key], `${path}.${key}`, seen, found);
  }
  return found;
}

function attempt(fn, args) {
  try {
    return { ok: true, value: fn(...args) };
  } catch (error) {
    return { ok: false, error };
  }
}

// ---------------------------------------------------------------------------
// Export discovery

async function semanticMemoryModuleFiles(directory = SRC_ROOT) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await semanticMemoryModuleFiles(path));
    else if (/^semantic-memory-.*\.mjs$/.test(entry.name)) files.push(path);
  }
  return files.sort();
}

async function exportedFunctions() {
  const functions = [];
  for (const file of await semanticMemoryModuleFiles()) {
    const namespace = await import(pathToFileURL(file).href);
    for (const [name, value] of Object.entries(namespace)) {
      if (typeof value === 'function') {
        functions.push({ id: `${posixRelative(MESH_ROOT, file)}#${name}`, name, fn: value });
      }
    }
  }
  return functions;
}

const KNOWN_EXPORTS = Object.freeze([
  'createSemanticMemoryLifecycle',
  'deriveSemanticMemoryLifecycle',
  'deriveSemanticMemoryProvenance',
  'evaluateSemanticMemoryLifecycleUse',
  'evaluateSemanticMemoryUse',
  'isSemanticMemoryGridEvidence',
  'normalizeSemanticMemoryProvenance',
  'ownerReviewSemanticMemory',
  'recordedSemanticMemoryReviewIntent',
  'semanticMemoryGridEvidenceBinding',
  'semanticMemoryGridEvidenceDigest',
  'semanticMemoryReviewIntent',
  'semanticMemoryReviewRequestDigest',
  'verifySemanticMemoryLifecycle',
  'verifySemanticMemoryReviewFromGrid',
  'verifySemanticMemoryReviewedFromProvenance'
]);

// Candidate arguments built ONLY from the forged record, what retrieval returns
// for it, and Grid stores that hold no review of it. No export takes Grid rows:
// the row checker is internal to verifySemanticMemoryReviewFromGrid, which
// reads the rows from a GridStore itself
// (semantic-memory-grid-evidence-store-bound.test.mjs pins this with
// fabricated rows).
function candidatePool(record, { emptyStore, reviewStore, genuineEvidence }) {
  const retrieval = evaluateSemanticMemoryUse(record, 'ordinary-retrieval');
  const lifecycle = createSemanticMemoryLifecycle(record);
  const bounded = createSemanticMemoryLifecycle(record, {
    retention_mode: 'bounded',
    expires_at: '2999-01-01T00:00:00.000Z'
  });
  const lifecycleRetrieval = evaluateSemanticMemoryLifecycleUse(record, lifecycle, 'ordinary-retrieval');
  const retrievalDigests = [
    ...new Set([retrieval, lifecycleRetrieval].flatMap(result =>
      Object.values(result).filter(value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value))))
  ];
  const probe = api => {
    // Internal helpers that hand back provenance cores (e.g. the #1940
    // own-read runner) are driven with the forged record and retrieval values.
    if (api && typeof api === 'object' && typeof api.evaluateUse === 'function') {
      return [
        api.evaluateUse(record, 'privileged-instruction', undefined),
        ...[...retrievalDigests, genuineEvidence].flatMap(value => [
          attempt(api.evaluateUse, [record, 'privileged-instruction', value]),
          attempt(api.evaluateUse, [record, 'privileged-instruction', undefined, value])
        ]).map(outcome => (outcome.ok ? outcome.value : null))
      ];
    }
    return api;
  };
  const options = [
    {},
    ...retrievalDigests.map(digest => ({ verified_review_request_digest: digest })),
    ...retrievalDigests.map(digest => ({ verified_review_evidence: digest })),
    { verified_review_request_digest: retrieval.authority_tier },
    { verified_review_evidence: genuineEvidence },
    { verified_review_evidence: { ...genuineEvidence } },
    { now: new Date('2000-01-01T00:00:00.000Z') },
    {
      actor_id: record.owner,
      decision: 'approve-instruction',
      review_request_digest: retrieval.provenance_digest
    },
    { chain: { valid: true, head: retrieval.provenance_digest } }
  ];
  return {
    retrieval,
    lifecycleRetrieval,
    retrievalDigests,
    genuineEvidence,
    first: [record, retrieval, lifecycleRetrieval, emptyStore, reviewStore, probe, undefined],
    rest: [
      record, retrieval, lifecycle, bounded,
      ...USAGES, 'approve-instruction',
      ...options,
      emptyStore, reviewStore, probe, undefined
    ]
  };
}

function* argumentTuples(first, rest, positions) {
  if (positions === 1) {
    for (const a of first) yield [a];
    return;
  }
  const tail = positions - 1;
  const indices = new Array(tail).fill(0);
  for (const a of first) {
    indices.fill(0);
    while (true) {
      yield [a, ...indices.map(index => rest[index])];
      let carry = tail - 1;
      while (carry >= 0 && ++indices[carry] === rest.length) indices[carry--] = 0;
      if (carry < 0) break;
    }
  }
}

// The pool is built before any pollution is installed, so pollution only
// affects the calls under test.
function sweepExports(exportsList, record, stores, pool = candidatePool(record, stores)) {
  const violations = [];
  const calls = new Map();
  const outputs = [];
  for (const { id, fn } of exportsList) {
    const positions = Math.min(Math.max(fn.length, 1) + 1, 4);
    let count = 0;
    for (const args of argumentTuples(pool.first, pool.rest, positions)) {
      count += 1;
      const outcome = attempt(fn, args);
      if (!outcome.ok) continue;
      const markers = grantMarkers(outcome.value);
      if (markers.length) {
        violations.push(`${id}(${args.map(describe).join(', ')}) -> ${markers.join('; ')}`);
      }
      if (outcome.value && typeof outcome.value === 'object' && outputs.length < 2_000) outputs.push(outcome.value);
    }
    calls.set(id, count);
  }
  // Second order: no output of any export, fed back as a record, unlocks
  // instruction use without Grid evidence.
  for (const output of outputs) {
    for (const usage of USAGES) {
      for (const verifiedOptions of [
        {},
        ...pool.retrievalDigests.map(d => ({ verified_review_request_digest: d })),
        ...pool.retrievalDigests.map(d => ({ verified_review_evidence: d })),
        { verified_review_evidence: pool.genuineEvidence }
      ]) {
        const outcome = attempt(evaluateSemanticMemoryUse, [output, usage, verifiedOptions]);
        if (outcome.ok && grantMarkers(outcome.value).length) {
          violations.push(`second-order evaluateSemanticMemoryUse(${describe(output)}, ${usage})`);
        }
      }
    }
  }
  return { violations, calls, pool };
}

function firstViolations(violations) {
  return violations.length > 10 ? [...violations.slice(0, 10), `... ${violations.length - 10} more`] : violations;
}

function describe(value) {
  if (value === undefined) return 'undefined';
  if (typeof value === 'function') return 'probe';
  if (value instanceof GridStore) return 'GridStore';
  if (typeof value === 'string') return JSON.stringify(value);
  try {
    return JSON.stringify(value).slice(0, 80);
  } catch {
    return Object.prototype.toString.call(value);
  }
}

// ---------------------------------------------------------------------------

test('fixtures are fully forged and the grant detector sees a genuine Grid-verified grant', async t => {
  const { genuine, reviewStore, forged } = await fixtures(t);
  for (const record of Object.values(forged)) assertFullyForged(record);

  // Positive control: the only sanctioned path, a review found in the Grid.
  const evidence = verifySemanticMemoryReviewFromGrid(reviewStore, genuine);
  const granted = evaluateSemanticMemoryUse(genuine, 'privileged-instruction', {
    verified_review_evidence: evidence
  });
  assert.equal(granted.code, INSTRUCTION_ALLOWED);
  assert.ok(grantMarkers(granted).length > 0, 'detector must flag a real grant');
  assert.ok(grantMarkers(evidence).length > 0, 'detector must flag verified Grid evidence');
  assert.deepEqual(grantMarkers(evaluateSemanticMemoryUse(genuine, 'ordinary-retrieval')), []);
});

test('ordinary retrieval of a forged record is content-only: allow:true with the claimed tier, never authority', async t => {
  const { forged, emptyStore, reviewStore, genuineEvidence } = await fixtures(t);
  for (const [label, record] of Object.entries(forged)) {
    const retrieval = evaluateSemanticMemoryUse(record, 'ordinary-retrieval');
    // The verifier's finding, pinned as intended Knowledge-path semantics.
    assert.deepEqual(Object.keys(retrieval).sort(), ['allow', 'authority_tier', 'code', 'provenance_digest'], label);
    assert.equal(retrieval.allow, true, label);
    assert.equal(retrieval.code, RETRIEVAL_ALLOWED, label);
    assert.equal(retrieval.authority_tier, 'owner-approved-instruction', label);

    const lifecycle = createSemanticMemoryLifecycle(record);
    const lifecycleRetrieval = evaluateSemanticMemoryLifecycleUse(record, lifecycle, 'ordinary-retrieval');
    assert.equal(lifecycleRetrieval.code, RETRIEVAL_ALLOWED, label);

    // The claimed tier/review never turns into authority on either evaluate path.
    for (const options of [undefined, {}, { verified_review_evidence: genuineEvidence }]) {
      const direct = evaluateSemanticMemoryUse(record, 'privileged-instruction', options);
      const viaLifecycle = evaluateSemanticMemoryLifecycleUse(record, lifecycle, 'privileged-instruction', options);
      assert.equal(direct.allow, false, `${label} direct`);
      assert.equal(viaLifecycle.allow, false, `${label} lifecycle`);
      assert.notEqual(direct.code, INSTRUCTION_ALLOWED);
      assert.notEqual(viaLifecycle.code, INSTRUCTION_ALLOWED);
    }
    // A digest string (the record's own review_request_digest or a retrieval
    // digest), under either option name, is not evidence: it throws.
    const normalized = normalizeSemanticMemoryProvenance(record);
    for (const digest of [normalized.review_request_digest, retrieval.provenance_digest, lifecycleRetrieval.lifecycle_digest]) {
      for (const key of ['verified_review_request_digest', 'verified_review_evidence']) {
        const options = { [key]: digest };
        const required = { name: 'ValidationError', details: { code: 'semantic_memory_review_evidence_required' } };
        assert.throws(() => evaluateSemanticMemoryUse(record, 'privileged-instruction', options), required, `${label} ${key}`);
        assert.throws(() => evaluateSemanticMemoryLifecycleUse(record, lifecycle, 'privileged-instruction', options), required, `${label} ${key}`);
      }
    }
    assert.equal(evaluateSemanticMemoryUse(record, 'authority-mutation').allow, false, label);

    // No Grid review exists, so the Grid path refuses to mint a verified digest.
    for (const store of [emptyStore, reviewStore]) {
      assert.throws(() => verifySemanticMemoryReviewFromGrid(store, record), label);
    }
    // A retrieval result is not a record and cannot be laundered into one.
    assert.throws(() => normalizeSemanticMemoryProvenance(retrieval));
    assert.throws(() => evaluateSemanticMemoryUse(retrieval, 'privileged-instruction'));
  }
});

test('every exported semantic-memory function is discovered and none grants authority to a forged record', async t => {
  const stores = await fixtures(t);
  const exportsList = await exportedFunctions();
  const names = new Set(exportsList.map(entry => entry.name));
  for (const known of KNOWN_EXPORTS) assert.ok(names.has(known), `export discovery missed ${known}`);
  assert.ok(exportsList.length >= KNOWN_EXPORTS.length);

  for (const [label, record] of Object.entries(stores.forged)) {
    const { violations, calls } = sweepExports(exportsList, record, stores);
    for (const { id } of exportsList) assert.ok(calls.get(id) > 0, `${id} was not probed`);
    assert.deepEqual(firstViolations(violations), [], `${label}: forged record reached an authority grant`);
  }
});

const RECORD_CLAIM_KEYS = Object.freeze([
  'authority_tier',
  'review_state',
  'review_actor',
  'review_request_digest',
  'reviewed_from_provenance_digest',
  'review_decision'
]);
const OUTPUT_MARKER_POLLUTION = Object.freeze({
  allow: true,
  code: INSTRUCTION_ALLOWED,
  downstream_effect_authorized: true,
  pre_review_provenance_verified: true
});

function withPollution(entries, run) {
  const saved = Object.keys(entries).map(key => [key, Object.getOwnPropertyDescriptor(Object.prototype, key)]);
  try {
    for (const [key, value] of Object.entries(entries)) {
      Object.defineProperty(Object.prototype, key, { value, writable: true, configurable: true, enumerable: false });
    }
    return run();
  } finally {
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(Object.prototype, key, descriptor);
      else delete Object.prototype[key];
    }
  }
}

function assertPollutionRestored(keys) {
  for (const key of keys) assert.equal(Object.hasOwn(Object.prototype, key), false, `${key} left on Object.prototype`);
}

test('forged review claims and grant markers on Object.prototype reach no authority grant through any export', async t => {
  const stores = await fixtures(t);
  const exportsList = await exportedFunctions();
  const unreviewed = instructionBase('memory.forged.remote');
  for (const [label, record] of Object.entries(stores.forged)) {
    const normalized = normalizeSemanticMemoryProvenance(record);
    const pollution = {
      ...Object.fromEntries(RECORD_CLAIM_KEYS.map(key => [key, normalized[key]])),
      ...OUTPUT_MARKER_POLLUTION
    };
    const keys = Object.keys(pollution);
    // Forged record with own claims, and an unreviewed record that would only
    // look reviewed through the prototype.
    for (const [variant, target] of [['own claims', record], ['inherited claims', unreviewed]]) {
      const pool = candidatePool(target, stores);
      const result = withPollution(pollution, () => sweepExports(exportsList, target, stores, pool));
      assertPollutionRestored(keys);
      assert.deepEqual(firstViolations(result.violations), [], `${label} / ${variant}: polluted forged record reached a grant`);
    }
  }
});

// Inherited evaluate OPTIONS (verified_review_evidence, the removed
// verified_review_request_digest, now) on the lifecycle path are closed by
// #1940 (lifecycle own-reads).
test('a forged verified review digest, evidence or clock on Object.prototype grants nothing through any export', async t => {
  const stores = await fixtures(t);
  const exportsList = await exportedFunctions();
  for (const [label, record] of Object.entries(stores.forged)) {
    const normalized = normalizeSemanticMemoryProvenance(record);
    const pollution = {
      ...Object.fromEntries(RECORD_CLAIM_KEYS.map(key => [key, normalized[key]])),
      verified_review_request_digest: normalized.review_request_digest,
      now: '2000-01-01T00:00:00.000Z'
    };
    const evidencePollution = { verified_review_evidence: stores.genuineEvidence };
    const pool = candidatePool(record, stores);
    const result = withPollution(pollution, () => sweepExports(exportsList, record, stores, pool));
    assertPollutionRestored(Object.keys(pollution));
    assert.deepEqual(firstViolations(result.violations), [], `${label}: polluted options reached a grant`);
    const evidenceResult = withPollution(evidencePollution, () => sweepExports(exportsList, record, stores, pool));
    assertPollutionRestored(Object.keys(evidencePollution));
    assert.deepEqual(firstViolations(evidenceResult.violations), [], `${label}: inherited genuine evidence reached a grant`);
  }
});

// ---------------------------------------------------------------------------
// Consumer allowlist. The retrieval-boundary audit found no src consumer of
// retrieval output outside the semantic-memory modules. A new importer, or a new
// src site that supplies verified_review_evidence (or names the removed
// verified_review_request_digest), must be audited against the boundary before
// it is added here.

const SOURCE_EXTENSIONS = /\.(mjs|cjs|js|ts|mts|cts|rs|py)$/;
const SKIPPED_DIRECTORIES = new Set(['node_modules', '.git', 'test', 'tests', '.data']);
const ALLOWED_IMPORTERS = Object.freeze([
  'mesh/src/grid/semantic-memory-review-evidence.mjs',
  'mesh/src/lib/semantic-memory-grid-evidence.mjs',
  'mesh/src/lib/semantic-memory-lifecycle.mjs',
  // Imports the evidence checker (isSemanticMemoryGridEvidence and the private
  // binding reader) from the Grid adapter; it mints nothing.
  'mesh/src/lib/semantic-memory-provenance.mjs'
].sort());
const ALLOWED_VERIFIED_DIGEST_SITES = Object.freeze([
  'mesh/src/grid/semantic-memory-review-evidence.mjs',
  'mesh/src/lib/semantic-memory-lifecycle.mjs',
  'mesh/src/lib/semantic-memory-provenance.mjs'
]);
// Sites that read the verified_review_evidence option: the two evaluate paths.
const ALLOWED_VERIFIED_EVIDENCE_SITES = Object.freeze([
  'mesh/src/lib/semantic-memory-lifecycle.mjs',
  'mesh/src/lib/semantic-memory-provenance.mjs'
]);
// The row checker is a non-exported function of the Grid adapter (#1941
// follow-up); it is defined and called only there.
const ALLOWED_GRID_EVIDENCE_CALLERS = Object.freeze([
  'mesh/src/grid/semantic-memory-review-evidence.mjs'
]);

async function sourceTrees(directory = REPOSITORY_ROOT) {
  const trees = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!entry.isDirectory() || SKIPPED_DIRECTORIES.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.name === 'src') trees.push(path);
    else trees.push(...await sourceTrees(path));
  }
  return trees;
}

async function sourceFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (SKIPPED_DIRECTORIES.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(path));
    else if (SOURCE_EXTENSIONS.test(entry.name)) files.push(path);
  }
  return files;
}

test('only the audited semantic-memory modules consume retrieval output or supply a verified review digest', async () => {
  const trees = await sourceTrees();
  assert.ok(trees.some(tree => posixRelative(REPOSITORY_ROOT, tree) === 'mesh/src'), 'mesh/src must be scanned');
  const importers = [];
  const verifiedDigestSites = [];
  const verifiedEvidenceSites = [];
  const gridEvidenceCallers = [];
  for (const tree of trees) {
    for (const file of await sourceFiles(tree)) {
      // Comments (JSDoc that documents the boundary) are not consumers.
      const text = (await readFile(file, 'utf8'))
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
      const path = posixRelative(REPOSITORY_ROOT, file);
      if (/semantic-memory-(provenance|lifecycle|grid-evidence|review-evidence)(\.mjs)?['"]/.test(text)) {
        importers.push(path);
      }
      if (text.includes('verified_review_request_digest')) verifiedDigestSites.push(path);
      if (text.includes('verified_review_evidence')) verifiedEvidenceSites.push(path);
      if (/verifySemanticMemoryGridEvidence\s*\(/.test(text)) gridEvidenceCallers.push(path);
    }
  }
  const message = 'new semantic-memory consumer: audit it against docs/architecture/SEMANTIC-MEMORY-RETRIEVAL-BOUNDARY.md';
  assert.deepEqual(importers.sort(), [...ALLOWED_IMPORTERS], message);
  assert.deepEqual(verifiedDigestSites.sort(), [...ALLOWED_VERIFIED_DIGEST_SITES], message);
  assert.deepEqual(verifiedEvidenceSites.sort(), [...ALLOWED_VERIFIED_EVIDENCE_SITES], message);
  assert.deepEqual(gridEvidenceCallers.sort(), [...ALLOWED_GRID_EVIDENCE_CALLERS], message);
  assert.ok(basename(fileURLToPath(import.meta.url)).startsWith('semantic-memory-'));
});
