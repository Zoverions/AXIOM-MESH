import { expect } from "chai";
import hre from "hardhat";
const { ethers } = hre;

describe("AxiomStableCoin", function () {
  let axiomStableCoin;
  let owner, user;

  beforeEach(async function () {
    [owner, user] = await ethers.getSigners();
    const AxiomStableCoin = await ethers.getContractFactory("AxiomStableCoin");
    axiomStableCoin = await AxiomStableCoin.deploy();
  });

  it("should have correct name and symbol", async function () {
    expect(await axiomStableCoin.name()).to.equal("Axiom USD Stablecoin");
    expect(await axiomStableCoin.symbol()).to.equal("AUSD");
  });

  it("should allow owner to mint tokens", async function () {
    const amount = ethers.parseUnits("100", 18);
    await axiomStableCoin.mint(user.address, amount);
    expect(await axiomStableCoin.balanceOf(user.address)).to.equal(amount);
  });

  it("should revert if non-owner tries to mint", async function () {
    const amount = ethers.parseUnits("100", 18);
    await expect(axiomStableCoin.connect(user).mint(user.address, amount))
      .to.be.revertedWithCustomError(axiomStableCoin, "OwnableUnauthorizedAccount");
  });

  it("should allow burning tokens", async function () {
    const amount = ethers.parseUnits("100", 18);
    await axiomStableCoin.mint(owner.address, amount);
    expect(await axiomStableCoin.balanceOf(owner.address)).to.equal(amount);

    await axiomStableCoin.burn(amount);
    expect(await axiomStableCoin.balanceOf(owner.address)).to.equal(0);
  });
});
