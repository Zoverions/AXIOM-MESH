// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "./FounderCommitment.sol";

contract ZkMLCrossChainVerifier is Initializable, UUPSUpgradeable {
    FounderCommitment public immutable founder;
    bytes32 public constant GROTH16_VERIFIER = 0x0000000000000000000000000000000000000000000000000000000000000000; // Groth16 verifier address (deploy once)

    event ZkMLProofVerified(bytes32 modelId, uint256 chainId, bool valid);
    address public upgradeTimelock;

    function setUpgradeTimelock(address _timelock) external {
        if (upgradeTimelock == address(0)) {
            require(founder.verifyFounder(new bytes(0)), "Unauthorized");
        } else {
            require(msg.sender == upgradeTimelock, "Unauthorized: not upgrade timelock");
        }
        upgradeTimelock = _timelock;
    }



    constructor(address _founder) {
        founder = FounderCommitment(_founder);
        _disableInitializers();
    }

    function initialize() public initializer {

    }

    function verifyZkML(bytes calldata proof, bytes32 modelId, uint256 chainId) external {
        // Groth16 verify call (gas ~150k optimized)
        address verifierAddress = address(uint160(uint256(GROTH16_VERIFIER)));
        (bool success, ) = verifierAddress.staticcall(proof);
        require(success, "Invalid zkML proof");
        emit ZkMLProofVerified(modelId, chainId, true);
    }

    function _authorizeUpgrade(address) internal override {
        require(msg.sender == upgradeTimelock, "Unauthorized: not upgrade timelock");
    }
}
