// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

contract GovernanceTransition is Ownable {
    enum Phase { FounderControl, FoundersCouncil, Subcommittees, NationStateGuilds }

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
}
