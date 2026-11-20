import assert from 'node:assert/strict';
import test from 'node:test';

import { digestObject } from '../src/lib/canonical.mjs';

const currentness = await import('../src/lib/machine-principal-currentness.mjs');

const D = character => character.repeat(64);

function authority(id, type = 'agent') {
  const profile = {
    id,
    type,
    sponsor: 'owner.alice',
    roles: ['researcher'],
    scopes: ['intent:execute'],
    lifetime: 'persistent',
    runtime: {
      id: `runtime.${id}`,
      kind: 'local-process',
      software_digest: D('a')
    },
    constraints: {
      actions: ['system.echo'],
      purposes: ['test.conformance'],
      destinations: ['local'],
      budgets: {
        max_requests_per_minute: 10,
        max_concurrent_requests: 1,
        max_execution_ms: 30_000,
        max_request_bytes: 32_768,
        max_response_bytes: 131_072
      },
      delegation: { allowed: false, max_depth: 0 }
    }
  };
  return {
    schema: 'axiom-machine-principal.v1',
    ...profile,
    authority_digest: digestObject(profile)
  };
}

function projection(root, overrides = {}) {
  return {
    schema: 'axiom-machine-principal-currentness-projection.v1',
    principal_id: root.id,
    principal_type: root.type,
    root_authority_digest: root.authority_digest,
    retained_status: 'active',
    effective_status: 'active',
    lifecycle_seq: 1,
    lifecycle_head_event_id: `machine.currentness.${root.id}`,
    lifecycle_head_event_hash: D('b'),
    lifecycle_head_digest: D('c'),
    effective_authority_digest: root.authority_digest,
    effective_authority: root,
    grid_chain_seq: 1,
    grid_chain_head: D('d'),
    observed_at: '2026-11-19T20:00:00.000Z',
    authority_effect: 'none',
    ...overrides
  };
}

function enumeration(overrides = {}) {
  return {
    source_available: true,
    source_verified: true,
    complete: true,
    expected_page_count: 1,
    observed_page_numbers: [1],
    ...overrides
  };
}

function evaluate({ configured, retained, evidence = enumeration() }) {
  return currentness.evaluateMachineCurrentnessProductionPreflight({
    configuredPrincipals: configured,
    retainedProjections: retained,
    enumeration: evidence
  });
}

test('exact configured-principal and retained-Grid bindings pass without authorizing production', () => {
  assert.equal(
    typeof currentness.evaluateMachineCurrentnessProductionPreflight,
    'function',
    'the pure production-preflight evaluator must exist'
  );

  const first = authority('agent.preflight.first');
  const second = authority('service.preflight.second', 'service');
  const result = evaluate({
    configured: [second, first],
    retained: [projection(first), projection(second)]
  });

  assert.equal(
    result.schema,
    'axiom-machine-currentness-production-preflight-evaluation.v1'
  );
  assert.equal(result.ready, true);
  assert.deepEqual(result.blockers, []);
  assert.equal(result.configured_principal_count, 2);
  assert.equal(result.retained_projection_count, 2);
  assert.match(result.evidence_digest, /^[a-f0-9]{64}$/);
  assert.deepEqual(result.details, {
    configured_only_ids: [],
    retained_only_ids: [],
    duplicate_configured_ids: [],
    duplicate_retained_ids: [],
    principal_type_mismatch_ids: [],
    root_authority_digest_mismatch_ids: [],
    duplicate_page_numbers: [],
    missing_page_numbers: [],
    unexpected_page_numbers: []
  });
  assert.deepEqual(result.semantics, {
    evaluation_scope: 'pure-configured-principal-retained-grid-comparison',
    production_activation_authorized: false,
    registry_mutation_authorized: false,
    grid_mutation_authorized: false,
    authority_effect: 'none'
  });

  const reordered = evaluate({
    configured: [first, second],
    retained: [projection(second), projection(first)]
  });
  assert.deepEqual(reordered, result);
});

test('omitted and orphan retained principals fail the exact-set preflight', () => {
  const configuredOnly = authority('agent.preflight.configured-only');
  const retainedOnly = authority('agent.preflight.retained-only');
  const result = evaluate({
    configured: [configuredOnly],
    retained: [projection(retainedOnly)]
  });

  assert.equal(result.ready, false);
  assert.deepEqual(result.blockers, [
    'configured-principal-missing-from-grid',
    'orphan-retained-grid-principal'
  ]);
  assert.deepEqual(result.details.configured_only_ids, [configuredOnly.id]);
  assert.deepEqual(result.details.retained_only_ids, [retainedOnly.id]);
});

test('duplicate configured principals and retained projections fail closed', () => {
  const root = authority('agent.preflight.duplicate');
  const result = evaluate({
    configured: [root, structuredClone(root)],
    retained: [projection(root), projection(root)]
  });

  assert.equal(result.ready, false);
  assert.deepEqual(result.blockers, [
    'duplicate-configured-principal-id',
    'duplicate-retained-principal-id'
  ]);
  assert.deepEqual(result.details.duplicate_configured_ids, [root.id]);
  assert.deepEqual(result.details.duplicate_retained_ids, [root.id]);
});

