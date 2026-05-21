// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

contract ProxyReputationRegistry is Ownable {
    struct ProxyMetrics {
        uint256 successfulSessions;
        uint256 blockedSessions;
        uint256 totalBytesTransferred;
        uint256 totalSessionDuration;
        uint256 reputationScore; // Base 10000 (e.g., 9500 = 95%)
        bool isSlashed;
    }

    mapping(address => ProxyMetrics) public proxyNodes;
    address public metricsReporter;

    event MetricsUpdated(address indexed proxyNode, uint256 successful, uint256 blocked);
    event ProxySlashed(address indexed proxyNode);
    event ReporterUpdated(address indexed oldReporter, address indexed newReporter);

    constructor() Ownable(msg.sender) {
        metricsReporter = msg.sender;
    }

    modifier onlyReporter() {
        require(msg.sender == metricsReporter, "Not authorized reporter");
        _;
    }

    function setMetricsReporter(address _reporter) external onlyOwner {
        require(_reporter != address(0), "Invalid reporter address");
        emit ReporterUpdated(metricsReporter, _reporter);
        metricsReporter = _reporter;
    }

    function recordMetrics(
        address proxyNode,
        uint256 successCount,
        uint256 blockCount,
        uint256 bytesTransferred,
        uint256 duration
    ) external onlyReporter {
        require(!proxyNodes[proxyNode].isSlashed, "Node is slashed");

        ProxyMetrics storage metrics = proxyNodes[proxyNode];
        metrics.successfulSessions += successCount;
        metrics.blockedSessions += blockCount;
        metrics.totalBytesTransferred += bytesTransferred;
        metrics.totalSessionDuration += duration;

        uint256 totalSessions = metrics.successfulSessions + metrics.blockedSessions;
        if (totalSessions > 0) {
            metrics.reputationScore = (metrics.successfulSessions * 10000) / totalSessions;
        }

        emit MetricsUpdated(proxyNode, metrics.successfulSessions, metrics.blockedSessions);
    }

    function slashNode(address proxyNode) external onlyOwner {
        proxyNodes[proxyNode].isSlashed = true;
        proxyNodes[proxyNode].reputationScore = 0;
        emit ProxySlashed(proxyNode);
    }

    function getReputationScore(address proxyNode) external view returns (uint256) {
        return proxyNodes[proxyNode].reputationScore;
    }
}
