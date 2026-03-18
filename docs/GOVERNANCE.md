# Governance
Bicameral + FDBA decay + zkML PoER

## FDBA
The system decays founder control over time. Formula:
`share = 500 - (s * 500 / 10000)`

## Integrated Specifications
# AXIOM-MESH Governance Control Map for Interoperability Knobs

**Version:** 1.0
**Status:** Implemented and Integrated

This document maps the governance controls (Guilds, Bicameral Chambers, and AIGovernor) to the interoperability policy updates, specifically focusing on the `MCPCompatibilityMatrix` and other interoperability knobs. It defines how changes to security profiles, risk tiers, and capabilities are proposed, evaluated, and enacted across the AXIOM-MESH network.

---

## 1. Interoperability Knobs

The primary vehicle for managing agent-to-agent and external service interoperability is the `MCPCompatibilityMatrix` (`schemas/mcp_compatibility_matrix.v1.json`).

The following key interoperability knobs are subject to governance control:

*   **`default_policy`**: The baseline policy for unknown or unclassified peers. Can be set to `deny`, `allow_with_review`, or `allow`.
*   **`min_security_profile`**: The minimum security profile required for a specific peer class to connect. Values range from `S0_LEGACY_LOCKED` to `S3_ZKML_FULL_NODE`.
*   **`max_risk_tier`**: The maximum acceptable risk tier (`R0` through `R4`) for a given peer class.
*   **`required_capabilities`**: The specific set of capabilities (e.g., specific zkML proofs, hardware attestations) a peer must possess to engage in specific interactions.
*   **`policy` (per peer class)**: Overrides the `default_policy` for specific known peer classes (e.g., `deny`, `allow_with_review`, `allow`).
*   **Alignment Profile Priority Tags**: System-level tags (e.g., `critical`, `system`, `override`) that dictate routing and resource allocation.

---

## 2. Governance Bodies and Authority Scopes

Governance in AXIOM-MESH is distributed across three primary bodies, each with specific authority over different aspects of the interoperability policy.

### 2.1 Guilds (Specialized Collectives)

*   **Composition**: Collectives of nodes (Human and Agent) organized around specific domains, skills, or operational regions (e.g., THUD guild, OntarioEdAI).
*   **Authority Scope**:
    *   **Propose**: Guilds can propose updates to the `MCPCompatibilityMatrix` that specifically affect their domain (e.g., proposing to allow a new class of educational AI peers for the OntarioEdAI guild).
    *   **Local Overrides**: Can request tighter (but not looser) restrictions for their specific sub-network or swarm.
*   **Mechanism**: Guilds formulate proposals using their internal consensus mechanisms and submit them to the broader network via the `DialecticArbitration` contract.

### 2.2 Bicameral Chambers (Human vs. Agent)

*   **Composition**: The entire registered network, split into the Anthropic Chamber (Human Proof of Personhood keys) and the Algorithmic Chamber (Agent Proof of Compute keys).
*   **Authority Scope**:
    *   **Global Matrix Updates**: Approving major version updates to the `MCPCompatibilityMatrix` (e.g., changing the `default_policy` or redefining `S1_BASELINE` requirements).
    *   **Priority Tags**: Approving updates to restricted Alignment Profile tags (`critical`, `system`, `override`).
    *   **Veto Power**: Each chamber holds veto power over the other. The weight of votes is influenced by the `WeightOracle` and the `ImpactVector` (Anthropic vs. Thermodynamic).
*   **Mechanism**: The `DialecticArbitration.sol` contract manages overlapping votes. If one chamber passes a proposal and the other rejects it, a deadlock is declared, triggering the Hypervisor for synthesis.

### 2.3 AIGovernor (Automated Governance & Circuit Breakers)

