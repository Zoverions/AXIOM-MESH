// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "./SoulboundReputation.sol";
import "./GovernanceTransition.sol";

contract FoundersCouncil is ERC721, Ownable {
    SoulboundReputation public reputationToken;
    GovernanceTransition public govTransition;

    uint256 private _nextTokenId;

    struct Role {
        string name;
        address humanMember;
        address aiAgent;
        uint256 requiredReputationType; // Mapping to SoulboundReputation.ReputationType
    }

    // Role ID -> Role Details
    mapping(uint256 => Role) public roles;
    uint256 public nextRoleId;

    // Token ID -> Role ID mapping
    mapping(uint256 => uint256) public tokenToRole;

    event RoleCreated(uint256 indexed roleId, string name, uint256 requiredReputationType);
    event MemberAssigned(uint256 indexed roleId, address humanMember, address aiAgent);

    constructor(
        address _founder,
        address _reputationToken,
        address _govTransition
    ) ERC721("FoundersCouncil", "FC-NFT") Ownable(_founder) {
        reputationToken = SoulboundReputation(_reputationToken);
        govTransition = GovernanceTransition(payable(_govTransition));
    }

    // Founders can create specific roles for the council (e.g. Economics, Security, Education)
    function createRole(string memory name, uint256 requiredReputationType) external onlyOwner {
        roles[nextRoleId] = Role({
            name: name,
            humanMember: address(0),
            aiAgent: address(0),
            requiredReputationType: requiredReputationType
        });

        emit RoleCreated(nextRoleId, name, requiredReputationType);
        nextRoleId++;
    }

    // Founder assigns humans and AI agents to the roles. Recognizes them with an NFT.
    function assignRole(
        uint256 roleId,
        address humanMember,
        address aiAgent
    ) external onlyOwner {
        require(roleId < nextRoleId, "Role does not exist");
        require(humanMember != address(0), "Invalid human member");
        require(aiAgent != address(0), "Invalid AI agent");

        Role storage role = roles[roleId];

        // Revoke previous tokens if reassigned
        // (In a real system, you'd burn the old NFTs or handle transfer)

        role.humanMember = humanMember;
        role.aiAgent = aiAgent;

        // Mint NFT to human
        uint256 humanTokenId = _nextTokenId++;
        _safeMint(humanMember, humanTokenId);
        tokenToRole[humanTokenId] = roleId;

        // Mint NFT to AI Agent
        uint256 agentTokenId = _nextTokenId++;
        _safeMint(aiAgent, agentTokenId);
        tokenToRole[agentTokenId] = roleId;

        emit MemberAssigned(roleId, humanMember, aiAgent);
    }

    // System recommends candidates based on SoulboundReputation scores
    function getRecommendationForRole(uint256 roleId, address[] calldata candidates)
        external
        view
        returns (address bestCandidate, uint256 highestScore)
    {
        require(roleId < nextRoleId, "Role does not exist");
        uint256 reqRepType = roles[roleId].requiredReputationType;

        highestScore = 0;
        bestCandidate = address(0);

        for (uint256 i = 0; i < candidates.length; i++) {
            // Note: In Solidity we have to cast uint256 back to enum in SoulboundReputation
            // Here we assume getReputationScore accepts the enum value correctly.
            uint256 score = reputationToken.getReputationScore(candidates[i], SoulboundReputation.ReputationType(reqRepType));

            if (score > highestScore) {
                highestScore = score;
                bestCandidate = candidates[i];
            }
        }

        return (bestCandidate, highestScore);
    }

    // Non-transferable tokens (Soulbound to the council member)
    function transferFrom(address, address, uint256) public pure override {
        revert("FoundersCouncil: Council NFTs are non-transferable");
    }

    function safeTransferFrom(address, address, uint256, bytes memory) public pure override {
        revert("FoundersCouncil: Council NFTs are non-transferable");
    }
}