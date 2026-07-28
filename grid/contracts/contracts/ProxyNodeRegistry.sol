// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

contract ProxyNodeRegistry is Ownable {

    struct ProxyNode {
        address operator;
        uint256 stakedAmount;
        bool active;
        string networkType; // "residential" or "mobile"
        uint256 reputation;
    }

    mapping(string => ProxyNode) public proxyNodes;
    mapping(address => string[]) public operatorNodes;

    uint256 public constant MIN_STAKE = 1_000 ether; // Requires 1000 native tokens to register proxy node

    event NodeRegistered(string indexed nodeId, address indexed operator, uint256 stakedAmount, string networkType);
    event NodeSlashed(string indexed nodeId, uint256 slashAmount, uint256 remainingStake);
    event NodeDeregistered(string indexed nodeId);
    event NodeWithdrawn(string indexed nodeId, address indexed operator, uint256 amount);

    constructor() Ownable(msg.sender) {}

    /**
     * @dev Allows an operator to stake native tokens to register a proxy node endpoint.
     */
    function stakeProxyNode(string memory nodeId, string memory networkType) external payable {
        require(bytes(nodeId).length > 0, "Invalid nodeId");
        require(bytes(networkType).length > 0, "Invalid networkType");
        require(msg.value >= MIN_STAKE, "Insufficient stake");
        require(proxyNodes[nodeId].operator == address(0), "Node ID already registered");

        proxyNodes[nodeId] = ProxyNode({
            operator: msg.sender,
            stakedAmount: msg.value,
            active: true,
            networkType: networkType,
            reputation: 100 // initial reputation
        });

        operatorNodes[msg.sender].push(nodeId);

        emit NodeRegistered(nodeId, msg.sender, msg.value, networkType);
    }

    /**
     * @dev Allows an operator to unstake and withdraw their native tokens, deregistering the node.
     */
    function unstakeProxyNode(string memory nodeId) external {
        ProxyNode storage node = proxyNodes[nodeId];
        require(node.operator == msg.sender, "Unauthorized: Not the operator");
        require(node.stakedAmount > 0, "No stake to withdraw");

        uint256 amount = node.stakedAmount;
        node.stakedAmount = 0;
        node.active = false;
        node.reputation = 0;

        (bool success, ) = payable(msg.sender).call{value: amount}("");
        require(success, "Withdrawal transfer failed");

        emit NodeWithdrawn(nodeId, msg.sender, amount);
        emit NodeDeregistered(nodeId);
    }

    /**
     * @dev Allows governance or the owner to slash a proxy node for poor quality or leaks.
     */
    function slashNode(string memory nodeId, uint256 amount) external onlyOwner {
        ProxyNode storage node = proxyNodes[nodeId];
        require(node.active, "Node is not active");
        require(node.stakedAmount >= amount, "Slash exceeds stake");

        node.stakedAmount -= amount;

        // Deduct reputation
        if (node.reputation >= 10) {
            node.reputation -= 10;
        }

        if (node.stakedAmount < MIN_STAKE) {
            node.active = false;
            emit NodeDeregistered(nodeId);
        }

        emit NodeSlashed(nodeId, amount, node.stakedAmount);
    }
}
