const hre = require("hardhat");
const { ethers } = hre;

async function main() {
  console.log("Preparing to deploy DeployerMultiSig...");

  // Example addresses for initial co-maintainers (to be replaced with real addresses before mainnet)
  // These are required constructor arguments for the MultiSig
  const owners = [
    "0x0000000000000000000000000000000000000001", // Co-Maintainer 1
    "0x0000000000000000000000000000000000000002", // Co-Maintainer 2
    "0x0000000000000000000000000000000000000003"  // Co-Maintainer 3
  ];

  const numConfirmationsRequired = 2; // 2 out of 3 required for deployment/upgrades

  // Get the contract factory
  const DeployerMultiSig = await ethers.getContractFactory("DeployerMultiSig");

  // Deploy the contract
  console.log(`Deploying DeployerMultiSig with ${owners.length} owners and ${numConfirmationsRequired} confirmations required...`);
  const deployerMultiSig = await DeployerMultiSig.deploy(owners, numConfirmationsRequired);

  await deployerMultiSig.waitForDeployment();

  const multiSigAddress = await deployerMultiSig.getAddress();
  console.log(`DeployerMultiSig deployed to: ${multiSigAddress}`);
  console.log("Infrastructure for separated deploy keys is ready. Co-maintainers can be onboarded securely.");
}

// Execute the deployment script
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
