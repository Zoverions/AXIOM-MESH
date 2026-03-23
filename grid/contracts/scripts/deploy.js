import hre from "hardhat";
import fs from "fs";
import path from "path";

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log(`Deploying with account: ${deployer.address}`);

  const DualLedgerIdentity = await hre.ethers.getContractFactory("DualLedgerIdentity");
  const dualLedgerIdentity = await DualLedgerIdentity.deploy();
  await dualLedgerIdentity.waitForDeployment();

  const Genesis = await hre.ethers.getContractFactory("Genesis");
  const owner1 = "0x1c2cBabF75e1938ED2f2c59e734e83aa5FBe1B73";
  const owner2 = "0x2c3cbabf75e1938ed2f2c59e734e83aa5fbe1b74";
  const owner3 = "0x3c4cbabf75e1938ed2f2c59e734e83aa5fbe1b75";
  const genesis = await Genesis.deploy([owner1, owner2, owner3], 2);

  await genesis.waitForDeployment();

  const WeightOracle = await hre.ethers.getContractFactory("WeightOracle");
  const weightOracle = await WeightOracle.deploy(await dualLedgerIdentity.getAddress());
  await weightOracle.waitForDeployment();

  // Education Contracts Pack
  const CurriculumRegistry = await hre.ethers.getContractFactory("CurriculumRegistry");
  const curriculumRegistry = await CurriculumRegistry.deploy();
  await curriculumRegistry.waitForDeployment();

  const CredentialBond = await hre.ethers.getContractFactory("CredentialBond");
  const credentialBond = await CredentialBond.deploy();
  await credentialBond.waitForDeployment();

  const DialecticArbitration = await hre.ethers.getContractFactory("DialecticArbitration");
  const dialecticArbitration = await DialecticArbitration.deploy(
    await dualLedgerIdentity.getAddress(),
    await weightOracle.getAddress(),
    await credentialBond.getAddress()
  );
  await dialecticArbitration.waitForDeployment();

  const AutomatedBicameralGovernance = await hre.ethers.getContractFactory("AutomatedBicameralGovernance");
  const automatedBicameralGovernance = await AutomatedBicameralGovernance.deploy(
    await dialecticArbitration.getAddress()
  );
  await automatedBicameralGovernance.waitForDeployment();

  const ComputeBond = await hre.ethers.getContractFactory("ComputeBond");
  const computeBond = await ComputeBond.deploy();
  await computeBond.waitForDeployment();

  await dualLedgerIdentity.setComputeBondAddress(await computeBond.getAddress());

  // Transfer ownership of the education contracts to the automated governance (Gateway security rules via bicameral DAO)
  await curriculumRegistry.transferOwnership(await automatedBicameralGovernance.getAddress());
  await credentialBond.transferOwnership(await automatedBicameralGovernance.getAddress());

  const output = {
    network: hre.network.name,
    chainId: Number((await hre.ethers.provider.getNetwork()).chainId),
    deployer: deployer.address,
    deployedAt: new Date().toISOString(),
    contracts: {
      Genesis: await genesis.getAddress(),
      DualLedgerIdentity: await dualLedgerIdentity.getAddress(),
      WeightOracle: await weightOracle.getAddress(),
      DialecticArbitration: await dialecticArbitration.getAddress(),
      AutomatedBicameralGovernance: await automatedBicameralGovernance.getAddress(),
      ComputeBond: await computeBond.getAddress(),
      CurriculumRegistry: await curriculumRegistry.getAddress(),
      CredentialBond: await credentialBond.getAddress()
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
