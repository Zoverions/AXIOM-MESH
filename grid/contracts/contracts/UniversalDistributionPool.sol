// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./FounderCommitment.sol";
import "./DynamicResourceAllocator.sol";
import "./ComputeBond.sol";
import "./CitizenshipNFT.sol";

contract UniversalDistributionPool is Initializable, UUPSUpgradeable {
    FounderCommitment public immutable founder;
    DynamicResourceAllocator public immutable allocator;
    ComputeBond public immutable treasury;
    CitizenshipNFT public immutable citizenship;

    uint256 public networkSharePercentage; // governance-set, default 10
    mapping(address => uint256) public inflows;   // org/gov → total contributed
    mapping(address => uint256) public outflows;  // recipient → total received
    mapping(bytes32 => uint256) public allocations; // taskId → amount
    address public crossChainBridge;
    bool public externalFundsEnabled;

    event Inflow(address from, uint256 amount, string source);
    event Outflow(address to, uint256 amount, bytes32 zkProofHash);
    event NetworkShareAllocated(uint256 amount);

    constructor(address _founder, address _allocator, address _treasury, address _citizenship) {
        founder = FounderCommitment(_founder);
        allocator = DynamicResourceAllocator(_allocator);
        treasury = ComputeBond(_treasury);
        citizenship = CitizenshipNFT(_citizenship);
        _disableInitializers();
    }

    function initialize(uint256 _defaultShare) public initializer {


        //__UUPSUpgradeable_init();
        networkSharePercentage = _defaultShare;
        externalFundsEnabled = false; // Disabled until Level 3 gate is passed
    }

    function deposit(address from, uint256 amount, string calldata source) external payable {
        require(
            externalFundsEnabled ||
            msg.sender == address(allocator) ||
            msg.sender == address(treasury) ||
            msg.sender == address(founder) ||
            msg.sender == address(citizenship) ||
            msg.sender == crossChainBridge,
            "External funds disabled until Level 3"
        );
        require(msg.value == amount || IERC20(address(treasury)).transferFrom(from, address(this), amount), "Deposit failed");

        inflows[from] += amount;
        uint256 networkShare = (amount * networkSharePercentage) / 100;

        // Auto-send to general network pool
        (bool success, ) = address(treasury).call{value: networkShare}("");
        require(success, "Network share transfer failed");
        emit NetworkShareAllocated(networkShare);

        allocator.allocateToTask(keccak256(abi.encode(from)), "distribution-pool", amount - networkShare);

        emit Inflow(from, amount, source);
    }

    function distributeBatch(address[] calldata recipients, uint256[] calldata amounts, bytes32 zkProofHash) external {
        require(msg.sender == address(allocator) || msg.sender == crossChainBridge, "Authorized distributor only");
        require(recipients.length == amounts.length, "Mismatched arrays");

        uint256 totalAmount = 0;
        for (uint256 i = 0; i < amounts.length; i++) {
            totalAmount += amounts[i];
        }
        require(address(this).balance >= totalAmount, "Insufficient pool");

        for (uint256 i = 0; i < recipients.length; i++) {
            address to = recipients[i];
            uint256 amount = amounts[i];

            outflows[to] += amount;

            (bool success, ) = to.call{value: amount}("");
            require(success, "Distribution failed");

            emit Outflow(to, amount, zkProofHash);
        }
    }

    function distribute(address to, uint256 amount, bytes32 zkProofHash) external {
        require((citizenship.balanceOf(msg.sender) > 0 && msg.sender == to) || msg.sender == address(allocator) || msg.sender == crossChainBridge, "Authorized distributor only");
        require(address(this).balance >= amount, "Insufficient pool");

        outflows[to] += amount;

        (bool success, ) = to.call{value: amount}("");
        require(success, "Distribution failed");

        emit Outflow(to, amount, zkProofHash);
    }

    function setCrossChainBridge(address _bridge) external {
        require(msg.sender == address(founder), "Founder only");
        crossChainBridge = _bridge;
    }

    function setNetworkShare(uint256 newPercentage) external {
        require(allocator.governance().isProposalPassed(keccak256(abi.encode(newPercentage))), "Governance required");
        networkSharePercentage = newPercentage;
    }

    function setExternalFundsEnabled(bool _enabled) external {
        require(allocator.governance().isProposalPassed(keccak256(abi.encode(_enabled))) || msg.sender == address(founder), "Governance or founder required");
        externalFundsEnabled = _enabled;
    }

    function getAuditTrail(address entity) external view returns (uint256 totalIn, uint256 totalOut, uint256 networkContributed) {
        totalIn = inflows[entity];
        totalOut = outflows[entity];
        networkContributed = (totalIn * networkSharePercentage) / 100;
    }

    function _authorizeUpgrade(address) internal override {
        require(founder.verifyFounder(""), "Founder verification failed");
    }

    receive() external payable {}
}