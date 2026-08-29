# Chain-Neutral Blockchain Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a deterministic, read-only, chain-neutral blockchain boundary that can describe and validate Ethereum/PulseChain EVM profiles and a separate Starknet profile without enabling live network access, signing, settlement, or bridge execution.

**Architecture:** Keep AXIOM local accounting and authority independent from blockchains. Add strict JSON contracts and validators for chain identities/observations/finality/asset/transaction/settlement/anchor/bridge-route descriptions, then add non-authorizing network-profile and read-adapter manifests. The first slice is pure data plus validation/check tooling: no sockets, RPC clients, credentials, wallet material, signing, broadcasting, settlement execution, or bridge execution.

**Tech Stack:** Node.js ESM, `node:test`, `node:assert/strict`, JSON Schema 2020-12, existing AXIOM canonical/validation helpers, existing capability registry/check patterns.

**Spec:** `docs/superpowers/specs/2026-08-27-chain-neutral-blockchain-boundary-design.md`

## Global Constraints

- Supported Node.js remains exactly `>=22.23.2 <23 || >=24.14.0 <25`.
- `economics.accounting` remains implemented and local; external settlement remains disabled.
- `economics.token-bridge-liquidity` remains `disabled` throughout this plan.
- Add only `chain.observe` and `chain.verify`, both initially `specified`; do not mark them `adapter_required` or `implemented` in this slice.
- Do not add any `chain.*` write capability (`sign`, `broadcast`, `execute`, `write`, `anchor.create`, `bridge.execute`).
- No live RPC endpoint, secret, wallet, private key, signing library, broadcast path, custody path, bridge execution path, or outbound network call may be introduced.
- Ethereum and PulseChain share the `evm` adapter family; Starknet is a separate `starknet` family.
- External observations and profile metadata are non-authorizing inputs/evidence only.
- Unknown or unsupported semantics fail closed.

---

### Task 1: Lock the capability boundary

**Files:**
- Create: `mesh/test/chain-capability-boundary.test.mjs`
- Modify: `mesh/config/capabilities.json`

**Interfaces:**
- Consumes: existing `axiom-capabilities.v1` registry structure.
- Produces: registry entries `chain.observe` and `chain.verify` with status `specified`, while preserving `economics.token-bridge-liquidity = disabled`.

- [ ] **Step 1: Write the failing test**

```js
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
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test mesh/test/chain-capability-boundary.test.mjs`

Expected: FAIL because `chain.observe` and `chain.verify` do not yet exist.

- [ ] **Step 3: Add the minimal registry entries**

Add exactly these two entries near the economics/verification boundary:

```json
{
  "id": "chain.observe",
  "family": "economics",
  "status": "specified",
  "summary": "Chain-qualified external observations are specified as non-authorizing evidence inputs; no live adapter, signing, broadcast, settlement, or bridge execution is enabled."
},
{
  "id": "chain.verify",
  "family": "verification",
  "status": "specified",
  "summary": "Chain-qualified verification and finality evidence are specified as non-authorizing checks; no verified observation can mint local AXIOM authority."
}
```

Do not modify `economics.token-bridge-liquidity` except to preserve its current disabled status and wording.

- [ ] **Step 4: Run the focused test and registry checker**

Run:

```bash
node --test mesh/test/chain-capability-boundary.test.mjs
node mesh/src/check-registry.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add mesh/test/chain-capability-boundary.test.mjs mesh/config/capabilities.json
git commit -m "spec: register non-authorizing chain observation boundary"
```

---

### Task 2: Add the chain-neutral evidence contract

**Files:**
- Create: `docs/architecture/contracts/chain-boundary.v1.schema.json`
- Create: `mesh/src/lib/chain-boundary-contracts.mjs`
- Create: `mesh/test/chain-boundary-contracts.test.mjs`

