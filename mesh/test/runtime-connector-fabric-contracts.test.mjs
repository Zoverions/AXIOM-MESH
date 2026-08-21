import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  RUNTIME_CONNECTOR_CATALOG_SCHEMA,
  TASK_ARTIFACT_HANDOFF_SCHEMA,
  validateRuntimeConnectorCatalogEntry,
  validateRuntimeConnectorCatalogSchema,
  validateTaskArtifactHandoff,
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
const CATALOG_MINIMAL_URL = new URL(
  './fixtures/runtime-connector-fabric/catalog-minimal.json',
  import.meta.url
);
const CATALOG_MAXIMAL_URL = new URL(
  './fixtures/runtime-connector-fabric/catalog-maximal.json',
  import.meta.url
);
const HANDOFF_MINIMAL_URL = new URL(
  './fixtures/runtime-connector-fabric/handoff-minimal.json',
  import.meta.url
);
const HANDOFF_MAXIMAL_URL = new URL(
  './fixtures/runtime-connector-fabric/handoff-maximal.json',
  import.meta.url
);
const INVALID_INSTANCES_URL = new URL(
  './fixtures/runtime-connector-fabric/invalid-instances.json',
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
  assert.equal(result.instance_validation, 'draft-critical-invariants');
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

test('minimal and maximal catalog entries satisfy draft critical-instance validation', () => {
  const minimal = load(CATALOG_MINIMAL_URL);
  const maximal = load(CATALOG_MAXIMAL_URL);

  assert.equal(validateRuntimeConnectorCatalogEntry(minimal), true);
  assert.equal(validateRuntimeConnectorCatalogEntry(maximal), true);
  assert.equal(minimal.requested_access.install_grants_authority, false);
  assert.equal(maximal.requested_access.install_grants_authority, false);
  assert.equal(maximal.orchestration.may_spawn_workers, true);
  assert.equal(maximal.orchestration.delegation_required, true);
  assert.equal(maximal.lifecycle.silent_permission_widening_allowed, false);
});

test('minimal and maximal task handoffs satisfy draft critical-instance validation', () => {
  const minimal = load(HANDOFF_MINIMAL_URL);
  const maximal = load(HANDOFF_MAXIMAL_URL);

  assert.equal(validateTaskArtifactHandoff(minimal), true);
  assert.equal(validateTaskArtifactHandoff(maximal), true);
  assert.equal(minimal.authority.coordination_is_authorization, false);
  assert.equal(maximal.authority.handoff_transfers_authority, false);
  assert.equal(maximal.authority.delegation_required_for_independent_child_authority, true);
  assert.equal(maximal.lifecycle.state, 'running');
});

test('catalog adversarial instances fail closed with the expected boundary', () => {
  const invalid = load(INVALID_INSTANCES_URL);
  for (const fixture of invalid.catalog) {
    assert.throws(
      () => validateRuntimeConnectorCatalogEntry(fixture.value),
      new RegExp(fixture.expected_error),
      fixture.name
    );
  }
});

test('task handoff adversarial instances fail closed with the expected boundary', () => {
  const invalid = load(INVALID_INSTANCES_URL);
  for (const fixture of invalid.handoff) {
    assert.throws(
      () => validateTaskArtifactHandoff(fixture.value),
      new RegExp(fixture.expected_error),
      fixture.name
    );
  }
});

test('instance validators reject unknown top-level fields rather than silently accepting extensions', () => {
  const catalog = load(CATALOG_MINIMAL_URL);
  catalog.trusted = true;
  assert.throws(
    () => validateRuntimeConnectorCatalogEntry(catalog),
    /unsupported field trusted/
  );

  const handoff = load(HANDOFF_MINIMAL_URL);
  handoff.assumed_authority = true;
  assert.throws(
    () => validateTaskArtifactHandoff(handoff),
    /unsupported field assumed_authority/
  );
});
