// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../../../grid/contracts/contracts/governance/OntarioHealthGuild.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title OntarioEducationAttestor
 * @dev Attests to educational achievements within Ontario jurisdiction
 * Integrates with OntarioHealthGuild for cross-domain verification
 * Supports NFT badge grants aligned with Ontario credit systems
 */
contract OntarioEducationAttestor is Ownable {
    OntarioHealthGuild public healthGuild;
    
    struct EducationalAchievement {
        address student;
        string achievementType;
        uint256 creditValue;
        uint256 timestamp;
        bool verified;
        string metadataURI;
    }
    
    struct NFTBadge {
        address student;
        string badgeType;
        uint256 level;
        uint256 grantedAt;
        bool active;
    }
    
    mapping(bytes32 => EducationalAchievement) public achievements;
    mapping(bytes32 => NFTBadge) public badges;
    mapping(address => bytes32[]) public studentAchievements;
    mapping(address => bytes32[]) public studentBadges;
    
    event AchievementAttested(
        bytes32 indexed achievementId,
        address indexed student,
        string achievementType,
        uint256 creditValue
    );
    
    event BadgeGranted(
        bytes32 indexed badgeId,
        address indexed student,
        string badgeType,
        uint256 level
    );
    
    event HealthGuildLinked(address indexed guildAddress);
    
    modifier onlyWhenActive() {
        require(address(healthGuild) != address(0), "OntarioEducationAttestor: Health guild not set");
        require(!healthGuild.isRevoked(), "OntarioEducationAttestor: Access revoked by health guild");
        _;
    }
    
    constructor(address _owner) Ownable(_owner) {}
    
    /**
     * @dev Link to Ontario Health Guild for cross-domain oversight
     */
    function linkHealthGuild(address _guildAddress) external onlyOwner {
        require(_guildAddress != address(0), "OntarioEducationAttestor: Invalid guild address");
        healthGuild = OntarioHealthGuild(_guildAddress);
        emit HealthGuildLinked(_guildAddress);
    }
    
    /**
     * @dev Attest to an educational achievement
     */
    function attestAchievement(
        address _student,
        string memory _achievementType,
        uint256 _creditValue,
        string memory _metadataURI
    ) external onlyWhenActive returns (bytes32) {
        require(_student != address(0), "OntarioEducationAttestor: Invalid student address");
        require(_creditValue > 0, "OntarioEducationAttestor: Credit value must be positive");
        
        bytes32 achievementId = keccak256(abi.encodePacked(
            _student,
            _achievementType,
            block.timestamp,
            msg.sender
        ));
        
        achievements[achievementId] = EducationalAchievement({
            student: _student,
            achievementType: _achievementType,
            creditValue: _creditValue,
            timestamp: block.timestamp,
            verified: true,
            metadataURI: _metadataURI
        });
        
        studentAchievements[_student].push(achievementId);
        
        emit AchievementAttested(achievementId, _student, _achievementType, _creditValue);
        
        return achievementId;
    }
    
    /**
     * @dev Grant an NFT badge to a student
     */
    function grantNFTBadge(
        address _student,
        string memory _badgeType,
        uint256 _level
    ) external onlyWhenActive returns (bytes32) {
        require(_student != address(0), "OntarioEducationAttestor: Invalid student address");
        
        bytes32 badgeId = keccak256(abi.encodePacked(
            _student,
            _badgeType,
            _level,
            block.timestamp
        ));
        
        badges[badgeId] = NFTBadge({
            student: _student,
            badgeType: _badgeType,
            level: _level,
            grantedAt: block.timestamp,
            active: true
        });
        
        studentBadges[_student].push(badgeId);
        
        emit BadgeGranted(badgeId, _student, _badgeType, _level);
        
        return badgeId;
    }
    
    /**
     * @dev Get all achievements for a student
     */
    function getStudentAchievements(address _student) external view returns (bytes32[] memory) {
        return studentAchievements[_student];
    }
    
    /**
     * @dev Get all badges for a student
     */
    function getStudentBadges(address _student) external view returns (bytes32[] memory) {
        return studentBadges[_student];
    }
    
    /**
     * @dev Verify a specific achievement
     */
    function verifyAchievement(bytes32 _achievementId) external view returns (bool) {
        return achievements[_achievementId].verified;
    }
    
    /**
     * @dev Check if a badge is active
     */
    function isBadgeActive(bytes32 _badgeId) external view returns (bool) {
        return badges[_badgeId].active;
    }
}
