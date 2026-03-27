// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract RevenueModel is Ownable {
    using SafeERC20 for IERC20;

    // Enterprise API Tiers
    enum APITier { Free, Developer, Enterprise }
    mapping(address => APITier) public userTiers;
    uint256 public developerTierFee = 100 ether;
    uint256 public enterpriseTierFee = 1000 ether;

    // Premium Sandbox Environments
    mapping(address => bool) public premiumSandboxes;
    uint256 public premiumSandboxFee = 500 ether;

    // Governance Delegation Fees
    mapping(address => uint256) public delegationFees;

    // Cross-chain Bridge Fees
    uint256 public bridgeFee = 10 ether;

    // Anonymized Network Data Marketplace
    struct Dataset {
        string name;
        uint256 price;
        address provider;
    }
    mapping(uint256 => Dataset) public datasets;
    uint256 public nextDatasetId = 1;

    IERC20 public paymentToken;

    event TierUpgraded(address indexed user, APITier tier);
    event SandboxPurchased(address indexed user);
    event DelegationFeePaid(address indexed delegator, address indexed delegatee, uint256 fee);
    event BridgeFeePaid(address indexed user, uint256 fee);
    event DatasetListed(uint256 indexed id, string name, uint256 price, address provider);
    event DatasetPurchased(uint256 indexed id, address indexed buyer);

    constructor(address _paymentToken) Ownable(msg.sender) {
        paymentToken = IERC20(_paymentToken);
    }

    function upgradeTier(APITier newTier) external {
        require(newTier > userTiers[msg.sender], "Cannot downgrade or stay in same tier");

        uint256 fee = 0;
        if (newTier == APITier.Developer) {
            fee = developerTierFee;
        } else if (newTier == APITier.Enterprise) {
            fee = enterpriseTierFee;
        }

        if (fee > 0) {
            paymentToken.safeTransferFrom(msg.sender, address(this), fee);
        }

        userTiers[msg.sender] = newTier;
        emit TierUpgraded(msg.sender, newTier);
    }

    function purchasePremiumSandbox() external {
        require(!premiumSandboxes[msg.sender], "Already own premium sandbox");
        paymentToken.safeTransferFrom(msg.sender, address(this), premiumSandboxFee);
        premiumSandboxes[msg.sender] = true;
        emit SandboxPurchased(msg.sender);
    }

    function payDelegationFee(address delegatee) external {
        uint256 fee = delegationFees[delegatee];
        require(fee > 0, "No fee set");
        paymentToken.safeTransferFrom(msg.sender, delegatee, fee);
        emit DelegationFeePaid(msg.sender, delegatee, fee);
    }

    function setDelegationFee(uint256 fee) external {
        delegationFees[msg.sender] = fee;
    }

    function payBridgeFee() external {
        paymentToken.safeTransferFrom(msg.sender, address(this), bridgeFee);
        emit BridgeFeePaid(msg.sender, bridgeFee);
    }

    function listDataset(string memory name, uint256 price) external {
        uint256 id = nextDatasetId++;
        datasets[id] = Dataset(name, price, msg.sender);
        emit DatasetListed(id, name, price, msg.sender);
    }

    function purchaseDataset(uint256 datasetId) external {
        Dataset memory dataset = datasets[datasetId];
        require(dataset.provider != address(0), "Dataset does not exist");
        paymentToken.safeTransferFrom(msg.sender, dataset.provider, dataset.price);
        emit DatasetPurchased(datasetId, msg.sender);
    }

    function withdrawFees(address to, uint256 amount) external onlyOwner {
        require(to != address(0), "Invalid recipient");
        paymentToken.safeTransfer(to, amount);
    }
}
