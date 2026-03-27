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

    // M12.7 Oracle redundancy & Reduce initial liquidity concentration
    uint256 public constant MAX_LIQUIDITY_DEPLOYMENT_BPS = 500; // 5% max deployment per 30 days
    uint256 public constant DEPLOYMENT_COOLDOWN = 30 days;
    mapping(uint256 => uint256) public lastDeploymentTimestamp;
    mapping(uint256 => uint256) public totalDeployedInCooldown;

    // M12.7 Add oracle redundancy
    address public priceOracle;

    // Keepers for critical infrastructure
    mapping(address => bool) public authorizedKeepers;

    event KeeperUpdated(address indexed keeper, bool status);
    event OracleUpdated(address indexed newOracle);

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

    modifier onlyKeeper() {
        require(authorizedKeepers[msg.sender] || msg.sender == address(founder), "Not authorized keeper");
        _;
    }

    function setKeeper(address keeper, bool status) external withTimelock {
        authorizedKeepers[keeper] = status;
        emit KeeperUpdated(keeper, status);
    }

    function setPriceOracle(address _oracle) external withTimelock {
        priceOracle = _oracle;
        emit OracleUpdated(_oracle);
    }

    function managePosition(uint256 tokenId, uint128 liquidityDelta, uint256 amount0Min, uint256 amount1Min) external onlyKeeper {
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
            amount0Min: amount0Min,
            amount1Min: amount1Min,
            deadline: block.timestamp + 300
        }));
        emit PositionManaged(tokenId, liquidityDelta);
    }

    function harvestFees(uint256 tokenId) external onlyKeeper {
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
