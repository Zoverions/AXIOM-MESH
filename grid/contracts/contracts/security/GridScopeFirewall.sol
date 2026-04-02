// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

/**
 * @title GridScopeFirewall
 * @dev Enforces capability manifest boundaries before execution is allowed.
 * Prevents the Grid ledger from overriding Hypervisor execution policies.
 * Satisfies the architectural requirement: "Grid may verify, attest, and synchronize —
 * it must never decide intent or execution policy."
 */
contract GridScopeFirewall is Initializable, UUPSUpgradeable, OwnableUpgradeable, ReentrancyGuard {

    /// @notice Defines the strict bounds a Sandbox must operate within.
    struct CapabilityManifest {
        bytes32 executionHash;    // Hash of the intended code/action
        uint256 maxMemoryMB;      // Memory quota
        bool networkAllowed;      // Boolean flag for network egress
        address authorizedSigner; // Key that signed the manifest
    }

    /// @notice Maps execution hashes to their approved manifests.
    mapping(bytes32 => CapabilityManifest) public approvedManifests;

    /// @notice Maps execution hashes to their completion status.
    mapping(bytes32 => bool) public executedManifests;

    /// @notice Address of the Hypervisor policy engine allowed to register manifests.
    address public hypervisorPolicyEngine;

    /// @notice Address of the Timelock contract authorized to perform UUPS upgrades.
    address public upgradeTimelock;

    // --- Events ---

    /// @notice Emitted when a new capability manifest is registered by the Hypervisor.
    event ManifestRegistered(bytes32 indexed executionHash, uint256 maxMemoryMB, bool networkAllowed);

    /// @notice Emitted when a manifest is successfully verified and execution is allowed.
    event ExecutionAuthorized(bytes32 indexed executionHash, address executor);

    /// @notice Emitted when the Hypervisor policy engine address is updated.
    event PolicyEngineUpdated(address oldEngine, address newEngine);

    /// @notice Emitted when the upgrade timelock address is updated.
    event UpgradeTimelockUpdated(address oldTimelock, address newTimelock);

    // --- Modifiers ---

    /**
     * @dev Restricts access to the authorized Hypervisor policy engine.
     */
    modifier onlyHypervisor() {
        require(msg.sender == hypervisorPolicyEngine, "GridScopeFirewall: Caller is not the Hypervisor");
        _;
    }

    // --- Initialization ---

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initializes the contract.
     * @param _hypervisorPolicyEngine The address of the Hypervisor authorized to sign manifests.
     * @param _upgradeTimelock The address of the governance timelock for upgrades.
     */
    function initialize(address _hypervisorPolicyEngine, address _upgradeTimelock) public initializer {
        __Ownable_init(msg.sender);

        require(_hypervisorPolicyEngine != address(0), "GridScopeFirewall: Invalid hypervisor address");
        require(_upgradeTimelock != address(0), "GridScopeFirewall: Invalid timelock address");

        hypervisorPolicyEngine = _hypervisorPolicyEngine;
        upgradeTimelock = _upgradeTimelock;
    }

    // --- Core Logic ---

    /**
     * @notice Registers a capability manifest. Only callable by the Hypervisor.
     * @param executionHash The unique identifier for this execution.
     * @param maxMemoryMB The memory limit in MB.
     * @param networkAllowed Whether network egress is permitted.
     */
    function registerManifest(bytes32 executionHash, uint256 maxMemoryMB, bool networkAllowed) external onlyHypervisor {
        require(executionHash != bytes32(0), "GridScopeFirewall: Invalid execution hash");
        require(approvedManifests[executionHash].executionHash == bytes32(0), "GridScopeFirewall: Manifest already exists");

        approvedManifests[executionHash] = CapabilityManifest({
            executionHash: executionHash,
            maxMemoryMB: maxMemoryMB,
            networkAllowed: networkAllowed,
            authorizedSigner: msg.sender
        });

        emit ManifestRegistered(executionHash, maxMemoryMB, networkAllowed);
    }

    /**
     * @notice Verifies that an execution is allowed based on its registered manifest.
     * @dev Grid nodes call this before accepting state changes.
     * @param executionHash The hash of the execution to verify.
     * @return true if execution is authorized.
     */
    function authorizeExecution(bytes32 executionHash) external nonReentrant returns (bool) {
        CapabilityManifest memory manifest = approvedManifests[executionHash];

        require(manifest.executionHash != bytes32(0), "GridScopeFirewall: Manifest not found");
        require(!executedManifests[executionHash], "GridScopeFirewall: Execution already authorized");
        require(manifest.authorizedSigner == hypervisorPolicyEngine, "GridScopeFirewall: Invalid signer");

        executedManifests[executionHash] = true;

        emit ExecutionAuthorized(executionHash, msg.sender);
        return true;
    }

    /**
     * @notice View function to strictly verify if a manifest exists without state mutation.
     * @param executionHash The execution hash to check.
     * @return isValid Boolean indicating if the manifest is registered and valid.
     */
    function isManifestValid(bytes32 executionHash) external view returns (bool isValid) {
        return approvedManifests[executionHash].executionHash != bytes32(0);
    }

    // --- Administration ---

    /**
     * @notice Updates the Hypervisor policy engine address.
     * @param _newEngine The new hypervisor address.
     */
    function setPolicyEngine(address _newEngine) external onlyOwner {
        require(_newEngine != address(0), "GridScopeFirewall: Invalid address");
        address oldEngine = hypervisorPolicyEngine;
        hypervisorPolicyEngine = _newEngine;
        emit PolicyEngineUpdated(oldEngine, _newEngine);
    }

    /**
     * @notice Updates the Timelock address allowed to upgrade the contract.
     * @param _newTimelock The new timelock address.
     */
    function setUpgradeTimelock(address _newTimelock) external onlyOwner {
        require(_newTimelock != address(0), "GridScopeFirewall: Invalid address");
        address oldTimelock = upgradeTimelock;
        upgradeTimelock = _newTimelock;
        emit UpgradeTimelockUpdated(oldTimelock, _newTimelock);
    }

    // --- Upgradeability ---

    /**
     * @dev Restricts upgrades to the designated Timelock contract.
     */
    function _authorizeUpgrade(address newImplementation) internal override {
        require(msg.sender == upgradeTimelock, "GridScopeFirewall: Unauthorized upgrade attempt");
    }
}
