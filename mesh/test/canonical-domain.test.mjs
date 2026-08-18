import assert from 'node:assert/strict';
import test from 'node:test';

import {
  canonicalJson,
  canonicalize,
  digestObject
} from '../src/lib/canonical.mjs';
import { normalizeMachinePrincipalDefinition } from '../src/lib/machine-principal.mjs';

test('canonical JSON rejects Date, Map, and custom class instances instead of collapsing state', () => {
  class AuthorityEnvelope {
    constructor() {
      this.visible = 'state';
    }
  }

  for (const value of [
    new Date('2026-08-18T00:00:00.000Z'),
    new Map([['authority', 'granted']]),
    new AuthorityEnvelope()
  ]) {
    assert.throws(() => canonicalJson(value), /plain records/i);
    assert.throws(() => digestObject(value), /plain records/i);
  }
});

test('symbol-keyed object and array state cannot be silently omitted', () => {
  const symbol = Symbol('hidden-authority');
  const object = { visible: true };
  object[symbol] = { permission: 'unexpected' };
  assert.throws(() => canonicalJson(object), /symbol-keyed state/i);

  const array = ['visible'];
  array[symbol] = 'hidden';
  assert.throws(() => canonicalJson(array), /symbol-keyed state/i);
});

test('canonical JSON rejects accessors and non-enumerable object state without invoking getters', () => {
  let getterInvoked = false;
  const accessor = {};
  Object.defineProperty(accessor, 'authority', {
    enumerable: true,
    get() {
      getterInvoked = true;
      return 'granted';
    }
  });
  assert.throws(() => canonicalJson(accessor), /data property/i);
  assert.equal(getterInvoked, false);

  const hidden = { visible: true };
  Object.defineProperty(hidden, 'authority', {
    value: 'granted',
    enumerable: false
  });
  assert.throws(() => canonicalJson(hidden), /non-enumerable state/i);
});

test('null-prototype records are explicitly accepted as plain JSON data', () => {
  const nullPrototype = Object.create(null);
  nullPrototype.z = [3, { b: true, a: 'x' }];
  nullPrototype.a = 1;

  const ordinary = { a: 1, z: [3, { a: 'x', b: true }] };
  assert.equal(canonicalJson(nullPrototype), canonicalJson(ordinary));
  assert.equal(digestObject(nullPrototype), digestObject(ordinary));
});

test('__proto__ remains ordinary own JSON state and does not mutate canonical output prototype', () => {
  const input = JSON.parse('{"__proto__":{"polluted":true},"a":1}');
  const canonical = canonicalize(input);
  assert.equal(Object.getPrototypeOf(canonical), Object.prototype);
  assert.equal(Object.hasOwn(canonical, '__proto__'), true);
  assert.deepEqual(canonical.__proto__, { polluted: true });
  assert.equal({}.polluted, undefined);
  assert.equal(canonicalJson(input), '{"__proto__":{"polluted":true},"a":1}');
});

test('canonical arrays are dense ordinary arrays with no custom hidden state', () => {
  const sparse = [1, , 3];
  assert.throws(() => canonicalJson(sparse), /sparse index/i);

  const custom = [1, 2];
  custom.authority = 'extra';
  assert.throws(() => canonicalJson(custom), /custom property authority/i);

  class CustomArray extends Array {}
  assert.throws(() => canonicalJson(new CustomArray(1, 2)), /ordinary Array prototype/i);

  assert.notEqual(digestObject(['a', 'b']), digestObject(['b', 'a']));
});

test('plain nested JSON remains deterministic across object key order', () => {
  const left = {
    z: [{ y: 2, x: 1 }],
    a: { d: false, c: null }
  };
  const right = {
    a: { c: null, d: false },
    z: [{ x: 1, y: 2 }]
  };
  assert.equal(canonicalJson(left), canonicalJson(right));
  assert.equal(digestObject(left), digestObject(right));
});

test('machine-principal set normalization preserves stable authority digests before canonical hashing', () => {
  const first = normalizeMachinePrincipalDefinition({
    id: 'agent.canonical-test',
    type: 'agent',
    sponsor: 'owner.canonical-test',
    roles: ['reviewer', 'researcher'],
    scopes: ['memory:read', 'intent:execute'],
    lifetime: 'persistent',
    runtime: {
      id: 'runtime.canonical-test',
      kind: 'local-process',
      software_digest: 'a'.repeat(64)
    },
    constraints: {
      actions: ['system.hash', 'system.echo'],
      purposes: ['test.conformance', 'research.safe'],
      destinations: ['mesh:test', 'local'],
      budgets: {
        max_requests_per_minute: 10,
        max_concurrent_requests: 1,
        max_execution_ms: 1_000,
        max_request_bytes: 8_192,
        max_response_bytes: 16_384
      },
      delegation: { allowed: false, max_depth: 0 }
    }
  });

  const second = normalizeMachinePrincipalDefinition({
    id: 'agent.canonical-test',
    type: 'agent',
    sponsor: 'owner.canonical-test',
    roles: ['researcher', 'reviewer'],
    scopes: ['intent:execute', 'memory:read'],
    lifetime: 'persistent',
    runtime: {
      kind: 'local-process',
      software_digest: 'a'.repeat(64),
      id: 'runtime.canonical-test'
    },
    constraints: {
      actions: ['system.echo', 'system.hash'],
      purposes: ['research.safe', 'test.conformance'],
      destinations: ['local', 'mesh:test'],
      budgets: {
        max_response_bytes: 16_384,
        max_request_bytes: 8_192,
        max_execution_ms: 1_000,
        max_concurrent_requests: 1,
        max_requests_per_minute: 10
      },
      delegation: { max_depth: 0, allowed: false }
    }
  });

  assert.deepEqual(first.roles, second.roles);
  assert.deepEqual(first.scopes, second.scopes);
  assert.deepEqual(first.constraints.actions, second.constraints.actions);
  assert.deepEqual(first.constraints.purposes, second.constraints.purposes);
  assert.deepEqual(first.constraints.destinations, second.constraints.destinations);
  assert.equal(first.authority_digest, second.authority_digest);
});
