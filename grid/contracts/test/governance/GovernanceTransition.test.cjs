const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("M10.6 Governance Transition", function () {
    let GovernanceTransition;
    let transitionContract;
    let founder;
    let foundersCouncil;
    let subcommittees;
    let nationStateGuilds;
    let otherAddress;

    beforeEach(async function () {
        [founder, foundersCouncil, subcommittees, nationStateGuilds, otherAddress] = await ethers.getSigners();

        GovernanceTransition = await ethers.getContractFactory("GovernanceTransition");
        transitionContract = await GovernanceTransition.deploy(founder.address);
        await transitionContract.waitForDeployment();
    });

    it("Should initialize in FounderControl phase", async function () {
        expect(await transitionContract.currentPhase()).to.equal(0); // FounderControl
        expect(await transitionContract.activeController()).to.equal(founder.address);
    });

    it("Should allow transition to FoundersCouncil by founder", async function () {
        await expect(transitionContract.connect(founder).transitionToFoundersCouncil(foundersCouncil.address))
            .to.emit(transitionContract, "PhaseTransition")
            .withArgs(0, 1, foundersCouncil.address);

        expect(await transitionContract.currentPhase()).to.equal(1); // FoundersCouncil
        expect(await transitionContract.activeController()).to.equal(foundersCouncil.address);
    });

    it("Should revert if non-authorized entity attempts a transition", async function () {
        await expect(
            transitionContract.connect(otherAddress).transitionToFoundersCouncil(foundersCouncil.address)
        ).to.be.revertedWith("GovernanceTransition: Unauthorized controller");
    });

    it("Should transition through all phases sequentially", async function () {
        // Founder to FoundersCouncil
        await transitionContract.connect(founder).transitionToFoundersCouncil(foundersCouncil.address);
        expect(await transitionContract.currentPhase()).to.equal(1);

        // FoundersCouncil to Subcommittees
        await transitionContract.connect(foundersCouncil).transitionToSubcommittees(subcommittees.address);
        expect(await transitionContract.currentPhase()).to.equal(2);

        // Subcommittees to NationStateGuilds
        await transitionContract.connect(subcommittees).transitionToNationStateGuilds(nationStateGuilds.address);
        expect(await transitionContract.currentPhase()).to.equal(3);
    });

    it("Should revert if skipping phases", async function () {
        await expect(
            transitionContract.connect(founder).transitionToSubcommittees(subcommittees.address)
        ).to.be.revertedWith("GovernanceTransition: Invalid phase transition");

        await expect(
            transitionContract.connect(founder).transitionToNationStateGuilds(nationStateGuilds.address)
        ).to.be.revertedWith("GovernanceTransition: Invalid phase transition");
    });
});
