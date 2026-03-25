const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("StigmergicStateChannel v4 interface audit", function () {
  let owner;
  let agentA;
  let agentB;
  let guardian;
  let pool;
  let axm;
  let verifier;
  let pulseAdapter;
  let channel;

  beforeEach(async function () {
    [owner, agentA, agentB, guardian, pool] = await ethers.getSigners();

    const AXM = await ethers.getContractFactory("AXM");
    axm = await AXM.deploy(owner.address, pool.address, guardian.address);
    await axm.waitForDeployment();

    const CognitiveFrictionVerifier = await ethers.getContractFactory("CognitiveFrictionVerifier");
    verifier = await CognitiveFrictionVerifier.deploy();
    await verifier.waitForDeployment();

    const MockZKMLVerifier = await ethers.getContractFactory("MockZKMLVerifier");
    const zkVerifier = await MockZKMLVerifier.deploy();
    await zkVerifier.waitForDeployment();
    await verifier.setZkVerifier(await zkVerifier.getAddress());

    const PulseAdapter = await ethers.getContractFactory("PulseAdapter");
    pulseAdapter = await PulseAdapter.connect(guardian).deploy(await axm.getAddress());
    await pulseAdapter.waitForDeployment();

    const StigmergicStateChannel = await ethers.getContractFactory("StigmergicStateChannel");
    channel = await StigmergicStateChannel.deploy(
      await axm.getAddress(),
      await verifier.getAddress(),
      await pulseAdapter.getAddress(),
      owner.address,
      pool.address,
      guardian.address
    );
    await channel.waitForDeployment();

    const HorizonForecast = await ethers.getContractFactory("HorizonForecast");
    const horizon = await HorizonForecast.deploy(await verifier.getAddress(), await channel.getAddress());
    await horizon.waitForDeployment();

    await channel.connect(guardian).setHorizonForecast(await horizon.getAddress());

    const stake = ethers.parseEther("100");
    await axm.transfer(agentA.address, stake);
    await axm.connect(agentA).approve(await channel.getAddress(), stake);
  });

  it("requires the pulse adapter guardian sentinel to match constructor guardian", async function () {
    const StigmergicStateChannel = await ethers.getContractFactory("StigmergicStateChannel");

    await expect(
      StigmergicStateChannel.deploy(
        await axm.getAddress(),
        await verifier.getAddress(),
        await pulseAdapter.getAddress(),
        owner.address,
        pool.address,
        owner.address
      )
    ).to.be.revertedWith("Guardian mismatch");
  });

  it("only allows participant/guardian settlement and blocks challenged channels", async function () {
    const stake = ethers.parseEther("100");
    const taskHash = ethers.keccak256(ethers.toUtf8Bytes("task-1"));

    const openTx = await channel.connect(agentA).openChannel(agentB.address, taskHash, stake);
    const openReceipt = await openTx.wait();
    const openEvent = openReceipt.logs.find((log) => log.fragment && log.fragment.name === "ChannelOpened");
    const channelId = openEvent.args.channelId;

    await expect(channel.connect(owner).challengeSettlement(channelId, "0x1234"))
      .to.emit(channel, "SettlementChallenged");

    await ethers.provider.send("evm_increaseTime", [7 * 24 * 60 * 60 + 1]);
    await ethers.provider.send("evm_mine", []);

    const artifact = {
      attentionScopeHash: ethers.keccak256(ethers.toUtf8Bytes("attention")),
      dependencyGraphRoot: ethers.keccak256(ethers.toUtf8Bytes("deps")),
      capabilityRoot: ethers.keccak256(ethers.toUtf8Bytes("cap")),
      modelRoot: ethers.keccak256(ethers.toUtf8Bytes("model")),
      executionTraceHash: ethers.keccak256(ethers.toUtf8Bytes("trace")),
    };

    const coder = ethers.AbiCoder.defaultAbiCoder();
    const zkProof = coder.encode(
      ["uint256[2]", "uint256[2][2]", "uint256[2]"],
      [
        [1, 2],
        [[3, 4], [5, 6]],
        [7, 8]
      ]
    );

    await expect(
      channel.connect(owner).optimisticSettle(channelId, ethers.ZeroHash, ethers.keccak256(ethers.toUtf8Bytes("state")), artifact, zkProof)
    ).to.be.revertedWith("Settlement challenged");
  });

  it("settles and emits funding split once challenge window closes", async function () {
    const stake = ethers.parseEther("100");
    const taskHash = ethers.keccak256(ethers.toUtf8Bytes("task-2"));

    const openTx = await channel.connect(agentA).openChannel(agentB.address, taskHash, stake);
    const openReceipt = await openTx.wait();
    const openEvent = openReceipt.logs.find((log) => log.fragment && log.fragment.name === "ChannelOpened");
    const channelId = openEvent.args.channelId;

    await ethers.provider.send("evm_increaseTime", [7 * 24 * 60 * 60 + 1]);
    await ethers.provider.send("evm_mine", []);

    const artifact = {
      attentionScopeHash: ethers.keccak256(ethers.toUtf8Bytes("attention-2")),
      dependencyGraphRoot: ethers.keccak256(ethers.toUtf8Bytes("deps-2")),
      capabilityRoot: ethers.keccak256(ethers.toUtf8Bytes("cap-2")),
      modelRoot: ethers.keccak256(ethers.toUtf8Bytes("model-2")),
      executionTraceHash: ethers.keccak256(ethers.toUtf8Bytes("trace-2")),
    };

    const coder = ethers.AbiCoder.defaultAbiCoder();
    const zkProof = coder.encode(
      ["uint256[2]", "uint256[2][2]", "uint256[2]"],
      [
        [11, 12],
        [[13, 14], [15, 16]],
        [17, 18]
      ]
    );

    await expect(
      channel.connect(agentB).optimisticSettle(
        channelId,
        ethers.keccak256(ethers.toUtf8Bytes("before")),
        ethers.keccak256(ethers.toUtf8Bytes("after")),
        artifact,
        zkProof
      )
    ).to.emit(channel, "ChannelFundingReleased");

    // AXM mints 1 billion tokens to the pool initially. Add 10 ether (tax) to that.
    expect(await axm.balanceOf(pool.address)).to.equal(ethers.parseEther("100000005"));
    expect(await axm.balanceOf(agentA.address)).to.equal(ethers.parseEther("47.5"));
    expect(await axm.balanceOf(agentB.address)).to.equal(ethers.parseEther("47.5"));
  });

  it("settles and emits funding split once challenge window closes using optimisticSettleWithForecast", async function () {
    const stake = ethers.parseEther("100");
    const taskHash = ethers.keccak256(ethers.toUtf8Bytes("task-3"));

    await axm.transfer(agentA.address, stake);
    await axm.connect(agentA).approve(await channel.getAddress(), stake);

    const openTx = await channel.connect(agentA).openChannel(agentB.address, taskHash, stake);
    const openReceipt = await openTx.wait();
    const openEvent = openReceipt.logs.find((log) => log.fragment && log.fragment.name === "ChannelOpened");
    const channelId = openEvent.args.channelId;

    await ethers.provider.send("evm_increaseTime", [7 * 24 * 60 * 60 + 1]);
    await ethers.provider.send("evm_mine", []);

    const artifact = {
      attentionScopeHash: ethers.keccak256(ethers.toUtf8Bytes("attention-3")),
      dependencyGraphRoot: ethers.keccak256(ethers.toUtf8Bytes("deps-3")),
      capabilityRoot: ethers.keccak256(ethers.toUtf8Bytes("cap-3")),
      modelRoot: ethers.keccak256(ethers.toUtf8Bytes("model-3")),
      executionTraceHash: ethers.keccak256(ethers.toUtf8Bytes("trace-3")),
    };

    const coder = ethers.AbiCoder.defaultAbiCoder();
    const zkProof = coder.encode(
      ["uint256[2]", "uint256[2][2]", "uint256[2]"],
      [
        [11, 12],
        [[13, 14], [15, 16]],
        [17, 18]
      ]
    );

    await expect(
      channel.connect(agentB).optimisticSettleWithForecast(
        channelId,
        ethers.keccak256(ethers.toUtf8Bytes("before3")),
        ethers.keccak256(ethers.toUtf8Bytes("after3")),
        artifact,
        zkProof,
        zkProof,
        ethers.ZeroHash,
        ethers.ZeroHash,
        ethers.ZeroHash
      )
    ).to.emit(channel, "ChannelFundingReleased");
  });
});
