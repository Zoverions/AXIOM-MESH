// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../treasury/NetworkTreasury.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract DefenseFund is NetworkTreasury {
    using SafeERC20 for IERC20;

    mapping(address => bool) public approvedDefensiveTechnologies;

    event TechnologyApproved(address indexed techAddress);
    event TechnologyRevoked(address indexed techAddress);
    event DefenseFundsAllocated(address indexed token, address indexed techAddress, uint256 amount);

    constructor(address _owner) NetworkTreasury(_owner) {}

    function approveTechnology(address techAddress) external onlyOwner {
        require(techAddress != address(0), "DefenseFund: Invalid address");
        approvedDefensiveTechnologies[techAddress] = true;
        emit TechnologyApproved(techAddress);
    }

    function revokeTechnology(address techAddress) external onlyOwner {
        require(approvedDefensiveTechnologies[techAddress], "DefenseFund: Technology not approved");
        approvedDefensiveTechnologies[techAddress] = false;
        emit TechnologyRevoked(techAddress);
    }

    // Allocate funds strictly to defensive technologies
    function allocateFunds(address token, address techAddress, uint256 amount) external onlyOwner {
        require(approvedDefensiveTechnologies[techAddress], "DefenseFund: Unapproved defensive technology");
        require(amount > 0, "DefenseFund: Invalid amount");

        if (token == address(0)) {
            require(address(this).balance >= amount, "DefenseFund: Insufficient balance");
            (bool success, ) = techAddress.call{value: amount}("");
            require(success, "DefenseFund: Native transfer failed");
        } else {
            IERC20(token).safeTransfer(techAddress, amount);
        }

        emit DefenseFundsAllocated(token, techAddress, amount);
    }
}
