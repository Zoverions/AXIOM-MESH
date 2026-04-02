// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "./FounderCommitment.sol";
import "./ComputeBond.sol";

contract FounderShareManager is Initializable, UUPSUpgradeable {
    FounderCommitment public immutable founder;
    ComputeBond public immutable treasury;

    // The founder share is NOT permanent. It starts at 5% and decays to 0% linearly as the gridSwarmSize reaches 10,000 nodes,
    // as enforced by ComputeBond.getCurrentFounderShare().
    uint256 public constant INITIAL_FOUNDER_SHARE = 5; // 5%
    uint256 public lastEpochAllocation;

    event FounderShareClaimed(uint256 amount);
    event UnusedShareReallocated(uint256 amount);

    address public pulseAdapter;
    address public proveXWrapper;
    bool public councilAutonomyActive;

    struct HandoverMilestones {
        bool securityAudited;
        bool financialStability;
        bool blockchainMetricsMet;
        bool aiAlignmentVerified;
    }
    HandoverMilestones public handoverMilestones;

    address public stablecoin;

    event CouncilAutonomyActivated();
    event FullHandoverTriggered(string reason);
    event StablecoinSwapRequested(uint256 amount, address targetStablecoin);

    function guardianSentinel() external view returns (address) {
        // Return founder address or treasury as guardian
        return address(founder);
    }
    address public upgradeTimelock;

    function setUpgradeTimelock(address _timelock) external {
        if (upgradeTimelock == address(0)) {
            require(founder.verifyFounder(""), "Unauthorized");
        } else {
            require(msg.sender == upgradeTimelock, "Unauthorized: not upgrade timelock");
        }
        upgradeTimelock = _timelock;
    }



    constructor(address _founder, address _treasury) {
        founder = FounderCommitment(_founder);
        treasury = ComputeBond(_treasury);
        _disableInitializers();
    }

    function initialize() public initializer {

        lastEpochAllocation = block.timestamp;
    }

    function setPulseAdapter(address _adapter) external {
        require(founder.verifyFounder(""), "Unauthorized");
        pulseAdapter = _adapter;
    }

    function setProveXWrapper(address _wrapper) external {
        require(founder.verifyFounder(""), "Unauthorized");
        proveXWrapper = _wrapper;
    }

    function activateCouncilAutonomy() external {
        require(founder.verifyFounder(""), "Unauthorized");
        councilAutonomyActive = true;
        // Assuming PulseAdapter and ProveXWrapper have these interfaces
        // PulseAdapter(pulseAdapter).activateCouncilAutonomy();
        (bool success1, ) = pulseAdapter.call(abi.encodeWithSignature("activateCouncilAutonomy()"));
        require(success1, "PulseAdapter activation failed");

        (bool success2, ) = proveXWrapper.call(abi.encodeWithSignature("activateCouncilAutonomy()"));
        require(success2, "ProveXWrapper activation failed");

        emit CouncilAutonomyActivated();
    }

    function setStablecoin(address _stablecoin) external {
        require(founder.verifyFounder(""), "Unauthorized");
        stablecoin = _stablecoin;
    }

    function claimInStablecoin() external {
        require(founder.verifyFounder(""), "Founder verification failed");
        require(stablecoin != address(0), "Stablecoin not set");
        uint256 currentShare = treasury.getCurrentFounderShare();
        uint256 percentage = currentShare / 100;
        uint256 claimAmount = treasury.releaseFounderShare(percentage);
        emit StablecoinSwapRequested(claimAmount, stablecoin);
    }

    function markSecurityAudited() external { require(founder.verifyFounder(""), "Unauthorized"); handoverMilestones.securityAudited = true; }
    function markFinancialStability() external { require(founder.verifyFounder(""), "Unauthorized"); handoverMilestones.financialStability = true; }
    function markBlockchainMetricsMet() external { require(founder.verifyFounder(""), "Unauthorized"); handoverMilestones.blockchainMetricsMet = true; }
    function markAiAlignmentVerified() external { require(founder.verifyFounder(""), "Unauthorized"); handoverMilestones.aiAlignmentVerified = true; }

    function triggerFullHandover(string calldata reason) external {
        require(founder.verifyFounder(""), "Unauthorized");
        // Called by heartbeat miss (90 days) or Council 75% vote or death oracle
        require(handoverMilestones.securityAudited && handoverMilestones.financialStability && handoverMilestones.blockchainMetricsMet && handoverMilestones.aiAlignmentVerified, "Milestones not met");
        councilAutonomyActive = true;
        emit FullHandoverTriggered(reason);
    }

    function claimOrReallocate() external {
        require(founder.verifyFounder(""), "Founder verification failed");

        // getCurrentFounderShare returns basis points where 500 = 5.00%
        // We divide by 100 to pass a consistent percentage (5% -> 0%) down
        uint256 currentShare = treasury.getCurrentFounderShare();
        uint256 percentage = currentShare / 100;

        uint256 epochUnused = treasury.calculateUnusedFounderShare(percentage);
        if (epochUnused > 0) {
            treasury.reallocateToNetwork(epochUnused);
            emit UnusedShareReallocated(epochUnused);
        } else {
            uint256 claimAmount = treasury.releaseFounderShare(percentage);
            emit FounderShareClaimed(claimAmount);
        }
    }

    function _authorizeUpgrade(address) internal override {
        require(msg.sender == upgradeTimelock, "Unauthorized: not upgrade timelock");
    }
}
