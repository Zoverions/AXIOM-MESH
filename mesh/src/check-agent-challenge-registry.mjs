import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { validateAgentChallengeRegistry } from './lib/agent-challenge-registry.mjs';

const MESH_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REPOSITORY_ROOT = resolve(MESH_ROOT, '..');
export const DEFAULT_AGENT_CHALLENGE_REGISTRY_PATH = resolve(
  REPOSITORY_ROOT,
  'agent-commons',
  'challenges.json'
);

export async function checkAgentChallengeRegistry(
  registryPath = DEFAULT_AGENT_CHALLENGE_REGISTRY_PATH
) {
  const document = JSON.parse(await readFile(registryPath, 'utf8'));
  return validateAgentChallengeRegistry(document);
}

async function main() {
  const result = await checkAgentChallengeRegistry();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
