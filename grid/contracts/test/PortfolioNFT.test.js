import { expect } from "chai";
import hre from "hardhat";
const { ethers } = hre;

describe("PortfolioNFT", function () {
  let portfolioNFT;
  let owner, user;

  beforeEach(async function () {
    [owner, user] = await ethers.getSigners();
    const PortfolioNFT = await ethers.getContractFactory("PortfolioNFT");
    portfolioNFT = await PortfolioNFT.deploy();
  });

  it("should mint an NFT and deploy a vault", async function () {
    const tx = await portfolioNFT.mint();
    const receipt = await tx.wait();

    const event = receipt.logs.find(
      (log) => log.fragment && log.fragment.name === "PortfolioCreated"
    );

    expect(event).to.not.be.undefined;
    const [tokenId, vaultAddress, minter] = event.args;

    expect(tokenId).to.equal(0);
    expect(minter).to.equal(owner.address);

    const vault = await ethers.getContractAt("PortfolioVault", vaultAddress);
    expect(await vault.parentNFT()).to.equal(await portfolioNFT.getAddress());
    expect(await vault.tokenId()).to.equal(tokenId);
  });

  it("should only allow NFT owner to execute via vault", async function () {
    const tx = await portfolioNFT.mint();
    const receipt = await tx.wait();
    const event = receipt.logs.find(
      (log) => log.fragment && log.fragment.name === "PortfolioCreated"
    );
    const vaultAddress = event.args[1];

    const vault = await ethers.getContractAt("PortfolioVault", vaultAddress);

    // Give the vault some ETH
    const fundTx = await owner.sendTransaction({
      to: vaultAddress,
      value: ethers.parseEther("1.0"),
    });
    await fundTx.wait();

    const initialBalance = await ethers.provider.getBalance(user.address);

    // Execute transfer 1 ETH to user via the vault
    await vault.execute(user.address, ethers.parseEther("1.0"), "0x");

    const finalBalance = await ethers.provider.getBalance(user.address);
    expect(finalBalance - initialBalance).to.equal(ethers.parseEther("1.0"));

    // Should revert if a non-owner tries to execute
    await expect(vault.connect(user).execute(owner.address, 0, "0x"))
      .to.be.revertedWith("Not the NFT owner");
  });
});
