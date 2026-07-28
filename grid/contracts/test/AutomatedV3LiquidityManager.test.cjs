const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("AutomatedV3LiquidityManager", function () {
  let admin, other;
  let manager;
  let founderCommitment, distPool, mockNpm;

  beforeEach(async function () {
    [admin, other] = await ethers.getSigners();

    // Deploy FounderCommitment mock
    const FounderCommitment = await ethers.getContractFactory("FounderCommitment");
    const founderHash = ethers.keccak256(ethers.solidityPacked(["address"], [admin.address]));
    founderCommitment = await FounderCommitment.deploy(founderHash);
    await founderCommitment.initialize(admin.address);

    // Deploy UniversalDistributionPool mock
    const UniversalDistributionPool = await ethers.getContractFactory("UniversalDistributionPool");
    distPool = await UniversalDistributionPool.deploy(founderCommitment.target, other.address, other.address, other.address);

    // Deploy DummyNPM
    const DummyNPM = await ethers.getContractFactory("DummyNPM");
    mockNpm = await DummyNPM.deploy();

    const AutomatedV3LiquidityManager = await ethers.getContractFactory("AutomatedV3LiquidityManager");
    manager = await AutomatedV3LiquidityManager.deploy(
      founderCommitment.target,
      distPool.target,
      mockNpm.target,
      ethers.ZeroAddress
    );
    await manager.waitForDeployment();

    // Fast forward 2 days for timelock
    await ethers.provider.send("evm_increaseTime", [2 * 24 * 60 * 60 + 1]);
    await ethers.provider.send("evm_mine");
  });

  it("should deploy correctly", async function () {
    expect(await manager.founder()).to.equal(founderCommitment.target);
    expect(await manager.distPool()).to.equal(distPool.target);
    expect(await manager.npm()).to.equal(mockNpm.target);
  });

  describe("managePosition and M12.7 throttling", function () {
    it("should allow liquidity deployment within limit", async function () {
      const tokenId = 1;
      const amount = ethers.parseEther("250000"); // 250k is the limit (5% of 5m)

      await expect(manager.managePosition(tokenId, amount, 0, 0))
        .to.emit(manager, "PositionManaged")
        .withArgs(tokenId, amount);
    });

    it("should revert if liquidity deployment exceeds limit", async function () {
      const tokenId = 1;
      const amount = ethers.parseEther("250001"); // > 250k

      await expect(manager.managePosition(tokenId, amount, 0, 0))
        .to.be.revertedWith("Exceeds max liquidity deployment limit for cooldown window");
    });

    it("should track total deployed in cooldown window correctly", async function () {
      const tokenId = 1;
      const amount1 = ethers.parseEther("125000");
      const amount2 = ethers.parseEther("125000");

      await manager.managePosition(tokenId, amount1, 0, 0);

      // Still within limit
      await expect(manager.managePosition(tokenId, amount2, 0, 0))
        .to.emit(manager, "PositionManaged")
        .withArgs(tokenId, amount2);

      // Now it should exceed
      const amount3 = ethers.parseEther("1");
      await expect(manager.managePosition(tokenId, amount3, 0, 0))
        .to.be.revertedWith("Exceeds max liquidity deployment limit for cooldown window");
    });

    it("should reset cooldown after 30 days", async function () {
      const tokenId = 1;
      const amount1 = ethers.parseEther("250000"); // reach limit

      await manager.managePosition(tokenId, amount1, 0, 0);

      // Should exceed
      const amount2 = ethers.parseEther("1");
      await expect(manager.managePosition(tokenId, amount2, 0, 0))
        .to.be.revertedWith("Exceeds max liquidity deployment limit for cooldown window");

      // Advance time by 30 days + 1 second
      await ethers.provider.send("evm_increaseTime", [30 * 24 * 60 * 60 + 1]);
      await ethers.provider.send("evm_mine");

      // Now it should allow deploying again
      await expect(manager.managePosition(tokenId, amount1, 0, 0))
        .to.emit(manager, "PositionManaged")
        .withArgs(tokenId, amount1);
    });
  });
});
