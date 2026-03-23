import { expect } from "chai";
import hre from "hardhat";
const { ethers } = hre;

describe("PortfolioNFT Ecosystem Asset Vault", function () {
  let portfolioNFT;
  let mockERC20;
  let owner, user;

  beforeEach(async function () {
    [owner, user] = await ethers.getSigners();
    const PortfolioNFT = await ethers.getContractFactory("PortfolioNFT");
    portfolioNFT = await PortfolioNFT.deploy();

    // Deploy a generic ERC20 to simulate an ecosystem token like HEX, bridged stablecoin, or PLSX
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    mockERC20 = await MockERC20.deploy("Bridged USDC", "USDC");
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

  it("should allow NFT owner to execute native token (PLS) transfers via vault", async function () {
    const tx = await portfolioNFT.mint();
    const receipt = await tx.wait();
    const event = receipt.logs.find(
      (log) => log.fragment && log.fragment.name === "PortfolioCreated"
    );
    const vaultAddress = event.args[1];

    const vault = await ethers.getContractAt("PortfolioVault", vaultAddress);

    // Give the vault some native token (simulating PLS)
    const fundTx = await owner.sendTransaction({
      to: vaultAddress,
      value: ethers.parseEther("1.0"),
    });
    await fundTx.wait();

    const initialBalance = await ethers.provider.getBalance(user.address);

    // Execute transfer 1 native token to user via the vault
    await vault.execute(user.address, ethers.parseEther("1.0"), "0x");

    const finalBalance = await ethers.provider.getBalance(user.address);
    expect(finalBalance - initialBalance).to.equal(ethers.parseEther("1.0"));

    // Should revert if a non-owner tries to execute
    await expect(vault.connect(user).execute(owner.address, 0, "0x"))
      .to.be.revertedWith("Not the NFT owner");
  });

  it("should allow NFT owner to execute ERC20 ecosystem token (bridged stables, HEX, PLSX) transfers", async function () {
    const tx = await portfolioNFT.mint();
    const receipt = await tx.wait();
    const event = receipt.logs.find(
      (log) => log.fragment && log.fragment.name === "PortfolioCreated"
    );
    const vaultAddress = event.args[1];

    const vault = await ethers.getContractAt("PortfolioVault", vaultAddress);

    // Mint the mock ERC20 directly to the vault simulating an incoming bridge or trade
    const amount = ethers.parseUnits("1000", 18);
    await mockERC20.mint(vaultAddress, amount);

    expect(await mockERC20.balanceOf(vaultAddress)).to.equal(amount);

    // Prepare ERC20 transfer payload (transfer 100 USDC out to `user`)
    const transferAmount = ethers.parseUnits("100", 18);
    const erc20Interface = new ethers.Interface([
      "function transfer(address to, uint256 amount) returns (bool)"
    ]);
    const payload = erc20Interface.encodeFunctionData("transfer", [user.address, transferAmount]);

    // Execute via Vault
    await vault.execute(await mockERC20.getAddress(), 0, payload);

    expect(await mockERC20.balanceOf(vaultAddress)).to.equal(ethers.parseUnits("900", 18));
    expect(await mockERC20.balanceOf(user.address)).to.equal(transferAmount);

    // Only owner validation
    await expect(vault.connect(user).execute(await mockERC20.getAddress(), 0, payload))
      .to.be.revertedWith("Not the NFT owner");
  });
});
