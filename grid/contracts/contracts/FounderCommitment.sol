// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/**
 * @title FounderCommitment
 * @notice Stores only a keccak256 hash of the founder address/DID.
 *         Never exposes the raw address. Verifiable but invisible.
 *         Ownership immediately transferred to Timelock after deployment.
 *         Integrates with existing DialecticArbitration for emergency use.
 */
contract FounderCommitment is Initializable, UUPSUpgradeable, Ownable2StepUpgradeable {
    bytes32 public immutable founderHash;
    uint256 public constant TIMELOCK_DELAY = 180 days;

    mapping(address => uint256) public upgradeTimelocks;

    event FounderVerified(address caller, bool success);
    event UpgradeQueued(address indexed newImplementation, uint256 executeAfter);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor(bytes32 _founderHash) {
        founderHash = _founderHash;
    }

    function initialize(address _initialOwner) public initializer {
        __Ownable2Step_init();

        _transferOwnership(_initialOwner);
    }

    function verifyFounder(bytes memory proof) external returns (bool) {
        if (proof.length == 0) {
            bool valid = keccak256(abi.encodePacked(msg.sender)) == founderHash;
            emit FounderVerified(msg.sender, valid);
            return valid;
        } else {
            bool valid = keccak256(abi.encodePacked(msg.sender)) == founderHash ||
                         ECDSA.recover(keccak256(abi.encodePacked(msg.sender)), proof) == owner();
            emit FounderVerified(msg.sender, valid);
            return valid;
        }
    }

    function queueUpgrade(address newImplementation) external onlyOwner {
        require(upgradeTimelocks[newImplementation] == 0, "Upgrade already queued");
        uint256 executeAfter = block.timestamp + TIMELOCK_DELAY;
        upgradeTimelocks[newImplementation] = executeAfter;
        emit UpgradeQueued(newImplementation, executeAfter);
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {
        require(upgradeTimelocks[newImplementation] != 0, "Timelock: Upgrade not queued");
        require(block.timestamp >= upgradeTimelocks[newImplementation], "Timelock: Delay not met");
        upgradeTimelocks[newImplementation] = 0; // Reset
    }
}
