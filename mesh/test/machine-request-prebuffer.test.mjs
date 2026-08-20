import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import test from 'node:test';

import { sha256 } from '../src/lib/canonical.mjs';
import { Router, createServiceServer } from '../src/lib/http.mjs';
import { createBearerAuthenticator } from '../src/lib/public-auth.mjs';

const MACHINE_TOKEN = `machine-prebuffer-${'a'.repeat(32)}`;
const HUMAN_TOKEN = `human-prebuffer-${'h'.repeat(32)}`;

function machinePrincipal() {
  return {
    schema: 'axiom-machine-principal.v1',
    id: 'agent.prebuffer-test',
    type: 'agent',
    sponsor: 'owner.prebuffer-test',
    roles: ['researcher'],
    scopes: ['intent:execute'],
    lifetime: 'session',
    expires_at: '2099-01-01T00:00:00.000Z',
    runtime: {
      id: 'runtime.prebuffer-test',
      kind: 'local-process',
      software_digest: 'a'.repeat(64)
    },
    constraints: {
      actions: ['system.echo'],
      purposes: ['test.conformance'],
      destinations: ['local'],
      budgets: {
        max_requests_per_minute: 30,
        max_concurrent_requests: 1,
        max_execution_ms: 2_000,
        max_request_bytes: 1_024,
        max_response_bytes: 65_536
      },
      delegation: { allowed: false, max_depth: 0 }
    },
    authority_digest: 'b'.repeat(64)
  };
}

function humanPrincipal() {
  return {
    id: 'owner.prebuffer-test',
    type: 'human',
    roles: ['administrator'],
    scopes: ['*']
  };
}

async function request(port, token, body) {
  const payload = Buffer.isBuffer(body) ? body : Buffer.from(body);
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1',
      port,
      path: '/bounded',
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/octet-stream',
        'content-length': String(payload.length)
      }
    }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({
        status: res.statusCode,
        body: JSON.parse(Buffer.concat(chunks).toString('utf8'))
      }));
    });
    req.on('error', reject);
    req.end(payload);
  });
}

test('valid machine bearer lowers the body ceiling before authentication and route execution', async t => {
  const principals = new Map([
    [sha256(MACHINE_TOKEN), machinePrincipal()],
    [sha256(HUMAN_TOKEN), humanPrincipal()]
  ]);
  const bearerAuth = createBearerAuthenticator(principals);
  let authenticationCalls = 0;
  let handlerCalls = 0;
  const authenticate = async args => {
    authenticationCalls += 1;
    return bearerAuth(args);
  };

  const router = new Router();
  router.add('POST', '/bounded', async ({ body }) => {
    handlerCalls += 1;
    return { bytes: body.length };
  });
  const server = createServiceServer({
    name: 'machine-prebuffer-test',
    router,
    maxBodyBytes: 4_096,
    authenticate,
    // Match Gateway wiring: ingress wraps authenticate, while the bearer
    // admission hook passes through unchanged and carries the pure limit resolver.
    admitRequest: bearerAuth.admitRequest,
    inspectResponse: bearerAuth.inspectResponse
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    if (server.listening) await new Promise(resolve => server.close(resolve));
  });
  const { port } = server.address();

  const oversized = await request(port, MACHINE_TOKEN, Buffer.alloc(2_048, 0x61));
  assert.equal(oversized.status, 413);
  assert.equal(oversized.body.error.code, 'machine_request_budget_exceeded');
  assert.equal(oversized.body.error.details.max_request_bytes, 1_024);
  assert.equal(oversized.body.error.details.request_bytes, 2_048);
  assert.equal(authenticationCalls, 0);
  assert.equal(handlerCalls, 0);

  // The pre-buffer rejection does not consume authenticated request-rate or
  // concurrency state. A subsequent in-budget request traverses normally.
  const allowed = await request(port, MACHINE_TOKEN, Buffer.alloc(512, 0x62));
  assert.equal(allowed.status, 200);
  assert.equal(allowed.body.bytes, 512);
  assert.equal(authenticationCalls, 1);
  assert.equal(handlerCalls, 1);

  // Human callers retain the configured global ceiling rather than inheriting
  // the machine principal's smaller bound.
  const human = await request(port, HUMAN_TOKEN, Buffer.alloc(2_048, 0x63));
  assert.equal(human.status, 200);
  assert.equal(human.body.bytes, 2_048);
  assert.equal(authenticationCalls, 2);
  assert.equal(handlerCalls, 2);
});

test('invalid bearer credentials do not gain a smaller trusted limit or new authority semantics', async t => {
  const principals = new Map([[sha256(MACHINE_TOKEN), machinePrincipal()]]);
  const bearerAuth = createBearerAuthenticator(principals);
  let authenticationCalls = 0;
  const authenticate = async args => {
    authenticationCalls += 1;
    return bearerAuth(args);
  };
  const router = new Router();
  router.add('POST', '/bounded', async () => ({ ok: true }));
  const server = createServiceServer({
    name: 'invalid-prebuffer-test',
    router,
    maxBodyBytes: 4_096,
    authenticate,
    admitRequest: bearerAuth.admitRequest,
    inspectResponse: bearerAuth.inspectResponse
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    if (server.listening) await new Promise(resolve => server.close(resolve));
  });
  const { port } = server.address();

  const denied = await request(port, 'invalid-token', Buffer.alloc(2_048, 0x64));
  assert.equal(denied.status, 401);
  assert.equal(denied.body.error.code, 'invalid_token');
  assert.equal(authenticationCalls, 1);
});
