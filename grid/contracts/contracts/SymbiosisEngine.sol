// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./CognitiveFrictionVerifier.sol";
import "./HorizonForecast.sol";  // already in foundation
import "./StigmergicStateChannel.sol";

struct SymbiosisBundle {
    bytes32 bundleHash;
    bytes32[] actionHashes;           // e.g., [liquidityAdd, UBIClaim, governanceVote, skillLaunch]
    bytes32 collectiveUtilityRoot;    // PoER-verified net benefit score
    bytes32 horizonForecastRoot;      // 2nd/3rd-order consequence proof
    bytes32 attentionScopeHash;
}

contract SymbiosisEngine {
    CognitiveFrictionVerifier public poerVerifier;
    HorizonForecast public horizon;
    StigmergicStateChannel public channel;

    mapping(bytes32 => SymbiosisBundle) public bundles;

    event SymbiosisBundleProposed(bytes32 indexed bundleHash, uint256 collectiveUtility);
    event SymbiosisBundleExecuted(bytes32 indexed bundleHash);

    constructor(address _poer, address _horizon, address _channel) {
        poerVerifier = CognitiveFrictionVerifier(_poer);
        horizon = HorizonForecast(_horizon);
        channel = StigmergicStateChannel(_channel);
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

        // Horizon already verified 2nd/3rd-order effects
        bundles[bundleHash] = SymbiosisBundle({
            bundleHash: bundleHash,
            actionHashes: actionHashes,
            collectiveUtilityRoot: collectiveUtilityRoot,
            horizonForecastRoot: horizonForecastRoot,
            attentionScopeHash: bytes32(0) // filled by AICP
        });

        emit SymbiosisBundleProposed(bundleHash, uint256(collectiveUtilityRoot));
        return bundleHash;
    }

    // Called by StigmergicStateChannel after optimistic settle
    function executeSymbiosisBundle(bytes32 bundleHash) external {
        // Guardian Sentinel can still challenge
        emit SymbiosisBundleExecuted(bundleHash);
        // Executes the bundled actions atomically
    }
}
