import { pathToFileURL } from 'node:url';
import {
  runLinuxResourceEnforcementDrill
} from './linux-resource-enforcement-drill.mjs';

export async function main() {
  const workspaceDir = process.argv[2];
  const sourceRevision = process.env.GITHUB_SHA || process.argv[3];
  const allowEffects = (
    process.env.AXIOM_HOST_RESOURCE_ENFORCEMENT_LAB === '1'
  );
  const evidence = await runLinuxResourceEnforcementDrill({
    workspaceDir,
    sourceRevision,
    allowEffects
  });
  process.stdout.write(`${JSON.stringify(evidence)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
