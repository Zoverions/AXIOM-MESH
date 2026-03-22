const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("DialecticArbitration", function () {
  let dualLedgerIdentity, weightOracle, dialecticArbitration;
  let owner, humanNode, agentNode, unregisteredNode;

  beforeEach(async function () {
    [owner, humanNode, agentNode, unregisteredNode] = await ethers.getSigners();

    const DualLedgerIdentity = await ethers.getContractFactory("DualLedgerIdentity");
    dualLedgerIdentity = await DualLedgerIdentity.deploy();

    await dualLedgerIdentity.registerNode(humanNode.address, 1);
    await dualLedgerIdentity.registerNode(agentNode.address, 2);

    const WeightOracle = await ethers.getContractFactory("WeightOracle");
    weightOracle = await WeightOracle.deploy(dualLedgerIdentity.target);

    await weightOracle.queueOperation(ethers.keccak256(ethers.solidityPacked(["string", "address", "uint256"], ["updateWeight", humanNode.address, 100])));
    await weightOracle.queueOperation(ethers.keccak256(ethers.solidityPacked(["string", "address", "uint256"], ["updateWeight", agentNode.address, 100])));
    await ethers.provider.send("evm_increaseTime", [2 * 24 * 60 * 60 + 1]);
    await ethers.provider.send("evm_mine");

    await weightOracle.updateWeight(humanNode.address, 100);
    await weightOracle.updateWeight(agentNode.address, 100);

    const DialecticArbitration = await ethers.getContractFactory("DialecticArbitration");
    dialecticArbitration = await DialecticArbitration.deploy(
      dualLedgerIdentity.target,
      weightOracle.target,
      ethers.ZeroAddress
    );
  });

  it("should deploy correctly and link to the proper contracts", async function () {
    expect(await dialecticArbitration.identityContract()).to.equal(dualLedgerIdentity.target);
    expect(await dialecticArbitration.weightOracle()).to.equal(weightOracle.target);
  });

  it("should create a proposal correctly", async function () {
    const duration = 3600;
    const blockTime = await time.latest();

    await expect(dialecticArbitration.createProposal("CID123", 0, 0, ethers.ZeroHash, duration))
      .to.emit(dialecticArbitration, "ProposalCreated")
      .withArgs(0, "CID123", 0, 0, ethers.ZeroHash, blockTime + duration + 1);

    const proposal = await dialecticArbitration.proposals(0);
    expect(proposal.id).to.equal(0);
    expect(proposal.description).to.equal("CID123");
    expect(proposal.state).to.equal(0); // ProposalState.Active
  });

  it("should allow an agent and a human to vote, applying veto multipliers correctly", async function () {
    await dialecticArbitration.createProposal("CID_Anthropic", 0, 0, ethers.ZeroHash, 3600); // Anthropic vector (enum index 0)

    // Human votes FOR. Since it's Anthropic vector, human gets 2.5x multiplier.
    await expect(dialecticArbitration.connect(humanNode).vote(0, true))
      .to.emit(dialecticArbitration, "Voted")
      .withArgs(0, humanNode.address, true, 250); // 100 * 2.5 = 250

    // Agent votes AGAINST. Since it's Anthropic vector, agent gets 1x multiplier.
    await expect(dialecticArbitration.connect(agentNode).vote(0, false))
      .to.emit(dialecticArbitration, "Voted")
      .withArgs(0, agentNode.address, false, 100);

    const proposal = await dialecticArbitration.proposals(0);
    expect(proposal.humanForVotes).to.equal(250);
    expect(proposal.agentAgainstVotes).to.equal(100);
  });

  it("should detect a deadlock and set state to AwaitingSynthesis", async function () {
    await dialecticArbitration.createProposal("CID123", 2, 0, ethers.ZeroHash, 3600); // Neutral vector

    // Human passes, Agent rejects -> deadlock
    await dialecticArbitration.connect(humanNode).vote(0, true);
    await dialecticArbitration.connect(agentNode).vote(0, false);

    await time.increase(3601);

    await expect(dialecticArbitration.resolveProposal(0))
      .to.emit(dialecticArbitration, "DeadlockDetected")
      .withArgs(0);

    const proposal = await dialecticArbitration.proposals(0);
    expect(proposal.state).to.equal(1); // ProposalState.AwaitingSynthesis
  });

  it("should resolve the proposal if both chambers agree", async function () {
    await dialecticArbitration.createProposal("CID123", 2, 0, ethers.ZeroHash, 3600); // Neutral vector

    // Both pass
    await dialecticArbitration.connect(humanNode).vote(0, true);
    await dialecticArbitration.connect(agentNode).vote(0, true);

    await time.increase(3601);

    await expect(dialecticArbitration.resolveProposal(0))
      .to.emit(dialecticArbitration, "ProposalResolved")
      .withArgs(0, true);

    const proposal = await dialecticArbitration.proposals(0);
    expect(proposal.state).to.equal(2); // ProposalState.Resolved
  });

  it("should allow the Hypervisor (owner) to submit a synthesis and reset the proposal", async function () {
    await dialecticArbitration.createProposal("CID123", 2, 0, ethers.ZeroHash, 3600);

    await dialecticArbitration.connect(humanNode).vote(0, true);
    await dialecticArbitration.connect(agentNode).vote(0, false);

    await time.increase(3601);
    await dialecticArbitration.resolveProposal(0);

    const newDuration = 7200;
    const blockTime = await time.latest();

    await expect(dialecticArbitration.submitSynthesis(0, "SynthesisCID", newDuration))
      .to.emit(dialecticArbitration, "SynthesisSubmitted")
      .withArgs(0, "SynthesisCID");

    const proposal = await dialecticArbitration.proposals(0);
    expect(proposal.state).to.equal(0); // ProposalState.Active
    expect(proposal.synthesisResult).to.equal("SynthesisCID");
    expect(proposal.endTime).to.equal(blockTime + newDuration + 1);

    // Votes should be reset
    expect(proposal.humanForVotes).to.equal(0);
    expect(proposal.humanAgainstVotes).to.equal(0);
    expect(proposal.agentForVotes).to.equal(0);
    expect(proposal.agentAgainstVotes).to.equal(0);

    // Nodes should be able to vote again
    await expect(dialecticArbitration.connect(humanNode).vote(0, true))
      .to.emit(dialecticArbitration, "Voted")
      .withArgs(0, humanNode.address, true, 100);

    await expect(dialecticArbitration.connect(agentNode).vote(0, true))
      .to.emit(dialecticArbitration, "Voted")
      .withArgs(0, agentNode.address, true, 100);

    const proposalAfterReVote = await dialecticArbitration.proposals(0);
    expect(proposalAfterReVote.humanForVotes).to.equal(100);
    expect(proposalAfterReVote.agentForVotes).to.equal(100);

    // Attempting to vote again should revert
    await expect(dialecticArbitration.connect(humanNode).vote(0, true))
      .to.be.revertedWithCustomError(dialecticArbitration, "AlreadyVoted");
  });

  it("should revert if an unregistered node tries to vote", async function () {
    await dialecticArbitration.createProposal("CID123", 2, 0, ethers.ZeroHash, 3600);
    await expect(dialecticArbitration.connect(unregisteredNode).vote(0, true))
      .to.be.revertedWithCustomError(dialecticArbitration, "NodeNotRegistered");
  });

  it("should revert if voting twice", async function () {
    await dialecticArbitration.createProposal("CID123", 2, 0, ethers.ZeroHash, 3600);
    await dialecticArbitration.connect(humanNode).vote(0, true);
    await expect(dialecticArbitration.connect(humanNode).vote(0, false))
      .to.be.revertedWithCustomError(dialecticArbitration, "AlreadyVoted");
  });

  it("should revert if voting after the period ends", async function () {
    await dialecticArbitration.createProposal("CID123", 2, 0, ethers.ZeroHash, 3600);
    await time.increase(3601);
    await expect(dialecticArbitration.connect(humanNode).vote(0, true))
      .to.be.revertedWithCustomError(dialecticArbitration, "VotingPeriodEnded");
  });

  it("should revert if resolving before the period ends", async function () {
    await dialecticArbitration.createProposal("CID123", 2, 0, ethers.ZeroHash, 3600);
    await expect(dialecticArbitration.resolveProposal(0))
      .to.be.revertedWithCustomError(dialecticArbitration, "VotingPeriodNotEnded");
  });

  describe("Targeted Groups and Credentials", function () {
    it("should allow only Humans to vote on Human targeted proposals", async function () {
      await dialecticArbitration.createProposal("TargetHuman", 2, 1, ethers.ZeroHash, 3600); // TargetGroup.Human = 1

      await expect(dialecticArbitration.connect(agentNode).vote(0, true))
        .to.be.revertedWithCustomError(dialecticArbitration, "UnauthorizedGroup");

      await expect(dialecticArbitration.connect(humanNode).vote(0, true))
        .to.emit(dialecticArbitration, "Voted");

      await time.increase(3601);
      await expect(dialecticArbitration.resolveProposal(0))
        .to.emit(dialecticArbitration, "ProposalResolved")
        .withArgs(0, true);

      const proposal = await dialecticArbitration.proposals(0);
      expect(proposal.state).to.equal(2); // Resolved
    });

    it("should allow only Agents to vote on Agent targeted proposals", async function () {
      await dialecticArbitration.createProposal("TargetAgent", 2, 2, ethers.ZeroHash, 3600); // TargetGroup.Agent = 2

      await expect(dialecticArbitration.connect(humanNode).vote(0, true))
        .to.be.revertedWithCustomError(dialecticArbitration, "UnauthorizedGroup");

      await expect(dialecticArbitration.connect(agentNode).vote(0, true))
        .to.emit(dialecticArbitration, "Voted");

      await time.increase(3601);
      await expect(dialecticArbitration.resolveProposal(0))
        .to.emit(dialecticArbitration, "ProposalResolved")
        .withArgs(0, true);
    });

    it("should require a specific credential if requiredCurriculum is set", async function () {
      const requiredCurriculumId = ethers.id("curr123");
      const credentialId = ethers.id("cert123");
      await dialecticArbitration.createProposal("CredentialReq", 2, 0, requiredCurriculumId, 3600);

      // Should fail since it requires a credential and we use the normal vote
      await expect(dialecticArbitration.connect(humanNode).vote(0, true))
        .to.be.revertedWithCustomError(dialecticArbitration, "MissingRequiredCredential");

      // Should fail since no credentialBond is set, even with voteWithCredential
      await expect(dialecticArbitration.connect(humanNode).voteWithCredential(0, true, credentialId))
        .to.be.revertedWithCustomError(dialecticArbitration, "MissingRequiredCredential");

      // Mock ICredentialBond using a simple dummy contract logic in tests
      const DummyCredentialBond = await ethers.getContractFactory("CredentialBond");
      const dummyBond = await DummyCredentialBond.deploy();

      await dummyBond.connect(owner).stake({ value: ethers.parseEther("1.0") });
      await dummyBond.connect(owner).issueCredential(credentialId, humanNode.address, requiredCurriculumId);

      await dialecticArbitration.setCredentialBond(dummyBond.target);

      await expect(dialecticArbitration.connect(humanNode).voteWithCredential(0, true, credentialId))
        .to.emit(dialecticArbitration, "Voted");

      // Should fail if a user tries to use someone else's credential or a wrong credential
      const wrongCredentialId = ethers.id("cert999");
      await dummyBond.connect(owner).issueCredential(wrongCredentialId, agentNode.address, ethers.id("wrongCurr"));
      await expect(dialecticArbitration.connect(agentNode).voteWithCredential(0, true, wrongCredentialId))
        .to.be.revertedWithCustomError(dialecticArbitration, "MissingRequiredCredential");
    });
  });

  describe("Financial Audits", function () {
    it("should create a financial audit proposal and resolve it", async function () {
      const blockTime = await time.latest();
      await expect(dialecticArbitration.createFinancialAuditProposal(
        "FinancialAudit2026",
        0, // TargetGroup.All
        ethers.ZeroHash,
        3600,
        1000, // Slashed
        500   // Subsidized
      )).to.emit(dialecticArbitration, "FinancialAuditSubmitted")
        .withArgs(0, 1000, 500);

      const audit = await dialecticArbitration.financialAudits(0);
      expect(audit.totalSlashedFunds).to.equal(1000);
      expect(audit.totalSubsidizedFunds).to.equal(500);
      expect(audit.isFair).to.be.false;

      await dialecticArbitration.connect(humanNode).vote(0, true);
      await dialecticArbitration.connect(agentNode).vote(0, true);

      await time.increase(3601);
      await dialecticArbitration.resolveProposal(0);

      const resolvedAudit = await dialecticArbitration.financialAudits(0);
      expect(resolvedAudit.isFair).to.be.true;
    });
  });
});
