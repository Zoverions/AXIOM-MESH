import assert from 'node:assert/strict';
import test from 'node:test';
import {
  evaluateAuthorityComposition,
  verifyIntentAttenuation
} from '../src/lib/authority-composition-guard.mjs';

const NOW = new Date('2026-09-01T06:55:00.000Z');
const POLICY = 'a'.repeat(64);

function grant(overrides = {}) {
  return {
    verified: true,
    grant_id: 'grant:alpha',
    issuer: 'issuer:local-policy',
    principal_id: 'principal:agent-1',
    resources: ['resource:records'],
    actions: ['records.read', 'records.summarize', 'send.external'],
    purposes: ['user-summary'],
    destinations: ['destination:local', 'destination:external'],
    expires_at: '2026-09-01T07:55:00.000Z',
    policy_digest: POLICY,
    ...overrides
  };
}

function intent(overrides = {}) {
  return {
    bound: true,
    actions: ['records.read', 'records.summarize'],
    purposes: ['user-summary'],
    destinations: ['destination:local'],
    resources: ['resource:records'],
    ...overrides
  };
}

function request(overrides = {}) {
  return {
    principal_id: 'principal:agent-1',
    resource: 'resource:records',
    action: 'records.read',
    purpose: 'user-summary',
    destination: 'destination:local',
    protocol: 'mcp',
    causal_scope_id: 'causal:user-request-42',
    policy_digest: POLICY,
    ...overrides
  };
}

test('intent can narrow a verified grant but cannot widen it', () => {
  assert.equal(verifyIntentAttenuation(grant(), intent()).valid, true);
  const widened = verifyIntentAttenuation(grant(), intent({
    actions: ['records.read', 'records.summarize', 'shell.exec']
  }));
  assert.equal(widened.valid, false);
  assert.equal(widened.checks.actions, false);
});

test('verified identity or protocol context cannot repair a missing verified grant', () => {
  assert.throws(
    () => evaluateAuthorityComposition({
      grant: grant({ verified: false }),
      intent: intent(),
      request: request(),
      now: NOW
    }),
    /must be independently verified/
  );
});

test('resource, policy, principal and intent mismatches fail closed', () => {
  for (const candidate of [
    request({ resource: 'resource:other' }),
    request({ policy_digest: 'b'.repeat(64) }),
    request({ principal_id: 'principal:other' }),
    request({ action: 'send.external', destination: 'destination:external' })
  ]) {
    const result = evaluateAuthorityComposition({
      grant: grant(),
      intent: intent(),
      request: candidate,
      now: NOW
    });
    assert.equal(result.allow, false);
    assert.equal(result.authority_effect, 'none');
  }
});

test('individually permitted actions are denied when causal composition is prohibited', () => {
  const result = evaluateAuthorityComposition({
    grant: grant(),
    intent: intent({
      actions: ['records.read', 'records.summarize', 'send.external'],
      destinations: ['destination:external', 'destination:local']
    }),
    request: request({
      action: 'send.external',
      destination: 'destination:external',
      protocol: 'a2a'
    }),
    history: [{
      causal_scope_id: 'causal:user-request-42',
      action: 'records.read',
      resource: 'resource:records',
      purpose: 'user-summary',
      destination: 'destination:local'
    }],
    restrictions: [{
      id: 'private-read-then-external-send',
      ordered_actions: ['records.read', 'send.external']
    }],
    now: NOW
  });

  assert.equal(result.allow, false);
  assert.ok(result.reasons.includes('composition-blocked:private-read-then-external-send'));
  assert.equal(result.composition_scope, 'causal_scope_id');
  assert.equal(result.evaluated_protocol, 'a2a');
});

test('transport or protocol session splitting does not erase causal authority history', () => {
  const result = evaluateAuthorityComposition({
    grant: grant(),
    intent: intent({
      actions: ['records.read', 'records.summarize', 'send.external'],
      destinations: ['destination:external', 'destination:local']
    }),
    request: request({
      action: 'send.external',
      destination: 'destination:external',
      protocol: 'native-gateway'
    }),
    history: [{
      causal_scope_id: 'causal:user-request-42',
      action: 'records.read',
      resource: 'resource:records',
      purpose: 'user-summary',
      destination: 'destination:local'
    }],
    restrictions: [{
      id: 'private-read-then-external-send',
      ordered_actions: ['records.read', 'send.external']
    }],
    now: NOW
  });

  assert.equal(result.allow, false);
  assert.equal(result.protocol_is_authority, false);
});

test('unrelated causal work does not contaminate this authority scope', () => {
  const result = evaluateAuthorityComposition({
    grant: grant(),
    intent: intent(),
    request: request({ action: 'records.summarize' }),
    history: [{
      causal_scope_id: 'causal:other-task',
      action: 'records.read',
      resource: 'resource:records',
      purpose: 'user-summary',
      destination: 'destination:local'
    }],
    restrictions: [{
      id: 'read-then-summary-block-demo',
      ordered_actions: ['records.read', 'records.summarize']
    }],
    now: NOW
  });

  assert.equal(result.allow, true);
  assert.equal(result.authority_effect, 'bounded-request-admissible');
});
