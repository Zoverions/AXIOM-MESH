const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("FoundersCouncil", function () {
    let reputationToken;
    let govTransition;
    let foundersCouncil;
    let founder, candidate1, candidate2, aiAgent1, aiAgent2;

    beforeEach(async function () {
        [founder, candidate1, candidate2, aiAgent1, aiAgent2] = await ethers.getSigners();

        // Deploy SoulboundReputation
        const Reputation = await ethers.getContractFactory("SoulboundReputation");
        reputationToken = await Reputation.deploy();

        // Deploy GovernanceTransition
        const GovTransition = await ethers.getContractFactory("GovernanceTransition");
        govTransition = await GovTransition.deploy(founder.address);

        // Deploy FoundersCouncil
        const FoundersCouncil = await ethers.getContractFactory("FoundersCouncil");
        foundersCouncil = await FoundersCouncil.deploy(founder.address, reputationToken.target, govTransition.target);

        // Update Reputations for testing (using Enum indices: 0 = Expertise, 1 = Governance)
        // Note: updateReputation is assumed to be accessible in this mock setup
        // Actually, SoulboundReputation has onlyVerifiedActivity modifier.
        // For testing, we might need a mock or assume it is open if the modifier is empty.
        // Looking at SoulboundReputation.sol, onlyVerifiedActivity has `_;` with no logic, so it's open.
        await reputationToken.updateReputation(candidate1.address, 0, "Economics", 850);
        await reputationToken.updateReputation(candidate2.address, 0, "Economics", 950);
    });

    it("Should allow founder to create roles", async function () {
        await expect(foundersCouncil.createRole("Economics", 0))
            .to.emit(foundersCouncil, "RoleCreated")
            .withArgs(0, "Economics", 0);

        const role = await foundersCouncil.roles(0);
        expect(role.name).to.equal("Economics");
        expect(role.requiredReputationType).to.equal(0);
    });

    it("Should assign humans and AI agents to roles and mint NFTs", async function () {
        await foundersCouncil.createRole("Security", 1);

        await expect(foundersCouncil.assignRole(0, candidate1.address, aiAgent1.address))
            .to.emit(foundersCouncil, "MemberAssigned")
            .withArgs(0, candidate1.address, aiAgent1.address);

        const role = await foundersCouncil.roles(0);
        expect(role.humanMember).to.equal(candidate1.address);
        expect(role.aiAgent).to.equal(aiAgent1.address);

        // Check NFT balances
        expect(await foundersCouncil.balanceOf(candidate1.address)).to.equal(1);
        expect(await foundersCouncil.balanceOf(aiAgent1.address)).to.equal(1);

        // Check token role mapping
        expect(await foundersCouncil.tokenToRole(0)).to.equal(0);
    });

    it("Should provide recommendations based on reputation scores", async function () {
        await foundersCouncil.createRole("Economics", 0);

        const candidates = [candidate1.address, candidate2.address];
        const [bestCandidate, highestScore] = await foundersCouncil.getRecommendationForRole(0, candidates);

        expect(bestCandidate).to.equal(candidate2.address);
        expect(highestScore).to.equal(950);
    });

    it("Should prevent transferring Council NFTs", async function () {
        await foundersCouncil.createRole("Education", 2);
        await foundersCouncil.assignRole(0, candidate1.address, aiAgent1.address);

        await expect(
            foundersCouncil.connect(candidate1).transferFrom(candidate1.address, candidate2.address, 0)
        ).to.be.revertedWith("FoundersCouncil: Council NFTs are non-transferable");
    });
});
