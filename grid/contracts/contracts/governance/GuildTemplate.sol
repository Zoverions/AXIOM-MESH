// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title GuildTemplate
 * @dev Represents a hierarchical DAO structure where child guilds inherit policies from parent guilds.
 */
contract GuildTemplate is Ownable {
    address public parentGuild;
    mapping(bytes32 => uint256) public policies;

    event PolicySet(bytes32 indexed key, uint256 value);
    event ParentGuildSet(address indexed parent);

    constructor(address _initialOwner, address _parentGuild) Ownable(_initialOwner) {
        parentGuild = _parentGuild;
    }

    /**
     * @dev Sets a policy value for this guild.
     */
    function setPolicy(bytes32 key, uint256 value) external onlyOwner {
        policies[key] = value;
        emit PolicySet(key, value);
    }

    /**
     * @dev Updates the parent guild address.
     */
    function setParentGuild(address _parentGuild) external onlyOwner {
        parentGuild = _parentGuild;
        emit ParentGuildSet(_parentGuild);
    }

    /**
     * @dev Retrieves a policy value. If local is 0, defaults to parent's policy.
     */
    function getPolicy(bytes32 key) public view returns (uint256) {
        uint256 localPolicy = policies[key];
        if (localPolicy != 0) {
            return localPolicy;
        }

        if (parentGuild != address(0)) {
            // Forward call to parent
            return GuildTemplate(parentGuild).getPolicy(key);
        }

        return 0; // Default
    }
}
