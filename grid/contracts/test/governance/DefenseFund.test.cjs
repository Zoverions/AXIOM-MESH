const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("M10.7 Defense Fund (DoD)", function () {
    let DefenseFund;
    let fund;
    let owner;
    let techAddress;
    let unapprovedAddress;
    let addr1;

    beforeEach(async function () {
        [owner, techAddress, unapprovedAddress, addr1] = await ethers.getSigners();

        DefenseFund = await ethers.getContractFactory("DefenseFund");
        fund = await DefenseFund.deploy(owner.address);
        await fund.waitForDeployment();
    });

    it("Should successfully approve a defensive technology address", async function () {
        await expect(fund.approveTechnology(techAddress.address))
            .to.emit(fund, "TechnologyApproved")
            .withArgs(techAddress.address);

        expect(await fund.approvedDefensiveTechnologies(techAddress.address)).to.equal(true);
    });

    it("Should successfully allocate funds to an approved address", async function () {
        const amount = ethers.parseEther("1.0");

        await addr1.sendTransaction({
            to: await fund.getAddress(),
            value: amount,
        });

        await fund.approveTechnology(techAddress.address);

        const initialBalance = await ethers.provider.getBalance(techAddress.address);

        await expect(fund.allocateFunds(ethers.ZeroAddress, techAddress.address, amount))
            .to.emit(fund, "DefenseFundsAllocated")
            .withArgs(ethers.ZeroAddress, techAddress.address, amount);

        const finalBalance = await ethers.provider.getBalance(techAddress.address);
        expect(finalBalance - initialBalance).to.equal(amount);
    });

    it("Should revert when attempting to allocate funds to an unapproved address", async function () {
        const amount = ethers.parseEther("1.0");

        await expect(
            fund.allocateFunds(ethers.ZeroAddress, unapprovedAddress.address, amount)
        ).to.be.revertedWith("DefenseFund: Unapproved defensive technology");
    });

    it("Should revoke a previously approved technology", async function () {
        await fund.approveTechnology(techAddress.address);
        expect(await fund.approvedDefensiveTechnologies(techAddress.address)).to.equal(true);

        await expect(fund.revokeTechnology(techAddress.address))
            .to.emit(fund, "TechnologyRevoked")
            .withArgs(techAddress.address);

        expect(await fund.approvedDefensiveTechnologies(techAddress.address)).to.equal(false);
    });
});
