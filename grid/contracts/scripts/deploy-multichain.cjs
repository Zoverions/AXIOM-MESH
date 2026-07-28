const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function deployOnNetwork(networkName, signer) {
  console.log(`\n=== Deploying to ${networkName} ===`);

  const nonce = await signer.getNonce();
  const founderShareManagerAddress = hre.ethers.getCreateAddress({
    from: signer.address,
    nonce: nonce + 3
  });

  const founderHash = hre.ethers.keccak256(hre.ethers.solidityPacked(["address"], [founderShareManagerAddress]));

  const AXMFactory = await hre.ethers.getContractFactory("AXM", signer);

  const TreasuryFactory = await hre.ethers.getContractFactory("NetworkTreasury", signer);
  const mainTreasury = await TreasuryFactory.deploy(signer.address);
  await mainTreasury.waitForDeployment();
  const mainTreasuryTarget = await mainTreasury.getAddress();
  console.log(`MainTreasury deployed to: ${mainTreasuryTarget}`);

  const ecosystemReserve = await TreasuryFactory.deploy(signer.address);
  await ecosystemReserve.waitForDeployment();
  const ecosystemReserveTarget = await ecosystemReserve.getAddress();
  console.log(`EcosystemReserve deployed to: ${ecosystemReserveTarget}`);

  const AXM = await AXMFactory.deploy(signer.address, mainTreasuryTarget, ecosystemReserveTarget);
  await AXM.waitForDeployment();
  const axmTarget = await AXM.getAddress();
  console.log(`AXM (Tokenomics) deployed to: ${axmTarget}`);

  const FounderCommitmentFactory = await hre.ethers.getContractFactory("FounderCommitment", signer);
  const FounderCommitment = await FounderCommitmentFactory.deploy(founderHash);
  await FounderCommitment.waitForDeployment();
  const founderCommitmentTarget = await FounderCommitment.getAddress();
  console.log(`FounderCommitment deployed to: ${founderCommitmentTarget}`);

  const ComputeBondFactory = await hre.ethers.getContractFactory("ComputeBond", signer);
  const ComputeBond = await ComputeBondFactory.deploy();
  await ComputeBond.waitForDeployment();
  const computeBondTarget = await ComputeBond.getAddress();
  console.log(`ComputeBond deployed to: ${computeBondTarget}`);

  const FounderShareManagerFactory = await hre.ethers.getContractFactory("FounderShareManager", signer);
  const FounderShareManager = await FounderShareManagerFactory.deploy(founderCommitmentTarget, computeBondTarget);
  await FounderShareManager.waitForDeployment();
  const founderShareManagerTarget = await FounderShareManager.getAddress();
  console.log(`FounderShareManager deployed to: ${founderShareManagerTarget}`);

  const CognitiveVerifierFactory = await hre.ethers.getContractFactory("CognitiveFrictionVerifier", signer);
  const CognitiveVerifier = await CognitiveVerifierFactory.deploy();
  await CognitiveVerifier.waitForDeployment();
  const cognitiveVerifierTarget = await CognitiveVerifier.getAddress();
  console.log(`CognitiveFrictionVerifier deployed to: ${cognitiveVerifierTarget}`);

  const PulseAdapterFactory = await hre.ethers.getContractFactory("PulseAdapter", signer);
  const PulseAdapter = await PulseAdapterFactory.deploy(axmTarget);
  await PulseAdapter.waitForDeployment();
  const pulseAdapterTarget = await PulseAdapter.getAddress();
  console.log(`PulseAdapter deployed to: ${pulseAdapterTarget}`);

  const ProveXWrapperFactory = await hre.ethers.getContractFactory("ProveXVerifierWrapper", signer);
  const ProveXWrapper = await ProveXWrapperFactory.deploy(cognitiveVerifierTarget);
  await ProveXWrapper.waitForDeployment();
  const proveXWrapperTarget = await ProveXWrapper.getAddress();
  console.log(`ProveXVerifierWrapper deployed to: ${proveXWrapperTarget}`);

  const layerZeroEndpoints = {
    ethereum: "0x1a44076050125825900e736c501f859c50fE728c",
    base: "0x1a44076050125825900e736c501f859c50fE728c",
    arbitrumOne: "0x1a44076050125825900e736c501f859c50fE728c",
    localhost: "0x0000000000000000000000000000000000000001"
  };

  const lzEndpoint = layerZeroEndpoints[networkName] || layerZeroEndpoints.localhost;

  const CitizenshipFactory = await hre.ethers.getContractFactory("CitizenshipNFT", signer);
  const citizenship = await CitizenshipFactory.deploy();
  await citizenship.waitForDeployment();
  const citizenshipTarget = await citizenship.getAddress();

  const AllocatorFactory = await hre.ethers.getContractFactory("DynamicResourceAllocator", signer);
  const allocator = await AllocatorFactory.deploy(signer.address);
  await allocator.waitForDeployment();
  const allocatorTarget = await allocator.getAddress();

  const PoolFactory = await hre.ethers.getContractFactory("UniversalDistributionPool", signer);
  const Pool = await PoolFactory.deploy(founderCommitmentTarget, allocatorTarget, computeBondTarget, citizenshipTarget);
  await Pool.waitForDeployment();
  const poolTarget = await Pool.getAddress();
  console.log(`UniversalDistributionPool deployed to: ${poolTarget}`);

  const WeightOracleFactory = await hre.ethers.getContractFactory("WeightOracle", signer);
  const weightOracle = await WeightOracleFactory.deploy();
  await weightOracle.waitForDeployment();
  const weightOracleTarget = await weightOracle.getAddress();

  const DAOFactory = await hre.ethers.getContractFactory("ZoverionsDAO", signer);
  const DAO = await DAOFactory.deploy(axmTarget, weightOracleTarget, signer.address);
  await DAO.waitForDeployment();
  const daoTarget = await DAO.getAddress();
  console.log(`ZoverionsDAO deployed to: ${daoTarget}`);

  const ShadowFactory = await hre.ethers.getContractFactory("ShadowBridge", signer);
  const Shadow = await ShadowFactory.deploy(founderCommitmentTarget);
  await Shadow.waitForDeployment();
  const shadowTarget = await Shadow.getAddress();
  console.log(`ShadowBridge deployed to: ${shadowTarget}`);

  const BridgeFactory = await hre.ethers.getContractFactory("CrossChainBridge", signer);
  const Bridge = await BridgeFactory.deploy(lzEndpoint, founderCommitmentTarget, poolTarget, shadowTarget);
  await Bridge.waitForDeployment();
  const bridgeTarget = await Bridge.getAddress();
  console.log(`CrossChainBridge deployed to: ${bridgeTarget}`);

  console.log("Wiring contracts...");
  await (await FounderCommitment.initialize(signer.address)).wait();
  await (await FounderShareManager.setPulseAdapter(pulseAdapterTarget)).wait();
  await (await FounderShareManager.setProveXWrapper(proveXWrapperTarget)).wait();

  const output = {
    network: networkName,
    deployer: signer.address,
    deployedAt: new Date().toISOString(),
    contracts: {
      AXM: axmTarget,
      MainTreasury: mainTreasuryTarget,
      EcosystemReserve: ecosystemReserveTarget,
      FounderCommitment: founderCommitmentTarget,
      ComputeBond: computeBondTarget,
      FounderShareManager: founderShareManagerTarget,
      CognitiveFrictionVerifier: cognitiveVerifierTarget,
      PulseAdapter: pulseAdapterTarget,
      ProveXVerifierWrapper: proveXWrapperTarget,
      UniversalDistributionPool: poolTarget,
      ZoverionsDAO: daoTarget,
      ShadowBridge: shadowTarget,
      CrossChainBridge: bridgeTarget
    }
  };

  const outPath = path.resolve("deployments", `${networkName}-multichain.json`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));

  console.log(`Saved deployment manifest: ${outPath}`);
}

async function main() {
  if (!process.env.PRIVATE_KEY) {
    console.log("No PRIVATE_KEY set.");
    process.exit(1);
  }

  const signers = await hre.ethers.getSigners();
  const deployer = signers[0];
  await deployOnNetwork(hre.network.name, deployer);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
