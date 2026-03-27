const { expect } = require("chai");
const hre = require("hardhat");
const { ethers } = hre;

describe("HorizonForecast", function () {
  let poerVerifier, channel, horizon, axm;
  let owner, agentA, agentB;

  beforeEach(async function () {
    [owner, agentA, agentB] = await ethers.getSigners();

    const CognitiveFrictionVerifier = await ethers.getContractFactory("CognitiveFrictionVerifier");
    poerVerifier = await CognitiveFrictionVerifier.deploy();

    const AXM = await ethers.getContractFactory("AXM");
    axm = await AXM.deploy(owner.address, owner.address, owner.address);

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

    // Provide tokens to agentA and agentB for staking
    await axm.transfer(agentA.address, ethers.parseEther("100"));
    await axm.transfer(agentB.address, ethers.parseEther("100"));
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

  it("Should cache consequence tree", async function () {
    const proposalHash = ethers.keccak256(ethers.toUtf8Bytes("proposal_cache"));
    const consequenceRoot = ethers.keccak256(ethers.toUtf8Bytes("consequence_root"));

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

    await expect(horizon.cacheConsequenceTree(proposalHash, consequenceRoot, dummyProof))
      .to.emit(horizon, "ConsequenceTreeCached")
      .withArgs(proposalHash, consequenceRoot);

    expect(await horizon.consequenceCache(proposalHash)).to.equal(consequenceRoot);
  });

  it("Should trade consequence futures and claim rewards on PASS", async function () {
    const proposalHash = ethers.keccak256(ethers.toUtf8Bytes("proposal_futures_pass"));

    await axm.connect(agentA).approve(horizon.target, ethers.parseEther("10"));
    await axm.connect(agentB).approve(horizon.target, ethers.parseEther("5"));

    // agentA predicts PASS with 10 tokens
    await horizon.connect(agentA).tradeConsequenceFuture(proposalHash, true, ethers.parseEther("10"));
    // agentB predicts FAIL with 5 tokens
    await horizon.connect(agentB).tradeConsequenceFuture(proposalHash, false, ethers.parseEther("5"));

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

    // generateForecast sets status to PASSED
    await horizon.generateForecast(proposalHash, dummyProof, ethers.ZeroHash, ethers.ZeroHash, ethers.ZeroHash);

    // Should fail if challenge period hasn't passed
    await expect(horizon.connect(agentA).claimFutureRewards(proposalHash)).to.be.revertedWith("Challenge period active");

    // Fast-forward 7 days
    await ethers.provider.send("evm_increaseTime", [7 * 24 * 60 * 60]);
    await ethers.provider.send("evm_mine");

    // agentA claims rewards: gets 10 (own) + 10/10 * 5 (from fail pool) = 15
    await expect(horizon.connect(agentA).claimFutureRewards(proposalHash))
      .to.emit(horizon, "FutureRewardClaimed")
      .withArgs(proposalHash, agentA.address, ethers.parseEther("15"));

    // agentB claiming should fail
    await expect(horizon.connect(agentB).claimFutureRewards(proposalHash)).to.be.revertedWith("No winning stake");
  });

  it("Should trade consequence futures and claim rewards on FAIL", async function () {
    const proposalHash = ethers.keccak256(ethers.toUtf8Bytes("proposal_futures_fail"));

    await axm.connect(agentA).approve(horizon.target, ethers.parseEther("10"));
    await axm.connect(agentB).approve(horizon.target, ethers.parseEther("5"));

    // agentA predicts PASS with 10 tokens
    await horizon.connect(agentA).tradeConsequenceFuture(proposalHash, true, ethers.parseEther("10"));
    // agentB predicts FAIL with 5 tokens
    await horizon.connect(agentB).tradeConsequenceFuture(proposalHash, false, ethers.parseEther("5"));

    // challengeForecast sets status to FAILED
    await horizon.challengeForecast(proposalHash, "0x1234");

    // agentB claims rewards: gets 5 (own) + 5/5 * 10 (from pass pool) = 15
    await expect(horizon.connect(agentB).claimFutureRewards(proposalHash))
      .to.emit(horizon, "FutureRewardClaimed")
      .withArgs(proposalHash, agentB.address, ethers.parseEther("15"));

    // agentA claiming should fail
    await expect(horizon.connect(agentA).claimFutureRewards(proposalHash)).to.be.revertedWith("No winning stake");
  });
});
