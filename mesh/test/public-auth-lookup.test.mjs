import test from 'node:test';
import assert from 'node:assert/strict';
import { createBearerAuthenticator } from '../src/lib/public-auth.mjs';
import { normalizeApiPrincipalRegistry } from '../src/lib/principal-registry.mjs';

// Counts every walk over the registry. Resolving a bearer token must never
// walk it: the token's digest is the key (scalability audit S-07).
class WalkCountingMap extends Map {
  walks = 0;
  lookups = 0;
  get(key) { this.lookups += 1; return super.get(key); }
  [Symbol.iterator]() { this.walks += 1; return super[Symbol.iterator](); }
  entries() { this.walks += 1; return super.entries(); }
  keys() { this.walks += 1; return super.keys(); }
  values() { this.walks += 1; return super.values(); }
  forEach(...args) { this.walks += 1; return super.forEach(...args); }
}

function token(index) {
  return `token-${String(index).padStart(6, '0')}-${'x'.repeat(32)}`;
}

function registry(count) {
  const entries = {};
  for (let index = 0; index < count; index += 1) {
    entries[token(index)] = { id: `person-${index}`, type: 'human', roles: [], scopes: ['intent:read'] };
  }
  return new WalkCountingMap(normalizeApiPrincipalRegistry(entries));
}

function request(authorization) {
  return { req: { headers: authorization === undefined ? {} : { authorization } } };
}

test('bearer resolution is one digest lookup at any registry size', async () => {
  const principals = registry(5_000);
  const authenticate = createBearerAuthenticator(principals);

  assert.equal((await authenticate(request(`Bearer ${token(0)}`))).id, 'person-0');
  assert.equal((await authenticate(request(`Bearer ${token(4_999)}`))).id, 'person-4999');
  await assert.rejects(
    () => authenticate(request(`Bearer ${token(5_000)}`)),
    error => error.code === 'invalid_token' && error.status === 401
  );
  await assert.rejects(
    () => authenticate(request(`Bearer ${token(1)} `)),
    error => error.code === 'invalid_token'
  );
  await assert.rejects(
    () => authenticate(request(undefined)),
    error => error.code === 'authentication_required'
  );
  assert.equal(principals.walks, 0, 'the registry is never scanned');
  assert.equal(principals.lookups, 4, 'hits and misses each cost exactly one lookup');
});

test('a resolved principal is a copy; the registry entry cannot be altered through it', async () => {
  const principals = registry(2);
  const authenticate = createBearerAuthenticator(principals);
  const first = await authenticate(request(`Bearer ${token(1)}`));
  first.scopes.push('*');
  const second = await authenticate(request(`Bearer ${token(1)}`));
  assert.deepEqual(second.scopes, ['intent:read']);
});
