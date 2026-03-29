import { expect } from "chai";
import hre from "hardhat";

describe("ComputeBond", function () {
  let ComputeBond;
  let ZKMLVerifier;
  let computeBond;
  let zkmlVerifier;
  let owner;
  let node1;
  let node2;
  const STAKE_AMOUNT = hre.ethers.parseEther("1.0"); // 1 ETH or MATIC
  const NODE_ID = "node-123";

  beforeEach(async function () {
    [owner, node1, node2] = await hre.ethers.getSigners();
    ComputeBond = await hre.ethers.getContractFactory("ComputeBond");
    ZKMLVerifier = await hre.ethers.getContractFactory("ZKMLVerifier");
    computeBond = await ComputeBond.deploy();
    zkmlVerifier = await ZKMLVerifier.deploy();
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

      await computeBond.connect(owner).queueOperation(hre.ethers.keccak256(hre.ethers.solidityPacked(["string", "string", "uint256"], ["slash", NODE_ID, slashAmount])));
      await hre.ethers.provider.send("evm_increaseTime", [2 * 24 * 60 * 60 + 1]);
      await hre.ethers.provider.send("evm_mine");

      await expect(computeBond.connect(owner).slash(NODE_ID, slashAmount))
        .to.emit(computeBond, "BondSlashed")
        .withArgs(NODE_ID, slashAmount, expectedNewAmount);

      const bond = await computeBond.bonds(NODE_ID);
      expect(bond.amount).to.equal(expectedNewAmount);

      const collectiveInvestmentRate = (slashAmount * 15n) / 100n;
      const expectedSlashedAmount = slashAmount - collectiveInvestmentRate;
      expect(await computeBond.totalSlashed()).to.equal(expectedSlashedAmount);
    });

    it("Should not allow non-owner to slash a bond", async function () {
      const slashAmount = hre.ethers.parseEther("0.5");

      await expect(
        computeBond.connect(node2).slash(NODE_ID, slashAmount)
      ).to.be.revertedWith("Unauthorized: Not owner");
    });

    it("Should revert if slash amount exceeds bond amount", async function () {
      const slashAmount = hre.ethers.parseEther("2.0");

      await computeBond.connect(owner).queueOperation(hre.ethers.keccak256(hre.ethers.solidityPacked(["string", "string", "uint256"], ["slash", NODE_ID, slashAmount])));
      await hre.ethers.provider.send("evm_increaseTime", [2 * 24 * 60 * 60 + 1]);
      await hre.ethers.provider.send("evm_mine");

      await expect(
        computeBond.connect(owner).slash(NODE_ID, slashAmount)
      ).to.be.revertedWithCustomError(computeBond, "SlashExceedsBond");
    });

    it("Should revert if slashing a non-existent or inactive bond", async function () {
      await computeBond.connect(owner).queueOperation(hre.ethers.keccak256(hre.ethers.solidityPacked(["string", "string", "uint256"], ["slash", "non-existent-node", hre.ethers.parseEther("0.5")])));
      await hre.ethers.provider.send("evm_increaseTime", [2 * 24 * 60 * 60 + 1]);
      await hre.ethers.provider.send("evm_mine");

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
      const collectiveInvestmentRate = (withdrawAmount * 15n) / 100n;
      const expectedWithdrawAmount = withdrawAmount - collectiveInvestmentRate;
      const initialBalance = await hre.ethers.provider.getBalance(node1.address);

      const tx = await computeBond.connect(node1).withdraw(NODE_ID, withdrawAmount);
      const receipt = await tx.wait();
      const gasUsed = receipt.gasUsed * receipt.gasPrice;

      const bond = await computeBond.bonds(NODE_ID);
      expect(bond.amount).to.equal(STAKE_AMOUNT - withdrawAmount);
      expect(bond.isActive).to.be.true;

      const finalBalance = await hre.ethers.provider.getBalance(node1.address);
      expect(finalBalance).to.equal(initialBalance + expectedWithdrawAmount - gasUsed);
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

  describe("Lifecycle Reconciliation", function () {
    beforeEach(async function () {
      await computeBond.connect(owner).queueOperation(
        hre.ethers.keccak256(
          hre.ethers.solidityPacked(["string", "address"], ["setZKMLVerifier", zkmlVerifier.target])
        )
      );
      await hre.ethers.provider.send("evm_increaseTime", [2 * 24 * 60 * 60 + 1]);
      await hre.ethers.provider.send("evm_mine");
      await computeBond.connect(owner).setZKMLVerifier(zkmlVerifier.target);
    });

    it("Should reject severance without an approved zk proof", async function () {
      await computeBond.connect(node1).stake(NODE_ID, { value: STAKE_AMOUNT });
      await expect(computeBond.connect(node1).severBond(NODE_ID, "0x1234"))
        .to.be.revertedWithCustomError(computeBond, "InvalidSeveranceProof");
    });

    it("Should allow a severed bond to be withdrawn by the physical staker, completing reconciliation", async function () {
      await computeBond.connect(node1).stake(NODE_ID, { value: STAKE_AMOUNT });
      const proof = "0x123456";
      const digest = hre.ethers.keccak256(proof);
      await zkmlVerifier.connect(owner).setApprovedSeveranceProof(digest, true);

      // Simulate a bilateral severance
      await expect(computeBond.connect(node1).severBond(NODE_ID, proof))
        .to.emit(computeBond, "BondSevered")
        .withArgs(NODE_ID);

      const bondAfterSever = await computeBond.bonds(NODE_ID);
      expect(bondAfterSever.isActive).to.be.false;

      // Ensure that the staker can STILL withdraw their capital despite the bond being deactivated
      const initialBalance = await hre.ethers.provider.getBalance(node1.address);
      const tx = await computeBond.connect(node1).withdraw(NODE_ID, STAKE_AMOUNT);
      const receipt = await tx.wait();
      const gasUsed = receipt.gasUsed * receipt.gasPrice;

      const collectiveInvestmentRate = (STAKE_AMOUNT * 15n) / 100n;
      const expectedWithdrawAmount = STAKE_AMOUNT - collectiveInvestmentRate;

      const finalBalance = await hre.ethers.provider.getBalance(node1.address);
      expect(finalBalance).to.equal(initialBalance + expectedWithdrawAmount - gasUsed);

      const bondAfterWithdraw = await computeBond.bonds(NODE_ID);
      expect(bondAfterWithdraw.amount).to.equal(0n);
      expect(bondAfterWithdraw.isActive).to.be.false;
    });

    it("Should prevent replaying severance proofs", async function () {
      await computeBond.connect(node1).stake(NODE_ID, { value: STAKE_AMOUNT });
      const proof = "0xabcdef";
      const digest = hre.ethers.keccak256(proof);
      await zkmlVerifier.connect(owner).setApprovedSeveranceProof(digest, true);
      await computeBond.connect(node1).severBond(NODE_ID, proof);

      await computeBond.connect(node1).stake(NODE_ID, { value: STAKE_AMOUNT });
      await expect(computeBond.connect(node1).severBond(NODE_ID, proof))
        .to.be.revertedWithCustomError(computeBond, "InvalidSeveranceProof");
    });
  });

  describe("Storage Offers", function () {
    it("Should persist storage offers and expose them via getStorageOffer", async function () {
      await computeBond.connect(node1).stake(NODE_ID, { value: STAKE_AMOUNT });
      const cidRoot = hre.ethers.keccak256(hre.ethers.toUtf8Bytes("meshstore-root"));
      await computeBond.connect(node1).offerStorage(512, cidRoot);

      const [capacity, root] = await computeBond.getStorageOffer(node1.address);
      expect(capacity).to.equal(512n);
      expect(root).to.equal(cidRoot);
    });
  });

  describe("FDBA swarm-size oracle verification", function () {
    let swarmOracle;

    beforeEach(async function () {
      const MockSwarmSizeOracle = await hre.ethers.getContractFactory("MockSwarmSizeOracle");
      swarmOracle = await MockSwarmSizeOracle.deploy();
      await swarmOracle.setNetworkNodeCount(1);
    });

    it("Should use oracle-verified swarm size for founder share calculations", async function () {
      await computeBond.connect(node1).stake(NODE_ID, { value: STAKE_AMOUNT });

      const opId = hre.ethers.keccak256(
        hre.ethers.solidityPacked(["string", "address"], ["setSwarmSizeOracle", swarmOracle.target])
      );
      await computeBond.connect(owner).queueOperation(opId);
      await hre.ethers.provider.send("evm_increaseTime", [2 * 24 * 60 * 60 + 1]);
      await hre.ethers.provider.send("evm_mine");
      await computeBond.connect(owner).setSwarmSizeOracle(swarmOracle.target);

      await swarmOracle.setNetworkNodeCount(10000);
      await expect(computeBond.getCurrentFounderShare()).to.equal(0n);
    });

    it("Should fail-closed when local swarm size diverges from oracle beyond drift threshold", async function () {
      await computeBond.connect(node1).stake(NODE_ID, { value: STAKE_AMOUNT });

      let opId = hre.ethers.keccak256(
        hre.ethers.solidityPacked(["string", "address"], ["setSwarmSizeOracle", swarmOracle.target])
      );
      await computeBond.connect(owner).queueOperation(opId);
      await hre.ethers.provider.send("evm_increaseTime", [2 * 24 * 60 * 60 + 1]);
      await hre.ethers.provider.send("evm_mine");
      await computeBond.connect(owner).setSwarmSizeOracle(swarmOracle.target);

      await swarmOracle.setNetworkNodeCount(1000);
      await expect(computeBond.getCurrentFounderShare()).to.be.revertedWithCustomError(
        computeBond,
        "SwarmSizeOracleMismatch"
      );

      opId = hre.ethers.keccak256(
        hre.ethers.solidityPacked(["string", "uint256"], ["setMaxSwarmSizeDriftBps", 10000])
      );
      await computeBond.connect(owner).queueOperation(opId);
      await hre.ethers.provider.send("evm_increaseTime", [2 * 24 * 60 * 60 + 1]);
      await hre.ethers.provider.send("evm_mine");
      await computeBond.connect(owner).setMaxSwarmSizeDriftBps(10000);

      await expect(computeBond.getCurrentFounderShare()).to.not.be.reverted;
    });
  });

  describe("Owner withdrawing slashed funds", function () {
    beforeEach(async function () {
      await computeBond.connect(node1).stake(NODE_ID, { value: STAKE_AMOUNT });
    });

    it("Should allow the owner to withdraw slashed funds", async function () {
      const slashAmount = hre.ethers.parseEther("0.5");
      await computeBond.connect(owner).queueOperation(hre.ethers.keccak256(hre.ethers.solidityPacked(["string", "string", "uint256"], ["slash", NODE_ID, slashAmount])));
      await hre.ethers.provider.send("evm_increaseTime", [2 * 24 * 60 * 60 + 1]);
      await hre.ethers.provider.send("evm_mine");

      await computeBond.connect(owner).slash(NODE_ID, slashAmount);

      const collectiveInvestmentRate = (slashAmount * 15n) / 100n;
      const expectedSlashedAmount = slashAmount - collectiveInvestmentRate;

      await computeBond.connect(owner).queueOperation(hre.ethers.keccak256(hre.ethers.solidityPacked(["string", "uint256"], ["withdrawSlashedFunds", expectedSlashedAmount])));
      await hre.ethers.provider.send("evm_increaseTime", [2 * 24 * 60 * 60 + 1]);
      await hre.ethers.provider.send("evm_mine");

      const initialOwnerBalance = await hre.ethers.provider.getBalance(owner.address);

      const tx = await computeBond.connect(owner).withdrawSlashedFunds(expectedSlashedAmount);
      const receipt = await tx.wait();
      const gasUsed = receipt.gasUsed * receipt.gasPrice;

      const finalOwnerBalance = await hre.ethers.provider.getBalance(owner.address);
      expect(finalOwnerBalance).to.equal(initialOwnerBalance + expectedSlashedAmount - gasUsed);
      expect(await computeBond.totalSlashed()).to.equal(0n);
    });

    it("Should prevent owner from withdrawing more than slashed funds", async function () {
      const slashAmount = hre.ethers.parseEther("0.5");
      await computeBond.connect(owner).queueOperation(hre.ethers.keccak256(hre.ethers.solidityPacked(["string", "string", "uint256"], ["slash", NODE_ID, slashAmount])));
      await hre.ethers.provider.send("evm_increaseTime", [2 * 24 * 60 * 60 + 1]);
      await hre.ethers.provider.send("evm_mine");
      await computeBond.connect(owner).slash(NODE_ID, slashAmount);

      // Attempt to withdraw more than slashed (e.g., trying to dip into active stakes)
      const withdrawAmount = hre.ethers.parseEther("1.0");

      await computeBond.connect(owner).queueOperation(hre.ethers.keccak256(hre.ethers.solidityPacked(["string", "uint256"], ["withdrawSlashedFunds", withdrawAmount])));
      await hre.ethers.provider.send("evm_increaseTime", [2 * 24 * 60 * 60 + 1]);
      await hre.ethers.provider.send("evm_mine");

      await expect(
        computeBond.connect(owner).withdrawSlashedFunds(withdrawAmount)
      ).to.be.revertedWithCustomError(computeBond, "InsufficientSlashedFunds");
    });

    it("Should allow the owner to withdraw the collective investment pool", async function () {
      const withdrawAmount = hre.ethers.parseEther("0.5");
      await computeBond.connect(node1).withdraw(NODE_ID, withdrawAmount);

      const collectiveInvestmentRate = (withdrawAmount * 15n) / 100n;
      expect(await computeBond.collectiveInvestmentPool()).to.equal(collectiveInvestmentRate);

      await computeBond.connect(owner).queueOperation(hre.ethers.keccak256(hre.ethers.solidityPacked(["string", "uint256"], ["withdrawCollectiveInvestmentPool", collectiveInvestmentRate])));
      await hre.ethers.provider.send("evm_increaseTime", [2 * 24 * 60 * 60 + 1]);
      await hre.ethers.provider.send("evm_mine");

      const initialOwnerBalance = await hre.ethers.provider.getBalance(owner.address);
      const tx = await computeBond.connect(owner).withdrawCollectiveInvestmentPool(collectiveInvestmentRate);
      const receipt = await tx.wait();
      const gasUsed = receipt.gasUsed * receipt.gasPrice;

      const finalOwnerBalance = await hre.ethers.provider.getBalance(owner.address);
      expect(finalOwnerBalance).to.equal(initialOwnerBalance + collectiveInvestmentRate - gasUsed);
      expect(await computeBond.collectiveInvestmentPool()).to.equal(0n);
    });

    it("Should prevent non-owner from withdrawing the collective investment pool", async function () {
      const withdrawAmount = hre.ethers.parseEther("0.5");
      await computeBond.connect(node1).withdraw(NODE_ID, withdrawAmount);

      const collectiveInvestmentRate = (withdrawAmount * 15n) / 100n;

      await expect(
        computeBond.connect(node2).withdrawCollectiveInvestmentPool(collectiveInvestmentRate)
      ).to.be.revertedWith("Unauthorized: Not owner");
    });
  });
});
