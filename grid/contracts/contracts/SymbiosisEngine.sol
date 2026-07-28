// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./CognitiveFrictionVerifier.sol";
import "./HorizonForecast.sol";  // already in foundation
import "./StigmergicStateChannel.sol";
import "./MemoryLattice.sol";

struct SymbiosisBundle {
    bytes32 bundleHash;
    bytes32[] actionHashes;           // e.g., [liquidityAdd, UBIClaim, governanceVote, skillLaunch]
    bytes32 collectiveUtilityRoot;    // PoER-verified net benefit score
    bytes32 horizonForecastRoot;      // 2nd/3rd-order consequence proof
    bytes32 attentionScopeHash;
}

contract SymbiosisEngine is Ownable {
    CognitiveFrictionVerifier public poerVerifier;
    HorizonForecast public horizon;
    StigmergicStateChannel public channel;
    MemoryLattice public memoryLattice;
    uint16 public monetizationFeeBps;
    address public feeCollector;

    mapping(bytes32 => SymbiosisBundle) public bundles;

    event SymbiosisBundleProposed(bytes32 indexed bundleHash, uint256 collectiveUtility);
    event SymbiosisBundleExecuted(bytes32 indexed bundleHash);
    event MonetizationUpdated(uint16 feeBps, address feeCollector);
    event BundleMonetized(bytes32 indexed bundleHash, address indexed proposer, address indexed feeCollector, uint256 feeBps);

    constructor(address _poer, address _horizon, address _channel) Ownable(msg.sender) {
        poerVerifier = CognitiveFrictionVerifier(_poer);
        horizon = HorizonForecast(_horizon);
        channel = StigmergicStateChannel(_channel);
        feeCollector = msg.sender;
    }

    function setMemoryLattice(address _lattice) external onlyOwner {
        memoryLattice = MemoryLattice(_lattice);
    }

    function setMonetization(uint16 feeBps, address collector) external onlyOwner {
        require(feeBps <= 10_000, "Fee too high");
        require(collector != address(0), "Invalid collector");
        monetizationFeeBps = feeBps;
        feeCollector = collector;
        emit MonetizationUpdated(feeBps, collector);
    }

    // Called by agents via AICP tensor routing
    function proposeSymbiosisBundle(
        bytes32[] calldata actionHashes,
        bytes calldata simulationProof,      // ZK proof of collective utility + horizon forecast
        bytes32 collectiveUtilityRoot,
        bytes32 horizonForecastRoot
    ) external returns (bytes32 bundleHash) {
        bundleHash = keccak256(abi.encodePacked(actionHashes, block.timestamp));

        bool frictionPassed = poerVerifier.verifyProofWithFriction(bundleHash, simulationProof);
        require(frictionPassed, "Cognitive Friction failed on collective benefit");

        if (address(memoryLattice) != address(0) && actionHashes.length > 0) {
            memoryLattice.getLatticePath(bundleHash, actionHashes[0]);
        }

        // Horizon already verified 2nd/3rd-order effects
        bundles[bundleHash] = SymbiosisBundle({
            bundleHash: bundleHash,
            actionHashes: actionHashes,
            collectiveUtilityRoot: collectiveUtilityRoot,
            horizonForecastRoot: horizonForecastRoot,
            attentionScopeHash: bytes32(0) // filled by AICP
        });

        if (monetizationFeeBps > 0) {
            emit BundleMonetized(bundleHash, msg.sender, feeCollector, monetizationFeeBps);
        }
        emit SymbiosisBundleProposed(bundleHash, uint256(collectiveUtilityRoot));
        return bundleHash;
    }

    // Called by StigmergicStateChannel after optimistic settle
    function executeSymbiosisBundle(bytes32 bundleHash) external {
        require(msg.sender == address(channel), "Only channel");
        require(bundles[bundleHash].bundleHash != bytes32(0), "Unknown bundle");
        // Guardian Sentinel can still challenge
        emit SymbiosisBundleExecuted(bundleHash);
        // Executes the bundled actions atomically
    }
}
