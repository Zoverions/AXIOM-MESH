// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "./UniversalDistributionPool.sol";
import "./DynamicResourceAllocator.sol";

contract RobotWorkforce is Initializable, UUPSUpgradeable {
    UniversalDistributionPool public immutable pool;
    DynamicResourceAllocator public immutable allocator;

    struct Robot {
        uint256 tokenId;
        string model;
        uint256 salary; // paid from pool
        bool active;
    }

    mapping(uint256 => Robot) public robots;

    event RobotDeployed(uint256 tokenId, string model);
    event PayrollProcessed(uint256 robotId, uint256 amount);

    constructor(address _pool, address _allocator) {
        pool = UniversalDistributionPool(_pool);
        allocator = DynamicResourceAllocator(_allocator);
        _disableInitializers();
    }

    function initialize() public initializer {

    }

    function deployRobot(uint256 tokenId, string calldata model, uint256 salary) external {
        require(allocator.governance().isProposalPassed(keccak256(abi.encode(tokenId))), "Governance required");
        robots[tokenId] = Robot(tokenId, model, salary, true);
        emit RobotDeployed(tokenId, model);
    }

    function processRobotPayroll(uint256 robotId) external {
        Robot memory r = robots[robotId];
        require(r.active, "Robot inactive");
        pool.distribute(address(this), r.salary, keccak256(abi.encode(robotId)));  // paid via pool
        emit PayrollProcessed(robotId, r.salary);
    }

    function __UUPSUpgradeable_init() internal {}

    function _authorizeUpgrade(address) internal override {
        // Founder backstop
    }
}