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

    uint256 public lastHarvest;
    uint256 public constant HARVEST_INTERVAL = 4 hours;

    uint256 public lastAdminAction;
    uint256 public constant ADMIN_TIMELOCK = 2 days;
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    bool public initialLiquidityBypassed;
    event InitialLiquidityBypassed(address indexed admin, uint256 timestamp);

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

    function managePosition(uint256 tokenId, uint128 liquidityDelta) external {
        // We approve the NPM contract to use the token in production:
        // address token0 = ...
        // address token1 = ...
        // IERC20(token0).approve(address(npm), type(uint256).max);
        // IERC20(token1).approve(address(npm), type(uint256).max);

        // Increase or decrease liquidity (governance-gated in production)
        npm.increaseLiquidity(INonfungiblePositionManager.IncreaseLiquidityParams({
            tokenId: tokenId,
            amount0Desired: liquidityDelta,
            amount1Desired: liquidityDelta,
            amount0Min: 0,
            amount1Min: 0,
            deadline: block.timestamp + 300
        }));
        emit PositionManaged(tokenId, liquidityDelta);
    }

    function harvestFees(uint256 tokenId) external {
        require(block.timestamp >= lastHarvest + HARVEST_INTERVAL, "Too soon");
        (uint256 amount0, uint256 amount1) = npm.collect(INonfungiblePositionManager.CollectParams({
            tokenId: tokenId,
            recipient: address(distPool),
            amount0Max: type(uint128).max,
            amount1Max: type(uint128).max
        }));
        lastHarvest = block.timestamp;
        emit FeesHarvested(amount0, amount1);
    }

    modifier withTimelock() {
        require(
            block.timestamp >= lastAdminAction + ADMIN_TIMELOCK,
            "LiquidityManager: Timelock not expired"
        );
        _;
        lastAdminAction = block.timestamp;
    }

    function bypassInitialLiquidity() external withTimelock {
        require(founder.verifyFounder(""), "LiquidityManager: Founder verification failed");
        require(!initialLiquidityBypassed, "LiquidityManager: Already bypassed");

        initialLiquidityBypassed = true;

        emit InitialLiquidityBypassed(msg.sender, block.timestamp);
    }

    function _authorizeUpgrade(address) internal override {
        require(founder.verifyFounder(""), "Founder verification failed");
    }
}
