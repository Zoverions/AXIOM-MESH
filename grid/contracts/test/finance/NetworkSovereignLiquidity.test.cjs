const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("NetworkSovereignLiquidity", function () {
    let owner;
    let privateRouter;
    let user;
    let NetworkSovereignLiquidity;
    let liquidityContract;

    let mockNPM;
    let mockWormhole;
    let mockToken0;
    let mockToken1;

    beforeEach(async function () {
        [owner, privateRouter, user] = await ethers.getSigners();

        // 1. Deploy Mocks
        const MockNPM = await ethers.getContractFactory("MockNPM");
        const MockWormhole = await ethers.getContractFactory("MockWormhole");
        const MockERC20 = await ethers.getContractFactory("MockERC20");

        mockToken0 = await MockERC20.deploy("Token0", "TK0", ethers.parseEther("1000"));
        mockToken1 = await MockERC20.deploy("Token1", "TK1", ethers.parseEther("1000"));

        mockNPM = await MockNPM.deploy(await mockToken0.getAddress(), await mockToken1.getAddress());
        mockWormhole = await MockWormhole.deploy();

        // 2. Deploy the NetworkSovereignLiquidity Contract
        NetworkSovereignLiquidity = await ethers.getContractFactory("NetworkSovereignLiquidity");
        liquidityContract = await NetworkSovereignLiquidity.deploy(
            await mockNPM.getAddress(),
            await mockWormhole.getAddress(),
            privateRouter.address
        );
        await liquidityContract.waitForDeployment();
    });

    it("should tokenize an LP position correctly", async function () {
        // Mint an LP position on the mock NPM
        await mockNPM.mintPosition(user.address, 123);

        // Approve and transfer to Liquidity Contract
        await mockNPM.connect(user).approve(await liquidityContract.getAddress(), 123);

        // Tokenize
        await expect(liquidityContract.connect(user).tokenizePosition(123))
            .to.emit(liquidityContract, "PositionTokenized")
            .withArgs(1, 123, user.address);

        // Verify NFT ownership
        expect(await liquidityContract.ownerOf(1)).to.equal(user.address);

        // Verify position details
        const pos = await liquidityContract.positions(1);
        expect(pos.uniswapTokenId).to.equal(123);
        expect(pos.token0).to.equal(await mockToken0.getAddress());
        expect(pos.token1).to.equal(await mockToken1.getAddress());
    });

    it("should auto-compound fees", async function () {
        // Setup position
        await mockNPM.mintPosition(user.address, 456);
        await mockNPM.connect(user).approve(await liquidityContract.getAddress(), 456);
        await liquidityContract.connect(user).tokenizePosition(456);

        // Set mock fees on the mock NPM
        await mockNPM.setPendingFees(456, ethers.parseEther("1"), ethers.parseEther("2"));

        // Transfer actual tokens to mock NPM to simulate collected fees
        await mockToken0.transfer(await mockNPM.getAddress(), ethers.parseEther("1"));
        await mockToken1.transfer(await mockNPM.getAddress(), ethers.parseEther("2"));

        // Trigger auto-compound
        await expect(liquidityContract.connect(user).autoCompound(1, 0, 0))
            .to.emit(liquidityContract, "FeesAutoCompounded")
            .withArgs(1, ethers.parseEther("1"), ethers.parseEther("2"));

        const pos = await liquidityContract.positions(1);
        expect(pos.feeAccumulator).to.equal(ethers.parseEther("3"));
    });

    it("should bridge liquidity cross-chain using Wormhole", async function () {
        // Setup position
        await mockNPM.mintPosition(user.address, 789);
        await mockNPM.connect(user).approve(await liquidityContract.getAddress(), 789);
        await liquidityContract.connect(user).tokenizePosition(789);

        // Give the MockNPM tokens directly to act as the pool returning underlying tokens
        await mockToken0.transfer(await mockNPM.getAddress(), ethers.parseEther("100"));
        await mockToken1.transfer(await mockNPM.getAddress(), ethers.parseEther("100"));

        // Bridge liquidity
        const targetChain = 2; // e.g. some destination chain id
        const liquidityAmount = ethers.parseEther("10");

        // The mock Wormhole will just emit an event or return success
        await expect(liquidityContract.connect(user).bridgeLiquidity(1, targetChain, user.address, liquidityAmount, 0, 0, { value: ethers.parseEther("0.1") }))
            .to.emit(liquidityContract, "LiquidityBridged")
            .withArgs(1, targetChain, liquidityAmount);
    });

    it("should restrict private transactions to the private router", async function () {
        // Setup position
        await mockNPM.mintPosition(user.address, 999);
        await mockNPM.connect(user).approve(await liquidityContract.getAddress(), 999);
        await liquidityContract.connect(user).tokenizePosition(999);

        // Use a valid calldata to `name()` to avoid revert
        const callData = mockNPM.interface.encodeFunctionData("name", []);

        await expect(
            liquidityContract.connect(user).executePrivateTx(1, await mockNPM.getAddress(), callData)
        ).to.be.revertedWith("NetworkSovereignLiquidity: Unauthorized private router");

        // Target must be NPM
        const MockTarget = await ethers.getContractFactory("MockERC20");
        const dummyTarget = await MockTarget.deploy("Dummy", "DMY", 0);

        await expect(
            liquidityContract.connect(privateRouter).executePrivateTx(1, await dummyTarget.getAddress(), callData)
        ).to.be.revertedWith("NetworkSovereignLiquidity: Target must be NPM");

        // Execute via private router correctly on NPM
        await expect(
            liquidityContract.connect(privateRouter).executePrivateTx(1, await mockNPM.getAddress(), callData)
        ).to.emit(liquidityContract, "PrivateTransactionExecuted")
         .withArgs(1, privateRouter.address);
    });
});
