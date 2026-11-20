import assert from 'node:assert/strict';
import test from 'node:test';

import { meshConfig } from '../src/lib/config.mjs';
import {
  runMachineCurrentnessProductionPreflightOperator
} from '../scripts/machine-currentness-production-preflight.mjs';

const AGENT_TOKEN = `agent-${'a'.repeat(40)}`;
const HUMAN_TOKEN = `human-${'h'.repeat(40)}`;

function config() {
  return meshConfig({
    environment: 'test',
    apiTokens: {
      [HUMAN_TOKEN]: {
        id: 'owner.preflight-operator',
        type: 'human',
        roles: ['administrator'],
        scopes: ['*']
      },
      [AGENT_TOKEN]: {
        id: 'agent.preflight-operator',
        type: 'agent',
        sponsor: 'owner.preflight-operator',
        roles: ['researcher'],
        scopes: ['intent:execute'],
        lifetime: 'persistent',
        runtime: {
          id: 'runtime.preflight.operator',
          kind: 'local-process',
          software_digest: 'a'.repeat(64)
        },
        constraints: {
          actions: ['system.echo'],
          purposes: ['test.conformance'],
          destinations: ['local'],
          budgets: {
            max_requests_per_minute: 10,
            max_concurrent_requests: 1,
            max_execution_ms: 2_000,
            max_request_bytes: 65_536,
            max_response_bytes: 262_144
          },
          delegation: { allowed: false, max_depth: 0 }
        }
      }
    }
  });
}

test('operator sends only sanitized configured authority snapshots to Hypervisor', async () => {
  let request;
  const expected = {
    schema: 'axiom-machine-currentness-production-preflight-report.v1',
    ready: false,
    blockers: ['configured-principal-missing-from-grid'],
    semantics: { production_activation_authorized: false, authority_effect: 'none' }
  };
  const result = await runMachineCurrentnessProductionPreflightOperator({
    config: config(),
    sourceRevision: 'e'.repeat(40),
    callHypervisor: async value => {
      request = value;
      return expected;
    }
  });

  assert.equal(result, expected);
  assert.equal(request.source_revision, 'e'.repeat(40));
  assert.equal(request.configured_source.principal_count, 1);
  assert.equal(request.configured_source.principals[0].id, 'agent.preflight-operator');
  assert.equal(JSON.stringify(request).includes(AGENT_TOKEN), false);
  assert.equal(request.configured_source.production_activation_authorized, false);
});

test('operator rejects an ambiguous source revision before contacting Hypervisor', async () => {
  let called = false;
  await assert.rejects(
    () => runMachineCurrentnessProductionPreflightOperator({
      config: config(),
      sourceRevision: 'main',
      callHypervisor: async () => {
        called = true;
      }
    }),
    /source revision/i
  );
  assert.equal(called, false);
});
