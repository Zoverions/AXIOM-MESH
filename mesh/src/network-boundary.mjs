import { pathToFileURL } from 'node:url';
import { meshConfig } from './lib/config.mjs';
import {
  EVIDENCE_SCHEMA,
  OUTBOUND_PROBE,
  assertDenyEgressBoundary,
  inspectLinuxRouteTables,
  probeTcpConnection,
  runDenyEgressDrill as runSignedDenyEgressDrill,
  verifyDenyEgressEvidence
} from './_network-boundary-signed.mjs';

export {
  EVIDENCE_SCHEMA,
  OUTBOUND_PROBE,
  assertDenyEgressBoundary,
  inspectLinuxRouteTables,
  probeTcpConnection,
  verifyDenyEgressEvidence
};

export function runDenyEgressDrill(options = {}) {
  return runSignedDenyEgressDrill({
    config: options.config ?? meshConfig(),
    ...options
  });
}

async function main() {
  const evidence = await runDenyEgressDrill();
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
