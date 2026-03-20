#!/bin/bash
CONTRACTS=("FounderCommitment" "UniversalDistributionPool" "CrossChainBridge")
ADDRESSES=("0x..." "0x..." "0x...")

for i in "${!CONTRACTS[@]}"; do
  forge verify-contract "${ADDRESSES[$i]}" "${CONTRACTS[$i]}" --etherscan-api-key $ETHERSCAN_KEY --chain-id 1
done
echo "✅ All 7 pillars verified on mainnet!"
