import assert from 'node:assert/strict';
import test from 'node:test';
import {
  RUNTIME_CONNECTOR_CATALOG_SCHEMA_SHA256,
  TASK_ARTIFACT_HANDOFF_SCHEMA_SHA256,
  verifyRuntimeConnectorFabricContractPins,
  verifyRuntimeConnectorFabricFrozenContract
} from '../src/lib/runtime-connector-fabric-frozen-contract.mjs';

test('Runtime Fabric v1 schema bytes are frozen and exact', () => {
  const result = verifyRuntimeConnectorFabricFrozenContract();

  assert.equal(result.valid, true);
  assert.equal(result.contract_frozen, true);
  assert.equal(result.contract_byte_pinned, true);
  assert.equal(
    result.catalog_schema_sha256,
    RUNTIME_CONNECTOR_CATALOG_SCHEMA_SHA256
  );
  assert.equal(
    result.task_handoff_schema_sha256,
    TASK_ARTIFACT_HANDOFF_SCHEMA_SHA256
  );
  assert.equal(result.instance_validation, 'draft-critical-invariants');
  assert.equal(result.capability_promoted, false);
  assert.equal(result.external_runtime_loaded, false);
  assert.equal(result.external_effect_performed, false);
});

test('Runtime Fabric v1 byte pins fail closed on schema drift', () => {
  assert.throws(
    () => verifyRuntimeConnectorFabricContractPins({ catalogBytes: Buffer.from('{}\n') }),
    /Catalog v1 schema byte pin drifted/
  );
  assert.throws(
    () => verifyRuntimeConnectorFabricContractPins({ taskHandoffBytes: Buffer.from('{}\n') }),
    /Task Artifact Handoff v1 schema byte pin drifted/
  );
});
