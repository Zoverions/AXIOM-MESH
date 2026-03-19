const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("SkillCapsule", function () {
  let SkillCapsule, skillCapsule, owner, addr1;

  beforeEach(async function () {
    SkillCapsule = await ethers.getContractFactory("SkillCapsule");
    [owner, addr1] = await ethers.getSigners();
    skillCapsule = await SkillCapsule.deploy();
  });

  it("Should issue a capsule successfully", async function () {
    await skillCapsule.issueCapsule(
      "cap-001",
      "TestCapsule",
      "1.0.0",
      { meshIssuer: "IssuerX", keyId: "key-123" },
      ["cap1", "cap2"],
      { proofCarryingIntents: true, intentCanonicalization: true, maxRiskScore: 5000 },
      { cpuLimit: 100, memoryLimitMb: 256, timeoutMs: 5000 },
      "tools-scope",
      "data-scope",
      3600,
      true,
      "strict"
    );

    const verified = await skillCapsule.verifyCapsule("cap-001");
    expect(verified).to.be.true;

    const capabilities = await skillCapsule.getCapsuleCapabilities("cap-001");
    expect(capabilities.length).to.equal(2);
    expect(capabilities[0]).to.equal("cap1");
  });

  it("Should not allow duplicate capsule ids", async function () {
    await skillCapsule.issueCapsule(
      "cap-002", "TestCapsule", "1.0.0", { meshIssuer: "IssuerX", keyId: "key-123" }, ["cap1"],
      { proofCarryingIntents: true, intentCanonicalization: true, maxRiskScore: 5000 },
      { cpuLimit: 100, memoryLimitMb: 256, timeoutMs: 5000 },
      "tools", "data", 3600, true, "strict"
    );

    await expect(
      skillCapsule.issueCapsule(
        "cap-002", "TestCapsule", "1.0.0", { meshIssuer: "IssuerX", keyId: "key-123" }, ["cap1"],
        { proofCarryingIntents: true, intentCanonicalization: true, maxRiskScore: 5000 },
        { cpuLimit: 100, memoryLimitMb: 256, timeoutMs: 5000 },
        "tools", "data", 3600, true, "strict"
      )
    ).to.be.revertedWith("Capsule already exists");
  });

  it("Should revoke a capsule successfully", async function () {
    await skillCapsule.issueCapsule(
      "cap-003", "TestCapsule", "1.0.0", { meshIssuer: "IssuerX", keyId: "key-123" }, ["cap1"],
      { proofCarryingIntents: true, intentCanonicalization: true, maxRiskScore: 5000 },
      { cpuLimit: 100, memoryLimitMb: 256, timeoutMs: 5000 },
      "tools", "data", 3600, true, "strict"
    );

    await skillCapsule.revokeCapsule("cap-003");

    const verified = await skillCapsule.verifyCapsule("cap-003");
    expect(verified).to.be.false;

    await expect(
      skillCapsule.revokeCapsule("cap-003")
    ).to.be.revertedWith("Capsule already revoked");
  });

  it("Should return false when verifying a non-existent capsule", async function () {
    const verified = await skillCapsule.verifyCapsule("cap-nonexistent");
    expect(verified).to.be.false;
  });

  it("Should revert if non-owner tries to issue a capsule", async function () {
    await expect(
      skillCapsule.connect(addr1).issueCapsule(
        "cap-004",
        "TestCapsule",
        "1.0.0",
        { meshIssuer: "IssuerX", keyId: "key-123" },
        ["cap1", "cap2"],
        { proofCarryingIntents: true, intentCanonicalization: true, maxRiskScore: 5000 },
        { cpuLimit: 100, memoryLimitMb: 256, timeoutMs: 5000 },
        "tools-scope",
        "data-scope",
        3600,
        true,
        "strict"
      )
    ).to.be.revertedWithCustomError(skillCapsule, "OwnableUnauthorizedAccount")
      .withArgs(addr1.address);
  });

  it("Should revert if non-owner tries to revoke a capsule", async function () {
    await skillCapsule.issueCapsule(
      "cap-005", "TestCapsule", "1.0.0", { meshIssuer: "IssuerX", keyId: "key-123" }, ["cap1"],
      { proofCarryingIntents: true, intentCanonicalization: true, maxRiskScore: 5000 },
      { cpuLimit: 100, memoryLimitMb: 256, timeoutMs: 5000 },
      "tools", "data", 3600, true, "strict"
    );

    await expect(
      skillCapsule.connect(addr1).revokeCapsule("cap-005")
    ).to.be.revertedWithCustomError(skillCapsule, "OwnableUnauthorizedAccount")
      .withArgs(addr1.address);
  });
});
