// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "../AssuranceMarkets.sol";

contract MockRewardPool is IRewardPool {
    IERC20 public gdt;

    constructor(address _gdt) {
        gdt = IERC20(_gdt);
    }

    function distributeReward(address user, uint256 userStake, uint256 totalStake) external {
        // Simple mock distribution logic (e.g. 10% reward)
        uint256 rewardAmount = (userStake * 10) / 100;
        gdt.transfer(user, rewardAmount);
    }
}

contract MockZKMLVerifier {
    function verifyProof(bytes32, uint256[2] calldata, uint256[2][2] calldata, uint256[2] calldata) external pure returns (bool) {
        return true;
    }
}
