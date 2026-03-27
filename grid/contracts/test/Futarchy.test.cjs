const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("Futarchy", function () {
    let Futarchy, futarchy, Token, token, owner, addr1, addr2, addr3;
    let ONE_DAY = 24 * 60 * 60;

    beforeEach(async function () {
        [owner, addr1, addr2, addr3] = await ethers.getSigners();

        Token = await ethers.getContractFactory("MockERC20");
        token = await Token.deploy("Governance", "GOV", ethers.parseEther("10000"));

        Futarchy = await ethers.getContractFactory("Futarchy");
        futarchy = await Futarchy.deploy(await token.getAddress(), owner.address);

        await token.transfer(addr1.address, ethers.parseEther("1000"));
        await token.transfer(addr2.address, ethers.parseEther("1000"));
        await token.transfer(addr3.address, ethers.parseEther("1000"));

        await token.connect(addr1).approve(await futarchy.getAddress(), ethers.parseEther("1000"));
        await token.connect(addr2).approve(await futarchy.getAddress(), ethers.parseEther("1000"));
        await token.connect(addr3).approve(await futarchy.getAddress(), ethers.parseEther("1000"));
    });

    it("should create a proposal properly initialized", async function () {
        await futarchy.createProposal("Test Futarchy Proposal", ONE_DAY);
        const proposal = await futarchy.proposals(0);

        expect(proposal.id).to.equal(0);
        expect(proposal.description).to.equal("Test Futarchy Proposal");
        expect(proposal.passStake).to.equal(0);
        expect(proposal.failStake).to.equal(0);
        expect(proposal.executed).to.be.false;
        expect(proposal.passed).to.be.false;
    });

    it("should allow users to bet and update token pool for pass/fail", async function () {
        await futarchy.createProposal("Test Futarchy Proposal", ONE_DAY);

        // addr1 bets 100 on PASS
        await futarchy.connect(addr1).bet(0, true, ethers.parseEther("100"));

        // addr2 bets 50 on FAIL
        await futarchy.connect(addr2).bet(0, false, ethers.parseEther("50"));

        const proposal = await futarchy.proposals(0);
        expect(proposal.passStake).to.equal(ethers.parseEther("100"));
        expect(proposal.failStake).to.equal(ethers.parseEther("50"));

        const addr1PassStake = await futarchy.passStakes(0, addr1.address);
        expect(addr1PassStake).to.equal(ethers.parseEther("100"));

        const addr2FailStake = await futarchy.failStakes(0, addr2.address);
        expect(addr2FailStake).to.equal(ethers.parseEther("50"));
    });

    it("should resolve proposal and allow winning bettors to claim properly", async function () {
        await futarchy.createProposal("Test Futarchy Proposal", ONE_DAY);

        // addr1 bets 100 on PASS
        await futarchy.connect(addr1).bet(0, true, ethers.parseEther("100"));

        // addr2 bets 50 on FAIL
        await futarchy.connect(addr2).bet(0, false, ethers.parseEther("50"));

        // Fast forward time past deadline
        await time.increase(ONE_DAY + 1);

        // Resolve proposal
        await futarchy.resolveProposal(0);

        const proposal = await futarchy.proposals(0);
        expect(proposal.executed).to.be.true;
        expect(proposal.passed).to.be.true; // 100 > 50

        // addr1 should be able to claim 150 (their 100 + 50 from losing side)
        const initialBalance1 = await token.balanceOf(addr1.address);
        await futarchy.connect(addr1).claimWinnings(0);
        const finalBalance1 = await token.balanceOf(addr1.address);

        expect(finalBalance1 - initialBalance1).to.equal(ethers.parseEther("150"));

        // addr2 should not be able to claim (they lost)
        await expect(futarchy.connect(addr2).claimWinnings(0)).to.be.revertedWith("No winning stake");
    });

    it("should resolve correctly when failStake is greater", async function () {
        await futarchy.createProposal("Test Futarchy Proposal", ONE_DAY);

        // addr1 bets 100 on PASS
        await futarchy.connect(addr1).bet(0, true, ethers.parseEther("100"));

        // addr2 bets 200 on FAIL
        await futarchy.connect(addr2).bet(0, false, ethers.parseEther("200"));

        // Fast forward time past deadline
        await time.increase(ONE_DAY + 1);

        // Resolve proposal
        await futarchy.resolveProposal(0);

        const proposal = await futarchy.proposals(0);
        expect(proposal.executed).to.be.true;
        expect(proposal.passed).to.be.false; // 100 < 200

        // addr2 should be able to claim 300 (their 200 + 100 from losing side)
        const initialBalance2 = await token.balanceOf(addr2.address);
        await futarchy.connect(addr2).claimWinnings(0);
        const finalBalance2 = await token.balanceOf(addr2.address);

        expect(finalBalance2 - initialBalance2).to.equal(ethers.parseEther("300"));
    });
});
