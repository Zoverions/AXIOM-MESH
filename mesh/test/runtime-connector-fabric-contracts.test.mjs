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
const HANDOFF_UNCERTAIN_URL = new URL(
  './fixtures/runtime-connector-fabric/handoff-uncertain.json',
  import.meta.url
);
const INVALID_INSTANCES_URL = new URL(
  './fixtures/runtime-connector-fabric/invalid-instances.json',
  import.meta.url
);

function load(url) {
  return JSON.parse(readFileSync(url, 'utf8'));
}

function mutate(base, changes) {
  const value = structuredClone(base);
  for (const change of changes) {
    let cursor = value;
    for (const segment of change.path.slice(0, -1)) cursor = cursor[segment];
    const field = change.path.at(-1);
    if (change.remove) delete cursor[field];
    else cursor[field] = structuredClone(change.value);
  }
  return value;
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

test('catalog schema keeps integration and review states separate from authority/promotion', () => {
  const catalog = load(CATALOG_URL);

  const widenedClass = structuredClone(catalog);
  widenedClass.properties.integration_class.enum.push('trusted-superuser-runtime');
  assert.throws(
    () => validateRuntimeConnectorCatalogSchema(widenedClass),
    /integration classes are invalid/
  );

  const promotedReviewState = structuredClone(catalog);
  promotedReviewState.properties.subject.properties.review_state.enum.push('promoted');
  assert.throws(
    () => validateRuntimeConnectorCatalogSchema(promotedReviewState),
    /review states are invalid/
  );

  const curationAsAssurance = structuredClone(catalog);
  curationAsAssurance.$defs.observation.properties.claim_type.enum.push('community-curation');
  assert.throws(
    () => validateRuntimeConnectorCatalogSchema(curationAsAssurance),
    /observation types are invalid/
  );
});

test('task handoff schema rejects alternate authority roots or coordination as authorization', () => {
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

  const runtimeAuthority = structuredClone(handoff);
  runtimeAuthority.properties.authority.properties.authority_source.const = 'runtime-local';
  assert.throws(
    () => validateTaskArtifactHandoffSchema(runtimeAuthority),
    /contract invariants are invalid/
  );

  const noGrantGate = structuredClone(handoff);
  noGrantGate.properties.authority.properties.grant_required_before_effect.const = false;
  assert.throws(
    () => validateTaskArtifactHandoffSchema(noGrantGate),
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

test('minimal and maximal catalog entries satisfy reviewed draft validation', () => {
  const minimal = load(CATALOG_MINIMAL_URL);
  const maximal = load(CATALOG_MAXIMAL_URL);

  assert.equal(validateRuntimeConnectorCatalogEntry(minimal), true);
  assert.equal(validateRuntimeConnectorCatalogEntry(maximal), true);
  assert.equal(minimal.requested_access.install_grants_authority, false);
  assert.equal(maximal.requested_access.install_grants_authority, false);
  assert.deepEqual(maximal.requested_access.capabilities, ['core.intent-loop', 'memory.graph']);
  assert.deepEqual(maximal.requested_access.actions, ['system.echo', 'memory.create']);
  assert.equal(maximal.orchestration.may_spawn_workers, true);
  assert.equal(maximal.orchestration.independent_child_authority_requested, true);
  assert.equal(maximal.lifecycle.silent_permission_widening_allowed, false);
  assert.notEqual(maximal.subject.review_state, 'promoted');
});

test('queued, completed, and uncertain task handoffs satisfy reviewed draft validation', () => {
  const minimal = load(HANDOFF_MINIMAL_URL);
  const maximal = load(HANDOFF_MAXIMAL_URL);
  const uncertain = load(HANDOFF_UNCERTAIN_URL);

  assert.equal(validateTaskArtifactHandoff(minimal), true);
  assert.equal(validateTaskArtifactHandoff(maximal), true);
  assert.equal(validateTaskArtifactHandoff(uncertain), true);
  assert.equal(minimal.authority.authority_source, 'axiom-gateway');
  assert.equal(minimal.authority.coordination_is_authorization, false);
  assert.equal(maximal.authority.handoff_transfers_authority, false);
  assert.equal(maximal.request.runtime_operation, 'memory.create');
  assert.equal(maximal.request.axiom_action, 'memory.create');
  assert.equal(maximal.lifecycle.state, 'completed');
  assert.ok(maximal.lifecycle.terminal_receipt_id);
  assert.equal(uncertain.lifecycle.state, 'uncertain');
  assert.ok(uncertain.lifecycle.uncertainty_record_id);
  assert.equal(uncertain.lifecycle.terminal_receipt_id, undefined);
});

test('catalog adversarial mutations fail closed with the expected boundary', () => {
  const base = load(CATALOG_MINIMAL_URL);
  const invalid = load(INVALID_INSTANCES_URL);
  for (const fixture of invalid.catalog) {
    assert.throws(
      () => validateRuntimeConnectorCatalogEntry(mutate(base, fixture.changes)),
      new RegExp(fixture.expected_error),
      fixture.name
    );
  }
});

test('task handoff adversarial mutations fail closed with the expected boundary', () => {
  const base = load(HANDOFF_MINIMAL_URL);
  const invalid = load(INVALID_INSTANCES_URL);
  for (const fixture of invalid.handoff) {
    assert.throws(
      () => validateTaskArtifactHandoff(mutate(base, fixture.changes)),
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
