# Chain-Neutral Blockchain Boundary and External Settlement Adapters

**Status:** design specification; no capability promotion

**Date:** 2026-08-27

**Target:** AXIOM-MESH `main` at `4790fbdb51bf0e7e0af1d369e24932050ba1f724`

## Purpose

AXIOM-MESH already has local balanced double-entry accounting and explicitly keeps external settlement, tokens, bridges, liquidity, and treasury mechanics outside the implemented kernel boundary. The next step is not to select a blockchain substrate. It is to define a chain-neutral external boundary so AXIOM can observe, verify, and later use multiple public networks without making any of them authoritative over AXIOM identity, governance, accounting truth, or execution authority.

This design treats Starknet as a source of architectural lessons, not as a dependency. It also anticipates PulseChain, Ethereum, Bitcoin, and additional EVM and non-EVM networks through replaceable adapters.

The constitutional direction is:

> **AXIOM is above the chains, not on a chain.**

A blockchain may provide evidence, settlement, anchoring, contract execution, or asset transport. It may not become the root of AXIOM authority unless a future, separately approved domain explicitly chooses that dependency for itself.

## Existing baseline

The current capability registry establishes the relevant safety boundary:

- `economics.accounting` is implemented as local owner- and unit-bound accounting using transactional balanced double-entry journals and safe integer amounts;
- external settlement remains disabled;
- `economics.token-bridge-liquidity` is disabled;
- `zk.proof-verifiers` is adapter-required and accepts proofs only through named circuits, verification keys, public-input schemas, and verifier adapters;
- business and financial workflows already anticipate audited settlement adapters rather than kernel-native payment rails;
- provider and channel integrations use separate least-privilege adapters rather than expanding the trusted kernel.

This design preserves those boundaries.

## Non-goals

This specification does **not**:

- make Starknet, PulseChain, Ethereum, Bitcoin, or any other chain a required AXIOM dependency;
- create an AXIOM token;
- enable token issuance, treasury, liquidity provision, staking, yield, mining, market making, or autonomous trading;
- enable transaction signing or broadcasting in the first implementation slice;
- enable bridge execution in the first implementation slice;
- create custodial wallets;
- treat token ownership as governance authority;
- equate blockchain finality with AXIOM governance finality;
- replace AXIOM local accounting with on-chain balances;
- accept external contract state as a local grant, approval, sponsor, role, or policy decision merely because it is confirmed on-chain;
- claim all EVM networks or bridges have equivalent security assumptions.

## Constitutional invariants

### 1. Chain neutrality

No supported chain is privileged in the core schema or authority model. Chain-specific behavior is supplied by an adapter family and a network profile.

A network may be unsupported, unavailable, reorganizing, censored, halted, expensive, or compromised without invalidating AXIOM local state.

### 2. External evidence is non-authorizing by default

Observed blockchain data may be evidence or input data. It does not itself mint AXIOM authority.

A transaction, token balance, NFT, contract event, bridge message, validator vote, governance proposal, signature, proof, or smart-contract role may be considered by a domain policy, but it must be independently evaluated through the normal AXIOM authority path before it can cause a local consequential effect.

### 3. Accounting truth is separate from settlement mechanism

AXIOM local accounting records obligations and economic state according to the local or Circle agreement that created them.

A settlement adapter may discharge or partially discharge an obligation by linking that obligation to verified external evidence. The external rail does not define whether the obligation existed in the first place.

Example:

`Alice owes Circle X 50 CAD` remains an AXIOM accounting fact whether settlement later occurs by bank transfer, cash, BTC, ETH, PLS, STRK, stablecoin, or another mechanism.

### 4. Economic power does not automatically convey sovereignty

Ownership of a token, stake, validator position, liquidity position, or bridged asset does not automatically create governance or execution authority over another AXIOM participant.

A future Circle or domain may voluntarily use economic stake as one input into a governance process, but that policy must be explicit, local, reviewable, and bounded by non-waivable protections.

### 5. Consequence-aware execution

Observation and verification are lower-consequence capabilities than signing, broadcasting, contract writes, settlement, or bridging.

The authority model must therefore decompose these operations rather than exposing one broad `blockchain.access` capability.

### 6. Trust assumptions are first-class evidence

A bridge or settlement route is not characterized only by cost and latency. AXIOM must be able to represent the route's custody model, signer/validator/oracle assumptions, contract dependencies, finality requirements, wrapped-asset semantics, proof system where applicable, and operational dependencies.

A routing component may optimize only within policy-approved trust ceilings. Cheapest route must never silently outrank a stronger safety policy.

## Architectural approaches considered

