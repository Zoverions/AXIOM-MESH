// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "./FounderCommitment.sol";
import "./DynamicResourceAllocator.sol";
import "./ComputeBond.sol";
import "./CitizenshipNFT.sol";

interface IStakingRewards {
    function notifyRewardAmount(uint256 reward) external;
}

contract UniversalDistributionPool is Initializable, UUPSUpgradeable, ReentrancyGuard, Pausable {
    FounderCommitment public immutable founder;
    DynamicResourceAllocator public immutable allocator;
    ComputeBond public immutable treasury;
    CitizenshipNFT public immutable citizenship;

    uint256 public networkSharePercentage; // governance-set, default 10
    mapping(address => uint256) public inflows;   // org/gov → total contributed
    mapping(address => uint256) public outflows;  // recipient → total received
    mapping(bytes32 => uint256) public allocations; // taskId → amount
    address public crossChainBridge;
    bool public externalFundsEnabled;
    address public stakingRewards;
    uint256 public stakingRewardShareBps;
    uint256 public maxSingleDistributionAmount;
    uint256 public maxBatchDistributionAmount;
    uint256 public constant ADMIN_TIMELOCK_DELAY = 2 days;
    mapping(address => uint256) public networkContributions;
    mapping(bytes32 => uint256) public queuedAdminOperations;

    event Inflow(address from, uint256 amount, string source);
    event Outflow(address to, uint256 amount, bytes32 zkProofHash);
    event NetworkShareAllocated(uint256 amount);
    event StakingRewardsConfigured(address stakingRewards, uint256 rewardShareBps);
    event StakingRewardsFunded(uint256 amount);
    event DistributionCircuitBreakersUpdated(uint256 maxSingleDistributionAmount, uint256 maxBatchDistributionAmount);
    event DistributionEmergencyPause(address indexed triggeredBy);
    event DistributionEmergencyUnpause(address indexed triggeredBy);
    event AdminOperationQueued(bytes32 indexed operationId, uint256 executeAfter);
    event AdminOperationExecuted(bytes32 indexed operationId);

    constructor(address _founder, address _allocator, address _treasury, address _citizenship) {
        founder = FounderCommitment(_founder);
        allocator = DynamicResourceAllocator(_allocator);
        treasury = ComputeBond(_treasury);
        citizenship = CitizenshipNFT(_citizenship);
        _disableInitializers();
    }

    function initialize(uint256 _defaultShare) public initializer {
        // Default to 60 per policy (60% Network Security Fund, 40% Wealth Generation Pool).
        // Caller may override via _defaultShare; passing 0 applies the canonical 60% default.
        __UUPSUpgradeable_init();
        networkSharePercentage = _defaultShare == 0 ? 60 : _defaultShare;
        externalFundsEnabled = false; // Disabled until Level 3 gate is passed
        maxSingleDistributionAmount = 100_000 ether;
        maxBatchDistributionAmount = 1_000_000 ether;
    }

    function deposit(address from, uint256 amount, string calldata source) external payable nonReentrant whenNotPaused {
        require(
            externalFundsEnabled ||
            msg.sender == address(allocator) ||
            msg.sender == address(treasury) ||
            msg.sender == address(founder) ||
            msg.sender == address(citizenship) ||
            msg.sender == crossChainBridge,
            "External funds disabled until Level 3"
        );
        require(msg.value == amount || IERC20(address(treasury)).transferFrom(from, address(this), amount), "Deposit failed");

        inflows[from] += amount;
        uint256 networkShare = (amount * networkSharePercentage) / 100;
        networkContributions[from] += networkShare;
        uint256 stakingRewardAmount = 0;

        if (msg.value != amount && stakingRewards != address(0) && stakingRewardShareBps > 0) {
            stakingRewardAmount = (amount * stakingRewardShareBps) / 10_000;
            require(IERC20(address(treasury)).transfer(stakingRewards, stakingRewardAmount), "Staking reward transfer failed");
            IStakingRewards(stakingRewards).notifyRewardAmount(stakingRewardAmount);
            emit StakingRewardsFunded(stakingRewardAmount);
        }

        // Auto-send to general network pool
        (bool success, ) = address(treasury).call{value: networkShare}("");
        require(success, "Network share transfer failed");
        emit NetworkShareAllocated(networkShare);

        allocator.allocateToTask(keccak256(abi.encode(from)), "distribution-pool", amount - networkShare - stakingRewardAmount);

        emit Inflow(from, amount, source);
    }

    function distributeBatch(address[] calldata recipients, uint256[] calldata amounts, bytes32 zkProofHash) external nonReentrant whenNotPaused {
        require(msg.sender == address(allocator) || msg.sender == crossChainBridge, "Authorized distributor only");
        require(recipients.length == amounts.length, "Mismatched arrays");

        uint256 totalAmount = 0;
        for (uint256 i = 0; i < amounts.length; i++) {
            totalAmount += amounts[i];
        }
        require(totalAmount <= maxBatchDistributionAmount, "Circuit breaker: batch distribution too high");
        require(address(this).balance >= totalAmount, "Insufficient pool");

        for (uint256 i = 0; i < recipients.length; i++) {
            address to = recipients[i];
            uint256 amount = amounts[i];

            outflows[to] += amount;

            (bool success, ) = to.call{value: amount}("");
            require(success, "Distribution failed");

            emit Outflow(to, amount, zkProofHash);
        }
    }

    function distribute(address to, uint256 amount, bytes32 zkProofHash) external nonReentrant whenNotPaused {
        require((citizenship.balanceOf(msg.sender) > 0 && msg.sender == to) || msg.sender == address(allocator) || msg.sender == crossChainBridge, "Authorized distributor only");
        require(amount <= maxSingleDistributionAmount, "Circuit breaker: distribution too high");
        require(address(this).balance >= amount, "Insufficient pool");

        outflows[to] += amount;

        (bool success, ) = to.call{value: amount}("");
        require(success, "Distribution failed");

        emit Outflow(to, amount, zkProofHash);
    }

    function setCrossChainBridge(address _bridge) external {
        bytes32 operationId = keccak256(abi.encode("setCrossChainBridge", _bridge));
        _consumeAdminTimelock(operationId);
        require(msg.sender == address(founder), "Founder only");
        crossChainBridge = _bridge;
    }

    function setNetworkShare(uint256 newPercentage) external {
        require(allocator.governance().isProposalPassed(keccak256(abi.encode(newPercentage))), "Governance required");
        networkSharePercentage = newPercentage;
    }

    function setExternalFundsEnabled(bool _enabled) external {
        if (msg.sender == address(founder)) {
            bytes32 operationId = keccak256(abi.encode("setExternalFundsEnabled", _enabled));
            _consumeAdminTimelock(operationId);
        }
        require(allocator.governance().isProposalPassed(keccak256(abi.encode(_enabled))) || msg.sender == address(founder), "Governance or founder required");
        externalFundsEnabled = _enabled;
    }

    function setStakingRewards(address _stakingRewards, uint256 _rewardShareBps) external {
        bytes32 operationId = keccak256(abi.encode("setStakingRewards", _stakingRewards, _rewardShareBps));
        _consumeAdminTimelock(operationId);
        require(msg.sender == address(founder), "Founder only");
        require(_rewardShareBps <= 10_000, "Invalid bps");
        stakingRewards = _stakingRewards;
        stakingRewardShareBps = _rewardShareBps;
        emit StakingRewardsConfigured(_stakingRewards, _rewardShareBps);
    }

    function setDistributionCircuitBreakers(uint256 _maxSingleDistributionAmount, uint256 _maxBatchDistributionAmount) external {
        bytes32 operationId = keccak256(
            abi.encode("setDistributionCircuitBreakers", _maxSingleDistributionAmount, _maxBatchDistributionAmount)
        );
        _consumeAdminTimelock(operationId);
        require(msg.sender == address(founder), "Founder only");
        require(_maxSingleDistributionAmount > 0 && _maxBatchDistributionAmount >= _maxSingleDistributionAmount, "Invalid thresholds");
        maxSingleDistributionAmount = _maxSingleDistributionAmount;
        maxBatchDistributionAmount = _maxBatchDistributionAmount;
        emit DistributionCircuitBreakersUpdated(_maxSingleDistributionAmount, _maxBatchDistributionAmount);
    }

    function queueAdminOperation(bytes32 operationId) external {
        require(msg.sender == address(founder), "Founder only");
        require(queuedAdminOperations[operationId] == 0, "Operation already queued");
        uint256 executeAfter = block.timestamp + ADMIN_TIMELOCK_DELAY;
        queuedAdminOperations[operationId] = executeAfter;
        emit AdminOperationQueued(operationId, executeAfter);
    }

    function emergencyPause() external {
        require(msg.sender == address(founder), "Founder only");
        _pause();
        emit DistributionEmergencyPause(msg.sender);
    }

    function emergencyUnpause() external {
        require(msg.sender == address(founder), "Founder only");
        _unpause();
        emit DistributionEmergencyUnpause(msg.sender);
    }

    function getAuditTrail(address entity) external view returns (uint256 totalIn, uint256 totalOut, uint256 networkContributed) {
        totalIn = inflows[entity];
        totalOut = outflows[entity];
        networkContributed = networkContributions[entity];
    }

    function getAuditTrailSummary(address entity) external view returns (uint256 totalIn, uint256 totalOut, uint256 networkContributed) {
        totalIn = inflows[entity];
        totalOut = outflows[entity];
        networkContributed = networkContributions[entity];
    }

    function _authorizeUpgrade(address) internal override {
        require(founder.verifyFounder(""), "Founder verification failed");
    }

    function _consumeAdminTimelock(bytes32 operationId) internal {
        uint256 executeAfter = queuedAdminOperations[operationId];
        require(executeAfter != 0, "Admin timelock: operation not queued");
        require(block.timestamp >= executeAfter, "Admin timelock: delay not met");
        delete queuedAdminOperations[operationId];
        emit AdminOperationExecuted(operationId);
    }

    receive() external payable {}
}
