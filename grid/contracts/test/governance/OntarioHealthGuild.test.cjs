const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("M10.5 End-to-end pilot: Ontario Health Guild migration demo", function () {
    let OntarioHealthGuild;
    let guild;
    let owner;
    let overseer;
    let addr1;
    let addr2;

    beforeEach(async function () {
        [owner, overseer, addr1, addr2] = await ethers.getSigners();

        OntarioHealthGuild = await ethers.getContractFactory("OntarioHealthGuild");
        guild = await OntarioHealthGuild.deploy(owner.address, overseer.address);
        await guild.waitForDeployment();
    });

    it("Should deploy and verify initial state", async function () {
        expect(await guild.owner()).to.equal(owner.address);
        expect(await guild.overseer()).to.equal(overseer.address);
        expect(await guild.isRevoked()).to.equal(false);
    });

    it("Should receive native funds", async function () {
        const amount = ethers.parseEther("1.0");
        await addr1.sendTransaction({
            to: await guild.getAddress(),
            value: amount,
        });

        expect(await ethers.provider.getBalance(await guild.getAddress())).to.equal(amount);
    });

    it("Should migrate funds successfully when active", async function () {
        const amount = ethers.parseEther("1.0");
        await addr1.sendTransaction({
            to: await guild.getAddress(),
            value: amount,
        });

        const initialBalance = await ethers.provider.getBalance(addr2.address);

        await guild.connect(owner).migrateFunds(ethers.ZeroAddress, addr2.address, amount);

        const finalBalance = await ethers.provider.getBalance(addr2.address);
        expect(finalBalance - initialBalance).to.equal(amount);
    });

    it("Should revoke access properly", async function () {
        await expect(guild.connect(overseer).revokeAccess())
            .to.emit(guild, "AccessRevoked")
            .withArgs(overseer.address);

        expect(await guild.isRevoked()).to.equal(true);
    });

    it("Should fail to migrate funds when revoked (fail-closed test)", async function () {
        const amount = ethers.parseEther("1.0");
        await addr1.sendTransaction({
            to: await guild.getAddress(),
            value: amount,
        });

        await guild.connect(overseer).revokeAccess();

        await expect(
            guild.connect(owner).migrateFunds(ethers.ZeroAddress, addr2.address, amount)
        ).to.be.revertedWith("OntarioHealthGuild: Access revoked (fail-closed)");
    });

    it("Should fail if non-overseer tries to revoke access", async function () {
        await expect(guild.connect(addr1).revokeAccess()).to.be.revertedWith(
            "OntarioHealthGuild: Unauthorized overseer"
        );
    });
});
