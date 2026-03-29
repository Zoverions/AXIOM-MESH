const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ComputeBond ZKML oracle decoupling", function () {
  it("accepts a valid proof even when WeightOracle callback fails", async function () {
    const [owner, staker] = await ethers.getSigners();

    const ComputeBond = await ethers.getContractFactory("ComputeBond");
    const bond = await ComputeBond.deploy();

    const ZKVerifier = await ethers.getContractFactory("contracts/mock/MocksForTests.sol:MockZKMLVerifier");
    const verifier = await ZKVerifier.deploy();

    const RevertingOracle = await ethers.getContractFactory("RevertingWeightOracle");
    const badOracle = await RevertingOracle.deploy();

    const opVerifier = ethers.keccak256(
      ethers.solidityPacked(["string", "address"], ["setZKMLVerifier", await verifier.getAddress()])
    );
    await bond.queueOperation(opVerifier);
    await ethers.provider.send("evm_increaseTime", [2 * 24 * 60 * 60 + 1]);
    await ethers.provider.send("evm_mine", []);
    await bond.setZKMLVerifier(await verifier.getAddress());

    const opOracle = ethers.keccak256(
      ethers.solidityPacked(["string", "address"], ["setWeightOracle", await badOracle.getAddress()])
    );
    await bond.queueOperation(opOracle);
    await ethers.provider.send("evm_increaseTime", [2 * 24 * 60 * 60 + 1]);
    await ethers.provider.send("evm_mine", []);
    await bond.setWeightOracle(await badOracle.getAddress());

    await expect(
      bond.connect(staker).submitZKMLProof(
        ethers.keccak256(ethers.toUtf8Bytes("proof")),
        [1, 2],
        [[3, 4], [5, 6]],
        [7, 8]
      )
    ).to.not.be.reverted;

    expect(await bond.stakerPoerScores(staker.address)).to.equal(300);
  });
});
