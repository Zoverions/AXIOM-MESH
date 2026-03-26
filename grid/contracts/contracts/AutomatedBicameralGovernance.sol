// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./DialecticArbitration.sol";

// M12.12 Governance simulation.
contract AutomatedBicameralGovernance is Ownable {
    DialecticArbitration public arbitrationContract;

    // Flag to enable a safe mode where governance parameter changes are only simulated and logged, not enacted.
    bool public simulationModeActive;
    event SimulationExecuted(bytes32 indexed peerClassId, ActionType simulatedPolicy);

    // Policy structures
    enum ActionType { None, Deny, AllowWithReview, Allow }

    struct PeerClassRisk {
        ActionType defaultPolicy;
        uint256 minSecurityProfile; // 0 to 3
        uint256 maxRiskTier;        // 0 to 4
        bool quarantined;
    }

    // Emergency pause state
    bool public systemPaused;

    mapping(bytes32 => PeerClassRisk) public peerClassRisks;

    event EmergencyPauseInvoked(string reason);
    event EmergencyPauseLifted();
    event PeerClassQuarantined(bytes32 indexed peerClassId, string reason);
    event PolicyUpdated(bytes32 indexed peerClassId, ActionType defaultPolicy, uint256 minSecurityProfile, uint256 maxRiskTier);
    event ArbitrationContractUpdated(address indexed newContract);

    error SystemIsPaused();
    error UnauthorizedAIGovernor();
    error InvalidSecurityProfile();
    error InvalidRiskTier();
    error NotAIGovernor(address caller);

    // Modifier simulating an AIGovernor oracle calling this
    // In production, an ECDSA/ZK verified message from the Hypervisor or an external oracle network
    modifier onlyAIGovernor() {
        if (msg.sender != owner()) revert NotAIGovernor(msg.sender);
        _;
    }

    constructor(address _arbitrationContract) Ownable(msg.sender) {
        arbitrationContract = DialecticArbitration(_arbitrationContract);
    }

    function setArbitrationContract(address _newArbitrationContract) external onlyOwner {
        arbitrationContract = DialecticArbitration(_newArbitrationContract);
        emit ArbitrationContractUpdated(_newArbitrationContract);
    }

    modifier onlyWhenActive() {
        if (systemPaused) revert SystemIsPaused();
        _;
    }

    /**
     * @dev Emergency Circuit Breaker - Instantly pauses network interactions
     */
    function emergencyPause(string calldata reason) external onlyAIGovernor {
        systemPaused = true;
        emit EmergencyPauseInvoked(reason);
    }

    /**
     * @dev Lifts the emergency circuit breaker
     */
    function liftEmergencyPause() external onlyAIGovernor {
        systemPaused = false;
        emit EmergencyPauseLifted();
    }

    /**
     * @dev Auto-quarantine a compromised peer class based on zkML anomaly detection
     */
    function autoQuarantinePeerClass(bytes32 peerClassId, string calldata reason) external onlyAIGovernor {
        peerClassRisks[peerClassId].quarantined = true;
        peerClassRisks[peerClassId].defaultPolicy = ActionType.Deny;
        emit PeerClassQuarantined(peerClassId, reason);
    }

    /**
     * @dev Enforce minimum security profile dynamically based on active threats
     */
    function raiseMinSecurityProfile(bytes32 peerClassId, uint256 newProfile) external onlyAIGovernor onlyWhenActive {
        if (newProfile > 3) revert InvalidSecurityProfile();
        if (peerClassRisks[peerClassId].minSecurityProfile < newProfile) {
            peerClassRisks[peerClassId].minSecurityProfile = newProfile;
            emit PolicyUpdated(
                peerClassId,
                peerClassRisks[peerClassId].defaultPolicy,
                newProfile,
                peerClassRisks[peerClassId].maxRiskTier
            );
        }
    }

    /**
     * @dev Set simulation mode
     */
    function setSimulationMode(bool _active) external onlyAIGovernor {
        simulationModeActive = _active;
    }

    /**
     * @dev Updates overall policy configuration
     */
    function updatePolicy(
        bytes32 peerClassId,
        ActionType defaultPolicy,
        uint256 minSecurityProfile,
        uint256 maxRiskTier
    ) external onlyAIGovernor onlyWhenActive {
        if (minSecurityProfile > 3) revert InvalidSecurityProfile();
        if (maxRiskTier > 4) revert InvalidRiskTier();

        if (simulationModeActive) {
            // M12.12 Governance Simulation: Only emit event to track hypothetical impact, do not alter state
            emit SimulationExecuted(peerClassId, defaultPolicy);
            return;
        }

        peerClassRisks[peerClassId] = PeerClassRisk({
            defaultPolicy: defaultPolicy,
            minSecurityProfile: minSecurityProfile,
            maxRiskTier: maxRiskTier,
            quarantined: peerClassRisks[peerClassId].quarantined
        });

        emit PolicyUpdated(peerClassId, defaultPolicy, minSecurityProfile, maxRiskTier);
    }

    /**
     * @dev Example method demonstrating usage of arbitrationContract.
     * This acts as an automated mechanism to submit syntheses based on detected deadlocks.
     */
    function synthesizeDeadlock(uint256 proposalId, string calldata synthesisResult, uint256 newDuration) external onlyAIGovernor onlyWhenActive {
        // Assume AIGovernor has validated the deadlock state off-chain,
        // and forwards the generated synthesis to the Arbitration contract.
        arbitrationContract.submitSynthesis(proposalId, synthesisResult, newDuration);
    }
}
