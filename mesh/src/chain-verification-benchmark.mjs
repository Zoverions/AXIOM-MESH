#!/usr/bin/env node

import { pathToFileURL } from 'node:url';
import { ValidationError } from './lib/canonical.mjs';
import {
  EVIDENCE_SCHEMA,
  runChainVerificationBenchmark as runCoreBenchmark,
  verifyChainVerificationBenchmarkEvidence
} from './_chain-verification-benchmark-core.mjs';

const MAX_COMMIT_BATCH = 32;

export { EVIDENCE_SCHEMA, verifyChainVerificationBenchmarkEvidence };

export function runChainVerificationBenchmark(options = {}) {
  const batchSize = options.batchSize ?? MAX_COMMIT_BATCH;
  if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > MAX_COMMIT_BATCH) {
    throw new ValidationError(
      `Chain benchmark batch size must be an integer between 1 and ${MAX_COMMIT_BATCH}`
    );
  }
  return runCoreBenchmark({ ...options, batchSize });
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!flag?.startsWith('--') || value === undefined) {
      throw new ValidationError('Chain benchmark arguments must be --name value pairs');
    }
    options[flag.slice(2)] = value;
  }
  return options;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const evidence = await runChainVerificationBenchmark({
    eventCount: Number(args.events ?? 50_000),
    batchSize: Number(args['batch-size'] ?? MAX_COMMIT_BATCH),
    checkpointInterval: Number(args['checkpoint-interval'] ?? 10_000),
    workspaceDir: args.workspace
  });
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
