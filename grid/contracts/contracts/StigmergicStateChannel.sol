// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "./token/AXM.sol";
import "./CognitiveFrictionVerifier.sol";
import "./PulseAdapter.sol";
import "./FounderShareManager.sol";

struct AttentionArtifact {
    bytes32 attentionScopeHash;
    bytes32 dependencyGraphRoot;
    bytes32 capabilityRoot;
    bytes32 modelRoot;
    bytes32 executionTraceHash;
}

contract StigmergicStateChannel is ReentrancyGuard, Pausable {
    AXM public immutable axmToken;
    CognitiveFrictionVerifier public immutable poerVerifier;
    PulseAdapter public immutable pulseAdapter;
    FounderShareManager public immutable founderManager;
    address public immutable universalDistributionPool;
    address public immutable guardianSentinel;

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
    }

    mapping(bytes32 => Channel) public channels;

    event ChannelOpened(bytes32 indexed channelId, uint256 challengeEnds);
    event OptimisticSettled(bytes32 indexed channelId, bytes32 stateRootAfter);
    event SettlementChallenged(bytes32 indexed channelId, address challenger);

    constructor(
        address _axm,
        address _poer,
        address _pulse,
        address _founder,
        address _universalPool,
        address _guardian
    ) {
        axmToken = AXM(_axm);
        poerVerifier = CognitiveFrictionVerifier(_poer);
        pulseAdapter = PulseAdapter(_pulse);
        founderManager = FounderShareManager(_founder);
        universalDistributionPool = _universalPool;
        guardianSentinel = _guardian;
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
            isSettled: false
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
        Channel storage ch = channels[channelId];
        require(ch.agentA != address(0), "Channel not found");
        require(!ch.isSettled, "Already settled");
        require(block.timestamp > ch.challengeWindowEnds, "Challenge window open");

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
    }

    function challengeSettlement(bytes32 channelId, bytes calldata fraudProof) external {
        require(channels[channelId].agentA != address(0), "Channel not found");
        require(fraudProof.length > 0, "Missing fraud proof");
        emit SettlementChallenged(channelId, msg.sender);
    }
}
