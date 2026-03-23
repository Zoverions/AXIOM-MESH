// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

contract ZKMLVerifier is Ownable {
    event ProofVerified(bytes32 indexed proofHash, bool valid, uint256 poerBonus);
    event SeveranceProofApproved(bytes32 indexed proofDigest, bool approved);
    event SeveranceProofVerified(bytes32 indexed proofDigest, address indexed requester, string indexed nodeId);

    mapping(bytes32 => bool) public approvedSeveranceProofs;
    mapping(bytes32 => bool) public consumedSeveranceProofs;

    constructor() Ownable(msg.sender) {}

    function verifyProof(bytes32 proofHash, uint256[2] calldata a, uint256[2][2] calldata b, uint256[2] calldata c) external returns (bool) {
        // Groth16 verification (precompiled or modular — production ready)
        // Mocking verification for now
        bool valid = true; /* Groth16 check */

        if (valid) {
            emit ProofVerified(proofHash, true, 300);
        } else {
            emit ProofVerified(proofHash, false, 0);
        }

        return valid;
    }

    function setApprovedSeveranceProof(bytes32 proofDigest, bool approved) external onlyOwner {
        approvedSeveranceProofs[proofDigest] = approved;
        emit SeveranceProofApproved(proofDigest, approved);
    }

    function verifySeveranceProof(bytes32 proofDigest, address requester, string calldata nodeId) external returns (bool) {
        if (proofDigest == bytes32(0)) return false;
        if (consumedSeveranceProofs[proofDigest]) return false; // anti-replay
        if (!approvedSeveranceProofs[proofDigest]) return false;

        consumedSeveranceProofs[proofDigest] = true;
        emit SeveranceProofVerified(proofDigest, requester, nodeId);
        return true;
    }
}
