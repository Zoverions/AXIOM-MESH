import assert from 'node:assert/strict';
import test from 'node:test';

import {
  evaluateMachinePrincipalAuthorityNarrowing
} from '../src/lib/machine-principal-authority-narrowing.mjs';

const HUMANS = new Set(['owner.alice']);
const NOW = new Date('2026-09-01T18:30:00.000Z');

function principal(overrides = {}) {
  const base = {
    id: 'agent.lifecycle.1',
    type: 'agent',
    sponsor: 'owner.alice',
    roles: ['researcher', 'writer'],
    scopes: ['intent:execute', 'research:read'],
    lifetime: 'session',
    expires_at: '2026-09-02T18:30:00.000Z',
    runtime: {
      id: 'runtime.lifecycle.1',
      kind: 'local-process',
      software_digest: 'a'.repeat(64)
    },
    constraints: {
      actions: ['system.echo', 'system.hash'],
      purposes: ['research.assist', 'test.conformance'],
      destinations: ['local', 'provider:fixture'],
      budgets: {
        max_requests_per_minute: 20,
        max_concurrent_requests: 2,
        max_execution_ms: 10_000,
        max_request_bytes: 262_144,
        max_response_bytes: 1_048_576
      },
      delegation: { allowed: false, max_depth: 0 }
    }
  };
  return {
    ...base,
    ...overrides,
    runtime: { ...base.runtime, ...(overrides.runtime ?? {}) },
    constraints: {
      ...base.constraints,
      ...(overrides.constraints ?? {}),
      budgets: {
        ...base.constraints.budgets,
        ...(overrides.constraints?.budgets ?? {})
      },
      delegation: {
        ...base.constraints.delegation,
        ...(overrides.constraints?.delegation ?? {})
      }
    }
  };
}

function evaluate(previous, successor) {
  return evaluateMachinePrincipalAuthorityNarrowing(previous, successor, {
    knownHumanPrincipals: HUMANS,
    now: NOW
  });
}

test('same-principal authority may narrow across sets, budgets and expiry', () => {
  const previous = principal();
  const successor = principal({
    roles: ['researcher'],
    scopes: ['research:read'],
    expires_at: '2026-09-02T12:00:00.000Z',
    constraints: {
      actions: ['system.echo'],
      purposes: ['research.assist'],
      destinations: ['local'],
      budgets: {
        max_requests_per_minute: 10,
        max_concurrent_requests: 1,
        max_execution_ms: 5_000,
        max_request_bytes: 131_072,
        max_response_bytes: 524_288
      }
    }
  });
  const result = evaluate(previous, successor);
  assert.equal(result.valid, true);
  assert.equal(result.relation, 'strictly-narrower');
  assert.equal(result.authority_changed, true);
  assert.notEqual(result.previous_authority_digest, result.successor_authority_digest);
  assert.equal(result.execution_authority_granted, false);
});

test('equal authority is explicit and does not pretend to be a narrowing mutation', () => {
  const result = evaluate(principal(), principal());
  assert.equal(result.relation, 'equal');
  assert.equal(result.authority_changed, false);
  assert.equal(result.previous_authority_digest, result.successor_authority_digest);
});

test('same-principal narrowing rejects scope, action, destination and budget widening', () => {
  const previous = principal();
  for (const successor of [
    principal({ scopes: ['intent:execute', 'research:read', 'admin:write'] }),
    principal({ constraints: { actions: ['system.echo', 'system.hash', 'system.exec'] } }),
    principal({ constraints: { destinations: ['local', 'provider:fixture', 'provider:new'] } }),
    principal({ constraints: { budgets: { max_execution_ms: 20_000 } } })
  ]) {
    assert.throws(() => evaluate(previous, successor), /widens/);
  }
});

test('same-principal narrowing rejects identity/runtime/lifetime substitution and expiry extension', () => {
  const previous = principal();
  for (const successor of [
    principal({ id: 'agent.other' }),
    principal({ sponsor: 'owner.other' }),
    principal({ runtime: { id: 'runtime.other' } }),
    principal({ runtime: { software_digest: 'b'.repeat(64) } }),
    principal({ lifetime: 'persistent', expires_at: undefined }),
    principal({ expires_at: '2026-09-03T18:30:00.000Z' })
  ]) {
    assert.throws(() => evaluate(previous, successor));
  }
});

test('machine-principal v1 narrowing cannot introduce delegation', () => {
  assert.throws(
    () => evaluate(principal(), principal({
      constraints: { delegation: { allowed: true, max_depth: 1 } }
    })),
    /does not permit delegation|non-delegating/
  );
});
