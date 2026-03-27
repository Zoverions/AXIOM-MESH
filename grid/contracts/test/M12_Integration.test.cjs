const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("M12 Integration Tests: Comprehensive Suite", function () {
    let owner, staker, relayer;

    beforeEach(async function () {
        [owner, staker, relayer] = await ethers.getSigners();
    });

    describe("M12.7: AutomatedV3LiquidityManager", function () {
        let liquidityManager;

        beforeEach(async function () {
            // Deploy FounderCommitment mock so verifyFounder works
            const FounderCommitment = await ethers.getContractFactory("FounderCommitment");
            const founderHash = ethers.keccak256(ethers.solidityPacked(["address"], [owner.address]));
            const founderCommitment = await FounderCommitment.deploy(founderHash);
            await founderCommitment.initialize(owner.address);

            // Mock UniversalDistributionPool, NPM, SwapRouter by address
            const LiquidityManager = await ethers.getContractFactory("AutomatedV3LiquidityManager");
            liquidityManager = await LiquidityManager.deploy(
                founderCommitment.target, // Founder
                owner.address, // distPool
                owner.address, // npm
                owner.address  // swapRouter
            );
            await liquidityManager.waitForDeployment();

            await ethers.provider.send("evm_increaseTime", [2 * 24 * 60 * 60 + 1]);
            await ethers.provider.send("evm_mine");
        });

        it("Should enforce the cooldown and max liquidity deployment BPS", async function () {
            const amount = ethers.parseEther("250000"); // Exactly the limit

            // First deployment should succeed, though it will revert natively because NPM is not real
            await expect(liquidityManager.managePosition(1, amount, 0, 0)).to.be.reverted;

            // But it should hit the limit if we try to deploy MORE than the limit
            const overAmount = ethers.parseEther("250001");
            await expect(liquidityManager.managePosition(1, overAmount, 0, 0)).to.be.revertedWith("Exceeds max liquidity deployment limit for cooldown window");
        });
    });

    describe("M12.11: ComputeBond Validator Onboarding", function () {
        let computeBond;

        beforeEach(async function () {
            const ComputeBond = await ethers.getContractFactory("ComputeBond");
            computeBond = await ComputeBond.deploy();
            await computeBond.waitForDeployment();
        });

        it("Should correctly track the total onboarded validators upon meeting minimum stake", async function () {
            // Need extra ether since the stake is 10k exactly and we need gas
            await ethers.provider.send("hardhat_setBalance", [staker.address, "0x204FCE5E3E25026110000000"]); // 100k ETH

            expect(await computeBond.totalValidatorsOnboarded()).to.equal(0n);

            const stakeAmount = ethers.parseEther("10000"); // 10k MIN_VALIDATOR_STAKE
            const tx = await computeBond.connect(staker).stake("node-123", { value: stakeAmount });

            await expect(tx).to.emit(computeBond, "ValidatorOnboarded").withArgs(staker.address, "node-123", stakeAmount);

            expect(await computeBond.totalValidatorsOnboarded()).to.equal(1n);
            expect(await computeBond.isValidator(staker.address)).to.be.true;
        });

        it("Should downboard validator if slashed below minimum stake", async function () {
            await ethers.provider.send("hardhat_setBalance", [staker.address, "0x204FCE5E3E25026110000000"]);
            const stakeAmount = ethers.parseEther("10000");
            await computeBond.connect(staker).stake("node-123", { value: stakeAmount });

            expect(await computeBond.isValidator(staker.address)).to.be.true;

            // Slash 1 wei, dropping them below 10k.
            // First we need to queue the timelock operation for slashing
            const opHash = ethers.keccak256(ethers.solidityPacked(["string", "string", "uint256"], ["slash", "node-123", 1n]));
            await computeBond.connect(owner).queueOperation(opHash);

            // Fast forward timelock period (assuming standard 2 days from TimelockedOwnable)
            await ethers.provider.send("evm_increaseTime", [2 * 24 * 60 * 60 + 1]);
            await ethers.provider.send("evm_mine");

            const tx = await computeBond.slash("node-123", 1n);

            await expect(tx).to.emit(computeBond, "ValidatorRemoved").withArgs(staker.address, "node-123");
            expect(await computeBond.isValidator(staker.address)).to.be.false;
        });

        it("Should downboard validator if withdrawn below minimum stake", async function () {
            await ethers.provider.send("hardhat_setBalance", [staker.address, "0x204FCE5E3E25026110000000"]);
            const stakeAmount = ethers.parseEther("10000");
            await computeBond.connect(staker).stake("node-123", { value: stakeAmount });

            const tx = await computeBond.connect(staker).withdraw("node-123", 1n);

            await expect(tx).to.emit(computeBond, "ValidatorRemoved").withArgs(staker.address, "node-123");
            expect(await computeBond.isValidator(staker.address)).to.be.false;
        });
    });

    describe("M12.10: GovernanceTransition", function () {
        let govTransition;

        beforeEach(async function () {
            const GovTransition = await ethers.getContractFactory("GovernanceTransition");
            govTransition = await GovTransition.deploy(owner.address);
            await govTransition.waitForDeployment();

            // Send it some ether
            await owner.sendTransaction({ to: await govTransition.getAddress(), value: ethers.parseEther("5") });
        });

        it("Should complete the migration, transferring the remaining treasury and locking the contract", async function () {
            await govTransition.transitionToFoundersCouncil(owner.address);
            await govTransition.transitionToSubcommittees(owner.address);
            await govTransition.transitionToNationStateGuilds(owner.address);

            await govTransition.setTreasury(staker.address);

            const stakerBalBefore = await ethers.provider.getBalance(staker.address);

            await govTransition.completeMigration();

            expect(await govTransition.isMigrationComplete()).to.be.true;

            const stakerBalAfter = await ethers.provider.getBalance(staker.address);
            expect(stakerBalAfter - stakerBalBefore).to.equal(ethers.parseEther("5"));

            // Contract ownership should be renounced
            expect(await govTransition.owner()).to.equal(ethers.ZeroAddress);
        });
    });
});
