// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "./DialecticArbitration.sol";
import "./ComputeBond.sol";
import "./FounderShareManager.sol";

contract DynamicResourceAllocator is Initializable, UUPSUpgradeable {
    DialecticArbitration public immutable governance;
    ComputeBond public immutable treasury;
    FounderShareManager public immutable founderManager;

    struct TaskAllocation {
        string purpose; // "security", "environmental", "robot-workforce", etc.
        uint256 amount;
        bool active;
    }

    mapping(bytes32 => TaskAllocation) public allocations;

    event ResourcesAllocated(bytes32 taskId, string purpose, uint256 amount);
    address public upgradeTimelock;

    function setUpgradeTimelock(address _timelock) external {
        if (upgradeTimelock == address(0)) {
            require(founderManager.founder().verifyFounder(""), "Founder required");
        } else {
            require(msg.sender == upgradeTimelock, "Unauthorized: not upgrade timelock");
        }
        upgradeTimelock = _timelock;
    }



    constructor(address _governance, address _treasury, address _founderManager) {
        governance = DialecticArbitration(_governance);
        treasury = ComputeBond(_treasury);
        founderManager = FounderShareManager(_founderManager);
        _disableInitializers();
    }

    function initialize() public initializer {

    }

    function allocateToTask(
        bytes32 taskId,
        string calldata purpose,
        uint256 amount
    ) external {
        require(governance.isProposalPassed(taskId), "Bicameral governance required");
        require(treasury.spend(amount), "Treasury insufficient");

        allocations[taskId] = TaskAllocation(purpose, amount, true);
        emit ResourcesAllocated(taskId, purpose, amount);
    }

    function _authorizeUpgrade(address) internal override {
        require(msg.sender == upgradeTimelock, "Unauthorized: not upgrade timelock");
    }
}
