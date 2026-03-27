import { expect } from "chai";
import hre from "hardhat";

describe("M17.8 Revenue Model Expansion", function () {
    let deployer, user1, user2;
    let paymentToken, revenueModel;

    beforeEach(async function () {
        const signers = await hre.ethers.getSigners();
        deployer = signers[0];
        user1 = signers[1];
        user2 = signers[2];

        const MockToken = await hre.ethers.getContractFactory("MockERC20");
        paymentToken = await MockToken.deploy("PaymentToken", "PAY", hre.ethers.parseEther("1000000"));

        const RevenueModel = await hre.ethers.getContractFactory("RevenueModel");
        revenueModel = await RevenueModel.deploy(await paymentToken.getAddress());

        await paymentToken.transfer(user1.address, hre.ethers.parseEther("10000"));
        await paymentToken.transfer(user2.address, hre.ethers.parseEther("10000"));
    });

    it("should allow upgrading to Developer API tier", async function () {
        await paymentToken.connect(user1).approve(await revenueModel.getAddress(), hre.ethers.parseEther("100"));
        await revenueModel.connect(user1).upgradeTier(1); // Developer Tier
        expect(await revenueModel.userTiers(user1.address)).to.equal(1n);
    });

    it("should allow purchasing premium sandbox", async function () {
        await paymentToken.connect(user1).approve(await revenueModel.getAddress(), hre.ethers.parseEther("500"));
        await revenueModel.connect(user1).purchasePremiumSandbox();
        expect(await revenueModel.premiumSandboxes(user1.address)).to.equal(true);
    });

    it("should allow paying governance delegation fees", async function () {
        await revenueModel.connect(user2).setDelegationFee(hre.ethers.parseEther("50"));
        await paymentToken.connect(user1).approve(await revenueModel.getAddress(), hre.ethers.parseEther("50"));
        await revenueModel.connect(user1).payDelegationFee(user2.address);
        expect(await paymentToken.balanceOf(user2.address)).to.equal(hre.ethers.parseEther("10050"));
    });

    it("should allow paying cross-chain bridge fees", async function () {
        await paymentToken.connect(user1).approve(await revenueModel.getAddress(), hre.ethers.parseEther("10"));
        await revenueModel.connect(user1).payBridgeFee();
        expect(await paymentToken.balanceOf(await revenueModel.getAddress())).to.equal(hre.ethers.parseEther("10"));
    });

    it("should allow buying datasets from the anonymized network data marketplace", async function () {
        await revenueModel.connect(user2).listDataset("Network Data", hre.ethers.parseEther("200"));
        await paymentToken.connect(user1).approve(await revenueModel.getAddress(), hre.ethers.parseEther("200"));
        await revenueModel.connect(user1).purchaseDataset(1);
        expect(await paymentToken.balanceOf(user2.address)).to.equal(hre.ethers.parseEther("10200"));
    });

    it("should allow owner to withdraw accumulated fees", async function () {
        await paymentToken.connect(user1).approve(await revenueModel.getAddress(), hre.ethers.parseEther("500"));
        await revenueModel.connect(user1).purchasePremiumSandbox();

        await revenueModel.connect(deployer).withdrawFees(user2.address, hre.ethers.parseEther("500"));
        expect(await paymentToken.balanceOf(user2.address)).to.equal(hre.ethers.parseEther("10500"));
    });
});
