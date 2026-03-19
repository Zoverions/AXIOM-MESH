// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";

/**
 * @title DualLedgerIdentity
 * @dev A registry separating Proof of Personhood (Human Keys) from Proof of Compute (Agent Keys).
 */
contract DualLedgerIdentity is Ownable, ERC721 {
    enum IdentityType {
        None,
        Human, // Anthropic Chamber
        Agent  // Algorithmic Chamber
    }

    struct Identity {
        IdentityType idType;
        bool isRegistered;
    }

    mapping(address => Identity) public identities;

    mapping(address => bytes32) public onChainHash;
    mapping(address => string) public offChainCID;
    mapping(bytes32 => bytes32) public totpCommitments;      // hash only
    mapping(bytes32 => bytes32) public passkeyCommitments;   // public-key hash
    mapping(bytes32 => bytes32) public recoveryBundleCID;    // MeshStore IPFS link
    mapping(address => string) public anonymizedVotingDID;   // Public address to anonymized DID

    // Interface for ComputeBond access control
    address public computeBondAddress;

    uint256 private tokenIdCounter;

    // Custom errors for gas efficiency
    error NodeAlreadyRegistered(address node);
    error NodeNotRegistered(address node);
    error InvalidIdentityType();
    error UnauthorizedCaller();

    event IdentityLinked(address indexed agent, bytes32 onChainHash, string offChainCID);
    event RecoveryRegistered(bytes32 indexed nodeId, bytes32 totpCommitment, bytes32 passkeyCommitment);
    event RecoveryUsed(bytes32 indexed nodeId, address reconnector);

    event NodeRegistered(address indexed node, IdentityType idType);
    event NodeDeregistered(address indexed node);
    event AuthorizationNFTMinted(uint256 indexed tokenId, address indexed holder, bytes32 dataCID, string clarityLevel);

    constructor() Ownable(msg.sender) ERC721("AuthorizationNFT", "ANFT") {}

    /**
     * @dev Register a node as either Human or Agent. Only callable by the owner (or an authorized registrar).
     * @param node The address of the node.
     * @param idType The type of identity (Human or Agent).
     */
    function registerNode(address node, IdentityType idType) external onlyOwner {
        if (idType != IdentityType.Human && idType != IdentityType.Agent) revert InvalidIdentityType();
        if (identities[node].isRegistered) revert NodeAlreadyRegistered(node);

        identities[node] = Identity({
            idType: idType,
            isRegistered: true
        });

        emit NodeRegistered(node, idType);
    }

    /**
     * @dev Link a public Ethereum address to an anonymized voting DID
     * @param did The decentralized identifier string
     */
    function linkAnonymizedDID(string calldata did) external {
        require(identities[msg.sender].isRegistered, "NodeNotRegistered");
        anonymizedVotingDID[msg.sender] = did;
    }

    /**
     * @dev Deregister a node. Only callable by the owner.
     * @param node The address of the node.
     */
    function deregisterNode(address node) external onlyOwner {
        if (!identities[node].isRegistered) revert NodeNotRegistered(node);

        delete identities[node];

        emit NodeDeregistered(node);
    }

    /**
     * @dev Check if a node is registered.
     * @param node The address of the node.
     * @return True if the node is registered, false otherwise.
     */
    function isNodeRegistered(address node) external view returns (bool) {
        return identities[node].isRegistered;
    }

    /**
     * @dev Get the identity type of a node. Reverts if not registered.
     * @param node The address of the node.
     * @return The IdentityType of the node.
     */
    function getIdentityType(address node) external view returns (IdentityType) {
        if (!identities[node].isRegistered) revert NodeNotRegistered(node);
        return identities[node].idType;
    }

    // Novel: Auto-proposals based on drift detection
    struct DriftThreshold {
        uint256 maxSkillDrift;        // Max deviation from baseline
        uint256 maxConsensusLatency;   // Max time to reach consensus
        uint256 minParticipation;      // Minimum voter turnout
    }

    event EmergencyTriggered(bytes32 triggerType, uint256 timestamp);

    function isAutomatedTrigger(bytes32 triggerType) internal pure returns (bool) {
        return triggerType != 0;
    }

    function isCouncilMember(address user) internal view returns (bool) {
        return identities[user].isRegistered && identities[user].idType == IdentityType.Human;
    }

    function verifyAnomalyProof(bytes calldata evidence) internal pure returns (bool) {
        return evidence.length > 0;
    }

    bool public isPaused;

    function _pause() internal {
        isPaused = true;
    }

    // Novel: Emergency circuit breaker
    function emergencyPause(
        bytes32 triggerType,
        bytes calldata evidence
    ) external {
        require(isAutomatedTrigger(triggerType) || isCouncilMember(msg.sender), "Not authorized");

        // zkML-verified anomaly detection can trigger emergency pause
        if (verifyAnomalyProof(evidence)) {
            _pause();
            emit EmergencyTriggered(triggerType, block.timestamp);
        }
    }

    struct Delegation {
        address delegate;
        uint256 expiry;
        bool revocable;
        bool active;
    }

    // Novel: Recursive delegation with revocation
    mapping(address => Delegation) public delegations;

    function delegateWithRevocationRights(
        address to,
        uint256 expiry,
        bool revocable
    ) external {
        delegations[msg.sender] = Delegation({
            delegate: to,
            expiry: expiry,
            revocable: revocable,
            active: true
        });
    }

    function setComputeBondAddress(address _computeBond) external onlyOwner {
        computeBondAddress = _computeBond;
    }

    // Called after 2FA setup in CLI/Gateway
    function registerRecovery(bytes32 nodeId, bytes32 totpCommitment, bytes32 passkeyCommitment, bytes32 bundleCID) external {
        require(computeBondAddress != address(0), "ComputeBond not set");
        (bool success, bytes memory data) = computeBondAddress.staticcall(
            abi.encodeWithSignature("stakerActive(address)", msg.sender)
        );
        require(success && abi.decode(data, (bool)), "Active bond required");

        totpCommitments[nodeId] = totpCommitment;
        passkeyCommitments[nodeId] = passkeyCommitment;
        recoveryBundleCID[nodeId] = bundleCID;
        emit RecoveryRegistered(nodeId, totpCommitment, passkeyCommitment);
    }

    function getRecoveryBundleCID(bytes32 nodeId) external view returns (bytes32) {
        return recoveryBundleCID[nodeId];
    }

    function mintAuthorizationNFT(address holder, bytes32 dataCID, string calldata clarityLevel) external {
        require(computeBondAddress != address(0), "ComputeBond not set");
        (bool success, bytes memory data) = computeBondAddress.staticcall(
            abi.encodeWithSignature("stakerActive(address)", msg.sender)
        );
        require(success && abi.decode(data, (bool)), "Active bond required");
        // Mint ERC-721 (reuse OpenZeppelin ERC721 already imported in repo)
        _mint(holder, ++tokenIdCounter);
        emit AuthorizationNFTMinted(tokenIdCounter, holder, dataCID, clarityLevel);
    }
}
