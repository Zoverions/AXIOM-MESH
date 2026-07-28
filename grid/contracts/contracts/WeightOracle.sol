// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./TimelockedOwnable.sol";
import "./DualLedgerIdentity.sol";

/**
 * @title WeightOracle
 * @dev Maintains the 30-day moving average equivalents for PoER (Algorithmic / Agent)
 * and PoSig (Anthropic / Human). Used to calculate voting weights dynamically based on node type.
 */
contract WeightOracle is TimelockedOwnable {
    DualLedgerIdentity public identityContract;

    // M12.7 Oracle redundancy: Add explicit oracle fallback strategy and reduce initial liquidity concentration.
    // We add a fallback oracle address to be used if the main feed fails or needs redundancy.
    address public fallbackOracle;

    // Mapping from node address to their weight score (PoER or PoSig)
    mapping(address => uint256) public nodeWeights;

    // Custom errors for gas efficiency
    error UnauthorizedUpdater();
    error NodeNotRegistered(address node);
    error InvalidWeight();

    event WeightUpdated(address indexed node, uint256 oldWeight, uint256 newWeight);
    event IdentityContractUpdated(address indexed newContract);

    // Track PoER bonuses from zkML / MeshStore contributions
    mapping(address => uint256) public poerBonuses;
    mapping(address => uint256) public verifiedSkillPoints;

    // Vote categories with specific PoER weighting
    mapping(string => uint256) public categoryWeights;

    // Address of the ComputeBond contract allowed to add bonuses
    address public computeBondContract;

    constructor(address _identityContract) TimelockedOwnable(msg.sender) {
        identityContract = DualLedgerIdentity(_identityContract);
    }

    function setComputeBondContract(address _computeBondContract) external onlyTimelocked(keccak256(abi.encodePacked("setComputeBondContract", _computeBondContract))) {
        computeBondContract = _computeBondContract;
    }

    /**
     * @dev Set category weight multipliers. e.g., "deployment" => 150 (1.5x)
     */
    function setCategoryWeight(string calldata category, uint256 multiplier) external onlyTimelocked(keccak256(abi.encodePacked("setCategoryWeight", category, multiplier))) {
        categoryWeights[category] = multiplier;
    }

    /**
     * @dev Gets the weight of a given node for a specific category.
     */
    function getCategoryWeight(address node, string calldata category) external view returns (uint256) {
        if (!identityContract.isNodeRegistered(node)) revert NodeNotRegistered(node);
        uint256 baseWeight = nodeWeights[node] + poerBonuses[node];
        uint256 multiplier = categoryWeights[category];
        if (multiplier == 0) multiplier = 100; // default 1x
        return (baseWeight * multiplier) / 100;
    }

    /**
     * @dev Adds a Proof of Enterprise/Compute (PoER) bonus to a node's weight score.
     * Can only be called by the ComputeBond contract.
     * @param node The address of the node.
     * @param bonusAmount The amount of bonus weight to add.
     */
    function addPoERBonus(address node, uint256 bonusAmount) external {
        require(msg.sender == computeBondContract, "Unauthorized: Only ComputeBond can add PoER bonus");
        if (!identityContract.isNodeRegistered(node)) revert NodeNotRegistered(node);

        uint256 oldWeight = nodeWeights[node] + poerBonuses[node];
        poerBonuses[node] += bonusAmount;
        uint256 newWeight = nodeWeights[node] + poerBonuses[node];

        emit WeightUpdated(node, oldWeight, newWeight);
    }

    /**
     * @dev Add verified skill points for an address. Only allowed by consensus/poer.
     */
    function addVerifiedSkillPoints(address user, uint256 points) external onlyTimelocked(keccak256(abi.encodePacked("addVerifiedSkillPoints", user, points))) {
        verifiedSkillPoints[user] += points;
        // Weight calculation requires base weight + log(points) calculation (to be done off chain or simulated on chain)
    }

    /**
     * @dev Slashes a Proof of Enterprise/Compute (PoER) bonus from a node's weight score.
     * Can only be called by the ComputeBond contract.
     * @param node The address of the node.
     */
    function slashPoERBonus(address node) external {
        require(msg.sender == computeBondContract, "Unauthorized: Only ComputeBond can slash PoER bonus");
        if (!identityContract.isNodeRegistered(node)) revert NodeNotRegistered(node);

        uint256 oldWeight = nodeWeights[node] + poerBonuses[node];
        poerBonuses[node] = 0; // Automatic slash for invalid proof
        uint256 newWeight = nodeWeights[node];

        emit WeightUpdated(node, oldWeight, newWeight);
    }

    /**
     * @dev Updates the weight score of a node. Can only be called by the owner/oracle.
     * @param node The address of the node.
     * @param newWeight The new weight score (e.g., 30-day moving average).
     */
    function updateWeight(address node, uint256 newWeight) external onlyTimelocked(keccak256(abi.encodePacked("updateWeight", node, newWeight))) {
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
    function batchUpdateWeights(address[] calldata nodes, uint256[] calldata newWeights) external onlyTimelocked(keccak256(abi.encodePacked("batchUpdateWeights", nodes, newWeights))) {
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

        uint256 weight = this.calculateMeritWeight(node);

        // M12.7 Oracle redundancy: Use fallback oracle if base weight calculation returns 0
        if (weight == 0 && fallbackOracle != address(0)) {
            (bool success, bytes memory data) = fallbackOracle.staticcall(
                abi.encodeWithSignature("getWeight(address)", node)
            );
            if (success && data.length > 0) {
                weight = abi.decode(data, (uint256));
            }
        }

        return weight;
    }

    /**
     * @dev Set the fallback oracle address
     */
    function setFallbackOracle(address _fallbackOracle) external onlyTimelocked(keccak256(abi.encodePacked("setFallbackOracle", _fallbackOracle))) {
        fallbackOracle = _fallbackOracle;
    }

    /**
     * @dev Calculates Merit Weight based on VerifiedSkillPoints
     */
    function calculateMeritWeight(address user) external view returns (uint256) {
        uint256 base = nodeWeights[user] + poerBonuses[user];
        uint256 pts = verifiedSkillPoints[user];
        uint256 logPts = 0;
        while (pts > 1) { pts >>= 1; logPts++; }
        return base + logPts;
    }

    /**
     * @dev Updates the identity contract address.
     * @param _identityContract The address of the new identity contract.
     */
    function setIdentityContract(address _identityContract) external onlyTimelocked(keccak256(abi.encodePacked("setIdentityContract", _identityContract))) {
        identityContract = DualLedgerIdentity(_identityContract);
        emit IdentityContractUpdated(_identityContract);
    }
}
