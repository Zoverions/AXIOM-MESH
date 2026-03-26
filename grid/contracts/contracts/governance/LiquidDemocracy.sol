// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

import "./EngagementVotingPower.sol";
import "./SoulboundReputation.sol";

contract LiquidDemocracy {

    struct DelegateProfile {
        address delegate;
        string bio;
        string[] focusAreas;
        uint256 minimumReputationRequired;
        uint256 feePercentage; // Fee for managing delegation (0-100)
        bool active;
        uint256 totalDelegatedPower;
    }

    struct DelegationInfo {
        address delegatee;
        uint256 powerDelegated;
        uint256 timestamp;
        bool active;
    }

    mapping(address => DelegateProfile) public delegateProfiles;
    address[] public registeredDelegates;

    mapping(address => DelegationInfo) public userDelegations;

    EngagementVotingPower public engagementVotingPower;
    SoulboundReputation public reputation;

    event DelegateRegistered(address indexed delegate, string[] focusAreas, uint256 minRepRequired, uint256 feePercentage);
    event DelegateStatusUpdated(address indexed delegate, bool active);
    event PowerDelegated(address indexed delegator, address indexed delegatee, uint256 power);
    event PowerRevoked(address indexed delegator, address indexed delegatee, uint256 power);

    constructor(address _engagementVotingPower, address _reputation) {
        engagementVotingPower = EngagementVotingPower(_engagementVotingPower);
        reputation = SoulboundReputation(_reputation);
    }

    function registerAsDelegate(
        string calldata bio,
        string[] calldata focusAreas,
        uint256 minRepRequired,
        uint256 feePercentage
    ) external {
        require(feePercentage <= 100, "Fee too high");
        require(bytes(bio).length > 0, "Bio required");

        if (delegateProfiles[msg.sender].delegate == address(0)) {
            registeredDelegates.push(msg.sender);
        }

        delegateProfiles[msg.sender] = DelegateProfile({
            delegate: msg.sender,
            bio: bio,
            focusAreas: focusAreas,
            minimumReputationRequired: minRepRequired,
            feePercentage: feePercentage,
            active: true,
            totalDelegatedPower: delegateProfiles[msg.sender].totalDelegatedPower
        });

        emit DelegateRegistered(msg.sender, focusAreas, minRepRequired, feePercentage);
    }

    function updateDelegateStatus(bool active) external {
        require(delegateProfiles[msg.sender].delegate != address(0), "Not a registered delegate");
        delegateProfiles[msg.sender].active = active;
        emit DelegateStatusUpdated(msg.sender, active);
    }

    function getActiveDelegates() external view returns (address[] memory) {
        uint256 count = 0;
        for (uint256 i = 0; i < registeredDelegates.length; i++) {
            if (delegateProfiles[registeredDelegates[i]].active) {
                count++;
            }
        }

        address[] memory activeList = new address[](count);
        uint256 index = 0;
        for (uint256 i = 0; i < registeredDelegates.length; i++) {
            if (delegateProfiles[registeredDelegates[i]].active) {
                activeList[index] = registeredDelegates[i];
                index++;
            }
        }

        return activeList;
    }

    function delegatePower(address delegatee) external {
        require(msg.sender != delegatee, "Cannot delegate to self");
        require(delegateProfiles[delegatee].active, "Delegate is not active");

        uint256 delegatorReputation = reputation.getAggregateReputation(msg.sender);
        require(delegatorReputation >= delegateProfiles[delegatee].minimumReputationRequired, "Insufficient reputation to delegate to this delegate");

        // Revoke any existing delegation first
        if (userDelegations[msg.sender].active) {
            revokeDelegation();
        }

        uint256 power = engagementVotingPower.calculateEngagementScore(msg.sender);
        require(power > 0, "No voting power to delegate");

        delegateProfiles[delegatee].totalDelegatedPower += power;

        userDelegations[msg.sender] = DelegationInfo({
            delegatee: delegatee,
            powerDelegated: power,
            timestamp: block.timestamp,
            active: true
        });

        emit PowerDelegated(msg.sender, delegatee, power);
    }

    function revokeDelegation() public {
        DelegationInfo storage info = userDelegations[msg.sender];
        require(info.active, "No active delegation to revoke");

        address delegatee = info.delegatee;
        uint256 power = info.powerDelegated;

        delegateProfiles[delegatee].totalDelegatedPower -= power;

        info.active = false;
        info.delegatee = address(0);
        info.powerDelegated = 0;

        emit PowerRevoked(msg.sender, delegatee, power);
    }
}
