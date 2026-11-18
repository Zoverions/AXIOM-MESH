import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { sha256 } from '../src/lib/canonical.mjs';

const CONFIG = new URL('../config/', import.meta.url);
const EMPTY_SHA256 = `sha256:${sha256(Buffer.alloc(0))}`;
const HEX = (ch) => `sha256:${ch.repeat(64)}`;
const NOW = '2026-09-08T12:00:00.000Z';

async function loadContracts() {
  try {
    return await import('../src/lib/epistemic-contracts.mjs');
  } catch (error) {
    assert.fail(`epistemic contracts implementation unavailable: ${error?.code ?? error?.message}`);
  }
}

async function readRequired(name) {
  try {
    return await readFile(new URL(name, CONFIG), 'utf8');
  } catch (error) {
    assert.fail(`required epistemic schema missing: ${name} (${error?.code ?? error?.message})`);
  }
}

function common(overrides = {}) {
  return {
    schema: 'axiom-epistemic-record.v0',
    id: 'source:alpha',
    object_type: 'source',
    schema_version: '0.1.0',
    created_at: NOW,
    created_by: 'fixture:human',
    revision: 1,
    provenance_refs: [],
    canonical_state: 'proposal',
    machine_generated: false,
    authority_effect: 'none',
    ...overrides
  };
}

function sourceInput(overrides = {}) {
  return common({
    source_type: 'paper',
    title: 'A bounded source',
    retrieved_at: NOW,
    original_content_digest: HEX('1'),
    ...overrides
  });
}

function claimInput(overrides = {}) {
  return common({
    id: 'claim:alpha',
    object_type: 'claim',
    proposition: 'Measured outcome X differs from baseline Y.',
    claim_kind: 'observation_report',
    scope: 'fixture population',
    source_anchors: [{ source_ref: 'source:alpha', start_offset: 10, end_offset: 42, quote_digest: HEX('2') }],
    ...overrides
  });
}

function evidenceInput(overrides = {}) {
  return common({
    id: 'evidence:alpha',
    object_type: 'evidence',
    target_claim_ref: 'claim:alpha',
    direction: 'supports',
    evidence_type: 'dataset',
    source_refs: ['source:alpha'],
    independence_state: 'unknown',
    applicability_scope: 'fixture population',
    ...overrides
  });
}

test('approved E0 schema bytes and composition semantics are exact', async () => {
  const expected = {
    'epistemic-record-v0.schema.json': 'd647878abe6912d580ac60122b4a15a2ae845b411d4236630ce19a62deb0c7ae',
    'epistemic-source-v0.schema.json': 'd359eb1238eb44d573ff273aa8b89780b42b85b7e67f0f80f2a47f3eae6a3868',
    'epistemic-claim-v0.schema.json': 'a7c6b20afcb223a2e48db9543d5e332bb8de9b752110d68b80582e63f02f2c87',
    'epistemic-evidence-v0.schema.json': '207ab9477334eb6654869abc9e688a7cbe40ba5065c72f349f22ede8d944d628'
  };
  const parsed = {};
  for (const [name, digest] of Object.entries(expected)) {
    const raw = await readRequired(name);
    assert.equal(sha256(raw), digest, `${name} byte identity drifted`);
    parsed[name] = JSON.parse(raw);
  }
  const base = parsed['epistemic-record-v0.schema.json'];
  assert.equal(Object.hasOwn(base, 'additionalProperties'), false);
  for (const name of ['epistemic-source-v0.schema.json', 'epistemic-claim-v0.schema.json', 'epistemic-evidence-v0.schema.json']) {
    assert.equal(parsed[name].allOf[0].$ref, 'urn:axiom:epistemic-record:v0');
    assert.equal(parsed[name].unevaluatedProperties, false);
  }
});

