const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("M12.8 Test Coverage Extension: ComputeBond", function () {
    let owner, staker;
    let computeBond;

    beforeEach(async function () {
        [owner, staker] = await ethers.getSigners();

        const ComputeBond = await ethers.getContractFactory("ComputeBond");
        computeBond = await ComputeBond.deploy();
    });

    it("M12.8 Check: Should return proper founder share based on swarm size", async function () {
        const share = await computeBond.getCurrentFounderShare();
        // At 0 grid swarm size, share is 500 (5%)
        expect(share).to.equal(500n);
    });

    it("M12.8 Check: Should calculate unused founder share accurately", async function () {
        const unused = await computeBond.calculateUnusedFounderShare(100n);
        expect(unused).to.equal(0n);
    });
});
