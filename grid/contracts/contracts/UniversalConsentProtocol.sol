// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract UniversalConsentProtocol {
    struct ConsentProfile {
        bool consent;
        bool isFossilNodeOnly;
        bool isAscensionEntity;
    }

    mapping(address => ConsentProfile) public profiles;

    event ConsentUpdated(address indexed actor, bool enabled, bool isFossilNodeOnly, bool isAscensionEntity);

    function setConsent(bool enabled) external {
        ConsentProfile storage profile = profiles[msg.sender];
        profile.consent = enabled;
        emit ConsentUpdated(msg.sender, profile.consent, profile.isFossilNodeOnly, profile.isAscensionEntity);
    }

    function setPostBiologicalMode(bool fossilNodeOnly, bool ascensionEntity) external {
        require(!(fossilNodeOnly && ascensionEntity), "Mode conflict");
        ConsentProfile storage profile = profiles[msg.sender];
        profile.isFossilNodeOnly = fossilNodeOnly;
        profile.isAscensionEntity = ascensionEntity;
        emit ConsentUpdated(msg.sender, profile.consent, profile.isFossilNodeOnly, profile.isAscensionEntity);
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
}
