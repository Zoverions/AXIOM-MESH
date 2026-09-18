import assert from 'node:assert/strict';
import test from 'node:test';
import { ValidationError } from '../src/lib/canonical.mjs';
import {
  GOOGLE_MANAGED_AGENT_AXIOM_ACTION,
  GOOGLE_MANAGED_AGENT_CATALOG_ENTRY,
  GOOGLE_MANAGED_AGENT_ID,
  GOOGLE_MANAGED_AGENT_MODEL,
  GOOGLE_MANAGED_AGENT_OPERATION,
  buildGoogleManagedAgentInteraction
} from '../src/lib/google-managed-agent-candidate.mjs';

function handoff(destinations = []) {
  return {
    schema: 'axiom-task-artifact-handoff.v1',
    task_id: 'task:google-managed-agent-001',
    causal_id: 'causal:google-managed-agent-001',
    requester: {
      principal_id: 'principal:owner'
    },
    execution_target: {
      integration_id: GOOGLE_MANAGED_AGENT_CATALOG_ENTRY,
      integration_class: 'agent-runtime',
      catalog_entry_id: GOOGLE_MANAGED_AGENT_CATALOG_ENTRY,
      catalog_entry_version: '0.1.0',
      adapter_contract: {
        contract_id: 'axiom.agent-runtime-adapter',
        contract_version: '1.0.0',
        contract_sha256:
          '4954c3d1a49ea57fb0bf5a7eea29140b852e8b5fa2bb11634665f004aca2c19c'
      }
    },
    request: {
      runtime_operation: GOOGLE_MANAGED_AGENT_OPERATION,
      axiom_action: GOOGLE_MANAGED_AGENT_AXIOM_ACTION,
      purpose: 'owner-requested-managed-work',
      destinations
    },
    authority: {
      authority_source: 'axiom-gateway',
      grant_required_before_effect: true,
      coordination_is_authorization: false,
      handoff_transfers_authority: false,
      delegation_required_for_independent_child_authority: true,
      grant_id: 'grant:google-managed-agent-001',
      grant_digest:
        'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    },
    budgets: {
      timeout_ms: 300000,
      max_steps: 100,
      max_tool_calls: 100,
      max_child_tasks: 0
    },
    lifecycle: {
      state: 'queued',
      created_at: '2026-09-18T06:00:00Z',
      updated_at: '2026-09-18T06:00:00Z'
    },
    inputs: [],
    outputs: []
  };
}

test('managed-agent candidate pins harness/model and disables network by default', () => {
  const request = buildGoogleManagedAgentInteraction({
    handoff: handoff(),
    input: 'Analyze the staged files only.',
    maxTotalTokens: 50000
  });

  assert.equal(request.agent, GOOGLE_MANAGED_AGENT_ID);
  assert.equal(request.environment.type, 'remote');
  assert.equal(request.environment.network, 'disabled');
  assert.deepEqual(request.agent_config, {
    type: 'antigravity',
    model: GOOGLE_MANAGED_AGENT_MODEL,
    max_total_tokens: 50000
  });
  assert.equal(Object.hasOwn(request, 'tools'), false);
  assert.equal(Object.hasOwn(request.environment, 'env'), false);
});

test('managed-agent candidate permits only exact authorized unauthenticated egress', () => {
  const request = buildGoogleManagedAgentInteraction({
    handoff: handoff(['api.github.com']),
    input: 'Inspect the authorized public repository API.',
    allowedDomains: ['api.github.com'],
    maxTotalTokens: 25000
  });

  assert.deepEqual(request.environment.network, {
    allowlist: [{
      domain: 'api.github.com'
    }]
  });
});


test('managed-agent candidate reasserts network policy when reusing environment state', () => {
  const request = buildGoogleManagedAgentInteraction({
    handoff: handoff(),
    input: 'Continue with the existing files but no network.',
    environmentId: 'environments/managed-001',
    previousInteractionId: 'interactions/managed-001',
    maxTotalTokens: 10000
  });

  assert.equal(request.environment.environment_id, 'environments/managed-001');
  assert.equal(request.previous_interaction_id, 'interactions/managed-001');
  assert.equal(request.environment.network, 'disabled');
});

test('managed-agent candidate rejects missing AXIOM grant', () => {
  const candidate = handoff();
  delete candidate.authority.grant_id;
  delete candidate.authority.grant_digest;

  assert.throws(
    () => buildGoogleManagedAgentInteraction({
      handoff: candidate,
      input: 'Do work.',
      maxTotalTokens: 1000
    }),
    ValidationError
  );
});

test('managed-agent candidate rejects wildcard egress', () => {
  assert.throws(
    () => buildGoogleManagedAgentInteraction({
      handoff: handoff(['*']),
      input: 'Do work.',
      allowedDomains: ['*'],
      maxTotalTokens: 1000
    }),
    /exact hostnames/
  );
});

test('managed-agent candidate rejects egress not bound by the handoff', () => {
  assert.throws(
    () => buildGoogleManagedAgentInteraction({
      handoff: handoff(['api.github.com']),
      input: 'Do work.',
      allowedDomains: ['api.github.com', 'example.com'],
      maxTotalTokens: 1000
    }),
    /exactly match/
  );
});

test('managed-agent candidate rejects provider credential brokerage until grant binding exists', () => {
  assert.throws(
    () => buildGoogleManagedAgentInteraction({
      handoff: handoff(['api.github.com']),
      input: 'Do work.',
      allowedDomains: ['api.github.com'],
      credentialBindings: [{
        domain: 'api.github.com',
        credential_id: 'credential:github-production'
      }],
      maxTotalTokens: 1000
    }),
    /credential brokerage is disabled/
  );
});


test('managed-agent candidate rejects the wrong catalog target', () => {
  const candidate = handoff();
  candidate.execution_target.catalog_entry_id = 'runtime:other';

  assert.throws(
    () => buildGoogleManagedAgentInteraction({
      handoff: candidate,
      input: 'Do work.',
      maxTotalTokens: 1000
    }),
    /not pinned/
  );
});

test('managed-agent candidate does not silently fall back to another harness identifier', () => {
  const request = buildGoogleManagedAgentInteraction({
    handoff: handoff(),
    input: 'Do bounded work.',
    maxTotalTokens: 1000
  });

  assert.equal(request.agent, 'antigravity-preview-09-2026');
  assert.notEqual(request.agent, 'antigravity-preview-05-2026');
});
