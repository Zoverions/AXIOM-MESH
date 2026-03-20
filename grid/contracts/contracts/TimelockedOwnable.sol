// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

abstract contract TimelockedOwnable is Ownable {
    uint256 public constant TIMELOCK_DELAY = 2 days;

    mapping(bytes32 => uint256) public timelocks;

    event OperationQueued(bytes32 indexed operationId, uint256 executeAfter);
    event OperationExecuted(bytes32 indexed operationId);

    constructor(address initialOwner) Ownable(initialOwner) {}

    modifier onlyTimelocked(bytes32 operationId) {
        require(msg.sender == owner(), "Unauthorized: Not owner");
        require(timelocks[operationId] != 0, "Timelock: Operation not queued");
        require(block.timestamp >= timelocks[operationId], "Timelock: Delay not met");
        _;
        timelocks[operationId] = 0; // Reset after execution
        emit OperationExecuted(operationId);
    }

    function queueOperation(bytes32 operationId) external onlyOwner {
        require(timelocks[operationId] == 0, "Timelock: Already queued");
        uint256 executeAfter = block.timestamp + TIMELOCK_DELAY;
        timelocks[operationId] = executeAfter;
        emit OperationQueued(operationId, executeAfter);
    }
}
