import { expect } from "chai";
import hre from "hardhat";

describe("CurriculumRegistry", function () {
  let CurriculumRegistry;
  let registry;
  let owner;
  let provider1;
  let nonProvider;

  const curriculumId = hre.ethers.id("curriculum1");
  const version = "v1.0.0";
  const provenanceDigest = hre.ethers.id("digest1");
  const updateCadence = 30 * 24 * 60 * 60; // 30 days in seconds

  beforeEach(async function () {
    [owner, provider1, nonProvider] = await hre.ethers.getSigners();
    CurriculumRegistry = await hre.ethers.getContractFactory("CurriculumRegistry");
    registry = await CurriculumRegistry.deploy();
  });

  describe("Provider Authorization", function () {
    it("Should authorize a provider by owner", async function () {
      await expect(registry.connect(owner).authorizeProvider(provider1.address))
        .to.emit(registry, "ProviderAuthorized")
        .withArgs(provider1.address);

      expect(await registry.authorizedProviders(provider1.address)).to.be.true;
    });

    it("Should revert if non-owner tries to authorize a provider", async function () {
      await expect(
        registry.connect(nonProvider).authorizeProvider(provider1.address)
      ).to.be.revertedWithCustomError(registry, "OwnableUnauthorizedAccount")
       .withArgs(nonProvider.address);
    });
  });

  describe("Curriculum Registration", function () {
    beforeEach(async function () {
      await registry.connect(owner).authorizeProvider(provider1.address);
    });

    it("Should allow an authorized provider to register a curriculum", async function () {
      await expect(
        registry.connect(provider1).registerCurriculum(curriculumId, version, provenanceDigest, updateCadence)
      )
        .to.emit(registry, "CurriculumRegistered")
        .withArgs(curriculumId, provider1.address, version, provenanceDigest);

      const cur = await registry.curriculums(curriculumId);
      expect(cur.provider).to.equal(provider1.address);
      expect(cur.version).to.equal(version);
      expect(cur.provenanceDigest).to.equal(provenanceDigest);
      expect(cur.isDegraded).to.be.false;
      expect(cur.isArchived).to.be.false;
    });

    it("Should revert if an unauthorized account tries to register", async function () {
      await expect(
        registry.connect(nonProvider).registerCurriculum(curriculumId, version, provenanceDigest, updateCadence)
      ).to.be.revertedWith("Not an authorized provider");
    });
  });
});