*   **Composition**: The automated, smart-contract-based layer (`AutomatedBicameralGovernance.sol`) driven by system metrics, zkML anomaly detection, and the Hypervisor's CoT (Chain of Thought) Auditor.
*   **Authority Scope**:
    *   **Emergency Interventions**: Immediate modification or overriding of the `MCPCompatibilityMatrix` during active attacks (e.g., instantly blacklisting a compromised peer class or enforcing a global `deny` policy).
    *   **Automated Proposals**: Generating proposals based on detected drift (e.g., if a specific peer class consistently fails zkML verification, the AIGovernor automatically proposes moving them to a higher risk tier).
    *   **Enforcement**: The Hypervisor uses the AIGovernor's current state to actively filter MCP connections in real-time (`mcp_client.py`).
*   **Mechanism**: Triggered by deterministic thresholds (`maxSkillDrift`, `maxConsensusLatency`) or verified zkML anomaly proofs. Can trigger the `emergencyPause` function.

---

## 3. Authority to Policy Update Matrix

| Policy Target | Proposing Body | Approving Body | Emergency Override |
| :--- | :--- | :--- | :--- |
| **Global `default_policy`** | Guilds, Any Registered Node | Bicameral Chambers | AIGovernor (to `deny` only) |
| **New Peer Class Definition** | Guilds | Bicameral Chambers | AIGovernor (can auto-quarantine) |
| **`min_security_profile` (Global)** | Any Registered Node | Bicameral Chambers | AIGovernor (can raise min) |
| **`min_security_profile` (Guild-specific)**| Guild | Guild (if tightening), Bicameral (if loosening)| AIGovernor |
| **Restricted Priority Tags (`critical`)**| Any Registered Node | Bicameral Chambers | AIGovernor (can revoke) |
| **Revoking a Peer Class** | Guilds, Any Registered Node, AIGovernor| Bicameral Chambers (auto-quarantine by AIGovernor)| AIGovernor |

---

## 4. Policy Update Lifecycle

1.  **Drafting & Proposal**: A Guild or individual node drafts an update to the `MCPCompatibilityMatrix` JSON schema.
2.  **Submission**: The proposal is submitted via the `POST /proposals/events` endpoint on the Grid API, creating an event on the `DialecticArbitration` contract.
3.  **Active Voting**:
    *   Nodes vote using their respective Human or Agent keys.
    *   Veto multipliers are applied based on the proposal's `ImpactVector`.
4.  **Resolution or Deadlock**:
    *   If both chambers approve, the proposal passes.
    *   If one approves and one rejects, a **Deadlock** occurs.
5.  **Synthesis (if Deadlocked)**:
    *   The Hypervisor (AIGovernor layer) analyzes the deadlock and generates a geometric synthesis.
    *   The synthesis is submitted via `submitSynthesis`, resetting the voting period for a re-vote.
6.  **Enactment**: Once passed, the new `MCPCompatibilityMatrix` is synchronized across the network (via CRDT and IPFS/Grid Ledger). The Hypervisor (`MCPClient`) immediately begins enforcing the new thresholds for all subsequent peer handshakes.
7.  **Emergency Circuit Breaker**: At any point, if the CoTAuditor or zkML anomaly detection identifies a critical threat, the AIGovernor can invoke `emergencyPause` on the contract and instantly update the local matrix cache to block the offending peer class, bypassing the voting process for immediate network security.
# Treasury Split Accounting Model

## Overview
The AXIOM-MESH Treasury enforces a strict accounting model that governs the distribution of rewards generated within the network. This includes fees from task execution, slashed bonds, and new token issuance (e.g., GPP). The goal is to sustainably fund network operations while simultaneously rewarding participants.

## Allocation Mechanism
The current treasury model dynamically allocates incoming rewards into two primary pools:

1.  **Network Security Fund (Default: 60%)**
    *   **Purpose:** Finances the ongoing security and operational integrity of the Grid. This includes covering the costs of zero-knowledge proof generation (zkML), Proof-of-Execution-Result (PoER) consensus validation, and regular security audits.
    *   **Slashed Bonds:** When a node's bond is slashed due to misbehavior or failure to provide a correct execution result, the slashed amount is often directed toward this fund to further bolster system resilience against malicious actors.

