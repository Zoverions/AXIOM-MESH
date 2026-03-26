// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";

contract DigitalEntityRegistry is Ownable {
    struct DigitalEntity {
        address userWallet;
        bool exists;
        string shareableProfileHash; // IPFS hash or similar for the "story"
    }

    mapping(address => DigitalEntity) public entities;

    event EntityRegistered(address indexed userWallet);
    event ProfileUpdated(address indexed userWallet, string profileHash);

    constructor() Ownable(msg.sender) {}

    function registerEntity() external {
        require(!entities[msg.sender].exists, "Entity already exists");
        entities[msg.sender] = DigitalEntity(msg.sender, true, "");
        emit EntityRegistered(msg.sender);
    }

    function updateProfile(string calldata profileHash) external {
        require(entities[msg.sender].exists, "Entity does not exist");
        entities[msg.sender].shareableProfileHash = profileHash;
        emit ProfileUpdated(msg.sender, profileHash);
    }
}