### Approach A — One adapter per chain

Implement `EthereumAdapter`, `PulseChainAdapter`, `StarknetAdapter`, `BitcoinAdapter`, and so on independently.

**Advantages:** simple mental model at small scale; chain-specific behavior is explicit.

**Problems:** duplicates common logic, encourages drift, and makes EVM-compatible networks unnecessarily expensive to add and test.

### Approach B — EVM-first blockchain subsystem

Treat EVM semantics as the primary abstraction and bolt non-EVM chains onto it as exceptions.

**Advantages:** fast coverage of Ethereum-compatible ecosystems such as Ethereum, PulseChain, Base, Arbitrum, Polygon, and others.

**Problems:** silently bakes EVM assumptions into supposedly generic interfaces and makes Starknet, Bitcoin, UTXO systems, account-abstraction variants, and future proof systems awkward.

### Approach C — Chain-neutral core + adapter families + network profiles

Define a small chain-neutral evidence and capability model. Implement family adapters for common execution models, beginning with an EVM family and a separate Starknet family, while allowing Bitcoin/UTXO and future families to be added without changing the core contract.

**Recommendation:** Approach C.

It reuses ecosystem compatibility where real compatibility exists while preserving a genuinely chain-neutral core.

## High-level architecture

```text
                         AXIOM-MESH
                             |
                  External Network Boundary
                             |
          +------------------+------------------+
          |                  |                  |
       Observe            Verify            Settlement
          |                  |                  |
          +-------------+----+------------------+
                        |
                Chain-Neutral Contract
                        |
          +-------------+-------------+
          |             |             |
      EVM Family     Starknet      UTXO/Bitcoin
          |           Family          Family
     +----+----+          |              |
     |    |    |          |              |
 Ethereum PLS Base     Starknet        Bitcoin
  profile profile ...   profile        profile
                        |
                Optional providers
                        |
             bridge / anchor / proof
```

The first implementation slice remains read-only. It introduces normalized descriptions and verification surfaces without wallet custody, signing, broadcasting, settlement execution, or bridging.

## Core concepts

### Chain identity

A chain identity is a typed network identifier, not a marketing name.

Minimum fields:

- adapter family;
- network namespace;
- network identifier;
- human-readable name;
- native asset metadata where needed for display;
- finality model classification;
- profile version;
- profile digest.

For EVM networks, the network identifier may include the EVM chain ID but must not assume chain ID alone is sufficient to authenticate a remote RPC endpoint.

### Chain observation

A normalized observation records what an adapter claims to have observed from a configured network endpoint.

Minimum fields:

- chain identity;
- observation type;
- block/reference height;
- block/hash or equivalent state anchor;
- transaction/event/object reference;
- observed payload digest;
- endpoint/provider identity;
- observation timestamp;
- finality status as reported by the adapter;
- verification status;
- adapter version/digest.

Raw provider payloads remain untrusted until the relevant verification procedure succeeds.

### Transaction reference

A transaction reference identifies an external transaction without implying that the transaction is valid, finalized, relevant, or authorized.

It must include enough chain identity to prevent cross-chain ambiguity.

### Asset identity

Asset identity must be chain-qualified.

`USDC` is not a sufficient identifier. A normalized asset identity must distinguish native assets, token contracts, bridged representations, wrapped assets, and other contract-bound forms.

At minimum:

- chain identity;
- asset kind;
- canonical local identifier, such as contract address where applicable;
- decimals where meaningful;
- optional symbol/name for display only;
- representation lineage where known;
- profile/provider that supplied descriptive metadata.

Ticker symbols are never authoritative identifiers.

### Finality evidence

A finality record expresses what confirmation/finality condition has been established for an external observation.

The core schema must allow different families to represent materially different models, including:

- probabilistic depth/confirmations;
- finalized checkpoints;
- validity-proof-backed settlement;
- sequencer plus L1 settlement conditions;
- BFT threshold finality;
- domain-specific equivalent states.

The core must not force all networks into a single integer confirmation count.

### Settlement evidence

A settlement evidence object links an AXIOM accounting obligation to externally verified evidence without rewriting the obligation itself.

Minimum fields:

- local obligation/accounting reference;
- chain identity;
- transaction reference;
- asset identity;
- settled amount and unit;
- recipient/payee binding;
- finality evidence reference;
- adapter verification evidence;
- timestamp;
- status: observed, verified, final, disputed, reverted, or failed;
- optional partial-settlement remainder.

The first read-only implementation may define this schema without exposing a capability that can create settlement evidence from arbitrary user input. A later settlement verifier may create it only from independently verified chain observations.

