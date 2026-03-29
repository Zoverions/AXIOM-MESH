const { expect } = require("chai");
const hre = require("hardhat");
const { ethers } = hre;

describe("SymbiosisEngine", function () {
  let poerVerifier, channel, horizon, symbiosis;
  let owner, agentA, agentB;

  beforeEach(async function () {
    [owner, agentA, agentB] = await ethers.getSigners();

    const CognitiveFrictionVerifier = await ethers.getContractFactory("CognitiveFrictionVerifier");
    poerVerifier = await CognitiveFrictionVerifier.deploy();

    const AXM = await ethers.getContractFactory("AXM");
    const axm = await AXM.deploy(owner.address, owner.address, owner.address);

    const PulseAdapter = await ethers.getContractFactory("PulseAdapter");
    const pulse = await PulseAdapter.deploy(owner.address);

    const StigmergicStateChannel = await ethers.getContractFactory("StigmergicStateChannel");
    channel = await StigmergicStateChannel.deploy(
      axm.target,
      poerVerifier.target,
      pulse.target,
      owner.address,
      owner.address
    );

    const HorizonForecast = await ethers.getContractFactory("HorizonForecast");
    horizon = await HorizonForecast.deploy(poerVerifier.target, channel.target);

    const SymbiosisEngine = await ethers.getContractFactory("SymbiosisEngine");
    symbiosis = await SymbiosisEngine.deploy(poerVerifier.target, horizon.target, channel.target);
  });

  it("Should propose symbiosis bundle", async function () {
    const action1 = ethers.keccak256(ethers.toUtf8Bytes("action1"));
    const action2 = ethers.keccak256(ethers.toUtf8Bytes("action2"));

    const MockZKMLVerifier = await ethers.getContractFactory("MockZKMLVerifier");
    const zk = await MockZKMLVerifier.deploy();
    await poerVerifier.setZkVerifier(zk.target);

    const a = [0, 0];
    const b = [[0, 0], [0, 0]];
    const c = [0, 0];
    const dummyProof = ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint256[2]", "uint256[2][2]", "uint256[2]"],
        [a, b, c]
    );

    const tx = await symbiosis.proposeSymbiosisBundle(
        [action1, action2],
        dummyProof,
        ethers.ZeroHash,
        ethers.ZeroHash
    );

    const receipt = await tx.wait();
    const event = receipt.logs.find(e => e.fragment && e.fragment.name === 'SymbiosisBundleProposed');
    expect(event).to.not.be.undefined;

    const bundleHash = event.args[0];
    expect(bundleHash).to.not.be.null;
  });

  it("Should execute symbiosis bundle", async function () {
    const action1 = ethers.keccak256(ethers.toUtf8Bytes("action1"));
    const MockZKMLVerifier = await ethers.getContractFactory("MockZKMLVerifier");
    const zk = await MockZKMLVerifier.deploy();
    await poerVerifier.setZkVerifier(zk.target);

    const a = [0, 0];
    const b = [[0, 0], [0, 0]];
    const c = [0, 0];
    const dummyProof = ethers.AbiCoder.defaultAbiCoder().encode(
      ["uint256[2]", "uint256[2][2]", "uint256[2]"],
      [a, b, c]
    );
    const tx = await symbiosis.proposeSymbiosisBundle([action1], dummyProof, ethers.ZeroHash, ethers.ZeroHash);
    const receipt = await tx.wait();
    const proposedEvent = receipt.logs.find(e => e.fragment && e.fragment.name === "SymbiosisBundleProposed");
    const bundleHash = proposedEvent.args[0];

    await expect(symbiosis.executeSymbiosisBundle(bundleHash))
      .to.be.revertedWith("Only channel");
  });

  it("Should allow owner to set monetization and emit monetization event on proposal", async function () {
    await expect(symbiosis.connect(agentA).setMonetization(50, agentA.address))
      .to.be.reverted;

    await expect(symbiosis.setMonetization(50, owner.address))
      .to.emit(symbiosis, "MonetizationUpdated")
      .withArgs(50, owner.address);

    const action1 = ethers.keccak256(ethers.toUtf8Bytes("action1"));
    const MockZKMLVerifier = await ethers.getContractFactory("MockZKMLVerifier");
    const zk = await MockZKMLVerifier.deploy();
    await poerVerifier.setZkVerifier(zk.target);

    const a = [0, 0];
    const b = [[0, 0], [0, 0]];
    const c = [0, 0];
    const dummyProof = ethers.AbiCoder.defaultAbiCoder().encode(
      ["uint256[2]", "uint256[2][2]", "uint256[2]"],
      [a, b, c]
    );

    await expect(symbiosis.proposeSymbiosisBundle([action1], dummyProof, ethers.ZeroHash, ethers.ZeroHash))
      .to.emit(symbiosis, "BundleMonetized");
  });

  it("Should reject invalid monetization configuration", async function () {
    await expect(symbiosis.setMonetization(10001, owner.address))
      .to.be.revertedWith("Fee too high");

    await expect(symbiosis.setMonetization(100, ethers.ZeroAddress))
      .to.be.revertedWith("Invalid collector");
  });

  it("Should enforce owner-only memory lattice wiring", async function () {
    const fakeHash = ethers.keccak256(ethers.toUtf8Bytes("missing-bundle"));
    await expect(symbiosis.connect(owner).executeSymbiosisBundle(fakeHash))
      .to.be.revertedWith("Only channel");

    await expect(symbiosis.connect(agentA).setMemoryLattice(ethers.ZeroAddress))
      .to.be.reverted;

    await expect(symbiosis.connect(owner).setMemoryLattice(ethers.ZeroAddress))
      .to.not.be.reverted;
  });
});
