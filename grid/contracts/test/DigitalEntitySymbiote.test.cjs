const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Digital Entity + Symbiote Connection + Educational Node", function () {
    let registry, poerVerifier, educationalNode;
    let owner, user1, user2;

    beforeEach(async function () {
        [owner, user1, user2] = await ethers.getSigners();

        const PoERVerifier = await ethers.getContractFactory("CognitiveFrictionVerifier");
        poerVerifier = await PoERVerifier.deploy();

        const Registry = await ethers.getContractFactory("DigitalEntityRegistry");
        registry = await Registry.deploy();

        const EducationalNode = await ethers.getContractFactory("EducationalNode");
        educationalNode = await EducationalNode.deploy(registry.target || registry.address, poerVerifier.target || poerVerifier.address);

        // transfer ownership of poerVerifier to EducationalNode so it can update PoER scores
        await poerVerifier.transferOwnership(educationalNode.target || educationalNode.address);
    });

    it("should register a digital entity", async function () {
        await registry.connect(user1).registerEntity();
        const entity = await registry.entities(user1.address);
        expect(entity.exists).to.be.true;
        expect(entity.userWallet).to.equal(user1.address);
    });

    it("should allow educational node to record a session and boost PoER", async function () {
        await registry.connect(user1).registerEntity();

        // only owner of EducationalNode can record sessions. Here owner is 'owner'
        await educationalNode.connect(owner).recordLearningSession(user1.address, "Blockchain 101", 100);

        const score = await poerVerifier.poerScores(user1.address);
        expect(score).to.equal(100);

        const sessionCount = await educationalNode.getSessionsCount(user1.address);
        expect(sessionCount).to.equal(1);
    });

    it("should fail to record session if Symbiote has no digital entity", async function () {
        await expect(
            educationalNode.connect(owner).recordLearningSession(user1.address, "Hacking 101", 100)
        ).to.be.revertedWith("Symbiote must have a digital entity");
    });
});
