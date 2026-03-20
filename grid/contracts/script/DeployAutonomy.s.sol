// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../contracts/FounderCommitment.sol";
import "../contracts/DeploymentFactory.sol";

contract DeployAutonomy is Script {
    function run() external {
        vm.startBroadcast();

        bytes32 founderHash = keccak256(abi.encodePacked(vm.envAddress("FOUNDER_ADDRESS"))); // set in .env

        FounderCommitment commitment = new FounderCommitment(founderHash);
        // Transfer ownership to Timelock (already in your existing setup or add here)

        DeploymentFactory factory = new DeploymentFactory(
            address(commitment),
            vm.envAddress("DIALECTIC_ARBITRATION"),
            vm.envAddress("COMPUTE_BOND")
        );

        vm.stopBroadcast();
    }
}
