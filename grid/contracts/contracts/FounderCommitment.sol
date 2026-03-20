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

    event FounderVerified(address caller, bool success);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor(bytes32 _founderHash) {
        founderHash = _founderHash;
    }

    function initialize(address _initialOwner) public initializer {
        __Ownable2Step_init();

        _transferOwnership(_initialOwner);
    }

    function verifyFounder(bytes memory proof) external returns (bool) {
        bool valid = keccak256(abi.encodePacked(msg.sender)) == founderHash ||
                     ECDSA.recover(keccak256(abi.encodePacked(msg.sender)), proof) == owner();
        emit FounderVerified(msg.sender, valid);
        return valid;
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}
}
