// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import "./NetworkTreasury.sol";

contract GuildTreasuryFactory {
    mapping(string => address) public guilds;

    event GuildCreated(string name, address guildAddress);

    function createGuild(string calldata name) external returns (address) {
        address newGuild = address(new NetworkTreasury(msg.sender));
        guilds[name] = newGuild;
        emit GuildCreated(name, newGuild);
        return newGuild;
    }
}