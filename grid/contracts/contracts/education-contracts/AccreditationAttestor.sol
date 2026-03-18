// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

contract AccreditationAttestor is Ownable {
    struct Accreditation {
        address body;
        uint256 issueDate;
        uint256 expiryDate;
        bool isRevoked;
    }

    mapping(address => bool) public authorizedBodies;
    // Map a curriculum ID to its accreditation status
    mapping(bytes32 => Accreditation) public accreditations;

    event BodyAuthorized(address indexed body);
    event BodyRevoked(address indexed body);
    event AccreditationAttested(bytes32 indexed curriculumId, address indexed body, uint256 expiryDate);
    event AccreditationRevoked(bytes32 indexed curriculumId, address indexed body, string reason);
    event AccreditationRenewed(bytes32 indexed curriculumId, address indexed body, uint256 newExpiryDate);

    constructor() Ownable(msg.sender) {}

    modifier onlyAuthorizedBody() {
        require(authorizedBodies[msg.sender] || msg.sender == owner(), "Not an authorized accreditation body");
        _;
    }

    function authorizeBody(address body) external onlyOwner {
        authorizedBodies[body] = true;
        emit BodyAuthorized(body);
    }

    function revokeBody(address body) external onlyOwner {
        authorizedBodies[body] = false;
        emit BodyRevoked(body);
    }

    function attest(bytes32 curriculumId, uint256 durationInDays) external onlyAuthorizedBody {
        Accreditation storage acc = accreditations[curriculumId];
        require(acc.body == address(0), "Accreditation already exists");

        uint256 expiry = block.timestamp + (durationInDays * 1 days);
        accreditations[curriculumId] = Accreditation({
            body: msg.sender,
            issueDate: block.timestamp,
            expiryDate: expiry,
            isRevoked: false
        });

        emit AccreditationAttested(curriculumId, msg.sender, expiry);
    }

    function renew(bytes32 curriculumId, uint256 additionalDays) external {
        Accreditation storage acc = accreditations[curriculumId];
        require(acc.body != address(0), "Accreditation not found");
        require(msg.sender == acc.body || msg.sender == owner(), "Unauthorized");
        require(!acc.isRevoked, "Accreditation is revoked");

        // If expired, renew from today, otherwise add to existing expiry
        if (block.timestamp > acc.expiryDate) {
            acc.expiryDate = block.timestamp + (additionalDays * 1 days);
        } else {
            acc.expiryDate += (additionalDays * 1 days);
        }

        emit AccreditationRenewed(curriculumId, msg.sender, acc.expiryDate);
    }

    function revokeAccreditation(bytes32 curriculumId, string calldata reason) external {
        Accreditation storage acc = accreditations[curriculumId];
        require(acc.body != address(0), "Accreditation not found");
        require(msg.sender == acc.body || msg.sender == owner(), "Unauthorized to revoke");
        require(!acc.isRevoked, "Already revoked");

        acc.isRevoked = true;
        emit AccreditationRevoked(curriculumId, msg.sender, reason);
    }

    function isAccreditationValid(bytes32 curriculumId) external view returns (bool) {
        Accreditation storage acc = accreditations[curriculumId];
        if (acc.body == address(0)) return false;
        if (acc.isRevoked) return false;
        if (block.timestamp > acc.expiryDate) return false;
        return true;
    }
}
