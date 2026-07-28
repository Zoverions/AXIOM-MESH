#!/bin/bash
# Multi-chain deployment orchestrator script
# M6.5 Extend deploy pipeline for simultaneous Ethereum/Base/Arbitrum deployments

if [ -z "$PRIVATE_KEY" ]; then
    echo "Error: PRIVATE_KEY environment variable is not set."
    echo "Please provide a funded private key to deploy to multiple networks."
else
    echo "Starting simultaneous deployment to Ethereum, Base, and Arbitrum..."

    FAIL=0

    # Run deployments in parallel
    npx hardhat run scripts/deploy-multichain.cjs --network ethereum &
    PID_ETH=$!

    npx hardhat run scripts/deploy-multichain.cjs --network base &
    PID_BASE=$!

    npx hardhat run scripts/deploy-multichain.cjs --network arbitrumOne &
    PID_ARB=$!

    # Wait for all deployments to finish and capture exit codes
    wait $PID_ETH || FAIL=1
    wait $PID_BASE || FAIL=1
    wait $PID_ARB || FAIL=1

    if [ $FAIL -eq 1 ]; then
        echo "One or more deployments failed."
        # Cannot exit because it would break the bash session if sourced. We return instead.
        return 1 2>/dev/null || false
    else
        echo "All multi-chain deployments completed successfully!"
    fi
fi
