// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title SkillCapsule
 * @dev Tracks the issuance, verification, and revocation of Skill Capsules.
 * Implements the AM-SCS schema contracts.
 */
contract SkillCapsule is Ownable {
    constructor() Ownable(msg.sender) {}

    struct Issuer {
        string meshIssuer;
        string keyId;
    }

    struct Constraints {
        bool proofCarryingIntents;
        bool intentCanonicalization;
        uint256 maxRiskScore; // scaled by 10000 (0-10000) for 0-1
    }

    struct Runtime {
        uint256 cpuLimit;
        uint256 memoryLimitMb;
        uint256 timeoutMs;
    }

    struct CapsuleManifest {
        string capsuleId;
        string name;
        string version;
        Issuer issuer;
        string[] capabilities;
        Constraints constraints;
        Runtime runtime;
        string tokenPolicyScopeTools; // Simplified for MVP
        string tokenPolicyScopeData;  // Simplified for MVP
        uint256 tokenPolicyTtlSeconds;
        bool tokenPolicyRevocationHandleRequired;
        string tokenPolicyProofStrictness;
        bool isRevoked;
        bool exists;
    }

    mapping(string => CapsuleManifest) public capsules;
    string[] public capsuleIds;

    event CapsuleIssued(string indexed capsuleId, string name, string version);
    event CapsuleRevoked(string indexed capsuleId);

    function issueCapsule(
        string memory _capsuleId,
        string memory _name,
        string memory _version,
        Issuer memory _issuer,
        string[] memory _capabilities,
        Constraints memory _constraints,
        Runtime memory _runtime,
        string memory _tokenPolicyScopeTools,
        string memory _tokenPolicyScopeData,
        uint256 _tokenPolicyTtlSeconds,
        bool _tokenPolicyRevocationHandleRequired,
        string memory _tokenPolicyProofStrictness
    ) external onlyOwner {
        require(!capsules[_capsuleId].exists, "Capsule already exists");

        capsules[_capsuleId] = CapsuleManifest({
            capsuleId: _capsuleId,
            name: _name,
            version: _version,
            issuer: _issuer,
            capabilities: _capabilities,
            constraints: _constraints,
            runtime: _runtime,
            tokenPolicyScopeTools: _tokenPolicyScopeTools,
            tokenPolicyScopeData: _tokenPolicyScopeData,
            tokenPolicyTtlSeconds: _tokenPolicyTtlSeconds,
            tokenPolicyRevocationHandleRequired: _tokenPolicyRevocationHandleRequired,
            tokenPolicyProofStrictness: _tokenPolicyProofStrictness,
            isRevoked: false,
            exists: true
        });

        capsuleIds.push(_capsuleId);
        emit CapsuleIssued(_capsuleId, _name, _version);
    }

    function revokeCapsule(string memory _capsuleId) external onlyOwner {
        require(capsules[_capsuleId].exists, "Capsule does not exist");
        require(!capsules[_capsuleId].isRevoked, "Capsule already revoked");

        capsules[_capsuleId].isRevoked = true;
        emit CapsuleRevoked(_capsuleId);
    }

    function verifyCapsule(string memory _capsuleId) external view returns (bool) {
        if (!capsules[_capsuleId].exists) {
            return false;
        }
        return !capsules[_capsuleId].isRevoked;
    }

    function getCapsuleCapabilities(string memory _capsuleId) external view returns (string[] memory) {
        require(capsules[_capsuleId].exists, "Capsule does not exist");
        return capsules[_capsuleId].capabilities;
    }
}
