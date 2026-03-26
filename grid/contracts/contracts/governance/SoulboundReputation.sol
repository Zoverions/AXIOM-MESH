// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

contract SoulboundReputation {

    enum ReputationType {
        Expertise,
        Governance,
        Education,
        Contribution,
        Community,
        Prediction,
        Ethics
    }

    struct ReputationToken {
        uint256 tokenId;
        address owner;
        ReputationType repType;
        string domain;  // For expertise (e.g., "security", "economics")
        uint256 score;  // 0-1000
        uint256 lastUpdated;
        bool active;
        bytes32[] achievements;  // Linked achievements
    }

    mapping(uint256 => ReputationToken) public tokens;
    mapping(address => uint256[]) public userTokens;
    mapping(address => mapping(ReputationType => uint256)) public userRepByType;
    uint256 public nextTokenId;

    // Cannot transfer (soulbound)
    function transferFrom(address, address, uint256) public pure {
        revert("Soulbound: Cannot transfer reputation tokens");
    }

    function safeTransferFrom(address, address, uint256) public pure {
        revert("Soulbound: Cannot transfer reputation tokens");
    }

    event ReputationUpdated(
        address indexed user,
        ReputationType repType,
        string domain,
        uint256 newScore
    );

    event ReputationBurned(address indexed user, uint256 tokenId);

    modifier onlyVerifiedActivity() {
        // Implementation for restricting calls
        _;
    }

    function updateReputation(
        address _user,
        ReputationType _repType,
        string calldata _domain,
        int256 _scoreChange
    ) external onlyVerifiedActivity {
        // Find or create reputation token
        uint256 tokenId = findOrCreateToken(_user, _repType, _domain);

        ReputationToken storage token = tokens[tokenId];
        int256 newScore = int256(token.score) + _scoreChange;

        // Clamp score between 0-1000
        if (newScore < 0) newScore = 0;
        if (newScore > 1000) newScore = 1000;

        token.score = uint256(newScore);
        token.lastUpdated = block.timestamp;
        token.active = true;

        userRepByType[_user][_repType] = token.score;

        emit ReputationUpdated(_user, _repType, _domain, token.score);
    }

    function burnReputation(uint256 _tokenId) external {
        require(tokens[_tokenId].owner == msg.sender, "Not your token");

        tokens[_tokenId].active = false;
        tokens[_tokenId].score = 0;

        // Remove from user's token list
        // Note: For full cleanup we would shift array items, skipping for now
        // to maintain simplicity and matching the issue scope

        emit ReputationBurned(msg.sender, _tokenId);
    }

    function findOrCreateToken(
        address _user,
        ReputationType _repType,
        string memory _domain
    ) internal returns (uint256) {
        // Search existing tokens
        for (uint256 i = 0; i < userTokens[_user].length; i++) {
            uint256 tokenId = userTokens[_user][i];
            if (
                tokens[tokenId].repType == _repType &&
                keccak256(bytes(tokens[tokenId].domain)) == keccak256(bytes(_domain))
            ) {
                return tokenId;
            }
        }

        // Create new token
        uint256 newTokenId = nextTokenId++;
        tokens[newTokenId] = ReputationToken({
            tokenId: newTokenId,
            owner: _user,
            repType: _repType,
            domain: _domain,
            score: 0,
            lastUpdated: block.timestamp,
            active: true,
            achievements: new bytes32[](0)
        });

        userTokens[_user].push(newTokenId);

        return newTokenId;
    }

    function getReputationScore(address _user, ReputationType _repType)
        external
        view
        returns (uint256)
    {
        return userRepByType[_user][_repType];
    }

    function getAggregateReputation(address _user)
        external
        view
        returns (uint256)
    {
        uint256 total = 0;
        for (uint256 i = 0; i < userTokens[_user].length; i++) {
            if (tokens[userTokens[_user][i]].active) {
                total += tokens[userTokens[_user][i]].score;
            }
        }
        return total / 7;  // Average across 7 types
    }
}