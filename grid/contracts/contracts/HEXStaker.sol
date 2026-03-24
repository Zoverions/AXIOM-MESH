// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";

contract HEXStaker is Ownable {
    mapping(address => uint256) public stakes;
    event Staked(address indexed staker, uint256 amount);

    constructor() Ownable(msg.sender) {}

    function stake() external payable {
        require(msg.value > 0, "No value");
        stakes[msg.sender] += msg.value;
        emit Staked(msg.sender, msg.value);
    }
}
