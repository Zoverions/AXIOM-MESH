#!/bin/bash
echo "🚀 AXIOM-MESH Token Launch + Liquidity Bootstrap"

# 1. Deploy AXM token (ERC-20 with 1B supply)
forge create contracts/AXMToken.sol:AXMToken --rpc-url $RPC_URL --private-key $DEPLOYER_KEY --constructor-args 1000000000000000000000000000

# 2. Transfer tokens to managers
cast send $AXM_TOKEN "transfer(address,uint256)" $NETWORK_LIQUIDITY_MANAGER 500000000000000000000000 --rpc-url $RPC_URL --private-key $DEPLOYER_KEY
cast send $AXM_TOKEN "transfer(address,uint256)" $AUTOMATED_V3_MANAGER 500000000000000000000000 --rpc-url $RPC_URL --private-key $DEPLOYER_KEY

# 3. Initial liquidity via NetworkLiquidityManager
cast send $NETWORK_LIQUIDITY_MANAGER "bootstrapNetworkLiquidity(uint256,uint256)" 500000000000000000000000 1 --rpc-url $RPC_URL --private-key $DEPLOYER_KEY

# 4. Bootstrap Uniswap V3 position
cast send $AUTOMATED_V3_MANAGER "managePosition(uint256,uint128)" 1 500000000000000000000000 --rpc-url $RPC_URL --private-key $DEPLOYER_KEY

echo "✅ AXM Token live + 500M initial liquidity bootstrapped!"