### Anchor evidence

An anchor object binds a local digest to an external transaction or state commitment.

Anchoring is optional and does not make the external chain the canonical storage location for the underlying AXIOM object.

### Bridge route description

A bridge route description is evidence about a possible cross-chain path. It is not authorization to execute that path.

Minimum fields:

- source chain;
- destination chain;
- source and destination asset identities;
- provider/bridge identifier and version;
- route mechanism classification;
- custody model;
- trust model;
- external signer/validator/oracle assumptions;
- lock/mint, burn/release, liquidity, intent/solver, native messaging, or proof-based semantics;
- contract dependencies;
- wrapped-asset/representation changes;
- estimated fee and fee asset;
- estimated latency;
- source and destination finality requirements;
- known operational dependencies;
- provider evidence timestamp;
- local risk classification;
- required execution capability for a future executor.

The route schema should permit unknown/undetermined fields, but execution policy must be able to reject unknown trust assumptions for consequential transfers.

## Adapter boundaries

### Generic read-only adapter contract

The first promoted interface should expose only deterministic read/verify operations such as:

- `describeNetwork()`;
- `getHead()`;
- `getBlockReference()`;
- `getTransaction()`;
- `getReceiptOrOutcome()`;
- `getContractOrAccountState()` where the family supports it;
- `getLogsOrEvents()` where applicable;
- `verifyObservation()`;
- `classifyFinality()`.

The interface should return normalized objects plus bounded family-specific evidence, not raw provider objects as authoritative state.

### EVM family adapter

The EVM family handles common Ethereum JSON-RPC semantics and typed normalization while delegating network-specific assumptions to profiles.

Initial profiles may include:

- Ethereum;
- PulseChain;
- a test fixture network used only by the test suite.

Future profiles can add Base, Arbitrum, Polygon, Optimism, or others without introducing new core types unless a real semantic mismatch is discovered.

The profile owns at least:

- EVM chain ID;
- expected genesis or other network fingerprint where available;
- RPC endpoint configuration rules;
- native asset display metadata;
- finality policy/profile;
- known system contracts only when explicitly needed;
- adapter-specific safety notes.

A configured RPC endpoint is an external provider and must not be trusted merely because it returns the expected chain ID.

### Starknet family adapter

Starknet is a separate family to prove that the chain-neutral contract is not secretly EVM-specific.

Its family layer may normalize:

- Starknet blocks and transaction hashes;
- account/contract state;
- events;
- transaction receipts/status;
- sequencer and L1-settlement/finality distinctions;
- Cairo/Starknet-specific identifiers needed for verification.

The core contract does not import Starknet-specific authority semantics.

### Future Bitcoin/UTXO family

Bitcoin support should be a separate family rather than an EVM emulation.

The first design reserves room for:

- UTXO references;
- block-depth/finality evidence;
- script/address representations;
- proof-of-inclusion evidence;
- external signing adapters later.

No Bitcoin implementation is required by the first slice.

## Capability decomposition

The future capability namespace should be narrow and consequence-aware.

Proposed capability identifiers:

- `chain.observe`;
- `chain.verify`;
- `chain.simulate`;
- `chain.wallet.read`;
- `chain.transaction.prepare`;
- `chain.transaction.sign`;
- `chain.transaction.broadcast`;
- `chain.contract.read`;
- `chain.contract.write`;
- `chain.anchor.create`;
- `chain.settlement.verify`;
- `chain.settlement.execute`;
- `chain.bridge.quote`;
- `chain.bridge.execute`.

The first implementation slice must not promote any write capability. Phase 0 adds only `chain.observe` and `chain.verify` to the capability registry with status `specified`, while `economics.token-bridge-liquidity` remains `disabled`. Phase 1 may move `chain.observe` and `chain.verify` to `adapter_required` only after the generic and family adapter contracts plus deterministic tests exist. Neither status means an operational external effect is available.

All remaining proposed write, settlement, anchoring, wallet, simulation, and bridge capabilities remain design vocabulary only until separately added by a later approved change.

A future signer must require an exact transaction digest and exact network binding. A signature over one transaction must not be reusable as approval for a materially changed transaction.

A future bridge executor must require exact source chain, destination chain, asset, amount, recipient, bridge provider/route, maximum fee, and trust/risk ceiling bindings.

## Network-profile authentication and provider trust

Chain ID alone is insufficient to trust an RPC provider.

A network profile should support multiple independent endpoint providers and permit local policy to require stronger verification for consequential use.

Depending on family and use case, verification may include:

