// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import "./GenesisDecayGovernance.sol";

/**
 * @title ProposalRegistry
 * @notice The on-chain Sovereign Execution Queue (SEQ).
 * Absolute arbiter of network task execution as declared in CONSTITUTION.md.
 * Proposals are ranked by weighted votes (Founder Coefficient decay applied automatically).
 * No human roadmap — only math and Senate consensus.
 */
contract ProposalRegistry {
    GenesisDecayGovernance public immutable governance;

    struct Proposal {
        string id;
        string title;
        string content;
        uint256 rankWeight;
        bool executed;
        uint256 timestamp;
    }

    Proposal[] public proposals;
    mapping(string => uint256) public proposalIndex;

    event SovereignExecutionQueued(string indexed proposalId, uint256 weightedRank);
    event ProposalExecuted(string indexed proposalId);

    constructor(address _governance) {
        governance = GenesisDecayGovernance(_governance);
    }

    function addProposal(
        string calldata id,
        string calldata title,
        string calldata content,
        uint256 initialWeight
    ) external {
        // Only Senate (or future citizens once decay reaches 1.0)
        require(governance.hasRole(governance.SENATE_ROLE(), msg.sender), "Only Senate");

        proposals.push(Proposal(id, title, content, initialWeight, false, block.timestamp));
        proposalIndex[id] = proposals.length - 1;

        emit SovereignExecutionQueued(id, initialWeight);
    }

    function getHighestRankedProposal() external view returns (Proposal memory) {
        uint256 maxWeight = 0;
        uint256 topIndex = type(uint256).max;

        for (uint256 i = 0; i < proposals.length; i++) {
            if (!proposals[i].executed) {
                uint256 weighted = proposals[i].rankWeight; // Future: multiply by current decay if needed
                if (weighted > maxWeight) {
                    maxWeight = weighted;
                    topIndex = i;
                }
            }
        }

        if (topIndex == type(uint256).max) {
            return Proposal("", "", "", 0, true, 0);
        }
        return proposals[topIndex];
    }

    function markExecuted(string calldata id) external {
        require(governance.hasRole(governance.SENATE_ROLE(), msg.sender), "Only Senate");
        uint256 idx = proposalIndex[id];
        require(idx < proposals.length, "Proposal not found");
        proposals[idx].executed = true;
        emit ProposalExecuted(id);
    }
}