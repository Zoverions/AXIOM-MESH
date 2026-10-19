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
      'Usage: node src/host-install.mjs policy-check | plan <personal-local|infrastructure-node> [--runtime <oci|source>] [--facts <json-file>]'
    );
  }

  let runtimeStrategy = 'oci';
  let factsPath = null;
  for (let index=0; index<rest.length; index+=1) {
    const flag = rest[index];
    const value = rest[index+1];
    if (flag === '--runtime' && value) {
      runtimeStrategy = value;
      index += 1;
    } else if (flag === '--facts' && value) {
      factsPath = value;
      index += 1;
    } else {
      throw new ValidationError('Host install planner arguments are invalid');
    }
  }

  let hostFacts;
  if (factsPath === null) {
    hostFacts = await collectHostFacts();
  } else {
    let source;
    try {
      source = await readFile(factsPath,'utf8');
    } catch (error) {
      throw new ValidationError(`Unable to read host facts file${error?.code ? ` (${error.code})` : ''}`);
    }
    let supplied;
    try {
      supplied = JSON.parse(source);
    } catch {
      // Never echo file content: a mistaken path can point at a secret.
      throw new ValidationError('Host facts file is not valid JSON');
    }
    hostFacts = {
      ...supplied,
      facts_source: 'supplied-evidence'
    };
  }

  const plan = buildHostInstallPlan({
    profileId,
    hostFacts,
    runtimeStrategy
  });
  validateHostInstallPlan(plan);
  return plan;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await hostInstallMain();
    process.stdout.write(`${JSON.stringify(result,null,2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.name ?? 'Error'}: ${error.message}\n`);
    process.exitCode = 1;
  }
}
