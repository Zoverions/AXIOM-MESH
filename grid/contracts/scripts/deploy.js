import hre from "hardhat";
import fs from "fs";
import path from "path";

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log(`Deploying with account: ${deployer.address}`);

  const DualLedgerIdentity = await hre.ethers.getContractFactory("DualLedgerIdentity");
  const dualLedgerIdentity = await DualLedgerIdentity.deploy();
  await dualLedgerIdentity.waitForDeployment();

  const WeightOracle = await hre.ethers.getContractFactory("WeightOracle");
  const weightOracle = await WeightOracle.deploy();
  await weightOracle.waitForDeployment();

  const DialecticArbitration = await hre.ethers.getContractFactory("DialecticArbitration");
  const dialecticArbitration = await DialecticArbitration.deploy(
    await dualLedgerIdentity.getAddress(),
    await weightOracle.getAddress()
  );
  await dialecticArbitration.waitForDeployment();

  const ComputeBond = await hre.ethers.getContractFactory("ComputeBond");
  const computeBond = await ComputeBond.deploy();
  await computeBond.waitForDeployment();

  const output = {
    network: hre.network.name,
    chainId: Number((await hre.ethers.provider.getNetwork()).chainId),
    deployer: deployer.address,
    deployedAt: new Date().toISOString(),
    contracts: {
      DualLedgerIdentity: await dualLedgerIdentity.getAddress(),
      WeightOracle: await weightOracle.getAddress(),
      DialecticArbitration: await dialecticArbitration.getAddress(),
      ComputeBond: await computeBond.getAddress()
    }
  };

  const outPath = path.resolve("deployments", `${hre.network.name}.json`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));

  console.log("Deployment complete:");
  console.log(JSON.stringify(output, null, 2));
  console.log(`Saved deployment manifest: ${outPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
