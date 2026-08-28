import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const CAPABILITIES_URL = new URL('../config/capabilities.json', import.meta.url);

function loadCapabilities() {
  return JSON.parse(readFileSync(CAPABILITIES_URL, 'utf8')).capabilities;
}

test('chain boundary is specified without promoting external effects', () => {
  const capabilities = loadCapabilities();
  const byId = new Map(capabilities.map((entry) => [entry.id, entry]));

  assert.equal(byId.get('chain.observe')?.status, 'specified');
  assert.equal(byId.get('chain.verify')?.status, 'specified');
  assert.match(byId.get('chain.observe')?.summary ?? '', /does not authorize/i);
  assert.match(byId.get('chain.verify')?.summary ?? '', /does not authorize/i);
  assert.equal(byId.get('economics.token-bridge-liquidity')?.status, 'disabled');

  for (const forbidden of [
    'chain.transaction.sign',
    'chain.transaction.broadcast',
    'chain.contract.write',
    'chain.anchor.create',
    'chain.settlement.execute',
    'chain.bridge.execute'
  ]) {
    assert.equal(byId.has(forbidden), false, `${forbidden} must not be registered`);
  }
});
