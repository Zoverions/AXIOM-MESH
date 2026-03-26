const { expect } = require("chai");
const hre = require("hardhat");
const { ethers } = hre;

describe("HorizonForecast", function () {
  let poerVerifier, channel, horizon;
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
  });

  it("Should generate forecast and pass friction", async function () {
    const proposalHash = ethers.keccak256(ethers.toUtf8Bytes("proposal"));

    // We mock zkVerifier passing
    const MockZKMLVerifier = await ethers.getContractFactory("MockZKMLVerifier");
    const zk = await MockZKMLVerifier.deploy();
    await poerVerifier.setZkVerifier(zk.target);

    // Provide dummy proof
    const a = [0, 0];
    const b = [[0, 0], [0, 0]];
    const c = [0, 0];
    const dummyProof = ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint256[2]", "uint256[2][2]", "uint256[2]"],
        [a, b, c]
    );

    await expect(horizon.generateForecast(
        proposalHash,
        dummyProof,
        ethers.ZeroHash,
        ethers.ZeroHash,
        ethers.ZeroHash
    )).to.emit(horizon, "HorizonForecastGenerated").withArgs(proposalHash, 3, true);
  });

  it("Should challenge forecast", async function () {
    const proposalHash = ethers.keccak256(ethers.toUtf8Bytes("proposal"));

    await expect(horizon.challengeForecast(proposalHash, "0x1234"))
      .to.emit(horizon, "HorizonChallenged")
      .withArgs(proposalHash, owner.address, "Higher-order consequence violation");
  });
});
