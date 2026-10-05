import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { validateAgentChallengeRegistry } from './lib/agent-challenge-registry.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(HERE, '../..');
const REGISTRY_PATH = resolve(REPOSITORY_ROOT, 'agent-commons/challenges.json');

export async function checkAgentChallengeRegistry() {
  const registry = JSON.parse(await readFile(REGISTRY_PATH, 'utf8'));
  return validateAgentChallengeRegistry(registry);
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
