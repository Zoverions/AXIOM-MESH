const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("M12.12 Governance Simulation", function () {
    let owner, aiGovernor;
    let bicameralGov;

    beforeEach(async function () {
        [owner, aiGovernor] = await ethers.getSigners();

        // Setup mock arbitration address
        const mockArbitration = await ethers.getImpersonatedSigner(ethers.ZeroAddress);

        const AutomatedBicameralGovernance = await ethers.getContractFactory("AutomatedBicameralGovernance");
        bicameralGov = await AutomatedBicameralGovernance.deploy(mockArbitration.address);

        // Wait for deployment
        await bicameralGov.waitForDeployment();
    });

    it("Should correctly simulate a policy change without modifying state", async function () {
        // We act as the owner (which is the aiGovernor modifier requirement)
        await bicameralGov.setSimulationMode(true);
        expect(await bicameralGov.simulationModeActive()).to.be.true;

        const peerClassId = ethers.id("AGENT_NODE");

        // Attempt to update policy in simulation mode
        const tx = await bicameralGov.updatePolicy(peerClassId, 1, 2, 3); // ActionType.Deny (1), minSec 2, maxRisk 3

        // Verify event was emitted
        await expect(tx).to.emit(bicameralGov, "SimulationExecuted").withArgs(peerClassId, 1);

        // Verify state did NOT change
        const policy = await bicameralGov.peerClassRisks(peerClassId);
        expect(policy.defaultPolicy).to.equal(0n); // Still ActionType.None
        expect(policy.minSecurityProfile).to.equal(0n);
        expect(policy.maxRiskTier).to.equal(0n);
    });

    it("Should enact a policy change when simulation is disabled", async function () {
        await bicameralGov.setSimulationMode(false);
        const peerClassId = ethers.id("HUMAN_NODE");

        await bicameralGov.updatePolicy(peerClassId, 3, 2, 1); // ActionType.Allow (3), minSec 2, maxRisk 1

        const policy = await bicameralGov.peerClassRisks(peerClassId);
        expect(policy.defaultPolicy).to.equal(3n);
        expect(policy.minSecurityProfile).to.equal(2n);
        expect(policy.maxRiskTier).to.equal(1n);
    });
});
