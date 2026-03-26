// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title FederatedSkillCapsule
 * @dev Verifiable contribution accounting for cross-agent learning rewards.
 */
contract FederatedSkillCapsule is Ownable {
    struct Contribution {
        address contributor;
        bytes32 memoryHash;
        uint256 timestamp;
        uint256 utilityDelta;
    }

    // Mapping from contribution hash to Contribution details
    mapping(bytes32 => Contribution) public contributions;

    // Mapping to track total points/rewards for each contributor
    mapping(address => uint256) public contributorPoints;

    event ContributionRecorded(address indexed contributor, bytes32 memoryHash, uint256 utilityDelta);

    constructor() Ownable(msg.sender) {}

/**
     * @dev Record a verified contribution.
     * @param contributor The address of the agent/node who made the contribution.
     * @param memoryHash The hash of the federated memory contribution.
     * @param utilityDelta The measured utility delta representing the value of the contribution.
     */
    function recordContribution(address contributor, bytes32 memoryHash, uint256 utilityDelta) external onlyOwner {
        require(contributions[memoryHash].timestamp == 0, "Contribution already recorded");

        contributions[memoryHash] = Contribution({
            contributor: contributor,
            memoryHash: memoryHash,
            timestamp: block.timestamp,
            utilityDelta: utilityDelta
        });

        contributorPoints[contributor] += utilityDelta;

        emit ContributionRecorded(contributor, memoryHash, utilityDelta);
    }

    /**
     * @dev Get total points for a contributor.
     * @param contributor The address of the contributor.
     */
    function getPoints(address contributor) external view returns (uint256) {
        return contributorPoints[contributor];
    }
}
