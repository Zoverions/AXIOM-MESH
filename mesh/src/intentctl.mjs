#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import {
  compileIntentContract,
  assessIntentGraph,
  reconcileIntentGraph
} from './lib/intent-contract.mjs';
import {
  activationGovernanceAction,
  attestationMemoryInput,
  buildIntentActivationRecord,
  buildIntentAttestationRecord
} from './lib/intent-grid-evidence.mjs';

export function intentCtlHelp() {
  return `AXIOM Intent contract tools\n\nUsage:\n  node src/intentctl.mjs compile <contract.json>\n  node src/intentctl.mjs assess <contract.json> <observations.json>\n  node src/intentctl.mjs reconcile <contract.json> <observations.json>\n  node src/intentctl.mjs prepare-activation <contract.json> <build.json> [supersedes-activation-digest]\n  node src/intentctl.mjs prepare-attestation <activation.json> <attestation-input.json>\n\nCommands:\n  compile              Validate and deterministically compile an Intent Contract into an Intent Graph\n  assess               Compare untrusted local observations with compiled requirements\n  reconcile            Produce a local fail-closed reconciliation and authority classification\n  prepare-activation   Build the digest-bound record.decision payload for ordinary AXIOM governance\n  prepare-attestation  Build a content-addressed intent.evidence.attested memory.put input\n\nTrust boundary:\n  Local assess/reconcile inputs remain non-authoritative laboratory data. Grid-authenticated v0.2 assessment is derived by GridStore from activated governance records and authenticated verifier memory records. Neither v0.1 nor v0.2 reconciliation executes remediation.\n`;
}

async function readJson(path, readFileImpl) {
  let text;
  try {
    text = await readFileImpl(path, 'utf8');
  } catch (error) {
    throw new Error(`Unable to read ${path}: ${error.message}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${path} must contain valid JSON`);
  }
}

export async function runIntentCtl(argv, { readFileImpl = readFile } = {}) {
  const [command, firstPath, secondPath, thirdArgument] = argv;
  if (!command || command === 'help' || command === '--help' || command === '-h') {
    return { help: intentCtlHelp() };
  }
  const supported = new Set([
    'compile',
    'assess',
    'reconcile',
    'prepare-activation',
    'prepare-attestation'
  ]);
  if (!supported.has(command)) {
    throw new Error(`Unknown AXIOM Intent command: ${command}`);
  }
  if (!firstPath) throw new Error(`AXIOM Intent ${command} requires an input file`);

  if (command === 'prepare-activation') {
    if (!secondPath) {
      throw new Error(
        'Usage: node src/intentctl.mjs prepare-activation <contract.json> <build.json> [supersedes-activation-digest]'
      );
    }
    const [contract, build] = await Promise.all([
      readJson(firstPath, readFileImpl),
      readJson(secondPath, readFileImpl)
    ]);
    const activation = buildIntentActivationRecord(contract, build, {
      supersedesActivationDigest: thirdArgument ?? null
    });
    return {
      activation,
      governance_action: activationGovernanceAction(activation),
      submit_with: 'governance.propose',
      requires_existing_governance_flow: true
    };
  }

  if (command === 'prepare-attestation') {
    if (!secondPath) {
      throw new Error(
        'Usage: node src/intentctl.mjs prepare-attestation <activation.json> <attestation-input.json>'
      );
    }
    const [activation, input] = await Promise.all([
      readJson(firstPath, readFileImpl),
      readJson(secondPath, readFileImpl)
    ]);
    const attestation = buildIntentAttestationRecord(activation, input);
    return {
      attestation,
      memory_input: attestationMemoryInput(attestation),
      submit_with: 'memory.put',
      verifier_must_match_authenticated_principal: true
    };
  }

  const contract = await readJson(firstPath, readFileImpl);
  const graph = compileIntentContract(contract);
  if (command === 'compile') return graph;
  if (!secondPath) {
    throw new Error(`Usage: node src/intentctl.mjs ${command} <contract.json> <observations.json>`);
  }
  const observations = await readJson(secondPath, readFileImpl);
  if (command === 'assess') return assessIntentGraph(graph, observations);
  return reconcileIntentGraph(graph, observations);
}

async function main() {
  const result = await runIntentCtl(process.argv.slice(2));
  if (result.help) process.stdout.write(result.help);
  else process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await main();
  } catch (error) {
    process.stderr.write(`AXIOM Intent error: ${error.message}\n`);
    process.exitCode = 1;
  }
}
