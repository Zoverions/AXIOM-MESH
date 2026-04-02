// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "./CitizenshipNFT.sol";
import "./FounderCommitment.sol";

contract DigitalLegacy is Initializable, UUPSUpgradeable {
    CitizenshipNFT public immutable citizenship;
    FounderCommitment public immutable founder;

    struct Will {
        address[] heirs;
        bytes32 dataAccessHash; // zk-proof of PrivateVault keys
        bool digitalEntityContinues;
        bool executed;
    }

    mapping(uint256 => Will) public wills; // tokenId → will

    event DeathVerified(uint256 tokenId);
    event LegacyExecuted(uint256 tokenId);
    address public upgradeTimelock;

    function setUpgradeTimelock(address _timelock) external {
        if (upgradeTimelock == address(0)) {
            require(founder.verifyFounder(""), "Founder verification failed");
        } else {
            require(msg.sender == upgradeTimelock, "Unauthorized: not upgrade timelock");
        }
        upgradeTimelock = _timelock;
    }



    constructor(address _citizenship, address _founder) {
        citizenship = CitizenshipNFT(_citizenship);
        founder = FounderCommitment(_founder);
        _disableInitializers();
    }

    function initialize() public initializer {

    }

    function notarizeWill(uint256 tokenId, address[] calldata heirs, bytes32 dataAccessHash, bool continueEntity) external {
        require(citizenship.ownerOf(tokenId) == msg.sender, "Only citizen");
        wills[tokenId] = Will(heirs, dataAccessHash, continueEntity, false);
    }

    function executeLegacy(uint256 tokenId) external {
        require(citizenship.isRevoked(tokenId), "Death not verified"); // oracle or governance call
        Will storage w = wills[tokenId];
        require(!w.executed, "Already executed");

        // Transfer data access keys (via PrivateVault integration)
        // Fork digital entity if flag set
        w.executed = true;
        emit LegacyExecuted(tokenId);
    }

    function _authorizeUpgrade(address) internal override {
        require(msg.sender == upgradeTimelock, "Unauthorized: not upgrade timelock");
    }
}
