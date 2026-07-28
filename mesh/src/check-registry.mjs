import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { meshConfig } from './lib/config.mjs';
import { ValidationError, digestObject } from './lib/canonical.mjs';

const STATUSES = new Set(['implemented', 'adapter_required', 'experimental', 'specified', 'disabled']);
export const CAPABILITY_REGISTRY_SCHEMA = 'axiom-capabilities.v1';
const REQUIRED_CAPABILITIES = new Set([
  'core.intent-loop',
  'core.evidence-chain',
  'core.layered-policy',
  'ai.providers',
  'memory.graph',
  'research.autonomy',
  'tools.scientific',
  'channels.messaging',
  'identity.ssi',
  'consent.receipts',
  'capsules.registry',
  'capsules.marketplace',
  'nodes.registry',
  'nodes.discovery-scheduling',
  'storage.offers',
  'storage.backup-restore',
  'offline.causal-sync',
  'governance.local-records',
  'governance.delegation-emergency-appeals',
  'domains.education',
  'domains.health',
  'domains.government',
  'domains.business-finance',
  'workforce.task-market-payroll-legacy',
  'workforce.embodied',
  'economics.accounting',
  'economics.token-bridge-liquidity',
  'zk.proof-verifiers',
  'portability.export',
  'portability.import',
  'ui.operator-api',
  'ui.cli',
  'ui.dashboard',
  'operations.installer-observability-release'
]);

export function validateCapabilityRegistry(registry) {
  if (!registry || !Array.isArray(registry.capabilities) || !registry.capabilities.length) {
    throw new ValidationError('Capability registry must contain capabilities');
  }
  if (registry.schema !== CAPABILITY_REGISTRY_SCHEMA) {
    throw new ValidationError(`Capability registry schema must be ${CAPABILITY_REGISTRY_SCHEMA}`);
  }
  if (!/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/.test(registry.kernel_version ?? '')) {
    throw new ValidationError('Capability registry kernel_version must be semantic');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(registry.verified_at ?? '')) {
    throw new ValidationError('Capability registry verified_at must be an ISO date');
  }
  const seen = new Set();
  const counts = {};
  for (const item of registry.capabilities) {
    if (!/^[a-z][a-z0-9.-]+$/.test(item.id ?? '')) throw new ValidationError('Capability id is invalid');
    if (seen.has(item.id)) throw new ValidationError(`Duplicate capability id: ${item.id}`);
    seen.add(item.id);
    if (!STATUSES.has(item.status)) throw new ValidationError(`Invalid status for ${item.id}`);
    if (typeof item.family !== 'string' || typeof item.summary !== 'string' || item.summary.length < 20) {
      throw new ValidationError(`Capability ${item.id} is missing family or summary metadata`);
    }
    if (item.status === 'implemented' && (!Array.isArray(item.evidence) || !item.evidence.length)) {
      throw new ValidationError(`Implemented capability ${item.id} must name executable evidence`);
    }
    counts[item.status] = (counts[item.status] ?? 0) + 1;
  }
  const missing = [...REQUIRED_CAPABILITIES].filter(id => !seen.has(id));
  if (missing.length) throw new ValidationError(`Capability registry is missing: ${missing.join(', ')}`);
  return {
    valid: true,
    schema: registry.schema,
    kernel_version: registry.kernel_version,
    verified_at: registry.verified_at,
    digest: digestObject(registry),
    capabilities: registry.capabilities.length,
    counts
  };
}

async function main() {
  const config = meshConfig();
  const registry = JSON.parse(await readFile(config.capabilitiesPath, 'utf8'));
  process.stdout.write(`${JSON.stringify(validateCapabilityRegistry(registry), null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
