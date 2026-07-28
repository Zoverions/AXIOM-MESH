// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@layerzerolabs/lz-evm-oapp-v2/contracts/oapp/OApp.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import { Origin } from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/ILayerZeroEndpointV2.sol";
import { MessagingFee } from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/ILayerZeroEndpointV2.sol";
import "./FounderCommitment.sol";
import "./UniversalDistributionPool.sol";
import "./ShadowBridge.sol";

// TODO ID: Top-Level To Do 7 - Multi-Chain Bridging & Rating System
contract CrossChainBridge is OApp {
    FounderCommitment public immutable founder;
    UniversalDistributionPool public immutable pool;
    ShadowBridge public immutable shadow;

    struct PendingClaim {
        address recipient;
        uint256 amount;
        bytes32 zkProof;
        uint256 timestamp;
    }

    struct BridgeOracleHooks {
        address oracleContract;
        uint256 ratingThreshold;
        uint256 pollingInterval;
        uint256 quorumRequired;
        bool enabled;
    }

    struct PayrollCommitment {
        bytes32 commitmentHash;
        uint256 committedAt;
    }

    struct CachedBridgeRating {
        uint256 rating;
        uint256 quorum;
        uint256 lastUpdateTimestamp;
        uint256 cachedAt;
    }

    BridgeOracleHooks public oracleHooks;
    bool public mevProtectionEnabled;
    uint256 public commitDelay = 30 seconds;
    uint256 public commitExpiry = 20 minutes;

    mapping(address => PayrollCommitment) public payrollCommitments;
    mapping(uint32 => CachedBridgeRating) public bridgeRatingCache;

    mapping(bytes32 => PendingClaim) public pendingClaims;
    mapping(uint32 => uint256) public chainFinalityBlocks;

    event ArbitrageExecuted(uint256 profit, address token);
    event ClaimReceived(bytes32 indexed guid, address recipient, uint256 amount);
    event ClaimRedeemed(bytes32 indexed guid, address recipient, uint256 amount);
    event OracleHooksUpdated(address oracleContract, uint256 ratingThreshold, uint256 pollingInterval, uint256 quorumRequired, bool enabled);
    event BridgeRatingCached(uint32 indexed dstEid, uint256 rating, uint256 quorum, uint256 lastUpdateTimestamp, uint256 cachedAt);
    event BridgeRatingCacheInvalidated(uint32 indexed dstEid);
    event PayrollCommitted(address indexed user, bytes32 indexed commitmentHash);
    event MEVProtectionUpdated(bool enabled, uint256 commitDelay, uint256 commitExpiry);

    constructor(address _endpoint, address _founder, address payable _pool, address _shadow) OApp(_endpoint, msg.sender) Ownable(msg.sender) {
        founder = FounderCommitment(_founder);
        pool = UniversalDistributionPool(_pool);
        shadow = ShadowBridge(_shadow);

        oracleHooks = BridgeOracleHooks({
            oracleContract: address(0), // Can be updated by owner to point to a WeightOracle or BridgeRatingOracle
            ratingThreshold: 80,
            pollingInterval: 10 minutes,
            quorumRequired: 3,
            enabled: false
        });
    }

    function updateOracleHooks(address _oracleContract, uint256 _ratingThreshold, uint256 _pollingInterval, uint256 _quorumRequired, bool _enabled) external onlyOwner {
        oracleHooks = BridgeOracleHooks({
            oracleContract: _oracleContract,
            ratingThreshold: _ratingThreshold,
            pollingInterval: _pollingInterval,
            quorumRequired: _quorumRequired,
            enabled: _enabled
        });
        emit OracleHooksUpdated(_oracleContract, _ratingThreshold, _pollingInterval, _quorumRequired, _enabled);
    }

    function invalidateBridgeRatingCache(uint32 dstEid) external onlyOwner {
        delete bridgeRatingCache[dstEid];
        emit BridgeRatingCacheInvalidated(dstEid);
    }

    function refreshBridgeRatingCache(uint32 dstEid) external {
        _readBridgeRating(dstEid, true);
    }

    /// @notice Commit hash for bridgePayroll reveal path when MEV protection is enabled.
    /// @dev commitmentHash must be keccak256(abi.encode(user, amount, dstEid, options, zkProof, salt)).
    function commitBridgePayroll(bytes32 commitmentHash) external {
        require(commitmentHash != bytes32(0), "Invalid commitment");
        payrollCommitments[msg.sender] = PayrollCommitment({
            commitmentHash: commitmentHash,
            committedAt: block.timestamp
        });
        emit PayrollCommitted(msg.sender, commitmentHash);
    }

    function updateMEVProtection(bool _enabled, uint256 _commitDelay, uint256 _commitExpiry) external onlyOwner {
        require(_commitExpiry > _commitDelay, "Expiry must exceed delay");
        mevProtectionEnabled = _enabled;
        commitDelay = _commitDelay;
        commitExpiry = _commitExpiry;
        emit MEVProtectionUpdated(_enabled, _commitDelay, _commitExpiry);
    }

    // LayerZero omnichain payroll/UBI transfer
    function bridgePayroll(
        uint256 amount,
        uint32 dstEid,
        bytes calldata options,
        bytes32 zkProof,
        bytes32 salt
    ) external payable {
        _bridgePayroll(msg.sender, amount, dstEid, options, zkProof, salt, msg.value);
    }

    function _bridgePayroll(
        address payer,
        uint256 amount,
        uint32 dstEid,
        bytes calldata options,
        bytes32 zkProof,
        bytes32 salt,
        uint256 nativeFee
    ) internal {
        if (mevProtectionEnabled) {
            PayrollCommitment memory commitment = payrollCommitments[payer];
            require(commitment.commitmentHash != bytes32(0), "Commitment missing");
            require(block.timestamp >= commitment.committedAt + commitDelay, "Commit delay active");
            require(block.timestamp <= commitment.committedAt + commitExpiry, "Commitment expired");

            bytes32 revealHash = keccak256(abi.encode(payer, amount, dstEid, options, zkProof, salt));
            require(revealHash == commitment.commitmentHash, "Commitment mismatch");
            delete payrollCommitments[payer];
        }

        if (oracleHooks.enabled) {
            (uint256 currentRating, uint256 quorum, uint256 lastUpdateTimestamp) = _readBridgeRating(dstEid, false);
            require(currentRating >= oracleHooks.ratingThreshold, "Bridge path rating too low");
            require(quorum >= oracleHooks.quorumRequired, "Bridge path quorum not met");
            require(block.timestamp <= lastUpdateTimestamp + oracleHooks.pollingInterval, "Bridge path rating is stale");
        }
        pool.distribute(payer, amount, zkProof);
        bytes memory payload = abi.encode(payer, amount, zkProof);
        _lzSend(dstEid, payload, options, MessagingFee(nativeFee, 0), payable(payer));
    }

    function batchBridgePayroll(
        uint256[] calldata amounts,
        uint32[] calldata dstEids,
        bytes[] calldata optionsList,
        bytes32[] calldata zkProofs,
        bytes32[] calldata salts
    ) external payable {
        require(msg.value == 0, "Batch bridge does not support native fees");
        uint256 count = amounts.length;
        require(
            count == dstEids.length &&
            count == optionsList.length &&
            count == zkProofs.length &&
            count == salts.length,
            "Mismatched batch arrays"
        );
        require(count > 0, "Empty batch");

        for (uint256 i = 0; i < count; i++) {
            _bridgePayroll(msg.sender, amounts[i], dstEids[i], optionsList[i], zkProofs[i], salts[i], 0);
        }
    }

    // Arbitrage function that acts on price sync data to benefit the platform
    function executeArbitrage(uint256 amount, uint32 dstEid, bytes calldata options) external payable {
        require(msg.sender == address(founder), "Only platform can execute arbitrage");
        // Simulate arbitrary logic to sync prices and make platform profit
        uint256 profit = amount / 10;
        emit ArbitrageExecuted(profit, address(0));
        bytes memory payload = abi.encode(msg.sender, amount, bytes32(0));
        _lzSend(dstEid, payload, options, MessagingFee(msg.value, 0), payable(msg.sender));
    }

    function _lzReceive(Origin calldata _origin, bytes32 _guid, bytes calldata payload, address _executor, bytes calldata _extraData) internal override {
        // Receive shadow contribution or robot payroll on destination chain
        (address recipient, uint256 amount, bytes32 zkProof) = abi.decode(payload, (address, uint256, bytes32));
        pendingClaims[_guid] = PendingClaim({
            recipient: recipient,
            amount: amount,
            zkProof: zkProof,
            timestamp: block.timestamp
        });
        emit ClaimReceived(_guid, recipient, amount);
    }

    function claimRedemption(bytes32 _guid) external {
        uint256 chainId;
        assembly {
            chainId := chainid()
        }
        require(chainId == 369 || chainId == 943 || chainId == 31337, "Redemption only permitted on PulseChain");

        PendingClaim memory claim = pendingClaims[_guid];
        require(claim.timestamp > 0, "Claim not found");
        require(block.timestamp >= claim.timestamp + 1 hours, "Finality delay not met");

        delete pendingClaims[_guid];
        pool.distribute(claim.recipient, claim.amount, claim.zkProof);
        emit ClaimRedeemed(_guid, claim.recipient, claim.amount);
    }

    function interceptClaim(bytes32 _guid) external onlyOwner {
        require(pendingClaims[_guid].timestamp > 0, "Claim not found");
        delete pendingClaims[_guid];
    }

    function _readBridgeRating(uint32 dstEid, bool forceRefresh) internal returns (uint256 rating, uint256 quorum, uint256 lastUpdateTimestamp) {
        require(oracleHooks.oracleContract != address(0), "Oracle contract not configured");

        CachedBridgeRating memory cached = bridgeRatingCache[dstEid];
        bool cacheFresh = !forceRefresh &&
            cached.cachedAt != 0 &&
            block.timestamp <= cached.cachedAt + oracleHooks.pollingInterval &&
            block.timestamp <= cached.lastUpdateTimestamp + oracleHooks.pollingInterval;

        if (cacheFresh) {
            return (cached.rating, cached.quorum, cached.lastUpdateTimestamp);
        }

        (bool success, bytes memory data) = oracleHooks.oracleContract.staticcall(abi.encodeWithSignature("getBridgeRating(uint32)", dstEid));
        require(success, "Oracle call failed");
        (rating, quorum, lastUpdateTimestamp) = abi.decode(data, (uint256, uint256, uint256));

        bridgeRatingCache[dstEid] = CachedBridgeRating({
            rating: rating,
            quorum: quorum,
            lastUpdateTimestamp: lastUpdateTimestamp,
            cachedAt: block.timestamp
        });
        emit BridgeRatingCached(dstEid, rating, quorum, lastUpdateTimestamp, block.timestamp);
    }
}
