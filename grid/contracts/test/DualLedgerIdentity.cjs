const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("DualLedgerIdentity", function () {
  let dualLedgerIdentity;
  let owner, humanNode, agentNode, unregisteredNode;

  beforeEach(async function () {
    [owner, humanNode, agentNode, unregisteredNode] = await ethers.getSigners();
    const DualLedgerIdentity = await ethers.getContractFactory("DualLedgerIdentity");
    dualLedgerIdentity = await DualLedgerIdentity.deploy();
  });

  it("should deploy correctly and have the correct owner", async function () {
    expect(await dualLedgerIdentity.owner()).to.equal(owner.address);
  });

  it("should register a human node correctly", async function () {
    const tx = await dualLedgerIdentity.registerNode(humanNode.address, 1, ethers.ZeroAddress);
    const receipt = await tx.wait();
    const event = receipt.logs.find(e => e.fragment && e.fragment.name === 'NodeRegistered');
    expect(event).to.not.be.undefined;
    expect(event.args[0]).to.equal(humanNode.address);
    expect(event.args[1]).to.equal(1n);
    expect(event.args[2]).to.not.equal(ethers.ZeroAddress); // Auto-created wallet

    expect(await dualLedgerIdentity.isNodeRegistered(humanNode.address)).to.be.true;
    expect(await dualLedgerIdentity.getIdentityType(humanNode.address)).to.equal(1);
  });

  it("should register an agent node correctly", async function () {
    const tx = await dualLedgerIdentity.registerNode(agentNode.address, 2, ethers.ZeroAddress);
    const receipt = await tx.wait();
    const event = receipt.logs.find(e => e.fragment && e.fragment.name === 'NodeRegistered');
    expect(event).to.not.be.undefined;
    expect(event.args[0]).to.equal(agentNode.address);
    expect(event.args[1]).to.equal(2n);
    expect(event.args[2]).to.not.equal(ethers.ZeroAddress); // Auto-created wallet

    expect(await dualLedgerIdentity.isNodeRegistered(agentNode.address)).to.be.true;
    expect(await dualLedgerIdentity.getIdentityType(agentNode.address)).to.equal(2);
  });

  it("should revert if an invalid identity type is provided", async function () {
    await expect(dualLedgerIdentity.registerNode(humanNode.address, 0, ethers.ZeroAddress))
      .to.be.revertedWithCustomError(dualLedgerIdentity, "InvalidIdentityType");
  });

  it("should revert if node is already registered", async function () {
    await dualLedgerIdentity.registerNode(humanNode.address, 1, ethers.ZeroAddress);
    await expect(dualLedgerIdentity.registerNode(humanNode.address, 1, ethers.ZeroAddress))
      .to.be.revertedWithCustomError(dualLedgerIdentity, "NodeAlreadyRegistered")
      .withArgs(humanNode.address);
  });

  it("should deregister a node correctly", async function () {
    await dualLedgerIdentity.registerNode(humanNode.address, 1, ethers.ZeroAddress);
    await expect(dualLedgerIdentity.deregisterNode(humanNode.address))
      .to.emit(dualLedgerIdentity, "NodeDeregistered")
      .withArgs(humanNode.address);

    expect(await dualLedgerIdentity.isNodeRegistered(humanNode.address)).to.be.false;
  });

  it("should revert if trying to deregister an unregistered node", async function () {
    await expect(dualLedgerIdentity.deregisterNode(unregisteredNode.address))
      .to.be.revertedWithCustomError(dualLedgerIdentity, "NodeNotRegistered")
      .withArgs(unregisteredNode.address);
  });

  it("should revert getting identity type for unregistered node", async function () {
    await expect(dualLedgerIdentity.getIdentityType(unregisteredNode.address))
      .to.be.revertedWithCustomError(dualLedgerIdentity, "NodeNotRegistered")
      .withArgs(unregisteredNode.address);
  });
});
