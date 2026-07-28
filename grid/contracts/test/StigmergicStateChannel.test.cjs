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
  let fraudProofVerifier;
  let pulseAdapter;
  let channel;
  let soulboundReputation;

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
      pool.address,
      guardian.address
    );
    await channel.waitForDeployment();

    const FraudProofVerifier = await ethers.getContractFactory("FraudProofVerifier");
    fraudProofVerifier = await FraudProofVerifier.deploy(guardian.address);
    await fraudProofVerifier.waitForDeployment();
    await channel.connect(guardian).setFraudProofVerifier(await fraudProofVerifier.getAddress());

    const HorizonForecast = await ethers.getContractFactory("HorizonForecast");
    const horizon = await HorizonForecast.deploy(await verifier.getAddress(), await channel.getAddress());
    await horizon.waitForDeployment();

    await channel.connect(guardian).setHorizonForecast(await horizon.getAddress());

    const SoulboundReputation = await ethers.getContractFactory("SoulboundReputation");
    soulboundReputation = await SoulboundReputation.deploy();
    await soulboundReputation.waitForDeployment();
    await channel.connect(guardian).setSoulboundReputation(await soulboundReputation.getAddress());

    const stake = ethers.parseEther("500");
    await axm.transfer(agentA.address, stake);
    await axm.connect(agentA).approve(await channel.getAddress(), stake);

    await axm.transfer(agentB.address, stake);
    await axm.connect(agentB).approve(await channel.getAddress(), stake);
  });

  function encodeFraudProof(channelId, stateRoot, violationType = 1) {
    return ethers.AbiCoder.defaultAbiCoder().encode(
      ["tuple(bytes32 channelId, bytes32 claimedStateRoot, uint8 violationType, bytes evidence)"],
      [[channelId, stateRoot, violationType, ethers.toUtf8Bytes("fraud-evidence")]]
    );
  }

  it("requires the pulse adapter guardian sentinel to match constructor guardian", async function () {
    const StigmergicStateChannel = await ethers.getContractFactory("StigmergicStateChannel");

    await expect(
      StigmergicStateChannel.deploy(
        await axm.getAddress(),
        await verifier.getAddress(),
        await pulseAdapter.getAddress(),
        pool.address,
        owner.address
      )
    ).to.be.revertedWith("Guardian mismatch");
  });

  it("only allows participant/guardian settlement and blocks challenged channels", async function () {
    const stake = ethers.parseEther("100");
    const taskHash = ethers.keccak256(ethers.toUtf8Bytes("task-1"));

    // Set reputation to 600 (default window: 7 days)
    // Needs 7 categories of 600 to average 600
    for(let i=0; i<7; i++) {
        await soulboundReputation.updateReputation(agentA.address, i, "test", 600);
        await soulboundReputation.updateReputation(agentB.address, i, "test", 600);
    }

    const openTx = await channel.connect(agentA).openChannel(agentB.address, taskHash, stake);
    const openReceipt = await openTx.wait();
    const openEvent = openReceipt.logs.find((log) => log.fragment && log.fragment.name === "ChannelOpened");
    const channelId = openEvent.args.channelId;

    await channel.connect(agentB).joinChannel(channelId);

    // Use agentA to challenge
    const fraudProof = encodeFraudProof(channelId, ethers.ZeroHash);
    await expect(channel.connect(agentA).challengeSettlement(channelId, fraudProof))
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

    for(let i=0; i<7; i++) {
        await soulboundReputation.updateReputation(agentA.address, i, "test", 600);
        await soulboundReputation.updateReputation(agentB.address, i, "test", 600);
    }

    const openTx = await channel.connect(agentA).openChannel(agentB.address, taskHash, stake);
    const openReceipt = await openTx.wait();
    const openEvent = openReceipt.logs.find((log) => log.fragment && log.fragment.name === "ChannelOpened");
    const channelId = openEvent.args.channelId;

    await channel.connect(agentB).joinChannel(channelId);

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

    // AXM mints 1 billion tokens to the pool initially. 200 ether total stake, tax is 5% = 10 ether.
    expect(await axm.balanceOf(pool.address)).to.equal(ethers.parseEther("100000010"));
    // Since we minted 500 ether to agents and used 100 as stake, agent gets 400 + 95 = 495
    expect(await axm.balanceOf(agentA.address)).to.equal(ethers.parseEther("495"));
    expect(await axm.balanceOf(agentB.address)).to.equal(ethers.parseEther("495"));
  });

  it("settles and emits funding split once challenge window closes using optimisticSettleWithForecast", async function () {
    const stake = ethers.parseEther("100");
    const taskHash = ethers.keccak256(ethers.toUtf8Bytes("task-3"));

    for(let i=0; i<7; i++) {
        await soulboundReputation.updateReputation(agentA.address, i, "test", 600);
        await soulboundReputation.updateReputation(agentB.address, i, "test", 600);
    }

    const openTx = await channel.connect(agentA).openChannel(agentB.address, taskHash, stake);
    const openReceipt = await openTx.wait();
    const openEvent = openReceipt.logs.find((log) => log.fragment && log.fragment.name === "ChannelOpened");
    const channelId = openEvent.args.channelId;

    await channel.connect(agentB).joinChannel(channelId);

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
  it("reverts when an unauthorized user attempts to challenge settlement", async function () {
    const stake = ethers.parseEther("100");
    const taskHash = ethers.keccak256(ethers.toUtf8Bytes("task-unauthorized-challenge"));

    const openTx = await channel.connect(agentA).openChannel(agentB.address, taskHash, stake);
    const openReceipt = await openTx.wait();
    const openEvent = openReceipt.logs.find((log) => log.fragment && log.fragment.name === "ChannelOpened");
    const channelId = openEvent.args.channelId;

    await channel.connect(agentB).joinChannel(channelId);

    const fraudProof = encodeFraudProof(channelId, ethers.ZeroHash);
    await expect(channel.connect(owner).challengeSettlement(channelId, fraudProof))
      .to.be.revertedWith("Unauthorized challenger");
  });

  it("generates unique channel IDs over repeated task hashes due to nonce sequencing", async function () {
    const stake = ethers.parseEther("100");
    const taskHash = ethers.keccak256(ethers.toUtf8Bytes("task-repeat"));

    for(let i=0; i<7; i++) {
        await soulboundReputation.updateReputation(agentA.address, i, "test", 600);
        await soulboundReputation.updateReputation(agentB.address, i, "test", 600);
    }

    // Need more tokens for agentA to open a second channel
    await axm.transfer(agentA.address, stake);
    await axm.connect(agentA).approve(await channel.getAddress(), stake * 2n); // previous was 100, give it 200

    const openTx1 = await channel.connect(agentA).openChannel(agentB.address, taskHash, stake);
    const openReceipt1 = await openTx1.wait();
    const openEvent1 = openReceipt1.logs.find((log) => log.fragment && log.fragment.name === "ChannelOpened");
    const channelId1 = openEvent1.args.channelId;

    const openTx2 = await channel.connect(agentA).openChannel(agentB.address, taskHash, stake);
    const openReceipt2 = await openTx2.wait();
    const openEvent2 = openReceipt2.logs.find((log) => log.fragment && log.fragment.name === "ChannelOpened");
    const channelId2 = openEvent2.args.channelId;

    expect(channelId1).to.not.equal(channelId2);
  });

  it("applies shorter challenge window for high reputation actors", async function () {
    const stake = ethers.parseEther("100");
    const taskHash = ethers.keccak256(ethers.toUtf8Bytes("task-high-rep"));

    // Set reputation to 900 (high rep window: 3 days)
    for(let i=0; i<7; i++) {
        await soulboundReputation.updateReputation(agentA.address, i, "test", 900);
        await soulboundReputation.updateReputation(agentB.address, i, "test", 900);
    }

    const openTx = await channel.connect(agentA).openChannel(agentB.address, taskHash, stake);
    const openReceipt = await openTx.wait();
    const openEvent = openReceipt.logs.find((log) => log.fragment && log.fragment.name === "ChannelOpened");

    // Check if challengeEnds is 3 days from openedAt
    const block = await ethers.provider.getBlock(openReceipt.blockNumber);
    const expectedChallengeEnds = block.timestamp + 3 * 24 * 60 * 60;

    expect(openEvent.args.challengeEnds).to.equal(expectedChallengeEnds);

    const channelId = openEvent.args.channelId;
    const channelData = await channel.channels(channelId);
    expect(channelData.lockedStake).to.equal(stake * 2n);
  });

  it("applies longer challenge window and higher bond for low reputation actors", async function () {
    const stake = ethers.parseEther("100");
    const taskHash = ethers.keccak256(ethers.toUtf8Bytes("task-low-rep"));

    // Set reputation to 200 (low rep window: 14 days, stake multiplier: 2)
    for(let i=0; i<7; i++) {
        await soulboundReputation.updateReputation(agentA.address, i, "test", 200);
        await soulboundReputation.updateReputation(agentB.address, i, "test", 200);
    }

    // Agent A needs 200 stake approved
    await axm.connect(agentA).approve(await channel.getAddress(), ethers.parseEther("200"));

    const openTx = await channel.connect(agentA).openChannel(agentB.address, taskHash, stake);
    const openReceipt = await openTx.wait();
    const openEvent = openReceipt.logs.find((log) => log.fragment && log.fragment.name === "ChannelOpened");

    // Check if challengeEnds is 14 days from openedAt
    const block = await ethers.provider.getBlock(openReceipt.blockNumber);
    const expectedChallengeEnds = block.timestamp + 14 * 24 * 60 * 60;

    expect(openEvent.args.challengeEnds).to.equal(expectedChallengeEnds);

    const channelId = openEvent.args.channelId;
    const channelData = await channel.channels(channelId);
    expect(channelData.lockedStake).to.equal(stake * 4n); // stake * 2 from A, stake * 2 from B -> stake * 4 total
  });

  it("allows early settlement once both channel participants consent to fast finalization", async function () {
    const stake = ethers.parseEther("50");
    const taskHash = ethers.keccak256(ethers.toUtf8Bytes("task-fast-finalization"));

    const openTx = await channel.connect(agentA).openChannel(agentB.address, taskHash, stake);
    const openReceipt = await openTx.wait();
    const openEvent = openReceipt.logs.find((log) => log.fragment && log.fragment.name === "ChannelOpened");
    const channelId = openEvent.args.channelId;

    await channel.connect(agentB).joinChannel(channelId);
    await channel.connect(agentA).consentFastFinalization(channelId);
    await channel.connect(agentB).consentFastFinalization(channelId);

    const artifact = {
      attentionScopeHash: ethers.keccak256(ethers.toUtf8Bytes("attention-fast")),
      dependencyGraphRoot: ethers.keccak256(ethers.toUtf8Bytes("deps-fast")),
      capabilityRoot: ethers.keccak256(ethers.toUtf8Bytes("cap-fast")),
      modelRoot: ethers.keccak256(ethers.toUtf8Bytes("model-fast")),
      executionTraceHash: ethers.keccak256(ethers.toUtf8Bytes("trace-fast")),
    };

    const coder = ethers.AbiCoder.defaultAbiCoder();
    const zkProof = coder.encode(
      ["uint256[2]", "uint256[2][2]", "uint256[2]"],
      [
        [21, 22],
        [[23, 24], [25, 26]],
        [27, 28]
      ]
    );

    await expect(
      channel.connect(agentA).optimisticSettle(
        channelId,
        ethers.keccak256(ethers.toUtf8Bytes("before-fast")),
        ethers.keccak256(ethers.toUtf8Bytes("after-fast")),
        artifact,
        zkProof
      )
    ).to.emit(channel, "ChannelFundingReleased");
  });

  it("settles multiple channels in a single batch call", async function () {
    const stake = ethers.parseEther("20");
    const coder = ethers.AbiCoder.defaultAbiCoder();
    const zkProof = coder.encode(
      ["uint256[2]", "uint256[2][2]", "uint256[2]"],
      [
        [31, 32],
        [[33, 34], [35, 36]],
        [37, 38]
      ]
    );

    const channelIds = [];
    const stateRootBefores = [];
    const stateRootAfters = [];
    const artifacts = [];
    const proofs = [];

    for (let i = 0; i < 2; i++) {
      const taskHash = ethers.keccak256(ethers.toUtf8Bytes(`task-batch-${i}`));
      const openTx = await channel.connect(agentA).openChannel(agentB.address, taskHash, stake);
      const openReceipt = await openTx.wait();
      const openEvent = openReceipt.logs.find((log) => log.fragment && log.fragment.name === "ChannelOpened");
      const channelId = openEvent.args.channelId;
      channelIds.push(channelId);
      await channel.connect(agentB).joinChannel(channelId);
      await channel.connect(agentA).consentFastFinalization(channelId);
      await channel.connect(agentB).consentFastFinalization(channelId);

      stateRootBefores.push(ethers.keccak256(ethers.toUtf8Bytes(`before-batch-${i}`)));
      stateRootAfters.push(ethers.keccak256(ethers.toUtf8Bytes(`after-batch-${i}`)));
      artifacts.push({
        attentionScopeHash: ethers.keccak256(ethers.toUtf8Bytes(`attention-batch-${i}`)),
        dependencyGraphRoot: ethers.keccak256(ethers.toUtf8Bytes(`deps-batch-${i}`)),
        capabilityRoot: ethers.keccak256(ethers.toUtf8Bytes(`cap-batch-${i}`)),
        modelRoot: ethers.keccak256(ethers.toUtf8Bytes(`model-batch-${i}`)),
        executionTraceHash: ethers.keccak256(ethers.toUtf8Bytes(`trace-batch-${i}`)),
      });
      proofs.push(zkProof);
    }

    await expect(
      channel.connect(agentA).batchOptimisticSettle(channelIds, stateRootBefores, stateRootAfters, artifacts, proofs)
    ).to.emit(channel, "BatchSettled");
  });
});
