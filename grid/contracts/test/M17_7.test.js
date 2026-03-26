import { expect } from "chai";
import hre from "hardhat";

describe("M17.7 Token Economics Update", function () {
    let deployer, founderEntity, networkTreasury, ecosystemReserve, user1, user2;
    let axmContract;

    beforeEach(async function () {
        const signers = await hre.ethers.getSigners();
        deployer = signers[0];
        founderEntity = signers[1];
        networkTreasury = signers[2];
        ecosystemReserve = signers[3];
        user1 = signers[4];
        user2 = signers[5];

        const AXM = await hre.ethers.getContractFactory("AXM", deployer);
        axmContract = await AXM.deploy(founderEntity.address, networkTreasury.address, ecosystemReserve.address);
    });

    it("should allow burning of AXM tokens (deflationary burn mechanism)", async function () {
        const amountToBurn = hre.ethers.parseEther("1000");
        await axmContract.connect(founderEntity).burn(amountToBurn);

        const newBalance = await axmContract.balanceOf(founderEntity.address);
        const expectedBalance = hre.ethers.parseEther("50000000") - amountToBurn; // 5% of 1B is 50M
        expect(newBalance).to.equal(expectedBalance);

        const newTotalSupply = await axmContract.totalSupply();
        expect(newTotalSupply).to.equal(hre.ethers.parseEther("1000000000") - amountToBurn);
    });
});

describe("Community Treasury & Ecosystem Fund", function () {
    let treasury;
    let owner, recipient;

    beforeEach(async function () {
        const signers = await hre.ethers.getSigners();
        owner = signers[0];
        recipient = signers[1];

        const CommunityTreasury = await hre.ethers.getContractFactory("CommunityTreasury", owner);
        treasury = await CommunityTreasury.deploy();
    });

    it("should allow ether allocation by owner", async function () {
        // Send eth to treasury
        await owner.sendTransaction({
            to: await treasury.getAddress(),
            value: hre.ethers.parseEther("10.0")
        });

        const initialBalance = await hre.ethers.provider.getBalance(recipient.address);
        await treasury.allocateEther(recipient.address, hre.ethers.parseEther("5.0"), "Grant");
        const finalBalance = await hre.ethers.provider.getBalance(recipient.address);

        expect(finalBalance - initialBalance).to.equal(hre.ethers.parseEther("5.0"));
    });
});

describe("Staking Rewards & Liquidity Mining", function () {
    let staking, token, owner, user1;

    beforeEach(async function () {
        const signers = await hre.ethers.getSigners();
        owner = signers[0];
        user1 = signers[1];

        const MockToken = await hre.ethers.getContractFactory("MockERC20");
        token = await MockToken.deploy("Test", "TST", hre.ethers.parseEther("1000000"));

        const StakingRewards = await hre.ethers.getContractFactory("StakingRewards");
        staking = await StakingRewards.deploy(await token.getAddress(), await token.getAddress());

        await token.transfer(await staking.getAddress(), hre.ethers.parseEther("10000"));
        await staking.notifyRewardAmount(hre.ethers.parseEther("1000"));

        await token.transfer(user1.address, hre.ethers.parseEther("1000"));
        await token.connect(user1).approve(await staking.getAddress(), hre.ethers.parseEther("1000"));
    });

    it("should allow staking and accumulating rewards", async function () {
        await staking.connect(user1).stake(hre.ethers.parseEther("100"));
        const initialEarned = await staking.earned(user1.address);
        expect(initialEarned).to.equal(0n);

        await hre.network.provider.send("evm_increaseTime", [3600]);
        await hre.network.provider.send("evm_mine");

        const earned = await staking.earned(user1.address);
        expect(earned).to.be.gt(0n);

        await staking.connect(user1).getReward();
        const balanceAfter = await token.balanceOf(user1.address);
        expect(balanceAfter).to.be.gt(hre.ethers.parseEther("900"));
    });
});

describe("4-year Linear Vesting for Team", function () {
    let vesting, token, owner, beneficiary;

    beforeEach(async function () {
        const signers = await hre.ethers.getSigners();
        owner = signers[0];
        beneficiary = signers[1];

        const MockToken = await hre.ethers.getContractFactory("MockERC20");
        token = await MockToken.deploy("Test", "TST", hre.ethers.parseEther("1000000"));

        const TeamVesting = await hre.ethers.getContractFactory("TeamVesting");

        const block = await hre.ethers.provider.getBlock("latest");
        const start = block.timestamp + 100;
        const duration = 4 * 365 * 24 * 60 * 60; // 4 years

        vesting = await TeamVesting.deploy(beneficiary.address, start, duration);
        await token.transfer(await vesting.getAddress(), hre.ethers.parseEther("1000"));
    });

    it("should linearly vest over 4 years", async function () {
        await hre.network.provider.send("evm_increaseTime", [100 + 2 * 365 * 24 * 60 * 60]); // Halfway
        await hre.network.provider.send("evm_mine");

        const releasable = await vesting["releasable(address)"](await token.getAddress());
        expect(releasable).to.be.closeTo(hre.ethers.parseEther("500"), hre.ethers.parseEther("1")); // Approx 500
    });
});
