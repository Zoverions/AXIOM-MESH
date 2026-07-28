// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import "../token/FounderNFT.sol";
import "../token/GenesisNFT.sol";
import "../token/BootstrapInitiatorNFT.sol";
import "../finance/BootstrapIncentive.sol";
import "../finance/TeamVesting.sol";
import "../governance/GenesisDecayGovernance.sol";
import "../governance/ProposalRegistry.sol";
import "../token/AXM.sol";
import "../treasury/NetworkTreasury.sol";
import "../treasury/GuildTreasuryFactory.sol";

// TODO ID: Top-Level To Do 8 - Mainnet Genesis + Bug Bounty
contract Genesis {
    address public immutable founder;
    address public immutable axmToken;
    address public immutable governance;
    address public immutable proposalRegistry;
    address public immutable mainTreasury;
    address public immutable ecosystemReserveTreasury;
    address public immutable guildFactory;
    address public immutable bootstrapNFT;
    address public immutable bootstrapIncentive;

    constructor(address[] memory owners, uint256 halfLifeBlocks, uint256 initialFounderCoefficient) {
        // Enforce the hardcoded founder address to match the specified address
        founder = 0x1c2cBabF75e1938ED2f2c59e734e83aa5FBe1B73;

        uint64 start = uint64(block.timestamp);
        uint64 duration = 1460 days; // 4 years

        address guildF = address(new GuildTreasuryFactory());
        mainTreasury = address(new NetworkTreasury(founder));
        ecosystemReserveTreasury = address(new NetworkTreasury(founder));

        address founderVesting = address(new TeamVesting(founder, start, duration));
        address treasuryVesting = address(new TeamVesting(mainTreasury, start, duration));

        axmToken = address(new AXM(founderVesting, treasuryVesting, ecosystemReserveTreasury));

        governance = address(new GenesisDecayGovernance(halfLifeBlocks, initialFounderCoefficient, owners));
        proposalRegistry = address(new ProposalRegistry(governance));

        guildFactory = guildF;

        // Deploy Bootstrap Incentive system
        BootstrapInitiatorNFT bint = new BootstrapInitiatorNFT();
        BootstrapIncentive bincentive = new BootstrapIncentive(address(bint), payable(mainTreasury));
        bint.transferOwnership(address(bincentive));
        bincentive.transferOwnership(founder);

        bootstrapNFT = address(bint);
        bootstrapIncentive = address(bincentive);

        // Deploy NFTs to multi-sig founder
        new FounderNFT(founder);
        new GenesisNFT(msg.sender);

        // Grid ledger will record this deployment hash as canonical
    }
}
