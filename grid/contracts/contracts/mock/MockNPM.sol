// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@uniswap/v3-periphery/contracts/interfaces/INonfungiblePositionManager.sol";

contract MockNPM is ERC721 {
    address public token0;
    address public token1;

    struct PendingFees {
        uint256 amount0;
        uint256 amount1;
    }

    mapping(uint256 => PendingFees) public pendingFees;

    constructor(address _token0, address _token1) ERC721("MockNPM", "MNPM") {
        token0 = _token0;
        token1 = _token1;
    }

    function mintPosition(address to, uint256 tokenId) external {
        _mint(to, tokenId);
    }

    function setPendingFees(uint256 tokenId, uint256 _amount0, uint256 _amount1) external {
        pendingFees[tokenId] = PendingFees(_amount0, _amount1);
    }

    function positions(uint256 tokenId)
        external
        view
        returns (
            uint96 nonce,
            address operator,
            address _token0,
            address _token1,
            uint24 fee,
            int24 tickLower,
            int24 tickUpper,
            uint128 liquidity,
            uint256 feeGrowthInside0LastX128,
            uint256 feeGrowthInside1LastX128,
            uint128 tokensOwed0,
            uint128 tokensOwed1
        )
    {
        return (0, address(0), token0, token1, 0, 0, 0, 0, 0, 0, 0, 0);
    }

    function collect(INonfungiblePositionManager.CollectParams calldata params)
        external
        returns (uint256 amount0, uint256 amount1)
    {
        PendingFees memory fees = pendingFees[params.tokenId];
        amount0 = fees.amount0;
        amount1 = fees.amount1;

        // Mock transfer fees
        if (amount0 > 0) IERC20(token0).transfer(params.recipient, amount0);
        if (amount1 > 0) IERC20(token1).transfer(params.recipient, amount1);

        // Reset
        pendingFees[params.tokenId] = PendingFees(0, 0);

        return (amount0, amount1);
    }

    function increaseLiquidity(INonfungiblePositionManager.IncreaseLiquidityParams calldata params)
        external
        returns (
            uint128 liquidity,
            uint256 amount0,
            uint256 amount1
        )
    {
        // Mock token transfer
        IERC20(token0).transferFrom(msg.sender, address(this), params.amount0Desired);
        IERC20(token1).transferFrom(msg.sender, address(this), params.amount1Desired);

        return (0, params.amount0Desired, params.amount1Desired);
    }

    function decreaseLiquidity(INonfungiblePositionManager.DecreaseLiquidityParams calldata params)
        external
        returns (uint256 amount0, uint256 amount1)
    {
        // For testing we will just set pending fees to simulate tokens collected
        // that will be swept via `collect` right after
        amount0 = params.liquidity; // mock math
        amount1 = params.liquidity;

        pendingFees[params.tokenId] = PendingFees(amount0, amount1);

        // Also simulate having the tokens to transfer. Mint directly to avoid allowance issues.
        // For tests we assume this contract has token0/token1 directly,
        // mock ERC20 may not support mint but transfer works.
        // Actually, just ignore transfer for decreaseLiquidity mock, since `collect` handles transferring it out
        // We just need to give `MockNPM` tokens during test setup
        return (amount0, amount1);
    }
}
