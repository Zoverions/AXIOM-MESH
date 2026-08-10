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

const MACHINE_TOKEN = `response-machine-${'m'.repeat(32)}`;
const HUMAN_TOKEN = `response-human-${'h'.repeat(32)}`;

function machinePrincipal() {
  return {
    schema: 'axiom-machine-principal.v1',
    id: 'agent.response-test',
    type: 'agent',
    sponsor: 'owner.response-test',
    roles: ['researcher'],
    scopes: ['intent:execute'],
    lifetime: 'session',
    expires_at: '2099-01-01T00:00:00.000Z',
    runtime: {
      id: 'runtime.response-test',
      kind: 'local-process',
      software_digest: 'a'.repeat(64)
    },
    constraints: {
      actions: ['system.echo'],
      purposes: ['test.conformance'],
      destinations: ['local'],
      budgets: {
        max_requests_per_minute: 100,
        max_concurrent_requests: 4,
        max_execution_ms: 2_000,
        max_request_bytes: 65_536,
        max_response_bytes: 1_024
      },
      delegation: { allowed: false, max_depth: 0 }
    },
    authority_digest: 'b'.repeat(64)
  };
}

test('machine response-size guard accepts bounded output and rejects oversized output', () => {
  const guard = new MachineIngressGuard();
  const principal = machinePrincipal();

  assert.deepEqual(
    guard.enforceResponse(principal, { responseBytes: 1_024 }),
    {
      constrained: true,
      response_bytes: 1_024,
      max_response_bytes: 1_024
    }
  );
  assert.throws(
    () => guard.enforceResponse(principal, { responseBytes: 1_025 }),
    error => (
      error.code === 'machine_response_budget_exceeded'
      && error.status === 502
      && error.details.response_bytes === 1_025
      && error.details.max_response_bytes === 1_024
    )
  );
});

test('authenticated machine responses are preflighted before JSON, buffer, and direct writes', async t => {
  const router = new Router();
  router.add('GET', '/small', async () => ({ ok: true }));
  router.add('GET', '/large-json', async () => ({ payload: 'x'.repeat(2_000) }));
  router.add('GET', '/large-buffer', async () => ({
    buffer: Buffer.alloc(2_000, 120),
    contentType: 'application/octet-stream'
  }));
  router.add('GET', '/direct', async ({ res }) => {
    res.end('unbounded-direct-write');
  });

  const principals = new Map([
    [sha256(MACHINE_TOKEN), machinePrincipal()],
    [sha256(HUMAN_TOKEN), {
      id: 'owner.response-test',
      type: 'human',
      roles: ['administrator'],
      scopes: ['*']
    }]
  ]);
  const authenticate = createBearerAuthenticator(principals);
  const server = createServiceServer({
    name: 'machine-response-size-test',
    router,
    authenticate
  });
  t.after(() => close(server));
  const address = await listen(server, { host: '127.0.0.1', port: 0 });
  const base = `http://127.0.0.1:${address.port}`;
  const machineHeaders = { authorization: `Bearer ${MACHINE_TOKEN}` };

  const small = await fetch(`${base}/small`, { headers: machineHeaders });
  assert.equal(small.status, 200);
  assert.deepEqual(await small.json(), { ok: true });

  for (const path of ['/large-json', '/large-buffer']) {
    const response = await fetch(`${base}${path}`, { headers: machineHeaders });
    assert.equal(response.status, 502);
    const body = await response.json();
    assert.equal(body.error.code, 'machine_response_budget_exceeded');
    assert.ok(body.error.details.response_bytes > 1_024);
    assert.equal(body.error.details.max_response_bytes, 1_024);
  }

  const direct = await fetch(`${base}/direct`, { headers: machineHeaders });
  assert.equal(direct.status, 500);
  const directBody = await direct.json();
  assert.equal(directBody.error.code, 'machine_direct_response_unavailable');

  const humanLarge = await fetch(`${base}/large-json`, {
    headers: { authorization: `Bearer ${HUMAN_TOKEN}` }
  });
  assert.equal(humanLarge.status, 200);
  const humanPayload = await humanLarge.json();
  assert.equal(humanPayload.payload.length, 2_000);
});

test('response-budget denial remains communicable beneath the minimum machine response ceiling', async t => {
  const router = new Router();
  router.add('GET', '/too-large', async () => ({ payload: 'y'.repeat(4_000) }));
  const authenticate = createBearerAuthenticator(new Map([
    [sha256(MACHINE_TOKEN), machinePrincipal()]
  ]));
  const server = createServiceServer({
    name: 'machine-response-error-test',
    router,
    authenticate
  });
  t.after(() => close(server));
  const address = await listen(server, { host: '127.0.0.1', port: 0 });

  const response = await fetch(`http://127.0.0.1:${address.port}/too-large`, {
    headers: { authorization: `Bearer ${MACHINE_TOKEN}` }
  });
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.equal(response.status, 502);
  assert.ok(bytes.length < 1_024);
  const body = JSON.parse(bytes.toString('utf8'));
  assert.equal(body.error.code, 'machine_response_budget_exceeded');
});
