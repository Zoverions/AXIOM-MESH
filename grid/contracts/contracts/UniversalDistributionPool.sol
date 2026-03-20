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
        __UUPSUpgradeable_init();
        networkSharePercentage = _defaultShare;
    }

    function deposit(address from, uint256 amount, string calldata source) external payable {
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

    function distribute(address to, uint256 amount, bytes32 zkProofHash) external {
        require(citizenship.ownerOf(citizenship.tokenOf(to)) == msg.sender || msg.sender == address(allocator), "Authorized distributor only");
        require(address(this).balance >= amount, "Insufficient pool");

        (bool success, ) = to.call{value: amount}("");
        require(success, "Distribution failed");

        outflows[to] += amount;
        emit Outflow(to, amount, zkProofHash);
    }

    function setNetworkShare(uint256 newPercentage) external {
        require(allocator.governance().isProposalPassed(keccak256(abi.encode(newPercentage))), "Governance required");
        networkSharePercentage = newPercentage;
    }

    function getAuditTrail(address entity) external view returns (uint256 totalIn, uint256 totalOut, uint256 networkContributed) {
        totalIn = inflows[entity];
        totalOut = outflows[entity];
        networkContributed = (totalIn * networkSharePercentage) / 100;
    }

    function _authorizeUpgrade(address) internal override {
        require(founder.verifyFounder(""), "Founder verification failed");
    }
}