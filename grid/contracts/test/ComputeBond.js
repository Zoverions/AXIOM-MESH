import { expect } from "chai";
import hre from "hardhat";

describe("ComputeBond", function () {
  let ComputeBond;
  let computeBond;
  let owner;
  let node1;
  let node2;
  const STAKE_AMOUNT = hre.ethers.parseEther("1.0"); // 1 ETH or MATIC
  const NODE_ID = "node-123";

  beforeEach(async function () {
    [owner, node1, node2] = await hre.ethers.getSigners();
    ComputeBond = await hre.ethers.getContractFactory("ComputeBond");
    computeBond = await ComputeBond.deploy();
  });

  describe("Staking", function () {
    it("Should allow a node to stake a bond", async function () {
      await expect(computeBond.connect(node1).stake(NODE_ID, { value: STAKE_AMOUNT }))
        .to.emit(computeBond, "BondStaked")
        .withArgs(NODE_ID, node1.address, STAKE_AMOUNT);

      const bond = await computeBond.bonds(NODE_ID);
      expect(bond.staker).to.equal(node1.address);
      expect(bond.amount).to.equal(STAKE_AMOUNT);
      expect(bond.isActive).to.be.true;
    });

    it("Should not allow staking with empty node ID", async function () {
      await expect(
        computeBond.connect(node1).stake("", { value: STAKE_AMOUNT })
      ).to.be.revertedWithCustomError(computeBond, "InvalidNodeId");
    });

    it("Should not allow staking with zero value", async function () {
      await expect(
        computeBond.connect(node1).stake(NODE_ID, { value: 0 })
      ).to.be.revertedWithCustomError(computeBond, "InvalidStakeAmount");
    });

    it("Should allow top-up staking by the same staker", async function () {
      await computeBond.connect(node1).stake(NODE_ID, { value: STAKE_AMOUNT });
      await computeBond.connect(node1).stake(NODE_ID, { value: STAKE_AMOUNT });

      const bond = await computeBond.bonds(NODE_ID);
      expect(bond.amount).to.equal(STAKE_AMOUNT * 2n);
    });

    it("Should reject top-up from a different staker for the same active node ID", async function () {
      await computeBond.connect(node1).stake(NODE_ID, { value: STAKE_AMOUNT });
      await expect(
        computeBond.connect(node2).stake(NODE_ID, { value: STAKE_AMOUNT })
      ).to.be.revertedWithCustomError(computeBond, "UnauthorizedStaker").withArgs(node2.address, node1.address);
    });
  });

  describe("Slashing", function () {
    beforeEach(async function () {
      await computeBond.connect(node1).stake(NODE_ID, { value: STAKE_AMOUNT });
    });

    it("Should allow owner to slash a bond", async function () {
      const slashAmount = hre.ethers.parseEther("0.5");
      const expectedNewAmount = STAKE_AMOUNT - slashAmount;

      await expect(computeBond.connect(owner).slash(NODE_ID, slashAmount))
        .to.emit(computeBond, "BondSlashed")
        .withArgs(NODE_ID, slashAmount, expectedNewAmount);

      const bond = await computeBond.bonds(NODE_ID);
      expect(bond.amount).to.equal(expectedNewAmount);
      expect(await computeBond.totalSlashed()).to.equal(slashAmount);
    });

    it("Should not allow non-owner to slash a bond", async function () {
      const slashAmount = hre.ethers.parseEther("0.5");

      // We look for a custom error or just reverted With something for Ownable in current oz version
      await expect(
        computeBond.connect(node2).slash(NODE_ID, slashAmount)
      ).to.be.revertedWithCustomError(computeBond, "OwnableUnauthorizedAccount")
       .withArgs(node2.address);
    });

    it("Should revert if slash amount exceeds bond amount", async function () {
      const slashAmount = hre.ethers.parseEther("2.0");
      await expect(
        computeBond.connect(owner).slash(NODE_ID, slashAmount)
      ).to.be.revertedWithCustomError(computeBond, "SlashExceedsBond");
    });

    it("Should revert if slashing a non-existent or inactive bond", async function () {
      await expect(
        computeBond.connect(owner).slash("non-existent-node", hre.ethers.parseEther("0.5"))
      ).to.be.revertedWithCustomError(computeBond, "BondNotActive");
    });
  });

  describe("Withdrawing", function () {
    beforeEach(async function () {
      await computeBond.connect(node1).stake(NODE_ID, { value: STAKE_AMOUNT });
    });

    it("Should allow the staker to withdraw their bond partially", async function () {
      const withdrawAmount = hre.ethers.parseEther("0.4");
      const initialBalance = await hre.ethers.provider.getBalance(node1.address);

      const tx = await computeBond.connect(node1).withdraw(NODE_ID, withdrawAmount);
      const receipt = await tx.wait();
      const gasUsed = receipt.gasUsed * receipt.gasPrice;

      const bond = await computeBond.bonds(NODE_ID);
      expect(bond.amount).to.equal(STAKE_AMOUNT - withdrawAmount);
      expect(bond.isActive).to.be.true;

      const finalBalance = await hre.ethers.provider.getBalance(node1.address);
      expect(finalBalance).to.equal(initialBalance + withdrawAmount - gasUsed);
    });

    it("Should allow the staker to withdraw fully and deactivate bond", async function () {
      await expect(computeBond.connect(node1).withdraw(NODE_ID, STAKE_AMOUNT))
        .to.emit(computeBond, "BondWithdrawn")
        .withArgs(NODE_ID, node1.address, STAKE_AMOUNT);

      const bond = await computeBond.bonds(NODE_ID);
      expect(bond.amount).to.equal(0n);
      expect(bond.isActive).to.be.false;
    });

    it("Should revert if non-staker tries to withdraw", async function () {
      await expect(
        computeBond.connect(node2).withdraw(NODE_ID, hre.ethers.parseEther("0.1"))
      ).to.be.revertedWithCustomError(computeBond, "UnauthorizedStaker").withArgs(node2.address, node1.address);
    });

    it("Should revert if withdraw amount exceeds bond", async function () {
      await expect(
        computeBond.connect(node1).withdraw(NODE_ID, STAKE_AMOUNT + 1n)
      ).to.be.revertedWithCustomError(computeBond, "WithdrawExceedsBond");
    });
  });

  describe("Owner withdrawing slashed funds", function () {
    beforeEach(async function () {
      await computeBond.connect(node1).stake(NODE_ID, { value: STAKE_AMOUNT });
    });

    it("Should allow the owner to withdraw slashed funds", async function () {
      const slashAmount = hre.ethers.parseEther("0.5");
      await computeBond.connect(owner).slash(NODE_ID, slashAmount);

      const initialOwnerBalance = await hre.ethers.provider.getBalance(owner.address);

      const tx = await computeBond.connect(owner).withdrawSlashedFunds(slashAmount);
      const receipt = await tx.wait();
      const gasUsed = receipt.gasUsed * receipt.gasPrice;

      const finalOwnerBalance = await hre.ethers.provider.getBalance(owner.address);
      expect(finalOwnerBalance).to.equal(initialOwnerBalance + slashAmount - gasUsed);
      expect(await computeBond.totalSlashed()).to.equal(0n);
    });

    it("Should prevent owner from withdrawing more than slashed funds", async function () {
      const slashAmount = hre.ethers.parseEther("0.5");
      await computeBond.connect(owner).slash(NODE_ID, slashAmount);

      // Attempt to withdraw more than slashed (e.g., trying to dip into active stakes)
      const withdrawAmount = hre.ethers.parseEther("1.0");

      await expect(
        computeBond.connect(owner).withdrawSlashedFunds(withdrawAmount)
      ).to.be.revertedWithCustomError(computeBond, "InsufficientSlashedFunds");
    });
  });
});
