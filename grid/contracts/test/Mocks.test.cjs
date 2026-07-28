const { expect } = require("chai");
const hre = require("hardhat");
const { ethers } = hre;

describe("Mock Implementations Replacements", function () {
  let zkVerifier;
  let owner;
  let user1;
  let user2;

  before(async function () {
    [owner, user1, user2] = await ethers.getSigners();
  });

  describe("MOCK-1: ShadowBridge", function () {
    let shadowBridge;
    let founder;

    it("Should deploy and setup ShadowBridge", async function () {
      // Precompute ShadowBridge address to set as founderHash, so `verifyFounder` succeeds when called by ShadowBridge
      const nonce = await owner.getNonce();
      const shadowBridgeAddress = ethers.getCreateAddress({ from: owner.address, nonce: nonce + 3 });

      // Deploy FounderCommitment
      const FounderCommitment = await ethers.getContractFactory("FounderCommitment");
      founder = await FounderCommitment.deploy(ethers.solidityPackedKeccak256(["address"], [shadowBridgeAddress]));
      await founder.waitForDeployment();
      await founder.initialize(owner.address);

      // Deploy ZKMLVerifier Mock
      const MockZKMLVerifier = await ethers.getContractFactory("contracts/mock/MocksForTests.sol:MockZKMLVerifier");
      zkVerifier = await MockZKMLVerifier.deploy();
      await zkVerifier.waitForDeployment();

      // Deploy ShadowBridge
      const ShadowBridge = await ethers.getContractFactory("ShadowBridge");
      shadowBridge = await ShadowBridge.deploy(await founder.getAddress());
      await shadowBridge.waitForDeployment();

      // Check precomputed address matches
      expect(await shadowBridge.getAddress()).to.equal(shadowBridgeAddress);

      // setZkVerifier requires msg.sender to be founder.owner()
      await shadowBridge.connect(owner).setZkVerifier(await zkVerifier.getAddress());
      expect(await shadowBridge.zkVerifier()).to.equal(await zkVerifier.getAddress());
    });

    it("Should verify stealth proof by calling real ZK verifier", async function () {
      const a = [1, 2];
      const b = [[3, 4], [5, 6]];
      const c = [7, 8];
      const proofHash = ethers.id("proof1");

      const encodedProof = ethers.AbiCoder.defaultAbiCoder().encode(
        ["bytes32", "uint256[2]", "uint256[2][2]", "uint256[2]"],
        [proofHash, a, b, c]
      );

      // Call verifyZkStealthProof, which will internally decode and call the ZKVerifier
      await shadowBridge.verifyZkStealthProof(encodedProof);
    });
  });

  describe("MOCK-2: CognitiveFrictionVerifier", function () {
    let frictionVerifier;

    it("Should deploy and setup CognitiveFrictionVerifier", async function () {
      const MockZKMLVerifier = await ethers.getContractFactory("contracts/mock/MocksForTests.sol:MockZKMLVerifier");
      zkVerifier = await MockZKMLVerifier.deploy();
      await zkVerifier.waitForDeployment();

      const CognitiveFrictionVerifier = await ethers.getContractFactory("CognitiveFrictionVerifier");
      frictionVerifier = await CognitiveFrictionVerifier.deploy();
      await frictionVerifier.waitForDeployment();

      await frictionVerifier.setZkVerifier(await zkVerifier.getAddress());
      expect(await frictionVerifier.zkVerifier()).to.equal(await zkVerifier.getAddress());
    });

    it("Should verify friction proof by calling real ZK verifier", async function () {
      const a = [1, 2];
      const b = [[3, 4], [5, 6]];
      const c = [7, 8];
      const proofHash = ethers.id("proof1");

      const encodedProof = ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint256[2]", "uint256[2][2]", "uint256[2]"],
        [a, b, c]
      );

      await frictionVerifier.connect(user1).verifyProofWithFriction(proofHash, encodedProof);

      expect(await frictionVerifier.verifiedProofs(proofHash)).to.equal(true);
      expect(await frictionVerifier.poerScores(user1.address)).to.equal(1500);
    });
  });

  describe("MOCK-3: AssuranceMarkets", function () {
    let assuranceMarkets;
    let gdtToken;
    let rewardPool;

    it("Should deploy and setup AssuranceMarkets", async function () {
      const MockToken = await ethers.getContractFactory("contracts/mock/MockERC20.sol:MockERC20");
      gdtToken = await MockToken.deploy("Global Defense Token", "GDT", ethers.parseUnits("100000", 18));
      await gdtToken.waitForDeployment();

      const AssuranceMarkets = await ethers.getContractFactory("AssuranceMarkets");
      // The AssuranceMarkets constructor requires 1 argument now (gdtToken) to bypass hallucination
      assuranceMarkets = await AssuranceMarkets.deploy(await gdtToken.getAddress(), owner.address);
      await assuranceMarkets.waitForDeployment();

      const MockRewardPool = await ethers.getContractFactory("contracts/mock/MocksForTests.sol:MockRewardPool");
      rewardPool = await MockRewardPool.deploy(await gdtToken.getAddress());
      await rewardPool.waitForDeployment();

      await assuranceMarkets.setRewardPool(await rewardPool.getAddress());
      expect(await assuranceMarkets.rewardPool()).to.equal(await rewardPool.getAddress());
    });

    it("Should stake, resolve, and distribute actual rewards via external RewardPool", async function () {
      const policyId = 1;
      const targetFlourishingIndex = 100;
      await assuranceMarkets.createMarket(policyId, targetFlourishingIndex);

      const stakeAmount = ethers.parseEther("100");
      await gdtToken.mint(user1.address, stakeAmount);
      await gdtToken.connect(user1).approve(await assuranceMarkets.getAddress(), stakeAmount);

      await assuranceMarkets.connect(user1).stakeOnOutcome(policyId, stakeAmount);

      // Resolve the market with a successful final index
      await assuranceMarkets.resolveMarket(policyId, 110);

      // Provide reward pool with GDT
      await gdtToken.mint(await rewardPool.getAddress(), ethers.parseEther("500"));

      // Withdraw stake should trigger external reward
      await assuranceMarkets.connect(user1).withdrawStake(policyId);

      // With original stake + mock 10% reward distributed by the MockRewardPool
      const balance = await gdtToken.balanceOf(user1.address);
      // user1 should have 100 (stake returned) + 10 (10% reward) = 110 GDT
      expect(balance).to.equal(ethers.parseEther("110"));
    });
  });
});
