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
    const bundleHash = ethers.keccak256(ethers.toUtf8Bytes("bundle"));
    await expect(symbiosis.executeSymbiosisBundle(bundleHash))
      .to.emit(symbiosis, "SymbiosisBundleExecuted")
      .withArgs(bundleHash);
  });
});
