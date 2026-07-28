const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("SoulboundReputation", function () {
  let SoulboundReputation;
  let soulboundReputation;
  let owner;
  let addr1;
  let addr2;

  beforeEach(async function () {
    [owner, addr1, addr2] = await ethers.getSigners();

    SoulboundReputation = await ethers.getContractFactory("SoulboundReputation");
    soulboundReputation = await SoulboundReputation.deploy();
  });

  it("Should properly create and update reputation", async function () {
    // 0 = Expertise
    await soulboundReputation.updateReputation(addr1.address, 0, "security", 100);

    let score = await soulboundReputation.getReputationScore(addr1.address, 0);
    expect(score).to.equal(100);

    // Increase score
    await soulboundReputation.updateReputation(addr1.address, 0, "security", 50);

    score = await soulboundReputation.getReputationScore(addr1.address, 0);
    expect(score).to.equal(150);

    // Decrease score
    await soulboundReputation.updateReputation(addr1.address, 0, "security", -20);

    score = await soulboundReputation.getReputationScore(addr1.address, 0);
    expect(score).to.equal(130);
  });

  it("Should clamp reputation score correctly", async function () {
    // Underflow test (below 0)
    await soulboundReputation.updateReputation(addr1.address, 0, "security", -50);

    let score = await soulboundReputation.getReputationScore(addr1.address, 0);
    expect(score).to.equal(0); // Should be clamped to 0

    // Overflow test (above 1000)
    await soulboundReputation.updateReputation(addr1.address, 0, "security", 1500);

    score = await soulboundReputation.getReputationScore(addr1.address, 0);
    expect(score).to.equal(1000); // Should be clamped to 1000
  });

  it("Should prevent transfers", async function () {
    await soulboundReputation.updateReputation(addr1.address, 0, "security", 100);

    // Get token ID. Since it's the first one, it should be 0.
    const tokenId = 0;

    await expect(
      soulboundReputation.connect(addr1).transferFrom(addr1.address, addr2.address, tokenId)
    ).to.be.revertedWith("Soulbound: Cannot transfer reputation tokens");

    await expect(
      soulboundReputation.connect(addr1).safeTransferFrom(addr1.address, addr2.address, tokenId)
    ).to.be.revertedWith("Soulbound: Cannot transfer reputation tokens");
  });

  it("Should allow owner to burn their token", async function () {
    await soulboundReputation.updateReputation(addr1.address, 0, "security", 100);

    const tokenId = 0;
    let token = await soulboundReputation.tokens(tokenId);
    expect(token.active).to.be.true;

    await soulboundReputation.connect(addr1).burnReputation(tokenId);

    token = await soulboundReputation.tokens(tokenId);
    expect(token.active).to.be.false;
    expect(token.score).to.equal(0);
  });
});
