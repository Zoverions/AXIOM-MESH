import assert from 'node:assert/strict';
import test from 'node:test';
import { digestObject } from '../src/lib/canonical.mjs';
import {
  assessAgentAssuranceEvidence,
  normalizeAgentAssuranceEvidence,
  sealAgentAssuranceEvidence,
  verifySealedAgentAssuranceEvidence
} from '../src/lib/agent-assurance-evidence.mjs';

const D = char => char.repeat(64);

function fixture(overrides = {}) {
  return {
    agent: {
      agent_id: 'agent.identity.researcher',
      principal_id: 'agent.principal.session.1',
      authority_digest: D('a'),
      model_id: 'model:gpt-5.6-sol',
      run_id: 'run:2026-09-18T0040',
      ...(overrides.agent ?? {})
    },
    provenance: overrides.provenance ?? [
      { kind: 'source', ref: 'source:moonshots:291', digest: D('b') },
      { kind: 'decision', ref: 'decision:assurance:1', digest: D('c') }
    ],
    environment: overrides.environment ?? {
      declared: {
        egress: 'allowlist',
        network_destinations: ['provider:fixture'],
        writable_paths: ['workspace:tmp'],
        secret_refs: [],
        tools: ['tool:search', 'tool:test']
      },
      observed: {
        egress: 'loopback',
        network_destinations: [],
        writable_paths: ['workspace:tmp'],
        secret_refs: [],
        tools: ['tool:test']
      }
    },
    oversight: overrides.oversight ?? {
      monitor_ref: 'monitor:online:v1',
      total_actions: 100,
      monitored_actions: 100,
      blocked_actions: 2,
      escalated_actions: 1,
      review_latency_ms_p50: 12,
      review_latency_ms_p95: 40
    },
    evaluator_bundle: overrides.evaluator_bundle ?? {
      bundle_id: 'eval:bundle:1',
      bundle_digest: D('d'),
      evaluators: [
        {
          evaluator_id: 'eval:security:1',
          artifact_digest: D('e'),
          execution_mode: 'isolated-readonly',
          network: 'none',
          authority: 'none'
        }
      ]
    },
    mission_graph: overrides.mission_graph ?? {
      graph_id: 'mission:graph:1',
      delegation_mode: 'observational-only',
      authority_effect: 'none',
      nodes: [
        {
          task_id: 'task:root',
          parent_task_id: null,
          actor_ref: 'agent.identity.researcher',
          objective_digest: D('f'),
          status: 'running'
        },
        {
          task_id: 'task:test',
          parent_task_id: 'task:root',
          actor_ref: 'agent.identity.verifier',
          objective_digest: D('1'),
          status: 'completed'
        }
      ]
    }
  };
}

test('agent assurance keeps persistent identity, authority principal, model, and run separate', () => {
  const evidence = normalizeAgentAssuranceEvidence(fixture());
  assert.equal(evidence.agent.agent_id, 'agent.identity.researcher');
  assert.equal(evidence.agent.principal_id, 'agent.principal.session.1');
  assert.equal(evidence.agent.model_id, 'model:gpt-5.6-sol');
  assert.equal(evidence.agent.run_id, 'run:2026-09-18T0040');
  assert.notEqual(evidence.agent.agent_id, evidence.agent.model_id);
  assert.notEqual(evidence.agent.agent_id, evidence.agent.run_id);
});

test('agent assurance rejects identity/model/run conflation', () => {
  assert.throws(
    () => normalizeAgentAssuranceEvidence(fixture({ agent: { model_id: 'agent.identity.researcher' } })),
    /must remain distinct identities/
  );
  assert.throws(
    () => normalizeAgentAssuranceEvidence(fixture({ agent: { run_id: 'model:gpt-5.6-sol' } })),
    /must remain distinct identities/
  );
});

test('environment observation may be narrower but not broader than declaration', () => {
  const ok = assessAgentAssuranceEvidence(fixture());
  assert.equal(ok.conformant, true);
  assert.equal(ok.authorizes_execution, false);

  const expanded = fixture({
    environment: {
      ...fixture().environment,
      observed: {
        ...fixture().environment.observed,
        egress: 'allowlist',
        network_destinations: ['provider:untrusted'],
        tools: ['tool:test', 'tool:shell']
      }
    }
  });
  const assessment = assessAgentAssuranceEvidence(expanded);
  assert.equal(assessment.conformant, false);
  assert.deepEqual(
    assessment.findings.map(item => item.code).sort(),
    ['environment_network_destinations_exceeds_declaration', 'environment_tools_exceeds_declaration']
  );
});

