import assert from 'node:assert/strict';
import test from 'node:test';
import { sha256 } from '../src/lib/canonical.mjs';
import { MachineIngressGuard } from '../src/lib/machine-ingress.mjs';
import { createBearerAuthenticator } from '../src/lib/public-auth.mjs';

const TOKEN = `machine-${'a'.repeat(40)}`;

function machinePrincipal(overrides = {}) {
  return {
    schema: 'axiom-machine-principal.v1',
    id: 'agent.ingress-test',
    type: 'agent',
    sponsor: 'owner.ingress-test',
    roles: ['researcher'],
    scopes: ['intent:execute'],
    lifetime: 'session',
    expires_at: '2099-01-01T00:00:00.000Z',
    runtime: {
      id: 'runtime.ingress-test',
      kind: 'local-process',
      software_digest: 'a'.repeat(64)
    },
    constraints: {
      actions: ['system.echo'],
      purposes: ['test.conformance'],
      destinations: ['local'],
      budgets: {
        max_requests_per_minute: 2,
        max_concurrent_requests: 1,
        max_execution_ms: 2_000,
        max_request_bytes: 1_024,
        max_response_bytes: 65_536
      },
      delegation: { allowed: false, max_depth: 0 }
    },
    authority_digest: 'b'.repeat(64),
    ...overrides
  };
}

test('machine ingress request-size ceiling rejects before downstream authorization', () => {
  const guard = new MachineIngressGuard();
  assert.throws(
    () => guard.enforce(machinePrincipal(), {
      requestBytes: 1_025,
      now: 1_000
    }),
    error => (
      error.code === 'machine_request_budget_exceeded'
      && error.status === 413
      && error.details.request_bytes === 1_025
      && error.details.max_request_bytes === 1_024
    )
  );
});

test('machine ingress rate ceiling is principal-specific and refills over one minute', () => {
  const guard = new MachineIngressGuard();
  const principal = machinePrincipal();

  assert.equal(guard.enforce(principal, { requestBytes: 10, now: 0 }).constrained, true);
  assert.equal(guard.enforce(principal, { requestBytes: 10, now: 0 }).constrained, true);
  assert.throws(
    () => guard.enforce(principal, { requestBytes: 10, now: 0 }),
    error => error.code === 'machine_rate_budget_exceeded' && error.status === 429
  );

  assert.equal(
    guard.enforce(principal, { requestBytes: 10, now: 30_000 }).constrained,
    true
  );
});

test('different machine principals do not share ingress rate state', () => {
  const guard = new MachineIngressGuard();
  const left = machinePrincipal({ id: 'agent.left' });
  const right = machinePrincipal({ id: 'agent.right' });

  guard.enforce(left, { requestBytes: 10, now: 0 });
  guard.enforce(left, { requestBytes: 10, now: 0 });
  assert.throws(
    () => guard.enforce(left, { requestBytes: 10, now: 0 }),
    error => error.code === 'machine_rate_budget_exceeded'
  );
  assert.equal(guard.enforce(right, { requestBytes: 10, now: 0 }).constrained, true);
});

test('human and legacy infrastructure service principals are not machine-budgeted', () => {
  const guard = new MachineIngressGuard();
  for (const principal of [
    { id: 'owner.human', type: 'human', roles: [], scopes: ['*'] },
    { id: 'telemetry.service', type: 'service', roles: [], scopes: ['telemetry:collect'] }
  ]) {
    assert.deepEqual(
      guard.enforce(principal, { requestBytes: 99_999_999, now: 0 }),
      { constrained: false }
    );
  }
});

test('bearer authentication enforces the machine ingress guard after token validation', async () => {
  const principals = new Map([[sha256(TOKEN), machinePrincipal()]]);
  const calls = [];
  const machineIngress = {
    enforce(principal, context) {
      calls.push({ principal, context });
      return { constrained: true };
    }
  };
  const authenticate = createBearerAuthenticator(principals, { machineIngress });
  const body = Buffer.from('{"hello":"world"}');
  const principal = await authenticate({
    req: {
      headers: { authorization: `Bearer ${TOKEN}` }
    },
    body
  });

  assert.equal(principal.id, 'agent.ingress-test');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].principal.id, 'agent.ingress-test');
  assert.equal(calls[0].context.requestBytes, body.length);
});

test('invalid bearer token cannot consume machine ingress state', async () => {
  let calls = 0;
  const authenticate = createBearerAuthenticator(
    new Map([[sha256(TOKEN), machinePrincipal()]]),
    {
      machineIngress: {
        enforce() {
          calls += 1;
        }
      }
    }
  );
  await assert.rejects(
    () => authenticate({
      req: { headers: { authorization: `Bearer ${'x'.repeat(40)}` } },
      body: Buffer.alloc(2_000)
    }),
    error => error.code === 'invalid_token' && error.status === 401
  );
  assert.equal(calls, 0);
});
