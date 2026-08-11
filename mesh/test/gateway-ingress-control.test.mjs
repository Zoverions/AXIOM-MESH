import assert from 'node:assert/strict';
import test from 'node:test';

import { AxiomError } from '../src/lib/canonical.mjs';
import {
  GatewayIngressControl,
  createSingleFlightCache
} from '../src/gateway/ingress-control.mjs';

function request(address = '127.0.0.1', authorization = 'Bearer valid') {
  return {
    socket: { remoteAddress: address },
    headers: { authorization },
    url: '/v1/status',
    method: 'GET'
  };
}

function principal(id) {
  return { id, type: 'human', roles: [], scopes: ['*'] };
}

test('direct-network ingress preserves the per-address pre-authentication bucket', async () => {
  const control = new GatewayIngressControl({
    localIngress: false,
    capacity: 2,
    refillPerSecond: 0
  });
  const bearerAuth = async ({ req }) => (
    req.headers.authorization === 'Bearer beta'
      ? principal('tenant.beta')
      : principal('tenant.alpha')
  );

  await control.authenticate({ req: request('203.0.113.7', 'Bearer alpha') }, bearerAuth);
  await control.authenticate({ req: request('203.0.113.7', 'Bearer alpha') }, bearerAuth);
  await assert.rejects(
    () => control.authenticate({ req: request('203.0.113.7', 'Bearer beta') }, bearerAuth),
    error => error.code === 'rate_limited' && /IP request/.test(error.message)
  );

  assert.equal(
    (await control.authenticate({ req: request('203.0.113.8', 'Bearer beta') }, bearerAuth)).id,
    'tenant.beta'
  );
});

test('Unix-ingress mode isolates valid principals from the collapsed loopback address', async () => {
  const control = new GatewayIngressControl({
    localIngress: true,
    capacity: 2,
    refillPerSecond: 0
  });
  const bearerAuth = async ({ req }) => (
    req.headers.authorization === 'Bearer beta'
      ? principal('tenant.beta')
      : principal('tenant.alpha')
  );

  await control.authenticate({ req: request('127.0.0.1', 'Bearer alpha') }, bearerAuth);
  await control.authenticate({ req: request('127.0.0.1', 'Bearer alpha') }, bearerAuth);
  await assert.rejects(
    () => control.authenticate({ req: request('127.0.0.1', 'Bearer alpha') }, bearerAuth),
    error => error.code === 'rate_limited' && /Principal request/.test(error.message)
  );

  assert.equal(
    (await control.authenticate({ req: request('127.0.0.1', 'Bearer beta') }, bearerAuth)).id,
    'tenant.beta'
  );
});

test('invalid-auth pressure is globally bounded in Unix-ingress mode without spending valid principal budgets', async () => {
  const control = new GatewayIngressControl({
    localIngress: true,
    capacity: 2,
    refillPerSecond: 0
  });
  const bearerAuth = async ({ req }) => {
    if (req.headers.authorization !== 'Bearer beta') {
      throw new AxiomError('invalid_token', 'Bearer token is invalid', 401);
    }
    return principal('tenant.beta');
  };

  for (let index = 0; index < 2; index += 1) {
    await assert.rejects(
      () => control.authenticate({ req: request('127.0.0.1', 'Bearer invalid') }, bearerAuth),
      error => error.code === 'invalid_token' && error.status === 401
    );
  }
  await assert.rejects(
    () => control.authenticate({ req: request('127.0.0.1', 'Bearer invalid') }, bearerAuth),
    error => error.code === 'rate_limited' && /Invalid-authentication/.test(error.message)
  );

  assert.equal(
    (await control.authenticate({ req: request('127.0.0.1', 'Bearer beta') }, bearerAuth)).id,
    'tenant.beta'
  );
});

test('Unix-ingress readiness has no caller-spendable probe bucket', () => {
  const local = new GatewayIngressControl({
    localIngress: true,
    probeCapacity: 1,
    probeRefillPerSecond: 0
  });
  for (let index = 0; index < 100; index += 1) {
    assert.doesNotThrow(() => local.admitProbe(request('127.0.0.1')));
  }

  const direct = new GatewayIngressControl({
    localIngress: false,
    probeCapacity: 1,
    probeRefillPerSecond: 0
  });
  direct.admitProbe(request('203.0.113.7'));
  assert.throws(
    () => direct.admitProbe(request('203.0.113.7')),
    error => error.code === 'rate_limited' && error.status === 429
  );
});

test('readiness single-flight bounds dependency work and serves a short cache', async () => {
  let clock = 1_000;
  let loads = 0;
  let release;
  const blocked = new Promise(resolve => { release = resolve; });
  const cached = createSingleFlightCache({
    cacheMs: 250,
    now: () => clock,
    load: async traceId => {
      loads += 1;
      await blocked;
      return { status: 'ready', trace_id: traceId };
    }
  });

  const requests = Array.from({ length: 50 }, (_, index) => cached(`trace-${index}`));
  await Promise.resolve();
  assert.equal(loads, 1);
  release();
  const results = await Promise.all(requests);
  assert.equal(loads, 1);
  assert.equal(results.every(result => result.status === 'ready'), true);

  clock += 200;
  await cached('trace-cached');
  assert.equal(loads, 1);

  clock += 51;
  const refreshed = createSingleFlightCache({
    cacheMs: 250,
    now: () => clock,
    load: async () => {
      loads += 1;
      return { status: 'ready' };
    }
  });
  await refreshed('trace-new-cache');
  assert.equal(loads, 2);
});
