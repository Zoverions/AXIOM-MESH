// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import "../token/FounderNFT.sol";
import "../token/GenesisNFT.sol";
import "./FounderEntity.sol";
import "../token/AXM.sol";
import "../treasury/NetworkTreasury.sol";
import "../treasury/GuildTreasuryFactory.sol";
import "./FounderMultiSig.sol";

address constant FOUNDER = 0x1c2cBabF75e1938ED2f2c59e734e83aa5FBe1B73;

// TODO ID: Top-Level To Do 8 - Mainnet Genesis + Bug Bounty
contract Genesis {
    address public immutable founder;
    address public immutable axmToken;
    address public immutable founderEntity;
    address public immutable mainTreasury;
    address public immutable ecosystemReserveTreasury;
    address public immutable guildFactory;

    constructor(address[] memory owners, uint numConfirmationsRequired) {

        // Deploy multi-sig wallet
        founder = address(new FounderMultiSig(owners, numConfirmationsRequired));

        address guildF = address(new GuildTreasuryFactory());
        founderEntity = address(new FounderEntity(founder, guildF));
        mainTreasury = address(new NetworkTreasury(founder));
        ecosystemReserveTreasury = address(new NetworkTreasury(founder));
        axmToken = address(new AXM(founderEntity, mainTreasury, ecosystemReserveTreasury));

        guildFactory = guildF;

        // Deploy NFTs to multi-sig founder
        new FounderNFT(founder);
        new GenesisNFT(msg.sender);

        // Grid ledger will record this deployment hash as canonical
    }
}
