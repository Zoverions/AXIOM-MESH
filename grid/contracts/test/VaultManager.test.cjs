const { expect } = require("chai");
const hre = require("hardhat");
const { ethers } = hre;

describe("VaultManager", function () {
  let poerVerifier, horizon, symbiosis, vaultManager, vaultKeyNFT;
  let owner, user;

  beforeEach(async function () {
    [owner, user] = await ethers.getSigners();

    const MockERC721 = await ethers.getContractFactory("MockERC721");
    vaultKeyNFT = await MockERC721.deploy();

    const CognitiveFrictionVerifier = await ethers.getContractFactory("CognitiveFrictionVerifier");
    poerVerifier = await CognitiveFrictionVerifier.deploy();

    const AXM = await ethers.getContractFactory("AXM");
    const axm = await AXM.deploy(owner.address, owner.address, owner.address);

    const PulseAdapter = await ethers.getContractFactory("PulseAdapter");
    const pulse = await PulseAdapter.deploy(owner.address);

    const StigmergicStateChannel = await ethers.getContractFactory("StigmergicStateChannel");
    const channel = await StigmergicStateChannel.deploy(
      axm.target,
      poerVerifier.target,
      pulse.target,
      owner.address,
      owner.address
    );

    const HorizonForecast = await ethers.getContractFactory("HorizonForecast");
    horizon = await HorizonForecast.deploy(poerVerifier.target, channel.target);

    const SymbiosisEngine = await ethers.getContractFactory("SymbiosisEngine");
    symbiosis = await SymbiosisEngine.deploy(poerVerifier.target, horizon.target, channel.target);

    const VaultManager = await ethers.getContractFactory("VaultManager");
    vaultManager = await VaultManager.deploy(vaultKeyNFT.target, poerVerifier.target, horizon.target, symbiosis.target);
  });

  it("Should create a vault and lock assets", async function () {
    const nftId = 1;
    await vaultKeyNFT.mint(user.address, nftId);

    await vaultManager.connect(user).createVault(nftId);

    // Check vault details
    const vault = await vaultManager.vaults(nftId);
    expect(vault.owner).to.equal(user.address);
    expect(vault.isActive).to.be.true;

    // Mint Mock ERC20 to user and approve vaultManager
    const AXM = await ethers.getContractFactory("AXM");
    const erc20 = await AXM.deploy(owner.address, owner.address, owner.address);
    await erc20.transfer(user.address, 1000);
    await erc20.connect(user).approve(vaultManager.target, 1000);

    await expect(vaultManager.connect(user).lockAssets(nftId, erc20.target, 100))
        .to.emit(vaultManager, "AssetsLocked")
        .withArgs(nftId, erc20.target, 100);

    await expect(vaultManager.connect(user).releaseAssets(nftId, erc20.target, 50, ethers.ZeroHash))
        .to.emit(vaultManager, "AssetsReleased")
        .withArgs(nftId, erc20.target, 50);
  });

  it("Should enforce owner-only memory lattice setter", async function () {
    await expect(vaultManager.connect(user).setMemoryLattice(ethers.ZeroAddress))
      .to.be.reverted;

    await expect(vaultManager.connect(owner).setMemoryLattice(ethers.ZeroAddress))
      .to.not.be.reverted;
  });

  it("Should reject zero-amount lock/release", async function () {
    const nftId = 2;
    await vaultKeyNFT.mint(user.address, nftId);
    await vaultManager.connect(user).createVault(nftId);

    const AXM = await ethers.getContractFactory("AXM");
    const erc20 = await AXM.deploy(owner.address, owner.address, owner.address);
    await erc20.transfer(user.address, 1000);
    await erc20.connect(user).approve(vaultManager.target, 1000);

    await expect(vaultManager.connect(user).lockAssets(nftId, erc20.target, 0))
      .to.be.revertedWith("Amount must be > 0");

    await expect(vaultManager.connect(user).releaseAssets(nftId, erc20.target, 0, "0x"))
      .to.be.revertedWith("Insufficient locked balance");
  });
});
