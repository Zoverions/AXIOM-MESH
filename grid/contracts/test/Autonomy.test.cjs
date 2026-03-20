const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Blockchain Autonomy Layer", function () {
  let founderCommitment;
  let deploymentFactory;
  let dialecticArbitration;
  let computeBond;
  let identityContract;
  let weightOracle;
  let owner, human, agent;
  let founderHash;
  let testBytecode;
  let testSalt;

  before(async function () {
    [owner, human, agent] = await ethers.getSigners();

    // 1. Deploy Identity and WeightOracle first (needed for DialecticArbitration)
    const Identity = await ethers.getContractFactory("DualLedgerIdentity");
    identityContract = await Identity.deploy();
    await identityContract.waitForDeployment();

    const WeightOracle = await ethers.getContractFactory("WeightOracle");
    weightOracle = await WeightOracle.deploy(await identityContract.getAddress());
    await weightOracle.waitForDeployment();

    // Register test voters
    await identityContract.registerNode(human.address, 1); // 1 = Human
    await identityContract.registerNode(agent.address, 2); // 2 = Agent

    // Assign initial weights
    await weightOracle.updateWeight(human.address, 100);
    await weightOracle.updateWeight(agent.address, 100);

    // 2. Deploy existing dependencies (DialecticArbitration, ComputeBond)
    const ComputeBond = await ethers.getContractFactory("ComputeBond");
    computeBond = await ComputeBond.deploy();
    await computeBond.waitForDeployment();

    const DialecticArbitration = await ethers.getContractFactory("DialecticArbitration");
    dialecticArbitration = await DialecticArbitration.deploy(
      await identityContract.getAddress(),
      await weightOracle.getAddress(),
      await owner.getAddress() // Mock credential bond
    );
    await dialecticArbitration.waitForDeployment();

    // 3. Deploy new autonomy contracts
    const FounderCommitment = await ethers.getContractFactory("FounderCommitment");
    founderHash = ethers.keccak256(ethers.solidityPacked(["address"], [owner.address]));
    founderCommitment = await FounderCommitment.deploy(founderHash);
    await founderCommitment.waitForDeployment();
    await founderCommitment.initialize(owner.address);

    const DeploymentFactory = await ethers.getContractFactory("DeploymentFactory");
    deploymentFactory = await DeploymentFactory.deploy(
      await founderCommitment.getAddress(),
      await dialecticArbitration.getAddress(),
      await computeBond.getAddress()
    );
    await deploymentFactory.waitForDeployment();
    await deploymentFactory.initialize();

    // Wire up compute bond to allow factory to auto-fund
    await computeBond.setDeploymentFactory(await deploymentFactory.getAddress());
  });

  it("Should verify the founder without exposing the address directly", async function () {
    const result = await founderCommitment.connect(owner).verifyFounder.staticCall(new Uint8Array(0));
    expect(result).to.be.true;
  });

  it("Should autonomously deploy a contract after a successful bicameral vote", async function () {
    // Dummy bytecode for a simple contract that just returns true on fallback
    testBytecode = "0x600a600c600039600a6000f3fe600160005260206000f3"; // Simple contract returning 1
    testSalt = ethers.keccak256(ethers.toUtf8Bytes("test_salt"));

    // 1. Propose deployment
    const duration = 86400; // 1 day
    await dialecticArbitration.createDeploymentProposal(
      "Deploy Test Contract",
      2, // Neutral
      0, // All
      ethers.ZeroHash,
      duration,
      testBytecode,
      testSalt
    );

    // We assume proposal ID is 0 since it's the first one
    const proposalId = 0;

    // 2. Vote from both chambers
    await dialecticArbitration.connect(human).vote(proposalId, true);
    await dialecticArbitration.connect(agent).vote(proposalId, true);

    // Fast forward time
    await ethers.provider.send("evm_increaseTime", [duration + 1]);
    await ethers.provider.send("evm_mine");

    // 3. Resolve proposal
    await dialecticArbitration.resolveProposal(proposalId);

    const proposalHash = ethers.keccak256(ethers.solidityPacked(["bytes", "bytes32"], [testBytecode, testSalt]));
    const isPassed = await dialecticArbitration.isProposalPassed(proposalHash);
    expect(isPassed).to.be.true;

    // 4. Auto-deploy via Factory
    const gasBudget = 0; // Test with 0 budget first to ensure the basic deployment flow works without transferring native token

    // compute target address beforehand to test that it is correctly computed
    const expectedAddress = ethers.getCreate2Address(
      await deploymentFactory.getAddress(),
      testSalt,
      ethers.keccak256(testBytecode)
    );

    const tx = await deploymentFactory.deploy(testBytecode, testSalt, "TestContract", gasBudget);
    const receipt = await tx.wait();

    // Check events
    const event = receipt.logs.find(l => l.fragment && l.fragment.name === "ContractDeployed");
    expect(event).to.not.be.undefined;
    expect(event.args.deployed).to.equal(expectedAddress);
    expect(event.args.salt).to.equal(testSalt);
    expect(event.args.contractType).to.equal("TestContract");

    // Verify contract was deployed
    const code = await ethers.provider.getCode(expectedAddress);
    expect(code).to.not.equal("0x");
  });
});
