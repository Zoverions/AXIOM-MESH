#!/usr/bin/env node
/* eslint-disable no-console */

const hre = require("hardhat");

async function deploy(name, args = []) {
  const Factory = await hre.ethers.getContractFactory(name);
  const contract = await Factory.deploy(...args);
  await contract.waitForDeployment();
  const address = await contract.getAddress();
  console.log(`${name}: ${address}`);
  return address;
}

async function main() {
  console.log("Deploying AXIOM-MESH transformer foundation bundle...");

  const [deployer] = await hre.ethers.getSigners();
  console.log(`Deployer: ${deployer.address}`);

  // NOTE: constructor args are placeholders for testnet bootstrapping and can
  // be replaced by deployment pipeline env vars.
  const axm = await deploy("AXM", [deployer.address, deployer.address, deployer.address]);
  const friction = await deploy("CognitiveFrictionVerifier", []);
  const pulse = await deploy("PulseAdapter", [axm]);
  const proveX = await deploy("ProveXVerifierWrapper", [friction]);
  const capsule = await deploy("SkillCapsuleLauncher", []);
  const hex = await deploy("HEXStaker", []);
  const swarm = await deploy("SwarmCoordinator", []);
  const consent = await deploy("UniversalConsentProtocol", []);

  // FounderShareManager and UniversalDistributionPool in this repository depend
  // on broader protocol contracts; set externally in full deployment pipelines.
  // Deploy StigmergicStateChannel *last* as required by package.
  console.log("Skipping direct FounderShareManager/UniversalDistributionPool deployment in generic script.");
  console.log("StigmergicStateChannel must be deployed last once dependencies are available.");

  console.log(
    JSON.stringify(
      { axm, friction, pulse, proveX, capsule, hex, swarm, consent },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
