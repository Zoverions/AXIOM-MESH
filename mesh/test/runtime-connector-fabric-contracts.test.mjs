import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  RUNTIME_CONNECTOR_CATALOG_SCHEMA,
  TASK_ARTIFACT_HANDOFF_SCHEMA,
  validateRuntimeConnectorCatalogSchema,
  validateTaskArtifactHandoffSchema,
  verifyRuntimeConnectorFabricContracts
} from '../src/lib/runtime-connector-fabric-contracts.mjs';

const CATALOG_URL = new URL(
  '../../docs/architecture/contracts/runtime-connector-catalog-entry.v1.schema.json',
  import.meta.url
);
const HANDOFF_URL = new URL(
  '../../docs/architecture/contracts/task-artifact-handoff.v1.schema.json',
  import.meta.url
);

function load(url) {
  return JSON.parse(readFileSync(url, 'utf8'));
}

test('runtime connector fabric draft contracts preserve zero-authority coordination invariants', () => {
  const result = verifyRuntimeConnectorFabricContracts();
  assert.equal(result.valid, true);
  assert.equal(result.catalog_schema, RUNTIME_CONNECTOR_CATALOG_SCHEMA);
  assert.equal(result.task_handoff_schema, TASK_ARTIFACT_HANDOFF_SCHEMA);
  assert.equal(result.contract_frozen, false);
  assert.equal(result.contract_byte_pinned, false);
  assert.equal(result.capability_promoted, false);
  assert.equal(result.external_runtime_loaded, false);
  assert.equal(result.external_effect_performed, false);
});

test('catalog schema rejects installation authority and silent permission widening', () => {
  const catalog = load(CATALOG_URL);
  assert.equal(validateRuntimeConnectorCatalogSchema(catalog), true);

  const installAuthority = structuredClone(catalog);
  installAuthority.properties.requested_access.properties.install_grants_authority.const = true;
  assert.throws(
    () => validateRuntimeConnectorCatalogSchema(installAuthority),
    /contract invariants are invalid/
  );

  const silentWidening = structuredClone(catalog);
  silentWidening.properties.lifecycle.properties.silent_permission_widening_allowed.const = true;
  assert.throws(
    () => validateRuntimeConnectorCatalogSchema(silentWidening),
    /contract invariants are invalid/
  );

  const mutableSource = structuredClone(catalog);
  mutableSource.properties.provenance.properties.mutable_ref_allowed.const = true;
  assert.throws(
    () => validateRuntimeConnectorCatalogSchema(mutableSource),
    /contract invariants are invalid/
  );
});

test('catalog schema keeps supported integration classes explicit', () => {
  const catalog = load(CATALOG_URL);
  const widened = structuredClone(catalog);
  widened.properties.integration_class.enum.push('trusted-superuser-runtime');
  assert.throws(
    () => validateRuntimeConnectorCatalogSchema(widened),
    /integration classes are invalid/
  );
});

test('task handoff schema rejects coordination or handoff as authorization', () => {
  const handoff = load(HANDOFF_URL);
  assert.equal(validateTaskArtifactHandoffSchema(handoff), true);

  const coordinationAuthority = structuredClone(handoff);
  coordinationAuthority.properties.authority.properties.coordination_is_authorization.const = true;
  assert.throws(
    () => validateTaskArtifactHandoffSchema(coordinationAuthority),
    /contract invariants are invalid/
  );

  const handoffAuthority = structuredClone(handoff);
  handoffAuthority.properties.authority.properties.handoff_transfers_authority.const = true;
  assert.throws(
    () => validateTaskArtifactHandoffSchema(handoffAuthority),
    /contract invariants are invalid/
  );

  const noDelegationGate = structuredClone(handoff);
  noDelegationGate.properties.authority.properties
    .delegation_required_for_independent_child_authority.const = false;
  assert.throws(
    () => validateTaskArtifactHandoffSchema(noDelegationGate),
    /contract invariants are invalid/
  );
});

test('task handoff lifecycle states cannot silently acquire a success-like state', () => {
  const handoff = load(HANDOFF_URL);
  const widened = structuredClone(handoff);
  widened.properties.lifecycle.properties.state.enum.push('assumed-success');
  assert.throws(
    () => validateTaskArtifactHandoffSchema(widened),
    /lifecycle states are invalid/
  );
});
