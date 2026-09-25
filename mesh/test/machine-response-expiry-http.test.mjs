import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { AxiomError, sha256 } from '../src/lib/canonical.mjs';
import { Router, createServiceServer, listen, close } from '../src/lib/http.mjs';
import { MachineIngressGuard } from '../src/lib/machine-ingress.mjs';
import { createBearerAuthenticator } from '../src/lib/public-auth.mjs';

// Disposable loopback fixtures only. No production credentials or worker effects.
const TOKEN = 'synthetic-http-expiry-fixture-not-a-live-credential';
const MARKER = 'SYNTHETIC_RESULT_NOT_FOR_EXPIRED_RESPONSE';
const EXPIRY = Date.parse('2030-01-01T00:00:00.000Z');

function principal(overrides = {}) {
  return {
    schema: 'axiom-machine-principal.v1',
    id: 'agent.http-expiry-fixture',
    type: 'agent',
    lifetime: 'session',
    expires_at: new Date(EXPIRY).toISOString(),
    constraints: {
      budgets: {
        max_requests_per_minute: 100,
        max_concurrent_requests: 1,
        max_request_bytes: 1024,
        max_response_bytes: 1024
      }
    },
    ...overrides
  };
}

function latch() {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return { promise, resolve };
}

async function fixture(t, { identity = principal(), handler, wrapped = false } = {}) {
  let now = EXPIRY - 100;
  t.mock.method(Date, 'now', () => now);
  const entered = latch();
  const release = latch();
  let calls = 0;
  const router = new Router();
  router.add('GET', '/fixture', async args => {
    calls += 1;
    entered.resolve();
    await release.promise;
    return handler ? handler(args) : { marker: MARKER };
  });
  const guard = new MachineIngressGuard();
  const authenticator = createBearerAuthenticator(new Map([[sha256(TOKEN), identity]]), {
    machineIngress: guard
  });
  // Exercise both implicit hook discovery and explicit pass-through integration.
  const configuration = wrapped ? {
    authenticate: async args => authenticator(args),
    admitRequest: authenticator.admitRequest,
    inspectResponse: authenticator.inspectResponse
  } : { authenticate: authenticator };
  const server = createServiceServer({ name: 'response-expiry-fixture', router, ...configuration });
  t.after(async () => {
    release.resolve();
    server.closeAllConnections();
    await close(server);
  });
  const address = await listen(server, { host: '127.0.0.1', port: 0 });
  assert.equal(address.address, '127.0.0.1');
  return {
    guard, entered: entered.promise, release: release.resolve,
    setTime(value) { now = value; },
    get calls() { return calls; },
    request(token = TOKEN) {
      return new Promise((resolve, reject) => {
        const request = http.request({
          host: '127.0.0.1', port: address.port, path: '/fixture', method: 'GET',
          agent: false,
          headers: token === null ? {} : { authorization: `Bearer ${token}` }
        }, response => {
          const chunks = [];
          response.on('data', chunk => chunks.push(chunk));
          response.on('error', reject);
          response.on('end', () => resolve({
            status: response.statusCode, headers: response.headers,
            body: Buffer.concat(chunks).toString('utf8')
          }));
        });
        request.on('error', reject);
        request.setTimeout(3000, () => request.destroy(new Error('Loopback fixture timed out')));
        request.end();
      });
    }
  };
}

function assertExpiryDenial(response) {
  assert.equal(response.status, 401);
  assert.equal(JSON.parse(response.body).error.code, 'machine_principal_expired');
  assert.ok(!response.body.includes(MARKER));
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.equal(response.headers['x-result-marker'], undefined);
  assert.ok(Buffer.byteLength(response.body) < 1024);
}

const outputs = [
  ['plain-json', () => ({ marker: MARKER })],
  ['explicit-json', () => ({ httpStatus: 201, body: { marker: MARKER }, headers: { 'x-result-marker': MARKER } })],
  ['buffer', () => ({ buffer: Buffer.from(MARKER), contentType: 'application/octet-stream', headers: { 'x-result-marker': MARKER } })],
  ['empty-buffer', () => ({ buffer: Buffer.alloc(0), contentType: 'application/octet-stream' })],
  ['no-content', () => undefined]
];
for (const wrapped of [false, true]) {
  for (const [name, output] of outputs) {
    test(`HTTP expiry suppresses ${name} using ${wrapped ? 'explicit' : 'implicit'} auth hooks`, { timeout: 5000 }, async t => {
      const f = await fixture(t, { handler: output, wrapped });
      const pending = f.request();
      await f.entered;
      assert.equal(f.guard.concurrency.get(principal().id), 1);
      f.setTime(EXPIRY);
      f.release();
      const response = await pending;
      assertExpiryDenial(response);
      assert.equal(f.calls, 1);
      assert.equal(f.guard.concurrency.size, 0);
    });
  }
}

