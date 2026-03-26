const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("BugBounty Contract", function () {
    let BugBounty;
    let bugBounty;
    let rewardToken;
    let admin, securityCouncil, reporter, other;

    const INITIAL_SUPPLY = ethers.parseUnits("1000000", 18);
    const BOUNTY_AMOUNT = ethers.parseUnits("5000", 18);

    beforeEach(async function () {
        [admin, securityCouncil, reporter, other] = await ethers.getSigners();

        // Deploy a mock ERC20 for rewards
        const MockERC20 = await ethers.getContractFactory("MockERC20");
        rewardToken = await MockERC20.deploy("Reward Token", "RWD", INITIAL_SUPPLY);

        // Deploy the BugBounty contract
        BugBounty = await ethers.getContractFactory("BugBounty");
        bugBounty = await BugBounty.deploy(rewardToken.target, admin.address, securityCouncil.address);

        // Transfer funds to BugBounty contract
        await rewardToken.transfer(bugBounty.target, ethers.parseUnits("100000", 18));
    });

    it("should initialize with correct roles and token", async function () {
        expect(await bugBounty.rewardToken()).to.equal(rewardToken.target);

        const ADMIN_ROLE = await bugBounty.ADMIN_ROLE();
        const SECURITY_COUNCIL_ROLE = await bugBounty.SECURITY_COUNCIL_ROLE();

        expect(await bugBounty.hasRole(ADMIN_ROLE, admin.address)).to.be.true;
        expect(await bugBounty.hasRole(SECURITY_COUNCIL_ROLE, securityCouncil.address)).to.be.true;
    });

    it("should allow a user to submit a bug report", async function () {
        const referenceUrl = "ipfs://QmSomeHash";
        await expect(bugBounty.connect(reporter).submitReport(referenceUrl))
            .to.emit(bugBounty, "ReportSubmitted")
            .withArgs(0, reporter.address, referenceUrl);

        const report = await bugBounty.bugReports(0);
        expect(report.reporter).to.equal(reporter.address);
        expect(report.referenceUrl).to.equal(referenceUrl);
        expect(report.severity).to.equal(0); // None
        expect(report.isResolved).to.be.false;
        expect(report.isPaid).to.be.false;
    });

    it("should allow security council to resolve a report", async function () {
        await bugBounty.connect(reporter).submitReport("ipfs://hash");

        await expect(bugBounty.connect(securityCouncil).resolveReport(0, 3)) // High
            .to.emit(bugBounty, "ReportResolved")
            .withArgs(0, 3);

        const report = await bugBounty.bugReports(0);
        expect(report.severity).to.equal(3);
        expect(report.isResolved).to.be.true;
    });

    it("should fail if non-security council tries to resolve", async function () {
        await bugBounty.connect(reporter).submitReport("ipfs://hash");
        const SECURITY_COUNCIL_ROLE = await bugBounty.SECURITY_COUNCIL_ROLE();

        await expect(
            bugBounty.connect(other).resolveReport(0, 3)
        ).to.be.revertedWithCustomError(bugBounty, "AccessControlUnauthorizedAccount");
    });

    it("should allow security council to pay out a bounty", async function () {
        await bugBounty.connect(reporter).submitReport("ipfs://hash");
        await bugBounty.connect(securityCouncil).resolveReport(0, 4); // Critical

        await expect(bugBounty.connect(securityCouncil).payBounty(0, BOUNTY_AMOUNT))
            .to.emit(bugBounty, "BountyPaid")
            .withArgs(0, reporter.address, BOUNTY_AMOUNT);

        const report = await bugBounty.bugReports(0);
        expect(report.isPaid).to.be.true;
        expect(report.payoutAmount).to.equal(BOUNTY_AMOUNT);

        const reporterBalance = await rewardToken.balanceOf(reporter.address);
        expect(reporterBalance).to.equal(BOUNTY_AMOUNT);
    });

    it("should not allow payout for unresolved or zero severity reports", async function () {
        await bugBounty.connect(reporter).submitReport("ipfs://hash");

        await expect(
            bugBounty.connect(securityCouncil).payBounty(0, BOUNTY_AMOUNT)
        ).to.be.revertedWith("Report must be resolved first");

        await bugBounty.connect(securityCouncil).resolveReport(0, 0); // None

        await expect(
            bugBounty.connect(securityCouncil).payBounty(0, BOUNTY_AMOUNT)
        ).to.be.revertedWith("Invalid severity for payout");
    });

    it("should handle pause and unpause by admin", async function () {
        await bugBounty.connect(admin).pause();
        await expect(bugBounty.connect(reporter).submitReport("ipfs://hash"))
            .to.be.revertedWithCustomError(bugBounty, "EnforcedPause");

        await bugBounty.connect(admin).unpause();
        await expect(bugBounty.connect(reporter).submitReport("ipfs://hash"))
            .to.emit(bugBounty, "ReportSubmitted");
    });

    it("should allow admin to withdraw unused funds", async function () {
        const initialAdminBalance = await rewardToken.balanceOf(admin.address);
        const contractBalance = await rewardToken.balanceOf(bugBounty.target);

        await bugBounty.connect(admin).emergencyWithdraw(contractBalance, admin.address);

        const finalAdminBalance = await rewardToken.balanceOf(admin.address);
        expect(finalAdminBalance).to.equal(initialAdminBalance + contractBalance);
    });
});
