import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  validateChainReadAdapterCatalog,
  validateChainReadAdapterManifest,
  validateChainReadAdapterSchema
} from '../src/lib/chain-read-adapter-contracts.mjs';

const SCHEMA_URL = new URL('../../docs/architecture/contracts/chain-read-adapter.v1.schema.json', import.meta.url);
const CATALOG_URL = new URL('../config/chain-read-adapters.v0.json', import.meta.url);
const OPERATIONS = [
  'describeNetwork',
  'getHead',
  'getBlockReference',
  'getTransaction',
  'getReceiptOrOutcome',
  'getContractOrAccountState',
  'getLogsOrEvents',
  'verifyObservation',
  'classifyFinality'
];

function loadCatalog() {
  return JSON.parse(readFileSync(CATALOG_URL, 'utf8'));
}

test('read adapter schema and catalog preserve one chain-neutral operation surface', () => {
  assert.equal(validateChainReadAdapterSchema(JSON.parse(readFileSync(SCHEMA_URL, 'utf8'))), true);
  const catalog = loadCatalog();
  assert.equal(validateChainReadAdapterCatalog(catalog), true);
  assert.deepEqual(catalog.adapters.map((adapter) => adapter.adapter_id), ['evm-read-v0', 'starknet-read-v0']);

  for (const adapter of catalog.adapters) {
    assert.equal(validateChainReadAdapterManifest(adapter), true);
    assert.deepEqual(adapter.normalized_operations, OPERATIONS);
    assert.equal(adapter.network_access.enabled, false);
    assert.equal(adapter.write_surface.enabled, false);
    assert.equal(adapter.signing_surface.enabled, false);
    assert.equal(adapter.bridge_execution.enabled, false);
    assert.equal(adapter.installation_grants_authority, false);
  }
});

test('EVM and Starknet manifests remain separate families over the same normalized surface', () => {
  const [evm, starknet] = loadCatalog().adapters;
  assert.equal(evm.adapter_family, 'evm');
  assert.deepEqual(evm.supported_profile_ids, ['evm:ethereum-mainnet', 'evm:pulsechain-mainnet']);
  assert.equal(starknet.adapter_family, 'starknet');
  assert.deepEqual(starknet.supported_profile_ids, ['starknet:mainnet']);
  assert.ok(evm.family_rpc_methods.includes('eth_chainId'));
  assert.ok(starknet.family_rpc_methods.includes('starknet_chainId'));
});

test('manifest validation rejects enabled effect surfaces and authority-like operation names', () => {
  const adapter = loadCatalog().adapters[0];
  assert.throws(() => validateChainReadAdapterManifest({ ...adapter, network_access: { enabled: true } }), /network_access/);
  assert.throws(() => validateChainReadAdapterManifest({ ...adapter, write_surface: { enabled: true } }), /write_surface/);
  assert.throws(() => validateChainReadAdapterManifest({ ...adapter, signing_surface: { enabled: true } }), /signing_surface/);
  assert.throws(() => validateChainReadAdapterManifest({ ...adapter, bridge_execution: { enabled: true } }), /bridge_execution/);
  assert.throws(
    () => validateChainReadAdapterManifest({ ...adapter, normalized_operations: [...adapter.normalized_operations, 'signTransaction'] }),
    /normalized_operations/
  );
});
