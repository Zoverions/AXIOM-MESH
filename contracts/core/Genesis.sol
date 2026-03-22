// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import "../token/FounderNFT.sol";
import "../token/GenesisNFT.sol";
import "./FounderEntity.sol";
import "../token/AXM.sol";
import "../treasury/NetworkTreasury.sol";
import "../treasury/GuildTreasuryFactory.sol";

address constant FOUNDER = 0x1c2cBabF75e1938ED2f2c59e734e83aa5FBe1B73;

contract Genesis {
    address public immutable founder;
    address public immutable axmToken;
    address public immutable founderEntity;
    address public immutable mainTreasury;
    address public immutable guildFactory;

    constructor() {
        founder = FOUNDER;
        address guildF = address(new GuildTreasuryFactory());
        founderEntity = address(new FounderEntity(FOUNDER, guildF));
        mainTreasury = address(new NetworkTreasury(FOUNDER));
        axmToken = address(new AXM(founderEntity, mainTreasury));

        guildFactory = guildF;

        // Deploy NFTs
        new FounderNFT(FOUNDER);
        new GenesisNFT(msg.sender);

        // Grid ledger will record this deployment hash as canonical
    }
}