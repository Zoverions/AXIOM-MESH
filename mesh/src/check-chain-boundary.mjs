import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { ValidationError } from './lib/canonical.mjs';
import { validateChainBoundarySchema } from './lib/chain-boundary-contracts.mjs';
import { validateChainNetworkProfileCatalog } from './lib/chain-network-profiles.mjs';
import {
  validateChainReadAdapterCatalog,
  validateChainReadAdapterSchema
} from './lib/chain-read-adapter-contracts.mjs';

const CHAIN_SCHEMA_URL = new URL('../../docs/architecture/contracts/chain-boundary.v1.schema.json', import.meta.url);
const ADAPTER_SCHEMA_URL = new URL('../../docs/architecture/contracts/chain-read-adapter.v1.schema.json', import.meta.url);
const PROFILE_CATALOG_URL = new URL('../config/chain-network-profiles.v0.json', import.meta.url);
const ADAPTER_CATALOG_URL = new URL('../config/chain-read-adapters.v0.json', import.meta.url);
const CAPABILITIES_URL = new URL('../config/capabilities.json', import.meta.url);

function readJson(url, name) {
  try {
    return JSON.parse(readFileSync(url, 'utf8'));
  } catch {
    throw new ValidationError(`${name} is not valid JSON`);
  }
}

export function checkChainBoundary() {
  const chainSchema = readJson(CHAIN_SCHEMA_URL, 'chain boundary schema');
  const adapterSchema = readJson(ADAPTER_SCHEMA_URL, 'chain read adapter schema');
  const profiles = readJson(PROFILE_CATALOG_URL, 'chain network profile catalog');
  const adapters = readJson(ADAPTER_CATALOG_URL, 'chain read adapter catalog');
  const registry = readJson(CAPABILITIES_URL, 'capability registry');

  validateChainBoundarySchema(chainSchema);
  validateChainReadAdapterSchema(adapterSchema);
  validateChainNetworkProfileCatalog(profiles);
  validateChainReadAdapterCatalog(adapters);

  const profileById = new Map(profiles.profiles.map((profile) => [profile.profile_id, profile]));
  for (const adapter of adapters.adapters) {
    for (const profileId of adapter.supported_profile_ids) {
      const profile = profileById.get(profileId);
      if (!profile) throw new ValidationError(`chain read adapter references unknown profile ${profileId}`);
      if (profile.chain.adapter_family !== adapter.adapter_family) {
        throw new ValidationError(`chain read adapter family mismatch for ${profileId}`);
      }
    }
  }

  if (!Array.isArray(registry.capabilities)) throw new ValidationError('capability registry capabilities are invalid');
  const byId = new Map(registry.capabilities.map((entry) => [entry.id, entry]));
  if (byId.get('chain.observe')?.status !== 'specified') throw new ValidationError('chain.observe must remain specified');
  if (byId.get('chain.verify')?.status !== 'specified') throw new ValidationError('chain.verify must remain specified');
  if (byId.get('economics.token-bridge-liquidity')?.status !== 'disabled') {
    throw new ValidationError('economics.token-bridge-liquidity must remain disabled');
  }

  for (const forbidden of [
    'chain.transaction.sign',
    'chain.transaction.broadcast',
    'chain.contract.write',
    'chain.anchor.create',
    'chain.settlement.execute',
    'chain.bridge.execute'
  ]) {
    if (byId.has(forbidden)) throw new ValidationError(`${forbidden} must not be registered in the first slice`);
  }

  for (const profile of profiles.profiles) {
    if (
      profile.authority_boundary.profile_grants_authority
      || profile.authority_boundary.live_network_enabled
      || profile.authority_boundary.write_enabled
      || profile.rpc.endpoints.length !== 0
      || profile.rpc.credentials_required
    ) throw new ValidationError(`chain profile ${profile.profile_id} enables an unsupported authority/network surface`);
  }

  for (const adapter of adapters.adapters) {
    if (
      adapter.network_access.enabled
      || adapter.write_surface.enabled
      || adapter.signing_surface.enabled
      || adapter.bridge_execution.enabled
      || adapter.installation_grants_authority
    ) throw new ValidationError(`chain adapter ${adapter.adapter_id} enables an unsupported effect surface`);
  }

  return {
    schema: 'axiom-chain-boundary-check.v0',
    profiles: profiles.profiles.length,
    adapter_families: new Set(adapters.adapters.map((adapter) => adapter.adapter_family)).size,
    observation_status: byId.get('chain.observe').status,
    verification_status: byId.get('chain.verify').status,
    live_network_enabled: false,
    write_enabled: false,
    bridge_execution_enabled: false
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.stdout.write(`${JSON.stringify(checkChainBoundary())}\n`);
}
