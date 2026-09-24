import assert from 'node:assert/strict';
import test from 'node:test';
import { projectCapabilityParity } from '../../apps/axiom-one/presentation.mjs';

const NON_RUNNABLE_STATUSES = Object.freeze([
  'adapter_required',
  'disabled',
  'specified',
  'experimental'
]);

test('projects registry capabilities without inferring principal authority', () => {
  const result = projectCapabilityParity({
    capabilities: [
      {
        id: 'core.intent-loop',
        family: 'core',
        status: 'implemented',
        summary: 'Intent loop.'
      },
      ...NON_RUNNABLE_STATUSES.map(status => ({
        id: `future.${status}`,
        family: 'future',
        status,
        summary: `${status} capability.`
      }))
    ]
  });

  assert.equal(result.source, 'capabilities.list');
  assert.equal(result.authority, 'not-inferred-from-discovery');
  assert.equal(result.total, 5);
  assert.equal(result.implemented, 1);
  assert.deepEqual(result.families, ['core', 'future']);

  const implemented = result.capabilities.find(item => item.id === 'core.intent-loop');
  assert.equal(implemented.runnable_claim, true);
  assert.equal(implemented.authorized_to_principal, null);

  for (const status of NON_RUNNABLE_STATUSES) {
    const projected = result.capabilities.find(item => item.status === status);
    assert.equal(projected.runnable_claim, false);
    assert.equal(projected.authorized_to_principal, null);
  }
});

test('missing or malformed capability inventory creates no claims', () => {
  for (const input of [{}, { capabilities: null }, { capabilities: {} }]) {
    const result = projectCapabilityParity(input);
    assert.equal(result.source, 'capabilities.list');
    assert.equal(result.authority, 'not-inferred-from-discovery');
    assert.equal(result.total, 0);
    assert.equal(result.implemented, 0);
    assert.deepEqual(result.families, []);
    assert.deepEqual(result.capabilities, []);
  }
});
