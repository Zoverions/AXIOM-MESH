import assert from 'node:assert/strict';
import test from 'node:test';

import { mergeDenyDominantPolicy } from '../src/lib/policy.mjs';

function policy(constraints, version = 'base') {
  return {
    version,
    actions: {
      'system.echo': {
        decision: 'allow',
        risk: 'low',
        required_scopes: ['intent:execute'],
        tool: 'builtin.echo',
        constraints
      }
    }
  };
}

function merge(left, right) {
  return mergeDenyDominantPolicy([
    policy(left, 'base'),
    policy(right, 'overlay')
  ]).actions['system.echo'].constraints;
}

test('permission-style boolean constraints tighten only through a declared operator', () => {
  assert.equal(merge({ network: true }, { network: false }).network, false);
  assert.equal(merge({ network: false }, { network: true }).network, false);
  assert.equal(merge({ network: true }, { network: true }).network, true);
  assert.equal(merge({ network: false }, { network: false }).network, false);
});

test('requirement-style boolean constraints cannot be lowered by another layer', () => {
  for (const key of ['require_encryption', 'require_attestation', 'must_preserve_provenance']) {
    assert.equal(merge({ [key]: true }, { [key]: false })[key], true);
    assert.equal(merge({ [key]: false }, { [key]: true })[key], true);
    assert.equal(merge({ [key]: true }, { [key]: true })[key], true);
    assert.equal(merge({ [key]: false }, { [key]: false })[key], false);
  }
});

test('unknown conflicting booleans fail closed while identical unknown values remain stable', () => {
  assert.throws(
    () => merge({ future_boolean: true }, { future_boolean: false }),
    /merge direction is undeclared.*future_boolean/i
  );
  assert.equal(merge({ future_boolean: true }, { future_boolean: true }).future_boolean, true);
  assert.equal(merge({ future_boolean: false }, { future_boolean: false }).future_boolean, false);
});

test('declared boolean constraint keys reject non-boolean substitution', () => {
  assert.throws(
    () => merge({ require_encryption: true }, { require_encryption: 'yes' }),
    /must use boolean values/i
  );
  assert.throws(
    () => merge({ network: false }, { network: 0 }),
    /must use boolean values/i
  );
});

test('numeric max and min constraints retain explicit monotonic direction', () => {
  const result = merge(
    { maximum_items: 10, minimum_assurance: 2 },
    { maximum_items: 5, minimum_assurance: 4 }
  );
  assert.equal(result.maximum_items, 5);
  assert.equal(result.minimum_assurance, 4);
  assert.throws(
    () => merge({ threshold: 10 }, { threshold: 5 }),
    /merge direction is undeclared.*threshold/i
  );
});

test('finite allowlist constraints intersect while undeclared structured conflicts fail closed', () => {
  const result = merge(
    { allowed_regions: ['ca', 'us'], permitted_modes: ['safe', 'reviewed'] },
    { allowed_regions: ['ca', 'eu'], permitted_modes: ['safe'] }
  );
  assert.deepEqual(result.allowed_regions, ['ca']);
  assert.deepEqual(result.permitted_modes, ['safe']);

  const canonicalObjectIntersection = merge(
    { allowed_targets: [{ a: 1, b: 2 }, { id: 'drop' }] },
    { allowed_targets: [{ b: 2, a: 1 }] }
  );
  assert.deepEqual(canonicalObjectIntersection.allowed_targets, [{ a: 1, b: 2 }]);

  assert.throws(
    () => merge({ regions: ['ca', 'us'] }, { regions: ['ca'] }),
    /merge direction is undeclared.*regions/i
  );
  assert.deepEqual(
    merge({ metadata: { mode: 'fixed' } }, { metadata: { mode: 'fixed' } }).metadata,
    { mode: 'fixed' }
  );
  assert.throws(
    () => merge({ metadata: { mode: 'fixed' } }, { metadata: { mode: 'changed' } }),
    /merge direction is undeclared.*metadata/i
  );
});

test('declared boolean operators are monotone for every boolean pair', () => {
  for (const left of [false, true]) {
    for (const right of [false, true]) {
      const network = merge({ network: left }, { network: right }).network;
      assert.equal(network, left && right);
      assert.equal(Number(network) <= Number(left), true);
      assert.equal(Number(network) <= Number(right), true);

      const encryption = merge(
        { require_encryption: left },
        { require_encryption: right }
      ).require_encryption;
      assert.equal(encryption, left || right);
      assert.equal(Number(encryption) >= Number(left), true);
      assert.equal(Number(encryption) >= Number(right), true);
    }
  }
});

test('finite allowlist intersection is never broader than either input', () => {
  const candidates = [
    [],
    ['ca'],
    ['us'],
    ['ca', 'us'],
    ['ca', 'eu', 'us']
  ];
  for (const left of candidates) {
    for (const right of candidates) {
      const output = merge({ allowed_regions: left }, { allowed_regions: right }).allowed_regions;
      assert.equal(output.every(value => left.includes(value)), true);
      assert.equal(output.every(value => right.includes(value)), true);
      assert.equal(output.length <= left.length, true);
      assert.equal(output.length <= right.length, true);
    }
  }
});