test('HTTP boundary accepts one millisecond before expiry', { timeout: 5000 }, async t => {
  const f = await fixture(t);
  const pending = f.request();
  await f.entered;
  f.setTime(EXPIRY - 1);
  f.release();
  const response = await pending;
  assert.equal(response.status, 200);
  assert.equal(JSON.parse(response.body).marker, MARKER);
  assert.equal(f.guard.concurrency.size, 0);
});

test('HTTP boundary rejects one millisecond after expiry', { timeout: 5000 }, async t => {
  const f = await fixture(t);
  const pending = f.request();
  await f.entered;
  f.setTime(EXPIRY + 1);
  f.release();
  assertExpiryDenial(await pending);
});

test('HTTP admission rejects already expired principal without invoking handler', { timeout: 5000 }, async t => {
  const f = await fixture(t);
  f.setTime(EXPIRY);
  assertExpiryDenial(await f.request());
  assert.equal(f.calls, 0);
  assert.equal(f.guard.concurrency.size, 0);
});

for (const [name, token, code] of [
  ['missing', null, 'authentication_required'],
  ['invalid', 'synthetic-invalid-fixture', 'invalid_token']
]) {
  test(`HTTP ${name} bearer never reaches handler`, { timeout: 5000 }, async t => {
    const f = await fixture(t);
    const response = await f.request(token);
    assert.equal(response.status, 401);
    assert.equal(JSON.parse(response.body).error.code, code);
    assert.equal(f.calls, 0);
    assert.equal(f.guard.concurrency.size, 0);
  });
}

test('HTTP persistent machine without expiry retains existing behavior', { timeout: 5000 }, async t => {
  const f = await fixture(t, { identity: principal({ lifetime: 'persistent', expires_at: null }) });
  const pending = f.request();
  await f.entered;
  f.setTime(EXPIRY + 1);
  f.release();
  const response = await pending;
  assert.equal(response.status, 200);
  assert.equal(JSON.parse(response.body).marker, MARKER);
});

test('HTTP human retains behavior outside the machine guard', { timeout: 5000 }, async t => {
  const f = await fixture(t, { identity: { id: 'owner.fixture', type: 'human', roles: [], scopes: [] } });
  const pending = f.request();
  await f.entered;
  f.setTime(EXPIRY + 1);
  f.release();
  assert.equal((await pending).status, 200);
  assert.equal(f.guard.concurrency.size, 0);
});

test('HTTP expiry denial does not imply completed handler work was rolled back', { timeout: 5000 }, async t => {
  let completedSyntheticWork = 0;
  const f = await fixture(t, { handler: () => {
    completedSyntheticWork += 1;
    f.setTime(EXPIRY);
    return { marker: MARKER };
  } });
  const pending = f.request();
  await f.entered;
  f.release();
  assertExpiryDenial(await pending);
  assert.equal(completedSyntheticWork, 1);
  assert.equal(f.guard.concurrency.size, 0);
});

test('HTTP controlled error remains communicable after lifetime ends', { timeout: 5000 }, async t => {
  const f = await fixture(t, { handler: () => { throw new AxiomError('fixture_denied', 'Fixture refused', 403); } });
  const pending = f.request();
  await f.entered;
  f.setTime(EXPIRY);
  f.release();
  const response = await pending;
  assert.equal(response.status, 403);
  assert.equal(JSON.parse(response.body).error.code, 'fixture_denied');
  assert.ok(!response.body.includes(MARKER));
  assert.equal(f.guard.concurrency.size, 0);
});

test('HTTP size ceiling still denies unexpired oversized application response', { timeout: 5000 }, async t => {
  const f = await fixture(t, { handler: () => ({ marker: MARKER, data: 'x'.repeat(2048) }) });
  const pending = f.request();
  await f.entered;
  f.release();
  const response = await pending;
  assert.equal(response.status, 502);
  assert.equal(JSON.parse(response.body).error.code, 'machine_response_budget_exceeded');
  assert.ok(!response.body.includes(MARKER));
  assert.equal(f.guard.concurrency.size, 0);
});

test('HTTP overlap is denied while expired-response cleanup releases only its request slot', { timeout: 5000 }, async t => {
  const f = await fixture(t);
  const pending = f.request();
  await f.entered;
  const overlap = await f.request();
  assert.equal(overlap.status, 429);
  assert.equal(JSON.parse(overlap.body).error.code, 'machine_concurrency_budget_exceeded');
  assert.equal(f.calls, 1);
  assert.equal(f.guard.concurrency.get(principal().id), 1);
  f.setTime(EXPIRY);
  f.release();
  assertExpiryDenial(await pending);
  assert.equal(f.guard.concurrency.size, 0);
  // No renewal or backward clock is used to make the original token valid again.
  assertExpiryDenial(await f.request());
  assert.equal(f.calls, 1);
});

test('HTTP response expiry check does not consume another request-rate token', { timeout: 5000 }, async t => {
  const f = await fixture(t);
  const pending = f.request();
  await f.entered;
  const rateBefore = structuredClone(f.guard.rate.get(principal().id));
  f.setTime(EXPIRY);
  f.release();
  assertExpiryDenial(await pending);
  assert.deepEqual(f.guard.rate.get(principal().id), rateBefore);
});
