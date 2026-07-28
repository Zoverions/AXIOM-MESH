import { expect } from "chai";
import hre from "hardhat";

describe("AccreditationAttestor", function () {
  let AccreditationAttestor;
  let attestor;
  let owner;
  let body1;
  let nonBody;

  const curriculumId = hre.ethers.id("curriculum1");
  const durationInDays = 365;

  beforeEach(async function () {
    [owner, body1, nonBody] = await hre.ethers.getSigners();
    AccreditationAttestor = await hre.ethers.getContractFactory("AccreditationAttestor");
    attestor = await AccreditationAttestor.deploy();
  });

  describe("Body Authorization", function () {
    it("Should allow owner to authorize a body", async function () {
      await expect(attestor.connect(owner).authorizeBody(body1.address))
        .to.emit(attestor, "BodyAuthorized")
        .withArgs(body1.address);

      expect(await attestor.authorizedBodies(body1.address)).to.be.true;
    });

    it("Should revert if non-owner tries to authorize a body", async function () {
      await expect(
        attestor.connect(nonBody).authorizeBody(body1.address)
      ).to.be.revertedWithCustomError(attestor, "OwnableUnauthorizedAccount")
       .withArgs(nonBody.address);
    });
  });

  describe("Attestation", function () {
    beforeEach(async function () {
      await attestor.connect(owner).authorizeBody(body1.address);
    });

    it("Should allow an authorized body to attest a curriculum", async function () {
      const tx = await attestor.connect(body1).attest(curriculumId, durationInDays);
      const receipt = await tx.wait();
      const block = await hre.ethers.provider.getBlock(receipt.blockNumber);
      const expectedExpiry = block.timestamp + (durationInDays * 24 * 60 * 60);

      await expect(tx)
        .to.emit(attestor, "AccreditationAttested")
        .withArgs(curriculumId, body1.address, expectedExpiry);

      const acc = await attestor.accreditations(curriculumId);
      expect(acc.body).to.equal(body1.address);
      expect(acc.expiryDate).to.equal(expectedExpiry);
      expect(acc.isRevoked).to.be.false;
    });

    it("Should revert if an unauthorized account tries to attest", async function () {
      await expect(
        attestor.connect(nonBody).attest(curriculumId, durationInDays)
      ).to.be.revertedWith("Not an authorized accreditation body");
    });
  });
});
