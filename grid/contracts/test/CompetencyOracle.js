import { expect } from "chai";
import hre from "hardhat";

describe("CompetencyOracle", function () {
  let CompetencyOracle;
  let oracle;
  let owner;
  let nonOwner;

  const competencyId = hre.ethers.id("comp1");
  const standardName = "CS101";
  const description = "Intro to Computer Science";

  beforeEach(async function () {
    [owner, nonOwner] = await hre.ethers.getSigners();
    CompetencyOracle = await hre.ethers.getContractFactory("CompetencyOracle");
    oracle = await CompetencyOracle.deploy();
  });

  describe("Competency Registration", function () {
    it("Should allow owner to register a competency", async function () {
      await expect(oracle.connect(owner).registerCompetency(competencyId, standardName, description))
        .to.emit(oracle, "CompetencyRegistered")
        .withArgs(competencyId, standardName);

      const comp = await oracle.competencies(competencyId);
      expect(comp.standardName).to.equal(standardName);
      expect(comp.description).to.equal(description);
      expect(comp.isActive).to.be.true;
    });

    it("Should revert if non-owner tries to register a competency", async function () {
      await expect(
        oracle.connect(nonOwner).registerCompetency(competencyId, standardName, description)
      ).to.be.revertedWithCustomError(oracle, "OwnableUnauthorizedAccount")
       .withArgs(nonOwner.address);
    });
  });

  describe("Equivalency Mapping", function () {
    const sourceCurriculumId = hre.ethers.id("cur1");
    const targetCurriculumId = hre.ethers.id("cur2");
    const score = 85;

    beforeEach(async function () {
      await oracle.connect(owner).registerCompetency(competencyId, standardName, description);
    });

    it("Should allow owner to map equivalency", async function () {
      await expect(
        oracle.connect(owner).mapEquivalency(sourceCurriculumId, competencyId, targetCurriculumId, score)
      )
        .to.emit(oracle, "EquivalencyMapped")
        .withArgs(sourceCurriculumId, competencyId, targetCurriculumId, score);

      const mapping = await oracle.getEquivalency(sourceCurriculumId, competencyId);
      expect(mapping.targetCurriculumId).to.equal(targetCurriculumId);
      expect(mapping.equivalencyScore).to.equal(score);
    });

    it("Should revert if mapped to a non-existent competency", async function () {
      const invalidId = hre.ethers.id("invalid");
      await expect(
        oracle.connect(owner).mapEquivalency(sourceCurriculumId, invalidId, targetCurriculumId, score)
      ).to.be.revertedWith("Competency does not exist");
    });
  });
});