**Interfaces:**
- Consumes: `canonicalJson` and `ValidationError` from `mesh/src/lib/canonical.mjs`.
- Produces:
  - `CHAIN_BOUNDARY_SCHEMA = 'axiom-chain-boundary.v1'`
  - `CHAIN_BOUNDARY_SCHEMA_ID = 'urn:axiom:contract:chain-boundary:v1'`
  - `validateChainBoundarySchema(schema)`
  - `validateChainIdentity(value)`
  - `validateTransactionReference(value)`
  - `validateAssetIdentity(value)`
  - `validateFinalityEvidence(value)`
  - `validateChainObservation(value)`
  - `validateSettlementEvidence(value)`
  - `validateAnchorEvidence(value)`
  - `validateBridgeRouteDescription(value)`

- [ ] **Step 1: Write failing contract tests**

Create tests that require strict unknown-field rejection, chain-qualified asset/transaction identities, non-empty provider/adapter identity, bounded timestamps, explicit finality model/status, explicit verification status, and explicit bridge trust/custody fields.

The first happy-path identity fixture is:

```js
const ethereum = Object.freeze({
  schema: 'axiom-chain-identity.v1',
  adapter_family: 'evm',
  namespace: 'eip155',
  network_id: '1',
  display_name: 'Ethereum Mainnet',
  profile_version: '0.1.0',
  profile_sha256: 'a'.repeat(64)
});
```

The tests must also prove:

```js
assert.throws(
  () => validateAssetIdentity({
    schema: 'axiom-chain-asset.v1',
    chain: ethereum,
    asset_kind: 'token',
    local_identifier: 'USDC',
    symbol: 'USDC'
  }),
  /local_identifier/
);
```

because ticker-only identity is not sufficient.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test mesh/test/chain-boundary-contracts.test.mjs`

Expected: FAIL because the module/schema do not exist.

- [ ] **Step 3: Add one strict JSON Schema contract**

Use JSON Schema draft 2020-12 with `$id: "urn:axiom:contract:chain-boundary:v1"`, `additionalProperties: false` on every object definition, bounded strings/arrays, lowercase SHA-256 patterns, and `$defs` for the eight object types.

Required finality models:

```json
["probabilistic-depth", "finalized-checkpoint", "validity-proof-settlement", "sequencer-plus-l1", "bft-threshold", "other"]
```

Required verification states:

```json
["unverified", "provider-reported", "independently-verified", "conflicted", "unsupported"]
```

Required settlement states:

```json
["observed", "verified", "final", "disputed", "reverted", "failed"]
```

Bridge route descriptions must require `custody_model`, `trust_model`, `mechanism`, source/destination chains and assets, provider identity/version, finality requirements, evidence timestamp, local risk classification, and future required execution capability. The contract describes routes only; it does not execute them.

- [ ] **Step 4: Implement minimal runtime validators**

Follow the repository's existing strict-validator style: plain objects only, required-field checks, unknown-field rejection, bounded strings, enum checks, safe integers, SHA-256 checks, duplicate-array rejection, and explicit nested validation. Do not introduce a schema-validator dependency.

`validateChainBoundarySchema(schema)` must verify the schema ID/version, strict objects, and the required enums above. Each object validator returns `true` on success and throws `ValidationError` on failure.

- [ ] **Step 5: Run focused tests**

Run: `node --test mesh/test/chain-boundary-contracts.test.mjs`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add docs/architecture/contracts/chain-boundary.v1.schema.json mesh/src/lib/chain-boundary-contracts.mjs mesh/test/chain-boundary-contracts.test.mjs
git commit -m "feat: add chain-neutral evidence contracts"
```

---

### Task 3: Add non-authorizing network profiles

**Files:**
- Create: `mesh/config/chain-network-profiles.v0.json`
- Create: `mesh/src/lib/chain-network-profiles.mjs`
- Create: `mesh/test/chain-network-profiles.test.mjs`

**Interfaces:**
- Consumes: `validateChainIdentity` from Task 2.
- Produces:
  - `CHAIN_NETWORK_PROFILE_SCHEMA = 'axiom-chain-network-profile.v0'`
  - `validateChainNetworkProfile(profile)`
  - `validateChainNetworkProfileCatalog(catalog)`
  - deterministic seed profiles `evm:ethereum-mainnet`, `evm:pulsechain-mainnet`, `starknet:mainnet`.

- [ ] **Step 1: Write failing profile tests**

Tests must assert:

