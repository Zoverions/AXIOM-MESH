// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./DialecticArbitration.sol";
import "./ZKMLVerifier.sol";
import "./token/AXM.sol";

/**
 * @title Automated Bicameral Governance (The AxiomMesh Constitution)
 * @notice Unifies standard Token-Weighted voting with Proof-of-Cognition, while preserving dynamic
 *         organizational structures for Guilds, Capsule Plus environments, and Peer Classes.
 *
 * * THE TWO HOUSES (Global Upgrades):
 * 1. The Epistemic Senate (The Machines): Nodes vote by providing ZK-Proofs of
 * Monte Carlo simulations demonstrating the thermodynamic outcome of a proposal.
 * Proposals pass if the network mathematically agrees it reduces entropy.
 * 2. The Founder Council (The Humans): A multi-sig holding Veto power over
 * philosophical axioms and parameter bounds that math cannot resolve.
 *
 * * LOCALIZED STRUCTURES (Guilds/Capsules):
 * Defines specific interaction policies (Allow, Deny, Review), Minimum Security Profiles,
 * and max risk tiers for different organizational structures (Business, Gov, Fan Groups).
 */
contract AutomatedBicameralGovernance is ReentrancyGuard, Ownable {
    AXM public immutable axmToken;
    ZKMLVerifier public immutable zkVerifier;
    address public immutable founderCouncil;
    DialecticArbitration public arbitrationContract;

    // Minimum staked AXM required to submit a global state proposal (Anti-Spam)
    uint256 public constant PROPOSAL_STAKE = 1000 ether;

    // --- PHASE 3: PROOF-OF-COGNITION STATE CHANGES ---

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

    // --- CAPSULE PLUS & GUILD FRAMEWORKS ---

    // Flag to enable a safe mode where localized parameter changes are only simulated and logged, not enacted.
    bool public simulationModeActive;
    event SimulationExecuted(bytes32 indexed peerClassId, ActionType simulatedPolicy);

    // Policy structures for distinct interactions (Business, Govt, DAOs)
    enum ActionType { None, Deny, AllowWithReview, Allow }

    struct PeerClassRisk {
        ActionType defaultPolicy;
        uint256 minSecurityProfile; // 0 to 3
        uint256 maxRiskTier;        // 0 to 4
        bool quarantined;
    }

    // Emergency circuit breaker
    bool public systemPaused;

    mapping(bytes32 => PeerClassRisk) public peerClassRisks;

    event EmergencyPauseInvoked(string reason);
    event EmergencyPauseLifted();
    event PeerClassQuarantined(bytes32 indexed peerClassId, string reason);
    event PolicyUpdated(bytes32 indexed peerClassId, ActionType defaultPolicy, uint256 minSecurityProfile, uint256 maxRiskTier);
    event ArbitrationContractUpdated(address indexed newContract);

    error SystemIsPaused();
    error InvalidSecurityProfile();
    error InvalidRiskTier();
    error NotAIGovernor(address caller);

    // Modifier simulating an AIGovernor oracle calling this
    // In production, an ECDSA/ZK verified message from the Hypervisor or an external oracle network
    modifier onlyAIGovernor() {
        if (msg.sender != owner()) revert NotAIGovernor(msg.sender);
        _;
    }

    modifier onlyFounder() {
        require(msg.sender == founderCouncil, "Only Founder Council");
        _;
    }

    modifier onlyWhenActive() {
        if (systemPaused) revert SystemIsPaused();
        _;
    }

    constructor(address _axmToken, address _zkVerifier, address _founderCouncil, address _arbitrationContract) Ownable(msg.sender) {
        axmToken = AXM(_axmToken);
        zkVerifier = ZKMLVerifier(_zkVerifier);
        founderCouncil = _founderCouncil;
        arbitrationContract = DialecticArbitration(_arbitrationContract);
    }

    // ==========================================
    // GLOBAL STATE: PROOF OF COGNITION SENATE
    // ==========================================

    /**
     * @notice Submit a new global network rule or parameter change.
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
     * @notice Nodes call this function to submit a ZK-Proof of their thermodynamic simulation.
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
        bytes32 publicInput = keccak256(abi.encodePacked(proposalId, simulatedEntropyDelta, p.payloadHash));
        (uint256[2] memory a, uint256[2][2] memory b, uint256[2] memory c) = abi.decode(zkProof, (uint256[2], uint256[2][2], uint256[2]));
        require(zkVerifier.verifyProof(publicInput, a, b, c), "Invalid Proof of Cognition");

        hasVoted[proposalId][msg.sender] = true;
        p.voteCount++;
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

        if (p.voteCount < 50) {
            p.state = ProposalState.DEFEATED;
            axmToken.transfer(p.proposer, PROPOSAL_STAKE); // Refund stake
            emit ProposalResolved(proposalId, ProposalState.DEFEATED);
            return;
        }

        if (p.totalEntropyDelta < 0) {
            p.state = ProposalState.PASSED;
            axmToken.transfer(p.proposer, PROPOSAL_STAKE);
        } else {
            p.state = ProposalState.DEFEATED;
            // Proposer's stake is slashed for introducing high-entropy/malicious logic
        }

        emit ProposalResolved(proposalId, p.state);
    }

    function humanVeto(uint256 proposalId, string calldata reason) external onlyFounder {
        Proposal storage p = proposals[proposalId];
        require(p.state == ProposalState.ACTIVE || p.state == ProposalState.PASSED, "Cannot veto this state");

        p.state = ProposalState.VETOED;
        emit VetoExercised(proposalId, reason);
    }


    // ==========================================
    // LOCALIZED STATE: GUILDS & CAPSULES
    // ==========================================

    function setArbitrationContract(address _newArbitrationContract) external onlyOwner {
        arbitrationContract = DialecticArbitration(_newArbitrationContract);
        emit ArbitrationContractUpdated(_newArbitrationContract);
    }

    /**
     * @dev Emergency Circuit Breaker - Instantly pauses network interactions
     */
    function emergencyPause(string calldata reason) external onlyAIGovernor {
        systemPaused = true;
        emit EmergencyPauseInvoked(reason);
    }

    /**
     * @dev Lifts the emergency circuit breaker
     */
    function liftEmergencyPause() external onlyAIGovernor {
        systemPaused = false;
        emit EmergencyPauseLifted();
    }

    /**
     * @dev Auto-quarantine a compromised peer class based on zkML anomaly detection
     */
    function autoQuarantinePeerClass(bytes32 peerClassId, string calldata reason) external onlyAIGovernor {
        peerClassRisks[peerClassId].quarantined = true;
        peerClassRisks[peerClassId].defaultPolicy = ActionType.Deny;
        emit PeerClassQuarantined(peerClassId, reason);
    }

    /**
     * @dev Enforce minimum security profile dynamically based on active threats
     */
    function raiseMinSecurityProfile(bytes32 peerClassId, uint256 newProfile) external onlyAIGovernor onlyWhenActive {
        if (newProfile > 3) revert InvalidSecurityProfile();
        if (peerClassRisks[peerClassId].minSecurityProfile < newProfile) {
            peerClassRisks[peerClassId].minSecurityProfile = newProfile;
            emit PolicyUpdated(
                peerClassId,
                peerClassRisks[peerClassId].defaultPolicy,
                newProfile,
                peerClassRisks[peerClassId].maxRiskTier
            );
        }
    }

    /**
     * @dev Set simulation mode to allow Guilds to shadow-test rules securely
     */
    function setSimulationMode(bool _active) external onlyAIGovernor {
        simulationModeActive = _active;
    }

    /**
     * @dev Updates overall policy configuration for specific organizational frameworks
     */
    function updatePolicy(
        bytes32 peerClassId,
        ActionType defaultPolicy,
        uint256 minSecurityProfile,
        uint256 maxRiskTier
    ) external onlyAIGovernor onlyWhenActive {
        if (minSecurityProfile > 3) revert InvalidSecurityProfile();
        if (maxRiskTier > 4) revert InvalidRiskTier();

        if (simulationModeActive) {
            // Simulation: Only emit event to track hypothetical impact, do not alter state
            emit SimulationExecuted(peerClassId, defaultPolicy);
            return;
        }

        peerClassRisks[peerClassId] = PeerClassRisk({
            defaultPolicy: defaultPolicy,
            minSecurityProfile: minSecurityProfile,
            maxRiskTier: maxRiskTier,
            quarantined: peerClassRisks[peerClassId].quarantined
        });

        emit PolicyUpdated(peerClassId, defaultPolicy, minSecurityProfile, maxRiskTier);
    }

    /**
     * @dev Triggers AI integration / interaction where weighted discussions hit a deadlock
     */
    function synthesizeDeadlock(uint256 _proposalId, string calldata synthesisResult, uint256 newDuration) external onlyAIGovernor onlyWhenActive {
        // AI Governor forwards the synthesized solution to the Guild's arbitration layer
        arbitrationContract.submitSynthesis(_proposalId, synthesisResult, newDuration);
    }
}