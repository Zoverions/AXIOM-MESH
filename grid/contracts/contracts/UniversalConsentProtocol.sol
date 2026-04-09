// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract UniversalConsentProtocol {
    enum LegacyMode {
        PURGE,
        FOSSIL,
        SNAPSHOT,
        ASCENSION
    }

    struct ConsentProfile {
        bool consent;
        bool isFossilNodeOnly;
        bool isAscensionEntity;
        bool kycStripped;
        bool daoProxyAuthorized;
        LegacyMode currentMode;
    }

    struct SnapshotConfig {
        uint64 lastSignedTimestamp;
        uint64 decayPeriod;
        bool active;
    }

    struct SnapshotAccessPolicy {
        bool canReadSnapshot;
        bool canReceiveIntentDelivery;
    }

    mapping(address => ConsentProfile) public profiles;
    mapping(address => SnapshotConfig) public snapshotConfigs;
    mapping(address => mapping(address => SnapshotAccessPolicy)) public snapshotPolicies;

    uint64 public constant DEFAULT_DECAY_PERIOD = 90 days;

    event ConsentUpdated(
        address indexed actor,
        bool enabled,
        bool isFossilNodeOnly,
        bool isAscensionEntity,
        bool kycStripped,
        bool daoProxyAuthorized
    );
    event SnapshotAccessUpdated(
        address indexed sovereign,
        address indexed beneficiary,
        bool canReadSnapshot,
        bool canReceiveIntentDelivery
    );
    event SnapshotConfigured(
        address indexed actor,
        uint64 lastSignedTimestamp,
        uint64 decayPeriod
    );
    event StateDecayTriggered(
        address indexed actor,
        LegacyMode previousMode,
        LegacyMode newMode
    );

    modifier checkStateDecay(address actor) {
        SnapshotConfig storage config = snapshotConfigs[actor];
        ConsentProfile storage profile = profiles[actor];
        
        if (config.active && 
            profile.currentMode == LegacyMode.SNAPSHOT && 
            block.timestamp > config.lastSignedTimestamp + config.decayPeriod) {
            // Automatic downgrade from SNAPSHOT to FOSSIL due to state decay
            LegacyMode previousMode = profile.currentMode;
            profile.currentMode = LegacyMode.FOSSIL;
            config.active = false;
            emit StateDecayTriggered(actor, previousMode, LegacyMode.FOSSIL);
        }
        _;
    }

    function setConsent(bool enabled) external checkStateDecay(msg.sender) {
        ConsentProfile storage profile = profiles[msg.sender];
        profile.consent = enabled;
        emit ConsentUpdated(
            msg.sender,
            profile.consent,
            profile.isFossilNodeOnly,
            profile.isAscensionEntity,
            profile.kycStripped,
            profile.daoProxyAuthorized
        );
    }

    function setPostBiologicalMode(bool fossilNodeOnly, bool ascensionEntity) external checkStateDecay(msg.sender) {
        require(!(fossilNodeOnly && ascensionEntity), "Mode conflict");
        ConsentProfile storage profile = profiles[msg.sender];
        profile.isFossilNodeOnly = fossilNodeOnly;
        profile.isAscensionEntity = ascensionEntity;
        if (ascensionEntity) {
            profile.kycStripped = true;
            profile.daoProxyAuthorized = true;
            profile.currentMode = LegacyMode.ASCENSION;
        } else if (fossilNodeOnly) {
            profile.currentMode = LegacyMode.FOSSIL;
        }
        emit ConsentUpdated(
            msg.sender,
            profile.consent,
            profile.isFossilNodeOnly,
            profile.isAscensionEntity,
            profile.kycStripped,
            profile.daoProxyAuthorized
        );
    }

    function configureSnapshot(uint64 decayPeriod) external checkStateDecay(msg.sender) {
        require(decayPeriod > 0, "Decay period must be > 0");
        ConsentProfile storage profile = profiles[msg.sender];
        require(profile.currentMode == LegacyMode.SNAPSHOT, "Only SNAPSHOT mode can configure decay");
        
        SnapshotConfig storage config = snapshotConfigs[msg.sender];
        config.lastSignedTimestamp = uint64(block.timestamp);
        config.decayPeriod = decayPeriod > 0 ? decayPeriod : DEFAULT_DECAY_PERIOD;
        config.active = true;
        
        emit SnapshotConfigured(msg.sender, config.lastSignedTimestamp, config.decayPeriod);
    }

    function renewSnapshotIntent() external checkStateDecay(msg.sender) {
        ConsentProfile storage profile = profiles[msg.sender];
        require(profile.currentMode == LegacyMode.SNAPSHOT, "Only SNAPSHOT mode can renew");
        
        SnapshotConfig storage config = snapshotConfigs[msg.sender];
        config.lastSignedTimestamp = uint64(block.timestamp);
        config.active = true;
        
        emit SnapshotConfigured(msg.sender, config.lastSignedTimestamp, config.decayPeriod);
    }

    function getCurrentMode(address actor) external view returns (LegacyMode) {
        return profiles[actor].currentMode;
    }

    function getSnapshotConfig(address actor) external view returns (uint64 lastSigned, uint64 decay, bool active) {
        SnapshotConfig storage config = snapshotConfigs[actor];
        return (config.lastSignedTimestamp, config.decayPeriod, config.active);
    }

    function setSnapshotBeneficiaryAccess(
        address beneficiary,
        bool canReadSnapshot,
        bool canReceiveIntentDelivery
    ) external {
        require(beneficiary != address(0), "Invalid beneficiary");
        snapshotPolicies[msg.sender][beneficiary] = SnapshotAccessPolicy({
            canReadSnapshot: canReadSnapshot,
            canReceiveIntentDelivery: canReceiveIntentDelivery
        });
        emit SnapshotAccessUpdated(msg.sender, beneficiary, canReadSnapshot, canReceiveIntentDelivery);
    }

    function consent(address actor) external view returns (bool) {
        return profiles[actor].consent;
    }

    function isFossilNodeOnly(address actor) external view returns (bool) {
        return profiles[actor].isFossilNodeOnly;
    }

    function isAscensionEntity(address actor) external view returns (bool) {
        return profiles[actor].isAscensionEntity;
    }

    function hasSnapshotReadAccess(address sovereign, address beneficiary) external view returns (bool) {
        return snapshotPolicies[sovereign][beneficiary].canReadSnapshot;
    }

    function canReceiveIntentDelivery(address sovereign, address beneficiary) external view returns (bool) {
        return snapshotPolicies[sovereign][beneficiary].canReceiveIntentDelivery;
    }

    function isKYCStripped(address actor) external view returns (bool) {
        return profiles[actor].kycStripped;
    }

    function hasDAOProxyRights(address actor) external view returns (bool) {
        return profiles[actor].daoProxyAuthorized;
    }
}
