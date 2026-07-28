// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";

contract NetworkTreasury is Ownable {
    event TransactionExecuted(address indexed target, uint256 value, bytes data);
    event GovernanceMultisigUpdated(address indexed previousMultisig, address indexed newMultisig);

    address public governanceMultisig;

    constructor(address initialOwner) Ownable(initialOwner) {}

    receive() external payable {}

    modifier onlyGovernanceMultisig() {
        require(msg.sender == governanceMultisig, "NetworkTreasury: governance multisig required");
        _;
    }

    function setGovernanceMultisig(address newGovernanceMultisig) external onlyOwner {
        require(newGovernanceMultisig != address(0), "NetworkTreasury: invalid multisig");
        emit GovernanceMultisigUpdated(governanceMultisig, newGovernanceMultisig);
        governanceMultisig = newGovernanceMultisig;
    }

    function execute(address target, uint256 value, bytes calldata data) external onlyGovernanceMultisig returns (bytes memory) {
        require(target != address(0), "NetworkTreasury: invalid target");
        (bool success, bytes memory result) = target.call{value: value}(data);
        require(success, "NetworkTreasury: execution failed");
        emit TransactionExecuted(target, value, data);
        return result;
    }
}
