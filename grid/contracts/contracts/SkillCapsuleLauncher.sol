// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";

contract SkillCapsuleLauncher is Ownable {
    event SkillCapsuleLaunched(bytes32 indexed capsuleId, address indexed proposer, string uri);

    constructor() Ownable(msg.sender) {}

    function launch(bytes32 capsuleId, string calldata uri) external {
        emit SkillCapsuleLaunched(capsuleId, msg.sender, uri);
    }
}
