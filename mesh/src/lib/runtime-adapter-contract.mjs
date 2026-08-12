import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { canonicalJson, sha256, ValidationError } from './canonical.mjs';

export const RUNTIME_ADAPTER_CONTRACT_ID = 'axiom.agent-runtime-adapter';
export const RUNTIME_ADAPTER_CONTRACT_VERSION = '1.0.0';
export const RUNTIME_ADAPTER_CONTRACT_SCHEMA = 'axiom-agent-runtime-adapter.v1';
export const RUNTIME_ADAPTER_CONTRACT_SCHEMA_ID =
  'urn:axiom:contract:agent-runtime-adapter:v1';
export const RUNTIME_ADAPTER_CONTRACT_SHA256 =
  '4954c3d1a49ea57fb0bf5a7eea29140b852e8b5fa2bb11634665f004aca2c19c';

const CONTRACT_URL = new URL(
  '../../../docs/architecture/contracts/agent-runtime-adapter.v1.schema.json',
  import.meta.url
);

const REQUIRED_MANIFEST_FIELDS = Object.freeze([
  'schema',
  'contract',
  'adapter_id',
  'adapter_version',
  'runtime',
  'implementation',
  'compatibility',
  'authority',
  'capability_translation',
  'data_handling',
  'execution',
  'evidence',
  'lifecycle'
]);

const REQUIRED_AUTHORITY_FIELDS = Object.freeze([
  'principal_id',
  'authority_source',
  'requested_capabilities',
  'install_grants_authority',
  'runtime_may_self_authorize',
  'runtime_approvals_are_authoritative',
  'grant_required_before_effect',
  'grant_signature_algorithm',
  'grant_key_pin_required',
  'grant_replay_protection',
  'grant_single_use',
  'maximum_grant_lifetime_ms',
  'authorization_recheck_before_effect',
  'revocation_preempts_runtime',
  'deny_unknown_effects',
  'receipts_required'
]);

export function verifyRuntimeAdapterContract() {
  const source = readFileSync(CONTRACT_URL);
  const actualSha256 = sha256(source);
  if (actualSha256 !== RUNTIME_ADAPTER_CONTRACT_SHA256) {
    throw new ValidationError(
      `Runtime adapter contract digest drifted: expected ${RUNTIME_ADAPTER_CONTRACT_SHA256}, received ${actualSha256}`
    );
  }

  let schema;
  try {
    schema = JSON.parse(source.toString('utf8'));
  } catch {
    throw new ValidationError('Runtime adapter contract is not valid JSON');
  }

  exactArray(schema.required, REQUIRED_MANIFEST_FIELDS, 'manifest required fields');
  exactArray(
    schema.properties?.authority?.required,
    REQUIRED_AUTHORITY_FIELDS,
    'authority required fields'
  );

  if (
    schema.$schema !== 'https://json-schema.org/draft/2020-12/schema'
    || schema.$id !== RUNTIME_ADAPTER_CONTRACT_SCHEMA_ID
    || schema.type !== 'object'
    || schema.additionalProperties !== false
    || schema.properties?.schema?.const !== RUNTIME_ADAPTER_CONTRACT_SCHEMA
    || schema.properties?.contract?.additionalProperties !== false
    || schema.properties?.contract?.properties?.contract_id?.const
      !== RUNTIME_ADAPTER_CONTRACT_ID
    || schema.properties?.contract?.properties?.contract_version?.const
      !== RUNTIME_ADAPTER_CONTRACT_VERSION
    || schema.properties?.runtime?.properties?.source_repository?.pattern !== '^https://'
    || schema.properties?.runtime?.properties?.source_repository?.maxLength !== 2048
    || schema.properties?.compatibility?.properties?.gateway_contracts?.uniqueItems !== true
    || schema.properties?.authority?.properties?.authority_source?.const !== 'axiom-gateway'
    || schema.properties?.authority?.properties?.install_grants_authority?.const !== false
    || schema.properties?.authority?.properties?.runtime_may_self_authorize?.const !== false
    || schema.properties?.authority?.properties?.runtime_approvals_are_authoritative?.const !== false
    || schema.properties?.authority?.properties?.grant_required_before_effect?.const !== true
    || schema.properties?.authority?.properties?.grant_signature_algorithm?.const !== 'Ed25519'
    || schema.properties?.authority?.properties?.grant_key_pin_required?.const !== true
    || schema.properties?.authority?.properties?.grant_replay_protection?.const !== true
    || schema.properties?.authority?.properties?.grant_single_use?.const !== true
    || schema.properties?.authority?.properties?.authorization_recheck_before_effect?.const !== true
    || schema.properties?.authority?.properties?.revocation_preempts_runtime?.const !== true
    || schema.properties?.authority?.properties?.deny_unknown_effects?.const !== true
    || schema.properties?.authority?.properties?.receipts_required?.const !== true
    || schema.properties?.capability_translation?.properties?.unmapped_behavior?.const !== 'deny'
    || schema.properties?.capability_translation?.properties?.mappings?.uniqueItems !== true
    || schema.properties?.execution?.properties?.failure_mode?.const !== 'deny'
    || schema.properties?.execution?.properties?.unknown_outcome?.const !== 'uncertain'
    || schema.properties?.execution?.properties?.fallback_requires_new_grant?.const !== true
    || schema.properties?.evidence?.properties?.bind_contract?.const !== true
    || schema.properties?.evidence?.properties?.bind_manifest?.const !== true
    || schema.properties?.evidence?.properties?.raw_chain_of_thought_required?.const !== false
  ) throw new ValidationError('Runtime adapter contract invariants are invalid');

  return Object.freeze({
    valid: true,
    contract_id: RUNTIME_ADAPTER_CONTRACT_ID,
    contract_version: RUNTIME_ADAPTER_CONTRACT_VERSION,
    contract_sha256: actualSha256,
    schema: RUNTIME_ADAPTER_CONTRACT_SCHEMA,
    schema_id: RUNTIME_ADAPTER_CONTRACT_SCHEMA_ID,
    capability_promoted: false,
    external_runtime_verified: false
  });
}

function exactArray(actual, expected, name) {
  if (
    !Array.isArray(actual)
    || canonicalJson([...actual].sort()) !== canonicalJson([...expected].sort())
  ) throw new ValidationError(`Runtime adapter contract ${name} are invalid`);
}

async function main() {
  if (process.argv.length !== 2) {
    throw new ValidationError('Usage: node src/lib/runtime-adapter-contract.mjs');
  }
  process.stdout.write(`${JSON.stringify(verifyRuntimeAdapterContract(), null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
