// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title EducationTomeRegistry
 * @dev Registry for Education Tome interactions within the education capsule ecosystem
 * Tracks student interactions with multi-agent education personas
 * Integrates with OntarioEducationAttestor for credential attestation
 */
contract EducationTomeRegistry is Ownable {
    struct TomeSession {
        address student;
        string sessionId;
        string action;
        string parameters;
        uint256 timestamp;
        bool completed;
        float64 trustScore;
        string output;
    }
    
    struct PersonaStats {
        uint256 totalSessions;
        uint256 completedSessions;
        float64 averageTrustScore;
        uint256 lastActiveAt;
    }
    
    mapping(bytes32 => TomeSession) public sessions;
    mapping(address => bytes32[]) public studentSessions;
    mapping(string => PersonaStats) public personaStats;
    mapping(address => string[]) public studentPersonaInteractions;
    
    event SessionCreated(
        bytes32 indexed sessionId,
        address indexed student,
        string action,
        string persona
    );
    
    event SessionCompleted(
        bytes32 indexed sessionId,
        address indexed student,
        string output,
        float64 trustScore
    );
    
    event PersonaRegistered(string persona);
    
    constructor(address _owner) Ownable(_owner) {}
    
    /**
     * @dev Create a new education tome session
     */
    function createSession(
        address _student,
        string memory _sessionId,
        string memory _action,
        string memory _parameters,
        string memory _persona
    ) external onlyOwner returns (bytes32) {
        require(_student != address(0), "EducationTomeRegistry: Invalid student address");
        require(bytes(_sessionId).length > 0, "EducationTomeRegistry: Session ID required");
        
        bytes32 sessionKey = keccak256(abi.encodePacked(_student, _sessionId, block.timestamp));
        
        sessions[sessionKey] = TomeSession({
            student: _student,
            sessionId: _sessionId,
            action: _action,
            parameters: _parameters,
            timestamp: block.timestamp,
            completed: false,
            trustScore: 0,
            output: ""
        });
        
        studentSessions[_student].push(sessionKey);
        
        // Update persona stats
        if (personaStats[_persona].totalSessions == 0) {
            emit PersonaRegistered(_persona);
        }
        personaStats[_persona].totalSessions++;
        personaStats[_persona].lastActiveAt = block.timestamp;
        
        emit SessionCreated(sessionKey, _student, _action, _persona);
        
        return sessionKey;
    }
    
    /**
     * @dev Complete an education tome session with results
     */
    function completeSession(
        bytes32 _sessionKey,
        string memory _output,
        float64 _trustScore
    ) external onlyOwner {
        require(sessions[_sessionKey].timestamp > 0, "EducationTomeRegistry: Session not found");
        require(!sessions[_sessionKey].completed, "EducationTomeRegistry: Session already completed");
        
        sessions[_sessionKey].completed = true;
        sessions[_sessionKey].output = _output;
        sessions[_sessionKey].trustScore = _trustScore;
        
        emit SessionCompleted(_sessionKey, sessions[_sessionKey].student, _output, _trustScore);
    }
    
    /**
     * @dev Get all sessions for a student
     */
    function getStudentSessions(address _student) external view returns (bytes32[] memory) {
        return studentSessions[_student];
    }
    
    /**
     * @dev Get session details
     */
    function getSession(bytes32 _sessionKey) external view returns (
        address student,
        string memory sessionId,
        string memory action,
        string memory parameters,
        uint256 timestamp,
        bool completed,
        float64 trustScore,
        string memory output
    ) {
        TomeSession storage session = sessions[_sessionKey];
        return (
            session.student,
            session.sessionId,
            session.action,
            session.parameters,
            session.timestamp,
            session.completed,
            session.trustScore,
            session.output
        );
    }
    
    /**
     * @dev Get persona statistics
     */
    function getPersonaStats(string memory _persona) external view returns (
        uint256 totalSessions,
        uint256 completedSessions,
        float64 averageTrustScore,
        uint256 lastActiveAt
    ) {
        PersonaStats storage stats = personaStats[_persona];
        return (
            stats.totalSessions,
            stats.completedSessions,
            stats.averageTrustScore,
            stats.lastActiveAt
        );
    }
}
