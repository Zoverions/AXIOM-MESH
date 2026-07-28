const { expect } = require("chai");
const hre = require("hardhat");
const { ethers } = hre;

describe("DonationCampaign", function () {
  let poerVerifier, ubiPool, founderManager, campaign;
  let owner, donor;

  beforeEach(async function () {
    [owner, donor] = await ethers.getSigners();

    const CognitiveFrictionVerifier = await ethers.getContractFactory("CognitiveFrictionVerifier");
    poerVerifier = await CognitiveFrictionVerifier.deploy();

    const FounderCommitment = await ethers.getContractFactory("FounderCommitment");
    const founderHash = ethers.keccak256(owner.address);
    const founder = await FounderCommitment.deploy(founderHash);
    await founder.initialize(owner.address);

    const ComputeBond = await ethers.getContractFactory("ComputeBond");
    const treasury = await ComputeBond.deploy();

    const FounderShareManager = await ethers.getContractFactory("FounderShareManager");
    founderManager = await FounderShareManager.deploy(founder.target, treasury.target);

    // Mock UBI Pool for payable address
    const AXM = await ethers.getContractFactory("AXM");
    const axm = await AXM.deploy(owner.address, owner.address, owner.address);

    const UniversalDistributionPool = await ethers.getContractFactory("UniversalDistributionPool");
    ubiPool = await UniversalDistributionPool.deploy(founder.target, owner.address, owner.address, owner.address);

    const DonationCampaign = await ethers.getContractFactory("DonationCampaign");
    campaign = await DonationCampaign.deploy(poerVerifier.target, ubiPool.target, founderManager.target);

    // Transfer ownership of poerVerifier to the campaign so it can update scores
    await poerVerifier.transferOwnership(campaign.target);
  });

  it("Should accept donations and route properly", async function () {
    const donationAmount = ethers.parseEther("1");

    const tx = await campaign.connect(donor).donate({ value: donationAmount });
    await expect(tx).to.emit(campaign, "DonationReceived");
    await expect(tx).to.emit(campaign, "FundsAllocated");

    const stats = await campaign.getDonorStats(donor.address);
    expect(stats.contributed).to.equal(donationAmount);
  });
});
