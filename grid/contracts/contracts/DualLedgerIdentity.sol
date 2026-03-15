// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title DualLedgerIdentity
 * @dev A registry separating Proof of Personhood (Human Keys) from Proof of Compute (Agent Keys).
 */
contract DualLedgerIdentity is Ownable {
    enum IdentityType {
        None,
        Human, // Anthropic Chamber
        Agent  // Algorithmic Chamber
    }

    struct Identity {
        IdentityType idType;
        bool isRegistered;
    }

    mapping(address => Identity) public identities;

    // Custom errors for gas efficiency
    error NodeAlreadyRegistered(address node);
    error NodeNotRegistered(address node);
    error InvalidIdentityType();
    error UnauthorizedCaller();

    event NodeRegistered(address indexed node, IdentityType idType);
    event NodeDeregistered(address indexed node);

    constructor() Ownable(msg.sender) {}

    /**
     * @dev Register a node as either Human or Agent. Only callable by the owner (or an authorized registrar).
     * @param node The address of the node.
     * @param idType The type of identity (Human or Agent).
     */
    function registerNode(address node, IdentityType idType) external onlyOwner {
        if (idType != IdentityType.Human && idType != IdentityType.Agent) revert InvalidIdentityType();
        if (identities[node].isRegistered) revert NodeAlreadyRegistered(node);

        identities[node] = Identity({
            idType: idType,
            isRegistered: true
        });

        emit NodeRegistered(node, idType);
    }

    /**
     * @dev Deregister a node. Only callable by the owner.
     * @param node The address of the node.
     */
    function deregisterNode(address node) external onlyOwner {
        if (!identities[node].isRegistered) revert NodeNotRegistered(node);

        delete identities[node];

        emit NodeDeregistered(node);
    }

    /**
     * @dev Check if a node is registered.
     * @param node The address of the node.
     * @return True if the node is registered, false otherwise.
     */
    function isNodeRegistered(address node) external view returns (bool) {
        return identities[node].isRegistered;
    }

    /**
     * @dev Get the identity type of a node. Reverts if not registered.
     * @param node The address of the node.
     * @return The IdentityType of the node.
     */
    function getIdentityType(address node) external view returns (IdentityType) {
        if (!identities[node].isRegistered) revert NodeNotRegistered(node);
        return identities[node].idType;
    }
}
