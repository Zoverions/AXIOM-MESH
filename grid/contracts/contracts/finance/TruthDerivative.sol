// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

// Individual Derivative Token Contract
contract TruthPositionToken is ERC20, Ownable {
    constructor(string memory name, string memory symbol, address _owner) ERC20(name, symbol) Ownable(_owner) {}

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) external onlyOwner {
        _burn(from, amount);
    }
}

// Main Truth Derivative Market Contract
contract TruthDerivative is Ownable, ReentrancyGuard {
    IERC20 public collateralToken;
    address public truthOracle;

    enum ClaimStatus { PENDING, RESOLVED_TRUE, RESOLVED_FALSE }

    struct ClaimMarket {
        address longToken;
        address shortToken;
        uint256 totalLongShares;
        uint256 totalShortShares;
        ClaimStatus status;
        uint256 resolvedAt;
    }

    mapping(bytes32 => ClaimMarket) public markets;

    event MarketCreated(bytes32 indexed claimId, address longToken, address shortToken);
    event PositionMinted(bytes32 indexed claimId, address indexed user, bool isLong, uint256 amount);
    event MarketResolved(bytes32 indexed claimId, bool result);
    event RewardClaimed(bytes32 indexed claimId, address indexed user, uint256 amount);

    constructor(address _collateralToken, address _truthOracle) Ownable(msg.sender) {
        collateralToken = IERC20(_collateralToken);
        truthOracle = _truthOracle;
    }

    function setTruthOracle(address _truthOracle) external onlyOwner {
        truthOracle = _truthOracle;
    }

    function createMarket(bytes32 claimId) external {
        require(markets[claimId].longToken == address(0), "Market already exists");

        TruthPositionToken longToken = new TruthPositionToken("Truth LONG", "TLONG", address(this));
        TruthPositionToken shortToken = new TruthPositionToken("Truth SHORT", "TSHORT", address(this));

        markets[claimId] = ClaimMarket({
            longToken: address(longToken),
            shortToken: address(shortToken),
            totalLongShares: 0,
            totalShortShares: 0,
            status: ClaimStatus.PENDING,
            resolvedAt: 0
        });

        emit MarketCreated(claimId, address(longToken), address(shortToken));
    }

    function mintPosition(bytes32 claimId, bool isLong, uint256 amount) external nonReentrant {
        ClaimMarket storage market = markets[claimId];
        require(market.longToken != address(0), "Market does not exist");
        require(market.status == ClaimStatus.PENDING, "Market already resolved");
        require(amount > 0, "Amount must be > 0");

        require(collateralToken.transferFrom(msg.sender, address(this), amount), "Collateral transfer failed");

        if (isLong) {
            TruthPositionToken(market.longToken).mint(msg.sender, amount);
            market.totalLongShares += amount;
        } else {
            TruthPositionToken(market.shortToken).mint(msg.sender, amount);
            market.totalShortShares += amount;
        }

        emit PositionMinted(claimId, msg.sender, isLong, amount);
    }

    // Called by the Oracle to resolve the market
    function resolveClaim(bytes32 claimId, bool result) external {
        require(msg.sender == truthOracle, "Only TruthOracle can resolve");
        ClaimMarket storage market = markets[claimId];
        require(market.longToken != address(0), "Market does not exist");
        require(market.status == ClaimStatus.PENDING, "Market already resolved");

        if (result) {
            market.status = ClaimStatus.RESOLVED_TRUE;
        } else {
            market.status = ClaimStatus.RESOLVED_FALSE;
        }
        market.resolvedAt = block.timestamp;

        emit MarketResolved(claimId, result);
    }

    function claimReward(bytes32 claimId) external nonReentrant {
        ClaimMarket storage market = markets[claimId];
        require(market.status != ClaimStatus.PENDING, "Market not resolved");

        uint256 userShares = 0;
        uint256 totalWinningShares = 0;
        uint256 totalCollateral = market.totalLongShares + market.totalShortShares;

        if (market.status == ClaimStatus.RESOLVED_TRUE) {
            userShares = TruthPositionToken(market.longToken).balanceOf(msg.sender);
            totalWinningShares = market.totalLongShares;
            if (userShares > 0) {
                TruthPositionToken(market.longToken).burn(msg.sender, userShares);
            }
        } else {
            userShares = TruthPositionToken(market.shortToken).balanceOf(msg.sender);
            totalWinningShares = market.totalShortShares;
            if (userShares > 0) {
                TruthPositionToken(market.shortToken).burn(msg.sender, userShares);
            }
        }

        uint256 reward = 0;

        if (totalWinningShares == 0) {
            // Refund mechanism if no one held the winning token
            uint256 longShares = TruthPositionToken(market.longToken).balanceOf(msg.sender);
            uint256 shortShares = TruthPositionToken(market.shortToken).balanceOf(msg.sender);

            if (longShares > 0) {
                TruthPositionToken(market.longToken).burn(msg.sender, longShares);
                reward += longShares;
            }
            if (shortShares > 0) {
                TruthPositionToken(market.shortToken).burn(msg.sender, shortShares);
                reward += shortShares;
            }
            require(reward > 0, "No shares to refund");
        } else {
            require(userShares > 0, "No winning shares");
            reward = (userShares * totalCollateral) / totalWinningShares;
        }

        require(collateralToken.transfer(msg.sender, reward), "Reward transfer failed");

        emit RewardClaimed(claimId, msg.sender, reward);
    }
}
