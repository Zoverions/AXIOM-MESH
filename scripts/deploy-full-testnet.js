#!/usr/bin/env node
/* eslint-disable no-console */

const hre = require("hardhat");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

async function deploy(name, args = []) {
  const Factory = await hre.ethers.getContractFactory(name);
  const contract = await Factory.deploy(...args);
  const receipt = await contract.deploymentTransaction().wait();
  await contract.waitForDeployment();
  const address = await contract.getAddress();
  console.log(`${name}: ${address}`);
  return { address, txHash: receipt.hash, blockNumber: receipt.blockNumber };
}

function currentCommit() {
  try {
    return execSync("git rev-parse HEAD", { encoding: "utf-8" }).trim();
  } catch {
    return "unknown";
  }
}

function isoDateTag() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function main() {
  console.log("Deploying AXIOM-MESH transformer foundation bundle...");

  const [deployer] = await hre.ethers.getSigners();
  console.log(`Deployer: ${deployer.address}`);

  const network = await hre.ethers.provider.getNetwork();
  const chainId = Number(network.chainId);
  if (chainId !== 943) {
    throw new Error(`Expected PulseChain testnet chainId 943, received ${chainId}`);
  }

  // NOTE: constructor args use deployer for bootstrap defaults unless overridden
  // in a follow-up governance deployment pipeline.
  const axm = await deploy("AXM", [deployer.address, deployer.address, deployer.address]);
  const friction = await deploy("CognitiveFrictionVerifier", []);
  const pulse = await deploy("PulseAdapter", [axm.address]);
  const proveX = await deploy("ProveXVerifierWrapper", [friction.address]);
  const capsule = await deploy("SkillCapsuleLauncher", []);
  const hex = await deploy("HEXStaker", []);
  const swarm = await deploy("SwarmCoordinator", []);
  const consent = await deploy("UniversalConsentProtocol", []);

  // FounderShareManager and UniversalDistributionPool in this repository depend
  // on broader protocol contracts; set externally in full deployment pipelines.
  // Deploy StigmergicStateChannel *last* as required by package.
  console.log("Skipping direct FounderShareManager/UniversalDistributionPool deployment in generic script.");
  console.log("StigmergicStateChannel must be deployed last once dependencies are available.");

  const bundle = {
    generatedAt: new Date().toISOString(),
    commit: currentCommit(),
    network: {
      name: hre.network.name,
      chainId,
      rpcUrl: process.env.PULSECHAIN_TESTNET_RPC_URL || "https://rpc.v4.testnet.pulsechain.com",
    },
    deployer: deployer.address,
    contracts: {
      AXM: axm,
      CognitiveFrictionVerifier: friction,
      PulseAdapter: pulse,
      ProveXVerifierWrapper: proveX,
      SkillCapsuleLauncher: capsule,
      HEXStaker: hex,
      SwarmCoordinator: swarm,
      UniversalConsentProtocol: consent,
    },
    notes: [
      "FounderShareManager/UniversalDistributionPool wiring remains external to this script.",
      "StigmergicStateChannel deployment requires externally managed FounderShareManager and UniversalDistributionPool addresses."
    ]
  };

  const outputDir =
    process.env.OUTPUT_DIR ||
    path.resolve("evidence", "deployments", `PULSECHAIN-TESTNET-${isoDateTag()}`);
  fs.mkdirSync(outputDir, { recursive: true });
  const outFile = path.join(outputDir, "transformer-foundation-deployment.json");
  fs.writeFileSync(outFile, `${JSON.stringify(bundle, null, 2)}\n`, "utf-8");

  console.log(`Wrote deployment evidence: ${outFile}`);
  console.log(JSON.stringify(bundle, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
