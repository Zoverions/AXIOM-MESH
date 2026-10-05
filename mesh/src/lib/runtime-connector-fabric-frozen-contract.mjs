import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { ValidationError } from './canonical.mjs';
import { verifyRuntimeConnectorFabricContracts } from './runtime-connector-fabric-contracts.mjs';

export const RUNTIME_CONNECTOR_CATALOG_SCHEMA_SHA256 =
  '0fbd3cf2e4a5df8bd803427413a37e1d83d5ccfa7568ac02a4760c8af7beca46';
export const TASK_ARTIFACT_HANDOFF_SCHEMA_SHA256 =
  '7a8cf7f7496d1794d74f70545e032fc3790d5eecc227f27040370023abf28e50';

const CATALOG_SCHEMA_URL = new URL(
  '../../../docs/architecture/contracts/runtime-connector-catalog-entry.v1.schema.json',
  import.meta.url
);
const TASK_HANDOFF_SCHEMA_URL = new URL(
  '../../../docs/architecture/contracts/task-artifact-handoff.v1.schema.json',
  import.meta.url
);

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

export function verifyRuntimeConnectorFabricContractPins({
  catalogBytes = readFileSync(CATALOG_SCHEMA_URL),
  taskHandoffBytes = readFileSync(TASK_HANDOFF_SCHEMA_URL)
} = {}) {
  const catalogSchemaSha256 = sha256(catalogBytes);
  const taskHandoffSchemaSha256 = sha256(taskHandoffBytes);

  if (catalogSchemaSha256 !== RUNTIME_CONNECTOR_CATALOG_SCHEMA_SHA256) {
    throw new ValidationError(
      `Runtime Connector Catalog v1 schema byte pin drifted; expected=${RUNTIME_CONNECTOR_CATALOG_SCHEMA_SHA256}; observed=${catalogSchemaSha256}`
    );
  }
  if (taskHandoffSchemaSha256 !== TASK_ARTIFACT_HANDOFF_SCHEMA_SHA256) {
    throw new ValidationError(
      `Task Artifact Handoff v1 schema byte pin drifted; expected=${TASK_ARTIFACT_HANDOFF_SCHEMA_SHA256}; observed=${taskHandoffSchemaSha256}`
    );
  }

  return {
    valid: true,
    catalog_schema_sha256: catalogSchemaSha256,
    task_handoff_schema_sha256: taskHandoffSchemaSha256,
    contract_byte_pinned: true
  };
}

export function verifyRuntimeConnectorFabricFrozenContract() {
  const semantic = verifyRuntimeConnectorFabricContracts();
  const pins = verifyRuntimeConnectorFabricContractPins();

  return {
    ...semantic,
    ...pins,
    contract_frozen: true,
    contract_byte_pinned: true,
    capability_promoted: false,
    external_runtime_loaded: false,
    external_effect_performed: false
  };
}