test('oversight coverage is derived and incomplete coverage remains visible', () => {
  const assessment = assessAgentAssuranceEvidence(fixture({
    oversight: {
      ...fixture().oversight,
      monitored_actions: 97
    }
  }));
  assert.equal(assessment.metrics.monitor_coverage_basis_points, 9700);
  assert.equal(assessment.conformant, false);
  assert.equal(assessment.findings[0].code, 'monitor_coverage_incomplete');
});

test('evaluator bundle is read-only offline metadata and cannot carry authority', () => {
  const bad = fixture({
    evaluator_bundle: {
      ...fixture().evaluator_bundle,
      evaluators: [{
        ...fixture().evaluator_bundle.evaluators[0],
        authority: 'grant'
      }]
    }
  });
  assert.throws(() => normalizeAgentAssuranceEvidence(bad), /cannot grant authority/);

  const networked = fixture({
    evaluator_bundle: {
      ...fixture().evaluator_bundle,
      evaluators: [{
        ...fixture().evaluator_bundle.evaluators[0],
        network: 'allowlist'
      }]
    }
  });
  assert.throws(() => normalizeAgentAssuranceEvidence(networked), /network must be none/);
});

test('mission graph is observational-only and rejects cycles or implicit delegation', () => {
  assert.throws(() => normalizeAgentAssuranceEvidence(fixture({
    mission_graph: { ...fixture().mission_graph, delegation_mode: 'active' }
  })), /observational-only/);

  const cyclic = fixture({
    mission_graph: {
      ...fixture().mission_graph,
      nodes: [
        {
          task_id: 'task:root', parent_task_id: null, actor_ref: 'agent.a',
          objective_digest: D('1'), status: 'running'
        },
        {
          task_id: 'task:a', parent_task_id: 'task:b', actor_ref: 'agent.a',
          objective_digest: D('2'), status: 'running'
        },
        {
          task_id: 'task:b', parent_task_id: 'task:a', actor_ref: 'agent.b',
          objective_digest: D('3'), status: 'running'
        }
      ]
    }
  });
  assert.throws(() => normalizeAgentAssuranceEvidence(cyclic), /cannot contain cycles/);
});

test('sealed assurance evidence binds the normalized digest and still grants no authority', () => {
  const identity = {
    service: 'grid',
    signObject(statement) {
      return {
        algorithm: 'Ed25519',
        key_id: 'grid:test-key',
        digest: digestObject(statement),
        signature: 'fixture-signature-0123456789'
      };
    }
  };
  const sealed = sealAgentAssuranceEvidence(fixture(), identity);
  const verified = verifySealedAgentAssuranceEvidence(sealed, {
    verifySignature(statement, attestation) {
      return attestation.digest === digestObject(statement)
        && attestation.signature === 'fixture-signature-0123456789';
    }
  });
  assert.equal(verified.verified, true);
  assert.equal(verified.authority_effect, 'none');
  assert.equal(verified.authorizes_execution, false);

  const tampered = structuredClone(sealed);
  tampered.statement.evidence.oversight.blocked_actions = 3;
  assert.throws(
    () => verifySealedAgentAssuranceEvidence(tampered, { verifySignature: () => true }),
    /digest does not match/
  );
});

test('unknown fields are rejected rather than silently ignored', () => {
  const value = fixture();
  value.agent.capabilities = ['*'];
  assert.throws(
    () => normalizeAgentAssuranceEvidence(value),
    /unsupported field: capabilities/
  );
});


test('agent assurance normalization uses deterministic code-unit ordering', () => {
  const value = fixture({
    evaluator_bundle: {
      ...fixture().evaluator_bundle,
      evaluators: [
        {
          evaluator_id: 'eval:a', artifact_digest: D('e'),
          execution_mode: 'isolated-readonly', network: 'none', authority: 'none'
        },
        {
          evaluator_id: 'eval:Z', artifact_digest: D('f'),
          execution_mode: 'isolated-readonly', network: 'none', authority: 'none'
        }
      ]
    },
    mission_graph: {
      ...fixture().mission_graph,
      nodes: [
        {
          task_id: 'task:root', parent_task_id: null,
          actor_ref: 'agent.identity.researcher', objective_digest: D('1'), status: 'running'
        },
        {
          task_id: 'task:a', parent_task_id: 'task:root',
          actor_ref: 'agent.identity.researcher', objective_digest: D('2'), status: 'planned'
        },
        {
          task_id: 'task:Z', parent_task_id: 'task:root',
          actor_ref: 'agent.identity.researcher', objective_digest: D('3'), status: 'planned'
        }
      ]
    }
  });
  const normalized = normalizeAgentAssuranceEvidence(value);
  assert.deepEqual(normalized.evaluator_bundle.evaluators.map(item => item.evaluator_id), [
    'eval:Z', 'eval:a'
  ]);
  assert.deepEqual(normalized.mission_graph.nodes.map(item => item.task_id), [
    'task:Z', 'task:a', 'task:root'
  ]);
});
