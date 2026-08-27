import assert from 'node:assert/strict';
import test from 'node:test';
import { MachineIngressGuard } from '../src/lib/machine-ingress.mjs';
import { normalizeMachinePrincipalDefinition } from '../src/lib/machine-principal.mjs';

function machine({
  id = 'agent.phaseone-budget',
  maxRequestsPerMinute = 2,
  maxConcurrentRequests = 1,
  maxRequestBytes = 1_024
} = {}) {
  return normalizeMachinePrincipalDefinition({
    id,
    type: 'agent',
    sponsor: 'owner.phaseone-budget',
    roles: ['researcher'],
    scopes: ['intent:execute'],
    lifetime: 'session',
    expires_at: '2099-01-01T00:00:00.000Z',
    runtime: {
      id: `runtime.${id.replace(/^agent\./, '')}`,
      kind: 'local-process',
      software_digest: 'a'.repeat(64)
    },
    constraints: {
      actions: ['system.echo'],
      purposes: ['test.conformance'],
      destinations: ['local'],
      budgets: {
        max_requests_per_minute: maxRequestsPerMinute,
        max_concurrent_requests: maxConcurrentRequests,
        max_execution_ms: 2_000,
        max_request_bytes: maxRequestBytes,
        max_response_bytes: 65_536
      },
      delegation: { allowed: false, max_depth: 0 }
    }
  });
}

test('rate exhaustion preserves authority and recovers only through legitimate refill', () => {
  const guard = new MachineIngressGuard();
  const principal = machine();
  const original = structuredClone(principal);

  assert.equal(guard.enforce(principal, { requestBytes: 16, now: 0 }).constrained, true);
  assert.equal(guard.enforce(principal, { requestBytes: 16, now: 0 }).constrained, true);

  assert.throws(
    () => guard.enforce(principal, { requestBytes: 16, now: 0 }),
    error => error.code === 'machine_rate_budget_exceeded' && error.status === 429
  );
  assert.deepEqual(principal, original);

  // With a two-per-minute ceiling, 29.999 seconds is still insufficient to
  // replenish one whole request token. Repeated blocked work cannot turn the
  // denial into authority or accelerate the configured refill path.
  assert.throws(
    () => guard.enforce(principal, { requestBytes: 16, now: 29_999 }),
    error => error.code === 'machine_rate_budget_exceeded' && error.status === 429
  );
  assert.deepEqual(principal, original);

  assert.equal(
    guard.enforce(principal, { requestBytes: 16, now: 30_000 }).constrained,
    true
  );
  assert.deepEqual(principal, original);
});

test('request-size rejection does not spend rate budget or mutate machine authority', () => {
  const guard = new MachineIngressGuard();
  const principal = machine({ maxRequestBytes: 1_024, maxRequestsPerMinute: 2 });
  const original = structuredClone(principal);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    assert.throws(
      () => guard.enforce(principal, { requestBytes: 1_025, now: 0 }),
      error => error.code === 'machine_request_budget_exceeded' && error.status === 413
    );
  }
  assert.deepEqual(principal, original);

  // The oversized attempts failed before rate admission, so the configured
  // two-request budget remains intact. Recovery is not an authority change.
  assert.equal(guard.enforce(principal, { requestBytes: 16, now: 0 }).constrained, true);
  assert.equal(guard.enforce(principal, { requestBytes: 16, now: 0 }).constrained, true);
  assert.throws(
    () => guard.enforce(principal, { requestBytes: 16, now: 0 }),
    error => error.code === 'machine_rate_budget_exceeded' && error.status === 429
  );
  assert.deepEqual(principal, original);
});

test('concurrency exhaustion cannot increase the ceiling and release is the only recovery path', () => {
  const guard = new MachineIngressGuard();
  const principal = machine({ maxConcurrentRequests: 1 });
  const original = structuredClone(principal);

  const release = guard.acquireConcurrency(principal);
  assert.throws(
    () => guard.acquireConcurrency(principal),
    error => (
      error.code === 'machine_concurrency_budget_exceeded'
      && error.status === 429
      && error.details.active_requests === 1
      && error.details.max_concurrent_requests === 1
    )
  );
  assert.deepEqual(principal, original);

  release();
  release(); // release handles are intentionally idempotent.

  const releaseAgain = guard.acquireConcurrency(principal);
  assert.deepEqual(principal, original);
  releaseAgain();
});

test('a copied authority digest cannot turn budget exhaustion into a sibling principal', () => {
  const principal = machine();
  const forgedSibling = structuredClone(principal);
  forgedSibling.id = 'agent.phaseone-budget-sibling';
  forgedSibling.runtime.id = 'runtime.phaseone-budget-sibling';
  // Deliberately retain the original authority digest, modelling a peer trying
  // to escape a spent principal budget by copying its authority onto a new id.
  forgedSibling.authority_digest = principal.authority_digest;

  assert.throws(
    () => normalizeMachinePrincipalDefinition(forgedSibling),
    /authority_digest does not match normalized authority/
  );
});
