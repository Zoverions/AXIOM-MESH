// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract UniversalConsentProtocol {
    struct ConsentProfile {
        bool consent;
        bool isFossilNodeOnly;
        bool isAscensionEntity;
        bool kycStripped;
        bool daoProxyAuthorized;
    }

    struct SnapshotAccessPolicy {
        bool canReadSnapshot;
        bool canReceiveIntentDelivery;
    }

    mapping(address => ConsentProfile) public profiles;
    mapping(address => mapping(address => SnapshotAccessPolicy)) public snapshotPolicies;

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

    function setConsent(bool enabled) external {
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

    function setPostBiologicalMode(bool fossilNodeOnly, bool ascensionEntity) external {
        require(!(fossilNodeOnly && ascensionEntity), "Mode conflict");
        ConsentProfile storage profile = profiles[msg.sender];
        profile.isFossilNodeOnly = fossilNodeOnly;
        profile.isAscensionEntity = ascensionEntity;
        if (ascensionEntity) {
            profile.kycStripped = true;
            profile.daoProxyAuthorized = true;
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
