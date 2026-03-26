// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract MockWeightOracle {
    mapping(address => uint256) public weights;

    function setWeight(address account, uint256 weight) external {
        weights[account] = weight;
    }

    function getWeight(address account) external view returns (uint256) {
        return weights[account];
    }
}
