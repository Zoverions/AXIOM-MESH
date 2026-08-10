import assert from 'node:assert/strict';
import test from 'node:test';
import { sha256 } from '../src/lib/canonical.mjs';
import {
  Router,
  close,
  createServiceServer,
  listen
} from '../src/lib/http.mjs';
import { MachineIngressGuard } from '../src/lib/machine-ingress.mjs';
import { createBearerAuthenticator } from '../src/lib/public-auth.mjs';

const TOKEN = `concurrency-${'c'.repeat(40)}`;

function machinePrincipal(overrides = {}) {
  const base = {
    schema: 'axiom-machine-principal.v1',
    id: 'agent.concurrency-test',
    type: 'agent',
    sponsor: 'owner.concurrency-test',
    roles: ['researcher'],
    scopes: ['intent:execute'],
    lifetime: 'session',
    expires_at: '2099-01-01T00:00:00.000Z',
    runtime: {
      id: 'runtime.concurrency-test',
      kind: 'local-process',
      software_digest: 'a'.repeat(64)
    },
    constraints: {
      actions: ['system.echo'],
      purposes: ['test.conformance'],
      destinations: ['local'],
      budgets: {
        max_requests_per_minute: 100,
        max_concurrent_requests: 1,
        max_execution_ms: 2_000,
        max_request_bytes: 65_536,
        max_response_bytes: 65_536
      },
      delegation: { allowed: false, max_depth: 0 }
    },
    authority_digest: 'b'.repeat(64)
  };
  return {
    ...base,
    ...overrides,
    constraints: {
      ...base.constraints,
      ...(overrides.constraints ?? {}),
      budgets: {
        ...base.constraints.budgets,
        ...(overrides.constraints?.budgets ?? {})
      }
    }
  };
}

test('machine concurrency lease denies overlap and releases idempotently', () => {
  const guard = new MachineIngressGuard();
  const principal = machinePrincipal();
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

  release();
  release();
  const releaseAgain = guard.acquireConcurrency(principal);
  releaseAgain();
});

test('active concurrency state is never evicted to admit another principal', () => {
  const guard = new MachineIngressGuard({ maxPrincipals: 1 });
  const left = machinePrincipal({ id: 'agent.concurrency-left' });
  const right = machinePrincipal({ id: 'agent.concurrency-right' });
  const releaseLeft = guard.acquireConcurrency(left);

  assert.throws(
    () => guard.acquireConcurrency(right),
    error => (
      error.code === 'machine_concurrency_state_unavailable'
      && error.status === 503
    )
  );

  releaseLeft();
  const releaseRight = guard.acquireConcurrency(right);
  releaseRight();
});

test('human and legacy service principals do not consume machine concurrency state', () => {
  const guard = new MachineIngressGuard({ maxPrincipals: 1 });
  for (const principal of [
    { id: 'owner.human', type: 'human' },
    { id: 'telemetry.service', type: 'service' }
  ]) {
    const release = guard.acquireConcurrency(principal);
    release();
  }

  const releaseMachine = guard.acquireConcurrency(machinePrincipal());
  releaseMachine();
});

test('authenticated HTTP request holds machine concurrency lease for handler lifetime', async t => {
  let enteredResolve;
  let finishResolve;
  const entered = new Promise(resolve => { enteredResolve = resolve; });
  const finish = new Promise(resolve => { finishResolve = resolve; });
  const router = new Router();
  router.add('GET', '/hold', async () => {
    enteredResolve();
    await finish;
    return { ok: true };
  });

  const principals = new Map([[sha256(TOKEN), machinePrincipal()]]);
  const authenticate = createBearerAuthenticator(principals);
  const server = createServiceServer({
    name: 'machine-concurrency-test',
    router,
    authenticate
  });
  t.after(() => close(server));
  const address = await listen(server, { host: '127.0.0.1', port: 0 });
  const url = `http://127.0.0.1:${address.port}/hold`;
  const headers = { authorization: `Bearer ${TOKEN}` };

  const first = fetch(url, { headers });
  await entered;

  const overlapping = await fetch(url, { headers });
  assert.equal(overlapping.status, 429);
  const overlappingBody = await overlapping.json();
  assert.equal(
    overlappingBody.error.code,
    'machine_concurrency_budget_exceeded'
  );

  finishResolve();
  const firstResponse = await first;
  assert.equal(firstResponse.status, 200);
  assert.deepEqual(await firstResponse.json(), { ok: true });

  const afterRelease = await fetch(url, { headers });
  assert.equal(afterRelease.status, 200);
  assert.deepEqual(await afterRelease.json(), { ok: true });
});
