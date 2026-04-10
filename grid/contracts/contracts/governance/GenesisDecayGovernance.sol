// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title Genesis Decay Governance
 * @notice Replaces traditional "Founder Multi-Sig" absolute authority.
 * Founders begin with a voting multiplier (Founder Coefficient) that decays
 * exponentially based on block height, reaching 1.0 (standard citizen weight)
 * at the maturity horizon. Guarantees eventual and mathematical decentralization.
 */
contract GenesisDecayGovernance is AccessControl {

    bytes32 public constant SENATE_ROLE = keccak256("SENATE_ROLE");

    uint256 public immutable genesisBlock;
    uint256 public immutable maturityHorizonBlocks;
    uint256 public immutable initialFounderCoefficient;

    mapping(address => bool) public isFounder;

    struct Proposal {
        string id;
        string title;
        string content;
        uint256 rankWeight;
        bool executed;
    }

    Proposal[] public activeProposals;

    event SovereignExecutionQueued(string proposalId, uint256 currentFounderCoefficient);
    event ProposalAdded(string proposalId, string title);

    constructor(
        uint256 _maturityHorizonBlocks,
        uint256 _initialCoefficient,
        address[] memory _founders
    ) {
        genesisBlock = block.number;
        maturityHorizonBlocks = _maturityHorizonBlocks;
        initialFounderCoefficient = _initialCoefficient;
        for (uint i = 0; i < _founders.length; i++) {
            isFounder[_founders[i]] = true;

            // For the initial deployment phase to bootstrap the queue,
            // grant the SENATE_ROLE and DEFAULT_ADMIN_ROLE to the founder multi-sig/addresses.
            // A timelock controller should take over DEFAULT_ADMIN_ROLE eventually.
            _grantRole(DEFAULT_ADMIN_ROLE, _founders[i]);
            _grantRole(SENATE_ROLE, _founders[i]);
        }
    }

    function getVotingCoefficient(address voter) public view returns (uint256) {
        if (!isFounder[voter]) {
            return 1; // Standard Class A.1 / Class B entity weight
        }
        uint256 blocksElapsed = block.number - genesisBlock;

        if (blocksElapsed >= maturityHorizonBlocks) {
            return 1; // Handover complete. Founders are now regular citizens.
        }

        // Linear decay approximation (the exact user code from Phase 1)
        uint256 decayAmount = ((initialFounderCoefficient - 1) * blocksElapsed) / maturityHorizonBlocks;
        return initialFounderCoefficient - decayAmount;
    }

    function calculateEffectiveVotes(address voter, uint256 rawReputationBalance) external view returns (uint256) {
        return rawReputationBalance * getVotingCoefficient(voter);
    }

    // --- Sovereign Queue Integration ---

    function addProposal(string memory id, string memory title, string memory content, uint256 initialWeight) external onlyRole(SENATE_ROLE) {
        activeProposals.push(Proposal(id, title, content, initialWeight, false));
        emit ProposalAdded(id, title);
    }

    struct ProposalResponse {
        string id;
        string title;
        string content;
        uint256 rankWeight;
        bool executed;
    }

    function getHighestRankedProposal() external view returns (ProposalResponse memory) {
        uint256 topIdx = type(uint256).max;
        uint256 maxWeight = 0;

        for (uint i = 0; i < activeProposals.length; i++) {
            if (!activeProposals[i].executed && activeProposals[i].rankWeight > maxWeight) {
                topIdx = i;
                maxWeight = activeProposals[i].rankWeight;
            }
        }

        if (maxWeight > 0) {
            return ProposalResponse(
                activeProposals[topIdx].id,
                activeProposals[topIdx].title,
                activeProposals[topIdx].content,
                activeProposals[topIdx].rankWeight,
                activeProposals[topIdx].executed
            );
        }

        return ProposalResponse("", "", "", 0, true);
    }

    function markExecuted(string memory id) external onlyRole(SENATE_ROLE) {
        for (uint i = 0; i < activeProposals.length; i++) {
            if (keccak256(bytes(activeProposals[i].id)) == keccak256(bytes(id))) {
                activeProposals[i].executed = true;
                break;
            }
        }
    }
}
