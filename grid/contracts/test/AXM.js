import { expect } from "chai";
import hre from "hardhat";

describe("AXM", function () {
  it("mints according to canonical tokenomics split", async function () {
    const [deployer, founderEntity, networkTreasury, ecosystemReserve] = await hre.ethers.getSigners();
    const AXM = await hre.ethers.getContractFactory("AXM", deployer);
    const axm = await AXM.deploy(founderEntity.address, networkTreasury.address, ecosystemReserve.address);

    const totalSupply = await axm.totalSupply();
    expect(totalSupply).to.equal(hre.ethers.parseEther("1000000000"));

    const founderBalance = await axm.balanceOf(founderEntity.address);
    const treasuryBalance = await axm.balanceOf(networkTreasury.address);
    const reserveBalance = await axm.balanceOf(ecosystemReserve.address);

    expect(founderBalance).to.equal((totalSupply * 5n) / 100n);
    expect(treasuryBalance).to.equal((totalSupply * 10n) / 100n);
    expect(reserveBalance).to.equal((totalSupply * 85n) / 100n);
  });
});