test('principal type and canonical root digest mismatches fail closed independently', () => {
  const typeRoot = authority('agent.preflight.type');
  const digestRoot = authority('agent.preflight.digest');
  const result = evaluate({
    configured: [typeRoot, digestRoot],
    retained: [
      projection(typeRoot, { principal_type: 'service' }),
      projection(digestRoot, { root_authority_digest: D('9') })
    ]
  });

  assert.equal(result.ready, false);
  assert.deepEqual(result.blockers, [
    'principal-type-mismatch',
    'root-authority-digest-mismatch'
  ]);
  assert.deepEqual(result.details.principal_type_mismatch_ids, [typeRoot.id]);
  assert.deepEqual(result.details.root_authority_digest_mismatch_ids, [digestRoot.id]);
});

test('unavailable, unverified, incomplete, duplicated, or gapped enumeration evidence fails closed', () => {
  const root = authority('agent.preflight.enumeration');
  const result = evaluate({
    configured: [root],
    retained: [projection(root)],
    evidence: enumeration({
      source_available: false,
      source_verified: false,
      complete: false,
      expected_page_count: 3,
      observed_page_numbers: [1, 1, 3]
    })
  });

  assert.equal(result.ready, false);
  assert.deepEqual(result.blockers, [
    'duplicate-grid-page-number',
    'grid-enumeration-incomplete',
    'grid-enumeration-unavailable',
    'grid-enumeration-unverified',
    'grid-pagination-gap'
  ]);
  assert.deepEqual(result.details.duplicate_page_numbers, [1]);
  assert.deepEqual(result.details.missing_page_numbers, [2]);
});

test('observed Grid pages beyond the declared enumeration boundary fail closed', () => {
  const root = authority('agent.preflight.page-overrun');
  const result = evaluate({
    configured: [root],
    retained: [projection(root)],
    evidence: enumeration({
      expected_page_count: 2,
      observed_page_numbers: [1, 2, 3]
    })
  });

  assert.equal(result.ready, false);
  assert.deepEqual(result.blockers, ['grid-pagination-gap']);
  assert.deepEqual(result.details.missing_page_numbers, []);
  assert.deepEqual(result.details.unexpected_page_numbers, [3]);
});

test('malformed principals, projections, and enumeration claims are rejected', () => {
  const root = authority('agent.preflight.invalid');
  assert.throws(
    () => evaluate({ configured: [{ id: root.id }], retained: [] }),
    /Machine principal/
  );
  assert.throws(
    () => evaluate({
      configured: [root],
      retained: [{ ...projection(root), unexpected: true }]
    }),
    /projection fields are invalid/
  );
  assert.throws(
    () => evaluate({
      configured: [root],
      retained: [projection(root)],
      evidence: { ...enumeration(), expected_page_count: -1 }
    }),
    /expected_page_count/
  );
});

test('configured source enumeration returns only sorted constrained machine authority snapshots', () => {
  assert.equal(
    typeof currentness.enumerateConfiguredMachinePrincipalAuthorities,
    'function',
    'the configured-source enumerator must exist'
  );

  const first = authority('agent.configured.first');
  const second = authority('service.configured.second', 'service');
  const human = {
    id: 'owner.alice',
    type: 'human',
    roles: ['administrator'],
    scopes: ['*']
  };
  const infrastructureService = {
    id: 'production-telemetry-relay',
    type: 'service',
    roles: ['telemetry-relay'],
    scopes: ['telemetry:collect']
  };
  const tokenHashA = '1'.repeat(64);
  const tokenHashB = '2'.repeat(64);
  const result = currentness.enumerateConfiguredMachinePrincipalAuthorities(new Map([
    [tokenHashB, second],
    ['3'.repeat(64), human],
    [tokenHashA, first],
    ['4'.repeat(64), infrastructureService]
  ]));

  assert.deepEqual(result, {
    source_available: true,
    source_verified: true,
    complete: true,
    principal_count: 2,
    principals: [first, second],
    production_activation_authorized: false,
    authority_effect: 'none'
  });
  assert.equal(JSON.stringify(result).includes(tokenHashA), false);
  assert.equal(JSON.stringify(result).includes(tokenHashB), false);

  const reordered = currentness.enumerateConfiguredMachinePrincipalAuthorities(new Map([
    [tokenHashA, first],
    [tokenHashB, second]
  ]));
  assert.deepEqual(reordered, result);
});

test('configured source enumeration rejects duplicate machine principal ids', () => {
  const first = authority('agent.configured.duplicate');
  assert.throws(
    () => currentness.enumerateConfiguredMachinePrincipalAuthorities(new Map([
      ['1'.repeat(64), first],
      ['2'.repeat(64), structuredClone(first)]
    ])),
    /Duplicate configured machine principal id/
  );
});

test('configured source enumeration rejects malformed source and machine entries', () => {
  assert.throws(
    () => currentness.enumerateConfiguredMachinePrincipalAuthorities([]),
    /normalized API principal Map/
  );
  assert.throws(
    () => currentness.enumerateConfiguredMachinePrincipalAuthorities(new Map([
      ['1'.repeat(64), { schema: 'axiom-machine-principal.v1', id: 'agent.invalid' }]
    ])),
    /Machine principal/
  );
  assert.throws(
    () => currentness.enumerateConfiguredMachinePrincipalAuthorities(new Map([
      ['2'.repeat(64), {
        id: 'agent.legacy',
        type: 'agent',
        roles: ['researcher'],
        scopes: ['intent:execute']
      }]
    ])),
    /must use axiom-machine-principal.v1/
  );
});
