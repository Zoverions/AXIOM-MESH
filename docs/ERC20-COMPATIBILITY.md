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
