const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("AutomatedBicameralGovernance", function () {
    let gov, dialArbitration, id, oracle;
    let owner, addr1, addr2;

    beforeEach(async function () {
        [owner, addr1, addr2] = await ethers.getSigners();
        const DualLedgerIdentity = await ethers.getContractFactory("DualLedgerIdentity");
        id = await DualLedgerIdentity.deploy();
        const WeightOracle = await ethers.getContractFactory("WeightOracle");
        oracle = await WeightOracle.deploy(id.target);
        const DialecticArbitration = await ethers.getContractFactory("DialecticArbitration");
        dialArbitration = await DialecticArbitration.deploy(id.target, oracle.target);

        const AutomatedBicameralGovernance = await ethers.getContractFactory("AutomatedBicameralGovernance");
        gov = await AutomatedBicameralGovernance.deploy(dialArbitration.target);

    });

    it("should allow AIGovernor (owner) to pause and unpause the system", async function () {
        await expect(gov.emergencyPause("Testing pause"))
            .to.emit(gov, "EmergencyPauseInvoked")
            .withArgs("Testing pause");

        expect(await gov.systemPaused()).to.be.true;

        await expect(gov.liftEmergencyPause())
            .to.emit(gov, "EmergencyPauseLifted");

        expect(await gov.systemPaused()).to.be.false;
    });

    it("should block policy updates when system is paused", async function () {
        await gov.emergencyPause("Emergency Test");

        const peerClassId = ethers.id("PeerClass1");
        await expect(gov.updatePolicy(peerClassId, 2, 1, 3)).to.be.revertedWithCustomError(gov, "SystemIsPaused");
        await expect(gov.raiseMinSecurityProfile(peerClassId, 2)).to.be.revertedWithCustomError(gov, "SystemIsPaused");
    });

    it("should quarantine peer class even when system is paused (emergency circuit breaker override)", async function () {
        await gov.emergencyPause("Emergency Test");
        const peerClassId = ethers.id("PeerClass1");

        await expect(gov.autoQuarantinePeerClass(peerClassId, "Compromised"))
            .to.emit(gov, "PeerClassQuarantined")
            .withArgs(peerClassId, "Compromised");

        const risk = await gov.peerClassRisks(peerClassId);
        expect(risk.quarantined).to.be.true;
        expect(risk.defaultPolicy).to.equal(1); // ActionType.Deny is 1
    });

    it("should raise min security profile", async function () {
        const peerClassId = ethers.id("PeerClass1");
        await expect(gov.raiseMinSecurityProfile(peerClassId, 2))
            .to.emit(gov, "PolicyUpdated")
            .withArgs(peerClassId, 0, 2, 0);

        const risk = await gov.peerClassRisks(peerClassId);
        expect(risk.minSecurityProfile).to.equal(2);
    });

    it("should update policy", async function () {
        const peerClassId = ethers.id("PeerClass1");
        await expect(gov.updatePolicy(peerClassId, 2, 1, 3))
            .to.emit(gov, "PolicyUpdated")
            .withArgs(peerClassId, 2, 1, 3);

        const risk = await gov.peerClassRisks(peerClassId);
        expect(risk.defaultPolicy).to.equal(2); // ActionType.AllowWithReview is 2
        expect(risk.minSecurityProfile).to.equal(1);
        expect(risk.maxRiskTier).to.equal(3);
    });

    it("should synthesize deadlock", async function () {

        await dialArbitration.createProposal("Test proposal", 0, 100);

        // Advance time and resolve as deadlock (we skip voting to let human 0 vs agent 0, which doesn't deadlock, so we actually have to vote)
        await id.registerNode(owner.address, 1); // Human
        await id.registerNode(addr1.address, 2); // Agent
        await oracle.updateWeight(owner.address, 10);
        await oracle.updateWeight(addr1.address, 10);

        await dialArbitration.connect(owner).vote(0, true);
        await dialArbitration.connect(addr1).vote(0, false);

        await ethers.provider.send("evm_increaseTime", [200]);
        await ethers.provider.send("evm_mine");

        await dialArbitration.resolveProposal(0);

        // AwaitingSynthesis state
        const prop = await dialArbitration.proposals(0);
        expect(prop.state).to.equal(1); // AwaitingSynthesis

        // Give ownership to gov
        await dialArbitration.transferOwnership(gov.target);

        // Synthesize deadlock via gov
        await expect(gov.synthesizeDeadlock(0, "Synthesis result", 100))
            .to.emit(dialArbitration, "SynthesisSubmitted")
            .withArgs(0, "Synthesis result");

        const propResolved = await dialArbitration.proposals(0);
        expect(propResolved.state).to.equal(0); // Back to Active
    });
});
