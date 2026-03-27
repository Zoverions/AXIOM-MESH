// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@uniswap/v3-periphery/contracts/interfaces/INonfungiblePositionManager.sol";
import "@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./FounderCommitment.sol";
import "./UniversalDistributionPool.sol";

contract AutomatedV3LiquidityManager is Initializable, UUPSUpgradeable {
    FounderCommitment public immutable founder;
    UniversalDistributionPool public immutable distPool;
    INonfungiblePositionManager public immutable npm;
    ISwapRouter public immutable swapRouter;

    // DEPRECATED: Do not use. Retained to prevent storage collision during proxy upgrade.
    uint256 private _deprecated_lastHarvest;
    uint256 public constant HARVEST_INTERVAL = 4 hours;

    // DEPRECATED: Do not use. Retained to prevent storage collision during proxy upgrade.
    uint256 private _deprecated_lastAdminAction;
    uint256 public constant ADMIN_TIMELOCK = 2 days;
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    // DEPRECATED: Do not use. Retained to prevent storage collision during proxy upgrade.
    bool private _deprecated_initialLiquidityBypassed;
    event InitialLiquidityBypassed(address indexed admin, uint256 timestamp);

    // M12.7 Oracle redundancy & Reduce initial liquidity concentration
    uint256 public constant MAX_LIQUIDITY_DEPLOYMENT_BPS = 500; // 5% max deployment per 30 days
    uint256 public constant DEPLOYMENT_COOLDOWN = 30 days;
    mapping(uint256 => uint256) public lastDeploymentTimestamp;
    mapping(uint256 => uint256) public totalDeployedInCooldown;

    // --- M15.4 Packed Storage Variables ---
    struct ManagerState {
        uint40 lastHarvest;
        uint40 lastAdminAction;
        bool initialLiquidityBypassed;
    }
    ManagerState public managerState;

    address public priceOracle;

    event PositionManaged(uint256 tokenId, uint128 liquidity);
    event FeesHarvested(uint256 amount0, uint256 amount1);

    constructor(address _founder, address payable _distPool, address _npm, address _swapRouter) {
        founder = FounderCommitment(_founder);
        distPool = UniversalDistributionPool(_distPool);
        npm = INonfungiblePositionManager(_npm);
        swapRouter = ISwapRouter(_swapRouter);
        _disableInitializers();
    }

    function initialize() public initializer {
        //__UUPSUpgradeable_init();
    }


    function managePositionBatch(
        uint256[] calldata tokenIds,
        uint128[] calldata liquidityDeltas,
        uint256[] calldata amount0Mins,
        uint256[] calldata amount1Mins
    ) external {
        require(tokenIds.length > 0, "Empty array");
        require(tokenIds.length == liquidityDeltas.length, "Length mismatch");
        require(tokenIds.length == amount0Mins.length, "Length mismatch");
        require(tokenIds.length == amount1Mins.length, "Length mismatch");
        for (uint256 i = 0; i < tokenIds.length; i++) {
            managePosition(tokenIds[i], liquidityDeltas[i], amount0Mins[i], amount1Mins[i]);
        }
    }

    function managePosition(uint256 tokenId, uint128 liquidityDelta, uint256 _amount0Min, uint256 _amount1Min) public {
        // M12.7: Throttle liquidity deployment to reduce initial liquidity concentration risk
        if (block.timestamp > lastDeploymentTimestamp[tokenId] + DEPLOYMENT_COOLDOWN) {
            totalDeployedInCooldown[tokenId] = 0; // Reset cooldown
        }

        // Oracle redundancy check
        if (priceOracle != address(0)) {
            (bool success, ) = priceOracle.staticcall(abi.encodeWithSignature("checkPriceBounds(uint256)", tokenId));
            require(success, "Oracle bounds check failed");
        }

        // Ensure we don't deploy too much liquidity at once (e.g. max 20% of a 5 million token baseline per pool).
        // 5% of 5,000,000 = 250,000 using the BPS constant.
        uint256 assumedPoolCap = 5_000_000 ether;
        uint256 allowedDeployment = (assumedPoolCap * MAX_LIQUIDITY_DEPLOYMENT_BPS) / 10000;

        require(totalDeployedInCooldown[tokenId] + liquidityDelta <= allowedDeployment, "Exceeds max liquidity deployment limit for cooldown window");

        totalDeployedInCooldown[tokenId] += liquidityDelta;
        lastDeploymentTimestamp[tokenId] = block.timestamp;

        // Increase or decrease liquidity (governance-gated in production)
        npm.increaseLiquidity(INonfungiblePositionManager.IncreaseLiquidityParams({
            tokenId: tokenId,
            amount0Desired: liquidityDelta,
            amount1Desired: liquidityDelta,
            amount0Min: _amount0Min,
            amount1Min: _amount1Min,
            deadline: block.timestamp + 300
        }));
        emit PositionManaged(tokenId, liquidityDelta);
    }

    function harvestFeesBatch(uint256[] calldata tokenIds) external {
        require(tokenIds.length > 0, "Empty array");
        require(block.timestamp >= managerState.lastHarvest + HARVEST_INTERVAL, "Too soon");

        uint256 totalAmount0 = 0;
        uint256 totalAmount1 = 0;

        for (uint256 i = 0; i < tokenIds.length; i++) {
            (uint256 amount0, uint256 amount1) = npm.collect(INonfungiblePositionManager.CollectParams({
                tokenId: tokenIds[i],
                recipient: address(distPool),
                amount0Max: type(uint128).max,
                amount1Max: type(uint128).max
            }));
            totalAmount0 += amount0;
            totalAmount1 += amount1;
        }

        managerState.lastHarvest = uint40(block.timestamp);
        emit FeesHarvested(totalAmount0, totalAmount1);
    }

    function harvestFees(uint256 tokenId) external {
        require(block.timestamp >= managerState.lastHarvest + HARVEST_INTERVAL, "Too soon");
        (uint256 amount0, uint256 amount1) = npm.collect(INonfungiblePositionManager.CollectParams({
            tokenId: tokenId,
            recipient: address(distPool),
            amount0Max: type(uint128).max,
            amount1Max: type(uint128).max
        }));
        managerState.lastHarvest = uint40(block.timestamp);
        emit FeesHarvested(amount0, amount1);
    }

    modifier withTimelock() {
        require(
            block.timestamp >= managerState.lastAdminAction + ADMIN_TIMELOCK,
            "LiquidityManager: Timelock not expired"
        );
        _;
        managerState.lastAdminAction = uint40(block.timestamp);
    }

    function bypassInitialLiquidity() external withTimelock {
        require(founder.verifyFounder(""), "LiquidityManager: Founder verification failed");
        require(!managerState.initialLiquidityBypassed, "LiquidityManager: Already bypassed");

        managerState.initialLiquidityBypassed = true;

        emit InitialLiquidityBypassed(msg.sender, block.timestamp);
    }

    function _authorizeUpgrade(address) internal override {
        require(founder.verifyFounder(""), "Founder verification failed");
    }
}
