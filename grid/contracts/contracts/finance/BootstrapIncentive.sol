// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "../token/BootstrapInitiatorNFT.sol";
import "../treasury/NetworkTreasury.sol";

/**
 * @title BootstrapIncentive
 * @notice Automates the rewarding of the first person who funds the AXIOM-MESH network.
 *         Ensures the initiator is rewarded with an NFT and a future "money back + interest" payout.
 */
contract BootstrapIncentive is ReentrancyGuard, Ownable {
    BootstrapInitiatorNFT public initiatorNFT;
    NetworkTreasury public treasury;

    address public initiator;
    uint256 public initialFundingAmount;
    uint256 public interestRateBps = 500; // 5.00% default "fair interest rate"

    bool public isBootstrapped;
    uint256 public initiatorTokenId;

    event Bootstrapped(address indexed initiator, uint256 amount);
    event RepaymentClaimed(address indexed initiator, uint256 amount);
    event FundsReceived(address indexed from, uint256 amount);

    constructor(address _nft, address payable _treasury) Ownable(msg.sender) {
        initiatorNFT = BootstrapInitiatorNFT(_nft);
        treasury = NetworkTreasury(_treasury);
    }

    /**
     * @notice First call to fund the network and claim the initiator achievement.
     */
    function bootstrap() external payable nonReentrant {
        require(!isBootstrapped, "Network already bootstrapped");
        require(msg.value > 0, "Funding must be > 0");

        initiator = msg.sender;
        initialFundingAmount = msg.value;
        isBootstrapped = true;

        // Forward funds to NetworkTreasury
        (bool success, ) = address(treasury).call{value: msg.value}("");
        require(success, "Treasury funding failed");

        // Mint achievement NFT to initiator
        initiatorTokenId = initiatorNFT.mintInitiator(initiator, msg.value);

        emit Bootstrapped(initiator, msg.value);
    }

    /**
     * @notice Allows the initiator to claim their repayment + interest.
     *         The contract must be funded (e.g., from NetworkTreasury) before this can be called.
     */
    function claimRepayment() external nonReentrant {
        require(msg.sender == initiator, "Only initiator can claim");
        require(isBootstrapped, "Not bootstrapped");

        (,, bool isRepaid,,) = initiatorNFT.initiatorData(initiatorTokenId);
        require(!isRepaid, "Already repaid");

        uint256 interest = (initialFundingAmount * interestRateBps) / 10000;
        uint256 totalRepayment = initialFundingAmount + interest;

        require(address(this).balance >= totalRepayment, "Insufficient funds for repayment");

        // Mark as repaid in the NFT
        initiatorNFT.setRepaid(initiatorTokenId, true);

        (bool success, ) = payable(initiator).call{value: totalRepayment}("");
        require(success, "Repayment failed");

        emit RepaymentClaimed(initiator, totalRepayment);
    }

    /**
     * @notice Calculates the total repayment amount (principal + interest).
     */
    function getRepaymentAmount() public view returns (uint256) {
        uint256 interest = (initialFundingAmount * interestRateBps) / 10000;
        return initialFundingAmount + interest;
    }

    /**
     * @notice Set interest rate. Only owner (founder/governance).
     * @param _bps Interest rate in basis points (e.g., 500 = 5%).
     */
    function setInterestRate(uint256 _bps) external onlyOwner {
        interestRateBps = _bps;
    }

    /**
     * @notice Sets the reward value for the initiator achievement NFT.
     * @param value The value of the reward (e.g., bonus network resources or treasury reward).
     */
    function setInitiatorRewardValue(uint256 value) external onlyOwner {
        require(isBootstrapped, "Not bootstrapped");
        initiatorNFT.setRewardValue(initiatorTokenId, value);
    }

    /**
     * @notice Fallback to receive funds for repayment.
     */
    receive() external payable {
        emit FundsReceived(msg.sender, msg.value);
    }
}
