// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

import "./EngagementVotingPower.sol";

contract DelegationWithReduction {

    enum DelegationType {
        HumanRepresentative,
        DigitalCompanion,
        ExpertCouncil,
        PassiveAuto
    }

    struct Delegation {
        address delegator;
        address delegatee;
        DelegationType delegationType;
        string[] delegatedDomains;  // Empty = all domains
        uint256 startTime;
        uint256 expiryTime;  // 0 = indefinite
        bool revocable;
        uint256 baseEngagementScore;
        uint256 reductionPercentage;
        uint256 effectiveVotingPower;
        uint256 delegateAccuracyScore;
        uint256 delegateParticipationRate;
    }

    mapping(address => Delegation) public delegations;
    mapping(address => uint256) public receivedDelegations;

    EngagementVotingPower public engagementVotingPower;

    constructor(address _engagementVotingPower) {
        engagementVotingPower = EngagementVotingPower(_engagementVotingPower);
    }

    // Base reduction percentages
    uint256 public constant HUMAN_REP_REDUCTION = 25;  // 75% power
    uint256 public constant DIGITAL_COMPANION_REDUCTION = 20;  // 80% power
    uint256 public constant EXPERT_COUNCIL_REDUCTION = 30;  // 70% power
    uint256 public constant PASSIVE_AUTO_REDUCTION = 40;  // 60% power

    // Dynamic adjustment parameters
    uint256 public constant ACCURACY_BONUS_MAX = 10;  // Max +10% for accuracy
    uint256 public constant PARTICIPATION_BONUS_MAX = 10;  // Max +10% for participation
    uint256 public constant DURATION_BONUS_MAX = 5;  // Max +5% for long-term

    event Delegated(
        address indexed delegator,
        address indexed delegatee,
        DelegationType delegationType,
        uint256 effectivePower
    );
    event Revoked(address indexed delegator, address indexed delegatee);

    function min(uint256 a, uint256 b) internal pure returns (uint256) {
        return a < b ? a : b;
    }

    function calculateEffectiveVotingPower(Delegation memory delegation)
        public
        view
        returns (uint256)
    {
        // Base reduction
        uint256 reduction;
        if (delegation.delegationType == DelegationType.HumanRepresentative) {
            reduction = HUMAN_REP_REDUCTION;
        } else if (delegation.delegationType == DelegationType.DigitalCompanion) {
            reduction = DIGITAL_COMPANION_REDUCTION;
        } else if (delegation.delegationType == DelegationType.ExpertCouncil) {
            reduction = EXPERT_COUNCIL_REDUCTION;
        } else {
            reduction = PASSIVE_AUTO_REDUCTION;
        }

        // Dynamic bonuses
        uint256 accuracyBonus = min(
            (delegation.delegateAccuracyScore * ACCURACY_BONUS_MAX) / 100,
            ACCURACY_BONUS_MAX
        );

        uint256 participationBonus = min(
            (delegation.delegateParticipationRate * PARTICIPATION_BONUS_MAX) / 100,
            PARTICIPATION_BONUS_MAX
        );

        uint256 durationBonus = 0;
        if (delegation.expiryTime == 0 || delegation.expiryTime > block.timestamp + 365 days) {
            durationBonus = DURATION_BONUS_MAX;  // Long-term delegation
        }

        // Calculate effective power
        uint256 effectivePower = delegation.baseEngagementScore *
            (100 - reduction + accuracyBonus + participationBonus + durationBonus) /
            100;

        return effectivePower;
    }

    function delegate(
        address _delegatee,
        DelegationType _type,
        string[] memory _domains,
        uint256 _duration
    ) external {
        // Revoke existing delegation if any
        if (delegations[msg.sender].delegatee != address(0)) {
            revoke();
        }

        // Get delegator's engagement score
        uint256 baseScore = engagementVotingPower.calculateEngagementScore(msg.sender);

        // Get delegatee's performance metrics
        (uint256 accuracy, uint256 participation) = getDelegateeMetrics(_delegatee);

        // Create delegation
        delegations[msg.sender] = Delegation({
            delegator: msg.sender,
            delegatee: _delegatee,
            delegationType: _type,
            delegatedDomains: _domains,
            startTime: block.timestamp,
            expiryTime: _duration > 0 ? block.timestamp + _duration : 0,
            revocable: true,
            baseEngagementScore: baseScore,
            reductionPercentage: getBaseReduction(_type),
            effectiveVotingPower: 0,  // Calculated below
            delegateAccuracyScore: accuracy,
            delegateParticipationRate: participation
        });

        // Calculate effective voting power
        uint256 effectivePower = calculateEffectiveVotingPower(delegations[msg.sender]);
        delegations[msg.sender].effectiveVotingPower = effectivePower;

        receivedDelegations[_delegatee] += effectivePower;

        emit Delegated(msg.sender, _delegatee, _type, effectivePower);
    }

    function revoke() public {
        Delegation memory delegation = delegations[msg.sender];
        require(delegation.delegatee != address(0), "No delegation to revoke");
        require(delegation.revocable, "Delegation not revocable");

        receivedDelegations[delegation.delegatee] -= delegation.effectiveVotingPower;
        delete delegations[msg.sender];

        emit Revoked(msg.sender, delegation.delegatee);
    }

    function getDelegateeMetrics(address)
        public
        pure
        returns (uint256 accuracy, uint256 participation)
    {
        // Default to median values for now, would integrate with WeightOracle in production
        accuracy = 50;
        participation = 50;
    }

    function getBaseReduction(DelegationType _type)
        public
        pure
        returns (uint256)
    {
        if (_type == DelegationType.HumanRepresentative) {
            return HUMAN_REP_REDUCTION;
        } else if (_type == DelegationType.DigitalCompanion) {
            return DIGITAL_COMPANION_REDUCTION;
        } else if (_type == DelegationType.ExpertCouncil) {
            return EXPERT_COUNCIL_REDUCTION;
        } else {
            return PASSIVE_AUTO_REDUCTION;
        }
    }
}