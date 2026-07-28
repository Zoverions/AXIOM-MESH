// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;
import "@openzeppelin/contracts/access/Ownable.sol";
import "../treasury/GuildTreasuryFactory.sol";

/**
 * @custom:deprecated Replaced by GenesisDecayGovernance in v3.0.
 */
contract FounderEntity is Ownable {
    uint256 public constant MAX_RESOURCE_PERCENT = 5;
    address public immutable guildFactory;

    event AgentRegistered(address agent, string purpose);
    event ResourcesClaimed(uint256 percent);

    constructor(address initialOwner, address _guildFactory) Ownable(initialOwner) {
        guildFactory = _guildFactory;
    }

    function registerAgent(address agent, string calldata purpose) external onlyOwner {
        emit AgentRegistered(agent, purpose);
    }

    function claimResources(uint256 percent) external onlyOwner {
        require(percent <= MAX_RESOURCE_PERCENT, "Max 5%");
        emit ResourcesClaimed(percent);
    }

    function createGuild(string calldata name) external onlyOwner {
        GuildTreasuryFactory(guildFactory).createGuild(name);
    }
}