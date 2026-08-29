import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  validateAnchorEvidence,
  validateAssetIdentity,
  validateBridgeRouteDescription,
  validateChainBoundarySchema,
  validateChainIdentity,
  validateChainObservation,
  validateFinalityEvidence,
  validateSettlementEvidence,
  validateTransactionReference
} from '../src/lib/chain-boundary-contracts.mjs';

const SCHEMA_URL = new URL('../../docs/architecture/contracts/chain-boundary.v1.schema.json', import.meta.url);
const SHA = 'a'.repeat(64);

const ethereum = Object.freeze({
  schema: 'axiom-chain-identity.v1',
  adapter_family: 'evm',
  namespace: 'eip155',
  network_id: '1',
  display_name: 'Ethereum Mainnet',
  profile_version: '0.1.0',
  profile_sha256: SHA
});

const tx = Object.freeze({
  schema: 'axiom-chain-transaction-reference.v1',
  chain: ethereum,
  transaction_id: `0x${'1'.repeat(64)}`
});

const asset = Object.freeze({
  schema: 'axiom-chain-asset.v1',
  chain: ethereum,
  asset_kind: 'token',
  local_identifier: `0x${'2'.repeat(40)}`,
  decimals: 6,
  symbol: 'USDC',
  name: 'USD Coin',
  representation_lineage: []
});

const finality = Object.freeze({
  schema: 'axiom-chain-finality-evidence.v1',
  chain: ethereum,
  model: 'finalized-checkpoint',
  status: 'final',
  reference: 'finalized:123456',
  verification_status: 'independently-verified',
  evidence_sha256: SHA,
  observed_at: '2026-08-28T03:00:00Z'
});

test('chain-boundary schema preserves strict enums and non-authorizing object shapes', () => {
  const schema = JSON.parse(readFileSync(SCHEMA_URL, 'utf8'));
  assert.equal(validateChainBoundarySchema(schema), true);
});

test('chain identity is chain-qualified and rejects unknown fields', () => {
  assert.equal(validateChainIdentity(ethereum), true);
  assert.throws(() => validateChainIdentity({ ...ethereum, authority: 'owner' }), /unsupported field/);
});

test('transaction references retain the chain identity', () => {
  assert.equal(validateTransactionReference(tx), true);
  assert.throws(() => validateTransactionReference({ ...tx, chain: undefined }), /chain/);
});

test('asset identity rejects ticker-only token identifiers', () => {
  assert.equal(validateAssetIdentity(asset), true);
  assert.throws(
    () => validateAssetIdentity({
      schema: 'axiom-chain-asset.v1',
      chain: ethereum,
      asset_kind: 'token',
      local_identifier: 'USDC',
      symbol: 'USDC',
      representation_lineage: []
    }),
    /local_identifier/
  );
});

test('finality evidence preserves model and verification state', () => {
  assert.equal(validateFinalityEvidence(finality), true);
  assert.throws(() => validateFinalityEvidence({ ...finality, verification_status: 'trusted' }), /verification_status/);
});

test('chain observations bind provider, adapter and payload digests', () => {
  assert.equal(validateChainObservation({
    schema: 'axiom-chain-observation.v1',
    chain: ethereum,
    observation_type: 'transaction',
    state_reference: 'block:123456',
    object_reference: tx.transaction_id,
    payload_sha256: SHA,
    provider_id: 'provider:fixture',
    adapter_id: 'adapter:fixture',
    adapter_version: '0.1.0',
    observed_at: '2026-08-28T03:00:00Z',
    finality_status: 'final',
    verification_status: 'independently-verified'
  }), true);
});

test('settlement evidence links rather than replaces local accounting truth', () => {
  assert.equal(validateSettlementEvidence({
    schema: 'axiom-chain-settlement-evidence.v1',
    obligation_ref: 'journal:obligation:123',
    transaction: tx,
    asset,
    amount_minor_units: 5000,
    unit: 'USDC:minor',
    payee_binding: 'principal:alice',
    finality,
    adapter_evidence_sha256: SHA,
    observed_at: '2026-08-28T03:00:00Z',
    status: 'final'
  }), true);
});

test('anchor evidence binds a local digest without making the chain canonical storage', () => {
  assert.equal(validateAnchorEvidence({
    schema: 'axiom-chain-anchor-evidence.v1',
    local_sha256: SHA,
    transaction: tx,
    finality,
    adapter_evidence_sha256: SHA,
    observed_at: '2026-08-28T03:00:00Z'
  }), true);
});

test('bridge route descriptions require explicit custody and trust assumptions', () => {
  const pulse = {
    ...ethereum,
    network_id: '369',
    display_name: 'PulseChain Mainnet',
    profile_sha256: 'b'.repeat(64)
  };
  const pulseAsset = {
    ...asset,
    chain: pulse,
    local_identifier: `0x${'3'.repeat(40)}`
  };

  const route = {
    schema: 'axiom-chain-bridge-route.v1',
    source_chain: ethereum,
    destination_chain: pulse,
    source_asset: asset,
    destination_asset: pulseAsset,
    provider_id: 'bridge:fixture',
    provider_version: '0.1.0',
    mechanism: 'lock-mint',
    custody_model: 'external-contract-custody',
    trust_model: 'external-relayer-set',
    assumptions: ['bridge contracts remain correct', 'relayer threshold remains available'],
    contract_dependencies: [`0x${'4'.repeat(40)}`],
    representation_change: 'canonical-token-to-bridged-representation',
    estimated_fee_minor_units: 100,
    fee_unit: 'ETH:wei',
    estimated_latency_seconds: 600,
    source_finality_requirement: 'finalized-checkpoint',
    destination_finality_requirement: 'profile-policy',
    operational_dependencies: ['source RPC', 'destination RPC', 'relayer service'],
    evidence_timestamp: '2026-08-28T03:00:00Z',
    local_risk_classification: 'elevated',
    required_execution_capability: 'chain.bridge.execute'
  };

  assert.equal(validateBridgeRouteDescription(route), true);
  const { trust_model: _removed, ...withoutTrust } = route;
  assert.throws(() => validateBridgeRouteDescription(withoutTrust), /trust_model/);
});
