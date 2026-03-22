// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/interfaces/IERC20.sol";
import "@openzeppelin/contracts/interfaces/IERC721.sol";

/**
 * @title NodeWallet
 * @dev An automatically deployed, connected ERC-20 and native asset wallet created during identity registration.
 * Allows the human or agent owner to seamlessly receive, hold, and execute transactions.
 */
contract NodeWallet is Ownable {
    event Executed(address indexed to, uint256 value, bytes data);
    event ERC20Transferred(address indexed token, address indexed to, uint256 amount);

    constructor(address initialOwner) Ownable(initialOwner) {}

    receive() external payable {}

    function execute(address target, uint256 value, bytes calldata data) external onlyOwner returns (bytes memory) {
        (bool success, bytes memory result) = target.call{value: value}(data);
        require(success, "NodeWallet: Call failed");
        emit Executed(target, value, data);
        return result;
    }

    function transferERC20(address token, address to, uint256 amount) external onlyOwner {
        require(IERC20(token).transfer(to, amount), "NodeWallet: ERC20 transfer failed");
        emit ERC20Transferred(token, to, amount);
    }
}