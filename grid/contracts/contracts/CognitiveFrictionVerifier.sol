// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";

interface IZKMLVerifierFriction {
    function verifyProof(bytes32 proofHash, uint256[2] calldata a, uint256[2][2] calldata b, uint256[2] calldata c) external returns (bool);
}

contract CognitiveFrictionVerifier is Ownable {
    mapping(bytes32 => bool) public verifiedProofs;
    mapping(address => uint256) public poerScores;
    address public zkVerifier;

    event ProofVerified(bytes32 proofHash, bool passed, uint256 poerScore);

    constructor() Ownable(msg.sender) {}

    function setZkVerifier(address _zkVerifier) external onlyOwner {
        zkVerifier = _zkVerifier;
    }

    function verifyProofWithFriction(bytes32 proofHash, bytes calldata zkProofData) external returns (bool) {
        require(zkVerifier != address(0), "ZK verifier not set");
        (uint256[2] memory a, uint256[2][2] memory b, uint256[2] memory c) = abi.decode(zkProofData, (uint256[2], uint256[2][2], uint256[2]));
        // Real Groth16/ezkl verification
        bool frictionPassed = IZKMLVerifierFriction(zkVerifier).verifyProof(proofHash, a, b, c);

        verifiedProofs[proofHash] = frictionPassed;

        uint256 score = frictionPassed ? 1500 : 0;
        poerScores[msg.sender] += score;

        emit ProofVerified(proofHash, frictionPassed, score);
        return frictionPassed;
    }

    function verifyPoER(
        bytes32 stateRootBefore,
        bytes32 stateRootAfter,
        bytes32 attentionScopeHash,
        bytes32 dependencyGraphRoot,
        bytes32 capabilityRoot,
        bytes32 modelRoot,
        bytes32 executionTraceHash,
        bytes calldata zkProof
    ) external returns (bool) {
        bytes32 proofHash = keccak256(
            abi.encode(
                stateRootBefore,
                stateRootAfter,
                attentionScopeHash,
                dependencyGraphRoot,
                capabilityRoot,
                modelRoot,
                executionTraceHash
            )
        );
        return this.verifyProofWithFriction(proofHash, zkProof);
    }

    function updatePoERScore(address agent, uint256 score) external onlyOwner {
        poerScores[agent] = score;
    }
}
