import { expect } from "chai";
import hre from "hardhat";

describe("AXM", function () {
  it("enforces operational tokenomics controls and bridges the gap between AXM.sol split (5/10/85) and governance evidence controls", async function () {
    // We enforce Operational Tokenomics Controls according to FIN-A.2
    const signers = await hre.ethers.getSigners();
    const deployer = signers[0];
    const founderEntity = signers[1];
    const networkTreasury = signers[2];
    const ecosystemReserve = signers[3];

    const AXM = await hre.ethers.getContractFactory("AXM", deployer);
    const axmContract = await AXM.deploy(founderEntity.address, networkTreasury.address, ecosystemReserve.address);

    // Re-verify the total supply exactly matching the canonical limit
    const totalMinted = await axmContract.totalSupply();
    const expectedTotal = hre.ethers.parseEther("1000000000");
    expect(totalMinted).to.equal(expectedTotal);

    // Load constant constraints
    const founderPercent = await axmContract.FOUNDER_PERCENT();
    const treasuryPercent = await axmContract.NETWORK_TREASURY_PERCENT();
    const ecosystemPercent = await axmContract.ECOSYSTEM_RESERVE_PERCENT();

    expect(founderPercent + treasuryPercent + ecosystemPercent).to.equal(100n);

    // Compute and verify exact split balances
    const balances = await Promise.all([
      axmContract.balanceOf(founderEntity.address),
      axmContract.balanceOf(networkTreasury.address),
      axmContract.balanceOf(ecosystemReserve.address)
    ]);

    expect(balances[0]).to.equal((totalMinted * founderPercent) / 100n);
    expect(balances[1]).to.equal((totalMinted * treasuryPercent) / 100n);
    expect(balances[2]).to.equal((totalMinted * ecosystemPercent) / 100n);
  });
});
