// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

contract CompetencyOracle is Ownable {
    struct Competency {
        string standardName;
        string description;
        bool isActive;
    }

    struct Mapping {
        bytes32 targetCurriculumId;
        uint256 equivalencyScore; // 0-100 indicating percentage match
    }

    mapping(bytes32 => Competency) public competencies;
    // Map a curriculum ID to a competency ID to its mapping details
    mapping(bytes32 => mapping(bytes32 => Mapping)) public equivalencyMaps;

    event CompetencyRegistered(bytes32 indexed id, string standardName);
    event CompetencyStatusChanged(bytes32 indexed id, bool isActive);
    event EquivalencyMapped(bytes32 indexed sourceCurriculumId, bytes32 indexed competencyId, bytes32 targetCurriculumId, uint256 score);

    constructor() Ownable(msg.sender) {}

    function registerCompetency(
        bytes32 id,
        string calldata standardName,
        string calldata description
    ) external onlyOwner {
        require(bytes(competencies[id].standardName).length == 0, "Competency already exists");

        competencies[id] = Competency({
            standardName: standardName,
            description: description,
            isActive: true
        });

        emit CompetencyRegistered(id, standardName);
    }

    function setCompetencyStatus(bytes32 id, bool isActive) external onlyOwner {
        require(bytes(competencies[id].standardName).length > 0, "Competency does not exist");
        competencies[id].isActive = isActive;

        emit CompetencyStatusChanged(id, isActive);
    }

    function mapEquivalency(
        bytes32 sourceCurriculumId,
        bytes32 competencyId,
        bytes32 targetCurriculumId,
        uint256 equivalencyScore
    ) external onlyOwner {
        require(bytes(competencies[competencyId].standardName).length > 0, "Competency does not exist");
        require(competencies[competencyId].isActive, "Competency is not active");
        require(equivalencyScore <= 100, "Score must be between 0 and 100");

        equivalencyMaps[sourceCurriculumId][competencyId] = Mapping({
            targetCurriculumId: targetCurriculumId,
            equivalencyScore: equivalencyScore
        });

        emit EquivalencyMapped(sourceCurriculumId, competencyId, targetCurriculumId, equivalencyScore);
    }

    function getEquivalency(bytes32 sourceCurriculumId, bytes32 competencyId) external view returns (bytes32 targetCurriculumId, uint256 equivalencyScore) {
        Mapping memory m = equivalencyMaps[sourceCurriculumId][competencyId];
        return (m.targetCurriculumId, m.equivalencyScore);
    }
}
