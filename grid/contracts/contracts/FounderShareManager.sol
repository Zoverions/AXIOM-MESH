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

    constructor(address _founder, address _treasury) {
        founder = FounderCommitment(_founder);
        treasury = ComputeBond(_treasury);
        _disableInitializers();
    }

    function initialize() public initializer {

        lastEpochAllocation = block.timestamp;
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
        require(founder.verifyFounder(""), "Unauthorized");
    }
}
