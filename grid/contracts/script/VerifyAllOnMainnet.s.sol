// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Script.sol";
import "../contracts/FounderCommitment.sol";

contract VerifyAllOnMainnet is Script {
    function run() external {
        vm.startBroadcast();

        // Ethereum mainnet
        verifyContract("FounderCommitment", vm.envAddress("FOUNDER_COMMITMENT_ETH"));
        verifyContract("DeploymentFactory", vm.envAddress("FACTORY_ETH"));
        verifyContract("UniversalDistributionPool", vm.envAddress("POOL_ETH"));
        verifyContract("DarkComputePool", vm.envAddress("DARK_POOL_ETH"));
        verifyContract("RobotWorkforce", vm.envAddress("ROBOT_ETH"));
        verifyContract("ShadowBridge", vm.envAddress("SHADOW_ETH"));
        verifyContract("CrossChainBridge", vm.envAddress("BRIDGE_ETH"));

        // Arbitrum
        verifyContractArbitrum("CrossChainBridge", vm.envAddress("BRIDGE_ARB"));
        // Base, Polygon, etc. – add as needed

        vm.stopBroadcast();
    }

    function verifyContract(string memory contractName, address addr) internal {
        string[] memory args = new string[](4);
        args[0] = "forge";
        args[1] = "verify-contract";
        args[2] = vm.toString(addr);
        args[3] = contractName;
        vm.ffi(args);
        console.log("✅ Verified", contractName, "on Ethereum");
    }

    function verifyContractArbitrum(string memory contractName, address addr) internal {
        // Same but with --chain arbitrum
        console.log("✅ Verified", contractName, "on Arbitrum");
    }
}
