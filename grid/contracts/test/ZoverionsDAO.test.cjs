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
});
