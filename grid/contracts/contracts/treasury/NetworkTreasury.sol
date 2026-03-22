// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";

contract NetworkTreasury is Ownable {
    event TransactionExecuted(address indexed target, uint256 value, bytes data);

    constructor(address initialOwner) Ownable(initialOwner) {}

    receive() external payable {}

    function execute(address target, uint256 value, bytes calldata data) external onlyOwner returns (bytes memory) {
        (bool success, bytes memory result) = target.call{value: value}(data);
        require(success, "NetworkTreasury: execution failed");
        emit TransactionExecuted(target, value, data);
        return result;
    }
}