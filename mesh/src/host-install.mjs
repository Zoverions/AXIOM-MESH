import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { ValidationError } from './lib/canonical.mjs';
import {
  buildHostInstallPlan,
  collectHostFacts,
  validateHostInstallPlan,
  validateHostInstallPolicy
} from './lib/host-install-plan.mjs';
import {
  verifyInstallReleaseArtifact,
  verifyInstallReleaseManifest
} from './lib/install-release-manifest.mjs';

const USAGE = [
  'Usage: node src/host-install.mjs policy-check',
  '  | plan <personal-local|infrastructure-node> [--facts <json-file>]',
  '  | verify-manifest <manifest-package.json> <trusted-signers.json> <evaluated-at>',
  '  | verify-artifact <manifest-package.json> <artifact-id> <artifact-file>'
].join('');

export async function hostInstallMain(argv = process.argv.slice(2)) {
  const [command, ...args] = argv;
  if (command === 'policy-check' && args.length === 0) {
    return validateHostInstallPolicy();
  }
  if (command === 'plan') {
    return planHostInstall(args);
  }
  if (command === 'verify-manifest') {
    return verifyManifestCommand(args);
  }
  if (command === 'verify-artifact') {
    return verifyArtifactCommand(args);
  }
  throw new ValidationError(USAGE);
}

async function planHostInstall(args) {
  const [profileId, ...rest] = args;
  if (!profileId) throw new ValidationError(USAGE);
  let hostFacts;
  if (rest.length === 0) {
    hostFacts = await collectHostFacts();
  } else if (rest.length === 2 && rest[0] === '--facts') {
    hostFacts = await readJsonFile(rest[1], 'host facts');
  } else {
    throw new ValidationError('Host install planner arguments are invalid');
  }
  const plan = buildHostInstallPlan({ profileId, hostFacts });
  validateHostInstallPlan(plan);
  return plan;
}

async function verifyManifestCommand(args) {
  if (args.length !== 3) throw new ValidationError(USAGE);
  const [packagePath, trustedSignersPath, evaluatedAt] = args;
  const packageValue = await readJsonFile(packagePath, 'install release manifest package');
  const trustedSigners = await readJsonFile(trustedSignersPath, 'trusted release signers');
  return verifyInstallReleaseManifest(packageValue, { trustedSigners, evaluatedAt });
}

async function verifyArtifactCommand(args) {
  if (args.length !== 3) throw new ValidationError(USAGE);
  const [packagePath, artifactId, artifactPath] = args;
  const packageValue = await readJsonFile(packagePath, 'install release manifest package');
  const artifacts = packageValue?.manifest?.artifacts;
  if (!Array.isArray(artifacts)) {
    throw new ValidationError('Install release manifest package has no artifact inventory');
  }
  const matches = artifacts.filter(artifact => artifact?.artifact_id === artifactId);
  if (matches.length !== 1) {
    throw new ValidationError(`Install release artifact id must resolve exactly once: ${artifactId}`);
  }
  let bytes;
  try {
    bytes = await readFile(artifactPath);
  } catch (error) {
    throw new ValidationError(`Unable to load install release artifact: ${error.message}`);
  }
  return {
    ...verifyInstallReleaseArtifact(matches[0], bytes),
    manifest_signature_verified: false,
    release_id: typeof packageValue?.manifest?.release_id === 'string'
      ? packageValue.manifest.release_id
      : null
  };
}

async function readJsonFile(path, label) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    throw new ValidationError(`Unable to load ${label}: ${error.message}`);
  }
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
