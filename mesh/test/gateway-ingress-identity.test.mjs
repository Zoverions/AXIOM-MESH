import assert from 'node:assert/strict';
import test from 'node:test';

import { GatewayIngressControl, clientAddressPrefix } from '../src/gateway/ingress-control.mjs';
import { TokenBucketLimiter } from '../src/lib/http.mjs';

// Counts every walk over a limiter's bucket map (scalability audit S-08).
class WalkCountingMap extends Map {
  walks = 0;
  [Symbol.iterator]() { this.walks += 1; return super[Symbol.iterator](); }
  entries() { this.walks += 1; return super.entries(); }
  keys() { this.walks += 1; return super.keys(); }
  values() { this.walks += 1; return super.values(); }
  forEach(...args) { this.walks += 1; return super.forEach(...args); }
}

function request(address, headers = {}) {
  return {
    socket: { remoteAddress: address },
    headers: { authorization: 'Bearer valid', ...headers },
    url: '/v1/status',
    method: 'GET'
  };
}

const alpha = async () => ({ id: 'tenant.alpha', type: 'human', roles: [], scopes: ['*'] });

test('client address keys: IPv6 by /64, IPv4-mapped as IPv4, malformed as unknown', () => {
  assert.equal(clientAddressPrefix('203.0.113.7'), '203.0.113.7');
  assert.equal(clientAddressPrefix('::ffff:203.0.113.7'), '203.0.113.7');
  assert.equal(clientAddressPrefix('::FFFF:cb00:7107'), '203.0.113.7');
  assert.equal(clientAddressPrefix('2001:db8:1:2:aaaa:bbbb:cccc:dddd'), '2001:db8:1:2::/64');
  assert.equal(clientAddressPrefix('2001:0DB8:0001:0002::1'), '2001:db8:1:2::/64');
  assert.equal(clientAddressPrefix('2001:db8:1:3::1'), '2001:db8:1:3::/64');
  assert.equal(clientAddressPrefix('fe80::1%eth0'), 'fe80:0:0:0::/64');
  for (const bad of ['1::2::3', 'not-an-address', '', undefined, null]) {
    assert.equal(clientAddressPrefix(bad), 'unknown');
  }
});

test('one IPv6 host cannot multiply its pre-authentication budget across its /64', async () => {
  const control = new GatewayIngressControl({ capacity: 2, refillPerSecond: 0 });
  await control.authenticate({ req: request('2001:db8:1:2::1') }, alpha);
  await control.authenticate({ req: request('2001:db8:1:2::ffff') }, alpha);
  await assert.rejects(
    () => control.authenticate({ req: request('2001:db8:1:2:dead:beef:0:1') }, alpha),
    error => error.code === 'rate_limited' && /IP request/.test(error.message)
  );
  // A different /64 is a different client.
  const beta = async () => ({ id: 'tenant.beta', type: 'human', roles: [], scopes: ['*'] });
  assert.equal((await control.authenticate({ req: request('2001:db8:1:3::1') }, beta)).id, 'tenant.beta');
});

test('forwarding headers never choose the rate-limit bucket', async () => {
  const control = new GatewayIngressControl({ capacity: 2, refillPerSecond: 0 });
  const spoofed = index => request('198.51.100.9', {
    'x-forwarded-for': `203.0.113.${index}`,
    'x-real-ip': `203.0.113.${index}`,
    forwarded: `for=203.0.113.${index}`
  });
  await control.authenticate({ req: spoofed(1) }, alpha);
  await control.authenticate({ req: spoofed(2) }, alpha);
  await assert.rejects(
    () => control.authenticate({ req: spoofed(3) }, alpha),
    error => error.code === 'rate_limited' && /IP request/.test(error.message)
  );
});

test('a full limiter finds a refilled bucket without scanning, and still fails closed', () => {
  const limiter = new TokenBucketLimiter({ capacity: 2, refillPerSecond: 1, maxKeys: 1_000 });
  const buckets = new WalkCountingMap();
  limiter.buckets = buckets;
  const now = 1_000_000;
  for (let index = 0; index < 1_000; index += 1) {
    assert.equal(limiter.take(`k-${index}`, now + index), true);
  }
  // Every bucket is still refilling: new keys are refused, with no scan.
  for (let index = 0; index < 200; index += 1) {
    assert.equal(limiter.take(`new-${index}`, now + 500), false);
  }
  // k-0 used 1 of 2 tokens at `now`, so it is full again 1 s later; the
  // next new key evicts exactly it, and the rest stay refused.
  assert.equal(limiter.take('late', now + 999), false);
  assert.equal(limiter.take('late', now + 1_000), true);
  assert.equal(limiter.buckets.has('k-0'), false);
  assert.equal(limiter.buckets.has('k-1'), true);
  assert.equal(buckets.walks, 0);
});

test('limiter bookkeeping stays proportional to live keys under sustained traffic', () => {
  const limiter = new TokenBucketLimiter({ capacity: 60, refillPerSecond: 1, maxKeys: 10 });
  for (let index = 0; index < 50_000; index += 1) {
    limiter.take(`k-${index % 10}`, 1_000 + index);
  }
  assert.equal(limiter.buckets.size, 10);
  assert.ok(limiter.fullHeap.length <= 2 * limiter.buckets.size + 64);
});
