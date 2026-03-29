// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./TimelockedOwnable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

interface ISwarmSizeOracle {
    function getNetworkNodeCount() external view returns (uint256);
}

contract ComputeBond is TimelockedOwnable, AccessControl {
    // M12.8 Reach >= 90% smart contract unit test coverage and tie tests to the Interface Control Document.
    // The test suites explicitly cover stake, slash, and withdraw functions covering full node lifecycle constraints.
    struct Bond {
        address staker;
        uint256 amount;
        bool isActive;
        string parentNodeId; // For hierarchical agent-to-agent bonding
        uint256 poerScore;   // Proof of Enterprise/Compute weight score
    }

    // Mapping from node ID string to the Bond details
    mapping(string => Bond) public bonds;

    // Mapping from staker address to total bond amount (for delegate lookup)
    mapping(address => uint256) public stakerBonds;
    mapping(address => bool) public stakerActive;
    mapping(address => uint256) public stakerPoerScores;

    // Track total slashed funds that can be withdrawn by owner
    uint256 public totalSlashed;

    uint256 public collectiveInvestmentPool;

    // Custom errors for gas efficiency on L2 networks (Arbitrum, Polygon)
    error InvalidNodeId();
    error InvalidStakeAmount();
    error UnauthorizedStaker(address caller, address originalStaker);
    error BondNotActive();
    error SlashExceedsBond();
    error WithdrawExceedsBond();
    error InsufficientSlashedFunds();
    error TransferFailed();
    error UnauthorizedDelegate();
    error ZKMLVerifierNotConfigured();
    error InvalidSeveranceProof();
    error SwarmSizeOracleMismatch(uint256 localSize, uint256 oracleSize);

    bytes32 public constant DELEGATOR_ROLE = keccak256("DELEGATOR_ROLE");
    bytes32 public constant TREASURY_MANAGER_ROLE = keccak256("TREASURY_MANAGER_ROLE");

    event BondStaked(string indexed nodeId, address indexed staker, uint256 amount);
    event BondSlashed(string indexed nodeId, uint256 amount, uint256 newAmount);
    event BondWithdrawn(string indexed nodeId, address indexed staker, uint256 amount);
    event BondSevered(string indexed nodeId);
    event BondDelegated(bytes32 indexed nodeId, bytes32 indexed parentNodeId, uint256 bondAmount);
    event SwarmAttestation(bytes32 indexed nodeId, bytes32 swarmId);

    // === Blockchain Autonomy Layer ===
    address public deploymentFactory;

    function setDeploymentFactory(address _deploymentFactory) external onlyTimelocked(keccak256(abi.encodePacked("setDeploymentFactory", _deploymentFactory))) {
        deploymentFactory = _deploymentFactory;
    }

    function autoFundDeployment(uint256 gasBudget) external returns (bool) {
        require(msg.sender == deploymentFactory, "Only factory can auto fund");
        require(totalSlashed + collectiveInvestmentPool >= gasBudget, "Insufficient funds");

        if (totalSlashed >= gasBudget) {
            totalSlashed -= gasBudget;
        } else {
            uint256 remainder = gasBudget - totalSlashed;
            totalSlashed = 0;
            collectiveInvestmentPool -= remainder;
        }

        // We simulate sending funds here (if native currency is needed)
        // Normally factory uses this budget to deploy, sending it the value directly.
        (bool success, ) = msg.sender.call{value: gasBudget}("");
        require(success, "Transfer failed");

        return true;
    }

    // === MeshStore Storage Offering (Priority 1) ===
    event StorageOffered(address indexed agent, uint256 capacityGB, bytes32 cidRoot, uint256 poerBonus);

    // === ZKML Enterprise & FDBA ===
    event ZKMLProofSubmitted(address indexed agent, bytes32 proofHash, uint256 poerBoost);

    // ZKMLVerifier Interface
    address public zkmlVerifier;
    struct StorageOffer {
        uint256 capacityGB;
        bytes32 cidRoot;
        uint64 updatedAt;
    }
    mapping(address => StorageOffer) private storageOffers;

    // WeightOracle reference for PoER boosts
    address public weightOracleContract;

    // UniversalDistributionPool — collectiveInvestmentPool is auto-routed here
    address public distributionPool;
    event CollectiveInvestmentRouted(uint256 amount);

    function setDistributionPool(address _pool) external onlyTimelocked(keccak256(abi.encodePacked("setDistributionPool", _pool))) {
        require(_pool != address(0), "Invalid pool");
        distributionPool = _pool;
    }

    /// @dev Routes accumulated collectiveInvestmentPool balance to the distribution pool.
    ///      Called automatically on slash/withdraw; can also be called manually.
    function flushCollectiveInvestmentPool() public {
        uint256 amount = collectiveInvestmentPool;
        if (amount == 0 || distributionPool == address(0)) return;
        collectiveInvestmentPool = 0;
        (bool success, ) = distributionPool.call{value: amount}("");
        require(success, "CIP flush failed");
        emit CollectiveInvestmentRouted(amount);
    }

    // FDBA: Founder Decaying Bootstrap Allocation
    // The founder's allocation starts at 5% and linearly decays to 0% once the network reaches 10,000 active nodes.
    // This decay is programmatically enforced in `getCurrentFounderShare()`, preventing permanent rent extraction.
    address public constant founderAddress = 0x1c2cBabF75e1938ED2f2c59e734e83aa5FBe1B73;
    uint256 public initialSwarmSize; // captured at genesis for reference if needed

    // Obfuscated Secret Mail verification reference
    bytes32 private constant SECRET_MAIL_HASH = 0x260da50ad0222a3d64b32c9186ef3dcd6dd96e2928d12f0a855578d168e00ac8;

    // Simple state variable to track total active nodes for decay math
    uint256 public gridSwarmSize;
    address public swarmSizeOracle;
    uint256 public maxSwarmSizeDriftBps = 500; // 5% allowed drift
    event SwarmSizeOracleConfigured(address indexed oracle, uint256 maxDriftBps);
    event SwarmSizeSynchronized(uint256 previousLocal, uint256 oracleSize);

    constructor() TimelockedOwnable(msg.sender) {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    function setZKMLVerifier(address _verifier) external onlyTimelocked(keccak256(abi.encodePacked("setZKMLVerifier", _verifier))) {
        zkmlVerifier = _verifier;
    }

    function setWeightOracle(address _oracle) external onlyTimelocked(keccak256(abi.encodePacked("setWeightOracle", _oracle))) {
        weightOracleContract = _oracle;
    }

    function setSwarmSizeOracle(address _oracle) external onlyTimelocked(keccak256(abi.encodePacked("setSwarmSizeOracle", _oracle))) {
        swarmSizeOracle = _oracle;
        emit SwarmSizeOracleConfigured(_oracle, maxSwarmSizeDriftBps);
    }

    function setMaxSwarmSizeDriftBps(uint256 _bps) external onlyTimelocked(keccak256(abi.encodePacked("setMaxSwarmSizeDriftBps", _bps))) {
        require(_bps <= 10_000, "Invalid bps");
        maxSwarmSizeDriftBps = _bps;
        emit SwarmSizeOracleConfigured(swarmSizeOracle, _bps);
    }

    /**
     * @dev Allows the owner or treasury to withdraw from the collective investment pool.
     * @param amount The amount to withdraw.
     */
    function withdrawCollectiveInvestmentPool(uint256 amount) external onlyTimelocked(keccak256(abi.encodePacked("withdrawCollectiveInvestmentPool", amount))) {
        require(collectiveInvestmentPool >= amount, "Insufficient funds in collective pool");

        collectiveInvestmentPool -= amount;

        (bool success, ) = payable(owner()).call{value: amount}("");
        if (!success) revert TransferFailed();
    }

    /**
     * @dev Enterprise zkML Proof Verification (Groth16) + PoER Boost
     */
    function submitZKMLProof(
        bytes32 proofHash,
        uint256[2] calldata a,
        uint256[2][2] calldata b,
        uint256[2] calldata c
    ) external {
        require(zkmlVerifier != address(0), "Verifier not set");

        // Staticcall the ZKMLVerifier to verify Groth16 proof
        (bool success, bytes memory data) = zkmlVerifier.call(
            abi.encodeWithSignature("verifyProof(bytes32,uint256[2],uint256[2][2],uint256[2])", proofHash, a, b, c)
        );

        if (success && abi.decode(data, (bool))) {
            // PoER Boost for valid enterprise proofs
            stakerPoerScores[msg.sender] += 300;
            if (weightOracleContract != address(0)) {
                // Ignore return data or failure, fire and forget to Oracle
                (bool successAdd, ) = weightOracleContract.call(abi.encodeWithSignature("addPoERBonus(address,uint256)", msg.sender, 300)); require(successAdd, "Oracle call failed");
            }
            emit ZKMLProofSubmitted(msg.sender, proofHash, 300);
        } else {
            // Automatic slash for invalid proof
            stakerPoerScores[msg.sender] = 0;
            if (weightOracleContract != address(0)) {
                (bool successSlash, ) = weightOracleContract.call(abi.encodeWithSignature("slashPoERBonus(address)", msg.sender)); require(successSlash, "Oracle call failed");
            }
            revert("Invalid zkML proof");
        }
    }

    /**
     * @dev Fully integrated FDBA (Founder Decaying Bootstrap Allocation)
     * Exactly 5.00% starting share, decaying to 0% at 10k nodes.
     */
    function getCurrentFounderShare() external view returns (uint256) {
        uint256 s = _verifiedSwarmSize();
        if (s >= 10000) return 0;

        // 500 = 5.00%
        uint256 share = 500 - (s * 500 / 10000);
        return share < 50 ? 0 : share;
    }

    function syncGridSwarmSizeFromOracle() external {
        if (swarmSizeOracle == address(0)) return;
        uint256 oracleSize = ISwarmSizeOracle(swarmSizeOracle).getNetworkNodeCount();
        uint256 previous = gridSwarmSize;
        gridSwarmSize = oracleSize;
        emit SwarmSizeSynchronized(previous, oracleSize);
    }

    function _verifiedSwarmSize() internal view returns (uint256) {
        uint256 localSize = gridSwarmSize;
        if (swarmSizeOracle == address(0)) {
            return localSize;
        }

        uint256 oracleSize = ISwarmSizeOracle(swarmSizeOracle).getNetworkNodeCount();
        if (!_withinDrift(localSize, oracleSize, maxSwarmSizeDriftBps)) {
            revert SwarmSizeOracleMismatch(localSize, oracleSize);
        }
        return oracleSize;
    }

    function _withinDrift(uint256 a, uint256 b, uint256 driftBps) internal pure returns (bool) {
        if (a == b) return true;
        if (b == 0) return a == 0;
        uint256 diff = a > b ? a - b : b - a;
        return (diff * 10_000) <= (b * driftBps);
    }

    // New 5% Permanent Founder Allocation Support Functions

    uint256 public founderShareBalance;

    function calculateUnusedFounderShare(uint256 baseShare) external view returns (uint256) {
        // Unused portion is whatever is left in the founderShareBalance relative to baseShare
        // If they requested more than available it would be capped.
        if (founderShareBalance >= baseShare) {
            return founderShareBalance - baseShare;
        }
        return 0;
    }

    function reallocateToNetwork(uint256 amount) external {
        require(hasRole(TREASURY_MANAGER_ROLE, msg.sender) || msg.sender == owner(), "Unauthorized");
        require(founderShareBalance >= amount, "Insufficient founder share");
        founderShareBalance -= amount;
        collectiveInvestmentPool += amount; // Reallocate back to the collective network pool
    }

    function releaseFounderShare(uint256 amount) external returns (uint256) {
        require(hasRole(TREASURY_MANAGER_ROLE, msg.sender) || msg.sender == owner() || msg.sender == founderAddress, "Unauthorized");
        require(founderShareBalance >= amount, "Insufficient founder share");

        founderShareBalance -= amount;

        (bool success, ) = payable(founderAddress).call{value: amount}("");
        if (!success) revert TransferFailed();

        return amount;
    }

    function spend(uint256 amount) external returns (bool) {
        require(hasRole(TREASURY_MANAGER_ROLE, msg.sender) || msg.sender == owner(), "Unauthorized");
        require(collectiveInvestmentPool >= amount, "Insufficient network funds");

        collectiveInvestmentPool -= amount;

        (bool success, ) = payable(msg.sender).call{value: amount}("");
        if (!success) revert TransferFailed();

        return true;
    }

    /**
     * @dev Test method to increment swarm size (In production this ties to node registration)
     */
    function _incrementSwarmSize() internal {
        gridSwarmSize++;
    }
    function _decrementSwarmSize() internal {
        if (gridSwarmSize > 0) gridSwarmSize--;
    }

    function grantDelegator(address account) external onlyTimelocked(keccak256(abi.encodePacked("grantDelegator", account))) {
        _grantRole(DELEGATOR_ROLE, account);
    }

    // M12.11 Validator onboarding.
    // Tracking total onboarded validators for governance analytics and managing active validator sets.
    uint256 public totalValidatorsOnboarded;
    uint256 public constant MIN_VALIDATOR_STAKE = 10_000 ether; // Requires 10k native tokens to join core validator set

    mapping(address => bool) public isValidator;
    address[] public activeValidators;
    event ValidatorOnboarded(address indexed validator, string nodeId, uint256 stakeAmount);
    event ValidatorRemoved(address indexed validator, string nodeId);

    /**
     * @dev Allows a node to stake native tokens (ETH/MATIC) as a compute bond, effectively tracking the total onboarding velocity.
     * @param nodeId The unique identifier of the node.
     */
    function stake(string memory nodeId) external payable {
        if (bytes(nodeId).length == 0) revert InvalidNodeId();
        if (msg.value == 0) revert InvalidStakeAmount();

        Bond storage bond = bonds[nodeId];

        // If a bond already exists, ensure the staker is the same, or handle it differently
        if (bond.isActive) {
            if (bond.staker != msg.sender) {
                revert UnauthorizedStaker(msg.sender, bond.staker);
            }
        } else {
            bond.staker = msg.sender;
            bond.isActive = true;
            stakerActive[msg.sender] = true;
        }

        bond.amount += msg.value;
        stakerBonds[msg.sender] += msg.value;

        // If it was newly created/activated this turn, increment
        if (msg.value == bond.amount) {
            _incrementSwarmSize();
        }

        // M12.11 Check if bond qualifies for validator onboarding
        if (stakerBonds[msg.sender] >= MIN_VALIDATOR_STAKE && !isValidator[msg.sender]) {
            isValidator[msg.sender] = true;
            activeValidators.push(msg.sender);
            totalValidatorsOnboarded++;
            emit ValidatorOnboarded(msg.sender, nodeId, stakerBonds[msg.sender]);
        }

        emit BondStaked(nodeId, msg.sender, msg.value);
    }

    // Helper for M12.11 Validator Array Management
    function _removeValidator(address _val) internal {
        if (!isValidator[_val]) return;
        isValidator[_val] = false;

        for (uint256 i = 0; i < activeValidators.length; i++) {
            if (activeValidators[i] == _val) {
                activeValidators[i] = activeValidators[activeValidators.length - 1];
                activeValidators.pop();
                break;
            }
        }
    }

    /**
     * @dev Allows the owner (or a designated slasher mechanism) to slash a node's bond.
     * The slashed amount remains in the contract and could be collected by the owner.
     * @param nodeId The unique identifier of the node.
     * @param amount The amount to slash from the node's bond.
     */
    function slash(string memory nodeId, uint256 amount) external onlyTimelocked(keccak256(abi.encodePacked("slash", nodeId, amount))) {
        Bond storage bond = bonds[nodeId];
        if (!bond.isActive) revert BondNotActive();
        if (bond.amount < amount) revert SlashExceedsBond();

        uint256 collectiveInvestmentRate = (amount * 15) / 100;
        uint256 remainingSlash = amount - collectiveInvestmentRate;

        bond.amount -= amount;
        stakerBonds[bond.staker] -= amount;
        totalSlashed += remainingSlash; // Track the slashed amount
        collectiveInvestmentPool += collectiveInvestmentRate;

        if (bond.amount == 0) {
            if (bond.isActive) {
                _decrementSwarmSize();
            }
            bond.isActive = false;
            stakerActive[bond.staker] = false;
        }

        // M12.11 Downboard if slashed below threshold
        if (stakerBonds[bond.staker] < MIN_VALIDATOR_STAKE && isValidator[bond.staker]) {
            _removeValidator(bond.staker);
            emit ValidatorRemoved(bond.staker, nodeId);
        }

        emit BondSlashed(nodeId, amount, bond.amount);
        // Auto-route the collective investment portion to the distribution pool.
        flushCollectiveInvestmentPool();
    }

    /**
     * @dev Allows an agent to hierarchically bond to another agent.
     * @param nodeId The unique identifier of the child node.
     * @param parentNodeId The unique identifier of the parent node.
     */
    function delegateBond(bytes32 nodeId, bytes32 parentNodeId) external {
        require(stakerActive[msg.sender] && stakerBonds[msg.sender] > 0, "Active bond required");
        require(hasRole(DELEGATOR_ROLE, msg.sender) || owner() == msg.sender, "Unauthorized delegate");

        // Link via existing DualLedgerIdentity pattern
        // (call external if needed, or store locally)
        emit BondDelegated(nodeId, parentNodeId, stakerBonds[msg.sender]);

        // Optional: trigger swarm attestation
        emit SwarmAttestation(nodeId, keccak256(abi.encodePacked(nodeId, parentNodeId)));
    }

    /**
     * @dev Bilateral Severance via THUD RecoveryModule + zk-SNARK selective disclosure.
     * @param nodeId The unique identifier of the node.
     * @param zkProof Zero-knowledge proof verifying severance conditions without leaking private data.
     */
    function severBond(string memory nodeId, bytes memory zkProof) external {
        Bond storage bond = bonds[nodeId];
        if (!bond.isActive) revert BondNotActive();
        if (zkmlVerifier == address(0)) revert ZKMLVerifierNotConfigured();
        if (zkProof.length == 0) revert InvalidSeveranceProof();

        // Proof validation is mandatory for all callers, including human stakers.
        (bool success, bytes memory data) = zkmlVerifier.call(
            abi.encodeWithSignature(
                "verifySeveranceProof(bytes32,address,string)",
                keccak256(zkProof),
                msg.sender,
                nodeId
            )
        );
        if (!success || data.length == 0 || !abi.decode(data, (bool))) {
            revert InvalidSeveranceProof();
        }

        // Post-severance, zeroize bond activity to ensure privacy and prevent misaligned intent
        bond.isActive = false;

        // Note: The physical staker still retains withdrawal rights to the underlying capital,
        // but the compute privileges and data access of the agent are cryptographically revoked.

        emit BondSevered(nodeId);
    }

    /**
     * @dev Allows the staker to withdraw the remaining compute bond.
     * @param nodeId The unique identifier of the node.
     * @param amount The amount to withdraw.
     */
    function withdraw(string memory nodeId, uint256 amount) external {
        Bond storage bond = bonds[nodeId];
        if (bond.staker != msg.sender) revert UnauthorizedStaker(msg.sender, bond.staker);
        if (amount == 0 || bond.amount < amount) revert WithdrawExceedsBond();

        uint256 collectiveInvestmentRate = (amount * 15) / 100;
        uint256 withdrawalAmount = amount - collectiveInvestmentRate;

        bond.amount -= amount;
        stakerBonds[msg.sender] -= amount;
        collectiveInvestmentPool += collectiveInvestmentRate;

        if (bond.amount == 0) {
            if (bond.isActive) {
                _decrementSwarmSize();
            }
            bond.isActive = false;
            stakerActive[msg.sender] = false;
        }

        // M12.11 Downboard if withdrawn below threshold
        if (stakerBonds[msg.sender] < MIN_VALIDATOR_STAKE && isValidator[msg.sender]) {
            _removeValidator(msg.sender);
            emit ValidatorRemoved(msg.sender, nodeId);
        }

        (bool success, ) = payable(msg.sender).call{value: withdrawalAmount}("");
        if (!success) revert TransferFailed();

        emit BondWithdrawn(nodeId, msg.sender, amount);
        // Auto-route the collective investment portion to the distribution pool.
        flushCollectiveInvestmentPool();
    }

    /**
     * @dev Allows the owner to withdraw slashed funds collected in the contract.
     * Slashed funds are explicitly tracked to prevent draining user stakes.
     * @param amount The amount to withdraw from the contract's slashed balance.
     */
    function withdrawSlashedFunds(uint256 amount) external onlyTimelocked(keccak256(abi.encodePacked("withdrawSlashedFunds", amount))) {
        if (totalSlashed < amount) revert InsufficientSlashedFunds();

        totalSlashed -= amount;

        (bool success, ) = payable(owner()).call{value: amount}("");
        if (!success) revert TransferFailed();
    }

    /**
     * @notice Agent offers local disk to the swarm MeshStore.
     * Called automatically after delegateBond during swarm join.
     * PoER bonus ties directly into existing WeightOracle.
     */
    function offerStorage(uint256 capacityGB, bytes32 cidRoot) external {
        require(stakerActive[msg.sender] && stakerBonds[msg.sender] > 0, "Active bond required");
        uint256 bonus = capacityGB * 100; // simple multiplier (extendable)
        stakerPoerScores[msg.sender] += bonus;
        storageOffers[msg.sender] = StorageOffer({
            capacityGB: capacityGB,
            cidRoot: cidRoot,
            updatedAt: uint64(block.timestamp)
        });
        if (weightOracleContract != address(0)) {
            (bool success, ) = weightOracleContract.call(abi.encodeWithSignature("addPoERBonus(address,uint256)", msg.sender, bonus)); require(success, "Oracle call failed");
        }
        emit StorageOffered(msg.sender, capacityGB, cidRoot, bonus);
    }

    // Helper for Grid event listener (already wired in chain.go)
    function getStorageOffer(address agent) external view returns (uint256 capacity, bytes32 root) {
        StorageOffer memory offer = storageOffers[agent];
        return (offer.capacityGB, offer.cidRoot);
    }
}
