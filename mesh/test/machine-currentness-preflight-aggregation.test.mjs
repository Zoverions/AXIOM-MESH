import assert from 'node:assert/strict';
import test from 'node:test';

import { digestObject } from '../src/lib/canonical.mjs';
import {
  runMachineCurrentnessProductionPreflightAggregation
} from '../src/hypervisor/machine-currentness-preflight.mjs';

const D = character => character.repeat(64);
const R = character => character.repeat(40);

function authority(id = 'agent.preflight.aggregate') {
  const profile = {
    id,
    type: 'agent',
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

function projection(root) {
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
    grid_chain_seq: 7,
    grid_chain_head: D('d'),
    observed_at: '2026-11-20T06:15:00.000Z',
    authority_effect: 'none'
  };
}

function configuredSource(root) {
  return {
    source_available: true,
    source_verified: true,
    complete: true,
    principal_count: 1,
    principals: [root],
    production_activation_authorized: false,
    authority_effect: 'none'
  };
}

function stableGrid(root) {
  const status = {
    mode: 'single-node-transparency-log',
    consensus: false,
    schema_version: 12,
    last_seq: 7,
    last_hash: D('d')
  };
  return async path => {
    if (path === '/internal/v1/status') return status;
    if (path === '/internal/v1/machine-currentness?limit=100') {
      return {
        items: [projection(root)],
        page: { limit: 100, has_more: false, next_cursor: null }
      };
    }
    throw new Error(`unexpected path: ${path}`);
  };
}

test('aggregates a stable authenticated Grid snapshot into a non-authorizing report', async () => {
  const root = authority();
  const report = await runMachineCurrentnessProductionPreflightAggregation({
    configuredSource: configuredSource(root),
    gridGet: stableGrid(root),
    runtimeGeneration: 'runtime_generation_aggregate_0123456789',
    sourceRevision: R('e'),
    policyVersion: 'policy.test.v1',
    policyDigest: D('f')
  });

  assert.equal(report.schema, 'axiom-machine-currentness-production-preflight-report.v1');
  assert.equal(report.ready, true);
  assert.deepEqual(report.blockers, []);
  assert.equal(report.runtime_generation, 'runtime_generation_aggregate_0123456789');
  assert.equal(report.source_revision, R('e'));
  assert.deepEqual(report.grid_snapshot, {
    schema_version: 12,
    last_seq: 7,
    last_hash: D('d'),
    snapshot_digest: digestObject({ schema_version: 12, last_seq: 7, last_hash: D('d') })
  });
  assert.equal(report.configured_principal_count, 1);
  assert.equal(report.retained_projection_count, 1);
  assert.match(report.configured_set_digest, /^[a-f0-9]{64}$/);
  assert.match(report.retained_set_digest, /^[a-f0-9]{64}$/);
  assert.equal(report.evaluation.ready, true);
  assert.equal(report.semantics.production_activation_authorized, false);
  assert.equal(report.semantics.authority_effect, 'none');
  assert.match(report.report_digest, /^[a-f0-9]{64}$/);
});

test('fails closed when Grid changes during pagination', async () => {
  const root = authority('agent.preflight.drift');
  let statusReads = 0;
  const report = await runMachineCurrentnessProductionPreflightAggregation({
    configuredSource: configuredSource(root),
    runtimeGeneration: 'runtime_generation_aggregate_0123456789',
    gridGet: async path => {
      if (path === '/internal/v1/status') {
        statusReads += 1;
        return {
          mode: 'single-node-transparency-log',
          consensus: false,
          schema_version: 12,
          last_seq: statusReads === 1 ? 7 : 8,
          last_hash: statusReads === 1 ? D('d') : D('8')
        };
      }
      return {
        items: [projection(root)],
        page: { limit: 100, has_more: false, next_cursor: null }
      };
    },
    sourceRevision: R('e'),
    policyVersion: 'policy.test.v1',
    policyDigest: D('f')
  });

  assert.equal(report.ready, false);
  assert.deepEqual(report.blockers, [
    'grid-enumeration-incomplete',
    'grid-enumeration-unverified',
    'grid-snapshot-drift'
  ]);
  assert.equal(report.evaluation.enumeration.complete, false);
  assert.equal(report.evaluation.enumeration.source_verified, false);
  assert.equal(report.grid_snapshot, null);
  assert.equal(report.semantics.production_activation_authorized, false);
});

test('fails closed without exposing dependency errors when Grid is unavailable', async () => {
  const root = authority('agent.preflight.unavailable');
  const report = await runMachineCurrentnessProductionPreflightAggregation({
    configuredSource: configuredSource(root),
    runtimeGeneration: 'runtime_generation_aggregate_0123456789',
    gridGet: async () => {
      throw new Error('secret internal path /srv/private/grid.sqlite');
    },
    sourceRevision: R('e'),
    policyVersion: 'policy.test.v1',
    policyDigest: D('f')
  });

  assert.equal(report.ready, false);
  assert.equal(report.blockers.includes('grid-enumeration-unavailable'), true);
  assert.equal(report.blockers.includes('grid-read-failed'), true);
  assert.equal(JSON.stringify(report).includes('/srv/private'), false);
  assert.equal(report.semantics.production_activation_authorized, false);
});

test('fails closed on an ambiguous Grid page envelope', async () => {
  const root = authority('agent.preflight.page-envelope');
  const status = {
    mode: 'single-node-transparency-log',
    consensus: false,
    schema_version: 12,
    last_seq: 7,
    last_hash: D('d')
  };
  const report = await runMachineCurrentnessProductionPreflightAggregation({
    configuredSource: configuredSource(root),
    runtimeGeneration: 'runtime_generation_aggregate_0123456789',
    gridGet: async path => path === '/internal/v1/status'
      ? status
      : {
          items: [projection(root)],
          page: { limit: 100, has_more: false, next_cursor: null },
          untrusted_extra: true
        },
    sourceRevision: R('e'),
    policyVersion: 'policy.test.v1',
    policyDigest: D('f')
  });

  assert.equal(report.ready, false);
  assert.equal(report.blockers.includes('grid-read-failed'), true);
  assert.equal(report.semantics.production_activation_authorized, false);
});
