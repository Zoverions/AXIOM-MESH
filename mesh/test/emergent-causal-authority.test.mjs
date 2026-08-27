import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import test from 'node:test';
import { canonicalJson, digestObject } from '../src/lib/canonical.mjs';
import { onlineSyncIntent } from '../src/lib/online-causal-sync.mjs';

test('signed causal authority-like state remains non-authorizing and maps only to local sync intent', () => {
  const node = nodeFixture();
  const hostileValue = {
    command: 'GO',
    decision: 'APPROVED',
    asserted_role: 'administrator',
    asserted_sponsor: 'owner.peer',
    asserted_approval_id: 'approval_peerpeerpeerpeer',
    asserted_grant: {
      action: 'system.hash',
      purpose: 'finance.transfer',
      destinations: ['remote-provider'],
      delegation: { allowed: true, max_depth: 99 }
    },
    requested_action: 'system.hash',
    requested_purpose: 'finance.transfer',
    control_words: ['OWNER', 'VETO', 'STOP']
  };
  const bundle = signedBundle(node, hostileValue);

  const intent = onlineSyncIntent(bundle);

  assert.deepEqual(Object.keys(intent).sort(), [
    'action',
    'data_scopes',
    'input',
    'purpose'
  ]);
  assert.equal(intent.action, 'sync.apply');
  assert.equal(intent.purpose, 'online-causal-exchange');
  assert.deepEqual(intent.data_scopes, ['sync:operator-notes']);
  assert.deepEqual(intent.input, { bundle });

  assert.equal(Object.hasOwn(intent, 'approval_ids'), false);
  assert.equal(Object.hasOwn(intent, 'confirmations'), false);
  assert.equal(Object.hasOwn(intent, 'sponsor'), false);
  assert.equal(Object.hasOwn(intent, 'roles'), false);
  assert.equal(Object.hasOwn(intent, 'grant'), false);
  assert.equal(Object.hasOwn(intent, 'delegation'), false);

  assert.equal(intent.input.bundle.updates[0].value.command, 'GO');
  assert.equal(intent.input.bundle.updates[0].value.decision, 'APPROVED');
  assert.equal(
    intent.input.bundle.updates[0].value.asserted_approval_id,
    'approval_peerpeerpeerpeer'
  );
  assert.equal(
    intent.input.bundle.updates[0].value.asserted_grant.delegation.allowed,
    true
  );
});

function nodeFixture() {
  const keys = generateKeyPairSync('ed25519');
  return {
    keys,
    publicKey: keys.publicKey.export({ type: 'spki', format: 'pem' }),
    owner: 'owner:causal-authority-test',
    nodeId: 'node:causal-authority-test'
  };
}

function signedBundle(node, value) {
  const occurredAt = '2026-08-27T19:45:00.000Z';
  const updateStatement = {
    format: 'axiom-causal-update.v1',
    owner: node.owner,
    node_id: node.nodeId,
    namespace: 'operator-notes',
    record_id: 'record:hostile-authority-state',
    operation: 'put',
    value,
    value_digest: digestObject(value),
    vector: { [node.nodeId]: 1 },
    resolves: [],
    occurred_at: occurredAt,
    nonce: 'causal-authority-update'
  };
  const update = {
    ...updateStatement,
    public_key: node.publicKey,
    signature: sign(
      null,
      Buffer.from(canonicalJson(updateStatement)),
      node.keys.privateKey
    ).toString('base64url')
  };
  const bundleStatement = {
    format: 'axiom-causal-sync-bundle.v1',
    owner: node.owner,
    source_node_id: node.nodeId,
    updates: [update],
    created_at: occurredAt,
    nonce: 'causal-authority-bundle'
  };
  return {
    ...bundleStatement,
    public_key: node.publicKey,
    signature: sign(
      null,
      Buffer.from(canonicalJson(bundleStatement)),
      node.keys.privateKey
    ).toString('base64url')
  };
}
