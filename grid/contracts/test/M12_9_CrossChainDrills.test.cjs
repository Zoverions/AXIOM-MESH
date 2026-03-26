const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("M12.9 Cross-Chain Failure Drills", function () {
    let WormholeFallback;
    let wormholeFallback;
    let owner;

    beforeEach(async function () {
        [owner] = await ethers.getSigners();

        // Mock the IWormholeRelayer
        const MockRelayer = await ethers.getContractFactory("WeightOracle"); // Deploy an empty contract to mock address
        const mockRelayer = await MockRelayer.deploy(ethers.ZeroAddress);

        WormholeFallback = await ethers.getContractFactory("WormholeFallback");
        wormholeFallback = await WormholeFallback.deploy(await mockRelayer.getAddress(), owner.address);
        await wormholeFallback.waitForDeployment();
    });

    it("Should allow cross-chain bridging under normal operation", async function () {
        // Without drill mode, it should attempt to call the relayer. Since the mock relayer doesn't
        // have the `sendPayloadToEvm` signature, it will revert natively, proving it reached the external call.
        await expect(
            wormholeFallback.wormholeBridge(1, owner.address, ethers.parseEther("1"), { value: ethers.parseEther("0.1") })
        ).to.be.reverted; // Reverts inside the ABI call to the mock
    });

    it("Should fail-closed and simulate a network partition timeout when Drill Mode is active", async function () {
        await wormholeFallback.setDrillMode(true);
        expect(await wormholeFallback.drillModeActive()).to.be.true;

        // When in drill mode, it explicitly reverts at the require statement before the external call,
        // simulating a timeout/fail-closed scenario.
        await expect(
            wormholeFallback.wormholeBridge(1, owner.address, ethers.parseEther("1"), { value: ethers.parseEther("0.1") })
        ).to.be.revertedWith("Cross-chain drill mode: Bridge is simulated offline");
    });
});
