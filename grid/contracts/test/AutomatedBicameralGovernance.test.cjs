
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("AutomatedBicameralGovernance", function () {
    let gov, dialArbitration, id, oracle;
    let owner, addr1, addr2;
    let axmToken, zkVerifier;

    beforeEach(async function () {
        [owner, addr1, addr2] = await ethers.getSigners();

        const MockERC20 = await ethers.getContractFactory("MockERC20");
        axmToken = await MockERC20.deploy("AXM", "AXM", ethers.parseEther("1000000"));

        const MockZKMLVerifier = await ethers.getContractFactory("MockZKMLVerifier");
        zkVerifier = await MockZKMLVerifier.deploy();

        const DualLedgerIdentity = await ethers.getContractFactory("DualLedgerIdentity");
        id = await DualLedgerIdentity.deploy();
        const WeightOracle = await ethers.getContractFactory("WeightOracle");
        oracle = await WeightOracle.deploy(id.target);
        const CredentialBond = await ethers.getContractFactory("CredentialBond");
        const credBond = await CredentialBond.deploy();

        const DialecticArbitration = await ethers.getContractFactory("DialecticArbitration");
        dialArbitration = await DialecticArbitration.deploy(id.target, oracle.target, credBond.target);

        const AutomatedBicameralGovernance = await ethers.getContractFactory("AutomatedBicameralGovernance");
        gov = await AutomatedBicameralGovernance.deploy(axmToken.target, zkVerifier.target, owner.address);

        await axmToken.transfer(addr1.address, ethers.parseEther("10000"));
        await axmToken.connect(addr1).approve(gov.target, ethers.parseEther("10000"));
    });

    it("should allow proposeStateChange", async function () {
        await expect(gov.connect(addr1).proposeStateChange(ethers.ZeroHash))
            .to.emit(gov, "ProposalCreated");
    });
});
