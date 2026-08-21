import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createMachineDelegationPolicyCandidate,
  verifyMachineDelegationPolicyCandidate
} from '../src/lib/agent-trust-machine-delegation-policy.mjs';
import { normalizeMachinePrincipalDefinition } from '../src/lib/machine-principal.mjs';

const humans = new Set(['owner.alice']);
const NOW = new Date('2026-08-17T20:00:00.000Z');

function principal(overrides = {}) {
  return {
    id: 'agent.parent.v1',
    type: 'agent',
    sponsor: 'owner.alice',
    roles: ['researcher'],
    scopes: ['intent:execute', 'memory:read'],
    lifetime: 'session',
    expires_at: '2026-08-18T20:00:00.000Z',
    runtime: { id: 'runtime.parent.v1', kind: 'local-process', software_digest: 'a'.repeat(64) },
    constraints: {
      actions: ['memory.read', 'system.echo'],
      purposes: ['research.assist', 'test.conformance'],
      destinations: ['local', 'provider:fixture'],
      budgets: {
        max_requests_per_minute: 20,
        max_concurrent_requests: 4,
        max_execution_ms: 5_000,
        max_request_bytes: 131_072,
        max_response_bytes: 524_288
      },
      delegation: { allowed: false, max_depth: 0 }
    },
    ...overrides
  };
}

function candidate(overrides = {}) {
  return {
    delegable_actions: ['system.echo'],
    delegable_scopes: ['intent:execute'],
    delegable_purposes: ['test.conformance'],
    delegable_destinations: ['local'],
    budgets: {
      max_requests_per_minute: 10,
      max_concurrent_requests: 2,
      max_execution_ms: 2_500,
      max_request_bytes: 65_536,
      max_response_bytes: 262_144
    },
    max_delegation_depth: 1,
    expires_at: '2026-08-18T12:00:00.000Z',
    subdelegation_allowed: false,
    ...overrides
  };
}

function create(p = principal(), c = candidate()) {
  return createMachineDelegationPolicyCandidate(p, c, {
    knownHumanPrincipals: humans,
    now: NOW
  });
}

test('candidate describes a bounded future delegation policy without enabling current v1 delegation', () => {
  const p = normalizeMachinePrincipalDefinition(principal(), {
    knownHumanPrincipals: humans,
    now: NOW
  });
  const policy = create();
  assert.equal(p.constraints.delegation.allowed, false);
  assert.equal(p.constraints.delegation.max_depth, 0);
  assert.equal(policy.principal_id, p.id);
  assert.equal(policy.principal_authority_digest, p.authority_digest);
  assert.equal(policy.sponsor, 'owner.alice');
  assert.deepEqual(policy.delegable_actions, ['system.echo']);
  assert.deepEqual(policy.delegable_scopes, ['intent:execute']);
  assert.equal(policy.max_delegation_depth, 1);
  assert.equal(policy.runtime_accepted, false);
  assert.equal(policy.owner_approval_bound, false);
  assert.equal(policy.revocation_currentness_bound, false);
  assert.equal(policy.authority_effect, 'none');
  assert.equal(policy.delegation_effect, 'none');
  assert.match(policy.policy_digest, /^[a-f0-9]{64}$/);
  assert.deepEqual(verifyMachineDelegationPolicyCandidate(policy, principal(), {
    knownHumanPrincipals: humans,
    now: NOW
  }), policy);
});

test('candidate cannot widen v1 actions scopes purposes or destinations', () => {
  for (const [field, value, pattern] of [
    ['delegable_actions', ['system.delete'], /actions widens/],
    ['delegable_scopes', ['root:admin'], /scopes widens/],
    ['delegable_purposes', ['finance.transfer'], /purposes widens/],
    ['delegable_destinations', ['https://evil.example'], /destinations widens/]
  ]) {
    assert.throws(() => create(principal(), candidate({ [field]: value })), pattern);
  }
});

test('candidate cannot widen any machine budget', () => {
  const p = normalizeMachinePrincipalDefinition(principal(), {
    knownHumanPrincipals: humans,
    now: NOW
  });
  for (const key of Object.keys(p.constraints.budgets)) {
    assert.throws(() => create(principal(), candidate({
      budgets: {
        ...candidate().budgets,
        [key]: p.constraints.budgets[key] + 1
      }
    })), new RegExp(key));
  }
});

test('subdelegation shape consumes explicit bounded depth semantics', () => {
  assert.throws(
    () => create(principal(), candidate({ max_delegation_depth: 2, subdelegation_allowed: false })),
    /must have max_delegation_depth 1/
  );
  const nested = create(principal(), candidate({
    max_delegation_depth: 2,
    subdelegation_allowed: true
  }));
  assert.equal(nested.max_delegation_depth, 2);
  assert.equal(nested.subdelegation_allowed, true);
  assert.equal(nested.runtime_accepted, false);
});

test('candidate cannot outlive or pre-expire relative to evaluation time', () => {
  assert.throws(
    () => create(principal(), candidate({ expires_at: '2026-08-18T20:00:01.000Z' })),
    /cannot outlive machine principal/
  );
  assert.throws(
    () => create(principal(), candidate({ expires_at: '2026-08-17T19:59:59.000Z' })),
    /must be in the future/
  );
});

test('candidate cannot self-promote into runtime delegation, owner approval or currentness', () => {
  for (const [field, value, pattern] of [
    ['runtime_accepted', true, /runtime_accepted must remain false/],
    ['owner_approval_bound', true, /owner_approval_bound must remain false/],
    ['revocation_currentness_bound', true, /revocation_currentness_bound must remain false/],
    ['authority_effect', 'grant', /authority_effect must remain none/],
    ['delegation_effect', 'grant-child', /delegation_effect must remain none/]
  ]) {
    assert.throws(() => create(principal(), candidate({ [field]: value })), pattern);
  }
});

test('candidate is content addressed and rejects mutation or unknown fields', () => {
  const policy = create();
  assert.throws(
    () => verifyMachineDelegationPolicyCandidate({ ...policy, policy_digest: '0'.repeat(64) }, principal(), {
      knownHumanPrincipals: humans,
      now: NOW
    }),
    /digest mismatch/
  );
  assert.throws(
    () => create(principal(), candidate({ magic: true })),
    /unsupported field magic/
  );
});
