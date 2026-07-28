const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("CredentialedSubmission", function () {
  let submissionContract;
  let owner;
  let authorizedUser;
  let unauthorizedUser;

  beforeEach(async function () {
    [owner, authorizedUser, unauthorizedUser] = await ethers.getSigners();

    // Deploy without an external oracle for now (zero address)
    const CredentialedSubmission = await ethers.getContractFactory("CredentialedSubmission");
    submissionContract = await CredentialedSubmission.deploy(ethers.ZeroAddress);
  });

  it("should initialize with no submissions", async function () {
    expect(await submissionContract.getSubmissionsCount()).to.equal(0);
  });

  it("should not allow unauthorized user to submit", async function () {
    await expect(
      submissionContract.connect(unauthorizedUser).submitResource("Physics", "QmHash123")
    ).to.be.revertedWith("Not authorized to submit for this topic");
  });

  it("should allow owner to whitelist a user", async function () {
    await expect(submissionContract.updateWhitelist(authorizedUser.address, "Physics", true))
      .to.emit(submissionContract, "WhitelistUpdated")
      .withArgs(authorizedUser.address, "Physics", true);

    expect(await submissionContract.canSubmit(authorizedUser.address, "Physics")).to.be.true;
  });

  it("should allow a whitelisted user to submit a resource", async function () {
    await submissionContract.updateWhitelist(authorizedUser.address, "Physics", true);

    await expect(submissionContract.connect(authorizedUser).submitResource("Physics", "QmHash123"))
      .to.emit(submissionContract, "ResourceSubmitted")
      .withArgs(authorizedUser.address, "Physics", "QmHash123", 0);

    const count = await submissionContract.getSubmissionsCount();
    expect(count).to.equal(1);

    const sub = await submissionContract.submissions(0);
    expect(sub.topic).to.equal("Physics");
    expect(sub.cid).to.equal("QmHash123");
    expect(sub.author).to.equal(authorizedUser.address);
    expect(sub.approved).to.be.false;
  });

  it("should allow owner to approve a submission", async function () {
    await submissionContract.updateWhitelist(authorizedUser.address, "Physics", true);
    await submissionContract.connect(authorizedUser).submitResource("Physics", "QmHash123");

    await expect(submissionContract.approveSubmission(0))
      .to.emit(submissionContract, "ResourceApproved")
      .withArgs(0, owner.address);

    const sub = await submissionContract.submissions(0);
    expect(sub.approved).to.be.true;
  });
});
