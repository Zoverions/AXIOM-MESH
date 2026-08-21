import { readFileSync } from 'node:fs';
import { canonicalJson, ValidationError } from './canonical.mjs';

export const RUNTIME_CONNECTOR_CATALOG_SCHEMA =
  'axiom-runtime-connector-catalog-entry.v1';
export const RUNTIME_CONNECTOR_CATALOG_SCHEMA_ID =
  'urn:axiom:contract:runtime-connector-catalog-entry:v1';
export const TASK_ARTIFACT_HANDOFF_SCHEMA = 'axiom-task-artifact-handoff.v1';
export const TASK_ARTIFACT_HANDOFF_SCHEMA_ID =
  'urn:axiom:contract:task-artifact-handoff:v1';

const CATALOG_URL = new URL(
  '../../../docs/architecture/contracts/runtime-connector-catalog-entry.v1.schema.json',
  import.meta.url
);
const HANDOFF_URL = new URL(
  '../../../docs/architecture/contracts/task-artifact-handoff.v1.schema.json',
  import.meta.url
);

const CATALOG_REQUIRED = Object.freeze([
  'schema',
  'entry_id',
  'entry_version',
  'integration_class',
  'subject',
  'provenance',
  'compatibility',
  'requested_access',
  'orchestration',
  'assurance',
  'lifecycle',
  'non_claims'
]);

const CATALOG_CLASSES = Object.freeze([
  'agent-runtime',
  'model-provider',
  'tool-service-connector',
  'protocol-adapter',
  'compute-backend',
  'evidence-oracle'
]);

const HANDOFF_REQUIRED = Object.freeze([
  'schema',
  'task_id',
  'causal_id',
  'requester',
  'execution_target',
  'request',
  'authority',
  'budgets',
  'lifecycle',
  'inputs',
  'outputs'
]);

const TASK_STATES = Object.freeze([
  'queued',
  'running',
  'awaiting-approval',
  'blocked',
  'completed',
  'failed',
  'cancelled',
  'expired',
  'uncertain'
]);

function readJson(url, name) {
  let value;
  try {
    value = JSON.parse(readFileSync(url, 'utf8'));
  } catch {
    throw new ValidationError(`${name} is not valid JSON`);
  }
  return value;
}

function exactArray(actual, expected, name) {
  if (
    !Array.isArray(actual)
    || canonicalJson([...actual].sort()) !== canonicalJson([...expected].sort())
  ) throw new ValidationError(`${name} are invalid`);
}

export function validateRuntimeConnectorCatalogSchema(schema) {
  exactArray(schema?.required, CATALOG_REQUIRED, 'Runtime connector catalog required fields');
  exactArray(
    schema?.properties?.integration_class?.enum,
    CATALOG_CLASSES,
    'Runtime connector catalog integration classes'
  );

  if (
    schema?.$schema !== 'https://json-schema.org/draft/2020-12/schema'
    || schema?.$id !== RUNTIME_CONNECTOR_CATALOG_SCHEMA_ID
    || schema?.type !== 'object'
    || schema?.additionalProperties !== false
    || schema?.properties?.schema?.const !== RUNTIME_CONNECTOR_CATALOG_SCHEMA
    || schema?.properties?.provenance?.properties?.mutable_ref_allowed?.const !== false
    || schema?.properties?.requested_access?.properties?.install_grants_authority?.const !== false
    || schema?.properties?.lifecycle?.properties?.silent_permission_widening_allowed?.const !== false
    || schema?.properties?.lifecycle?.properties?.quarantine_supported?.const !== true
    || schema?.properties?.non_claims?.minItems !== 1
  ) throw new ValidationError('Runtime connector catalog contract invariants are invalid');

  return true;
}

export function validateTaskArtifactHandoffSchema(schema) {
  exactArray(schema?.required, HANDOFF_REQUIRED, 'Task artifact handoff required fields');
  exactArray(
    schema?.properties?.lifecycle?.properties?.state?.enum,
    TASK_STATES,
    'Task artifact handoff lifecycle states'
  );

  if (
    schema?.$schema !== 'https://json-schema.org/draft/2020-12/schema'
    || schema?.$id !== TASK_ARTIFACT_HANDOFF_SCHEMA_ID
    || schema?.type !== 'object'
    || schema?.additionalProperties !== false
    || schema?.properties?.schema?.const !== TASK_ARTIFACT_HANDOFF_SCHEMA
    || schema?.properties?.authority?.properties?.coordination_is_authorization?.const !== false
    || schema?.properties?.authority?.properties?.handoff_transfers_authority?.const !== false
    || schema?.properties?.authority?.properties
      ?.delegation_required_for_independent_child_authority?.const !== true
  ) throw new ValidationError('Task artifact handoff contract invariants are invalid');

  return true;
}

export function verifyRuntimeConnectorFabricContracts() {
  const catalog = readJson(CATALOG_URL, 'Runtime connector catalog contract');
  const handoff = readJson(HANDOFF_URL, 'Task artifact handoff contract');

  validateRuntimeConnectorCatalogSchema(catalog);
  validateTaskArtifactHandoffSchema(handoff);

  return Object.freeze({
    valid: true,
    catalog_schema: RUNTIME_CONNECTOR_CATALOG_SCHEMA,
    catalog_schema_id: RUNTIME_CONNECTOR_CATALOG_SCHEMA_ID,
    task_handoff_schema: TASK_ARTIFACT_HANDOFF_SCHEMA,
    task_handoff_schema_id: TASK_ARTIFACT_HANDOFF_SCHEMA_ID,
    contract_frozen: false,
    contract_byte_pinned: false,
    capability_promoted: false,
    external_runtime_loaded: false,
    external_effect_performed: false
  });
}