- network fingerprint/genesis checks;
- block-header verification;
- Merkle/storage proofs;
- receipt/log inclusion proofs;
- L1 settlement references;
- independent provider agreement;
- cryptographic proof verification;
- locally operated full node;
- pinned provider identities or transport trust where cryptographic state verification is unavailable.

The adapter must expose what was verified rather than collapsing all results into a boolean `trusted` field.

## Bridge-provider model

AXIOM does not need to become a bridge operator to support bridge use.

Bridge providers are optional external providers that can be described, quoted, verified, and later executed through separate adapters.

Examples may include native bridges such as StarkGate, PulseChain/Ethereum bridge providers, generalized message bridges, liquidity networks, or future proof-based systems. Their inclusion in a profile is not an endorsement.

Each provider must declare a machine-readable trust profile. The local policy engine can then permit or deny routes based on trust characteristics independent of price.

A bridge provider response may be used to populate a quote or route description but cannot create a grant.

## Relationship to Circles and governance

A Circle may choose a settlement method, treasury policy, asset whitelist, bridge risk ceiling, or proof/anchor policy.

Those collective decisions remain governance evidence. They do not directly mint wallet/signing authority on member nodes.

Each member or Circle-owned execution principal must still evaluate the requested external effect through its own applicable AXIOM authority chain.

Economic stake on an external network does not automatically determine Circle voting power unless the Circle charter explicitly opts into such a rule.

## Relationship to agent/provider markets

The external settlement boundary supports, but is not required for, a future provider market.

A provider can first commit resources such as compute, storage, relay capacity, model inference, verification work, or human services using local commitments and receipts. Settlement can remain out-of-band.

Later, a verified settlement receipt may discharge the accounting obligation created by that service agreement.

This preserves the sequence:

`commitment -> measurable service -> receipt -> accounting obligation -> optional external settlement`

rather than:

`token ownership -> authority -> service`.

## Security and failure handling

### Reorganizations and reverted observations

External observations are not immutable merely because they were once seen.

Adapters must be able to represent reorg/reversion and move a settlement or anchor evidence record into a disputed/reverted state without rewriting historical evidence.

Finality policy must be explicit per family/profile and use case.

### RPC disagreement

When a later multi-provider policy requires two or more providers and they disagree, the adapter must return an uncertain/conflicted result rather than selecting the preferred answer silently.

### Unsupported semantics

If a network or bridge exposes semantics that cannot be represented safely by the current normalized schema, the adapter must fail closed and require a schema/profile revision.

### Asset ambiguity

Symbols and names are display metadata only. Contract/address/network identity controls asset matching.

### Decimal and amount safety

On-chain integer amounts remain integers. Conversion to human-readable decimals is presentation logic. Financially consequential comparisons must use exact integer/base-unit representations or existing AXIOM safe-integer/big-integer rules appropriate to the adapter implementation.

### External secret isolation

Private keys, seed phrases, hardware-wallet secrets, API secrets, and signing material are outside the read-only adapter slice.

A later signer must be a separately auditable adapter with explicit secret-handling and approval boundaries.

### Bridge compromise

A bridge compromise must not corrupt AXIOM local accounting or historical receipts. It may invalidate or dispute the external settlement evidence associated with the affected route.

## First implementation slice

The first code increment after this design is approved should remain non-executing and should be small enough to review rigorously.

### Phase 0 — schema and registry foundation

1. Add chain-neutral JSON schemas/types for:
   - chain identity;
   - transaction reference;
   - asset identity;
   - finality evidence;
   - normalized observation;
   - settlement evidence;
   - bridge route description.
2. Add validators that fail closed on unknown schema versions, malformed chain identifiers, ambiguous asset identity, invalid amount forms, and unsupported finality classes.
3. Add `chain.observe` and `chain.verify` to `mesh/config/capabilities.json` with status `specified` and wording that explicitly states observation and verification are non-authorizing and non-executing.
4. Keep `economics.token-bridge-liquidity` disabled and make no write-capability registry additions.
5. Add documentation stating that these types carry evidence only and do not grant authority.

### Phase 1 — read-only adapter contracts

1. Add a generic read-only adapter interface.
2. Add an EVM family adapter interface plus Ethereum and PulseChain network profiles.
3. Add a Starknet family adapter interface plus a Starknet network profile.
4. Use deterministic mocked transports/fixtures for tests; do not add live-network dependency to the trusted test suite.
5. Prove equivalent normalized operations across EVM and Starknet fixtures where semantics genuinely overlap.
6. Prove family-specific finality data survives normalization without being flattened incorrectly.
7. If the contracts and tests satisfy the current evidence checker, move only `chain.observe` and `chain.verify` from `specified` to `adapter_required`; do not mark them `implemented` until an operational adapter path is separately reviewed and evidenced.

