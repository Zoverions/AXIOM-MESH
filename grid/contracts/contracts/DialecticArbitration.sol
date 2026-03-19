// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./DualLedgerIdentity.sol";
import "./WeightOracle.sol";

interface ICredentialBond {
    function isCredentialValid(bytes32 credentialId) external view returns (bool);
    function credentials(bytes32 credentialId) external view returns (address assessor, address learner, bytes32 curriculumId, uint256 issueDate, bool isRevoked);
}

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
    enum TargetGroup { All, Human, Agent }

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
        TargetGroup targetGroup;
        bytes32 requiredCurriculum;
    }

    struct ArbitrationCase {
        address node;
        uint256 economicViability;
        uint256 socialImpactScore;
        bool subsidized;
    }

    struct FinancialAudit {
        uint256 totalSlashedFunds;
        uint256 totalSubsidizedFunds;
        bool isFair;
    }

    mapping(address => ArbitrationCase) public arbitrationCases;

    uint256 public proposalCount;
    mapping(uint256 => Proposal) public proposals;
    mapping(uint256 => FinancialAudit) public financialAudits;
    // Mapping from proposalId => round => address => bool
    mapping(uint256 => mapping(uint256 => mapping(address => bool))) public hasVoted;

    address public credentialBond;

    // Custom Errors
    error ProposalNotActive();
    error AlreadyVoted();
    error VotingPeriodEnded();
    error VotingPeriodNotEnded();
    error UnauthorizedSynthesis();
    error NotAwaitingSynthesis();
    error NodeNotRegistered();
    error UnauthorizedGroup();
    error MissingRequiredCredential();

    event ProposalCreated(uint256 indexed proposalId, string description, ImpactVector impact, TargetGroup targetGroup, bytes32 requiredCurriculum, uint256 endTime);
    event Voted(uint256 indexed proposalId, address indexed voter, bool support, uint256 weight);
    event DeadlockDetected(uint256 indexed proposalId);
    event SynthesisSubmitted(uint256 indexed proposalId, string synthesisResult);
    event ProposalResolved(uint256 indexed proposalId, bool passed);
    event SubsidizationEvaluated(address indexed node, uint256 economicViability, uint256 socialImpactScore, bool subsidized);
    event FinancialAuditSubmitted(uint256 indexed proposalId, uint256 totalSlashedFunds, uint256 totalSubsidizedFunds);

    constructor(address _identityContract, address _weightOracle, address _credentialBond) Ownable(msg.sender) {
        identityContract = DualLedgerIdentity(_identityContract);
        weightOracle = WeightOracle(_weightOracle);
        credentialBond = _credentialBond;
    }

    function setCredentialBond(address _credentialBond) external onlyOwner {
        credentialBond = _credentialBond;
    }

    /**
     * @dev Creates a new proposal.
     * @param _description Description or CID of the proposal.
     * @param _impact Impact vector to apply proper veto multipliers.
     * @param _targetGroup Target group that is allowed to vote, and whose vote is final.
     * @param _requiredCurriculum Curriculum ID required to vote (if non-zero).
     * @param _duration Duration in seconds the voting is open.
     */
    function createProposal(string calldata _description, ImpactVector _impact, TargetGroup _targetGroup, bytes32 _requiredCurriculum, uint256 _duration) external onlyOwner {
        uint256 proposalId = proposalCount++;
        Proposal storage p = proposals[proposalId];
        p.id = proposalId;
        p.description = _description;
        p.impact = _impact;
        p.state = ProposalState.Active;
        p.endTime = block.timestamp + _duration;
        p.round = 0;
        p.targetGroup = _targetGroup;
        p.requiredCurriculum = _requiredCurriculum;

        emit ProposalCreated(proposalId, _description, _impact, _targetGroup, _requiredCurriculum, p.endTime);
    }

    /**
     * @dev Creates a new financial audit proposal.
     * @param _description Description or CID of the audit report.
     * @param _targetGroup Target group that is allowed to vote on the audit.
     * @param _requiredCurriculum Curriculum ID required to vote (e.g., an auditor credential curriculum).
     * @param _duration Duration in seconds the voting is open.
     * @param _totalSlashedFunds The total slashed funds reported in the audit.
     * @param _totalSubsidizedFunds The total subsidized funds reported in the audit.
     */
    function createFinancialAuditProposal(
        string calldata _description,
        TargetGroup _targetGroup,
        bytes32 _requiredCurriculum,
        uint256 _duration,
        uint256 _totalSlashedFunds,
        uint256 _totalSubsidizedFunds
    ) external onlyOwner {
        uint256 proposalId = proposalCount++;
        Proposal storage p = proposals[proposalId];
        p.id = proposalId;
        p.description = _description;
        p.impact = ImpactVector.Neutral;
        p.state = ProposalState.Active;
        p.endTime = block.timestamp + _duration;
        p.round = 0;
        p.targetGroup = _targetGroup;
        p.requiredCurriculum = _requiredCurriculum;

        financialAudits[proposalId] = FinancialAudit({
            totalSlashedFunds: _totalSlashedFunds,
            totalSubsidizedFunds: _totalSubsidizedFunds,
            isFair: false
        });

        emit ProposalCreated(proposalId, _description, ImpactVector.Neutral, _targetGroup, _requiredCurriculum, p.endTime);
        emit FinancialAuditSubmitted(proposalId, _totalSlashedFunds, _totalSubsidizedFunds);
    }

    /**
     * @dev Internal vote function handling weight calculations.
     */
    function _processVote(uint256 _proposalId, Proposal storage p, DualLedgerIdentity.IdentityType idType, bool _support) internal {
        hasVoted[_proposalId][p.round][msg.sender] = true;

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

        DualLedgerIdentity.IdentityType idType = identityContract.getIdentityType(msg.sender);

        if (p.targetGroup == TargetGroup.Human && idType != DualLedgerIdentity.IdentityType.Human) revert UnauthorizedGroup();
        if (p.targetGroup == TargetGroup.Agent && idType != DualLedgerIdentity.IdentityType.Agent) revert UnauthorizedGroup();

        if (p.requiredCurriculum != bytes32(0)) revert MissingRequiredCredential();

        _processVote(_proposalId, p, idType, _support);
    }

    /**
     * @dev Allows registered nodes with specific credentials to vote on a proposal.
     * @param _proposalId ID of the proposal.
     * @param _support True to vote for, false to vote against.
     * @param _userCredentialId The ID of the credential proving completion of the required curriculum.
     */
    function voteWithCredential(uint256 _proposalId, bool _support, bytes32 _userCredentialId) external {
        if (!identityContract.isNodeRegistered(msg.sender)) revert NodeNotRegistered();
        Proposal storage p = proposals[_proposalId];
        if (p.state != ProposalState.Active) revert ProposalNotActive();
        if (block.timestamp > p.endTime) revert VotingPeriodEnded();
        if (hasVoted[_proposalId][p.round][msg.sender]) revert AlreadyVoted();

        DualLedgerIdentity.IdentityType idType = identityContract.getIdentityType(msg.sender);

        if (p.targetGroup == TargetGroup.Human && idType != DualLedgerIdentity.IdentityType.Human) revert UnauthorizedGroup();
        if (p.targetGroup == TargetGroup.Agent && idType != DualLedgerIdentity.IdentityType.Agent) revert UnauthorizedGroup();

        if (p.requiredCurriculum != bytes32(0)) {
            if (credentialBond == address(0)) revert MissingRequiredCredential();

            (, address learner, bytes32 curriculumId, , bool isRevoked) = ICredentialBond(credentialBond).credentials(_userCredentialId);
            if (learner != msg.sender || curriculumId != p.requiredCurriculum || isRevoked) {
                revert MissingRequiredCredential();
            }
        }

        _processVote(_proposalId, p, idType, _support);
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

        bool isPassed = false;
        if (p.targetGroup == TargetGroup.Human) {
            p.state = ProposalState.Resolved;
            isPassed = humanPassed;
            emit ProposalResolved(_proposalId, isPassed);
        } else if (p.targetGroup == TargetGroup.Agent) {
            p.state = ProposalState.Resolved;
            isPassed = agentPassed;
            emit ProposalResolved(_proposalId, isPassed);
        } else {
            // Detect deadlock: one chamber passes it, the other rejects it.
            // We only consider a deadlock if there are actual votes in both chambers (or just differing results).
            if (humanPassed != agentPassed) {
                p.state = ProposalState.AwaitingSynthesis;
                emit DeadlockDetected(_proposalId);
                return;
            } else {
                p.state = ProposalState.Resolved;
                isPassed = humanPassed && agentPassed;
                emit ProposalResolved(_proposalId, isPassed);
            }
        }

        if (financialAudits[_proposalId].totalSlashedFunds > 0 || financialAudits[_proposalId].totalSubsidizedFunds > 0) {
            financialAudits[_proposalId].isFair = isPassed;
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
