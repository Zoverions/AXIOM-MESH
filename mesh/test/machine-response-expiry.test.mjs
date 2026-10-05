import assert from 'node:assert/strict';
import test from 'node:test';
import { MachineIngressGuard } from '../src/lib/machine-ingress.mjs';

// Local unit fixtures only: the real authenticator must verify the principal.
// Clock control is test-local; no caller-supplied clock is added to the guard.
const EXPIRY = Date.parse('2030-01-01T00:00:00.000Z');
const EXPIRED = { code: 'machine_principal_expired', status: 401 };
const INVALID_AUTHORITY = { code: 'machine_authority_invalid', status: 403 };

function principal(overrides = {}) {
  return {
    schema: 'axiom-machine-principal.v1',
    id: 'agent:response-expiry-fixture',
    lifetime: 'session',
    expires_at: new Date(EXPIRY).toISOString(),
    constraints: {
      budgets: {
        max_request_bytes: 1_024,
        max_response_bytes: 1_024,
        max_requests_per_minute: 2,
        max_concurrent_requests: 1
      }
    },
    ...overrides
  };
}

function clock(t, value) {
  t.mock.method(Date, 'now', () => value);
}

test('response denies a machine whose declared lifetime has expired', t => {
  clock(t, EXPIRY + 1);
  assert.throws(() => new MachineIngressGuard().enforceResponse(principal(), {
    responseBytes: 16
  }), EXPIRED);
});

test('response denies at the exact expiry instant', t => {
  clock(t, EXPIRY);
  assert.throws(() => new MachineIngressGuard().enforceResponse(principal(), {
    responseBytes: 16
  }), EXPIRED);
});

test('admission before expiry does not authorize a response after expiry', t => {
  let now = EXPIRY - 1;
  t.mock.method(Date, 'now', () => now);
  const guard = new MachineIngressGuard();
  const machine = principal();
  assert.equal(guard.enforce(machine, { requestBytes: 16 }).constrained, true);
  now = EXPIRY;
  assert.throws(() => guard.enforceResponse(machine, { responseBytes: 16 }), EXPIRED);
});

test('a prior successful response check is not cached permission', t => {
  let now = EXPIRY - 1;
  t.mock.method(Date, 'now', () => now);
  const guard = new MachineIngressGuard();
  const machine = principal();
  assert.equal(guard.enforceResponse(machine, { responseBytes: 16 }).constrained, true);
  now = EXPIRY + 1;
  assert.throws(() => guard.enforceResponse(machine, { responseBytes: 16 }), EXPIRED);
});

test('an empty application response still checks expiry', t => {
  clock(t, EXPIRY + 1);
  assert.throws(() => new MachineIngressGuard().enforceResponse(principal()), EXPIRED);
});

test('response options cannot substitute an earlier caller clock', t => {
  clock(t, EXPIRY + 1);
  assert.throws(() => new MachineIngressGuard().enforceResponse(principal(), {
    responseBytes: 16,
    now: EXPIRY - 1
  }), EXPIRED);
});

test('a session response without an expiry fails closed', t => {
  clock(t, EXPIRY - 1);
  const machine = principal();
  delete machine.expires_at;
  assert.throws(() => new MachineIngressGuard().enforceResponse(machine), INVALID_AUTHORITY);
});

test('a session response with null expiry fails closed', t => {
  clock(t, EXPIRY - 1);
  assert.throws(() => new MachineIngressGuard().enforceResponse(principal({
    expires_at: null
  })), INVALID_AUTHORITY);
});

test('an unparsable declared expiry fails closed at response time', t => {
  clock(t, EXPIRY - 1);
  assert.throws(() => new MachineIngressGuard().enforceResponse(principal({
    expires_at: 'not-a-date'
  })), INVALID_AUTHORITY);
});

test('a persistent machine with an explicit expired lifetime is denied', t => {
  clock(t, EXPIRY + 1);
  assert.throws(() => new MachineIngressGuard().enforceResponse(principal({
    lifetime: 'persistent'
  })), EXPIRED);
});

test('response remains permitted one millisecond before expiry', t => {
  clock(t, EXPIRY - 1);
  assert.deepEqual(new MachineIngressGuard().enforceResponse(principal(), {
    responseBytes: 16
  }), { constrained: true, response_bytes: 16, max_response_bytes: 1_024 });
});

test('persistent machines without an expiry retain existing semantics', t => {
  clock(t, EXPIRY + 1);
  const machine = principal({ lifetime: 'persistent' });
  delete machine.expires_at;
  assert.equal(new MachineIngressGuard().enforceResponse(machine).constrained, true);
});

test('persistent machines with null expiry retain existing semantics', t => {
  clock(t, EXPIRY + 1);
  assert.equal(new MachineIngressGuard().enforceResponse(principal({
    lifetime: 'persistent', expires_at: null
  })).constrained, true);
});

test('non-machine principals retain their unconstrained response path', t => {
  clock(t, EXPIRY + 1);
  assert.deepEqual(new MachineIngressGuard().enforceResponse({
    id: 'human:fixture', expires_at: '1970-01-01T00:00:00Z'
  }), { constrained: false });
});

test('a missing principal retains the existing unconstrained path', t => {
  clock(t, EXPIRY + 1);
  assert.deepEqual(new MachineIngressGuard().enforceResponse(undefined), {
    constrained: false
  });
});

test('valid machines still require response budgets', t => {
  clock(t, EXPIRY - 1);
  assert.throws(() => new MachineIngressGuard().enforceResponse(principal({
    constraints: {}
  })), INVALID_AUTHORITY);
});

test('the exact response-size ceiling remains permitted before expiry', t => {
  clock(t, EXPIRY - 1);
  assert.equal(new MachineIngressGuard().enforceResponse(principal(), {
    responseBytes: 1_024
  }).response_bytes, 1_024);
});

test('oversized responses remain denied before expiry', t => {
  clock(t, EXPIRY - 1);
  assert.throws(() => new MachineIngressGuard().enforceResponse(principal(), {
    responseBytes: 1_025
  }), { code: 'machine_response_budget_exceeded', status: 502 });
});

test('invalid response-byte counts retain validation precedence', t => {
  clock(t, EXPIRY + 1);
  for (const responseBytes of [-1, 1.5, NaN, Infinity, true, '16']) {
    assert.throws(() => new MachineIngressGuard().enforceResponse(principal(), {
      responseBytes
    }), { code: 'validation_error', status: 400 });
  }
});

test('response expiry does not acknowledge worker termination or release a lease', t => {
  clock(t, EXPIRY + 1);
  const guard = new MachineIngressGuard();
  const machine = principal();
  const release = guard.acquireConcurrency(machine);
  assert.throws(() => guard.enforceResponse(machine), EXPIRED);
  assert.equal(guard.concurrency.get(machine.id), 1);
  release();
  release();
  assert.equal(guard.concurrency.has(machine.id), false);
});

test('response checking does not charge the request-rate budget', t => {
  clock(t, EXPIRY - 1);
  const guard = new MachineIngressGuard();
  const machine = principal();
  guard.enforce(machine);
  const before = structuredClone(guard.rate.get(machine.id));
  guard.enforceResponse(machine);
  assert.deepEqual(guard.rate.get(machine.id), before);
});

test('invalid response-size ceilings remain denied for valid machines', t => {
  clock(t, EXPIRY - 1);
  for (const maximum of [0, 1_023, 20_971_521, NaN, '1024', undefined]) {
    const machine = principal();
    machine.constraints.budgets.max_response_bytes = maximum;
    assert.throws(() => new MachineIngressGuard().enforceResponse(machine), INVALID_AUTHORITY);
  }
});