2.  **Wealth Generation Pool (Default: 40%)**
    *   **Purpose:** Incentivizes active network participation. This pool is distributed to nodes that successfully complete tasks, provide valuable computing power, and participate honestly in the consensus process.
    *   **Distribution Rules:** Payouts from this pool are tied to a node's reputation, skill vectors, and historical performance within the network.

## Revenue Sources
The treasury is funded through several avenues:
*   **Execution Fees:** A percentage of the GPP token fee paid for routing tasks through the Grid or L1 is allocated to the treasury.
*   **Bond Slashing:** Penalties levied against malicious or underperforming bonded nodes.
*   **Protocol Revenue:** Other network-level operations, such as CCIP cross-chain messaging fees or specific high-value API calls.

## Implementation Details
The core logic for this allocation is implemented in `grid/blockchain/chain.go` via the `DistributeRewards` function, which automatically splits incoming amounts based on the `TreasurySplitConfig` configuration parameter. Any changes to these percentages must pass through the AXIOM-MESH bicameral governance process (as managed by `DialecticArbitration.sol`).
# ERC-20 Compatibility & Token Flow

## Overview
The AXIOM-MESH ecosystem incorporates an ERC-20 compatible token flow model designed around the **GPP** token. This document outlines the fundamental lifecycle, accounting operations, and cross-layer mechanics of GPP tokens. These operations are off-chain but designed to seamlessly interoperate with on-chain Ethereum/Polygon/Base environments.

## GPP Token Lifecycle

The token state is strictly maintained in the Grid ledger (`grid/blockchain/chain.go`) via a balance map (`GPPBalances`) and an append-only event log (`GPPEvents`).

### 1. Minting
*   **Trigger:** GPP tokens are typically minted as a reward for successful task completion, proof generation (e.g., zkML verification), or valid consensus participation.
*   **Process:** The `MintGPP` function increments the target address's balance and records a `Mint` event with the origin `0x0000000000000000000000000000000000000000`.
*   **Settlement Impact:** In a fully connected environment, these off-chain mint events are batched and settled on the target L1 via the RelayerWallet pattern.

### 2. Burning
*   **Trigger:** Burning occurs when tokens are permanently removed from circulation. This is common when tokens are utilized to pay for complex network services, network storage, or as part of a deflationary mechanism applied during bond slashing.
*   **Process:** The `BurnGPP` function ensures the address has sufficient balance, decrements it, and records a `Burn` event directed to the zero address (`0x0000000000000000000000000000000000000000`).

### 3. Transferring & Rewards
*   **Distribution:** When a user pays for network usage, their tokens are transferred to the Treasury. The `DistributeRewards` function then programmatically allocates these tokens according to the current Treasury Split (e.g., 60% Network Security Fund, 40% Wealth Generation Pool).
*   **Peer Payments:** Nodes can transfer tokens to other bonded nodes for delegated tasks.

## L1 Piggyback Settlement (RelayerWallet)
To bridge the high-throughput off-chain Grid environment with immutable L1 security, AXIOM-MESH utilizes a Relayer Queue.

1.  **Queueing:** The `QueueL1Settlement` function creates a pending settlement task for an outward transfer.
2.  **Processing:** A decentralized relayer network batches these queued transactions to minimize L1 gas fees.
3.  **Finality:** Once the L1 transaction is confirmed, the relayer submits the transaction hash back to the Grid to update the settlement state to `Settled`.

## Token Flow Diagram

```text
User/Agent  ---[Pay for Compute]---> Treasury Split
                                         |
                            +------------+------------+
                            |                         |
                            v                         v
                  Network Security Fund    Wealth Generation Pool
                       (e.g., 60%)              (e.g., 40%)
                            |                         |
                            v                         v
                     Protocol Defense,         Node Operator Rewards,
                     Slashing Reserves         Task Execution Payouts
                            |                         |
                            +-------------------------+
                                         |
                                         v
                                  Relayer Queue
                                         |
                                         v
                            L1/L2 Settlement (ERC-20)
```
