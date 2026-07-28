// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./CognitiveFrictionVerifier.sol";
import "./UniversalDistributionPool.sol";
import "./FounderShareManager.sol";

// TODO ID: Top-Level To Do 6 - DonationCampaign + Self-Funding Loop
contract DonationCampaign is ReentrancyGuard {
    CognitiveFrictionVerifier public poerVerifier;
    UniversalDistributionPool public ubiPool;
    FounderShareManager public founderManager;

    uint256 public constant GUARDIAN_ALLOCATION_BPS = 5000; // 50% to reserve
    uint256 public constant UBI_ALLOCATION_BPS = 5000;      // 50% to UBI

    mapping(address => uint256) public donorContributions;
    mapping(address => uint256) public donorPoERBoost;     // Incentive

    event DonationReceived(address indexed donor, uint256 amount, uint256 poerBoost);
    event FundsAllocated(uint256 toGuardian, uint256 toUBI);

    constructor(address _poer, address _ubiPool, address _founderManager) {
        poerVerifier = CognitiveFrictionVerifier(_poer);
        ubiPool = UniversalDistributionPool(payable(_ubiPool));
        founderManager = FounderShareManager(_founderManager);
    }

    receive() external payable {}

    function donate() external payable nonReentrant {
        require(msg.value > 0, "Donation must be > 0");

        donorContributions[msg.sender] += msg.value;

        // Incentive: PoER boost proportional to donation (capped)
        uint256 boost = (msg.value * 100) / 1 ether; // example scaling
        donorPoERBoost[msg.sender] += boost;
        uint256 currentScore = poerVerifier.poerScores(msg.sender);
        poerVerifier.updatePoERScore(msg.sender, currentScore + boost);

        // Auto-allocate
        uint256 guardianAmount = (msg.value * GUARDIAN_ALLOCATION_BPS) / 10000;
        uint256 ubiAmount = msg.value - guardianAmount;

        (bool ubiSuccess, ) = payable(address(ubiPool)).call{value: ubiAmount}("");
        require(ubiSuccess, "UBI transfer failed");

        address guardianAddress;
        try founderManager.founder() returns (FounderCommitment f) {
            guardianAddress = f.owner();
        } catch {
            guardianAddress = address(ubiPool);
        }

        (bool guardianSuccess, ) = payable(guardianAddress).call{value: guardianAmount}("");
        require(guardianSuccess, "Guardian transfer failed");

        emit DonationReceived(msg.sender, msg.value, boost);
        emit FundsAllocated(guardianAmount, ubiAmount);
    }

    function getDonorStats(address donor) external view returns (uint256 contributed, uint256 poerBoost) {
        return (donorContributions[donor], donorPoERBoost[donor]);
    }
}
