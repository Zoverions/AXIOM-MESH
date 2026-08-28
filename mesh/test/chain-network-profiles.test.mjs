import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  validateChainNetworkProfile,
  validateChainNetworkProfileCatalog
} from '../src/lib/chain-network-profiles.mjs';

const CATALOG_URL = new URL('../config/chain-network-profiles.v0.json', import.meta.url);

function loadCatalog() {
  return JSON.parse(readFileSync(CATALOG_URL, 'utf8'));
}

test('chain profile catalog contains EVM and Starknet families without enabling networks', () => {
  const catalog = loadCatalog();
  assert.equal(validateChainNetworkProfileCatalog(catalog), true);
  assert.deepEqual(
    catalog.profiles.map((profile) => profile.profile_id),
    ['evm:ethereum-mainnet', 'evm:pulsechain-mainnet', 'starknet:mainnet']
  );

  for (const profile of catalog.profiles) {
    assert.equal(validateChainNetworkProfile(profile), true);
    assert.equal(profile.authority_boundary.profile_grants_authority, false);
    assert.equal(profile.authority_boundary.live_network_enabled, false);
    assert.equal(profile.authority_boundary.write_enabled, false);
    assert.deepEqual(profile.rpc.endpoints, []);
    assert.equal(profile.rpc.credentials_required, false);
  }
});

test('Ethereum and PulseChain share the EVM family while Starknet remains separate', () => {
  const catalog = loadCatalog();
  const [ethereum, pulsechain, starknet] = catalog.profiles;

  assert.equal(ethereum.chain.adapter_family, 'evm');
  assert.equal(ethereum.chain.namespace, 'eip155');
  assert.equal(ethereum.chain.network_id, '1');

  assert.equal(pulsechain.chain.adapter_family, 'evm');
  assert.equal(pulsechain.chain.namespace, 'eip155');
  assert.equal(pulsechain.chain.network_id, '369');

  assert.equal(starknet.chain.adapter_family, 'starknet');
  assert.equal(starknet.chain.namespace, 'starknet');
  assert.equal(starknet.chain.network_id, 'SN_MAIN');
});

test('profile validation fails closed on live network or write promotion', () => {
  const profile = loadCatalog().profiles[0];
  assert.throws(
    () => validateChainNetworkProfile({
      ...profile,
      authority_boundary: { ...profile.authority_boundary, live_network_enabled: true }
    }),
    /live_network_enabled/
  );
  assert.throws(
    () => validateChainNetworkProfile({
      ...profile,
      authority_boundary: { ...profile.authority_boundary, write_enabled: true }
    }),
    /write_enabled/
  );
});