### Phase 2 — independent observation verification

1. Add optional multi-provider agreement logic for read paths.
2. Add family-specific cryptographic verification adapters where feasible.
3. Add explicit uncertain/conflicted outcomes for disagreement or unverifiable provider claims.
4. Add tests proving required-provider disagreement fails closed rather than silently selecting a result.
5. Keep transaction preparation/signing/broadcast disabled.

### Later phases — separately approved

Later work may add:

- transaction preparation and simulation;
- hardware/external signer adapters;
- exact-digest approval binding;
- broadcast verification;
- settlement verification;
- bridge quoting;
- bridge execution;
- routing optimization under local policy;
- ZK/STARK proof adapters;
- optional external anchoring.

Each later phase requires its own design/implementation review and must not be inferred from this specification.

## Phase 0/1 test requirements

Before Phase 0/1 can be considered complete, focused tests should prove at least:

1. chain identifiers from different families cannot collide;
2. EVM chain ID alone does not mark an endpoint trusted;
3. PulseChain and Ethereum are represented as profiles of the EVM family rather than unrelated core types;
4. Starknet normalization works without EVM-only fields becoming mandatory;
5. asset identity rejects symbol-only identification;
6. bridged and native representations can be distinguished;
7. integer amounts survive normalization exactly;
8. unsupported schema versions fail closed;
9. unsupported finality classes fail closed;
10. a verified chain observation cannot be consumed as a local grant or approval;
11. bridge route descriptions are non-authorizing data;
12. settlement evidence cannot mutate the originating accounting journal entry;
13. reorg/reversion can dispute external evidence without rewriting historical evidence;
14. no private-key/signing API exists in the first slice;
15. no live network is required for deterministic CI;
16. capability registry and evidence bindings remain internally consistent.

## Phase 2 test requirements

Before multi-provider verification can be promoted, focused tests should additionally prove:

1. required provider disagreement produces an uncertain/conflicted result;
2. one provider cannot silently override another provider required by policy;
3. agreement metadata preserves provider identities and the exact state anchors compared;
4. unverifiable provider claims remain evidence of an observation attempt, not verified chain truth.

## Promotion gates

A read-only chain adapter may be promoted from `specified` to `adapter_required` only when:

- deterministic tests cover its normalization and failure semantics;
- no signing or broadcasting path is reachable;
- network identity verification assumptions are explicit;
- provider trust assumptions are explicit;
- finality semantics are explicit;
- registry evidence points to exact runnable tests under the current capability-evidence checker;
- the current-build threat model includes external-chain/RPC/bridge data as untrusted input.

`adapter_required` still means AXIOM has no operational chain effect until a specific adapter is configured and separately promoted.

A write-capable chain adapter may not be promoted merely because the read adapter is complete.

A bridge executor may not be promoted merely because a quote/route description exists.

## Documentation impact

After implementation begins, the following current-build documents should be reconciled where their scopes are affected:

- `mesh/config/capabilities.json`;
- `docs/ROADMAP.md`;
- `docs/MASTER-TODO.md`;
- `docs/security/CURRENT-BUILD-THREAT-MODEL.md`;
- `docs/rebuild/LONG-HORIZON-CAPABILITY-MAP.md`;
- appropriate operations/provider documentation for any promoted read-only adapter.

No current-build document should imply live blockchain settlement, bridge execution, custody, or token authority until those capabilities are separately implemented and evidenced.

## Resolved design decisions

1. **Starknet is a lesson source and optional adapter target, not a substrate dependency.**
2. **PulseChain belongs in the EVM-family profile model rather than a bespoke core abstraction.**
3. **Starknet remains a separate adapter family to prevent EVM assumptions from contaminating the core.**
4. **Blockchain observation, settlement, anchoring, and bridging are separate concepts.**
5. **A bridge provider is external infrastructure; AXIOM need not operate the bridge.**
6. **Local accounting remains authoritative for obligations; external rails provide settlement evidence.**
7. **Token ownership does not automatically confer AXIOM authority or governance power.**
8. **The first implementation slice is read-only and deterministic, with no live-network or signing dependency.**
9. **Trust assumptions and finality semantics must remain visible rather than being flattened into one generic confidence flag.**
10. **Write capabilities require later independent approval and evidence gates.**

## Success criterion

The design is successful when AXIOM can add PulseChain, Ethereum, Starknet, Bitcoin, or a future network without changing the constitutional authority model, without migrating local accounting onto a blockchain, and without allowing an external network or bridge provider to become an implicit authority root.
