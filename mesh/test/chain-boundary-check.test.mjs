import assert from 'node:assert/strict';
import test from 'node:test';
import { checkChainBoundary } from '../src/check-chain-boundary.mjs';

test('chain boundary checker proves the first slice remains offline and non-authorizing', () => {
  assert.deepEqual(checkChainBoundary(), {
    schema: 'axiom-chain-boundary-check.v0',
    profiles: 3,
    adapter_families: 2,
    observation_status: 'specified',
    verification_status: 'specified',
    live_network_enabled: false,
    write_enabled: false,
    bridge_execution_enabled: false
  });
});
