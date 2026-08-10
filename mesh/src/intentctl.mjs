#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import {
  compileIntentContract,
  assessIntentGraph,
  reconcileIntentGraph
} from './lib/intent-contract.mjs';

export function intentCtlHelp() {
  return `AXIOM Intent contract tools\n\nUsage:\n  node src/intentctl.mjs compile <contract.json>\n  node src/intentctl.mjs assess <contract.json> <observations.json>\n  node src/intentctl.mjs reconcile <contract.json> <observations.json>\n\nCommands:\n  compile       Validate and deterministically compile an Intent Contract into an Intent Graph\n  assess        Compare observed evidence with the compiled requirements\n  reconcile     Produce a fail-closed reconciliation state and authority-classified remediation plan\n\nThis v0.1 tool does not execute remediation actions. It compiles, assesses, and classifies only.\n`;
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
  const [command, contractPath, observationsPath] = argv;
  if (!command || command === 'help' || command === '--help' || command === '-h') {
    return { help: intentCtlHelp() };
  }
  if (!['compile', 'assess', 'reconcile'].includes(command)) {
    throw new Error(`Unknown AXIOM Intent command: ${command}`);
  }
  if (!contractPath) {
    throw new Error(`Usage: node src/intentctl.mjs ${command} <contract.json>${command === 'compile' ? '' : ' <observations.json>'}`);
  }
  const contract = await readJson(contractPath, readFileImpl);
  const graph = compileIntentContract(contract);
  if (command === 'compile') return graph;
  if (!observationsPath) {
    throw new Error(`Usage: node src/intentctl.mjs ${command} <contract.json> <observations.json>`);
  }
  const observations = await readJson(observationsPath, readFileImpl);
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
