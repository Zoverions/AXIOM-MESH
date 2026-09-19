import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  validateCapabilityRegistry,
  validateCapabilityEvidenceBindings
} from './check-registry.mjs';
import { verifyCanonicalDocumentation } from './check-docs.mjs';
import { validateServiceNetworkPolicy } from './lib/service-network-policy.mjs';
import { buildInterrogationPlane } from './lib/interrogation-plane.mjs';

const MESH_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const DEFAULT_REPOSITORY_ROOT = dirname(MESH_ROOT);

export async function generateInterrogationPlane({
  repositoryRoot = DEFAULT_REPOSITORY_ROOT
} = {}) {
  const registryPath = resolve(repositoryRoot, 'mesh/config/capabilities.json');
  const bindingsPath = resolve(
    repositoryRoot,
    'mesh/config/capability-evidence-bindings.json'
  );
  const networkPolicyPath = resolve(
    repositoryRoot,
    'mesh/config/service-network-policy.json'
  );

  const [capabilityRegistry, evidenceBindings, serviceNetworkPolicy] = await Promise.all([
    readJson(registryPath),
    readJson(bindingsPath),
    readJson(networkPolicyPath)
  ]);

  const registry = validateCapabilityRegistry(capabilityRegistry);
  const evidence = await validateCapabilityEvidenceBindings(capabilityRegistry, {
    repositoryRoot,
    bindingsPath
  });
  const network = validateServiceNetworkPolicy(serviceNetworkPolicy);
  const documentation = await verifyCanonicalDocumentation(repositoryRoot);

  return buildInterrogationPlane({
    capabilityRegistry,
    evidenceBindings,
    serviceNetworkPolicy,
    verification: {
      registry,
      evidence_bindings: evidence,
      service_network: {
        valid: network.valid,
        schema: network.schema,
        kernel_version: network.kernel_version,
        default_action: network.default_action,
        segments: network.segments,
        flows: network.flows,
        routes: network.routes,
        policy_digest: network.policy_digest
      },
      documentation
    }
  });
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Interrogation Plane source is not valid JSON: ${path}`);
    }
    throw error;
  }
}

async function main() {
  const report = await generateInterrogationPlane();
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
