# PulseChain Redemption Runbook

## Overview
This runbook details the invariants and operational procedures for the PulseChain-only final redemption path of bridged assets in AXIOM-MESH.

## Invariants
1. **PulseChain Only Finality:** Claim redemptions (`claimRedemption`) can ONLY be executed on PulseChain Mainnet (Chain ID 369) or PulseChain Testnet (Chain ID 943). Redemptions on other chains (Ethereum, Base, Arbitrum) must revert.
2. **1-Hour Finality Window:** A strict 1-hour fail-closed finality delay applies to all claims after being received via `_lzReceive`.

## Handling Redemptions
- **Normal Operation:** Users must submit their `claimRedemption` transactions on PulseChain after the 1-hour finality delay has passed.
- **Cross-Chain Bridge Failure:** If an issue occurs with LayerZero or the origin chains, claims are preserved in the `pendingClaims` mapping on PulseChain.
- **Intercepting Claims:** In the event of a fraudulent bridge payload or exploit detection within the 1-hour window, the owner or an authorized guardian can invoke `interceptClaim(bytes32 _guid)` to delete the claim before it becomes redeemable.
