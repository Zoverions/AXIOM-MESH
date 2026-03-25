// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

interface ISkillOracle {
    function verifySkillScore(address user, string memory topic) external view returns (bool);
}

/**
 * @title CredentialedSubmission
 * @dev Manages the submission of resources (e.g., curriculum, documentation)
 * gated by a verifiable credential or skill score.
 */
contract CredentialedSubmission is Ownable {
    ISkillOracle public skillOracle;

    struct Submission {
        string topic;
        string cid;
        address author;
        uint256 timestamp;
        bool approved;
    }

    Submission[] public submissions;

    // Fallback whitelist for initial testnet / bridging period
    mapping(address => mapping(string => bool)) public whitelist;

    event ResourceSubmitted(address indexed author, string topic, string cid, uint256 index);
    event ResourceApproved(uint256 index, address approver);
    event WhitelistUpdated(address indexed user, string topic, bool isWhitelisted);

    constructor(address _skillOracle) Ownable(msg.sender) {
        skillOracle = ISkillOracle(_skillOracle);
    }

    function setSkillOracle(address _skillOracle) external onlyOwner {
        skillOracle = ISkillOracle(_skillOracle);
    }

    function updateWhitelist(address _user, string memory _topic, bool _status) external onlyOwner {
        whitelist[_user][_topic] = _status;
        emit WhitelistUpdated(_user, _topic, _status);
    }

    function canSubmit(address _user, string memory _topic) public view returns (bool) {
        if (whitelist[_user][_topic]) {
            return true;
        }
        if (address(skillOracle) != address(0)) {
            return skillOracle.verifySkillScore(_user, _topic);
        }
        return false;
    }

    function submitResource(string memory _topic, string memory _cid) external {
        require(canSubmit(msg.sender, _topic), "Not authorized to submit for this topic");

        submissions.push(Submission({
            topic: _topic,
            cid: _cid,
            author: msg.sender,
            timestamp: block.timestamp,
            approved: false
        }));

        emit ResourceSubmitted(msg.sender, _topic, _cid, submissions.length - 1);
    }

    function approveSubmission(uint256 _index) external onlyOwner {
        require(_index < submissions.length, "Invalid submission index");
        submissions[_index].approved = true;
        emit ResourceApproved(_index, msg.sender);
    }

    function getSubmissionsCount() external view returns (uint256) {
        return submissions.length;
    }
}
