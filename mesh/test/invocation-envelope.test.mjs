import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildNativeInvocationEnvelope,
  invocationEnvelopeDigest,
  validateInvocationEnvelope
} from '../src/lib/invocation-envelope.mjs';

function decision(overrides = {}) {
  return {
    policy_version: '1.0.0',
    policy_digest: 'b'.repeat(64),
    risk: 'low',
    timeout_ms: 4_000,
    requires_independent_approval: false,
    ...overrides
  };
}

function humanIntent() {
  return {
    intent_id: 'intent_invocation_human',
    principal: {
      id: 'owner.invocation-test',
      type: 'human',
      roles: ['administrator'],
      scopes: ['*']
    },
    action: 'system.echo',
    input: { message: 'hello' },
    purpose: 'test.conformance',
    data_scopes: ['memory.beta', 'memory.alpha', 'memory.beta']
  };
}

function machineIntent() {
  return {
    ...humanIntent(),
    intent_id: 'intent_invocation_machine',
    principal: {
      id: 'agent.invocation-test',
      type: 'agent',
      schema: 'axiom-machine-principal.v1',
      sponsor: 'owner.invocation-test',
      authority_digest: 'a'.repeat(64),
      runtime: {
        id: 'runtime.invocation-test',
        kind: 'local-process',
        software_digest: 'c'.repeat(64)
      },
      constraints: {
        budgets: {
          max_request_bytes: 8_192,
          max_requests_per_minute: 12,
          max_concurrent_requests: 1,
          max_execution_ms: 4_000,
          max_response_bytes: 65_536
        }
      }
    }
  };
}

test('native invocation envelope binds existing human request and policy facts', () => {
  const envelope = buildNativeInvocationEnvelope(humanIntent(), decision());

  assert.equal(envelope.schema, 'axiom-invocation-envelope.v1');
  assert.equal(envelope.protocol_profile, 'axiom-native-gateway.v1');
  assert.equal(envelope.caller.principal_id, 'owner.invocation-test');
  assert.deepEqual(envelope.request.data_scopes, ['memory.alpha', 'memory.beta']);
  assert.match(envelope.request.request_digest, /^[a-f0-9]{64}$/);
  assert.match(envelope.request.input_digest, /^[a-f0-9]{64}$/);
  assert.equal(envelope.authority.policy_digest, 'b'.repeat(64));
  assert.equal(envelope.limits.execution_timeout_ms, 4_000);
  assert.equal(envelope.limits.ingress, undefined);
  assert.match(invocationEnvelopeDigest(envelope), /^[a-f0-9]{64}$/);
});

test('machine invocation envelope binds sponsor runtime authority and live ingress ceilings', () => {
  const envelope = buildNativeInvocationEnvelope(machineIntent(), decision());

  assert.equal(envelope.caller.machine.sponsor, 'owner.invocation-test');
  assert.equal(envelope.caller.machine.runtime_id, 'runtime.invocation-test');
  assert.equal(envelope.caller.machine.authority_digest, 'a'.repeat(64));
  assert.deepEqual(envelope.limits.ingress, {
    max_request_bytes: 8_192,
    max_requests_per_minute: 12,
    max_concurrent_requests: 1
  });
});

test('invocation envelope rejects unsupported fields and protocol downgrade', () => {
  const envelope = buildNativeInvocationEnvelope(humanIntent(), decision());

  assert.throws(
    () => validateInvocationEnvelope({ ...envelope, delegation_chain: [] }),
    /unsupported or missing fields/
  );
  assert.throws(
    () => validateInvocationEnvelope({ ...envelope, protocol_profile: 'axiom-native-gateway.v0' }),
    /protocol profile is unsupported/
  );
});

test('invocation digest changes when authority or request identity changes', () => {
  const base = buildNativeInvocationEnvelope(machineIntent(), decision());
  const differentPolicy = buildNativeInvocationEnvelope(
    machineIntent(),
    decision({ policy_digest: 'd'.repeat(64) })
  );
  const changedAuthorityIntent = machineIntent();
  changedAuthorityIntent.principal.authority_digest = 'e'.repeat(64);
  const differentAuthority = buildNativeInvocationEnvelope(
    changedAuthorityIntent,
    decision()
  );

  assert.notEqual(invocationEnvelopeDigest(base), invocationEnvelopeDigest(differentPolicy));
  assert.notEqual(invocationEnvelopeDigest(base), invocationEnvelopeDigest(differentAuthority));
});
