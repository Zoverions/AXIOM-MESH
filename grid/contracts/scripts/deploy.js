import hre from "hardhat";

async function main() {
  const ComputeBond = await hre.ethers.getContractFactory("ComputeBond");
  const computeBond = await ComputeBond.deploy();

  await computeBond.waitForDeployment();

  console.log(`ComputeBond deployed to ${await computeBond.getAddress()}`);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
