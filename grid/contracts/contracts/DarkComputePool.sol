// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./ShadowBridge.sol";
import "./DynamicResourceAllocator.sol";
import "./FounderCommitment.sol";

contract DarkComputePool is Initializable, UUPSUpgradeable, ReentrancyGuard {
    ShadowBridge public immutable bridge;
    DynamicResourceAllocator public immutable allocator;
    FounderCommitment public immutable founder;

    struct Contribution {
        bytes32 phantomDIDHash;
        uint256 computeUnits;
        bytes32 zkProofHash;
        uint256 rewardClaimed;
    }

    mapping(bytes32 => Contribution) public contributions;
    event AnonymousContribution(bytes32 phantomDIDHash, uint256 computeUnits, bytes32 zkProofHash);

    constructor(address _bridge, address _allocator, address _founder) {
        bridge = ShadowBridge(_bridge);
        allocator = DynamicResourceAllocator(_allocator);
        founder = FounderCommitment(_founder);
        _disableInitializers();
    }

    function initialize() public initializer {
    }

    function submitAnonymousContribution(
        bytes32 phantomDIDHash,
        uint256 computeUnits,
        bytes32 zkProofHash
    ) external nonReentrant {
        require(bridge.verifyZkStealthProof(abi.encode(zkProofHash)), "Invalid zk proof");

        contributions[phantomDIDHash] = Contribution(phantomDIDHash, computeUnits, zkProofHash, 0);
        emit AnonymousContribution(phantomDIDHash, computeUnits, zkProofHash);

        // Auto-allocate reward from DynamicResourceAllocator (blinded)
        allocator.allocateToTask(keccak256(abi.encode(phantomDIDHash)), "dark-compute-reward", computeUnits * 1e12);
    }

    function _authorizeUpgrade(address) internal override {
        require(founder.verifyFounder(""), "Founder verification failed");
    }
}
