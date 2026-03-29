// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "./MemoryLattice.sol";

interface IAXM {
    function transferFrom(address from, address to, uint256 value) external returns (bool);
    function transfer(address to, uint256 value) external returns (bool);
}

interface ICognitiveFrictionVerifier {
    function verifyPoER(
        bytes32 stateRootBefore,
        bytes32 stateRootAfter,
        bytes32 attentionScopeHash,
        bytes32 dependencyGraphRoot,
        bytes32 capabilityRoot,
        bytes32 modelRoot,
        bytes32 executionTraceHash,
        bytes calldata zkProof
    ) external returns (bool);
}

interface IPulseAdapter {
    function guardianSentinel() external view returns (address);
}

interface IHorizonForecast {
    function generateForecast(
        bytes32 proposalHash,
        bytes calldata simulationProof,
        bytes32 firstOrderRoot,
        bytes32 secondOrderRoot,
        bytes32 thirdOrderRoot
    ) external returns (bool);
}

interface ISoulboundReputation {
    function getAggregateReputation(address _user) external view returns (uint256);
}

/// @notice Verifies a fraud proof submitted during a channel challenge.
///         The verifier must confirm that the submitted proof demonstrates a
///         state transition violation (e.g., invalid zkML output, double-spend,
///         or mismatched state roots) for the given channel.
interface IFraudProofVerifier {
    function verifyFraudProof(
        bytes32 channelId,
        bytes32 claimedStateRoot,
        bytes calldata fraudProof
    ) external returns (bool);
}

struct AttentionArtifact {
    bytes32 attentionScopeHash;
    bytes32 dependencyGraphRoot;
    bytes32 capabilityRoot;
    bytes32 modelRoot;
    bytes32 executionTraceHash;
}

