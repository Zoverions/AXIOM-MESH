// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/utils/Create2.sol";
import "./FounderCommitment.sol";           // same folder
import "./DialecticArbitration.sol";       // existing
import "./ComputeBond.sol";                // existing

/**
 * @title DeploymentFactory
 * @notice Governance-only CREATE2 factory. Deploys CitizenshipNFT, PrivateVault proxies, etc.
 *         Automatically funded from ComputeBond treasury.
 *         Fully self-upgradable via UUPS.
 */
contract DeploymentFactory is Initializable, UUPSUpgradeable {
    FounderCommitment public immutable founderCommitment;
    DialecticArbitration public immutable governance;
    ComputeBond public immutable treasury;

    event ContractDeployed(address deployed, bytes32 salt, string contractType);
    event DeploymentFunded(uint256 gasBudget);
    address public upgradeTimelock;

    function setUpgradeTimelock(address _timelock) external {
        if (upgradeTimelock == address(0)) {
            require(founderCommitment.verifyFounder(new bytes(0)), "Founder verification failed");
        } else {
            require(msg.sender == upgradeTimelock, "Unauthorized: not upgrade timelock");
        }
        upgradeTimelock = _timelock;
    }



    constructor(address _founderCommitment, address _governance, address _treasury) {
        founderCommitment = FounderCommitment(_founderCommitment);
        governance = DialecticArbitration(_governance);
        treasury = ComputeBond(_treasury);
    }

    function initialize() public initializer {

    }

    receive() external payable {}

    /**
     * @notice Only callable after successful bicameral vote in DialecticArbitration
     */
    function deploy(
        bytes memory bytecode,
        bytes32 salt,
        string calldata contractType,
        uint256 gasBudget
    ) external returns (address) {
        require(governance.isProposalPassed(keccak256(abi.encodePacked(bytecode, salt))), "Governance vote required");
        require(treasury.autoFundDeployment(gasBudget), "Treasury funding failed");

        address deployed = Create2.deploy(0, salt, bytecode);
        require(deployed != address(0), "Deployment failed");

        emit ContractDeployed(deployed, salt, contractType);
        emit DeploymentFunded(gasBudget);
        return deployed;
    }

    function _authorizeUpgrade(address) internal override {
        require(msg.sender == upgradeTimelock, "Unauthorized: not upgrade timelock");
    }
}
