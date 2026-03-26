// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title BugBounty
 * @dev An Immunefi-style bug bounty escrow and payout system.
 * It holds reward tokens and allows a designated security council to
 * approve and distribute payouts based on bug severity.
 */
contract BugBounty is AccessControl, Pausable {
    using SafeERC20 for IERC20;

    bytes32 public constant SECURITY_COUNCIL_ROLE = keccak256("SECURITY_COUNCIL_ROLE");
    bytes32 public constant ADMIN_ROLE = DEFAULT_ADMIN_ROLE;

    enum Severity { None, Low, Medium, High, Critical }

    struct BugReport {
        address reporter;
        string referenceUrl; // e.g. IPFS hash or off-chain identifier
        Severity severity;
        bool isResolved;
        bool isPaid;
        uint256 payoutAmount;
    }

    IERC20 public rewardToken;
    uint256 public nextReportId;
    mapping(uint256 => BugReport) public bugReports;

    event ReportSubmitted(uint256 indexed reportId, address indexed reporter, string referenceUrl);
    event ReportResolved(uint256 indexed reportId, Severity severity);
    event BountyPaid(uint256 indexed reportId, address indexed reporter, uint256 amount);
    event RewardTokenUpdated(address indexed oldToken, address indexed newToken);

    constructor(address _rewardToken, address _admin, address _securityCouncil) {
        require(_rewardToken != address(0), "Invalid reward token address");
        require(_admin != address(0), "Invalid admin address");

        rewardToken = IERC20(_rewardToken);

        _grantRole(ADMIN_ROLE, _admin);
        _grantRole(SECURITY_COUNCIL_ROLE, _securityCouncil);
    }

    /**
     * @dev Allows anyone to submit a bug report reference on-chain.
     */
    function submitReport(string calldata referenceUrl) external whenNotPaused {
        require(bytes(referenceUrl).length > 0, "Reference cannot be empty");

        uint256 reportId = nextReportId++;
        bugReports[reportId] = BugReport({
            reporter: msg.sender,
            referenceUrl: referenceUrl,
            severity: Severity.None,
            isResolved: false,
            isPaid: false,
            payoutAmount: 0
        });

        emit ReportSubmitted(reportId, msg.sender, referenceUrl);
    }

    /**
     * @dev Resolves a report and assigns a severity. Only callable by Security Council.
     */
    function resolveReport(uint256 reportId, Severity severity) external onlyRole(SECURITY_COUNCIL_ROLE) {
        require(reportId < nextReportId, "Report does not exist");
        BugReport storage report = bugReports[reportId];
        require(!report.isResolved, "Report already resolved");

        report.severity = severity;
        report.isResolved = true;

        emit ReportResolved(reportId, severity);
    }

    /**
     * @dev Pays out a resolved bug report. Only callable by Security Council.
     */
    function payBounty(uint256 reportId, uint256 amount) external onlyRole(SECURITY_COUNCIL_ROLE) whenNotPaused {
        require(reportId < nextReportId, "Report does not exist");
        BugReport storage report = bugReports[reportId];

        require(report.isResolved, "Report must be resolved first");
        require(!report.isPaid, "Bounty already paid");
        require(report.severity != Severity.None, "Invalid severity for payout");
        require(amount > 0, "Payout amount must be greater than 0");
        require(rewardToken.balanceOf(address(this)) >= amount, "Insufficient contract balance");

        report.isPaid = true;
        report.payoutAmount = amount;

        rewardToken.safeTransfer(report.reporter, amount);

        emit BountyPaid(reportId, report.reporter, amount);
    }

    /**
     * @dev Allows the admin to update the reward token.
     */
    function setRewardToken(address _newToken) external onlyRole(ADMIN_ROLE) {
        require(_newToken != address(0), "Invalid reward token address");
        address oldToken = address(rewardToken);
        rewardToken = IERC20(_newToken);
        emit RewardTokenUpdated(oldToken, _newToken);
    }

    /**
     * @dev Allows the admin to withdraw unused funds.
     */
    function emergencyWithdraw(uint256 amount, address to) external onlyRole(ADMIN_ROLE) {
        require(to != address(0), "Invalid recipient address");
        rewardToken.safeTransfer(to, amount);
    }

    /**
     * @dev Pauses the contract.
     */
    function pause() external onlyRole(ADMIN_ROLE) {
        _pause();
    }

    /**
     * @dev Unpauses the contract.
     */
    function unpause() external onlyRole(ADMIN_ROLE) {
        _unpause();
    }
}
