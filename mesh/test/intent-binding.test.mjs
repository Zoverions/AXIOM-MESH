import assert from 'node:assert/strict';
import test from 'node:test';
import {
  intentRequestBinding,
  intentRequestDigest,
  sameIntentRequest
} from '../src/lib/intent-binding.mjs';

const human = {
  id: 'owner.intent-binding',
  type: 'human',
  roles: ['administrator'],
  scopes: ['*']
};

const machine = {
  ...human,
  id: 'agent.intent-binding',
  type: 'agent',
  schema: 'axiom-machine-principal.v1',
  authority_digest: 'a'.repeat(64)
};

test('canonical request identity normalizes data-scope order and duplicates', () => {
  const left = {
    principal: human,
    action: 'system.echo',
    input: { message: 'same effect' },
    purpose: 'test.conformance',
    data_scopes: ['memory.beta', 'memory.alpha', 'memory.beta']
  };
  const right = {
    ...left,
    data_scopes: ['memory.alpha', 'memory.beta']
  };

  assert.deepEqual(intentRequestBinding(left).data_scopes, [
    'memory.alpha',
    'memory.beta'
  ]);
  assert.equal(intentRequestDigest(left), intentRequestDigest(right));
  assert.equal(sameIntentRequest(left, right), true);
});

test('transient intent fields do not change request identity', () => {
  const base = {
    principal: human,
    action: 'system.echo',
    input: { message: 'same effect' },
    purpose: 'test.conformance',
    data_scopes: []
  };
  const retried = {
    ...base,
    intent_id: 'intent_retry',
    submitted_at: '2099-01-01T00:00:00.000Z',
    confirmations: ['confirm.example'],
    approval_ids: ['approval_example']
  };

  assert.equal(intentRequestDigest(base), intentRequestDigest(retried));
});

test('machine authority digest is part of exact request identity', () => {
  const base = {
    principal: machine,
    action: 'system.echo',
    input: { message: 'authority-bound' },
    purpose: 'test.conformance',
    data_scopes: []
  };
  const changedAuthority = {
    ...base,
    principal: {
      ...machine,
      authority_digest: 'b'.repeat(64)
    }
  };

  assert.equal(
    intentRequestBinding(base).machine_authority_digest,
    'a'.repeat(64)
  );
  assert.notEqual(
    intentRequestDigest(base),
    intentRequestDigest(changedAuthority)
  );
});


test('agent assurance digest participates in request identity (no idempotency collision)', () => {
  const base = {
    principal: machine,
    action: 'system.echo',
    input: { message: 'assurance-bound' },
    purpose: 'test.conformance',
    data_scopes: [],
    assurance_evidence: {
      agent: {
        agent_id: 'agent.identity.assurance',
        principal_id: machine.id,
        authority_digest: machine.authority_digest,
        model_id: 'model:fixture',
        run_id: 'run:assurance:a'
      },
      provenance: [
        { kind: 'source', ref: 'source:assurance:test', digest: 'b'.repeat(64) }
      ],
      environment: {
        declared: {
          egress: 'allowlist',
          network_destinations: ['provider:fixture'],
          writable_paths: ['workspace:tmp'],
          secret_refs: [],
          tools: ['tool:test']
        },
        observed: {
          egress: 'loopback',
          network_destinations: [],
          writable_paths: ['workspace:tmp'],
          secret_refs: [],
          tools: ['tool:test']
        }
      },
      oversight: {
        monitor_ref: 'monitor:assurance:v1',
        total_actions: 10,
        monitored_actions: 10,
        blocked_actions: 0,
        escalated_actions: 0,
        review_latency_ms_p50: 10,
        review_latency_ms_p95: 20
      },
      evaluator_bundle: {
        bundle_id: 'eval:assurance:1',
        bundle_digest: 'c'.repeat(64),
        evaluators: [{
          evaluator_id: 'eval:fixture:1',
          artifact_digest: 'd'.repeat(64),
          execution_mode: 'isolated-readonly',
          network: 'none',
          authority: 'none'
        }]
      },
      mission_graph: {
        graph_id: 'mission:assurance:1',
        delegation_mode: 'observational-only',
        authority_effect: 'none',
        nodes: [{
          task_id: 'task:root',
          parent_task_id: null,
          actor_ref: 'agent.identity.assurance',
          objective_digest: 'e'.repeat(64),
          status: 'running'
        }]
      }
    }
  };

  const differentEvidence = {
    ...base,
    assurance_evidence: {
      ...base.assurance_evidence,
      agent: {
        ...base.assurance_evidence.agent,
        run_id: 'run:assurance:b'
      }
    }
  };

  const withoutEvidence = {
    principal: machine,
    action: 'system.echo',
    input: { message: 'assurance-bound' },
    purpose: 'test.conformance',
    data_scopes: []
  };

  const binding = intentRequestBinding(base);
  assert.equal(typeof binding.agent_assurance_digest, 'string');
  assert.equal(binding.agent_assurance_digest.length, 64);
  assert.notEqual(
    intentRequestDigest(base),
    intentRequestDigest(differentEvidence)
  );
  assert.notEqual(
    intentRequestDigest(base),
    intentRequestDigest(withoutEvidence)
  );
  assert.equal(Object.hasOwn(intentRequestBinding(withoutEvidence), 'agent_assurance_digest'), false);
});

test('assurance evidence on a non-machine principal fails closed in request identity', () => {
  assert.throws(() => intentRequestBinding({
    principal: human,
    action: 'system.echo',
    input: { message: 'nope' },
    purpose: 'test.conformance',
    data_scopes: [],
    assurance_evidence: { agent: { principal_id: 'x' } }
  }), /requires a constrained machine principal/);
});