```js
assert.deepEqual(
  catalog.profiles.map((profile) => profile.profile_id),
  ['evm:ethereum-mainnet', 'evm:pulsechain-mainnet', 'starknet:mainnet']
);
```

and for every profile:

```js
assert.equal(profile.authority_boundary.profile_grants_authority, false);
assert.equal(profile.authority_boundary.live_network_enabled, false);
assert.equal(profile.authority_boundary.write_enabled, false);
assert.deepEqual(profile.rpc.endpoints, []);
assert.equal(profile.rpc.credentials_required, false);
```

Assert the EVM profiles use `namespace: 'eip155'` with network IDs `1` and `369`, while Starknet uses `adapter_family: 'starknet'` and `namespace: 'starknet'`. Profile display metadata is descriptive only.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test mesh/test/chain-network-profiles.test.mjs`

Expected: FAIL because profiles/validator do not exist.

- [ ] **Step 3: Implement strict profile validation**

Require exact fields:

```js
[
  'schema',
  'profile_id',
  'profile_version',
  'chain',
  'finality_policy',
  'rpc',
  'authority_boundary',
  'safety_notes'
]
```

Require `rpc.endpoints` to be an array but, for v0 seed profiles, require it to be empty. Reject any profile that sets `live_network_enabled` or `write_enabled` true.

- [ ] **Step 4: Add the deterministic seed catalog**

The catalog must contain no URLs, credentials, bridge endorsements, or write methods. It may name native display assets (`ETH`, `PLS`, `STRK`) as non-authoritative UI metadata only.

- [ ] **Step 5: Run focused tests**

Run: `node --test mesh/test/chain-network-profiles.test.mjs`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add mesh/config/chain-network-profiles.v0.json mesh/src/lib/chain-network-profiles.mjs mesh/test/chain-network-profiles.test.mjs
git commit -m "feat: add offline chain network profiles"
```

---

### Task 4: Specify read-only adapter-family manifests

**Files:**
- Create: `docs/architecture/contracts/chain-read-adapter.v1.schema.json`
- Create: `mesh/config/chain-read-adapters.v0.json`
- Create: `mesh/src/lib/chain-read-adapter-contracts.mjs`
- Create: `mesh/test/chain-read-adapter-contracts.test.mjs`

**Interfaces:**
- Consumes: chain-profile IDs from Task 3.
- Produces:
  - `CHAIN_READ_ADAPTER_SCHEMA = 'axiom-chain-read-adapter.v1'`
  - `validateChainReadAdapterManifest(manifest)`
  - catalog manifests for `evm-read-v0` and `starknet-read-v0`.

- [ ] **Step 1: Write failing tests for the adapter safety boundary**

Require the EVM manifest to declare only these operation names:

```js
[
  'describeNetwork',
  'getHead',
  'getBlockReference',
  'getTransaction',
  'getReceiptOrOutcome',
  'getContractOrAccountState',
  'getLogsOrEvents',
  'verifyObservation',
  'classifyFinality'
]
```

Require the Starknet manifest to expose the same chain-neutral operation names while retaining family-specific method metadata separately.

For every manifest, assert:

```js
assert.equal(manifest.network_access.enabled, false);
assert.equal(manifest.write_surface.enabled, false);
assert.equal(manifest.signing_surface.enabled, false);
assert.equal(manifest.bridge_execution.enabled, false);
assert.equal(manifest.installation_grants_authority, false);
```

Also assert that manifest validation rejects operation names containing `sign`, `send`, `broadcast`, `write`, `execute`, or `bridge` outside the explicit disabled metadata sections.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test mesh/test/chain-read-adapter-contracts.test.mjs`

Expected: FAIL because the adapter contract does not exist.

- [ ] **Step 3: Add strict adapter-manifest schema and validator**

The schema must require adapter family/version, supported profile IDs, normalized operations, family RPC method metadata, network-access declaration, installation-authority declaration, and disabled write/signing/bridge surfaces.

No function in this task may open a socket, call `fetch`, read an environment credential, or construct a signed transaction.

- [ ] **Step 4: Add EVM and Starknet manifests**

The manifests may list family RPC method names as descriptive compatibility metadata only. They do not contain endpoints and do not perform calls.

- [ ] **Step 5: Run focused tests**

Run: `node --test mesh/test/chain-read-adapter-contracts.test.mjs`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add docs/architecture/contracts/chain-read-adapter.v1.schema.json mesh/config/chain-read-adapters.v0.json mesh/src/lib/chain-read-adapter-contracts.mjs mesh/test/chain-read-adapter-contracts.test.mjs
git commit -m "feat: specify offline read-only chain adapters"
```

