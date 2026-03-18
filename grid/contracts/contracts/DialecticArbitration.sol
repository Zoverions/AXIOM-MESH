// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./DualLedgerIdentity.sol";
import "./WeightOracle.sol";

/**
 * @title DialecticArbitration
 * @dev Handles deadlocked overlapping votes, routes them to a Hypervisor for synthesis,
 * and triggers a re-vote. Implements Anthropic and Thermodynamic veto multipliers.
 */
contract DialecticArbitration is Ownable {
    DualLedgerIdentity public identityContract;
    WeightOracle public weightOracle;

    enum ProposalState { Active, AwaitingSynthesis, Resolved }
    enum ImpactVector { Anthropic, Thermodynamic, Neutral }

    struct Proposal {
        uint256 id;
        string description;
        ImpactVector impact;
        ProposalState state;
        string synthesisResult; // CID or text of the geometric synthesis
        uint256 humanForVotes;
        uint256 humanAgainstVotes;
        uint256 agentForVotes;
        uint256 agentAgainstVotes;
        uint256 endTime;
        uint256 round; // Tracks the current voting round
    }

    struct ArbitrationCase {
        address node;
        uint256 economicViability;
        uint256 socialImpactScore;
        bool subsidized;
    }

    mapping(address => ArbitrationCase) public arbitrationCases;

    uint256 public proposalCount;
    mapping(uint256 => Proposal) public proposals;
    // Mapping from proposalId => round => address => bool
    mapping(uint256 => mapping(uint256 => mapping(address => bool))) public hasVoted;

    // Custom Errors
    error ProposalNotActive();
    error AlreadyVoted();
    error VotingPeriodEnded();
    error VotingPeriodNotEnded();
    error UnauthorizedSynthesis();
    error NotAwaitingSynthesis();
    error NodeNotRegistered();

    event ProposalCreated(uint256 indexed proposalId, string description, ImpactVector impact, uint256 endTime);
    event Voted(uint256 indexed proposalId, address indexed voter, bool support, uint256 weight);
    event DeadlockDetected(uint256 indexed proposalId);
    event SynthesisSubmitted(uint256 indexed proposalId, string synthesisResult);
    event ProposalResolved(uint256 indexed proposalId, bool passed);
    event SubsidizationEvaluated(address indexed node, uint256 economicViability, uint256 socialImpactScore, bool subsidized);

    constructor(address _identityContract, address _weightOracle) Ownable(msg.sender) {
        identityContract = DualLedgerIdentity(_identityContract);
        weightOracle = WeightOracle(_weightOracle);
    }

    /**
     * @dev Creates a new proposal.
     * @param _description Description or CID of the proposal.
     * @param _impact Impact vector to apply proper veto multipliers.
     * @param _duration Duration in seconds the voting is open.
     */
    function createProposal(string calldata _description, ImpactVector _impact, uint256 _duration) external onlyOwner {
        uint256 proposalId = proposalCount++;
        Proposal storage p = proposals[proposalId];
        p.id = proposalId;
        p.description = _description;
        p.impact = _impact;
        p.state = ProposalState.Active;
        p.endTime = block.timestamp + _duration;
        p.round = 0;

        emit ProposalCreated(proposalId, _description, _impact, p.endTime);
    }

    /**
     * @dev Allows registered nodes to vote on a proposal.
     * @param _proposalId ID of the proposal.
     * @param _support True to vote for, false to vote against.
     */
    function vote(uint256 _proposalId, bool _support) external {
        if (!identityContract.isNodeRegistered(msg.sender)) revert NodeNotRegistered();
        Proposal storage p = proposals[_proposalId];
        if (p.state != ProposalState.Active) revert ProposalNotActive();
        if (block.timestamp > p.endTime) revert VotingPeriodEnded();
        if (hasVoted[_proposalId][p.round][msg.sender]) revert AlreadyVoted();

        hasVoted[_proposalId][p.round][msg.sender] = true;

        DualLedgerIdentity.IdentityType idType = identityContract.getIdentityType(msg.sender);
        uint256 baseWeight = weightOracle.getWeight(msg.sender);
        uint256 finalWeight = baseWeight;

        // Apply Veto Multipliers (2.5x represented as * 25 / 10)
        if (p.impact == ImpactVector.Anthropic && idType == DualLedgerIdentity.IdentityType.Human) {
            finalWeight = (baseWeight * 25) / 10;
        } else if (p.impact == ImpactVector.Thermodynamic && idType == DualLedgerIdentity.IdentityType.Agent) {
            finalWeight = (baseWeight * 25) / 10;
        }

        if (idType == DualLedgerIdentity.IdentityType.Human) {
            if (_support) p.humanForVotes += finalWeight;
            else p.humanAgainstVotes += finalWeight;
        } else if (idType == DualLedgerIdentity.IdentityType.Agent) {
            if (_support) p.agentForVotes += finalWeight;
            else p.agentAgainstVotes += finalWeight;
        }

        emit Voted(_proposalId, msg.sender, _support, finalWeight);
    }

    /**
     * @dev Resolves a proposal after the voting period ends. Detects deadlocks.
     * @param _proposalId ID of the proposal.
     */
    function resolveProposal(uint256 _proposalId) external {
        Proposal storage p = proposals[_proposalId];
        if (p.state != ProposalState.Active) revert ProposalNotActive();
        if (block.timestamp <= p.endTime) revert VotingPeriodNotEnded();

        bool humanPassed = p.humanForVotes > p.humanAgainstVotes;
        bool agentPassed = p.agentForVotes > p.agentAgainstVotes;

        // Detect deadlock: one chamber passes it, the other rejects it.
        // We only consider a deadlock if there are actual votes in both chambers (or just differing results).
        if (humanPassed != agentPassed) {
            p.state = ProposalState.AwaitingSynthesis;
            emit DeadlockDetected(_proposalId);
        } else {
            p.state = ProposalState.Resolved;
            emit ProposalResolved(_proposalId, humanPassed && agentPassed);
        }
    }

    /**
     * @dev Submits a synthesis from the Hypervisor for a deadlocked proposal.
     * Resets votes and extends the voting period.
     * @param _proposalId ID of the proposal.
     * @param _synthesisResult Description or CID of the synthesis.
     * @param _newDuration Additional time for the re-vote.
     */
    function submitSynthesis(uint256 _proposalId, string calldata _synthesisResult, uint256 _newDuration) external onlyOwner {
        Proposal storage p = proposals[_proposalId];
        if (p.state != ProposalState.AwaitingSynthesis) revert NotAwaitingSynthesis();

        p.synthesisResult = _synthesisResult;
        p.state = ProposalState.Active;
        p.endTime = block.timestamp + _newDuration;

        // Reset votes for the re-vote
        p.humanForVotes = 0;
        p.humanAgainstVotes = 0;
        p.agentForVotes = 0;
        p.agentAgainstVotes = 0;

        // Increment the voting round so nodes can vote again
        p.round += 1;

        emit SynthesisSubmitted(_proposalId, _synthesisResult);
    }

    /**
     * @dev Evaluate subsidization for a node operating at a loss based on social impact
     */
    function evaluateSubsidization(address _node, uint256 _economicViability, uint256 _socialImpactScore) external onlyOwner {
        bool subsidized = false;
        if (_socialImpactScore > _economicViability) {
            subsidized = true;
        }
        arbitrationCases[_node] = ArbitrationCase(_node, _economicViability, _socialImpactScore, subsidized);

        // In a real implementation this might queue a subsidization payout or adjust compute bond state

        emit SubsidizationEvaluated(_node, _economicViability, _socialImpactScore, subsidized);
    }
}
