// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract CommunityTreasury is Ownable {
    using SafeERC20 for IERC20;

    event FundsAllocated(address indexed recipient, uint256 amount, string purpose);
    event FundsReceived(address indexed sender, uint256 amount);
    event GovernanceMultisigUpdated(address indexed previousMultisig, address indexed newMultisig);

    address public governanceMultisig;

    constructor() Ownable(msg.sender) {}

    receive() external payable {
        emit FundsReceived(msg.sender, msg.value);
    }

    modifier onlyGovernanceMultisig() {
        require(msg.sender == governanceMultisig, "CommunityTreasury: governance multisig required");
        _;
    }

    function setGovernanceMultisig(address newGovernanceMultisig) external onlyOwner {
        require(newGovernanceMultisig != address(0), "CommunityTreasury: invalid multisig");
        emit GovernanceMultisigUpdated(governanceMultisig, newGovernanceMultisig);
        governanceMultisig = newGovernanceMultisig;
    }

    function allocateFunds(IERC20 token, address recipient, uint256 amount, string calldata purpose) external onlyGovernanceMultisig {
        require(recipient != address(0), "Invalid recipient");
        require(amount > 0, "Invalid amount");
        token.safeTransfer(recipient, amount);
        emit FundsAllocated(recipient, amount, purpose);
    }

    function allocateEther(address payable recipient, uint256 amount, string calldata purpose) external onlyGovernanceMultisig {
        require(recipient != address(0), "Invalid recipient");
        require(amount > 0, "Invalid amount");
        require(address(this).balance >= amount, "Insufficient balance");
        (bool success, ) = recipient.call{value: amount}("");
        require(success, "Ether transfer failed");
        emit FundsAllocated(recipient, amount, purpose);
    }
}
