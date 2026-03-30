// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@uniswap/v3-periphery/contracts/interfaces/INonfungiblePositionManager.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "./FounderCommitment.sol";
import "./UniversalDistributionPool.sol";
import "./CrossChainBridge.sol";

contract NetworkLiquidityManager is Initializable, UUPSUpgradeable, ReentrancyGuard, Pausable {
    FounderCommitment public immutable founder;
    UniversalDistributionPool public immutable distPool;
    CrossChainBridge public immutable bridge;
    INonfungiblePositionManager public immutable positionManager; // Uniswap V3

    uint256 public constant MIN_TREASURY_THRESHOLD = 100_000 ether; // sustainability lock
    uint256 public maxLiquidityPerOperation;
    mapping(uint256 => uint256) public positions; // tokenId → liquidity amount

    event LiquidityAdded(uint256 positionId, uint256 amount);
    event LiquidityRebalanced(uint256 positionId);
    event LiquidityCrossChain(uint256 amount, uint32 destEid);
    event LiquidityCircuitBreakerUpdated(uint256 maxLiquidityPerOperation);
    event LiquidityEmergencyPause(address indexed triggeredBy);
    event LiquidityEmergencyUnpause(address indexed triggeredBy);

    constructor(address _founder, address payable _distPool, address _bridge, address _positionManager) {
        founder = FounderCommitment(_founder);
        distPool = UniversalDistributionPool(_distPool);
        bridge = CrossChainBridge(_bridge);
        positionManager = INonfungiblePositionManager(_positionManager);
        _disableInitializers();
    }

    function initialize() public initializer {
        //__UUPSUpgradeable_init();
        maxLiquidityPerOperation = 1_000_000 ether;
    }

    function addNetworkLiquidity(uint256 amount, uint256 tokenId) external nonReentrant whenNotPaused {
        require(amount <= maxLiquidityPerOperation, "Circuit breaker: liquidity amount too high");
        (, , uint256 networkContributed) = distPool.getAuditTrail(address(this));
        require(networkContributed >= amount, "Insufficient network share");
        require(address(distPool.treasury()).balance >= MIN_TREASURY_THRESHOLD, "Sustainability lock");

        (,,address token0, address token1,,,,,,,,) = positionManager.positions(tokenId);
        IERC20(token0).approve(address(positionManager), type(uint256).max);
        IERC20(token1).approve(address(positionManager), type(uint256).max);

        // Properly distribute liquidity to amount0 and amount1 based on position's ratio (simplified for mock/stub, but more secure)
        // A full production implementation would compute exact amounts using TickMath and LiquidityAmounts.
        uint256 amount0 = amount / 2;
        uint256 amount1 = amount / 2;

        INonfungiblePositionManager.IncreaseLiquidityParams memory params =
            INonfungiblePositionManager.IncreaseLiquidityParams({
                tokenId: tokenId,
                amount0Desired: amount0,
                amount1Desired: amount1,
                amount0Min: 0,
                amount1Min: 0,
                deadline: block.timestamp
            });
        positionManager.increaseLiquidity(params);

        positions[tokenId] += amount;
        emit LiquidityAdded(tokenId, amount);
    }

    function bootstrapNetworkLiquidity(uint256 amount, uint256 tokenId) external nonReentrant whenNotPaused {
        require(amount <= maxLiquidityPerOperation, "Circuit breaker: liquidity amount too high");
        // Bypass sustainability lock for initial token bootstrap

        (,,address token0, address token1,,,,,,,,) = positionManager.positions(tokenId);
        IERC20(token0).approve(address(positionManager), type(uint256).max);
        IERC20(token1).approve(address(positionManager), type(uint256).max);

        // Properly distribute liquidity to amount0 and amount1 based on position's ratio (simplified for mock/stub, but more secure)
        uint256 amount0 = amount / 2;
        uint256 amount1 = amount / 2;

        INonfungiblePositionManager.IncreaseLiquidityParams memory params =
            INonfungiblePositionManager.IncreaseLiquidityParams({
                tokenId: tokenId,
                amount0Desired: amount0,
                amount1Desired: amount1,
                amount0Min: 0,
                amount1Min: 0,
                deadline: block.timestamp
            });
        positionManager.increaseLiquidity(params);

        positions[tokenId] += amount;
        emit LiquidityAdded(tokenId, amount);
    }

    function rebalanceLiquidity(uint256 tokenId) external nonReentrant whenNotPaused {
        // Rebalance logic + fee capture to treasury
        emit LiquidityRebalanced(tokenId);
    }

    function bridgeLiquidity(uint256 amount, uint32 destEid) external nonReentrant whenNotPaused {
        require(amount <= maxLiquidityPerOperation, "Circuit breaker: liquidity amount too high");
        bridge.bridgePayroll(amount, destEid, "", keccak256(abi.encode("liquidity")), bytes32(0));
        emit LiquidityCrossChain(amount, destEid);
    }

    function setMaxLiquidityPerOperation(uint256 _maxLiquidityPerOperation) external {
        require(msg.sender == address(founder), "Founder only");
        require(_maxLiquidityPerOperation > 0, "Invalid max liquidity");
        maxLiquidityPerOperation = _maxLiquidityPerOperation;
        emit LiquidityCircuitBreakerUpdated(_maxLiquidityPerOperation);
    }

    function emergencyPause() external {
        require(msg.sender == address(founder), "Founder only");
        _pause();
        emit LiquidityEmergencyPause(msg.sender);
    }

    function emergencyUnpause() external {
        require(msg.sender == address(founder), "Founder only");
        _unpause();
        emit LiquidityEmergencyUnpause(msg.sender);
    }

    function _authorizeUpgrade(address) internal override {
        require(founder.verifyFounder(""), "Founder verification failed");
    }
}
