// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

contract EngagementVotingPower {

    struct EngagementProfile {
        uint256 proposalSubmissions;      // Proposals submitted
        uint256 proposalReviews;          // Proposals reviewed
        uint256 councilParticipation;     // Council sessions attended
        uint256 educationCompletions;     // Courses completed
        uint256 contentContributions;     // Educational content created
        uint256 auditParticipations;      // Audit reviews completed
        uint256 communitySupport;         // Helped other users
        uint256 predictionAccuracy;       // Forecast accuracy score
        uint256 lastActivity;             // Last engagement timestamp
        uint256 engagementScore;          // Calculated voting power
        bool active;                      // Currently active (>30 days)
    }

    mapping(address => EngagementProfile) public profiles;

    // Engagement weights (configurable by governance)
    uint256 public constant PROPOSAL_SUBMISSION_WEIGHT = 100;
    uint256 public constant PROPOSAL_REVIEW_WEIGHT = 25;
    uint256 public constant COUNCIL_PARTICIPATION_WEIGHT = 150;
    uint256 public constant EDUCATION_COMPLETION_WEIGHT = 50;
    uint256 public constant CONTENT_CONTRIBUTION_WEIGHT = 200;
    uint256 public constant AUDIT_PARTICIPATION_WEIGHT = 75;
    uint256 public constant COMMUNITY_SUPPORT_WEIGHT = 10;
    uint256 public constant PREDICTION_ACCURACY_WEIGHT = 300;
    uint256 public constant ACTIVITY_DECAY_RATE = 1;  // 1% per week inactive

    uint256 public constant MAX_INDIVIDUAL_VOTING_POWER = 200000;

    event EngagementUpdated(address indexed user, uint256 newScore);

    modifier onlyVerifiedActivity() {
        // Placeholder for access control
        _;
    }

    function min(uint256 a, uint256 b) internal pure returns (uint256) {
        return a < b ? a : b;
    }

    function calculateEngagementScore(address _user)
        public
        view
        returns (uint256)
    {
        EngagementProfile memory profile = profiles[_user];
        if (profile.lastActivity == 0) {
            return 0;
        }

        // Base calculation
        uint256 score =
            (profile.proposalSubmissions * PROPOSAL_SUBMISSION_WEIGHT) +
            (profile.proposalReviews * PROPOSAL_REVIEW_WEIGHT) +
            (profile.councilParticipation * COUNCIL_PARTICIPATION_WEIGHT) +
            (profile.educationCompletions * EDUCATION_COMPLETION_WEIGHT) +
            (profile.contentContributions * CONTENT_CONTRIBUTION_WEIGHT) +
            (profile.auditParticipations * AUDIT_PARTICIPATION_WEIGHT) +
            (profile.communitySupport * COMMUNITY_SUPPORT_WEIGHT) +
            (profile.predictionAccuracy * PREDICTION_ACCURACY_WEIGHT);

        // Activity decay (penalize inactivity)
        uint256 weeksInactive = (block.timestamp - profile.lastActivity) / 1 weeks;
        if (weeksInactive > 4) {
            uint256 decay = weeksInactive * ACTIVITY_DECAY_RATE;
            if (decay > 100) decay = 100;
            score = (score * (100 - decay)) / 100;
        }

        // Cap maximum individual voting power (prevent centralization)
        score = min(score, MAX_INDIVIDUAL_VOTING_POWER);

        return score;
    }

    function updateEngagement(
        address _user,
        string calldata _activityType,
        uint256 _activityCount
    ) external onlyVerifiedActivity {
        EngagementProfile storage profile = profiles[_user];
        profile.lastActivity = block.timestamp;
        profile.active = true;

        if (keccak256(bytes(_activityType)) == keccak256(bytes("proposal_submission"))) {
            profile.proposalSubmissions += _activityCount;
        } else if (keccak256(bytes(_activityType)) == keccak256(bytes("proposal_review"))) {
            profile.proposalReviews += _activityCount;
        } else if (keccak256(bytes(_activityType)) == keccak256(bytes("council_participation"))) {
            profile.councilParticipation += _activityCount;
        } else if (keccak256(bytes(_activityType)) == keccak256(bytes("education_completion"))) {
            profile.educationCompletions += _activityCount;
        } else if (keccak256(bytes(_activityType)) == keccak256(bytes("content_contribution"))) {
            profile.contentContributions += _activityCount;
        } else if (keccak256(bytes(_activityType)) == keccak256(bytes("audit_participation"))) {
            profile.auditParticipations += _activityCount;
        } else if (keccak256(bytes(_activityType)) == keccak256(bytes("community_support"))) {
            profile.communitySupport += _activityCount;
        } else if (keccak256(bytes(_activityType)) == keccak256(bytes("prediction_accuracy"))) {
            profile.predictionAccuracy = _activityCount;  // Replace, not add
        }

        profile.engagementScore = calculateEngagementScore(_user);

        emit EngagementUpdated(_user, profile.engagementScore);
    }
}