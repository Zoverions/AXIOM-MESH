// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract UniversalConsentProtocol {
    mapping(address => bool) public consent;
    event ConsentUpdated(address indexed actor, bool enabled);

    function setConsent(bool enabled) external {
        consent[msg.sender] = enabled;
        emit ConsentUpdated(msg.sender, enabled);
    }
}
