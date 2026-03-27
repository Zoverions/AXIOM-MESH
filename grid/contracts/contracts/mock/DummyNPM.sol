// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@uniswap/v3-periphery/contracts/interfaces/INonfungiblePositionManager.sol";

contract DummyNPM {
    function increaseLiquidity(INonfungiblePositionManager.IncreaseLiquidityParams calldata params)
        external
        returns (
            uint128 liquidity,
            uint256 amount0,
            uint256 amount1
        )
    {
        return (uint128(params.amount0Desired), params.amount0Desired, params.amount1Desired);
    }
}
