// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "../CognitiveFrictionVerifier.sol";
import "../core/DigitalEntityRegistry.sol";

contract EducationalNode is Ownable {
    DigitalEntityRegistry public registry;
    CognitiveFrictionVerifier public poerVerifier;

    struct LearningSession {
        uint256 sessionId;
        uint256 timestamp;
        uint256 poerBoost;
        string topic;
    }

    mapping(address => LearningSession[]) public sessions;
    uint256 public nextSessionId;

    event SessionRecorded(address indexed symbiote, uint256 sessionId, string topic, uint256 poerBoost);

    constructor(address _registry, address _poerVerifier) Ownable(msg.sender) {
        registry = DigitalEntityRegistry(_registry);
        poerVerifier = CognitiveFrictionVerifier(_poerVerifier);
    }

    // EducationalNode tracks symbiote learning sessions and triggers PoER growth
    function recordLearningSession(address symbiote, string calldata topic, uint256 boostAmount) external onlyOwner {
        (, bool exists, ) = registry.entities(symbiote);
        require(exists, "Symbiote must have a digital entity");

        sessions[symbiote].push(LearningSession({
            sessionId: nextSessionId,
            timestamp: block.timestamp,
            poerBoost: boostAmount,
            topic: topic
        }));

        // Grant PoER boost
        uint256 currentScore = poerVerifier.poerScores(symbiote);
        poerVerifier.updatePoERScore(symbiote, currentScore + boostAmount);

        emit SessionRecorded(symbiote, nextSessionId, topic, boostAmount);
        nextSessionId++;
    }

    function getSessionsCount(address symbiote) external view returns (uint256) {
        return sessions[symbiote].length;
    }
}
