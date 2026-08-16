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

test('explicit policy may raise assurance but cannot manufacture an unavailable path', () => {
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
  assert.equal(decision.allow, false);
  assert.equal(decision.code, 'assurance_path_unavailable');
});

test('deny-dominant policy composition can raise but never lower assurance', () => {
  const base = {
    version: 'base',
    actions: {
      'test.action': allowRule({ risk: 'low', required_assurance: 'A3', independent: true })
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

test('deny branches preserve the stricter assurance floor', () => {
  const base = {
    version: 'base',
    actions: {
      'test.action': allowRule({ risk: 'low', required_assurance: 'A3', independent: true })
    }
  };
  const overlay = {
    version: 'owner',
    actions: {
      'test.action': {
        decision: 'deny',
        risk: 'low',
        required_assurance: 'A1',
        code: 'owner_denied'
      }
    }
  };
  const merged = mergeDenyDominantPolicy([base, overlay]);
  assert.equal(merged.actions['test.action'].decision, 'deny');
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

test('current runtime denies A4 and A3 rules without an implemented A3 path', () => {
  const policy = new PolicyEngine({
    version: 'assurance-runtime-test.v1',
    actions: {
      'system.echo': {
        decision: 'allow',
        risk: 'low',
        required_assurance: 'A4',
        tool: 'system.echo'
      },
      'system.status': {
        decision: 'allow',
        risk: 'low',
        required_assurance: 'A3',
        tool: 'system.status'
      }
    }
  });
  const principal = { scopes: ['*'] };
  const intent = { confirmations: [] };
  const a4 = policy.evaluate({ action: 'system.echo', principal, intent });
  assert.equal(a4.allow, false);
  assert.equal(a4.code, 'assurance_unavailable');
  assert.equal(a4.runtime_max_assurance, 'A3');

  const a3 = policy.evaluate({ action: 'system.status', principal, intent });
  assert.equal(a3.allow, false);
  assert.equal(a3.code, 'assurance_path_unavailable');
});
