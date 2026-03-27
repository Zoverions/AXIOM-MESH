const { expect } = require("chai");
const hre = require("hardhat");
const { ethers } = hre;

describe("TruthDerivative & CrossChainTruthOracle", function () {
  let owner, agentA, agentB, oracleSource;
  let axm, truthDerivative, truthOracle, zkMLVerifier, founderCommitment;
  let longTokenAddr, shortTokenAddr;
  const claimId = ethers.keccak256(ethers.toUtf8Bytes("truth-claim-1"));

  beforeEach(async function () {
    [owner, agentA, agentB, oracleSource] = await ethers.getSigners();

    // 1. Deploy FounderCommitment
    const FounderCommitment = await ethers.getContractFactory("FounderCommitment");
    founderCommitment = await FounderCommitment.deploy(ethers.keccak256(owner.address));

    // 2. Deploy ZkMLCrossChainVerifier
    const ZkMLCrossChainVerifier = await ethers.getContractFactory("ZkMLCrossChainVerifier");
    zkMLVerifier = await ZkMLCrossChainVerifier.deploy(founderCommitment.target);

    // 3. Deploy AXM Token (Collateral)
    const AXMToken = await ethers.getContractFactory("AXM");
    axm = await AXMToken.deploy(owner.address, owner.address, owner.address);

    // 4. Deploy TruthDerivative
    const TruthDerivative = await ethers.getContractFactory("TruthDerivative");
    truthDerivative = await TruthDerivative.deploy(axm.target, owner.address); // owner as placeholder oracle

    // 5. Deploy CrossChainTruthOracle
    const CrossChainTruthOracle = await ethers.getContractFactory("CrossChainTruthOracle");
    truthOracle = await CrossChainTruthOracle.deploy(zkMLVerifier.target, truthDerivative.target);

    // Update Oracle address in TruthDerivative
    await truthDerivative.setTruthOracle(truthOracle.target);

    // Mint AXM to agents
    await axm.transfer(agentA.address, ethers.parseEther("100"));
    await axm.transfer(agentB.address, ethers.parseEther("100"));
  });

  it("should create a market successfully", async function () {
    const tx = await truthDerivative.createMarket(claimId);
    const receipt = await tx.wait();

    const event = receipt.logs.find(log => log.fragment && log.fragment.name === "MarketCreated");
    expect(event).to.not.be.undefined;

    longTokenAddr = event.args.longToken;
    shortTokenAddr = event.args.shortToken;

    expect(longTokenAddr).to.not.equal(ethers.ZeroAddress);
    expect(shortTokenAddr).to.not.equal(ethers.ZeroAddress);
  });

  it("should allow users to mint LONG and SHORT positions", async function () {
    await truthDerivative.createMarket(claimId);

    // agentA mints 10 LONG
    await axm.connect(agentA).approve(truthDerivative.target, ethers.parseEther("10"));
    await expect(truthDerivative.connect(agentA).mintPosition(claimId, true, ethers.parseEther("10")))
      .to.emit(truthDerivative, "PositionMinted")
      .withArgs(claimId, agentA.address, true, ethers.parseEther("10"));

    // agentB mints 5 SHORT
    await axm.connect(agentB).approve(truthDerivative.target, ethers.parseEther("5"));
    await expect(truthDerivative.connect(agentB).mintPosition(claimId, false, ethers.parseEther("5")))
      .to.emit(truthDerivative, "PositionMinted")
      .withArgs(claimId, agentB.address, false, ethers.parseEther("5"));

    const market = await truthDerivative.markets(claimId);
    expect(market.totalLongShares).to.equal(ethers.parseEther("10"));
    expect(market.totalShortShares).to.equal(ethers.parseEther("5"));
  });

  it("should resolve claim using CrossChainTruthOracle and distribute rewards correctly", async function () {
    await truthDerivative.createMarket(claimId);

    // agentA mints 10 LONG
    await axm.connect(agentA).approve(truthDerivative.target, ethers.parseEther("10"));
    await truthDerivative.connect(agentA).mintPosition(claimId, true, ethers.parseEther("10"));

    // agentB mints 5 SHORT
    await axm.connect(agentB).approve(truthDerivative.target, ethers.parseEther("5"));
    await truthDerivative.connect(agentB).mintPosition(claimId, false, ethers.parseEther("5"));

    // Setup CrossChainOracle
    const chainId = 1;
    await truthOracle.authorizeCrossChainOracle(chainId, oracleSource.address, true);

    // Oracle resolves as TRUE (LONG wins) via CrossChain Attestation
    await expect(truthOracle.connect(oracleSource).attestTruthCrossChain(claimId, chainId, oracleSource.address, true))
      .to.emit(truthOracle, "TruthAttested")
      .withArgs(claimId, true, chainId, oracleSource.address);

    const market = await truthDerivative.markets(claimId);
    expect(market.status).to.equal(1n); // RESOLVED_TRUE

    // agentA claims rewards (should get 15 AXM total: 10 + 5)
    await expect(truthDerivative.connect(agentA).claimReward(claimId))
      .to.emit(truthDerivative, "RewardClaimed")
      .withArgs(claimId, agentA.address, ethers.parseEther("15"));

    // agentB claiming should fail
    await expect(truthDerivative.connect(agentB).claimReward(claimId)).to.be.revertedWith("No winning shares");

    expect(await axm.balanceOf(agentA.address)).to.equal(ethers.parseEther("105"));
    expect(await axm.balanceOf(agentB.address)).to.equal(ethers.parseEther("95"));
  });
});
