// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract GlobalDefenseToken is ERC20, Ownable {
    mapping(address => bool) public isOracle;

    event ProductionMint(uint256 amount, uint256 automatedWorkforceOutput);

    constructor(address initialOwner) ERC20("Global Defense Token", "GDT") Ownable(initialOwner) {}

    function setOracle(address oracle, bool status) external onlyOwner {
        isOracle[oracle] = status;
    }

    // GDT Dynamic Backing: tracks real-world production metrics
    function mintFromProduction(uint256 amount, uint256 automatedWorkforceOutput) external {
        require(isOracle[msg.sender] || msg.sender == owner(), "GDT: Unauthorized Oracle");
        _mint(msg.sender, amount); // simplified to mint to sender, but usually sent to a treasury
        emit ProductionMint(amount, automatedWorkforceOutput);
    }
}
