// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title HermesAgentRegistry
 * @dev Manages identities and capability tokens for Hermes agents within AXIOM-MESH.
 */
contract HermesAgentRegistry is AccessControl {
    bytes32 public constant GOVERNANCE_ROLE = keccak256("GOVERNANCE_ROLE");
    bytes32 public constant AUDITOR_ROLE = keccak256("AUDITOR_ROLE");

    struct Agent {
        address owner;
        bytes32 did;
        uint256 dailySpendLimit;
        uint256 dailySpent;
        uint256 lastResetTimestamp;
        bool active;
    }

    mapping(bytes32 => Agent) public agents;
    mapping(bytes32 => mapping(bytes32 => bool)) public approvedSkills;

    // On-chain verification of issued capability tokens
    // token => actionHash
    mapping(bytes32 => bytes32) public issuedTokens;
    // token => expiration
    mapping(bytes32 => uint256) public tokenExpirations;

    event AgentRegistered(bytes32 indexed agentId, address indexed owner, bytes32 did);
    event CapabilityRequested(bytes32 indexed agentId, bytes32 actionHash, bytes32 token, uint256 expiration);
    event SkillApproved(bytes32 indexed agentId, bytes32 skillHash);
    event SpendLimitUpdated(bytes32 indexed agentId, uint256 newLimit);
    event ActionLogged(bytes32 indexed agentId, bytes32 actionHash, bool success);

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(GOVERNANCE_ROLE, msg.sender);
    }

    function registerAgent(bytes32 agentId, bytes32 did, uint256 dailySpendLimit) external {
        require(agents[agentId].owner == address(0), "Agent already registered");
        agents[agentId].owner = msg.sender;
        agents[agentId].did = did;
        agents[agentId].dailySpendLimit = dailySpendLimit;
        agents[agentId].dailySpent = 0;
        agents[agentId].lastResetTimestamp = block.timestamp;
        agents[agentId].active = true;

        emit AgentRegistered(agentId, msg.sender, did);
    }

    function requestCapability(bytes32 agentId, bytes32 actionHash, uint256 ttl) external returns (bytes32 token) {
        require(agents[agentId].active, "Agent not active");
        require(agents[agentId].owner == msg.sender || hasRole(GOVERNANCE_ROLE, msg.sender), "Unauthorized");

        token = keccak256(abi.encodePacked(agentId, actionHash, block.timestamp, block.prevrandao));
        uint256 expiration = block.timestamp + ttl;

        issuedTokens[token] = actionHash;
        tokenExpirations[token] = expiration;

        emit CapabilityRequested(agentId, actionHash, token, expiration);
        return token;
    }

    function verifyCapability(bytes32 token, bytes32 actionHash) external view returns (bool) {
        return (issuedTokens[token] == actionHash && block.timestamp <= tokenExpirations[token]);
    }

    function recordSpend(bytes32 agentId, uint256 amount) external onlyRole(GOVERNANCE_ROLE) {
        Agent storage agent = agents[agentId];
        if (block.timestamp >= agent.lastResetTimestamp + 1 days) {
            agent.dailySpent = 0;
            agent.lastResetTimestamp = block.timestamp;
        }
        require(agent.dailySpent + amount <= agent.dailySpendLimit, "Spend limit exceeded");
        agent.dailySpent += amount;
    }

    function approveSkill(bytes32 agentId, bytes32 skillHash) external onlyRole(GOVERNANCE_ROLE) {
        approvedSkills[agentId][skillHash] = true;
        emit SkillApproved(agentId, skillHash);
    }

    function updateSpendLimit(bytes32 agentId, uint256 newLimit) external onlyRole(GOVERNANCE_ROLE) {
        agents[agentId].dailySpendLimit = newLimit;
        emit SpendLimitUpdated(agentId, newLimit);
    }

    function setAgentActive(bytes32 agentId, bool active) external onlyRole(GOVERNANCE_ROLE) {
        agents[agentId].active = active;
    }

    function logAction(bytes32 agentId, bytes32 actionHash, bool success) external onlyRole(AUDITOR_ROLE) {
        emit ActionLogged(agentId, actionHash, success);
    }
}
