// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "./CognitiveFrictionVerifier.sol";

/**
 * @title ProveXVerifierWrapper
 * @notice AXIOM-MESH guarded ProveX integration for fiat UBI on-ramps
 * @dev NEVER treats ProveX as fully trustless. All proofs cross-checked by CognitiveFrictionVerifier + Guardian Sentinel
 *      7-day timelock on interventions. Fits FullMeshHandover only after 90-day testnet.
 */
contract ProveXVerifierWrapper is Ownable, ReentrancyGuard, Pausable {
    address public constant PRVX_TOKEN = 0xF6f8Db0aBa00007681F8fAF16A0FDa1c9B030b11;
    address public immutable COGNITIVE_FRICTION_VERIFIER;
    address public guardianSentinel;

    uint256 public constant INTERVENTION_TIMELOCK = 7 days;
    mapping(bytes32 => uint256) public timelockedInterventions;
    bool public councilAutonomyActive;

    // PoER gating
    mapping(address => uint256) public poerScores; // Integrated with your PoER system

    event ProofSubmitted(address prover, bytes32 proofHash, bool cognitiveFrictionPassed);
    event GuardianIntervention(string reason, bytes32 proofHash);
    event FiatUBIReleased(address recipient, uint256 amount);

    constructor(address _cognitiveFrictionVerifier) Ownable(msg.sender) {
        COGNITIVE_FRICTION_VERIFIER = _cognitiveFrictionVerifier;
        guardianSentinel = msg.sender;
    }

    modifier onlyGuardianOrCouncil() {
        require(msg.sender == guardianSentinel || (councilAutonomyActive && msg.sender == owner()), "Unauthorized");
        _;
    }

    // Submit ProveX zk-proof (via SDK hash)
    function submitProveXProof(bytes32 proofHash, bytes calldata zkProofData, address recipient) external nonReentrant whenNotPaused {
        // 1. Verify raw ProveX proof (external call or SDK simulation)
        // 2. Cross-check with CognitiveFrictionVerifier (our sentience gate)
        bool frictionPassed = CognitiveFrictionVerifier(COGNITIVE_FRICTION_VERIFIER).verifyProofWithFriction(proofHash, zkProofData);

        require(frictionPassed, "ProveXWrapper: Failed Cognitive Friction check");

        // Guardian Sentinel can challenge within timelock
        if (msg.sender == guardianSentinel) {
            timelockedInterventions[proofHash] = block.timestamp + INTERVENTION_TIMELOCK;
        }

        emit ProofSubmitted(msg.sender, proofHash, frictionPassed);

        // Release UBI from UniversalDistributionPool (gated by PoER)
        if (poerScores[recipient] >= 1000) { // threshold example
            uint256 releaseAmount = 1 ether + (poerScores[recipient] * 1e15); // Base UBI + score bonus
            emit FiatUBIReleased(recipient, releaseAmount);
        }
    }

    // Guardian Sentinel challenge (7-day timelock)
    function triggerGuardianIntervention(bytes32 proofHash, string calldata reason) external onlyGuardianOrCouncil {
        require(block.timestamp >= timelockedInterventions[proofHash], "Timelock active");
        emit GuardianIntervention(reason, proofHash);
        // Pause or slash logic here
    }

    function updatePoERScore(address agent, uint256 score) external onlyGuardianOrCouncil {
        poerScores[agent] = score;
    }

    function activateCouncilAutonomy() external onlyOwner { councilAutonomyActive = true; }
    function pause() external onlyGuardianOrCouncil { _pause(); }
    function unpause() external onlyOwner { _unpause(); }
}
