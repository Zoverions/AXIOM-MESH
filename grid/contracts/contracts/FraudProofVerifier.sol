// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";

/// @notice Canonical IFraudProofVerifier implementation for StigmergicStateChannel.
/// @dev Fraud proofs are accepted only when:
///      - encoded channelId/stateRoot match the challenged channel
///      - violation type is in an enabled allowlist
///      - evidence payload is non-empty
contract FraudProofVerifier is Ownable {
    enum ViolationType {
        NONE,
        INVALID_STATE_TRANSITION,
        INVALID_ZKML_OUTPUT,
        DOUBLE_SPEND,
        INVALID_DEPENDENCY_GRAPH,
        INVALID_EXECUTION_TRACE
    }

    struct DecodedFraudProof {
        bytes32 channelId;
        bytes32 claimedStateRoot;
        uint8 violationType;
        bytes evidence;
    }

    mapping(uint8 => bool) public enabledViolationTypes;

    event ViolationTypeStatusUpdated(uint8 indexed violationType, bool enabled);

    constructor(address initialOwner) Ownable(initialOwner) {
        enabledViolationTypes[uint8(ViolationType.INVALID_STATE_TRANSITION)] = true;
        enabledViolationTypes[uint8(ViolationType.INVALID_ZKML_OUTPUT)] = true;
        enabledViolationTypes[uint8(ViolationType.DOUBLE_SPEND)] = true;
        enabledViolationTypes[uint8(ViolationType.INVALID_DEPENDENCY_GRAPH)] = true;
        enabledViolationTypes[uint8(ViolationType.INVALID_EXECUTION_TRACE)] = true;
    }

    function setViolationTypeStatus(uint8 violationType, bool enabled) external onlyOwner {
        require(violationType != uint8(ViolationType.NONE), "Invalid violation type");
        enabledViolationTypes[violationType] = enabled;
        emit ViolationTypeStatusUpdated(violationType, enabled);
    }

    function verifyFraudProof(
        bytes32 channelId,
        bytes32 claimedStateRoot,
        bytes calldata fraudProof
    ) external view returns (bool) {
        if (fraudProof.length == 0) {
            return false;
        }

        DecodedFraudProof memory decoded = abi.decode(fraudProof, (DecodedFraudProof));

        if (decoded.channelId != channelId || decoded.claimedStateRoot != claimedStateRoot) {
            return false;
        }
        if (!enabledViolationTypes[decoded.violationType]) {
            return false;
        }
        if (decoded.evidence.length == 0) {
            return false;
        }

        return true;
    }
}