test('Source Claim and Evidence proposals validate with deterministic self-excluding content digests', async () => {
  const { finalizeEpistemicProposal, validateEpistemicProposal, computeEpistemicContentDigest } = await loadContracts();
  for (const input of [sourceInput(), claimInput(), evidenceInput()]) {
    const proposal = finalizeEpistemicProposal(input);
    assert.match(proposal.content_digest, /^sha256:[0-9a-f]{64}$/);
    assert.equal(proposal.content_digest, computeEpistemicContentDigest(proposal));
    assert.deepEqual(validateEpistemicProposal(proposal), proposal);
  }
});

test('canonical key ordering is digest invariant while claim scope is identity-significant', async () => {
  const { finalizeEpistemicProposal } = await loadContracts();
  const source = sourceInput();
  const reversed = Object.fromEntries(Object.entries(source).reverse());
  assert.equal(finalizeEpistemicProposal(source).content_digest, finalizeEpistemicProposal(reversed).content_digest);
  assert.notEqual(
    finalizeEpistemicProposal(claimInput({ scope: 'scope:a' })).content_digest,
    finalizeEpistemicProposal(claimInput({ scope: 'scope:b' })).content_digest
  );
});

test('authority, canonical-state, machine attribution, source-byte and anchor boundaries fail closed', async () => {
  const { finalizeEpistemicProposal, validateEpistemicProposal } = await loadContracts();
  assert.throws(() => finalizeEpistemicProposal(sourceInput({ authority_effect: 'grant' })), /authority_effect/i);
  assert.throws(() => finalizeEpistemicProposal(sourceInput({ canonical_state: 'canonical' })), /canonical_state/i);
  assert.throws(() => finalizeEpistemicProposal(sourceInput({ machine_generated: true })), /generation_metadata/i);
  assert.throws(() => finalizeEpistemicProposal(sourceInput({ original_content_digest: EMPTY_SHA256 })), /empty/i);
  assert.throws(() => finalizeEpistemicProposal(claimInput({ source_anchors: [{ source_ref: 'source:alpha', start_offset: 42, end_offset: 10 }] })), /offset/i);
  assert.throws(() => finalizeEpistemicProposal(evidenceInput({ limitations: [42] })), /limitations/i);
  const unknown = finalizeEpistemicProposal(evidenceInput({ independence_state: 'unknown' }));
  assert.equal(validateEpistemicProposal(unknown).independence_state, 'unknown');
});

test('reused canonical discipline rejects hidden or non-plain state and aggregate oversized objects', async () => {
  const { computeEpistemicContentDigest, finalizeEpistemicProposal } = await loadContracts();
  const sparse = sourceInput({ authors: new Array(1) });
  assert.throws(() => computeEpistemicContentDigest(sparse), /sparse/i);

  const accessor = sourceInput();
  Object.defineProperty(accessor, 'title', { enumerable: true, get: () => 'hidden accessor' });
  assert.throws(() => computeEpistemicContentDigest(accessor), /data property|accessor/i);

  const custom = Object.create({ inherited: true });
  Object.assign(custom, sourceInput());
  assert.throws(() => computeEpistemicContentDigest(custom), /plain/i);

  const symbolState = sourceInput();
  symbolState[Symbol('hidden')] = 'state';
  assert.throws(() => computeEpistemicContentDigest(symbolState), /symbol/i);

  const oversized = sourceInput({
    title: 't'.repeat(1024),
    authors: Array.from({ length: 64 }, (_, i) => `author:${i}:${'a'.repeat(240)}`),
    external_identifiers: Array.from({ length: 32 }, (_, i) => `urn:fixture:${i}:${'e'.repeat(990)}`),
    parent_source_refs: Array.from({ length: 32 }, (_, i) => `source:parent:${i}:${'p'.repeat(220)}`),
    provenance_refs: Array.from({ length: 64 }, (_, i) => `prov:${i}:${'v'.repeat(230)}`),
    raw_artifact_ref: 'r'.repeat(2048)
  });
  assert.throws(() => finalizeEpistemicProposal(oversized), /64 KiB|65536|size/i);
});
