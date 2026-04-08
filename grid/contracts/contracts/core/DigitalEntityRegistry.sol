// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";

contract DigitalEntityRegistry is Ownable {
    enum LegacyMode {
        PURGE,
        FOSSIL,
        SNAPSHOT,
        ASCENSION
    }

    struct DigitalEntity {
        address userWallet;
        bool exists;
        string shareableProfileHash; // IPFS hash or similar for the "story"
        LegacyMode legacyMode;
        bool kycStripped;
        bool daoProxyAuthorized;
    }

    mapping(address => DigitalEntity) public entities;

    event EntityRegistered(address indexed userWallet, LegacyMode mode);
    event ProfileUpdated(address indexed userWallet, string profileHash);
    event LegacyEntityPolicyUpdated(address indexed userWallet, LegacyMode mode, bool kycStripped, bool daoProxyAuthorized);

    constructor() Ownable(msg.sender) {}

    function registerEntity() external {
        require(!entities[msg.sender].exists, "Entity already exists");
        entities[msg.sender] = DigitalEntity(msg.sender, true, "", LegacyMode.FOSSIL, false, false);
        emit EntityRegistered(msg.sender, LegacyMode.FOSSIL);
    }

    function updateProfile(string calldata profileHash) external {
        require(entities[msg.sender].exists, "Entity does not exist");
        entities[msg.sender].shareableProfileHash = profileHash;
        emit ProfileUpdated(msg.sender, profileHash);
    }

    function setLegacyPolicy(LegacyMode mode, bool kycStripped, bool daoProxyAuthorized) external {
        require(entities[msg.sender].exists, "Entity does not exist");
        if (mode == LegacyMode.ASCENSION) {
            require(kycStripped, "Ascension requires KYC strip");
            require(daoProxyAuthorized, "Ascension requires DAO proxy");
        }

        DigitalEntity storage entity = entities[msg.sender];
        entity.legacyMode = mode;
        entity.kycStripped = kycStripped;
        entity.daoProxyAuthorized = daoProxyAuthorized;

        emit LegacyEntityPolicyUpdated(msg.sender, mode, kycStripped, daoProxyAuthorized);
    }
}
