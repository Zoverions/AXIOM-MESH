import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { ValidationError } from './lib/canonical.mjs';
import {
  buildHostInstallPlan,
  collectHostFacts,
  validateHostInstallPlan,
  validateHostInstallPolicy
} from './lib/host-install-plan.mjs';

export async function hostInstallMain(argv = process.argv.slice(2)) {
  const [command, profileId, ...rest] = argv;
  if (command === 'policy-check' && profileId === undefined) {
    return validateHostInstallPolicy();
  }
  if (command !== 'plan' || !profileId) {
    throw new ValidationError(
      'Usage: node src/host-install.mjs policy-check | plan <personal-local|infrastructure-node> [--facts <json-file>]'
    );
  }
  let hostFacts;
  if (rest.length === 0) {
    hostFacts = await collectHostFacts();
  } else if (rest.length === 2 && rest[0] === '--facts') {
    let parsed;
    try {
      parsed = JSON.parse(await readFile(rest[1], 'utf8'));
    } catch (error) {
      throw new ValidationError(`Unable to load host facts: ${error.message}`);
    }
    hostFacts = parsed;
  } else {
    throw new ValidationError('Host install planner arguments are invalid');
  }
  const plan = buildHostInstallPlan({ profileId, hostFacts });
  validateHostInstallPlan(plan);
  return plan;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await hostInstallMain();
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.name ?? 'Error'}: ${error.message}\n`);
    process.exitCode = 1;
  }
}
