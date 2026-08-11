import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PolicyEngine,
  mergeDenyDominantPolicy,
  validatePolicy
} from '../src/lib/policy.mjs';

function allowRule({ risk = 'low', required_assurance, independent = false } = {}) {
  return {
    decision: 'allow',
    risk,
    required_scopes: [],
    required_confirmations: 0,
    requires_independent_approval: independent,
    ...(required_assurance ? { required_assurance } : {})
  };
}

test('policy derives conservative assurance floors from action risk', () => {
  const policy = {
    version: 'test',
    actions: {
      'test.low': allowRule({ risk: 'low' }),
      'test.medium': allowRule({ risk: 'medium' }),
      'test.high': allowRule({ risk: 'high', independent: true })
    }
  };
  const engine = new PolicyEngine(policy);
  const principal = { scopes: [] };
  const intent = { confirmations: [] };

  assert.equal(engine.evaluate({ action: 'test.low', principal, intent }).required_assurance, 'A1');
  assert.equal(engine.evaluate({ action: 'test.medium', principal, intent }).required_assurance, 'A2');
  assert.equal(engine.evaluate({ action: 'test.high', principal, intent }).required_assurance, 'A3');
});

test('explicit policy may raise the assurance floor', () => {
  const policy = {
    version: 'test',
    actions: {
      'test.read': allowRule({ risk: 'low', required_assurance: 'A3' })
    }
  };
  validatePolicy(policy);
  const decision = new PolicyEngine(policy).evaluate({
    action: 'test.read',
    principal: { scopes: [] },
    intent: { confirmations: [] }
  });
  assert.equal(decision.required_assurance, 'A3');
});

test('deny-dominant policy composition can raise but never lower assurance', () => {
  const base = {
    version: 'base',
    actions: {
      'test.action': allowRule({ risk: 'low', required_assurance: 'A3' })
    }
  };
  const overlay = {
    version: 'owner',
    actions: {
      'test.action': allowRule({ risk: 'low', required_assurance: 'A1' })
    }
  };

  const merged = mergeDenyDominantPolicy([base, overlay]);
  assert.equal(merged.actions['test.action'].required_assurance, 'A3');
});

test('unknown assurance identifiers fail policy validation', () => {
  assert.throws(
    () => validatePolicy({
      version: 'bad',
      actions: {
        'test.action': allowRule({ risk: 'low', required_assurance: 'A9' })
      }
    }),
    /Invalid required assurance/
  );
});
