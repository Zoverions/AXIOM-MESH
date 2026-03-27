// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

contract TruthAnchor {
    struct TruthClaim {
        uint256 id;
        bytes32 claimHash;
        address claimant;
        bytes32 sourceMerkleRoot;
        uint256 bondAmount;
        uint256 createdAt;
        uint256 challengeDeadline;
        bool isChallenged;
        bool isResolved;
        bool isValid;
    }

    uint256 public nextClaimId = 1;
    mapping(uint256 => TruthClaim) public claims;
    mapping(address => uint256[]) public claimantClaims;

    event TruthAnchored(uint256 indexed claimId, bytes32 indexed claimHash, address indexed claimant, uint256 bondAmount);
    event TruthSourceVerified(uint256 indexed claimId, bytes32 indexed sourceHash);

    function anchorTruth(bytes32 _claimHash, bytes32 _sourceMerkleRoot, uint256 _bondAmount) external returns (uint256) {
        require(_bondAmount > 0, "Bond amount must be greater than 0");

        uint256 claimId = nextClaimId++;

        claims[claimId] = TruthClaim({
            id: claimId,
            claimHash: _claimHash,
            claimant: msg.sender,
            sourceMerkleRoot: _sourceMerkleRoot,
            bondAmount: _bondAmount,
            createdAt: block.timestamp,
            challengeDeadline: block.timestamp + 7 days,
            isChallenged: false,
            isResolved: false,
            isValid: false
        });

        claimantClaims[msg.sender].push(claimId);

        emit TruthAnchored(claimId, _claimHash, msg.sender, _bondAmount);

        return claimId;
    }

    // Optimization M15.5: Instead of unbounded loop verification, use Merkle proof
    function verifySource(uint256 _claimId, bytes32 _sourceHash, bytes32[] calldata _proof) external {
        TruthClaim storage claim = claims[_claimId];
        require(claim.id == _claimId, "Claim does not exist");

        // M15.5: Merkle proof verification (est. ~60% savings over unbounded loops)
        require(MerkleProof.verify(_proof, claim.sourceMerkleRoot, _sourceHash), "Invalid source proof");

        emit TruthSourceVerified(_claimId, _sourceHash);
    }

    function getClaim(uint256 _claimId) external view returns (TruthClaim memory) {
        return claims[_claimId];
    }

    function getClaimantClaims(address _claimant) external view returns (uint256[] memory) {
        return claimantClaims[_claimant];
    }
}
