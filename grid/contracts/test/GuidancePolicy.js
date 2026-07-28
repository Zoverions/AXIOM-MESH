import { expect } from "chai";
import hre from "hardhat";

describe("GuidancePolicy", function () {
  let GuidancePolicy;
  let policyContract;
  let owner;
  let learner;
  let nonOwner;

  const age = 18;
  const riskTolerance = 1; // moderate
  const requiresMentor = false;

  const policyId = hre.ethers.id("policy1");
  const policyName = "Standard Policy";
  const minAge = 16;
  const maxRiskTolerance = 2; // high
  const mandatoryHumanMentor = false;

  beforeEach(async function () {
    [owner, learner, nonOwner] = await hre.ethers.getSigners();
    GuidancePolicy = await hre.ethers.getContractFactory("GuidancePolicy");
    policyContract = await GuidancePolicy.deploy();
  });

  describe("Learner Registration", function () {
    it("Should allow a learner to register their profile", async function () {
      await expect(policyContract.connect(learner).registerLearner(age, riskTolerance, requiresMentor))
        .to.emit(policyContract, "LearnerRegistered")
        .withArgs(learner.address, age, riskTolerance, requiresMentor);

      const profile = await policyContract.learners(learner.address);
      expect(profile.age).to.equal(age);
      expect(profile.riskTolerance).to.equal(riskTolerance);
      expect(profile.requiresHumanMentor).to.equal(requiresMentor);
      expect(profile.isRestricted).to.be.false;
    });

    it("Should revert if a learner tries to register twice", async function () {
      await policyContract.connect(learner).registerLearner(age, riskTolerance, requiresMentor);
      await expect(
        policyContract.connect(learner).registerLearner(age, riskTolerance, requiresMentor)
      ).to.be.revertedWith("Learner already registered");
    });
  });

  describe("Policy Definition", function () {
    it("Should allow owner to define a policy", async function () {
      await expect(
        policyContract.connect(owner).definePolicy(policyId, policyName, minAge, maxRiskTolerance, mandatoryHumanMentor)
      )
        .to.emit(policyContract, "PolicyDefined")
        .withArgs(policyId, policyName, minAge, maxRiskTolerance, mandatoryHumanMentor);

      const policy = await policyContract.policies(policyId);
      expect(policy.name).to.equal(policyName);
      expect(policy.minAge).to.equal(minAge);
      expect(policy.maxRiskTolerance).to.equal(maxRiskTolerance);
      expect(policy.mandatoryHumanMentor).to.equal(mandatoryHumanMentor);
      expect(policy.isActive).to.be.true;
    });

    it("Should revert if non-owner tries to define a policy", async function () {
      await expect(
        policyContract.connect(nonOwner).definePolicy(policyId, policyName, minAge, maxRiskTolerance, mandatoryHumanMentor)
      ).to.be.revertedWithCustomError(policyContract, "OwnableUnauthorizedAccount")
       .withArgs(nonOwner.address);
    });
  });

  describe("Eligibility Check", function () {
    beforeEach(async function () {
      await policyContract.connect(learner).registerLearner(age, riskTolerance, requiresMentor);
      await policyContract.connect(owner).definePolicy(policyId, policyName, minAge, maxRiskTolerance, mandatoryHumanMentor);
    });

    it("Should return eligible for a qualifying learner", async function () {
      const [isEligible, reason] = await policyContract.isLearnerEligible(learner.address, policyId);
      expect(isEligible).to.be.true;
      expect(reason).to.equal("Eligible");
    });

    it("Should return ineligible if age requirement is not met", async function () {
      const youngAge = 14;
      const youngLearner = nonOwner;
      await policyContract.connect(youngLearner).registerLearner(youngAge, riskTolerance, requiresMentor);

      const [isEligible, reason] = await policyContract.isLearnerEligible(youngLearner.address, policyId);
      expect(isEligible).to.be.false;
      expect(reason).to.equal("Age requirement not met");
    });
  });
});
