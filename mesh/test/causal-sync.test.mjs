import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import test from 'node:test';
import {
  compareVersionVectors,
  verifyCausalBundle,
  verifyCausalUpdate
} from '../src/lib/causal-sync.mjs';
import { canonicalJson, digestObject, sha256 } from '../src/lib/canonical.mjs';
import { verifySyncBundle } from '../src/verify-sync.mjs';

test('version vectors distinguish causal order from concurrency', () => {
  assert.equal(compareVersionVectors({ 'node:a': 2 }, { 'node:a': 1 }), 'dominates');
  assert.equal(compareVersionVectors({ 'node:a': 1 }, { 'node:a': 2 }), 'dominated');
  assert.equal(compareVersionVectors({ 'node:a': 1 }, { 'node:a': 1 }), 'equal');
  assert.equal(
    compareVersionVectors({ 'node:a': 1 }, { 'node:b': 1 }),
    'concurrent'
  );
  assert.equal(
    compareVersionVectors({ 'node:a': 2, 'node:b': 1 }, { 'node:a': 1, 'node:b': 1 }),
    'dominates'
  );
});

test('causal bundles bind update values, vectors, source keys, and bundle membership', () => {
  const keys = generateKeyPairSync('ed25519');
  const publicKey = keys.publicKey.export({ type: 'spki', format: 'pem' });
  const createdAt = new Date().toISOString();
  const update = signedUpdate({
    keys,
    publicKey,
    owner: 'owner:causal',
    nodeId: 'node:causal',
    namespace: 'notes',
    recordId: 'record:one',
    value: { title: 'offline-safe' },
    vector: { 'node:causal': 1 },
    occurredAt: createdAt,
    nonce: 'update-one'
  });
  const bundle = signedBundle({
    keys,
    publicKey,
    owner: 'owner:causal',
    nodeId: 'node:causal',
    updates: [update],
    createdAt,
    nonce: 'bundle-one'
  });
  const expectedPublicKeyDigest = sha256(publicKey);
  const verified = verifyCausalBundle(bundle, {
    expectedOwner: 'owner:causal',
    expectedPublicKeyDigest
  });
  assert.equal(verified.updates.length, 1);
  assert.equal(verified.updates[0].statement.value.title, 'offline-safe');
  assert.deepEqual(
    verifySyncBundle(bundle, { expectedPublicKeyDigest }),
    {
      valid: true,
      format: 'axiom-causal-sync-bundle.v1',
      owner: 'owner:causal',
      source_node_id: 'node:causal',
      public_key_digest: expectedPublicKeyDigest,
      bundle_digest: verified.bundle_digest,
      update_count: 1,
      update_ids: [verified.updates[0].update_id]
    }
  );

  assert.throws(
    () => verifyCausalBundle({
      ...bundle,
      updates: [{ ...bundle.updates[0], value: { title: 'tampered' } }]
    }),
    /value digest|signature/
  );
  assert.throws(
    () => verifyCausalBundle({ ...bundle, nonce: 'changed-after-signing' }),
    /bundle signature/
  );
  assert.throws(
    () => verifySyncBundle(bundle, { expectedPublicKeyDigest: '0'.repeat(64) }),
    /admitted node/
  );
});

test('causal updates reject invalid authorship counters', () => {
  const keys = generateKeyPairSync('ed25519');
  const publicKey = keys.publicKey.export({ type: 'spki', format: 'pem' });
  const occurredAt = new Date().toISOString();
  const invalid = signedUpdate({
    keys,
    publicKey,
    owner: 'owner:causal',
    nodeId: 'node:causal',
    namespace: 'notes',
    recordId: 'record:one',
    value: { title: 'invalid-counter' },
    vector: { 'node:other': 1 },
    occurredAt,
    nonce: 'invalid-counter'
  });
  assert.throws(() => verifyCausalUpdate(invalid), /source-node counter/);
});

function signedUpdate({
  keys,
  publicKey,
  owner,
  nodeId,
  namespace,
  recordId,
  value,
  vector,
  occurredAt,
  nonce,
  resolves = [],
  operation = 'put'
}) {
  const statement = {
    format: 'axiom-causal-update.v1',
    owner,
    node_id: nodeId,
    namespace,
    record_id: recordId,
    operation,
    value: operation === 'put' ? value : null,
    value_digest: digestObject(operation === 'put' ? value : null),
    vector,
    resolves: [...resolves].sort(),
    occurred_at: occurredAt,
    nonce
  };
  return {
    ...statement,
    public_key: publicKey,
    signature: sign(
      null,
      Buffer.from(canonicalJson(statement)),
      keys.privateKey
    ).toString('base64url')
  };
}

function signedBundle({
  keys,
  publicKey,
  owner,
  nodeId,
  updates,
  createdAt,
  nonce
}) {
  const statement = {
    format: 'axiom-causal-sync-bundle.v1',
    owner,
    source_node_id: nodeId,
    updates,
    created_at: createdAt,
    nonce
  };
  return {
    ...statement,
    public_key: publicKey,
    signature: sign(
      null,
      Buffer.from(canonicalJson(statement)),
      keys.privateKey
    ).toString('base64url')
  };
}
