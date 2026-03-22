// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract AssuranceMarkets is Ownable {
    IERC20 public gdt;

    struct PolicyMarket {
        uint256 targetFlourishingIndex;
        uint256 totalStaked;
        bool resolved;
        uint256 finalFlourishingIndex;
    }

    mapping(uint256 => PolicyMarket) public markets;
    mapping(uint256 => mapping(address => uint256)) public stakes;

    event StakePlaced(uint256 indexed policyId, address staker, uint256 amount);
    event MarketResolved(uint256 indexed policyId, uint256 finalIndex, bool slashed);
    event StakeWithdrawn(uint256 indexed policyId, address staker, uint256 amount);

    constructor(address _gdt, address initialOwner) Ownable(initialOwner) {
        gdt = IERC20(_gdt);
    }

    function createMarket(uint256 policyId, uint256 targetFlourishingIndex) external onlyOwner {
        markets[policyId] = PolicyMarket({
            targetFlourishingIndex: targetFlourishingIndex,
            totalStaked: 0,
            resolved: false,
            finalFlourishingIndex: 0
        });
    }

    function stakeOnOutcome(uint256 policyId, uint256 amount) external {
        require(!markets[policyId].resolved, "Market resolved");
        gdt.transferFrom(msg.sender, address(this), amount);
        stakes[policyId][msg.sender] += amount;
        markets[policyId].totalStaked += amount;
        emit StakePlaced(policyId, msg.sender, amount);
    }

    function resolveMarket(uint256 policyId, uint256 finalFlourishingIndex) external onlyOwner {
        require(!markets[policyId].resolved, "Market resolved");
        markets[policyId].resolved = true;
        markets[policyId].finalFlourishingIndex = finalFlourishingIndex;

        bool slashed = false;
        if (finalFlourishingIndex < markets[policyId].targetFlourishingIndex) {
            // Slash stakes of approving nodes
            slashed = true;
            // Funds sent to dead address or treasury to enforce assurance penalty
            gdt.transfer(address(0x000000000000000000000000000000000000dEaD), markets[policyId].totalStaked);
        }

        emit MarketResolved(policyId, finalFlourishingIndex, slashed);
    }

    // Allows users to withdraw their stakes if the policy succeeds
    function withdrawStake(uint256 policyId) external {
        require(markets[policyId].resolved, "Market not resolved");
        require(markets[policyId].finalFlourishingIndex >= markets[policyId].targetFlourishingIndex, "Market slashed, stakes forfeited");

        uint256 amount = stakes[policyId][msg.sender];
        require(amount > 0, "No stake to withdraw");

        stakes[policyId][msg.sender] = 0;

        // Return original stake plus mock reward (in reality this would be driven by external reward pool)
        gdt.transfer(msg.sender, amount);

        emit StakeWithdrawn(policyId, msg.sender, amount);
    }
}
