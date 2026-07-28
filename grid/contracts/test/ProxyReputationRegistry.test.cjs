const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ProxyReputationRegistry", function () {
    let registry;
    let owner;
    let reporter;
    let proxyNode;

    beforeEach(async function () {
        [owner, reporter, proxyNode] = await ethers.getSigners();
        const Registry = await ethers.getContractFactory("ProxyReputationRegistry");
        registry = await Registry.deploy();
        await registry.setMetricsReporter(reporter.address);
    });

    it("should allow reporter to record metrics and calculate score correctly", async function () {
        await registry.connect(reporter).recordMetrics(proxyNode.address, 95, 5, 1000, 3600);
        const score = await registry.getReputationScore(proxyNode.address);
        expect(score).to.equal(9500); // 95%
    });

    it("should prevent non-reporters from recording metrics", async function () {
        await expect(
            registry.connect(proxyNode).recordMetrics(proxyNode.address, 10, 0, 100, 100)
        ).to.be.revertedWith("Not authorized reporter");
    });

    it("should allow owner to slash a node", async function () {
        await registry.connect(reporter).recordMetrics(proxyNode.address, 100, 0, 1000, 3600);
        await registry.connect(owner).slashNode(proxyNode.address);

        const score = await registry.getReputationScore(proxyNode.address);
        expect(score).to.equal(0);

        await expect(
            registry.connect(reporter).recordMetrics(proxyNode.address, 10, 0, 100, 100)
        ).to.be.revertedWith("Node is slashed");
    });
});
