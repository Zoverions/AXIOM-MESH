import assert from 'node:assert/strict';
import test from 'node:test';

import {
  resolveSignedFetchTimeoutMs
} from '../src/lib/client.mjs';
import {
  normalizeMachinePrincipalDefinition
} from '../src/lib/machine-principal.mjs';
import { buildPlan } from '../src/lib/plan.mjs';

function machinePrincipal(maxExecutionMs = 1_000) {
  return normalizeMachinePrincipalDefinition({
    id: 'agent.timeout.test',
    type: 'agent',
    sponsor: 'owner.test',
    roles: ['researcher'],
    scopes: ['intent:execute'],
    lifetime: 'session',
    expires_at: '2099-01-01T00:00:00.000Z',
    runtime: {
      id: 'runtime.timeout.test',
      kind: 'local-process',
      software_digest: 'a'.repeat(64)
    },
    constraints: {
      actions: ['system.echo'],
      purposes: ['test.conformance'],
      destinations: [],
      budgets: {
        max_requests_per_minute: 30,
        max_concurrent_requests: 1,
        max_execution_ms: maxExecutionMs,
        max_request_bytes: 65_536,
        max_response_bytes: 262_144
      },
      delegation: { allowed: false, max_depth: 0 }
    }
  }, {
    knownHumanPrincipals: new Set(['owner.test']),
    now: new Date('2026-08-19T00:00:00.000Z')
  });
}

function intent(principal) {
  return {
    intent_id: 'intent_timeout_test',
    principal,
    action: 'system.echo',
    purpose: 'test.conformance',
    data_scopes: [],
    approval_ids: []
  };
}

function decision(timeoutMs) {
  return {
    decision: 'allow',
    risk: 'low',
    required_assurance: 'A1',
    effect: 'system.echo',
    tool: 'system.echo',
    timeout_ms: timeoutMs,
    constraints: {},
    policy_version: 'test-policy.v1',
    policy_digest: 'b'.repeat(64),
    policy_layers: [],
    rule_id: 'policy:system.echo'
  };
}

function sandboxRequest(principal, timeoutMs) {
  const requestIntent = intent(principal);
  return {
    intent: requestIntent,
    plan: buildPlan(requestIntent, decision(timeoutMs))
  };
}

test('sandbox execution uses the digest-bound plan timeout instead of the client default', () => {
  const principal = machinePrincipal(1_000);
  const body = sandboxRequest(principal, 1_000);

  assert.equal(resolveSignedFetchTimeoutMs({
    audience: 'sandbox',
    url: 'http://127.0.0.1:31002/internal/v1/execute',
    body
  }), 1_000);
});

test('sandbox execution rechecks the machine principal execution ceiling', () => {
  const principal = machinePrincipal(1_000);
  const body = sandboxRequest(principal, 10_000);

  assert.throws(() => resolveSignedFetchTimeoutMs({
    audience: 'sandbox',
    url: 'http://127.0.0.1:31002/internal/v1/execute',
    body
  }), error => (
    error?.code === 'machine_execution_budget_exceeded'
    && /execution-time budget is exceeded/i.test(error.message)
  ));
});

test('sandbox execution rejects an explicit timeout that disagrees with the plan', () => {
  const principal = machinePrincipal(1_000);
  const body = sandboxRequest(principal, 1_000);

  assert.throws(() => resolveSignedFetchTimeoutMs({
    audience: 'sandbox',
    url: 'http://127.0.0.1:31002/internal/v1/execute',
    body,
    timeoutMs: 10_000
  }), /must match the digest-bound plan timeout/i);
});

test('ordinary signed service requests retain the bounded default timeout', () => {
  assert.equal(resolveSignedFetchTimeoutMs({
    audience: 'grid',
    url: 'http://127.0.0.1:31003/internal/v1/status'
  }), 10_000);
});
