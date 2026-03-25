const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("M10.8 Scarcity-as-a-Service", function () {
    let ScarcityAsAService;
    let service;
    let owner;
    let user;
    let otherAddress;

    const DAY = 24 * 60 * 60;

    beforeEach(async function () {
        [owner, user, otherAddress] = await ethers.getSigners();

        ScarcityAsAService = await ethers.getContractFactory("ScarcityAsAService");
        service = await ScarcityAsAService.deploy(owner.address);
        await service.waitForDeployment();
    });

    it("Should allow a user to successfully opt in", async function () {
        const duration = 7 * DAY; // 7 days

        await expect(service.connect(user).optIn(duration))
            .to.emit(service, "OptedIn")
            .withArgs(user.address, duration);

        const uContract = await service.userContracts(user.address);
        expect(uContract.isActive).to.equal(true);
        expect(uContract.maxDuration).to.equal(duration);
    });

    it("Should successfully execute an experience when active and within time limits", async function () {
        const duration = 7 * DAY;
        await service.connect(user).optIn(duration);

        await expect(service.connect(owner).executeExperience(user.address, "kidnapping_scenario_1"))
            .to.emit(service, "ExperienceExecuted")
            .withArgs(user.address, "kidnapping_scenario_1");
    });

    it("Should allow a user to instantly revoke consent via safe-exit", async function () {
        const duration = 7 * DAY;
        await service.connect(user).optIn(duration);

        await expect(service.connect(user).revokeConsent())
            .to.emit(service, "ConsentRevoked")
            .withArgs(user.address);

        const uContract = await service.userContracts(user.address);
        expect(uContract.isActive).to.equal(false);
    });

    it("Should revert executeExperience after consent is revoked", async function () {
        const duration = 7 * DAY;
        await service.connect(user).optIn(duration);

        await service.connect(user).revokeConsent();

        await expect(
            service.connect(owner).executeExperience(user.address, "scenario_2")
        ).to.be.revertedWith("ScarcityAsAService: Consent is not active");
    });

    it("Should revert executeExperience after max duration has expired", async function () {
        const duration = 7 * DAY;
        await service.connect(user).optIn(duration);

        // Fast-forward time past the max duration
        await time.increase(duration + 100);

        await expect(
            service.connect(owner).executeExperience(user.address, "scenario_3")
        ).to.be.revertedWith("ScarcityAsAService: Experience duration expired");
    });

    it("Should successfully perform system fail-safe cleanup after expiration", async function () {
        const duration = 7 * DAY;
        await service.connect(user).optIn(duration);

        await time.increase(duration + 100);

        await expect(service.connect(owner).systemFailSafe(user.address))
            .to.emit(service, "ConsentRevoked")
            .withArgs(user.address);

        const uContract = await service.userContracts(user.address);
        expect(uContract.isActive).to.equal(false);
    });

    it("Should revert if user tries to opt in with duration longer than global maximum", async function () {
        const maxDuration = await service.globalMaxDuration();
        const duration = maxDuration + 100n; // Use BigInt explicitly

        await expect(service.connect(user).optIn(duration)).to.be.revertedWith(
            "ScarcityAsAService: Invalid duration"
        );
    });
});
