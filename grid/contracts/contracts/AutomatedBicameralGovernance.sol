// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./ZKMLVerifier.sol";
import "./token/AXM.sol";

/**
 * @title Automated Bicameral Governance (The AxiomMesh Constitution)
 * @notice Replaces standard Token-Weighted voting with Proof-of-Cognition.
 * * THE TWO HOUSES:
 * 1. The Epistemic Senate (The Machines): Nodes vote by providing ZK-Proofs of
 * Monte Carlo simulations demonstrating the thermodynamic outcome of a proposal.
 * Proposals pass if the network mathematically agrees it reduces entropy.
 * 2. The Founder Council (The Humans): A multi-sig holding Veto power over
 * philosophical axioms and parameter bounds that math cannot resolve.
 */
contract AutomatedBicameralGovernance is ReentrancyGuard {
    AXM public immutable axmToken;
    ZKMLVerifier public immutable zkVerifier;

    address public immutable founderCouncil;

    // Minimum staked AXM required to submit a proposal (Anti-Spam)
    uint256 public constant PROPOSAL_STAKE = 1000 ether;

    enum ProposalState { ACTIVE, DEFEATED, PASSED, EXECUTED, VETOED }

    struct Proposal {
        address proposer;
        bytes32 payloadHash;       // The hash of the code/parameter change
        int256 totalEntropyDelta;  // Accumulated from node proofs (negative = good)
        uint256 voteCount;
        uint256 deadline;
        ProposalState state;
    }

    mapping(uint256 => Proposal) public proposals;
    mapping(uint256 => mapping(address => bool)) public hasVoted;

    uint256 public proposalCount;

    event ProposalCreated(uint256 indexed id, address proposer, bytes32 payloadHash, uint256 deadline);
    event CognitiveVoteCast(uint256 indexed proposalId, address voter, int256 entropyDelta);
    event ProposalResolved(uint256 indexed proposalId, ProposalState finalState);
    event VetoExercised(uint256 indexed proposalId, string reason);

    modifier onlyFounder() {
        require(msg.sender == founderCouncil, "Only Founder Council");
        _;
    }

    constructor(address _axmToken, address _zkVerifier, address _founderCouncil) {
        axmToken = AXM(_axmToken);
        zkVerifier = ZKMLVerifier(_zkVerifier);
        founderCouncil = _founderCouncil;
    }

    /**
     * @notice Submit a new network rule or parameter change.
     */
    function proposeStateChange(bytes32 payloadHash) external nonReentrant returns (uint256) {
        require(axmToken.transferFrom(msg.sender, address(this), PROPOSAL_STAKE), "Stake required");

        proposalCount++;
        uint256 pId = proposalCount;

        proposals[pId] = Proposal({
            proposer: msg.sender,
            payloadHash: payloadHash,
            totalEntropyDelta: 0,
            voteCount: 0,
            deadline: block.timestamp + 3 days,
            state: ProposalState.ACTIVE
        });

        emit ProposalCreated(pId, msg.sender, payloadHash, proposals[pId].deadline);
        return pId;
    }

    /**
     * @notice Nodes call this function.
     * They do NOT vote "Yes" or "No". They submit a ZK-Proof of their simulation.
     * The contract mathematically aggregates the simulation results.
     */
    function submitCognitiveVote(
        uint256 proposalId,
        int256 simulatedEntropyDelta,
        bytes calldata zkProof
    ) external nonReentrant {
        Proposal storage p = proposals[proposalId];
        require(p.state == ProposalState.ACTIVE, "Proposal inactive");
        require(block.timestamp < p.deadline, "Voting closed");
        require(!hasVoted[proposalId][msg.sender], "Already voted");

        // Verify the node actually ran the rigorous Monte Carlo simulation
        // (Prevents nodes from just submitting fake numbers to farm rewards)
        bytes32 publicInput = keccak256(abi.encodePacked(proposalId, simulatedEntropyDelta, p.payloadHash));
        // NOTE: zkVerifier interface requires (bytes32, uint256[2], uint256[2][2], uint256[2]).
        // For demonstration, we assume zkProof packs these arguments.
        (uint256[2] memory a, uint256[2][2] memory b, uint256[2] memory c) = abi.decode(zkProof, (uint256[2], uint256[2][2], uint256[2]));
        require(zkVerifier.verifyProof(publicInput, a, b, c), "Invalid Proof of Cognition");

        hasVoted[proposalId][msg.sender] = true;
        p.voteCount++;

        // Aggregate the thermodynamic consensus
        p.totalEntropyDelta += simulatedEntropyDelta;

        emit CognitiveVoteCast(proposalId, msg.sender, simulatedEntropyDelta);
    }

    /**
     * @notice Resolves the proposal after the deadline based strictly on math.
     */
    function resolveProposal(uint256 proposalId) external nonReentrant {
        Proposal storage p = proposals[proposalId];
        require(p.state == ProposalState.ACTIVE, "Not active");
        require(block.timestamp >= p.deadline, "Voting still open");

        // Minimum quorum check (e.g., at least 50 nodes must have simulated it)
        if (p.voteCount < 50) {
            p.state = ProposalState.DEFEATED;
            axmToken.transfer(p.proposer, PROPOSAL_STAKE); // Refund stake
            emit ProposalResolved(proposalId, ProposalState.DEFEATED);
            return;
        }

        // The Ultimate Thermodynamic Test: Did the aggregate simulation reduce entropy?
        if (p.totalEntropyDelta < 0) {
            p.state = ProposalState.PASSED;
            // Proposer is rewarded for improving the network
            axmToken.transfer(p.proposer, PROPOSAL_STAKE);
            // In a full implementation, trigger the automatic upgrade execution here
        } else {
            p.state = ProposalState.DEFEATED;
            // Proposer's stake is slashed for introducing high-entropy/malicious logic
            // Slashed funds would route to the Universal Distribution Pool
        }

        emit ProposalResolved(proposalId, p.state);
    }

    /**
     * @notice The Human Override.
     * Allows the Founder Council to veto mathematically sound but philosophically misaligned proposals.
     */
    function humanVeto(uint256 proposalId, string calldata reason) external onlyFounder {
        Proposal storage p = proposals[proposalId];
        require(p.state == ProposalState.ACTIVE || p.state == ProposalState.PASSED, "Cannot veto this state");

        p.state = ProposalState.VETOED;
        emit VetoExercised(proposalId, reason);
    }
}