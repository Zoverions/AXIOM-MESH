const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("SacrificeCampaign", function () {
  let sacrificeCampaign;
  let sacrificerNFT;
  let poerVerifier;
  let ubiPool;
  let founderManager;
  let owner;
  let user1;
  let user2;

  beforeEach(async function () {
    [owner, user1, user2] = await ethers.getSigners();

    // Deploy mock CognitiveFrictionVerifier
    const MockCognitiveFrictionVerifier = await ethers.getContractFactory("CognitiveFrictionVerifier");
    poerVerifier = await MockCognitiveFrictionVerifier.deploy();

    // Deploy mock UBI Pool
    const MockUBIPool = await ethers.getContractFactory("UniversalDistributionPool");
    // Deploying a dummy contract for UBI Pool that can receive ether
    ubiPool = await MockUBIPool.deploy(owner.address, owner.address, owner.address, owner.address);

    // Deploy mock FounderShareManager
    const MockFounderShareManager = await ethers.getContractFactory("FounderShareManager");
    founderManager = await MockFounderShareManager.deploy(owner.address, owner.address);

    // Deploy SacrificerNFT
    const SacrificerNFT = await ethers.getContractFactory("SacrificerNFT");
    sacrificerNFT = await SacrificerNFT.deploy();

    // Deploy SacrificeCampaign
    const SacrificeCampaign = await ethers.getContractFactory("SacrificeCampaign");
    sacrificeCampaign = await SacrificeCampaign.deploy(
      await poerVerifier.getAddress(),
      await ubiPool.getAddress(),
      await founderManager.getAddress(),
      await sacrificerNFT.getAddress()
    );

    // Transfer ownership of SacrificerNFT to SacrificeCampaign
    await sacrificerNFT.transferOwnership(await sacrificeCampaign.getAddress());

    // Transfer ownership of CognitiveFrictionVerifier to SacrificeCampaign (so it can update poer scores in test)
    await poerVerifier.transferOwnership(await sacrificeCampaign.getAddress());
  });

  it("should deploy correctly", async function () {
    expect(await sacrificeCampaign.poerVerifier()).to.equal(await poerVerifier.getAddress());
    expect(await sacrificeCampaign.ubiPool()).to.equal(await ubiPool.getAddress());
    expect(await sacrificeCampaign.founderManager()).to.equal(await founderManager.getAddress());
    expect(await sacrificeCampaign.sacrificerNFT()).to.equal(await sacrificerNFT.getAddress());
  });

  it("should accept sacrifices and distribute funds", async function () {
    const sacrificeAmount = ethers.parseEther("1.0");

    const ubiAmount = sacrificeAmount / 2n;
    const guardianAmount = sacrificeAmount - ubiAmount;

    // Monitor balances
    const ubiInitialBalance = await ethers.provider.getBalance(await ubiPool.getAddress());

    const guardianAddress = await founderManager.guardianSentinel();
    const guardianInitialBalance = await ethers.provider.getBalance(guardianAddress);

    // Sacrifice
    // Wait, since we fixed the off-by-one bug by grabbing totalSupply BEFORE minting
    // the event should emit 0 for the very first NFT minted.
    await expect(
      sacrificeCampaign.connect(user1).sacrifice({ value: sacrificeAmount })
    )
      .to.emit(sacrificeCampaign, "Sacrificed")
      .withArgs(user1.address, sacrificeAmount, "I sacrifice to AXIOM-MESH for freedom, open source, collective benefit, and system stability. No expectation of return.")
      .and.to.emit(sacrificeCampaign, "RecognitionNFTMinted")
      .withArgs(user1.address, 0);

    // Verify balances
    const ubiFinalBalance = await ethers.provider.getBalance(await ubiPool.getAddress());
    const guardianFinalBalance = await ethers.provider.getBalance(guardianAddress);

    expect(ubiFinalBalance - ubiInitialBalance).to.equal(ubiAmount);
    expect(guardianFinalBalance - guardianInitialBalance).to.equal(guardianAmount);

    // Verify tracked amount
    expect(await sacrificeCampaign.sacrificeAmount(user1.address)).to.equal(sacrificeAmount);

    // Verify NFT minting
    expect(await sacrificeCampaign.hasReceivedNFT(user1.address)).to.be.true;
    expect(await sacrificerNFT.ownerOf(0)).to.equal(user1.address);

    // Verify PoER Boost
    expect(await poerVerifier.poerScores(user1.address)).to.equal(100n);
  });

  it("should only mint one NFT per address regardless of number of sacrifices", async function () {
    const sacrificeAmount = ethers.parseEther("0.5");

    // First sacrifice
    await sacrificeCampaign.connect(user2).sacrifice({ value: sacrificeAmount });

    expect(await sacrificeCampaign.hasReceivedNFT(user2.address)).to.be.true;
    expect(await sacrificerNFT.balanceOf(user2.address)).to.equal(1);

    // Second sacrifice
    await expect(
      sacrificeCampaign.connect(user2).sacrifice({ value: sacrificeAmount })
    )
      .to.emit(sacrificeCampaign, "Sacrificed")
      .withArgs(user2.address, sacrificeAmount, "I sacrifice to AXIOM-MESH for freedom, open source, collective benefit, and system stability. No expectation of return.");
      // Should not emit RecognitionNFTMinted

    expect(await sacrificerNFT.balanceOf(user2.address)).to.equal(1);
    expect(await sacrificeCampaign.sacrificeAmount(user2.address)).to.equal(sacrificeAmount * 2n);
  });
});
