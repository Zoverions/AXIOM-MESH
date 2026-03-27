// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./CognitiveFrictionVerifier.sol";
import "./StigmergicStateChannel.sol";
import "./MemoryLattice.sol";

struct ConsequenceArtifact {
    bytes32 proposalHash;           // Original action hash
    bytes32 firstOrderRoot;         // Direct effect
    bytes32 secondOrderRoot;        // Ripple effects
    bytes32 thirdOrderRoot;         // Higher-order systemic impact
    bytes32 attentionScopeHash;     // Must match declared A
    bytes32 cognitiveFrictionScore; // PoER + friction check
}

contract HorizonForecast {
    CognitiveFrictionVerifier public poerVerifier;
    StigmergicStateChannel public channel;
    MemoryLattice public memoryLattice;

    mapping(bytes32 => bytes32) public consequenceCache; // proposalHash => consequenceTreeRoot

    enum ForecastStatus { PENDING, PASSED, FAILED }

    struct FuturePool {
        uint256 totalPassStake;
        uint256 totalFailStake;
        ForecastStatus status;
        uint256 resolvedAt;
        mapping(address => uint256) passStakes;
        mapping(address => uint256) failStakes;
    }

    mapping(bytes32 => FuturePool) public futuresPools;

    event HorizonForecastGenerated(bytes32 indexed proposalHash, uint8 orderDepth, bool approved);
    event HorizonChallenged(bytes32 indexed proposalHash, address challenger, string reason);
    event ConsequenceTreeCached(bytes32 indexed proposalHash, bytes32 consequenceTreeRoot);
    event FutureTraded(bytes32 indexed proposalHash, address trader, bool predictPass, uint256 amount);
    event FutureRewardClaimed(bytes32 indexed proposalHash, address trader, uint256 amount);

    constructor(address _poer, address _channel) {
        poerVerifier = CognitiveFrictionVerifier(_poer);
        channel = StigmergicStateChannel(_channel);
    }

    function setMemoryLattice(address _lattice) external {
        memoryLattice = MemoryLattice(_lattice);
    }

    function verifyForecast(bytes calldata horizonProof) external returns (bool) {
        if (horizonProof.length > 0) {
            bytes32 proofHash = keccak256(horizonProof);
            return poerVerifier.verifyHigherOrderFriction(proofHash, horizonProof);
        }
        return true;
    }

    // M16.1: Consequence Graph Caching
    function cacheConsequenceTree(
        bytes32 proposalHash,
        bytes32 consequenceTreeRoot,
        bytes calldata simulationProof
    ) external {
        require(consequenceCache[proposalHash] == bytes32(0), "Consequence tree already cached");

        bool frictionPassed = poerVerifier.verifyProofWithFriction(proposalHash, simulationProof);
        require(frictionPassed, "Cognitive Friction failed on higher-order consequences cache");

        consequenceCache[proposalHash] = consequenceTreeRoot;
        emit ConsequenceTreeCached(proposalHash, consequenceTreeRoot);
    }

    function tradeConsequenceFuture(bytes32 proposalHash, bool predictPass, uint256 amount) external {
        require(amount > 0, "Amount must be greater than zero");
        FuturePool storage pool = futuresPools[proposalHash];
        require(pool.status == ForecastStatus.PENDING, "Futures pool is not pending");

        IAXM token = channel.axmToken();
        require(token.transferFrom(msg.sender, address(this), amount), "Token transfer failed");

        if (predictPass) {
            pool.totalPassStake += amount;
            pool.passStakes[msg.sender] += amount;
        } else {
            pool.totalFailStake += amount;
            pool.failStakes[msg.sender] += amount;
        }

        emit FutureTraded(proposalHash, msg.sender, predictPass, amount);
    }

    function claimFutureRewards(bytes32 proposalHash) external {
        FuturePool storage pool = futuresPools[proposalHash];
        require(pool.status != ForecastStatus.PENDING, "Futures pool is not resolved");

        if (pool.status == ForecastStatus.PASSED) {
            require(block.timestamp >= pool.resolvedAt + 7 days, "Challenge period active");
        }

        uint256 reward = 0;
        if (pool.status == ForecastStatus.PASSED) {
            uint256 stake = pool.passStakes[msg.sender];
            require(stake > 0, "No winning stake");
            pool.passStakes[msg.sender] = 0;
            reward = stake;
            if (pool.totalPassStake > 0 && pool.totalFailStake > 0) {
                reward += (stake * pool.totalFailStake) / pool.totalPassStake;
            }
        } else if (pool.status == ForecastStatus.FAILED) {
            uint256 stake = pool.failStakes[msg.sender];
            require(stake > 0, "No winning stake");
            pool.failStakes[msg.sender] = 0;
            reward = stake;
            if (pool.totalFailStake > 0 && pool.totalPassStake > 0) {
                reward += (stake * pool.totalPassStake) / pool.totalFailStake;
            }
        }

        require(reward > 0, "No reward to claim");

        IAXM token = channel.axmToken();
        require(token.transfer(msg.sender, reward), "Reward transfer failed");

        emit FutureRewardClaimed(proposalHash, msg.sender, reward);
    }

    // Called by transformer proposer via AICP before any high-stakes action
    function generateForecast(
        bytes32 proposalHash,
        bytes calldata simulationProof,     // ZK proof of 2nd/3rd-order simulation
        bytes32 firstOrderRoot,
        bytes32 secondOrderRoot,
        bytes32 thirdOrderRoot
    ) external returns (bool approved) {
        if (consequenceCache[proposalHash] != bytes32(0)) {
            // Short-circuit using cached tree root.
            emit HorizonForecastGenerated(proposalHash, 3, true);

            FuturePool storage poolCached = futuresPools[proposalHash];
            if (poolCached.status == ForecastStatus.PENDING) {
                poolCached.status = ForecastStatus.PASSED;
                poolCached.resolvedAt = block.timestamp;
            }
            return true;
        }

        bool frictionPassed = poerVerifier.verifyProofWithFriction(proposalHash, simulationProof);
        require(frictionPassed, "Cognitive Friction failed on higher-order consequences");

        if (address(memoryLattice) != address(0)) {
            memoryLattice.getLatticePath(proposalHash, firstOrderRoot);
        }

        FuturePool storage pool = futuresPools[proposalHash];
        if (pool.status == ForecastStatus.PENDING) {
            pool.status = ForecastStatus.PASSED;
            pool.resolvedAt = block.timestamp;
        }

        // Guardian Sentinel can still challenge
        emit HorizonForecastGenerated(proposalHash, 3, true);
        return true;
    }

    function challengeForecast(bytes32 proposalHash, bytes calldata fraudProof) external {
        FuturePool storage pool = futuresPools[proposalHash];
        if (pool.status == ForecastStatus.PENDING || pool.status == ForecastStatus.PASSED) {
            pool.status = ForecastStatus.FAILED;
            pool.resolvedAt = block.timestamp;
        }
        // Guardian or any agent can slash bad forecasts
        emit HorizonChallenged(proposalHash, msg.sender, "Higher-order consequence violation");
    }
}
