// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

// M12.10 DAO migration.
contract GovernanceTransition is Ownable {
    enum Phase { FounderControl, FoundersCouncil, Subcommittees, NationStateGuilds }
    bool public isMigrationComplete; // Flag tracking the end-state of the DAO transition

    Phase public currentPhase;
    address public activeController;

    event PhaseTransition(Phase fromPhase, Phase toPhase, address newController);

    modifier onlyController() {
        require(msg.sender == activeController, "GovernanceTransition: Unauthorized controller");
        _;
    }

    constructor(address _founder) Ownable(_founder) {
        currentPhase = Phase.FounderControl;
        activeController = _founder;
        emit PhaseTransition(Phase.FounderControl, Phase.FounderControl, _founder);
    }

    function transitionToFoundersCouncil(address councilAddress) external onlyController {
        require(currentPhase == Phase.FounderControl, "GovernanceTransition: Invalid phase transition");
        require(councilAddress != address(0), "GovernanceTransition: Invalid council address");

        currentPhase = Phase.FoundersCouncil;
        activeController = councilAddress;

        emit PhaseTransition(Phase.FounderControl, Phase.FoundersCouncil, councilAddress);
    }

    function transitionToSubcommittees(address subcommitteesAddress) external onlyController {
        require(currentPhase == Phase.FoundersCouncil, "GovernanceTransition: Invalid phase transition");
        require(subcommitteesAddress != address(0), "GovernanceTransition: Invalid subcommittees address");

        currentPhase = Phase.Subcommittees;
        activeController = subcommitteesAddress;

        emit PhaseTransition(Phase.FoundersCouncil, Phase.Subcommittees, subcommitteesAddress);
    }

    function transitionToNationStateGuilds(address guildsAddress) external onlyController {
        require(currentPhase == Phase.Subcommittees, "GovernanceTransition: Invalid phase transition");
        require(guildsAddress != address(0), "GovernanceTransition: Invalid guilds address");

        currentPhase = Phase.NationStateGuilds;
        activeController = guildsAddress;

        emit PhaseTransition(Phase.Subcommittees, Phase.NationStateGuilds, guildsAddress);
    }

    // Migration Treasury target (example mapping to transfer real assets on transition)
    address public treasury;

    function setTreasury(address _treasury) external onlyOwner {
        treasury = _treasury;
    }

    // M12.10 DAO migration finalization
    function completeMigration() external onlyController {
        require(currentPhase == Phase.NationStateGuilds, "GovernanceTransition: Must be in final phase");
        require(!isMigrationComplete, "GovernanceTransition: Migration already complete");

        isMigrationComplete = true;

        // Automatically transfer any remaining transition-owned ether to the final guild treasury.
        if (treasury != address(0) && address(this).balance > 0) {
            (bool success,) = payable(treasury).call{value: address(this).balance}("");
            require(success, "GovernanceTransition: Failed to migrate treasury");
        }

        // This locks the transition controller permanently. All future governance flows exclusively
        // through the decentralized Nation State Guilds contract.
        // We use the internal transfer function because onlyController might not be the owner.
        _transferOwnership(address(0));
    }

    receive() external payable {}
}
