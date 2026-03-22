const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("WeightOracle", function () {
  let weightOracle;
  let dualLedgerIdentity;
  let owner, humanNode, agentNode, unregisteredNode;

  beforeEach(async function () {
    [owner, humanNode, agentNode, unregisteredNode] = await ethers.getSigners();

    const DualLedgerIdentity = await ethers.getContractFactory("DualLedgerIdentity");
    dualLedgerIdentity = await DualLedgerIdentity.deploy();

    await dualLedgerIdentity.registerNode(humanNode.address, 1, ethers.ZeroAddress);
    await dualLedgerIdentity.registerNode(agentNode.address, 2, ethers.ZeroAddress);

    const WeightOracle = await ethers.getContractFactory("WeightOracle");
    weightOracle = await WeightOracle.deploy(dualLedgerIdentity.target);
  });

  it("should deploy correctly and link to the identity contract", async function () {
    expect(await weightOracle.owner()).to.equal(owner.address);
    expect(await weightOracle.identityContract()).to.equal(dualLedgerIdentity.target);
  });

  it("should allow the owner to update the weight of a registered node", async function () {
    await weightOracle.queueOperation(ethers.keccak256(ethers.solidityPacked(["string", "address", "uint256"], ["updateWeight", humanNode.address, 100])));
    await ethers.provider.send("evm_increaseTime", [2 * 24 * 60 * 60 + 1]);
    await ethers.provider.send("evm_mine");

    await expect(weightOracle.updateWeight(humanNode.address, 100))
      .to.emit(weightOracle, "WeightUpdated")
      .withArgs(humanNode.address, 0, 100);

    expect(await weightOracle.getWeight(humanNode.address)).to.equal(100);
  });

  it("should revert when updating the weight of an unregistered node", async function () {
    await weightOracle.queueOperation(ethers.keccak256(ethers.solidityPacked(["string", "address", "uint256"], ["updateWeight", unregisteredNode.address, 100])));
    await ethers.provider.send("evm_increaseTime", [2 * 24 * 60 * 60 + 1]);
    await ethers.provider.send("evm_mine");

    await expect(weightOracle.updateWeight(unregisteredNode.address, 100))
      .to.be.revertedWithCustomError(weightOracle, "NodeNotRegistered")
      .withArgs(unregisteredNode.address);
  });

  it("should allow the owner to batch update weights", async function () {
    await weightOracle.queueOperation(ethers.keccak256(ethers.solidityPacked(["string", "address[]", "uint256[]"], ["batchUpdateWeights", [humanNode.address, agentNode.address], [150, 250]])));
    await ethers.provider.send("evm_increaseTime", [2 * 24 * 60 * 60 + 1]);
    await ethers.provider.send("evm_mine");

    await expect(weightOracle.batchUpdateWeights(
      [humanNode.address, agentNode.address],
      [150, 250]
    ))
      .to.emit(weightOracle, "WeightUpdated")
      .withArgs(humanNode.address, 0, 150)
      .and.to.emit(weightOracle, "WeightUpdated")
      .withArgs(agentNode.address, 0, 250);

    expect(await weightOracle.getWeight(humanNode.address)).to.equal(150);
    expect(await weightOracle.getWeight(agentNode.address)).to.equal(250);
  });

  it("should revert if arrays length mismatch in batch update", async function () {
    await weightOracle.queueOperation(ethers.keccak256(ethers.solidityPacked(["string", "address[]", "uint256[]"], ["batchUpdateWeights", [humanNode.address, agentNode.address], [150]])));
    await ethers.provider.send("evm_increaseTime", [2 * 24 * 60 * 60 + 1]);
    await ethers.provider.send("evm_mine");

    await expect(weightOracle.batchUpdateWeights(
      [humanNode.address, agentNode.address],
      [150]
    )).to.be.revertedWith("Arrays length mismatch");
  });

  it("should revert when querying weight of unregistered node", async function () {
    await expect(weightOracle.getWeight(unregisteredNode.address))
      .to.be.revertedWithCustomError(weightOracle, "NodeNotRegistered")
      .withArgs(unregisteredNode.address);
  });

  it("should fail to add PoER bonus if not ComputeBond", async function () {
    await weightOracle.queueOperation(ethers.keccak256(ethers.solidityPacked(["string", "address"], ["setComputeBondContract", owner.address])));
    await ethers.provider.send("evm_increaseTime", [2 * 24 * 60 * 60 + 1]);
    await ethers.provider.send("evm_mine");
    await weightOracle.setComputeBondContract(owner.address);

    await expect(weightOracle.connect(agentNode).addPoERBonus(humanNode.address, 100))
      .to.be.revertedWith("Unauthorized: Only ComputeBond can add PoER bonus");
  });

  it("should fail to slash PoER bonus if not ComputeBond", async function () {
    await weightOracle.queueOperation(ethers.keccak256(ethers.solidityPacked(["string", "address"], ["setComputeBondContract", owner.address])));
    await ethers.provider.send("evm_increaseTime", [2 * 24 * 60 * 60 + 1]);
    await ethers.provider.send("evm_mine");
    await weightOracle.setComputeBondContract(owner.address);

    await expect(weightOracle.connect(agentNode).slashPoERBonus(humanNode.address))
      .to.be.revertedWith("Unauthorized: Only ComputeBond can slash PoER bonus");
  });

  it("should calculate merit weight correctly with verified skill points", async function () {
    await weightOracle.queueOperation(ethers.keccak256(ethers.solidityPacked(["string", "address", "uint256"], ["updateWeight", humanNode.address, 100])));
    await ethers.provider.send("evm_increaseTime", [2 * 24 * 60 * 60 + 1]);
    await ethers.provider.send("evm_mine");
    await weightOracle.updateWeight(humanNode.address, 100);

    await weightOracle.queueOperation(ethers.keccak256(ethers.solidityPacked(["string", "address"], ["setComputeBondContract", owner.address])));
    await ethers.provider.send("evm_increaseTime", [2 * 24 * 60 * 60 + 1]);
    await ethers.provider.send("evm_mine");
    await weightOracle.setComputeBondContract(owner.address);

    await weightOracle.addPoERBonus(humanNode.address, 50);

    await weightOracle.queueOperation(ethers.keccak256(ethers.solidityPacked(["string", "address", "uint256"], ["addVerifiedSkillPoints", humanNode.address, 8])));
    await ethers.provider.send("evm_increaseTime", [2 * 24 * 60 * 60 + 1]);
    await ethers.provider.send("evm_mine");
    await weightOracle.addVerifiedSkillPoints(humanNode.address, 8);

    // base = 100 + 50 = 150
    // pts = 8
    // logPts = 3 (since 8 > 1: 4, 1; 4 > 1: 2, 2; 2 > 1: 1, 3)
    // base + logPts = 153
    expect(await weightOracle.getWeight(humanNode.address)).to.equal(153);
  });
});
