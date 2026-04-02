# AXIOM-MESH Mainnet Deployment Cost Analysis

**Status:** Pre-Mainnet / Final Estimation (March 2026)

This document provides a high-level estimation of the token (gas + liquidity) and operational costs required to launch the AXIOM-MESH protocol across its target multichain architecture.

## 1) Deployment Strategy

AXIOM-MESH utilizes a **PulseChain-first** finality model, where the core logic, execution settlement, identity registries, and governance modules reside exclusively on PulseChain.

**Ethereum, Base, and Arbitrum** act as inbound ingress and liquidity hubs via the `CrossChainBridge`, LayerZero/CCIP messaging, and `ProveXVerifierWrapper`.

---

## 2) Base Chain (PulseChain) Costs

PulseChain hosts the heavy computation, including zkML verifiers, memory lattices, stigmergic state channels, and full governance structures.

### Estimated Contract Deployments (Core)
*   **Token & NFTs** (`AXM.sol`, `CitizenshipNFT.sol`, `DistributorNFT.sol`, `SacrificerNFT.sol`)
*   **Governance** (`ZoverionsDAO.sol`, `Futarchy.sol`, `GuildTemplate.sol`)
*   **Execution & Settlement** (`StigmergicStateChannel.sol`, `TaskRequestMarket.sol`, `ComputeBond.sol`)
*   **Finance & Distribution** (`UniversalDistributionPool.sol`, `AutomatedV3LiquidityManager.sol`, `RevenueModel.sol`, `StablecoinPayroll.sol`)
*   **Verification** (`CognitiveFrictionVerifier.sol`, `TruthAnchor.sol`, `MemoryLattice.sol`)
*   *(Approx. 40+ total contracts including proxies)*

### Estimated Gas Required (PulseChain)
*   **Total Deployment Gas:** ~80,000,000 - 120,000,000 gas units.
*   **Cost at 5,000 gwei (PulseChain average):** 400,000 - 600,000 PLS.
*   *Note: PulseChain gas is typically very cheap, so the actual fiat cost is negligible (under $50).*

### Initial Liquidity Seeding (PulseX V2/V3)
*   **Required PLS for AXM/PLS Pair:** Minimum recommended $50,000 - $100,000 equivalent in PLS to ensure stable price discovery and minimize initial slippage for `AutomatedV3LiquidityManager.sol` operations.
*   **Oracle Seeding:** ~$5,000 equivalent in stablecoins for cross-chain fee oracle buffers.

---

## 3) Satellite Chain Costs (Ethereum, Base, Arbitrum)

Satellite chains require a much smaller footprint, limited strictly to bridging, token wrappers, and lightweight verifiers.

### Estimated Contract Deployments (Per Satellite Chain)
*   `CrossChainBridge.sol` (LayerZero/Wormhole endpoint implementation)
*   `ShadowBridge.sol` (zkML message passing)
*   `ShadowAccount.sol` / `ShadowPaymaster.sol` (Account abstraction for agent execution)
*   Network Adapter (e.g., `EthereumAdapter.sol`, `BaseAdapter.sol`)

### Ethereum Mainnet Estimated Costs
*   **Total Deployment Gas:** ~15,000,000 gas units.
*   **Cost at 15 gwei:** ~0.225 ETH.
*   **Initial Liquidity (Uniswap V3):** Minimum $25,000 - $50,000 equivalent in ETH to facilitate bridge arbitrage and inbound token purchases.

### Base / Arbitrum Estimated Costs
*   **Total Deployment Gas:** ~20,000,000 gas units (L2 gas limits).
*   **Cost at 0.1 gwei (L2 avg):** < 0.01 ETH per chain.
*   **Initial Liquidity (Aerodrome / Camelot):** Minimum $10,000 - $20,000 equivalent in ETH/USDC per chain.

---

## 4) Total Capital Requirements Summary

| Chain | Purpose | Est. Gas Token Required | Est. Liquidity Capital (USD) |
| :--- | :--- | :--- | :--- |
| **PulseChain** | Core Protocol, Governance, Settlement | ~1,000,000 PLS | $50,000 - $100,000 |
| **Ethereum** | Bridge Ingress, Major Liquidity | ~0.3 ETH | $25,000 - $50,000 |
| **Base** | Low-cost L2 Agent Onboarding | ~0.02 ETH | $10,000 - $20,000 |
| **Arbitrum** | DeFi / Compute Liquidity | ~0.02 ETH | $10,000 - $20,000 |
| **Total Target** | | | **$95,000 - $190,000** |

*Note: These estimates cover initial launch capital. The network is designed to be self-sustaining via the `UniversalDistributionPool` and `NetworkSecurityFund` after the first 30 days of operation.*
