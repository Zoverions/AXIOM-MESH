#!/usr/bin/env node
// Regenerates mesh/test/fixtures/hostile-input-baseline.json from the generic
// top-level hostile-input probe. The baseline is data produced by this script;
// never edit it by hand.
//
//   node test-support/hostile-input-baseline.mjs            # report only
//   node test-support/hostile-input-baseline.mjs --write    # write; shrink only
//   node test-support/hostile-input-baseline.mjs --write --allow-growth
//
// --write refuses to record a new failing pair, a changed failure class or a new
// export with failures unless --allow-growth is given, so the baseline can only
// shrink in an ordinary change.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

import {
  BASELINE_PATH,
  BASELINE_SCHEMA,
  compareWithBaseline,
  probeAllExports,
  summarizeBaseline
} from './hostile-input-contract.mjs';

const write = process.argv.includes('--write');
const allowGrowth = process.argv.includes('--allow-growth');

const observed = await probeAllExports();
const current = existsSync(BASELINE_PATH) ? JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) : null;
const problems = current ? compareWithBaseline(observed, current) : [];
const growth = problems.filter(problem =>
  problem.kind === 'new-failure'
  || problem.kind === 'changed-class'
  || (problem.kind === 'unregistered-export' && Object.keys(problem.failures).length > 0));

const report = {
  baseline: BASELINE_PATH.split(/[\\/]/).slice(-3).join('/'),
  before: current ? summarizeBaseline(current) : null,
  after: summarizeBaseline(observed),
  fixed_pairs: problems.filter(problem => problem.kind === 'fixed-but-listed').length,
  growth: growth.length,
  changes: problems
};

if (write && current && growth.length && !allowGrowth) {
  console.log(JSON.stringify(report, null, 2));
  console.error('Refusing to grow the hostile-input baseline; fix the new failures or pass --allow-growth.');
  process.exit(1);
}
if (write) {
  const document = { schema: BASELINE_SCHEMA, generated_by: 'node test-support/hostile-input-baseline.mjs --write', ...observed };
  writeFileSync(BASELINE_PATH, `${JSON.stringify(document, null, 2)}\n`);
}
console.log(JSON.stringify({ ...report, changes: report.changes.length, written: write }, null, 2));
