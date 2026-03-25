// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract SSIRegistry {
    struct DIDDocument {
        address controller;
        uint256 keyRotationCooldown;
        bool revoked;
    }

    // Mapping from DID hash to DID document state
    mapping(bytes32 => DIDDocument) public didDocuments;

    // Events for BLK-A.4 alignment (no raw PII)
    event DIDRegistered(bytes32 indexed didHash, address indexed controller);
    event DIDUpdated(bytes32 indexed didHash, address indexed newController);
    event DIDRevoked(bytes32 indexed didHash);

    event ConsentAnchored(
        bytes32 indexed subjectDID,
        bytes32 indexed requesterDID,
        uint256 purposeCode,
        bytes32 scopeHash,
        uint256 expiry,
        bytes32 nonce
    );

    uint256 public constant COOLDOWN_PERIOD = 1 days;

    modifier onlyController(bytes32 didHash) {
        require(didDocuments[didHash].controller == msg.sender, "Not DID controller");
        require(!didDocuments[didHash].revoked, "DID is revoked");
        _;
    }

    function registerDID(bytes32 didHash) external {
        require(didDocuments[didHash].controller == address(0), "DID already registered");
        didDocuments[didHash] = DIDDocument({
            controller: msg.sender,
            keyRotationCooldown: block.timestamp,
            revoked: false
        });
        emit DIDRegistered(didHash, msg.sender);
    }

    function rotateKey(bytes32 didHash, address newController) external onlyController(didHash) {
        require(block.timestamp >= didDocuments[didHash].keyRotationCooldown + COOLDOWN_PERIOD, "Key rotation on cooldown");
        didDocuments[didHash].controller = newController;
        didDocuments[didHash].keyRotationCooldown = block.timestamp;
        emit DIDUpdated(didHash, newController);
    }

    function revokeDID(bytes32 didHash) external onlyController(didHash) {
        didDocuments[didHash].revoked = true;
        emit DIDRevoked(didHash);
    }

    function anchorConsent(
        bytes32 subjectDID,
        bytes32 requesterDID,
        uint256 purposeCode,
        bytes32 scopeHash,
        uint256 expiry,
        bytes32 nonce
    ) external onlyController(subjectDID) {
        require(expiry > block.timestamp, "Expiry must be in the future");
        emit ConsentAnchored(subjectDID, requesterDID, purposeCode, scopeHash, expiry, nonce);
    }
}
