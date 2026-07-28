// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

contract CredentialBond is Ownable {
    struct AssessorStake {
        uint256 amount;
        bool isActive;
    }

    struct Credential {
        address assessor;
        address learner;
        bytes32 curriculumId;
        uint256 issueDate;
        bool isRevoked;
    }

    mapping(address => AssessorStake) public assessorStakes;
    mapping(bytes32 => Credential) public credentials;
    uint256 public constant MIN_STAKE = 1 ether;
    uint256 public totalSlashed;

    event AssessorStaked(address indexed assessor, uint256 amount);
    event AssessorSlashed(address indexed assessor, uint256 amount, string reason);
    event AssessorWithdrawn(address indexed assessor, uint256 amount);
    event CredentialIssued(bytes32 indexed credentialId, address indexed assessor, address indexed learner, bytes32 curriculumId);
    event CredentialRevoked(bytes32 indexed credentialId, string reason);

    constructor() Ownable(msg.sender) {}

    function stake() external payable {
        require(msg.value >= MIN_STAKE, "Stake below minimum");

        AssessorStake storage staker = assessorStakes[msg.sender];
        staker.amount += msg.value;
        staker.isActive = true;

        emit AssessorStaked(msg.sender, msg.value);
    }

    function issueCredential(
        bytes32 credentialId,
        address learner,
        bytes32 curriculumId
    ) external {
        require(assessorStakes[msg.sender].isActive, "Assessor not active");
        require(assessorStakes[msg.sender].amount >= MIN_STAKE, "Insufficient stake");
        require(credentials[credentialId].assessor == address(0), "Credential ID exists");

        credentials[credentialId] = Credential({
            assessor: msg.sender,
            learner: learner,
            curriculumId: curriculumId,
            issueDate: block.timestamp,
            isRevoked: false
        });

        emit CredentialIssued(credentialId, msg.sender, learner, curriculumId);
    }

    function revokeCredential(bytes32 credentialId, string calldata reason) external {
        Credential storage cred = credentials[credentialId];
        require(cred.assessor != address(0), "Credential not found");
        require(msg.sender == cred.assessor || msg.sender == owner(), "Unauthorized to revoke");
        require(!cred.isRevoked, "Already revoked");

        cred.isRevoked = true;
        emit CredentialRevoked(credentialId, reason);
    }

    function slashAssessor(address assessor, uint256 slashAmount, string calldata reason) external onlyOwner {
        AssessorStake storage staker = assessorStakes[assessor];
        require(staker.isActive, "Assessor not active");
        require(staker.amount >= slashAmount, "Slash amount exceeds stake");

        staker.amount -= slashAmount;
        totalSlashed += slashAmount;

        if (staker.amount < MIN_STAKE) {
            staker.isActive = false;
        }

        emit AssessorSlashed(assessor, slashAmount, reason);
    }

    function withdrawStake(uint256 amount) external {
        AssessorStake storage staker = assessorStakes[msg.sender];
        require(staker.isActive, "Assessor not active");
        require(staker.amount >= amount, "Withdrawal exceeds stake");
        require(staker.amount - amount >= MIN_STAKE || amount == staker.amount, "Stake cannot drop below minimum without full withdrawal");

        staker.amount -= amount;
        if (staker.amount == 0) {
            staker.isActive = false;
        }

        (bool success, ) = payable(msg.sender).call{value: amount}("");
        require(success, "Transfer failed");

        emit AssessorWithdrawn(msg.sender, amount);
    }

    function withdrawSlashedFunds(uint256 amount) external onlyOwner {
        require(totalSlashed >= amount, "Insufficient slashed funds");

        totalSlashed -= amount;

        (bool success, ) = payable(owner()).call{value: amount}("");
        require(success, "Transfer failed");
    }

    function isCredentialValid(bytes32 credentialId) external view returns (bool) {
        Credential storage cred = credentials[credentialId];
        if (cred.assessor == address(0)) return false;
        return !cred.isRevoked;
    }
}
