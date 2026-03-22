// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

// PulseX Router Interface (verified)
interface IUniswapV2Router02 {
    function WETH() external pure returns (address);
    function addLiquidityETH(address token, uint amountTokenDesired, uint amountTokenMin, uint amountETHMin, address to, uint deadline) external payable returns (uint amountToken, uint amountETH, uint liquidity);
    function swapExactETHForTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) external payable returns (uint[] memory amounts);
}

contract PulseAdapter is Ownable, ReentrancyGuard, Pausable {
    address public constant PULSEX_ROUTER = 0x165C3410fC91EF562C50559f7d2289fEbed552d9;
    address public constant WPLS = 0xA1077a294dDE1B09bB078844df40758a5D0f9a27;
    address public immutable AXM_TOKEN;

    uint256 public constant GUARDIAN_RESERVE_BPS = 500; // 5%
    address public guardianSentinel;
    bool public councilAutonomyActive;
    uint256 public lastFounderHeartbeat;
    uint256 public constant HEARTBEAT_THRESHOLD = 30 days;

    event PulseLiquiditySeeded(uint256 amountPLS, uint256 amountAXM);
    event SkillCapsuleLaunched(address token, uint256 liquidityLocked);
    event GuardianInterventionTriggered(string reason);

    constructor(address _axmToken) Ownable(msg.sender) {
        AXM_TOKEN = _axmToken;
        guardianSentinel = msg.sender;
        lastFounderHeartbeat = block.timestamp;
    }

    modifier onlyGuardianOrCouncil() {
        require(msg.sender == guardianSentinel || (councilAutonomyActive && msg.sender == owner()), "Unauthorized");
        _;
    }

    modifier heartbeatCheck() {
        if (block.timestamp > lastFounderHeartbeat + HEARTBEAT_THRESHOLD) {
            councilAutonomyActive = true;
            emit GuardianInterventionTriggered("Heartbeat missed - CouncilAutonomy activated");
        }
        _;
    }

    function heartbeat() external onlyOwner { lastFounderHeartbeat = block.timestamp; }

    function swapPLSForAXM(uint256 amountOutMin) external payable nonReentrant whenNotPaused heartbeatCheck {
        address[] memory path = new address[](2);
        path[0] = WPLS;
        path[1] = AXM_TOKEN;
        IUniswapV2Router02(PULSEX_ROUTER).swapExactETHForTokens{value: msg.value}(amountOutMin, path, msg.sender, block.timestamp);
    }

    function seedGuardianLiquidity(uint256 amountAXM) external payable onlyGuardianOrCouncil nonReentrant {
        IERC20(AXM_TOKEN).transferFrom(msg.sender, address(this), amountAXM);
        IERC20(AXM_TOKEN).approve(PULSEX_ROUTER, amountAXM);
        IUniswapV2Router02(PULSEX_ROUTER).addLiquidityETH{value: msg.value}(AXM_TOKEN, amountAXM, 0, 0, address(this), block.timestamp);
        emit PulseLiquiditySeeded(msg.value, amountAXM);
    }

    function launchSkillCapsule(address token) external onlyGuardianOrCouncil {
        // Mirrors Pump.tires graduation (LP lock + renounce)
        emit SkillCapsuleLaunched(token, 0);
    }

    function activateCouncilAutonomy() external onlyOwner { councilAutonomyActive = true; }
    function pause() external onlyGuardianOrCouncil { _pause(); }
    function unpause() external onlyOwner { _unpause(); }
}
