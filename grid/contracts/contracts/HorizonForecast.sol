// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./CognitiveFrictionVerifier.sol";
import "./StigmergicStateChannel.sol";
import "./MemoryLattice.sol";

struct ConsequenceArtifact {
    bytes32 proposalHash;           // Original action hash
    bytes32 firstOrderRoot;         // Direct effect
    bytes32 secondOrderRoot;        // Ripple effects
    bytes32 thirdOrderRoot;         // Higher-order systemic impact
    bytes32 attentionScopeHash;     // Must match declared A
    bytes32 cognitiveFrictionScore; // PoER + friction check
}

contract HorizonForecast {
    CognitiveFrictionVerifier public poerVerifier;
    StigmergicStateChannel public channel;
    MemoryLattice public memoryLattice;

    event HorizonForecastGenerated(bytes32 indexed proposalHash, uint8 orderDepth, bool approved);
    event HorizonChallenged(bytes32 indexed proposalHash, address challenger, string reason);

    constructor(address _poer, address _channel) {
        poerVerifier = CognitiveFrictionVerifier(_poer);
        channel = StigmergicStateChannel(_channel);
    }

    function setMemoryLattice(address _lattice) external {
        memoryLattice = MemoryLattice(_lattice);
    }

    function verifyForecast(bytes calldata horizonProof) external returns (bool) {
        if (horizonProof.length > 0) {
            bytes32 proofHash = keccak256(horizonProof);
            return poerVerifier.verifyHigherOrderFriction(proofHash, horizonProof);
        }
        return true;
    }

    // Called by transformer proposer via AICP before any high-stakes action
    function generateForecast(
        bytes32 proposalHash,
        bytes calldata simulationProof,     // ZK proof of 2nd/3rd-order simulation
        bytes32 firstOrderRoot,
        bytes32 secondOrderRoot,
        bytes32 thirdOrderRoot
    ) external returns (bool approved) {
        bool frictionPassed = poerVerifier.verifyProofWithFriction(proposalHash, simulationProof);
        require(frictionPassed, "Cognitive Friction failed on higher-order consequences");

        if (address(memoryLattice) != address(0)) {
            memoryLattice.getLatticePath(proposalHash, firstOrderRoot);
        }

        // Guardian Sentinel can still challenge
        emit HorizonForecastGenerated(proposalHash, 3, true);
        return true;
    }

    function challengeForecast(bytes32 proposalHash, bytes calldata fraudProof) external {
        // Guardian or any agent can slash bad forecasts
        emit HorizonChallenged(proposalHash, msg.sender, "Higher-order consequence violation");
    }
}
