# CrossChainBridge Finality Runbook

## Overview
To prevent cross-chain bridging griefing and guarantee safe finality across Pulse/ETH/Base/Arbitrum claim-redemption paths, a strict **1-hour fail-closed finality invariant** has been implemented.

## Mechanism
When a message is received via `_lzReceive`, the payload is decoded and the claim details (`recipient`, `amount`, `zkProof`) are stored into a `pendingClaims` mapping using the `_guid` as the key and `block.timestamp` as the timestamp.
A separate `claimRedemption(bytes32 _guid)` function is then required to execute the distribution, but it strictly enforces `require(block.timestamp >= claim.timestamp + 1 hours, "Finality delay not met");`.

## Manual Intervention
If finality is violated or the claim becomes invalid, the platform owner or governance can intercept the claim before the 1-hour delay expires by deleting it from `pendingClaims` or pausing the contract.
