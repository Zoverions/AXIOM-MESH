const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ZoverionsDAO", function () {
    let DAO, dao, Token, token, MockOracle, oracle, owner, addr1, addr2;

    beforeEach(async function () {
        [owner, addr1, addr2] = await ethers.getSigners();

        Token = await ethers.getContractFactory("MockERC20");
        token = await Token.deploy("Governance", "GOV", ethers.parseEther("10000"));

        // Deploy a quick mock for WeightOracle
        const MockOracleFactory = await ethers.getContractFactory("MockWeightOracle");
        oracle = await MockOracleFactory.deploy();

        DAO = await ethers.getContractFactory("ZoverionsDAO");
        dao = await DAO.deploy(await token.getAddress(), await oracle.getAddress(), owner.address);

        await token.transfer(addr1.address, ethers.parseEther("1000"));
        await token.transfer(addr2.address, ethers.parseEther("1000"));

        await token.connect(addr1).approve(await dao.getAddress(), ethers.parseEther("1000"));
        await token.connect(addr2).approve(await dao.getAddress(), ethers.parseEther("1000"));
    });

    it("should allow voting with truth score multiplier", async function () {
        // Set mock truth score
        await oracle.setWeight(addr1.address, 5); // Truth score = 5

        await dao.createProposal("Test Proposal", false);

        // addr1 casts 10 votes (cost = 100 tokens)
        await dao.connect(addr1).vote(0, 10, true);

        const proposal = await dao.proposals(0);

        // effective votes = 10 (votesToCast) * 5 (truthScore) = 50
        expect(proposal.votesFor).to.equal(50);
    });

    it("should activate 0.5% channel-tax burn through a passed governance proposal", async function () {
        const FeeBurnChannel = await ethers.getContractFactory("MockFeeBurnChannel");
        const feeBurnChannel = await FeeBurnChannel.deploy();

        await oracle.setWeight(addr1.address, 3);
        await dao.createFeeBurnActivationProposal(50);
        await dao.connect(addr1).vote(0, 5, true);

        await dao.finalizeProposal(0);
        await dao.activateFeeBurn(0, await feeBurnChannel.getAddress());

        expect(await feeBurnChannel.feeBurnBpsOfTax()).to.equal(50);
    });

    it("should release locked voting tokens for failed proposals after unlock delay", async function () {
        await dao.setVotingTokenUnlockDelay(1);
        await oracle.setWeight(addr1.address, 2);

        await dao.createProposal("Fail me", false);
        await dao.connect(addr1).vote(0, 2, true); // cost 4
        await dao.connect(addr2).vote(0, 3, false); // cost 9 -> fails
        await dao.finalizeProposal(0);

        await ethers.provider.send("evm_increaseTime", [2]);
        await ethers.provider.send("evm_mine", []);

        const before = await token.balanceOf(addr1.address);
        await dao.connect(addr1).releaseLockedVotingTokens(0);
        const after = await token.balanceOf(addr1.address);
        expect(after - before).to.equal(ethers.parseEther("4"));
    });

    it("should burn locked voting tokens for passed proposals after unlock delay", async function () {
        const BurnableToken = await ethers.getContractFactory("BurnableMockERC20");
        const burnableToken = await BurnableToken.deploy("GovernanceBurn", "GBR", ethers.parseEther("10000"));
        const DAOFactory = await ethers.getContractFactory("ZoverionsDAO");
        const burnDao = await DAOFactory.deploy(await burnableToken.getAddress(), await oracle.getAddress(), owner.address);

        await burnableToken.transfer(addr1.address, ethers.parseEther("1000"));
        await burnableToken.connect(addr1).approve(await burnDao.getAddress(), ethers.parseEther("1000"));

        await burnDao.setVotingTokenUnlockDelay(1);
        await oracle.setWeight(addr1.address, 10);
        await burnDao.createProposal("Pass and burn", false);
        await burnDao.connect(addr1).vote(0, 4, true); // cost 16
        await burnDao.finalizeProposal(0);

        await ethers.provider.send("evm_increaseTime", [2]);
        await ethers.provider.send("evm_mine", []);

        const beforeSupply = await burnableToken.totalSupply();
        await burnDao.burnLockedVotingTokens(0, ethers.parseEther("16"));
        const afterSupply = await burnableToken.totalSupply();
        expect(beforeSupply - afterSupply).to.equal(ethers.parseEther("16"));
    });
});
