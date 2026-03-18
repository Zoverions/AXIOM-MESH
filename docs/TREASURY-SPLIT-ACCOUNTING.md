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
