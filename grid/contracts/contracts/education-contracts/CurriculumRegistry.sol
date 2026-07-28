// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

contract CurriculumRegistry is Ownable {
    struct Curriculum {
        address provider;
        string version;
        bytes32 provenanceDigest;
        uint256 updateCadence; // in seconds
        uint256 lastUpdated;
        bool isDegraded;
        bool isArchived;
    }

    mapping(bytes32 => Curriculum) public curriculums;
    mapping(address => bool) public authorizedProviders;

    event CurriculumRegistered(bytes32 indexed id, address indexed provider, string version, bytes32 provenanceDigest);
    event CurriculumUpdated(bytes32 indexed id, string newVersion, bytes32 newProvenanceDigest);
    event CurriculumFlagged(bytes32 indexed id, string reason);
    event ProviderAuthorized(address indexed provider);
    event ProviderRevoked(address indexed provider);

    constructor() Ownable(msg.sender) {}

    modifier onlyAuthorizedProvider() {
        require(authorizedProviders[msg.sender] || msg.sender == owner(), "Not an authorized provider");
        _;
    }

    function authorizeProvider(address provider) external onlyOwner {
        authorizedProviders[provider] = true;
        emit ProviderAuthorized(provider);
    }

    function revokeProvider(address provider) external onlyOwner {
        authorizedProviders[provider] = false;
        emit ProviderRevoked(provider);
    }

    function registerCurriculum(
        bytes32 id,
        string calldata version,
        bytes32 provenanceDigest,
        uint256 updateCadence
    ) external onlyAuthorizedProvider {
        require(curriculums[id].provider == address(0), "Curriculum already registered");

        curriculums[id] = Curriculum({
            provider: msg.sender,
            version: version,
            provenanceDigest: provenanceDigest,
            updateCadence: updateCadence,
            lastUpdated: block.timestamp,
            isDegraded: false,
            isArchived: false
        });

        emit CurriculumRegistered(id, msg.sender, version, provenanceDigest);
    }

    function updateCurriculum(
        bytes32 id,
        string calldata newVersion,
        bytes32 newProvenanceDigest
    ) external {
        Curriculum storage cur = curriculums[id];
        require(cur.provider != address(0), "Curriculum not found");
        require(msg.sender == cur.provider || msg.sender == owner(), "Unauthorized");
        require(!cur.isArchived, "Curriculum is archived");

        cur.version = newVersion;
        cur.provenanceDigest = newProvenanceDigest;
        cur.lastUpdated = block.timestamp;
        cur.isDegraded = false; // Reset degraded status on update

        emit CurriculumUpdated(id, newVersion, newProvenanceDigest);
    }

    function checkStaleness(bytes32 id) external {
        Curriculum storage cur = curriculums[id];
        require(cur.provider != address(0), "Curriculum not found");
        require(!cur.isArchived, "Curriculum is archived");

        if (cur.updateCadence > 0 && block.timestamp > cur.lastUpdated + cur.updateCadence) {
            cur.isDegraded = true;
            emit CurriculumFlagged(id, "Stale curriculum");
        }
    }

    function flagCurriculum(bytes32 id, bool degrade, bool archive, string calldata reason) external onlyOwner {
        Curriculum storage cur = curriculums[id];
        require(cur.provider != address(0), "Curriculum not found");

        if (degrade) cur.isDegraded = true;
        if (archive) cur.isArchived = true;

        emit CurriculumFlagged(id, reason);
    }

    function isCurriculumValid(bytes32 id) external view returns (bool) {
        Curriculum storage cur = curriculums[id];
        if (cur.provider == address(0)) return false;
        if (cur.isArchived) return false;
        if (cur.isDegraded) return false;
        if (cur.updateCadence > 0 && block.timestamp > cur.lastUpdated + cur.updateCadence) return false;
        return true;
    }
}
