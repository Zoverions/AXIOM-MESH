// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract SwarmCoordinator {
    event ProposalIndexed(bytes32 indexed proposalId, bytes32 indexed stateRoot, bytes32 attentionScopeHash);

    function submitProposal(bytes32 proposalId, bytes32 stateRoot, bytes32 attentionScopeHash) external {
        emit ProposalIndexed(proposalId, stateRoot, attentionScopeHash);
    }
}
