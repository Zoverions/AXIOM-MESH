// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
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
    address public immutable founderManager;
    address public immutable universalDistributionPool;
    address public immutable guardianSentinel;
    address public horizonForecast;

    uint256 public constant CHALLENGE_WINDOW = 7 days;
    uint256 public constant NETWORK_TAX_BPS = 500;

    struct Channel {
        address agentA;
        address agentB;
        uint256 lockedStake;
        bytes32 taskHash;
        bytes32 finalStateRoot;
        uint256 openedAt;
        uint256 challengeWindowEnds;
        bool isSettled;
        bool isChallenged;
    }

    mapping(bytes32 => Channel) public channels;

    event ChannelOpened(bytes32 indexed channelId, uint256 challengeEnds);
    event OptimisticSettled(bytes32 indexed channelId, bytes32 stateRootAfter);
    event SettlementChallenged(bytes32 indexed channelId, address challenger);
    event ChannelFundingReleased(bytes32 indexed channelId, uint256 networkTax, uint256 payoutA, uint256 payoutB);

    constructor(
        address _axm,
        address _poer,
        address _pulse,
        address _founder,
        address _universalPool,
        address _guardian
    ) {
        require(_axm != address(0), "AXM required");
        require(_poer != address(0), "PoER required");
        require(_pulse != address(0), "Pulse required");
        require(_founder != address(0), "Founder required");
        require(_universalPool != address(0), "Pool required");
        require(_guardian != address(0), "Guardian required");

        axmToken = IAXM(_axm);
        poerVerifier = ICognitiveFrictionVerifier(_poer);
        pulseAdapter = IPulseAdapter(_pulse);
        founderManager = _founder;
        universalDistributionPool = _universalPool;
        guardianSentinel = _guardian;

        require(pulseAdapter.guardianSentinel() == _guardian, "Guardian mismatch");
    }

    function setHorizonForecast(address _horizon) external {
        require(msg.sender == guardianSentinel, "Unauthorized setter");
        horizonForecast = _horizon;
    }

    function openChannel(address agentB, bytes32 taskHash, uint256 stake) external nonReentrant returns (bytes32) {
        require(agentB != address(0), "Invalid peer");
        require(stake > 0, "Invalid stake");

        bytes32 channelId = keccak256(abi.encodePacked(msg.sender, agentB, taskHash, block.timestamp));
        channels[channelId] = Channel({
            agentA: msg.sender,
            agentB: agentB,
            lockedStake: stake,
            taskHash: taskHash,
            finalStateRoot: bytes32(0),
            openedAt: block.timestamp,
            challengeWindowEnds: block.timestamp + CHALLENGE_WINDOW,
            isSettled: false,
            isChallenged: false
        });

        require(axmToken.transferFrom(msg.sender, address(this), stake), "Stake transfer failed");

        emit ChannelOpened(channelId, block.timestamp + CHALLENGE_WINDOW);
        return channelId;
    }

    function optimisticSettle(
        bytes32 channelId,
        bytes32 stateRootBefore,
        bytes32 stateRootAfter,
        AttentionArtifact calldata artifact,
        bytes calldata zkProof
    ) external nonReentrant {
        _optimisticSettleCore(channelId, stateRootBefore, stateRootAfter, artifact, zkProof);
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

        require(axmToken.transfer(universalDistributionPool, tax), "Tax transfer failed");
        require(axmToken.transfer(ch.agentA, payout / 2), "A payout failed");
        require(axmToken.transfer(ch.agentB, payout - (payout / 2)), "B payout failed");

        emit OptimisticSettled(channelId, stateRootAfter);
        emit ChannelFundingReleased(channelId, tax, payout / 2, payout - (payout / 2));
    }

    function challengeSettlement(bytes32 channelId, bytes calldata fraudProof) external {
        Channel storage ch = channels[channelId];
        require(ch.agentA != address(0), "Channel not found");
        require(!ch.isSettled, "Already settled");
        require(block.timestamp <= ch.challengeWindowEnds, "Window closed");
        require(fraudProof.length > 0, "Missing fraud proof");
        ch.isChallenged = true;
        emit SettlementChallenged(channelId, msg.sender);
    }
}
