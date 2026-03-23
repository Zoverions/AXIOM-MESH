import hre from "hardhat";

async function main() {
  console.log("Starting testnet deployment...");

  const networkName = hre.network.name;
  console.log(`Deploying to network: ${networkName}`);

  // We get the contract to deploy
  const Genesis = await hre.ethers.getContractFactory("Genesis");
  console.log("Deploying Genesis...");

  // Mock multi-sig owners for testnet deployment purposes. In production, these should be securely handled.
  const owner1 = "0x1c2cBabF75e1938ED2f2c59e734e83aa5FBe1B73";
  const owner2 = "0x2c3cbabf75e1938ed2f2c59e734e83aa5fbe1b74";
  const owner3 = "0x3c4cbabf75e1938ed2f2c59e734e83aa5fbe1b75";
  const genesis = await Genesis.deploy([owner1, owner2, owner3], 2);

  await genesis.waitForDeployment();

  const address = await genesis.getAddress();
  console.log(`Genesis deployed to: ${address}`);

  // Fetch the created token address
  const axmTokenAddress = await genesis.axmToken();
  console.log(`AXM Token deployed at: ${axmTokenAddress}`);

  // Fetch the founder multi-sig wallet address
  const multiSigAddress = await genesis.founder();
  console.log(`Founder Multi-Sig Wallet deployed at: ${multiSigAddress}`);

  console.log("Testnet deployment complete.");
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
