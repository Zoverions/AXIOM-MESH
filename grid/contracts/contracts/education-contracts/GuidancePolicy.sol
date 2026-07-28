// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

contract GuidancePolicy is Ownable {
    struct LearnerProfile {
        uint8 age; // Optional: could be a range or category code in real deployments
        uint8 riskTolerance; // e.g., 0: low risk, 1: moderate, 2: high
        bool requiresHumanMentor;
        bool isRestricted; // Used if flagged for interventions
    }

    struct Policy {
        string name;
        uint8 minAge;
        uint8 maxRiskTolerance;
        bool mandatoryHumanMentor;
        bool isActive;
    }

    mapping(address => LearnerProfile) public learners;
    mapping(bytes32 => Policy) public policies; // Policy per curriculum or region

    event LearnerRegistered(address indexed learner, uint8 age, uint8 riskTolerance, bool requiresMentor);
    event LearnerUpdated(address indexed learner, bool requiresMentor, bool isRestricted);
    event PolicyDefined(bytes32 indexed policyId, string name, uint8 minAge, uint8 maxRiskTolerance, bool mandatoryHumanMentor);
    event PolicyStatusChanged(bytes32 indexed policyId, bool isActive);
    event InterventionTriggered(address indexed learner, string reason);

    constructor() Ownable(msg.sender) {}

    function registerLearner(uint8 age, uint8 riskTolerance, bool requiresMentor) external {
        require(learners[msg.sender].age == 0, "Learner already registered"); // simplistic check

        learners[msg.sender] = LearnerProfile({
            age: age,
            riskTolerance: riskTolerance,
            requiresHumanMentor: requiresMentor,
            isRestricted: false
        });

        emit LearnerRegistered(msg.sender, age, riskTolerance, requiresMentor);
    }

    function updateLearnerStatus(address learner, bool requiresMentor, bool isRestricted) external onlyOwner {
        require(learners[learner].age > 0, "Learner not registered");

        learners[learner].requiresHumanMentor = requiresMentor;
        learners[learner].isRestricted = isRestricted;

        emit LearnerUpdated(learner, requiresMentor, isRestricted);
    }

    function triggerIntervention(address learner, string calldata reason) external onlyOwner {
        require(learners[learner].age > 0, "Learner not registered");

        learners[learner].requiresHumanMentor = true;
        learners[learner].isRestricted = true;

        emit InterventionTriggered(learner, reason);
    }

    function definePolicy(
        bytes32 policyId,
        string calldata name,
        uint8 minAge,
        uint8 maxRiskTolerance,
        bool mandatoryHumanMentor
    ) external onlyOwner {
        policies[policyId] = Policy({
            name: name,
            minAge: minAge,
            maxRiskTolerance: maxRiskTolerance,
            mandatoryHumanMentor: mandatoryHumanMentor,
            isActive: true
        });

        emit PolicyDefined(policyId, name, minAge, maxRiskTolerance, mandatoryHumanMentor);
    }

    function setPolicyStatus(bytes32 policyId, bool isActive) external onlyOwner {
        require(bytes(policies[policyId].name).length > 0, "Policy not found");
        policies[policyId].isActive = isActive;

        emit PolicyStatusChanged(policyId, isActive);
    }

    function isLearnerEligible(address learner, bytes32 policyId) external view returns (bool, string memory) {
        LearnerProfile memory profile = learners[learner];
        if (profile.age == 0) return (false, "Learner not registered");
        if (profile.isRestricted) return (false, "Learner is restricted");

        Policy memory policy = policies[policyId];
        if (bytes(policy.name).length == 0) return (false, "Policy not found");
        if (!policy.isActive) return (false, "Policy inactive");

        if (profile.age < policy.minAge) return (false, "Age requirement not met");
        if (profile.riskTolerance > policy.maxRiskTolerance) return (false, "Risk tolerance exceeded");
        if (policy.mandatoryHumanMentor && !profile.requiresHumanMentor) return (false, "Human mentor required by policy");

        return (true, "Eligible");
    }
}
