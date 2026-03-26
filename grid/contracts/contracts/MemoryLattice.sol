// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./CognitiveFrictionVerifier.sol";
import "./HorizonForecast.sol";

contract MemoryLattice is ReentrancyGuard {
    CognitiveFrictionVerifier public immutable poerVerifier;
    HorizonForecast public immutable horizon;

    struct LatticeNode {
        bytes32 domain;           // e.g., "DEFi_LIQUIDITY"
        bytes32 contextHash;      // attention scope from transformer
        uint256 timestamp;
        uint256 poerScore;
    }

    struct LatticeEdge {
        bytes32 fromNode;
        bytes32 toNode;
        uint256 weight;           // attention-derived dependency strength
        uint256 timestamp;
    }

    mapping(bytes32 => LatticeNode) public nodes;
    mapping(bytes32 => LatticeEdge[]) public edgesFrom;

    event LatticeNodeAdded(bytes32 indexed nodeId, bytes32 domain);
    event LatticeEdgeAdded(bytes32 indexed fromNode, bytes32 indexed toNode, uint256 weight);

    constructor(address _poer, address _horizon) {
        poerVerifier = CognitiveFrictionVerifier(_poer);
        horizon = HorizonForecast(_horizon);
    }

    function addAttentionNode(
        bytes32 domain,
        bytes32 contextHash,
        bytes calldata poerProof
    ) external nonReentrant {
        require(poerVerifier.verifyProofWithFriction(contextHash, poerProof), "Invalid PoER proof");

        bytes32 nodeId = keccak256(abi.encodePacked(domain, contextHash));

        nodes[nodeId] = LatticeNode({
            domain: domain,
            contextHash: contextHash,
            timestamp: block.timestamp,
            poerScore: 0
        });

        emit LatticeNodeAdded(nodeId, domain);
    }

    function addAttentionEdge(
        bytes32 fromNode,
        bytes32 toNode,
        uint256 weight,
        bytes calldata horizonProof
    ) external nonReentrant {
        require(horizon.verifyForecast(horizonProof), "Higher-order risk detected");

        edgesFrom[fromNode].push(LatticeEdge({
            fromNode: fromNode,
            toNode: toNode,
            weight: weight,
            timestamp: block.timestamp
        }));

        emit LatticeEdgeAdded(fromNode, toNode, weight);
    }

    // Query function for agents/DAO/Horizon
    function getLatticePath(bytes32 startNode, bytes32 endNode) external view returns (LatticeEdge[] memory) {
        // Simple traversal (expandable); returns verifiable dependency path
        // Implementation can be extended later with graph algorithms
        return edgesFrom[startNode];
    }
}
