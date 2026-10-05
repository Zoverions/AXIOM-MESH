import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  SELF_BUNDLE_INDEX_SCHEMA,
  selfBundleIndexDigest,
  validateSelfBundleIndex
} from '../src/lib/self-bundle-index.mjs';

const DIGEST = 'a'.repeat(64);
const OTHER_DIGEST = 'b'.repeat(64);

function validBundle() {
  return {
    schema: 'axiom-self-bundle-index.v0',
    version: 0,
    status: 'inert-contract-laboratory',
    bundle_id: 'self.personal.v1',
    principal_id: 'agent.personal.primary',
    created_at: '2026-08-29T12:00:00.000Z',
    predecessor_bundle: null,
    agent_composition: { ref: 'composition.personal.primary', digest: DIGEST },
    personal_agent_pack: { ref: 'pack.personal.v2', digest: DIGEST },
    semantic_state: [{
      claim_id: 'claim.worldview.001',
      ref: 'semantic.claim.worldview.001',
      digest: DIGEST,
      required_for_continuity: true
    }],
    contains_secret_material: false,
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  };
}

function successorBundle() {
  const predecessor = validBundle();
  const successor = validBundle();
  successor.bundle_id = 'self.personal.v2';
  successor.created_at = '2026-08-29T13:00:00.000Z';
  successor.predecessor_bundle = {
    ref: predecessor.bundle_id,
    digest: selfBundleIndexDigest(predecessor)
  };
  return { predecessor, successor };
}

test('validates an inert root self bundle and returns deterministic metadata', () => {
  const document = validBundle();
  const result = validateSelfBundleIndex(document);
  assert.equal(SELF_BUNDLE_INDEX_SCHEMA, document.schema);
  assert.equal(result.valid, true);
  assert.equal(result.schema, SELF_BUNDLE_INDEX_SCHEMA);
  assert.equal(result.bundle_id, document.bundle_id);
  assert.equal(result.principal_id, document.principal_id);
  assert.equal(result.authority_effect, 'none');
  assert.equal(result.network_effect, 'none');
  assert.equal(result.runtime_activation, false);
  assert.equal(result.bundle_digest, selfBundleIndexDigest(document));
  assert.match(result.bundle_digest, /^[a-f0-9]{64}$/);
  assert.equal(Object.isFrozen(result), true);
});

test('accepts a successor with an exact predecessor reference and digest', () => {
  const { predecessor, successor } = successorBundle();
  assert.equal(successor.predecessor_bundle.ref, predecessor.bundle_id);
  assert.equal(successor.predecessor_bundle.digest, selfBundleIndexDigest(predecessor));
  assert.doesNotThrow(() => validateSelfBundleIndex(successor));
});

test('digest is deterministic across object key order', () => {
  const first = validBundle();
  const second = Object.fromEntries(Object.entries(first).reverse());
  assert.equal(selfBundleIndexDigest(first), selfBundleIndexDigest(second));
});

test('unknown and credential-bearing fields fail closed', () => {
  const topLevel = validBundle();
  topLevel.password = 'not-allowed';
  assert.throws(() => validateSelfBundleIndex(topLevel), /unknown field/i);

  const composition = validBundle();
  composition.agent_composition.api_key = 'not-allowed';
  assert.throws(() => validateSelfBundleIndex(composition), /unknown field/i);

  const semantic = validBundle();
  semantic.semantic_state[0].refresh_token = 'not-allowed';
  assert.throws(() => validateSelfBundleIndex(semantic), /unknown field/i);
});

test('duplicate claim ids, invalid digests, and oversized semantic state fail closed', () => {
  const duplicate = validBundle();
  duplicate.semantic_state.push({ ...duplicate.semantic_state[0] });
  assert.throws(() => validateSelfBundleIndex(duplicate), /duplicate claim_id/i);

  const badDigest = validBundle();
  badDigest.personal_agent_pack.digest = 'not-a-digest';
  assert.throws(() => validateSelfBundleIndex(badDigest), /digest/i);

  const oversized = validBundle();
  oversized.semantic_state = Array.from({ length: 257 }, (_, index) => ({
    claim_id: `claim.${index}`,
    ref: `semantic.claim.${index}`,
    digest: index === 256 ? OTHER_DIGEST : DIGEST,
    required_for_continuity: index % 2 === 0
  }));
  assert.throws(() => validateSelfBundleIndex(oversized), /at most 256/i);
});

test('created_at must be a canonical ISO timestamp', () => {
  const document = validBundle();
  document.created_at = '2026-08-29T12:00:00Z';
  assert.throws(() => validateSelfBundleIndex(document), /canonical ISO timestamp/i);
});

test('secret, authority, network, and runtime activation boundaries fail closed', () => {
  for (const [field, value] of [
    ['contains_secret_material', true],
    ['authority_effect', 'grant'],
    ['network_effect', 'allowed'],
    ['runtime_activation', true]
  ]) {
    const document = validBundle();
    document[field] = value;
    assert.throws(() => validateSelfBundleIndex(document), /boundary|secret|authority|network|runtime/i);
  }
});

test('predecessor bundle is null or an exact reference pair', () => {
  const extra = validBundle();
  extra.predecessor_bundle = { ref: 'self.old', digest: DIGEST, authority: true };
  assert.throws(() => validateSelfBundleIndex(extra), /unknown field/i);

  const invalid = validBundle();
  invalid.predecessor_bundle = { ref: 'self.old', digest: 'bad' };
  assert.throws(() => validateSelfBundleIndex(invalid), /digest/i);
});

test('validation does not mutate a deeply frozen document', () => {
  const document = validBundle();
  const deepFreeze = value => {
    if (value && typeof value === 'object') {
      for (const child of Object.values(value)) deepFreeze(child);
      Object.freeze(value);
    }
    return value;
  };
  deepFreeze(document);
  assert.doesNotThrow(() => validateSelfBundleIndex(document));
});

test('validator module imports only the local canonical helper', async () => {
  const sourceUrl = new URL('../src/lib/self-bundle-index.mjs', import.meta.url);
  const source = await readFile(sourceUrl, 'utf8');
  const imports = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map(match => match[1]);
  assert.deepEqual(imports, ['./canonical.mjs']);
});
