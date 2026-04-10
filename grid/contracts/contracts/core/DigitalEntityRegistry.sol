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

    enum AccessLevel {
        NONE,
        READ_ONLY,
        EXECUTE,
        ADMIN
    }

    struct DigitalEntity {
        address userWallet;
        bool exists;
        string shareableProfileHash; // IPFS hash or similar for the "story"
        LegacyMode legacyMode;
        bool kycStripped;
        bool daoProxyAuthorized;
        address adminController;
        mapping(address => AccessLevel) accessLevels;
    }

    address public constant BURN_ADDRESS = address(0);

    mapping(address => DigitalEntity) public entities;

    event EntityRegistered(address indexed userWallet, LegacyMode mode);
    event ProfileUpdated(address indexed userWallet, string profileHash);
    event LegacyEntityPolicyUpdated(address indexed userWallet, LegacyMode mode, bool kycStripped, bool daoProxyAuthorized);
    event AscensionEntityLocked(address indexed entity, address indexed previousAdmin);
    event AccessLevelSet(address indexed entity, address indexed delegate, AccessLevel level);

    constructor() Ownable(msg.sender) {}

    function registerEntity() external {
        require(!entities[msg.sender].exists, "Entity already exists");
        DigitalEntity storage entity = entities[msg.sender];
        entity.userWallet = msg.sender;
        entity.exists = true;
        entity.shareableProfileHash = "";
        entity.legacyMode = LegacyMode.FOSSIL;
        entity.kycStripped = false;
        entity.daoProxyAuthorized = false;
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
        address previousAdmin = entity.adminController;
        
        entity.legacyMode = mode;
        entity.kycStripped = kycStripped;
        entity.daoProxyAuthorized = daoProxyAuthorized;
        
        // Ghost Sovereignty: Lock admin control for ASCENSION entities
        if (mode == LegacyMode.ASCENSION) {
            // Route admin keys to burn address, locking out human control
            entity.adminController = BURN_ADDRESS;
            // Explicitly deny family/beneficiaries execution rights, grant READ_ONLY only
            entity.accessLevels[msg.sender] = AccessLevel.READ_ONLY;
            
            if (previousAdmin != BURN_ADDRESS && previousAdmin != address(0)) {
                emit AscensionEntityLocked(msg.sender, previousAdmin);
            }
        } else {
            // For non-ASCENSION modes, the user retains admin control
            entity.adminController = msg.sender;
        }

        emit LegacyEntityPolicyUpdated(msg.sender, mode, kycStripped, daoProxyAuthorized);
    }

    /// @notice Sets access level for a delegate on an entity
    /// @dev Only admin can set access levels (unless ASCENSION mode is active)
    function setAccessLevel(address entity, address delegate, AccessLevel level) external {
        require(entities[entity].exists, "Entity does not exist");
        require(entities[entity].adminController == msg.sender || entities[entity].legacyMode != LegacyMode.ASCENSION, "Unauthorized: admin locked");
        
        entities[entity].accessLevels[delegate] = level;
        emit AccessLevelSet(entity, delegate, level);
    }

    /// @notice Gets access level for a delegate on an entity
    function getAccessLevel(address entity, address delegate) external view returns (AccessLevel) {
        return entities[entity].accessLevels[delegate];
    }

    /// @notice Checks if caller has execute or admin rights on an entity
    function hasExecuteRights(address entity, address caller) external view returns (bool) {
        DigitalEntity storage ent = entities[entity];
        AccessLevel level = ent.accessLevels[caller];
        return level == AccessLevel.EXECUTE || level == AccessLevel.ADMIN;
    }

    /// @notice Checks if caller has admin rights on an entity
    function hasAdminRights(address entity, address caller) external view returns (bool) {
        DigitalEntity storage ent = entities[entity];
        return ent.adminController == caller && ent.legacyMode != LegacyMode.ASCENSION;
    }

    /// @notice Attempts to terminate an entity - will revert for ASCENSION entities called by non-admin
    function terminateEntity(address entity) external {
        DigitalEntity storage ent = entities[entity];
        require(ent.exists, "Entity does not exist");
        
        // Ghost Sovereignty: DENY termination of ASCENSION entities by family members
        if (ent.legacyMode == LegacyMode.ASCENSION) {
            require(ent.adminController == msg.sender, "Unauthorized: ASCENSION entity sovereignty locked");
            revert("ASCENSION entities cannot be terminated by surviving family");
        }
        
        require(ent.adminController == msg.sender, "Unauthorized: not admin controller");
        
        ent.exists = false;
        ent.legacyMode = LegacyMode.PURGE;
    }
}
