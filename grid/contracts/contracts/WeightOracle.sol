// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./DualLedgerIdentity.sol";

/**
 * @title WeightOracle
 * @dev Maintains the 30-day moving average equivalents for PoER (Algorithmic / Agent)
 * and PoSig (Anthropic / Human). Used to calculate voting weights dynamically based on node type.
 */
contract WeightOracle is Ownable {
    DualLedgerIdentity public identityContract;

    // Mapping from node address to their weight score (PoER or PoSig)
    mapping(address => uint256) public nodeWeights;

    // Custom errors for gas efficiency
    error UnauthorizedUpdater();
    error NodeNotRegistered(address node);
    error InvalidWeight();

    event WeightUpdated(address indexed node, uint256 oldWeight, uint256 newWeight);
    event IdentityContractUpdated(address indexed newContract);

    constructor(address _identityContract) Ownable(msg.sender) {
        identityContract = DualLedgerIdentity(_identityContract);
    }

    /**
     * @dev Updates the weight score of a node. Can only be called by the owner/oracle.
     * @param node The address of the node.
     * @param newWeight The new weight score (e.g., 30-day moving average).
     */
    function updateWeight(address node, uint256 newWeight) external onlyOwner {
        if (!identityContract.isNodeRegistered(node)) revert NodeNotRegistered(node);

        uint256 oldWeight = nodeWeights[node];
        nodeWeights[node] = newWeight;

        emit WeightUpdated(node, oldWeight, newWeight);
    }

    /**
     * @dev Batch updates the weight score of multiple nodes. Can only be called by the owner/oracle.
     * @param nodes The addresses of the nodes.
     * @param newWeights The new weight scores.
     */
    function batchUpdateWeights(address[] calldata nodes, uint256[] calldata newWeights) external onlyOwner {
        require(nodes.length == newWeights.length, "Arrays length mismatch");
        for (uint256 i = 0; i < nodes.length; i++) {
            address node = nodes[i];
            uint256 newWeight = newWeights[i];

            if (!identityContract.isNodeRegistered(node)) revert NodeNotRegistered(node);

            uint256 oldWeight = nodeWeights[node];
            nodeWeights[node] = newWeight;

            emit WeightUpdated(node, oldWeight, newWeight);
        }
    }

    /**
     * @dev Gets the weight of a given node.
     * @param node The address of the node.
     * @return The weight of the node.
     */
    function getWeight(address node) external view returns (uint256) {
        if (!identityContract.isNodeRegistered(node)) revert NodeNotRegistered(node);
        return nodeWeights[node];
    }

    /**
     * @dev Updates the identity contract address.
     * @param _identityContract The address of the new identity contract.
     */
    function setIdentityContract(address _identityContract) external onlyOwner {
        identityContract = DualLedgerIdentity(_identityContract);
        emit IdentityContractUpdated(_identityContract);
    }
}
