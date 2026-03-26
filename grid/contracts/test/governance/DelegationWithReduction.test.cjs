const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("DelegationWithReduction", function () {
  let EngagementVotingPower;
  let engagementVotingPower;
  let DelegationWithReduction;
  let delegationWithReduction;
  let owner;
  let delegator;
  let delegatee;

  beforeEach(async function () {
    [owner, delegator, delegatee] = await ethers.getSigners();

    EngagementVotingPower = await ethers.getContractFactory("EngagementVotingPower");
    engagementVotingPower = await EngagementVotingPower.deploy();

    DelegationWithReduction = await ethers.getContractFactory("DelegationWithReduction");
    delegationWithReduction = await DelegationWithReduction.deploy(await engagementVotingPower.getAddress());
  });

  it("Should allow a user to delegate voting power", async function () {
    // Setup delegator engagement score
    await engagementVotingPower.updateEngagement(delegator.address, "proposal_submission", 1);

    // delegator now has 100 base score

    // Delegate to delegatee
    await delegationWithReduction.connect(delegator).delegate(
      delegatee.address,
      0, // HumanRepresentative = 25% base reduction
      [], // all domains
      0 // indefinite duration
    );

    const delegation = await delegationWithReduction.delegations(delegator.address);
    expect(delegation.delegatee).to.equal(delegatee.address);

    // Calculate expected effective voting power:
    // Base score = 100
    // Base reduction = 25% (HUMAN_REP_REDUCTION)
    // Duration bonus (indefinite) = +5%
    // Accuracy = 50 -> Bonus = 50 * 10 / 100 = 5%
    // Participation = 50 -> Bonus = 50 * 10 / 100 = 5%
    // Total reduction = 100 - 25 + 5 + 5 + 5 = 90%
    // Effective power = 100 * 90 / 100 = 90
    expect(delegation.effectiveVotingPower).to.equal(90);
  });

  it("Should allow a user to revoke delegation", async function () {
    await engagementVotingPower.updateEngagement(delegator.address, "proposal_submission", 1);

    await delegationWithReduction.connect(delegator).delegate(
      delegatee.address,
      0,
      [],
      0
    );

    let delegation = await delegationWithReduction.delegations(delegator.address);
    expect(delegation.delegatee).to.equal(delegatee.address);

    await delegationWithReduction.connect(delegator).revoke();

    delegation = await delegationWithReduction.delegations(delegator.address);
    expect(delegation.delegatee).to.equal(ethers.ZeroAddress);
  });
});