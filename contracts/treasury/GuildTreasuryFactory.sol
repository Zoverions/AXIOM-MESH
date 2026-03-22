// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import "./NetworkTreasury.sol";

contract GuildTreasuryFactory {
    function createGuild(string calldata name) external returns (address) {
        return address(new NetworkTreasury());
    }
}