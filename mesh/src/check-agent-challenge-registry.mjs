import { access, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  validateAgentChallengeRegistry,
  validateAgentCommonsDiscovery
} from './lib/agent-challenge-registry.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '../..');

const PATHS = Object.freeze({
  registry: 'agent-commons/challenges.json',
  discovery: 'agent-commons/manifest.json',
  challenge: 'docs/architecture/contracts/agent-challenge.v1.schema.json',
  feedback: 'docs/architecture/contracts/agent-feedback.v1.schema.json',
  canonicalResult: 'agent-readiness/CONTRIBUTION-RESULT.schema.json',
  obsoleteDuplicateResult: 'docs/architecture/contracts/agent-contribution.v1.schema.json'
});

async function readJson(relativePath) {
  return JSON.parse(await readFile(resolve(REPO_ROOT, relativePath), 'utf8'));
}

async function exists(relativePath) {
  try {
    await access(resolve(REPO_ROOT, relativePath));
    return true;
  } catch {
    return false;
  }
}

export async function checkAgentChallengeRegistry() {
  const [registry, discovery] = await Promise.all([
    readJson(PATHS.registry),
    readJson(PATHS.discovery)
  ]);
  const registryResult = validateAgentChallengeRegistry(registry);
  const discoveryResult = validateAgentCommonsDiscovery(discovery);

  for (const relativePath of [
    PATHS.registry,
    PATHS.challenge,
    PATHS.feedback,
    PATHS.canonicalResult,
    discovery.human_entrypoint,
    discovery.agent_entrypoint,
    discovery.security_policy
  ]) {
    if (!(await exists(relativePath))) {
      throw new Error(`Agent Commons registry references missing path: ${relativePath}`);
    }
  }
  if (await exists(PATHS.obsoleteDuplicateResult)) {
    throw new Error('Agent Commons registry must not revive the obsolete generic contribution schema');
  }
  if (
    discovery.challenge_registry !== PATHS.registry
    || discovery.challenge_contract !== PATHS.challenge
    || discovery.feedback_contract !== PATHS.feedback
    || discovery.contribution_result_contract !== PATHS.canonicalResult
  ) {
    throw new Error('Agent Commons discovery manifest contract path binding drifted');
  }

  return Object.freeze({
    ok: true,
    registry_schema: registryResult.schema,
    registry_base_sha: registryResult.base_sha,
    challenges: registryResult.challenges,
    open_challenges: registryResult.counts.open,
    discovery_schema: discoveryResult.schema,
    canonical_result_contract: discoveryResult.contribution_result_contract,
    authority_effect: 'none'
  });
}

async function main() {
  process.stdout.write(`${JSON.stringify(await checkAgentChallengeRegistry())}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
