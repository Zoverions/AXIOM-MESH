import { expect } from "chai";
import hre from "hardhat";

describe("CredentialBond", function () {
  let CredentialBond;
  let bond;
  let owner;
  let assessor;
  let learner;
  const MIN_STAKE = hre.ethers.parseEther("1.0");
  const credentialId = hre.ethers.id("cred1");
  const curriculumId = hre.ethers.id("curriculum1");

  beforeEach(async function () {
    [owner, assessor, learner] = await hre.ethers.getSigners();
    CredentialBond = await hre.ethers.getContractFactory("CredentialBond");
    bond = await CredentialBond.deploy();
  });

  describe("Staking", function () {
    it("Should allow an assessor to stake at least minimum amount", async function () {
      await expect(bond.connect(assessor).stake({ value: MIN_STAKE }))
        .to.emit(bond, "AssessorStaked")
        .withArgs(assessor.address, MIN_STAKE);

      const staker = await bond.assessorStakes(assessor.address);
      expect(staker.amount).to.equal(MIN_STAKE);
      expect(staker.isActive).to.be.true;
    });

    it("Should revert if stake is below minimum", async function () {
      const lowStake = hre.ethers.parseEther("0.5");
      await expect(
        bond.connect(assessor).stake({ value: lowStake })
      ).to.be.revertedWith("Stake below minimum");
    });
  });

  describe("Issuing Credentials", function () {
    beforeEach(async function () {
      await bond.connect(assessor).stake({ value: MIN_STAKE });
    });

    it("Should allow active staker to issue credential", async function () {
      await expect(
        bond.connect(assessor).issueCredential(credentialId, learner.address, curriculumId)
      )
        .to.emit(bond, "CredentialIssued")
        .withArgs(credentialId, assessor.address, learner.address, curriculumId);

      const cred = await bond.credentials(credentialId);
      expect(cred.assessor).to.equal(assessor.address);
      expect(cred.learner).to.equal(learner.address);
      expect(cred.curriculumId).to.equal(curriculumId);
      expect(cred.isRevoked).to.be.false;
    });

    it("Should revert if assessor does not have active stake", async function () {
      await expect(
        bond.connect(learner).issueCredential(credentialId, learner.address, curriculumId)
      ).to.be.revertedWith("Assessor not active");
    });
  });
});
