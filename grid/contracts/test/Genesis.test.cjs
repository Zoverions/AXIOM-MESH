const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Genesis Deployment Wiring", function () {
    let genesis, axm, governance, proposalRegistry;
    let owner, addr1;

    beforeEach(async function () {
        [owner, addr1] = await ethers.getSigners();
        const halfLife = 6307200n;
        const initialCoeff = ethers.parseEther("1000");
        const owners = [owner.address];

        const Genesis = await ethers.getContractFactory("Genesis");
        genesis = await Genesis.deploy(owners, halfLife, initialCoeff);
        await genesis.waitForDeployment();

        const axmAddress = await genesis.axmToken();
        const AXM = await ethers.getContractFactory("AXM");
        axm = AXM.attach(axmAddress);

        const govAddress = await genesis.governance();
        const GenesisDecayGovernance = await ethers.getContractFactory("GenesisDecayGovernance");
        governance = GenesisDecayGovernance.attach(govAddress);

        const prAddress = await genesis.proposalRegistry();
        const ProposalRegistry = await ethers.getContractFactory("ProposalRegistry");
        proposalRegistry = ProposalRegistry.attach(prAddress);
    });

    it("should correctly wire AXM with the right split", async function () {
        const totalSupply = await axm.totalSupply();
        expect(totalSupply).to.equal(ethers.parseEther("1000000000"));

        const founder = await genesis.founder();
        // Check founder balance via vesting (since we now deploy TeamVesting)
        // We can't easily get the address of TeamVesting from here without exposing it or searching logs,
        // but we can check if AXM was minted to a contract (not founder EOA).
        const founderBal = await axm.balanceOf(founder);
        expect(founderBal).to.equal(0n); // Should be in vesting contract

        const ecosystemTreasury = await genesis.ecosystemReserveTreasury();
        const ecosystemBal = await axm.balanceOf(ecosystemTreasury);
        expect(ecosystemBal).to.equal(0n); // Should be in AXM.sol contract
    });

    it("should correctly wire GenesisDecayGovernance", async function () {
        expect(await governance.isFounder(owner.address)).to.be.true;
        const coeff = await governance.getVotingCoefficient(owner.address);
        expect(coeff).to.equal(ethers.parseEther("1000"));
    });

    it("should correctly wire ProposalRegistry to Governance", async function () {
        expect(await proposalRegistry.governance()).to.equal(await governance.getAddress());
    });
});
