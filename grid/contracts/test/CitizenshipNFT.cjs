const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("CitizenshipNFT", function () {
    let ComputeBondMock, computeBond;
    let CitizenshipNFT, citizenshipNFT;
    let owner, addr1, addr2;

    beforeEach(async function () {
        [owner, addr1, addr2] = await ethers.getSigners();

        // Deploy Mock ComputeBond
        const MockBond = await ethers.getContractFactory("ComputeBond");
        computeBond = await MockBond.deploy();

        // Deploy CitizenshipNFT
        const CNFT = await ethers.getContractFactory("CitizenshipNFT");
        citizenshipNFT = await CNFT.deploy();
        await citizenshipNFT.setComputeBondAddress(await computeBond.getAddress());
    });

    it("Should mint citizenship if ComputeBond is active", async function () {
        // Mock stakerActive to return true via sending a bit of ETH to stake in mock
        await computeBond.connect(owner).stake("node-1", { value: 100 });

        const zkProofHash = ethers.encodeBytes32String("mockProof");
        await citizenshipNFT.mintCitizenship(
            addr1.address,
            "Global",
            Date.now() + 100000,
            "Citizen",
            zkProofHash,
            "Guild-001",
            "ipfs://mock"
        );

        expect(await citizenshipNFT.ownerOf(1)).to.equal(addr1.address);
    });

    it("Should fail if token is transferred (Soulbound)", async function () {
        await computeBond.connect(owner).stake("node-1", { value: 100 });

        const zkProofHash = ethers.encodeBytes32String("mockProof");
        await citizenshipNFT.mintCitizenship(
            addr1.address,
            "Global",
            Date.now() + 100000,
            "Citizen",
            zkProofHash,
            "Guild-001",
            "ipfs://mock"
        );

        await expect(
            citizenshipNFT.connect(addr1).transferFrom(addr1.address, addr2.address, 1)
        ).to.be.revertedWith("CitizenshipNFT: Transfer not allowed (Soulbound)");
    });
});
