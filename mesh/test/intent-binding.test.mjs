import assert from 'node:assert/strict';
import test from 'node:test';
import {
  intentRequestBinding,
  intentRequestDigest,
  sameIntentRequest
} from '../src/lib/intent-binding.mjs';

const human = {
  id: 'owner.intent-binding',
  type: 'human',
  roles: ['administrator'],
  scopes: ['*']
};

const machine = {
  ...human,
  id: 'agent.intent-binding',
  type: 'agent',
  schema: 'axiom-machine-principal.v1',
  authority_digest: 'a'.repeat(64)
};

test('canonical request identity normalizes data-scope order and duplicates', () => {
  const left = {
    principal: human,
    action: 'system.echo',
    input: { message: 'same effect' },
    purpose: 'test.conformance',
    data_scopes: ['memory.beta', 'memory.alpha', 'memory.beta']
  };
  const right = {
    ...left,
    data_scopes: ['memory.alpha', 'memory.beta']
  };

  assert.deepEqual(intentRequestBinding(left).data_scopes, [
    'memory.alpha',
    'memory.beta'
  ]);
  assert.equal(intentRequestDigest(left), intentRequestDigest(right));
  assert.equal(sameIntentRequest(left, right), true);
});

test('transient intent fields do not change request identity', () => {
  const base = {
    principal: human,
    action: 'system.echo',
    input: { message: 'same effect' },
    purpose: 'test.conformance',
    data_scopes: []
  };
  const retried = {
    ...base,
    intent_id: 'intent_retry',
    submitted_at: '2099-01-01T00:00:00.000Z',
    confirmations: ['confirm.example'],
    approval_ids: ['approval_example']
  };

  assert.equal(intentRequestDigest(base), intentRequestDigest(retried));
});

test('machine authority digest is part of exact request identity', () => {
  const base = {
    principal: machine,
    action: 'system.echo',
    input: { message: 'authority-bound' },
    purpose: 'test.conformance',
    data_scopes: []
  };
  const changedAuthority = {
    ...base,
    principal: {
      ...machine,
      authority_digest: 'b'.repeat(64)
    }
  };

  assert.equal(
    intentRequestBinding(base).machine_authority_digest,
    'a'.repeat(64)
  );
  assert.notEqual(
    intentRequestDigest(base),
    intentRequestDigest(changedAuthority)
  );
});
