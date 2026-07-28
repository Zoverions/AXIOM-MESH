// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import "./NetworkTreasury.sol";

contract GuildTreasuryFactory {
    mapping(string => address) public guilds;
    mapping(string => address) public guildGovernance;
    mapping(string => address) public guildCreator;

    event GuildCreated(string name, address guildAddress);
    event GuildGovernanceSet(string name, address governanceAddress);

    function createGuild(string calldata name) external returns (address) {
        require(guilds[name] == address(0), "Guild already exists");
        address newGuild = address(new NetworkTreasury(msg.sender));
        guilds[name] = newGuild;
        guildCreator[name] = msg.sender;
        emit GuildCreated(name, newGuild);
        return newGuild;
    }

    function setGuildGovernance(string calldata name, address governanceAddress) external {
        require(guilds[name] != address(0), "Guild does not exist");
        require(msg.sender == guildCreator[name], "Unauthorized");
        // Simple setting for governance to map the country representation
        guildGovernance[name] = governanceAddress;
        emit GuildGovernanceSet(name, governanceAddress);
    }
}