const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("LiquidDemocracy", function () {
  let engagementVotingPower;
  let reputation;
  let liquidDemocracy;
  let owner;
  let delegate1;
  let delegate2;
  let delegator1;
  let delegator2;

  beforeEach(async function () {
    [owner, delegate1, delegate2, delegator1, delegator2] = await ethers.getSigners();

    // Deploy EngagementVotingPower
    const EngagementVotingPower = await ethers.getContractFactory("EngagementVotingPower");
    engagementVotingPower = await EngagementVotingPower.deploy();

    // Deploy SoulboundReputation
    const SoulboundReputation = await ethers.getContractFactory("SoulboundReputation");
    reputation = await SoulboundReputation.deploy();

    // Deploy LiquidDemocracy
    const LiquidDemocracy = await ethers.getContractFactory("LiquidDemocracy");
    liquidDemocracy = await LiquidDemocracy.deploy(
      await engagementVotingPower.getAddress(),
      await reputation.getAddress()
    );

    // Give delegators some reputation and engagement score
    // Note: In real life we'd use proper methods but for testing we can simulate/mock.
    // The EngagementVotingPower and SoulboundReputation contracts have specific logic,
    // so we will interact with them to setup state.

    // 1. Give delegator1 reputation
    // Assuming `updateReputation` exists and is callable (if onlyVerifiedActivity is bypassed for owner/test)
    // Actually, SoulboundReputation has `onlyVerifiedActivity` modifier which might restrict calls.
    // Let's check how we can add reputation.
    // Wait, let's bypass onlyVerifiedActivity in test by checking the mock or using impersonation if needed.
    // However, if we can't easily add reputation, we'll set minReputation to 0 for most tests.
  });

  describe("Delegate Registration", function () {
    it("Should allow a user to register as a delegate", async function () {
      await expect(
        liquidDemocracy.connect(delegate1).registerAsDelegate(
          "Bio for Delegate 1",
          ["DeFi", "Governance"],
          50, // minRepRequired
          5   // feePercentage
        )
      )
        .to.emit(liquidDemocracy, "DelegateRegistered")
        .withArgs(delegate1.address, ["DeFi", "Governance"], 50, 5);

      const profile = await liquidDemocracy.delegateProfiles(delegate1.address);
      expect(profile.delegate).to.equal(delegate1.address);
      expect(profile.bio).to.equal("Bio for Delegate 1");
      expect(profile.minimumReputationRequired).to.equal(50);
      expect(profile.feePercentage).to.equal(5);
      expect(profile.active).to.be.true;
    });

    it("Should reject registration if fee is too high", async function () {
      await expect(
        liquidDemocracy.connect(delegate1).registerAsDelegate(
          "Bio",
          [],
          0,
          101 // fee > 100
        )
      ).to.be.revertedWith("Fee too high");
    });

    it("Should reject registration if bio is empty", async function () {
      await expect(
        liquidDemocracy.connect(delegate1).registerAsDelegate(
          "",
          [],
          0,
          10
        )
      ).to.be.revertedWith("Bio required");
    });
  });

  describe("Delegate Status Update", function () {
    beforeEach(async function () {
      await liquidDemocracy.connect(delegate1).registerAsDelegate(
        "Bio",
        [],
        0,
        0
      );
    });

    it("Should allow delegate to update status", async function () {
      await expect(liquidDemocracy.connect(delegate1).updateDelegateStatus(false))
        .to.emit(liquidDemocracy, "DelegateStatusUpdated")
        .withArgs(delegate1.address, false);

      const profile = await liquidDemocracy.delegateProfiles(delegate1.address);
      expect(profile.active).to.be.false;
    });

    it("Should reject status update if not registered", async function () {
      await expect(
        liquidDemocracy.connect(delegate2).updateDelegateStatus(true)
      ).to.be.revertedWith("Not a registered delegate");
    });
  });

  describe("Get Active Delegates", function () {
    it("Should return a list of active delegates", async function () {
      await liquidDemocracy.connect(delegate1).registerAsDelegate("Bio 1", [], 0, 0);
      await liquidDemocracy.connect(delegate2).registerAsDelegate("Bio 2", [], 0, 0);

      let activeDelegates = await liquidDemocracy.getActiveDelegates();
      expect(activeDelegates.length).to.equal(2);
      expect(activeDelegates).to.include(delegate1.address);
      expect(activeDelegates).to.include(delegate2.address);

      await liquidDemocracy.connect(delegate1).updateDelegateStatus(false);

      activeDelegates = await liquidDemocracy.getActiveDelegates();
      expect(activeDelegates.length).to.equal(1);
      expect(activeDelegates).to.include(delegate2.address);
      expect(activeDelegates).to.not.include(delegate1.address);
    });
  });

  describe("Delegation", function () {
    beforeEach(async function () {
      await liquidDemocracy.connect(delegate1).registerAsDelegate(
        "Bio",
        [],
        0, // Set minRepRequired to 0 so we don't fail the rep check
        0
      );

      // Let's mock EngagementVotingPower.calculateEngagementScore to return something > 0
      // Actually, since EngagementVotingPower is our real contract, how do we get score?
      // Looking at EngagementVotingPower.sol, `calculateEngagementScore` calculates it based on points.
      // We can `recordActivity` in EngagementVotingPower to give delegator1 some score.
      // `recordActivity` doesn't have permissions restrictions if it's the simple version,
      // but wait, let's check EngagementVotingPower.sol.
      // In the absence of mocking, we can just record activity!
    });

    it("Should allow delegation to an active delegate when reputation is sufficient", async function () {
      // Add engagement to delegator1 so they have power
      await engagementVotingPower.updateEngagement(delegator1.address, "proposal_submission", 2);

      const scoreBefore = await engagementVotingPower.calculateEngagementScore(delegator1.address);
      expect(scoreBefore).to.be.gt(0);

      await expect(liquidDemocracy.connect(delegator1).delegatePower(delegate1.address))
        .to.emit(liquidDemocracy, "PowerDelegated")
        .withArgs(delegator1.address, delegate1.address, scoreBefore);

      const profile = await liquidDemocracy.delegateProfiles(delegate1.address);
      expect(profile.totalDelegatedPower).to.equal(scoreBefore);

      const info = await liquidDemocracy.userDelegations(delegator1.address);
      expect(info.delegatee).to.equal(delegate1.address);
      expect(info.powerDelegated).to.equal(scoreBefore);
      expect(info.active).to.be.true;
    });

    it("Should reject delegation to self", async function () {
      await expect(
        liquidDemocracy.connect(delegate1).delegatePower(delegate1.address)
      ).to.be.revertedWith("Cannot delegate to self");
    });

    it("Should reject delegation to an inactive delegate", async function () {
      await liquidDemocracy.connect(delegate1).updateDelegateStatus(false);
      await expect(
        liquidDemocracy.connect(delegator1).delegatePower(delegate1.address)
      ).to.be.revertedWith("Delegate is not active");
    });

    it("Should reject delegation when reputation is insufficient", async function () {
      await liquidDemocracy.connect(delegate2).registerAsDelegate(
        "Bio",
        [],
        1000, // Very high rep requirement
        0
      );

      await expect(
        liquidDemocracy.connect(delegator1).delegatePower(delegate2.address)
      ).to.be.revertedWith("Insufficient reputation to delegate to this delegate");
    });

    it("Should reject delegation when user has no voting power", async function () {
      // delegator2 has no engagement activity
      const score = await engagementVotingPower.calculateEngagementScore(delegator2.address);
      expect(score).to.equal(0);

      await expect(
        liquidDemocracy.connect(delegator2).delegatePower(delegate1.address)
      ).to.be.revertedWith("No voting power to delegate");
    });
  });

  describe("Revoke Delegation", function () {
    beforeEach(async function () {
      await liquidDemocracy.connect(delegate1).registerAsDelegate("Bio", [], 0, 0);

      await engagementVotingPower.updateEngagement(delegator1.address, "proposal_submission", 2);
      await liquidDemocracy.connect(delegator1).delegatePower(delegate1.address);
    });

    it("Should allow revocation of an active delegation", async function () {
      const infoBefore = await liquidDemocracy.userDelegations(delegator1.address);
      const power = infoBefore.powerDelegated;

      await expect(liquidDemocracy.connect(delegator1).revokeDelegation())
        .to.emit(liquidDemocracy, "PowerRevoked")
        .withArgs(delegator1.address, delegate1.address, power);

      const infoAfter = await liquidDemocracy.userDelegations(delegator1.address);
      expect(infoAfter.active).to.be.false;
      expect(infoAfter.delegatee).to.equal(ethers.ZeroAddress);
      expect(infoAfter.powerDelegated).to.equal(0);

      const profile = await liquidDemocracy.delegateProfiles(delegate1.address);
      expect(profile.totalDelegatedPower).to.equal(0);
    });

    it("Should reject revocation if no active delegation exists", async function () {
      await liquidDemocracy.connect(delegator1).revokeDelegation();

      await expect(
        liquidDemocracy.connect(delegator1).revokeDelegation()
      ).to.be.revertedWith("No active delegation to revoke");
    });
  });
});