contract StigmergicStateChannel is ReentrancyGuard, Pausable {
    IAXM public immutable axmToken;
    ICognitiveFrictionVerifier public immutable poerVerifier;
    IPulseAdapter public immutable pulseAdapter;
    address public immutable universalDistributionPool;
    address public immutable guardianSentinel;
    address public horizonForecast;
    MemoryLattice public memoryLattice;
    ISoulboundReputation public soulboundReputation;
    IFraudProofVerifier public fraudProofVerifier;

    uint256 public constant CHALLENGE_WINDOW = 7 days;
    uint256 public constant NETWORK_TAX_BPS = 500;
    uint256 public channelNonce;

    struct Channel {
        address agentA;
        address agentB;
        uint256 lockedStake;
        uint256 stakeA;
        uint256 stakeB;
        bytes32 taskHash;
        bytes32 finalStateRoot;
        uint256 openedAt;
        uint256 challengeWindow;
        uint256 challengeWindowEnds;
        bool isSettled;
        bool isChallenged;
        bool agentBJoined;
    }

    mapping(bytes32 => Channel) public channels;

    event ChannelOpened(bytes32 indexed channelId, uint256 challengeEnds);
    event OptimisticSettled(bytes32 indexed channelId, bytes32 stateRootAfter);
    event SettlementChallenged(bytes32 indexed channelId, address challenger);
    event ChannelFundingReleased(bytes32 indexed channelId, uint256 networkTax, uint256 payoutA, uint256 payoutB);
    event ChallengeModifiersApplied(bytes32 indexed channelId, uint256 minRep, uint256 modifiedWindow, uint256 modifiedStake);

    constructor(
        address _axm,
        address _poer,
        address _pulse,
        address _universalPool,
        address _guardian
    ) {
        require(_axm != address(0), "AXM required");
        require(_poer != address(0), "PoER required");
        require(_pulse != address(0), "Pulse required");
        require(_universalPool != address(0), "Pool required");
        require(_guardian != address(0), "Guardian required");

        axmToken = IAXM(_axm);
        poerVerifier = ICognitiveFrictionVerifier(_poer);
        pulseAdapter = IPulseAdapter(_pulse);
        universalDistributionPool = _universalPool;
        guardianSentinel = _guardian;

        require(pulseAdapter.guardianSentinel() == _guardian, "Guardian mismatch");
    }

    function setHorizonForecast(address _horizon) external {
        require(msg.sender == guardianSentinel, "Unauthorized setter");
        horizonForecast = _horizon;
    }

    function setMemoryLattice(address _lattice) external {
        require(msg.sender == guardianSentinel, "Unauthorized setter");
        memoryLattice = MemoryLattice(_lattice);
    }

    function setSoulboundReputation(address _reputation) external {
        require(msg.sender == guardianSentinel, "Unauthorized setter");
        soulboundReputation = ISoulboundReputation(_reputation);
    }

    function setFraudProofVerifier(address _verifier) external {
        require(msg.sender == guardianSentinel, "Unauthorized setter");
        fraudProofVerifier = IFraudProofVerifier(_verifier);
    }

    function openChannel(address agentB, bytes32 taskHash, uint256 stake) external nonReentrant returns (bytes32) {
        require(agentB != address(0), "Invalid peer");
        require(stake > 0, "Invalid stake");

        uint256 challengeWindow = CHALLENGE_WINDOW;
        uint256 requiredStake = stake;

        uint256 minRep = 0;
        if (address(soulboundReputation) != address(0)) {
            uint256 repA = soulboundReputation.getAggregateReputation(msg.sender);
            uint256 repB = soulboundReputation.getAggregateReputation(agentB);
            minRep = repA < repB ? repA : repB;

            if (minRep >= 800) {
                challengeWindow = 3 days;
            } else if (minRep < 500) {
                challengeWindow = 14 days;
                requiredStake = stake * 2;
            }
        }

        bytes32 channelId = keccak256(abi.encodePacked(msg.sender, agentB, taskHash, block.timestamp, channelNonce++));

        if (challengeWindow != CHALLENGE_WINDOW || requiredStake != stake) {
            emit ChallengeModifiersApplied(channelId, minRep, challengeWindow, requiredStake);
        }

        channels[channelId] = Channel({
            agentA: msg.sender,
            agentB: agentB,
            lockedStake: requiredStake * 2,
            stakeA: requiredStake,
            stakeB: requiredStake,
            taskHash: taskHash,
            finalStateRoot: bytes32(0),
            openedAt: block.timestamp,
            challengeWindow: challengeWindow,
            challengeWindowEnds: block.timestamp + challengeWindow,
            isSettled: false,
            isChallenged: false,
            agentBJoined: false
        });

        require(axmToken.transferFrom(msg.sender, address(this), requiredStake), "Stake A transfer failed");

        emit ChannelOpened(channelId, block.timestamp + challengeWindow);
        return channelId;
    }

    function joinChannel(bytes32 channelId) external nonReentrant {
        Channel storage ch = channels[channelId];
        require(ch.agentA != address(0), "Channel not found");
        require(msg.sender == ch.agentB, "Only agentB can join");
        require(!ch.agentBJoined, "Already joined");

        uint256 individualStake = ch.stakeB;
        require(axmToken.transferFrom(msg.sender, address(this), individualStake), "Stake B transfer failed");

        ch.agentBJoined = true;
    }

    function optimisticSettle(
        bytes32 channelId,
        bytes32 stateRootBefore,
        bytes32 stateRootAfter,
        AttentionArtifact calldata artifact,
        bytes calldata zkProof
    ) external nonReentrant {
        _optimisticSettleCore(channelId, stateRootBefore, stateRootAfter, artifact, zkProof);

        if (address(memoryLattice) != address(0)) {
            memoryLattice.addAttentionNode(artifact.attentionScopeHash, channelId, zkProof);
        }
    }

    function optimisticSettleWithForecast(
        bytes32 channelId,
        bytes32 stateRootBefore,
        bytes32 stateRootAfter,
        AttentionArtifact calldata artifact,
        bytes calldata zkProof,
        bytes calldata simulationProof,
        bytes32 firstOrderRoot,
        bytes32 secondOrderRoot,
        bytes32 thirdOrderRoot
    ) external nonReentrant {
        if (horizonForecast != address(0)) {
            IHorizonForecast(horizonForecast).generateForecast(
                channelId,
                simulationProof,
                firstOrderRoot,
                secondOrderRoot,
                thirdOrderRoot
            );
        }

        _optimisticSettleCore(channelId, stateRootBefore, stateRootAfter, artifact, zkProof);

        if (address(memoryLattice) != address(0)) {
            memoryLattice.addAttentionNode(artifact.attentionScopeHash, channelId, zkProof);
            memoryLattice.addAttentionEdge(artifact.attentionScopeHash, stateRootAfter, 100, simulationProof);
        }
    }

    function _optimisticSettleCore(
        bytes32 channelId,
        bytes32 stateRootBefore,
        bytes32 stateRootAfter,
        AttentionArtifact calldata artifact,
        bytes calldata zkProof
    ) internal {
        Channel storage ch = channels[channelId];
        require(ch.agentA != address(0), "Channel not found");
        require(ch.agentBJoined, "Agent B has not joined");
        require(!ch.isSettled, "Already settled");
        require(!ch.isChallenged, "Settlement challenged");
        require(block.timestamp > ch.challengeWindowEnds, "Challenge window open");
        require(
            msg.sender == ch.agentA || msg.sender == ch.agentB || msg.sender == guardianSentinel,
            "Unauthorized settler"
        );

        require(
            poerVerifier.verifyPoER(
                stateRootBefore,
                stateRootAfter,
                artifact.attentionScopeHash,
                artifact.dependencyGraphRoot,
                artifact.capabilityRoot,
                artifact.modelRoot,
                artifact.executionTraceHash,
                zkProof
            ),
            "Invalid PoER proof"
        );

        ch.isSettled = true;
        ch.finalStateRoot = stateRootAfter;

        uint256 tax = (ch.lockedStake * NETWORK_TAX_BPS) / 10_000;
        uint256 payout = ch.lockedStake - tax;

        uint256 payoutA = (payout * ch.stakeA) / ch.lockedStake;
        uint256 payoutB = payout - payoutA;

        require(axmToken.transfer(universalDistributionPool, tax), "Tax transfer failed");
        require(axmToken.transfer(ch.agentA, payoutA), "A payout failed");
        require(axmToken.transfer(ch.agentB, payoutB), "B payout failed");

        emit OptimisticSettled(channelId, stateRootAfter);
        emit ChannelFundingReleased(channelId, tax, payoutA, payoutB);
    }

    function challengeSettlement(bytes32 channelId, bytes calldata fraudProof) external {
        Channel storage ch = channels[channelId];
        require(ch.agentA != address(0), "Channel not found");
        require(msg.sender == ch.agentA || msg.sender == ch.agentB || msg.sender == guardianSentinel, "Unauthorized challenger");
        require(!ch.isSettled, "Already settled");
        require(block.timestamp <= ch.challengeWindowEnds, "Window closed");
        require(fraudProof.length > 0, "Missing fraud proof");

        // Semantic fraud proof verification — requires a deployed IFraudProofVerifier.
        // If no verifier is configured, challenges are rejected to prevent griefing.
        require(address(fraudProofVerifier) != address(0), "Fraud proof verifier not configured");
        require(
            fraudProofVerifier.verifyFraudProof(channelId, ch.finalStateRoot, fraudProof),
            "Invalid fraud proof"
        );

        ch.isChallenged = true;
        emit SettlementChallenged(channelId, msg.sender);
    }
}
