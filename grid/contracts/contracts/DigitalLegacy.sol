// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "./CitizenshipNFT.sol";
import "./FounderCommitment.sol";

interface IUniversalConsentProtocol {
    function isAscensionEntity(address actor) external view returns (bool);
}

contract DigitalLegacy is Initializable, UUPSUpgradeable {
    enum LegacyMode {
        PURGE,
        FOSSIL,
        SNAPSHOT,
        ASCENSION
    }

    struct IntentTimelock {
        bytes32 encryptedIntentHash;
        uint64 unlockTimestamp;
        bytes32 oracleCondition;
        bool unlocked;
        address designatedBeneficiary;
    }

    CitizenshipNFT public immutable citizenship;
    FounderCommitment public immutable founder;

    uint256 public constant ORACLE_LIVENESS_TIMEOUT = 90 days;

    struct BeneficiaryAccess {
        bool enabled;
        uint8 relationshipWeight;
        uint16 queryLimit;
        uint16 queriesUsed;
        uint64 currentWindow;
    }

    struct Will {
        address sovereign;
        bytes32 tmaHash;
        bytes32 dataAccessHash; // zk-proof commitment of encrypted vault key material
        bool digitalEntityContinues;
        bool commercialExtractionLocked;
        bool expirationTriggered;
        bool expired;
        bool executed;
        uint64 lastLivenessPing;
        LegacyMode mode;
    }

    mapping(uint256 => Will) public wills; // tokenId => sovereign will envelope
    mapping(uint256 => mapping(address => BeneficiaryAccess)) public beneficiaryPolicies;
    mapping(uint256 => mapping(uint256 => IntentTimelock)) public intentTimelocks;
    mapping(uint256 => uint256) public intentTimelockCount;

    event EpistemicAnchorDefined(uint256 indexed tokenId, bytes32 indexed tmaHash);
    event BeneficiaryAccessSet(
        uint256 indexed tokenId,
        address indexed beneficiary,
        uint8 relationshipWeight,
        uint16 queryLimit
    );
    event CommercialExtractionLocked(uint256 indexed tokenId);
    event LivenessPinged(uint256 indexed tokenId, uint256 timestamp);
    event ExpirationOracleTriggered(uint256 indexed tokenId, uint256 timestamp);
    event StateTransitionExecuted(uint256 indexed tokenId);
    event LegacyExecuted(uint256 indexed tokenId);
    event HeuristicAdviceRequested(
        uint256 indexed tokenId,
        address indexed beneficiary,
        bytes32 indexed promptHash,
        uint16 usedInWindow,
        uint16 queryLimit
    );
    event EmergencyBurn(uint256 indexed tokenId, bytes32 burnReasonHash);
    event AscensionEntityDeploymentRequested(uint256 indexed tokenId, address indexed identity, address indexed wallet);
    event LegacyModeConfigured(uint256 indexed tokenId, LegacyMode mode);
    event IntentTimelockCreated(
        uint256 indexed tokenId,
        uint256 indexed intentId,
        bytes32 indexed encryptedIntentHash,
        uint64 unlockTimestamp,
        bytes32 oracleCondition,
        address beneficiary
    );
    event IntentUnlocked(
        uint256 indexed tokenId,
        uint256 indexed intentId,
        bytes32 indexed encryptedIntentHash,
        address beneficiary,
        uint256 timestamp
    );

    address public upgradeTimelock;
    address public universalConsentProtocol;

    constructor(address _citizenship, address _founder) {
        citizenship = CitizenshipNFT(_citizenship);
        founder = FounderCommitment(_founder);
        _disableInitializers();
    }

    function initialize() public initializer {}

    modifier onlySovereign(uint256 tokenId) {
        require(citizenship.ownerOf(tokenId) == msg.sender, "Only sovereign");
        _;
    }

    modifier activeWill(uint256 tokenId) {
        require(!wills[tokenId].expired, "Will is expired");
        require(!wills[tokenId].executed, "Will already executed");
        _;
    }

    function setUniversalConsentProtocol(address _universalConsentProtocol) external {
        require(msg.sender == upgradeTimelock || founder.verifyFounder(""), "Unauthorized");
        universalConsentProtocol = _universalConsentProtocol;
    }

    function setUpgradeTimelock(address _timelock) external {
        if (upgradeTimelock == address(0)) {
            require(founder.verifyFounder(""), "Founder verification failed");
        } else {
            require(msg.sender == upgradeTimelock, "Unauthorized: not upgrade timelock");
        }
        upgradeTimelock = _timelock;
    }

    /// @notice Initializes/updates sovereign envelope and an optional vault-key commitment.
    /// @dev Maintained for backward compatibility with earlier API naming.
    function notarizeWill(
        uint256 tokenId,
        address[] calldata heirs,
        bytes32 dataAccessHash,
        bool continueEntity
    ) external onlySovereign(tokenId) activeWill(tokenId) {
        Will storage w = wills[tokenId];
        if (w.sovereign == address(0)) {
            w.sovereign = msg.sender;
            w.lastLivenessPing = uint64(block.timestamp);
            w.mode = continueEntity ? LegacyMode.ASCENSION : LegacyMode.SNAPSHOT;
        }

        for (uint256 i = 0; i < heirs.length; i++) {
            if (!beneficiaryPolicies[tokenId][heirs[i]].enabled) {
                beneficiaryPolicies[tokenId][heirs[i]].enabled = true;
            }
        }

        w.dataAccessHash = dataAccessHash;
        w.digitalEntityContinues = continueEntity;
    }

    function setLegacyMode(uint256 tokenId, LegacyMode mode) external onlySovereign(tokenId) activeWill(tokenId) {
        Will storage w = wills[tokenId];
        if (w.sovereign == address(0)) {
            w.sovereign = msg.sender;
            w.lastLivenessPing = uint64(block.timestamp);
        }

        w.mode = mode;
        w.digitalEntityContinues = mode == LegacyMode.ASCENSION;

        if (mode == LegacyMode.PURGE) {
            w.tmaHash = bytes32(0);
            w.dataAccessHash = bytes32(0);
        }

        emit LegacyModeConfigured(tokenId, mode);
    }

    function getLegacyMode(uint256 tokenId) external view returns (LegacyMode) {
        Will storage w = wills[tokenId];
        if (w.sovereign == address(0)) {
            return LegacyMode.PURGE;
        }
        return w.mode;
    }

    function createIntentTimelock(
        uint256 tokenId,
        bytes32 encryptedIntentHash,
        uint64 unlockTimestamp,
        bytes32 oracleCondition,
        address beneficiary
    ) external onlySovereign(tokenId) activeWill(tokenId) returns (uint256 intentId) {
        require(encryptedIntentHash != bytes32(0), "Invalid intent hash");
        require(beneficiary != address(0), "Invalid beneficiary");
        require(unlockTimestamp > block.timestamp || oracleCondition != bytes32(0), "Invalid unlock condition");

        intentId = intentTimelockCount[tokenId];
        intentTimelockCount[tokenId] = intentId + 1;
        intentTimelocks[tokenId][intentId] = IntentTimelock({
            encryptedIntentHash: encryptedIntentHash,
            unlockTimestamp: unlockTimestamp,
            oracleCondition: oracleCondition,
            unlocked: false,
            designatedBeneficiary: beneficiary
        });

        emit IntentTimelockCreated(tokenId, intentId, encryptedIntentHash, unlockTimestamp, oracleCondition, beneficiary);
    }

    function unlockIntent(
        uint256 tokenId,
        uint256 intentId,
        bytes32 oracleConditionProof
    ) external returns (bytes32 unlockedHash) {
        Will storage w = wills[tokenId];
        require(w.expired, "Legacy not active");
        require(w.mode == LegacyMode.SNAPSHOT || w.mode == LegacyMode.ASCENSION, "Mode does not support intents");

        IntentTimelock storage intent = intentTimelocks[tokenId][intentId];
        require(intent.encryptedIntentHash != bytes32(0), "Intent not found");
        require(!intent.unlocked, "Intent already unlocked");

        bool timeConditionMet = intent.unlockTimestamp != 0 && block.timestamp >= intent.unlockTimestamp;
        bool oracleConditionMet = intent.oracleCondition != bytes32(0) && intent.oracleCondition == oracleConditionProof;
        require(timeConditionMet || oracleConditionMet, "Unlock condition unmet");

        intent.unlocked = true;
        unlockedHash = intent.encryptedIntentHash;

        emit IntentUnlocked(tokenId, intentId, unlockedHash, intent.designatedBeneficiary, block.timestamp);
    }

    /// @notice Sets the canonical epistemic anchor for the Shadow Node.
    function defineEpistemicAnchor(uint256 tokenId, bytes32 tmaHash)
        external
        onlySovereign(tokenId)
        activeWill(tokenId)
    {
        require(tmaHash != bytes32(0), "Invalid tmaHash");
        Will storage w = wills[tokenId];
        if (w.sovereign == address(0)) {
            w.sovereign = msg.sender;
            w.lastLivenessPing = uint64(block.timestamp);
        }
        w.tmaHash = tmaHash;
        emit EpistemicAnchorDefined(tokenId, tmaHash);
    }

    /// @notice Defines beneficiary-specific context depth + rate limits.
    function setBeneficiaryAccess(
        uint256 tokenId,
        address beneficiary,
        uint8 relationshipWeight,
        uint16 queryLimit
    ) external onlySovereign(tokenId) activeWill(tokenId) {
        require(beneficiary != address(0), "Invalid beneficiary");
        require(queryLimit > 0, "Query limit must be > 0");

        BeneficiaryAccess storage policy = beneficiaryPolicies[tokenId][beneficiary];
        policy.enabled = true;
        policy.relationshipWeight = relationshipWeight;
        policy.queryLimit = queryLimit;

        emit BeneficiaryAccessSet(tokenId, beneficiary, relationshipWeight, queryLimit);
    }

    /// @notice Heartbeat proving sovereign intent is still live.
    function pingLiveness(uint256 tokenId) external onlySovereign(tokenId) activeWill(tokenId) {
        Will storage w = wills[tokenId];
        if (w.sovereign == address(0)) {
            w.sovereign = msg.sender;
        }
        w.lastLivenessPing = uint64(block.timestamp);
        emit LivenessPinged(tokenId, block.timestamp);
    }

    /// @notice Permanently disables extraction-oriented flows before expiration.
    function lockCommercialExtraction(uint256 tokenId) external onlySovereign(tokenId) activeWill(tokenId) {
        Will storage w = wills[tokenId];
        w.commercialExtractionLocked = true;
        emit CommercialExtractionLocked(tokenId);
    }

    /// @notice Oracle/dead-man switch marks expiration intent.
    function triggerExpirationOracle(uint256 tokenId) external {
        Will storage w = wills[tokenId];
        require(!w.expired, "Already expired");

        bool oracleCondition = citizenship.isRevoked(tokenId);
        bool timeoutCondition =
            w.lastLivenessPing != 0 && block.timestamp >= uint256(w.lastLivenessPing) + ORACLE_LIVENESS_TIMEOUT;

        require(oracleCondition || timeoutCondition, "Expiration not verified");

        w.expirationTriggered = true;
        emit ExpirationOracleTriggered(tokenId, block.timestamp);
    }

    /// @notice Final, irreversible transition to read-only Shadow Node state.
    function executeStateTransition(uint256 tokenId) external {
        Will storage w = wills[tokenId];
        require(w.expirationTriggered, "Oracle not triggered");
        require(!w.expired, "Already transitioned");

        w.expired = true;
        w.executed = true;

        if (w.mode == LegacyMode.PURGE) {
            w.tmaHash = bytes32(0);
            w.dataAccessHash = bytes32(0);
            w.digitalEntityContinues = false;
        }

        if (w.mode == LegacyMode.ASCENSION && w.sovereign != address(0) && citizenshipNFTToWallet(tokenId) != address(0)) {
            deployAscensionEntity(tokenId, w.sovereign, citizenshipNFTToWallet(tokenId));
        }

        emit StateTransitionExecuted(tokenId);
        emit LegacyExecuted(tokenId);
    }

    /// @notice Backward-compatible alias now routed through state-transition flow.
    function executeLegacy(uint256 tokenId) external {
        if (!wills[tokenId].expirationTriggered) {
            triggerExpirationOracle(tokenId);
        }
        executeStateTransition(tokenId);
    }

    /// @notice Entrypoint for beneficiary read-only heuristic requests post-expiration.
    function requestHeuristicAdvice(uint256 tokenId, address beneficiary, bytes calldata prompt)
        external
        returns (bytes32 requestId)
    {
        require(wills[tokenId].expired, "Shadow not active");
        require(wills[tokenId].mode == LegacyMode.SNAPSHOT, "Only snapshot mode supports bounded advice");
        require(msg.sender == beneficiary, "Signature/beneficiary mismatch");

        BeneficiaryAccess storage policy = beneficiaryPolicies[tokenId][beneficiary];
        require(policy.enabled, "Beneficiary not authorized");

        uint64 window = uint64(block.timestamp / 30 days);
        if (policy.currentWindow != window) {
            policy.currentWindow = window;
            policy.queriesUsed = 0;
        }

        require(policy.queriesUsed < policy.queryLimit, "Monthly query limit reached");
        policy.queriesUsed += 1;

        bytes32 promptHash = keccak256(prompt);
        requestId = keccak256(abi.encodePacked(tokenId, beneficiary, promptHash, block.number));

        emit HeuristicAdviceRequested(tokenId, beneficiary, promptHash, policy.queriesUsed, policy.queryLimit);
    }

    /// @notice Requests post-biological ascension deployment after oracle-verified expiration.
    function deployAscensionEntity(uint256 tokenId, address identity, address nodeWallet) public {
        Will storage w = wills[tokenId];
        require(w.expired, "Legacy not yet expired");
        require(w.mode == LegacyMode.ASCENSION, "Legacy mode is not ascension");
        require(w.digitalEntityContinues, "Digital continuation disabled");
        require(identity != address(0) && nodeWallet != address(0), "Invalid ascension addresses");
        require(universalConsentProtocol != address(0), "Consent protocol not configured");

        bool consented = IUniversalConsentProtocol(universalConsentProtocol).isAscensionEntity(identity);
        require(consented, "Ascension consent missing");

        emit AscensionEntityDeploymentRequested(tokenId, identity, nodeWallet);
    }

    /// @notice Catastrophic anti-commodification safeguard.
    function emergencyBurn(uint256 tokenId, bytes32 burnReasonHash) external {
        Will storage w = wills[tokenId];
        require(
            msg.sender == upgradeTimelock || msg.sender == w.sovereign,
            "Unauthorized burn caller"
        );
        require(!w.executed || w.tmaHash != bytes32(0), "Nothing to burn");

        w.tmaHash = bytes32(0);
        w.dataAccessHash = bytes32(0);
        w.digitalEntityContinues = false;
        w.mode = LegacyMode.PURGE;
        w.executed = true;

        emit EmergencyBurn(tokenId, burnReasonHash);
    }

    function citizenshipNFTToWallet(uint256 tokenId) internal view returns (address) {
        return citizenship.ownerOf(tokenId);
    }

    function _authorizeUpgrade(address) internal override {
        require(msg.sender == upgradeTimelock, "Unauthorized: not upgrade timelock");
    }
}
