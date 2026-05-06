// grid/contracts/contracts/HermesAgentRegistry.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title HermesAgentRegistry
 * @dev Manages identities and capability tokens for Hermes agents within AXIOM-MESH.
 */
contract HermesAgentRegistry {
    struct Agent {
        address owner;
        bytes32 did;
        uint256 dailySpendLimit;
        mapping(bytes32 => bool) approvedSkills;
    }

    mapping(bytes32 => Agent) public agents;

    function requestCapability(bytes32 agentId, bytes32 actionHash) external returns (bytes32 token) {
        // Validate against policy, emit event for audit
        // Return short-lived capability token
        return keccak256(abi.encodePacked(agentId, actionHash, block.timestamp));
    }

    function proposeSkillUpgrade(bytes32 agentId, bytes32 skillHash) external {
        // Governance proposal logic
    }
}