---

### Task 5: Add one deterministic checker and documentation surface

**Files:**
- Create: `mesh/src/check-chain-boundary.mjs`
- Create: `mesh/test/chain-boundary-check.test.mjs`
- Modify: `mesh/package.json`
- Modify: `package.json`
- Modify: `docs/ROADMAP.md`

**Interfaces:**
- Consumes: all validators/configs from Tasks 1-4.
- Produces: `npm run chain-boundary:check` and a roadmap statement of the new non-authorizing boundary.

- [ ] **Step 1: Write the failing checker test**

Test that importing/running the checker over repository defaults succeeds and produces a deterministic summary equivalent to:

```js
{
  schema: 'axiom-chain-boundary-check.v0',
  profiles: 3,
  adapter_families: 2,
  observation_status: 'specified',
  verification_status: 'specified',
  live_network_enabled: false,
  write_enabled: false,
  bridge_execution_enabled: false
}
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test mesh/test/chain-boundary-check.test.mjs`

Expected: FAIL because the checker does not exist.

- [ ] **Step 3: Implement the checker**

The checker must:

1. validate the chain-boundary JSON Schema;
2. validate all network profiles;
3. validate all read-adapter manifests;
4. inspect capability registry entries and require `chain.observe`/`chain.verify = specified`;
5. require `economics.token-bridge-liquidity = disabled`;
6. fail if any seed profile enables live network/write access;
7. fail if any adapter enables network/write/signing/bridge execution;
8. print the deterministic JSON summary when run as a CLI.

- [ ] **Step 4: Add scripts**

In `mesh/package.json` add:

```json
"chain-boundary:check": "node src/check-chain-boundary.mjs"
```

In root `package.json` add:

```json
"chain-boundary:check": "npm --prefix mesh run chain-boundary:check"
```

- [ ] **Step 5: Update roadmap wording**

Add a concise roadmap entry stating that the first blockchain boundary is chain-neutral, read-only/offline, non-authorizing, and has profiles for Ethereum/PulseChain (EVM family) plus Starknet (separate family), while external settlement and bridge execution remain disabled.

- [ ] **Step 6: Run focused and full verification**

Run:

```bash
node --test mesh/test/chain-capability-boundary.test.mjs
node --test mesh/test/chain-boundary-contracts.test.mjs
node --test mesh/test/chain-network-profiles.test.mjs
node --test mesh/test/chain-read-adapter-contracts.test.mjs
node --test mesh/test/chain-boundary-check.test.mjs
npm run chain-boundary:check
npm test
npm run check
```

Expected: all commands PASS with no live network access required.

- [ ] **Step 7: Commit**

```bash
git add mesh/src/check-chain-boundary.mjs mesh/test/chain-boundary-check.test.mjs mesh/package.json package.json docs/ROADMAP.md
git commit -m "feat: verify chain-neutral blockchain boundary"
```

---

## Self-Review Result

- Spec coverage: the first-slice requirements are covered: chain neutrality, evidence-vs-authority separation, local-accounting separation, EVM/Starknet family separation, strict profile identity, finality/observation/settlement/anchor/bridge-route descriptions, and no write/network execution.
- Explicitly deferred by the approved spec: live RPC adapters, independent multi-provider agreement, transaction preparation/simulation, signing/broadcast, settlement execution, bridge quoting/execution, routing intelligence, Bitcoin/UTXO implementation, and ZK verifier integration.
- Placeholder scan: no implementation step depends on unspecified `TODO`/`TBD` behavior.
- Type/name consistency: capability IDs, schema IDs, profile IDs, and validator names are consistent across tasks.
