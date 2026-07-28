# State Management Architecture: 3-Layer Formalization

**AXIOM-MESH Core Architecture**
**Version:** 2026-03-27

This document formalizes the 3-layer state management architecture of the AXIOM-MESH ecosystem, designed to provide horizontal scaling, execution privacy, and cryptographically verified eventual consistency.

## Overview of the 3-Layer Architecture

To scale decentralized agent networks without exhausting on-chain compute or suffering from ledger bloat, AXIOM-MESH structures its state transitions into three distinct layers of finality and verification:

1. **Layer 1: Execution Off-Chain** (High-throughput, private compute)
2. **Layer 2: Settlement Optimistic Channels** (Medium-throughput, peer-to-peer consensus)
3. **Layer 3: Finality On-Chain** (Low-throughput, absolute source of truth)

---

## Layer 1: Execution Off-Chain

**Scope:** Hypervisor, Sandbox, Local Agent Memory
**Characteristics:** High-speed, high-throughput, private, stateless execution contexts.

### Architecture Details
- **Execution Sandboxes:** Ephemeral, isolated Docker/WASM environments orchestrated by the Hypervisor. Code and skill capsules are executed here based on cryptographically signed Capability Manifests.
- **Proof Generation (PoER & zkML):** Heavy computation (like AI inference or data transformation) occurs completely off-chain. Instead of executing on the Grid, these workloads generate zero-knowledge proofs (via ezkl, RISC Zero, Groth16) proving execution correctness.
- **Causal Proof-of-Reasoning (CPoR):** A deterministic, bounded-depth causal DAG of the reasoning process is built off-chain. The DAG captures inputs, intermediate states, and reasoning paths. Only the Merkle root of this DAG is passed to higher layers.
- **Ephemeral State:** All temporary states, variables, and sensitive execution context (PII, specialized domain data) remain strictly within Layer 1. Disclosure requires explicit cryptographic receipts (`X-UCP-Consent`).

---

## Layer 2: Settlement Optimistic Channels

**Scope:** Grid P2P Network, Stigmergic State Channels
**Characteristics:** Medium-speed, peer-to-peer gossip consensus, optimistic rollups, and fraud-proof challenge periods.

### Architecture Details
- **Stigmergic State Channels:** `StigmergicStateChannel.sol` is the primary interface between Layer 1 and Layer 2. Participating agents lock matching stakes (stake symmetry policy) and open a direct, off-chain communication channel for high-frequency interactions.
- **Optimistic Settlement Windows:** State updates between agents in a channel are assumed valid and settled optimally. If an agent detects malicious behavior, they can trigger a fraud-proof challenge during the challenge window.
- **Reputation-Weighted Challenges:** Challenge windows and required challenge stakes are dynamically weighted based on the lowest aggregate `SoulboundReputation` score between the two participating agents. High reputation actors get optimized windows, while low reputation actors require longer challenge periods.
- **Grid Consensus & Ledger:** The Go-based Grid nodes sync attestations, zero-knowledge proofs, and node capability profiles. The Grid forms a transient ledger (AICP transport) that temporarily holds state before it is anchored to Layer 3.

---

## Layer 3: Finality On-Chain

**Scope:** Smart Contracts (Ethereum, PulseChain, Base, Arbitrum)
**Characteristics:** Absolute finality, immutable, slow, expensive.

### Architecture Details
- **Anchoring State:** The final state of optimistic channels and Proof-of-Truth decisions are anchored to the blockchain. This serves as the ultimate source of truth for financial balances, governance proposals, and tokenomics.
- **TruthAnchor & WeightOracle:** Economic verification of agent behavior is enforced here. Challenged state channels that result in slashing or reward distributions are finalized on-chain.
- **Cross-Chain Finality:** For bridged assets, a strict 1-hour fail-closed finality delay (`CrossChainBridge.sol`) is enforced before redemptions are finalized, preventing cross-chain griefing attacks.
- **Immutable WORM Logs:** On-chain events emitted by the core smart contracts serve as a Write Once, Read Many (WORM) audit trail for critical state transitions and treasury movements.
- **Governance Transitions:** Core smart contract upgrades and treasury allocations are managed via time-locked DAO multi-sig mechanisms and hierarchical Governance Guild structures.

---

## Summary

This 3-layer model ensures that the AXIOM-MESH ecosystem can scale to handle millions of autonomous agent interactions per second (Layer 1), safely aggregate and route these interactions through a decentralized peer-to-peer mesh (Layer 2), and cryptographically guarantee economic and behavioral finality on the blockchain (Layer 3).
