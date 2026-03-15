// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

contract ComputeBond is Ownable {

    struct Bond {
        address staker;
        uint256 amount;
        bool isActive;
    }

    // Mapping from node ID string to the Bond details
    mapping(string => Bond) public bonds;

    // Track total slashed funds that can be withdrawn by owner
    uint256 public totalSlashed;

    // Custom errors for gas efficiency on L2 networks (Arbitrum, Polygon)
    error InvalidNodeId();
    error InvalidStakeAmount();
    error UnauthorizedStaker(address caller, address originalStaker);
    error BondNotActive();
    error SlashExceedsBond();
    error WithdrawExceedsBond();
    error InsufficientSlashedFunds();
    error TransferFailed();

    event BondStaked(string indexed nodeId, address indexed staker, uint256 amount);
    event BondSlashed(string indexed nodeId, uint256 amount, uint256 newAmount);
    event BondWithdrawn(string indexed nodeId, address indexed staker, uint256 amount);

    constructor() Ownable(msg.sender) {}

    /**
     * @dev Allows a node to stake native tokens (ETH/MATIC) as a compute bond.
     * @param nodeId The unique identifier of the node.
     */
    function stake(string memory nodeId) external payable {
        if (bytes(nodeId).length == 0) revert InvalidNodeId();
        if (msg.value == 0) revert InvalidStakeAmount();

        Bond storage bond = bonds[nodeId];

        // If a bond already exists, ensure the staker is the same, or handle it differently
        if (bond.isActive) {
            if (bond.staker != msg.sender) {
                revert UnauthorizedStaker(msg.sender, bond.staker);
            }
        } else {
            bond.staker = msg.sender;
            bond.isActive = true;
        }

        bond.amount += msg.value;

        emit BondStaked(nodeId, msg.sender, msg.value);
    }

    /**
     * @dev Allows the owner (or a designated slasher mechanism) to slash a node's bond.
     * The slashed amount remains in the contract and could be collected by the owner.
     * @param nodeId The unique identifier of the node.
     * @param amount The amount to slash from the node's bond.
     */
    function slash(string memory nodeId, uint256 amount) external onlyOwner {
        Bond storage bond = bonds[nodeId];
        if (!bond.isActive) revert BondNotActive();
        if (bond.amount < amount) revert SlashExceedsBond();

        bond.amount -= amount;
        totalSlashed += amount; // Track the slashed amount

        if (bond.amount == 0) {
            bond.isActive = false;
        }

        emit BondSlashed(nodeId, amount, bond.amount);
    }

    /**
     * @dev Allows the staker to withdraw the remaining compute bond.
     * @param nodeId The unique identifier of the node.
     * @param amount The amount to withdraw.
     */
    function withdraw(string memory nodeId, uint256 amount) external {
        Bond storage bond = bonds[nodeId];
        if (!bond.isActive) revert BondNotActive();
        if (bond.staker != msg.sender) revert UnauthorizedStaker(msg.sender, bond.staker);
        if (bond.amount < amount) revert WithdrawExceedsBond();

        bond.amount -= amount;

        if (bond.amount == 0) {
            bond.isActive = false;
        }

        (bool success, ) = payable(msg.sender).call{value: amount}("");
        if (!success) revert TransferFailed();

        emit BondWithdrawn(nodeId, msg.sender, amount);
    }

    /**
     * @dev Allows the owner to withdraw slashed funds collected in the contract.
     * Slashed funds are explicitly tracked to prevent draining user stakes.
     * @param amount The amount to withdraw from the contract's slashed balance.
     */
    function withdrawSlashedFunds(uint256 amount) external onlyOwner {
        if (totalSlashed < amount) revert InsufficientSlashedFunds();

        totalSlashed -= amount;

        (bool success, ) = payable(owner()).call{value: amount}("");
        if (!success) revert TransferFailed();
    }
}
