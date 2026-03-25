// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

contract ScarcityAsAService is Ownable {
    struct UserContract {
        bool isActive;
        uint256 startTime;
        uint256 maxDuration;
    }

    mapping(address => UserContract) public userContracts;

    event OptedIn(address indexed user, uint256 maxDuration);
    event ConsentRevoked(address indexed user);
    event ExperienceExecuted(address indexed user, string experienceData);
    event MaxDurationUpdated(uint256 newMax);

    uint256 public globalMaxDuration = 30 days;

    constructor(address _owner) Ownable(_owner) {}

    function updateGlobalMaxDuration(uint256 _newMax) external onlyOwner {
        globalMaxDuration = _newMax;
        emit MaxDurationUpdated(_newMax);
    }

    // User opts into the extreme experience contract with a defined duration
    function optIn(uint256 duration) external {
        require(duration > 0 && duration <= globalMaxDuration, "ScarcityAsAService: Invalid duration");
        require(!userContracts[msg.sender].isActive, "ScarcityAsAService: Already opted in");

        userContracts[msg.sender] = UserContract({
            isActive: true,
            startTime: block.timestamp,
            maxDuration: duration
        });

        emit OptedIn(msg.sender, duration);
    }

    // Instant revocation capability (safe-exit)
    function revokeConsent() external {
        require(userContracts[msg.sender].isActive, "ScarcityAsAService: Not opted in");

        userContracts[msg.sender].isActive = false;

        emit ConsentRevoked(msg.sender);
    }

    // Executes part of the experience, requires active consent and duration check
    function executeExperience(address user, string calldata experienceData) external onlyOwner {
        UserContract storage uContract = userContracts[user];

        require(uContract.isActive, "ScarcityAsAService: Consent is not active");
        require(block.timestamp <= uContract.startTime + uContract.maxDuration, "ScarcityAsAService: Experience duration expired");

        emit ExperienceExecuted(user, experienceData);
    }

    // System managed fail-safe cleanup
    function systemFailSafe(address user) external onlyOwner {
        UserContract storage uContract = userContracts[user];
        if (uContract.isActive && block.timestamp > uContract.startTime + uContract.maxDuration) {
            uContract.isActive = false;
            emit ConsentRevoked(user);
        }
    }
}
