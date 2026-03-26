const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("EngagementVotingPower", function () {
  let EngagementVotingPower;
  let engagementVotingPower;
  let owner;
  let addr1;
  let addr2;

  beforeEach(async function () {
    [owner, addr1, addr2] = await ethers.getSigners();

    EngagementVotingPower = await ethers.getContractFactory("EngagementVotingPower");
    engagementVotingPower = await EngagementVotingPower.deploy();
  });

  it("Should calculate 0 engagement score for new user", async function () {
    const score = await engagementVotingPower.calculateEngagementScore(addr1.address);
    expect(score).to.equal(0);
  });

  it("Should properly update and calculate engagement score based on activity", async function () {
    await engagementVotingPower.updateEngagement(addr1.address, "proposal_submission", 1);

    // Weight for proposal submission is 100
    const score = await engagementVotingPower.calculateEngagementScore(addr1.address);
    expect(score).to.equal(100);

    await engagementVotingPower.updateEngagement(addr1.address, "proposal_review", 2);

    // Score is 100 + (2 * 25) = 150
    const scoreAfterReview = await engagementVotingPower.calculateEngagementScore(addr1.address);
    expect(scoreAfterReview).to.equal(150);
  });

  it("Should properly cap engagement score", async function () {
    await engagementVotingPower.updateEngagement(addr1.address, "content_contribution", 2000);

    // Without cap: 2000 * 200 = 400,000. Cap is 200,000.
    const score = await engagementVotingPower.calculateEngagementScore(addr1.address);
    expect(score).to.equal(200000);
  });
});
