// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract MockSwarmSizeOracle {
    uint256 private nodeCount;

    function setNetworkNodeCount(uint256 _count) external {
        nodeCount = _count;
    }

    function getNetworkNodeCount() external view returns (uint256) {
        return nodeCount;
    }
}
