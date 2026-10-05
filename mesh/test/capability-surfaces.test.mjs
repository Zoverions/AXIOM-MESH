import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CAPABILITY_SURFACES_SCHEMA,
  capabilitySurfacesDigest,
  validateCapabilitySurfaceRegistry
} from '../src/lib/capability-surfaces.mjs';

function entry(id = 'planning.synthetic', lifecycle = 'specified') {
  const executable = ['conceptual', 'specified'].includes(lifecycle)
    ? null
    : 'core.intent-loop';
  return {
    capability_id: id,
    lifecycle,
    human: {
      product: 'Planning',
      section: 'Capabilities',
      label: 'Synthetic planning capability',
      description: 'Synthetic contract fixture for discovery and lifecycle semantics.'
    },
    machine: {
      schema_ids: ['axiom-synthetic-capability.v0'],
      read_surfaces: [],
      action_surfaces: []
    },
    executable_capability_ref: executable,
    evidence_refs: ['mesh.test.capability-surfaces'],
    authority_boundary: 'discovery-only-no-authority',
    non_claims: ['discovery-does-not-authorize-execution']
  };
}

function registry() {
  return {
    schema: 'axiom-capability-surfaces.v0',
    version: 0,
    status: 'inert-contract-laboratory',
    registry_id: 'capability-surfaces.synthetic.v0',
    executable_registry_ref: 'mesh/config/capabilities.json',
    discovery_grants_authority: false,
    entries: [entry()],
    created_at: '2026-09-02T23:40:00.000Z',
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  };
}

test('validates an inert capability-surface registry without granting authority', () => {
  const document = registry();
  const result = validateCapabilitySurfaceRegistry(document);
  assert.equal(CAPABILITY_SURFACES_SCHEMA, document.schema);
  assert.equal(result.valid, true);
  assert.equal(result.entry_count, 1);
  assert.equal(result.registry_digest, capabilitySurfacesDigest(document));
  assert.equal(result.discovery_grants_authority, false);
  assert.equal(result.authority_effect, 'none');
  assert.equal(result.network_effect, 'none');
  assert.equal(result.runtime_activation, false);
  assert.equal(Object.isFrozen(result), true);
});

test('rejects discovery that claims authority', () => {
  const document = registry();
  document.discovery_grants_authority = true;
  assert.throws(() => validateCapabilitySurfaceRegistry(document), /discovery/i);
});

test('rejects duplicate capability ids', () => {
  const document = registry();
  document.entries.push(entry());
  assert.throws(
    () => validateCapabilitySurfaceRegistry(document),
    /duplicate capability_id/i
  );
});

test('rejects unknown lifecycle values and empty non-claims', () => {
  const invalidLifecycle = registry();
  invalidLifecycle.entries[0].lifecycle = 'nearly-ready';
  assert.throws(
    () => validateCapabilitySurfaceRegistry(invalidLifecycle),
    /lifecycle/i
  );

  const missingBoundary = registry();
  missingBoundary.entries[0].non_claims = [];
  assert.throws(
    () => validateCapabilitySurfaceRegistry(missingBoundary),
    /non_claims/i
  );
});

test('post-specified lifecycle requires an executable capability reference and evidence', () => {
  const missingExecutable = registry();
  missingExecutable.entries[0].lifecycle = 'implemented';
  assert.throws(
    () => validateCapabilitySurfaceRegistry(missingExecutable),
    /executable capability/i
  );

  const missingEvidence = registry();
  missingEvidence.entries[0] = entry('planning.synthetic', 'implemented');
  missingEvidence.entries[0].evidence_refs = [];
  assert.throws(
    () => validateCapabilitySurfaceRegistry(missingEvidence),
    /evidence/i
  );
});

test('pre-executable lifecycle cannot imply executable authority', () => {
  const document = registry();
  document.entries[0].executable_capability_ref = 'core.intent-loop';
  assert.throws(
    () => validateCapabilitySurfaceRegistry(document),
    /specified/i
  );
});

test('rejects malformed human and machine surfaces', () => {
  const human = registry();
  human.entries[0].human.description = '';
  assert.throws(() => validateCapabilitySurfaceRegistry(human), /description/i);

  const machine = registry();
  machine.entries[0].machine.schema_ids = ['bad schema'];
  assert.throws(() => validateCapabilitySurfaceRegistry(machine), /schema_ids/i);
});
