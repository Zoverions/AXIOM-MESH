const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("HermesAgentRegistry", function () {
  let HermesAgentRegistry;
  let registry;
  let owner;
  let governance;
  let auditor;
  let agentOwner;
  let other;

  const GOVERNANCE_ROLE = ethers.keccak256(ethers.toUtf8Bytes("GOVERNANCE_ROLE"));
  const AUDITOR_ROLE = ethers.keccak256(ethers.toUtf8Bytes("AUDITOR_ROLE"));

  beforeEach(async function () {
    [owner, governance, auditor, agentOwner, other] = await ethers.getSigners();
    HermesAgentRegistry = await ethers.getContractFactory("HermesAgentRegistry");
    registry = await HermesAgentRegistry.deploy();

    await registry.grantRole(GOVERNANCE_ROLE, governance.address);
    await registry.grantRole(AUDITOR_ROLE, auditor.address);
  });

  describe("Registration", function () {
    it("Should register an agent", async function () {
      const agentId = ethers.keccak256(ethers.toUtf8Bytes("agent1"));
      const did = ethers.keccak256(ethers.toUtf8Bytes("did:axiom:agent1"));
      const limit = ethers.parseEther("100");

      await expect(registry.connect(agentOwner).registerAgent(agentId, did, limit))
        .to.emit(registry, "AgentRegistered")
        .withArgs(agentId, agentOwner.address, did);

      const agent = await registry.agents(agentId);
      expect(agent.owner).to.equal(agentOwner.address);
      expect(agent.dailySpendLimit).to.equal(limit);
      expect(agent.active).to.be.true;
    });

    it("Should fail if agent is already registered", async function () {
      const agentId = ethers.keccak256(ethers.toUtf8Bytes("agent1"));
      const did = ethers.keccak256(ethers.toUtf8Bytes("did:axiom:agent1"));
      await registry.connect(agentOwner).registerAgent(agentId, did, 0);
      await expect(registry.connect(other).registerAgent(agentId, did, 0))
        .to.be.revertedWith("Agent already registered");
    });
  });

  describe("Capabilities", function () {
    const agentId = ethers.keccak256(ethers.toUtf8Bytes("agent1"));
    const actionHash = ethers.keccak256(ethers.toUtf8Bytes("action1"));
    const ttl = 3600;

    beforeEach(async function () {
      await registry.connect(agentOwner).registerAgent(agentId, ethers.ZeroHash, 0);
    });

    it("Should issue a capability token to the owner", async function () {
      await expect(registry.connect(agentOwner).requestCapability(agentId, actionHash, ttl))
        .to.emit(registry, "CapabilityRequested");
    });

    it("Should issue a capability token to governance", async function () {
      await expect(registry.connect(governance).requestCapability(agentId, actionHash, ttl))
        .to.emit(registry, "CapabilityRequested");
    });

    it("Should fail if not owner or governance", async function () {
      await expect(registry.connect(other).requestCapability(agentId, actionHash, ttl))
        .to.be.revertedWith("Unauthorized");
    });

    it("Should fail if agent is inactive", async function () {
      await registry.connect(governance).setAgentActive(agentId, false);
      await expect(registry.connect(agentOwner).requestCapability(agentId, actionHash, ttl))
        .to.be.revertedWith("Agent not active");
    });

    it("Should verify a valid token", async function () {
      const tx = await registry.connect(agentOwner).requestCapability(agentId, actionHash, ttl);
      const receipt = await tx.wait();
      const event = receipt.logs.find(log => log.fragment && log.fragment.name === "CapabilityRequested");
      const token = event.args[2];

      expect(await registry.verifyCapability(token, actionHash)).to.be.true;
    });

    it("Should fail verification for invalid action hash", async function () {
      const tx = await registry.connect(agentOwner).requestCapability(agentId, actionHash, ttl);
      const receipt = await tx.wait();
      const event = receipt.logs.find(log => log.fragment && log.fragment.name === "CapabilityRequested");
      const token = event.args[2];

      const wrongActionHash = ethers.keccak256(ethers.toUtf8Bytes("wrongAction"));
      expect(await registry.verifyCapability(token, wrongActionHash)).to.be.false;
    });

    it("Should fail verification for expired token", async function () {
      const shortTtl = 1;
      const tx = await registry.connect(agentOwner).requestCapability(agentId, actionHash, shortTtl);
      const receipt = await tx.wait();
      const event = receipt.logs.find(log => log.fragment && log.fragment.name === "CapabilityRequested");
      const token = event.args[2];

      await ethers.provider.send("evm_increaseTime", [10]);
      await ethers.provider.send("evm_mine");

      expect(await registry.verifyCapability(token, actionHash)).to.be.false;
    });
  });

  describe("Spend Management", function () {
    const agentId = ethers.keccak256(ethers.toUtf8Bytes("agent1"));
    const limit = ethers.parseEther("10");

    beforeEach(async function () {
      await registry.connect(agentOwner).registerAgent(agentId, ethers.ZeroHash, limit);
    });

    it("Should record spend within limit", async function () {
      await registry.connect(governance).recordSpend(agentId, ethers.parseEther("5"));
      const agent = await registry.agents(agentId);
      expect(agent.dailySpent).to.equal(ethers.parseEther("5"));
    });

    it("Should fail if spend exceeds limit", async function () {
      await expect(registry.connect(governance).recordSpend(agentId, ethers.parseEther("11")))
        .to.be.revertedWith("Spend limit exceeded");
    });

    it("Should reset spend after 1 day", async function () {
      await registry.connect(governance).recordSpend(agentId, ethers.parseEther("5"));

      await ethers.provider.send("evm_increaseTime", [86400]); // 1 day
      await ethers.provider.send("evm_mine");

      await registry.connect(governance).recordSpend(agentId, ethers.parseEther("1"));
      const agent = await registry.agents(agentId);
      expect(agent.dailySpent).to.equal(ethers.parseEther("1"));
    });

    it("Should update spend limit", async function () {
      await expect(registry.connect(governance).updateSpendLimit(agentId, ethers.parseEther("20")))
        .to.emit(registry, "SpendLimitUpdated")
        .withArgs(agentId, ethers.parseEther("20"));

      const agent = await registry.agents(agentId);
      expect(agent.dailySpendLimit).to.equal(ethers.parseEther("20"));
    });
  });

  describe("Skills & Auditing", function () {
    const agentId = ethers.keccak256(ethers.toUtf8Bytes("agent1"));
    const skillHash = ethers.keccak256(ethers.toUtf8Bytes("skill1"));

    it("Should approve a skill", async function () {
      await expect(registry.connect(governance).approveSkill(agentId, skillHash))
        .to.emit(registry, "SkillApproved")
        .withArgs(agentId, skillHash);

      expect(await registry.approvedSkills(agentId, skillHash)).to.be.true;
    });

    it("Should log an action", async function () {
      const actionHash = ethers.keccak256(ethers.toUtf8Bytes("action1"));
      await expect(registry.connect(auditor).logAction(agentId, actionHash, true))
        .to.emit(registry, "ActionLogged")
        .withArgs(agentId, actionHash, true);
    });

    it("Should fail logging if not auditor", async function () {
      await expect(registry.connect(other).logAction(agentId, ethers.ZeroHash, true))
        .to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount");
    });
  });
});
