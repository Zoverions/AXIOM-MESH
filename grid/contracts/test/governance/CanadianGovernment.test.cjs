const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Canadian Government Structure", function () {
    let owner, citizen, contractor;
    let citizenshipNFT, canadianGov, taxController, mockToken;
    let computeBondMock;

    beforeEach(async function () {
        [owner, citizen, contractor] = await ethers.getSigners();

        // Deploy Mocks
        const MockToken = await ethers.getContractFactory("ERC20Mock");
        mockToken = await MockToken.deploy("TestToken", "TTK");
        await mockToken.waitForDeployment();

        // Mint some mock tokens to citizen for taxes
        await mockToken.mint(citizen.address, ethers.parseEther("1000"));

        const ComputeBondMock = await ethers.getContractFactory("MockComputeBond");
        computeBondMock = await ComputeBondMock.deploy();
        await computeBondMock.waitForDeployment();

        // Deploy CitizenshipNFT
        const CitizenshipNFT = await ethers.getContractFactory("CitizenshipNFT");
        citizenshipNFT = await CitizenshipNFT.deploy();
        await citizenshipNFT.waitForDeployment();
        await citizenshipNFT.setComputeBondAddress(await computeBondMock.getAddress());

        // Deploy CanadianGovernment
        const CanadianGov = await ethers.getContractFactory("CanadianGovernment");
        canadianGov = await CanadianGov.deploy(owner.address);
        await canadianGov.waitForDeployment();

        // Deploy TaxController
        const TaxController = await ethers.getContractFactory("TaxController");
        taxController = await TaxController.deploy(
            await citizenshipNFT.getAddress(),
            await canadianGov.getAddress(),
            owner.address
        );
        await taxController.waitForDeployment();

        // Setup Government Hierarchy
        await canadianGov.createProvince("Ontario");
        await canadianGov.createMunicipality("Ontario", "Toronto");
    });

    it("should deploy and initialize the federal government", async function () {
        const federalAddress = await canadianGov.federalGovernment();
        expect(federalAddress).to.not.equal(ethers.ZeroAddress);

        const federalNode = await ethers.getContractAt("GovernmentNode", federalAddress);
        expect(await federalNode.nodeName()).to.equal("Federal Government of Canada");
    });

    it("should allow creating provinces and municipalities", async function () {
        const ontarioAddress = await canadianGov.getProvince("Ontario");
        expect(ontarioAddress).to.not.equal(ethers.ZeroAddress);

        const torontoAddress = await canadianGov.getMunicipality("Ontario", "Toronto");
        expect(torontoAddress).to.not.equal(ethers.ZeroAddress);

        const torontoNode = await ethers.getContractAt("GovernmentNode", torontoAddress);
        expect(await torontoNode.nodeName()).to.equal("Toronto, Ontario");
    });

    it("should allow collecting and routing taxes based on profile", async function () {
        // Setup Tax Brackets: Federal 5%, Provincial 8%, Municipal 2% (total 15%)
        await taxController.setTaxBracket("Canada", "Ontario", 500, 800, 200);

        // User sets profile
        await taxController.connect(citizen).updateUserProfile("Canada", "Ontario", "Toronto");

        // Citizen needs to approve TaxController to spend their ERC20 mock tokens
        const transactionAmount = ethers.parseEther("100"); // 100 tokens
        await mockToken.connect(citizen).approve(await taxController.getAddress(), transactionAmount);

        // Collect tax on 100 tokens. Total tax should be 15 tokens.
        // 5 to Federal, 8 to Ontario, 2 to Toronto.
        await expect(taxController.connect(citizen).collectTax(transactionAmount, await mockToken.getAddress()))
            .to.emit(taxController, "TaxCollected")
            .withArgs(citizen.address, ethers.parseEther("15"), "Canada", "Ontario", "Toronto");

        const federalAddress = await canadianGov.federalGovernment();
        const ontarioAddress = await canadianGov.getProvince("Ontario");
        const torontoAddress = await canadianGov.getMunicipality("Ontario", "Toronto");

        expect(await mockToken.balanceOf(federalAddress)).to.equal(ethers.parseEther("5"));
        expect(await mockToken.balanceOf(ontarioAddress)).to.equal(ethers.parseEther("8"));
        expect(await mockToken.balanceOf(torontoAddress)).to.equal(ethers.parseEther("2"));
    });

    it("should support transparent contracting through a government node", async function () {
        const ontarioAddress = await canadianGov.getProvince("Ontario");
        const ontarioNode = await ethers.getContractAt("GovernmentNode", ontarioAddress);

        // Send funds to Ontario treasury
        await mockToken.mint(ontarioAddress, ethers.parseEther("500"));

        // Create a contract for 100 tokens
        await expect(ontarioNode.connect(owner).createContract("Road Repair", contractor.address, ethers.parseEther("100"), await mockToken.getAddress()))
            .to.emit(ontarioNode, "ContractCreated")
            .withArgs(1, "Road Repair", contractor.address, ethers.parseEther("100"), await mockToken.getAddress());

        // Fund the contract
        await expect(ontarioNode.connect(owner).fundContract(1))
            .to.emit(ontarioNode, "ContractFunded")
            .withArgs(1);

        // Complete the contract
        await expect(ontarioNode.connect(owner).completeContract(1))
            .to.emit(ontarioNode, "ContractCompleted")
            .withArgs(1, contractor.address, ethers.parseEther("100"));

        // Verify contractor received funds
        expect(await mockToken.balanceOf(contractor.address)).to.equal(ethers.parseEther("100"));
    });
});
