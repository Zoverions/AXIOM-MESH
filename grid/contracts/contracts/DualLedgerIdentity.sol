// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";

interface IZKMLVerifier {
    function verifyProof(bytes32 proofHash, uint256[2] calldata a, uint256[2][2] calldata b, uint256[2] calldata c) external returns (bool);
}

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
    address public zkmlVerifierAddress;

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

    DriftThreshold public currentThresholds;
    uint256 public currentConsensusLatency;
    uint256 public currentSkillDrift;

    event EmergencyTriggered(bytes32 triggerType, uint256 timestamp);
    event DriftThresholdsUpdated(uint256 maxSkillDrift, uint256 maxConsensusLatency, uint256 minParticipation);
    event DriftReported(uint256 skillDrift, uint256 consensusLatency);

    function updateDriftThresholds(
        uint256 _maxSkillDrift,
        uint256 _maxConsensusLatency,
        uint256 _minParticipation
    ) external onlyOwner {
        currentThresholds = DriftThreshold({
            maxSkillDrift: _maxSkillDrift,
            maxConsensusLatency: _maxConsensusLatency,
            minParticipation: _minParticipation
        });
        emit DriftThresholdsUpdated(_maxSkillDrift, _maxConsensusLatency, _minParticipation);
    }

    function reportDrift(uint256 _skillDrift, uint256 _consensusLatency) external {
        require(identities[msg.sender].isRegistered, "NodeNotRegistered");
        currentSkillDrift = _skillDrift;
        currentConsensusLatency = _consensusLatency;

        emit DriftReported(_skillDrift, _consensusLatency);

        // Auto-pause if drift thresholds exceeded
        if (
            (currentThresholds.maxConsensusLatency > 0 && _consensusLatency > currentThresholds.maxConsensusLatency) ||
            (currentThresholds.maxSkillDrift > 0 && _skillDrift > currentThresholds.maxSkillDrift)
        ) {
            _pause();
            emit EmergencyTriggered(bytes32("AUTO_DRIFT_EXCEEDED"), block.timestamp);
        }
    }

    function isAutomatedTrigger(bytes32 triggerType) internal pure returns (bool) {
        return triggerType != 0;
    }

    function isCouncilMember(address user) internal view returns (bool) {
        return identities[user].isRegistered && identities[user].idType == IdentityType.Human;
    }

    bool public isPaused;

    function _pause() internal {
        isPaused = true;
    }

    // Novel: Emergency circuit breaker
    function emergencyPause(
        bytes32 triggerType,
        uint256[2] calldata a,
        uint256[2][2] calldata b,
        uint256[2] calldata c,
        bytes32 proofHash
    ) external {
        require(isAutomatedTrigger(triggerType) || isCouncilMember(msg.sender), "Not authorized");
        require(zkmlVerifierAddress != address(0), "ZKML verifier not set");

        // zkML-verified anomaly detection triggers emergency pause
        bool isValidProof = IZKMLVerifier(zkmlVerifierAddress).verifyProof(proofHash, a, b, c);
        if (isValidProof) {
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

    function setZkmlVerifierAddress(address _verifier) external onlyOwner {
        zkmlVerifierAddress = _verifier;
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
