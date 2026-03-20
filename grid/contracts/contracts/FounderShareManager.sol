// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "./FounderCommitment.sol";
import "./ComputeBond.sol";

contract FounderShareManager is Initializable, UUPSUpgradeable {
    FounderCommitment public immutable founder;
    ComputeBond public immutable treasury;
    uint256 public constant PERMANENT_FOUNDER_SHARE = 5; // 5%
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

        uint256 epochUnused = treasury.calculateUnusedFounderShare(PERMANENT_FOUNDER_SHARE);
        if (epochUnused > 0) {
            treasury.reallocateToNetwork(epochUnused);
            emit UnusedShareReallocated(epochUnused);
        } else {
            uint256 claimAmount = treasury.releaseFounderShare(PERMANENT_FOUNDER_SHARE);
            emit FounderShareClaimed(claimAmount);
        }
    }

    function _authorizeUpgrade(address) internal override {
        require(founder.verifyFounder(""), "Unauthorized");
    }
}
