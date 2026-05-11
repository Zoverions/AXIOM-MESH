const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("BootstrapIncentive", function () {
  let bincentive;
  let bint;
  let treasury;
  let owner;
  let initiator;
  let other;

  beforeEach(async function () {
    const signers = await ethers.getSigners();
    owner = signers[0];

    // Hardhat can impersonate the actual founder account for testing this requirement
    const founderAddress = "0x1c2cBabF75e1938ED2f2c59e734e83aa5FBe1B73";
    await hre.network.provider.request({ method: "hardhat_impersonateAccount", params: [founderAddress] });
    await owner.sendTransaction({ to: founderAddress, value: ethers.parseEther("100.0") });

    initiator = await ethers.getSigner(founderAddress);
    other = signers[2];

    // Deploy NetworkTreasury
    const NetworkTreasury = await ethers.getContractFactory("NetworkTreasury");
    treasury = await NetworkTreasury.deploy(owner.address);

    // Deploy BootstrapInitiatorNFT
    const BootstrapInitiatorNFT = await ethers.getContractFactory("BootstrapInitiatorNFT");
    bint = await BootstrapInitiatorNFT.deploy();

    // Deploy BootstrapIncentive
    const BootstrapIncentive = await ethers.getContractFactory("BootstrapIncentive");
    bincentive = await BootstrapIncentive.deploy(await bint.getAddress(), await treasury.getAddress());

    // Transfer ownership of NFT to BootstrapIncentive
    await bint.transferOwnership(await bincentive.getAddress());
  });

  it("should deploy correctly", async function () {
    expect(await bincentive.initiatorNFT()).to.equal(await bint.getAddress());
    expect(await bincentive.treasury()).to.equal(await treasury.getAddress());
    expect(await bincentive.isBootstrapped()).to.be.false;
  });

  it("should allow first person to bootstrap and receive NFT", async function () {
    const fundingAmount = ethers.parseEther("10.0");

    const treasuryAddress = await treasury.getAddress();
    const initialTreasuryBalance = await ethers.provider.getBalance(treasuryAddress);

    await expect(bincentive.connect(initiator).bootstrap({ value: fundingAmount }))
      .to.emit(bincentive, "Bootstrapped")
      .withArgs(initiator.address, fundingAmount);

    expect(await bincentive.initiator()).to.equal(initiator.address);
    expect(await bincentive.isBootstrapped()).to.be.true;
    expect(await bincentive.initialFundingAmount()).to.equal(fundingAmount);

    // Verify funds forwarded to treasury
    const finalTreasuryBalance = await ethers.provider.getBalance(treasuryAddress);
    expect(finalTreasuryBalance - initialTreasuryBalance).to.equal(fundingAmount);

    // Verify NFT minting
    expect(await bint.ownerOf(0)).to.equal(initiator.address);
    const data = await bint.initiatorData(0);
    expect(data.fundingAmount).to.equal(fundingAmount);
    expect(data.isRepaid).to.be.false;
  });

  it("should not allow second person to bootstrap", async function () {
    const fundingAmount = ethers.parseEther("1.0");
    await bincentive.connect(initiator).bootstrap({ value: fundingAmount });

    await expect(bincentive.connect(other).bootstrap({ value: fundingAmount }))
      .to.be.revertedWith("Network already bootstrapped");
  });

  it("should calculate correct repayment amount with interest", async function () {
    const fundingAmount = ethers.parseEther("100.0");
    await bincentive.connect(initiator).bootstrap({ value: fundingAmount });

    const interestRate = await bincentive.interestRateBps(); // 500 = 5%
    const expectedInterest = (fundingAmount * interestRate) / 10000n;
    const expectedTotal = fundingAmount + expectedInterest;

    expect(await bincentive.getRepaymentAmount()).to.equal(expectedTotal);
  });

  it("should allow initiator to claim repayment plus interest", async function () {
    const fundingAmount = ethers.parseEther("10.0");
    await bincentive.connect(initiator).bootstrap({ value: fundingAmount });

    const repaymentAmount = await bincentive.getRepaymentAmount();

    // Fund the bincentive contract for repayment (simulating profit/treasury allocation)
    await owner.sendTransaction({
      to: await bincentive.getAddress(),
      value: repaymentAmount
    });

    const initialInitiatorBalance = await ethers.provider.getBalance(initiator.address);

    const tx = await bincentive.connect(initiator).claimRepayment();
    const receipt = await tx.wait();
    const gasUsed = receipt.gasUsed * receipt.gasPrice;

    const finalInitiatorBalance = await ethers.provider.getBalance(initiator.address);

    // final = initial + repayment - gas
    expect(finalInitiatorBalance).to.equal(initialInitiatorBalance + repaymentAmount - gasUsed);

    // Verify status in NFT
    const data = await bint.initiatorData(0);
    expect(data.isRepaid).to.be.true;
  });

  it("should not allow non-initiator to claim repayment", async function () {
    const fundingAmount = ethers.parseEther("1.0");
    await bincentive.connect(initiator).bootstrap({ value: fundingAmount });

    await expect(bincentive.connect(other).claimRepayment())
      .to.be.revertedWith("Only initiator can claim");
  });

  it("should not allow double repayment", async function () {
    const fundingAmount = ethers.parseEther("1.0");
    await bincentive.connect(initiator).bootstrap({ value: fundingAmount });
    const repaymentAmount = await bincentive.getRepaymentAmount();

    await owner.sendTransaction({
      to: await bincentive.getAddress(),
      value: repaymentAmount * 2n
    });

    await bincentive.connect(initiator).claimRepayment();

    await expect(bincentive.connect(initiator).claimRepayment())
      .to.be.revertedWith("Already repaid");
  });

  it("should allow user to update their achievement metadata (privacy control)", async function () {
    const fundingAmount = ethers.parseEther("1.0");
    await bincentive.connect(initiator).bootstrap({ value: fundingAmount });

    const newURI = "ipfs://my-private-profile";
    await bint.connect(initiator).setMetadataURI(0, newURI);

    expect(await bint.tokenURI(0)).to.equal(newURI);
  });

  it("should not allow others to update user metadata", async function () {
    const fundingAmount = ethers.parseEther("1.0");
    await bincentive.connect(initiator).bootstrap({ value: fundingAmount });

    await expect(bint.connect(other).setMetadataURI(0, "ipfs://malicious"))
      .to.be.revertedWith("Only the owner can update metadata");
  });

  it("should allow owner to set reward value on the achievement NFT", async function () {
    const fundingAmount = ethers.parseEther("1.0");
    await bincentive.connect(initiator).bootstrap({ value: fundingAmount });

    const rewardValue = ethers.parseEther("500.0");
    await bincentive.connect(owner).setInitiatorRewardValue(rewardValue);

    const data = await bint.initiatorData(0);
    expect(data.rewardValue).to.equal(rewardValue);
  });

  it("should not allow non-owner to set reward value", async function () {
    const fundingAmount = ethers.parseEther("1.0");
    await bincentive.connect(initiator).bootstrap({ value: fundingAmount });

    await expect(bincentive.connect(other).setInitiatorRewardValue(100))
      .to.be.revertedWithCustomError(bincentive, "OwnableUnauthorizedAccount");
  });
});
