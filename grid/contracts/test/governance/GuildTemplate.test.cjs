const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("GuildTemplate", function () {
    let owner;
    let otherAccount;
    let parentGuild;
    let childGuild;

    beforeEach(async function () {
        [owner, otherAccount] = await ethers.getSigners();

        const GuildTemplate = await ethers.getContractFactory("GuildTemplate");

        // Deploy parent guild
        parentGuild = await GuildTemplate.deploy(owner.address, ethers.ZeroAddress);
        await parentGuild.waitForDeployment();

        // Deploy child guild, pointing to parent
        childGuild = await GuildTemplate.deploy(owner.address, await parentGuild.getAddress());
        await childGuild.waitForDeployment();
    });

    it("Should set and get local policy", async function () {
        const policyKey = ethers.id("TAX_RATE");
        await childGuild.setPolicy(policyKey, 15);

        const val = await childGuild.getPolicy(policyKey);
        expect(val).to.equal(15n);
    });

    it("Should inherit policy from parent if not set locally", async function () {
        const policyKey = ethers.id("TAX_RATE");
        await parentGuild.setPolicy(policyKey, 20);

        // Child hasn't set TAX_RATE locally, should return 20 from parent
        const val = await childGuild.getPolicy(policyKey);
        expect(val).to.equal(20n);
    });

    it("Should override parent policy if set locally", async function () {
        const policyKey = ethers.id("TAX_RATE");
        await parentGuild.setPolicy(policyKey, 20);
        await childGuild.setPolicy(policyKey, 10);

        // Child's local policy (10) should take precedence over parent's (20)
        const val = await childGuild.getPolicy(policyKey);
        expect(val).to.equal(10n);
    });

    it("Should return 0 if neither local nor parent policy is set", async function () {
        const policyKey = ethers.id("UNKNOWN_POLICY");

        const val = await childGuild.getPolicy(policyKey);
        expect(val).to.equal(0n);
    });

    it("Should revert if non-owner tries to set policy", async function () {
        const policyKey = ethers.id("TAX_RATE");
        await expect(
            childGuild.connect(otherAccount).setPolicy(policyKey, 10)
        ).to.be.revertedWithCustomError(childGuild, "OwnableUnauthorizedAccount")
          .withArgs(otherAccount.address);
    });

    it("Should allow owner to update parent guild", async function () {
        const newParent = await (await ethers.getContractFactory("GuildTemplate")).deploy(owner.address, ethers.ZeroAddress);
        await newParent.waitForDeployment();

        const policyKey = ethers.id("VOTING_PERIOD");
        await newParent.setPolicy(policyKey, 7);

        await childGuild.setParentGuild(await newParent.getAddress());
        expect(await childGuild.parentGuild()).to.equal(await newParent.getAddress());

        // Should now inherit from new parent
        expect(await childGuild.getPolicy(policyKey)).to.equal(7n);
    });
});
