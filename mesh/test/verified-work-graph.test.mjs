import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { sha256, ValidationError } from '../src/lib/canonical.mjs';
import {
  VERIFIED_WORK_GRAPH_SCHEMA,
  validateVerifiedWorkGraph,
  verifiedWorkGraphDigest,
  verifiedWorkGraphTopologicalOrder
} from '../src/lib/verified-work-graph.mjs';

function graph(overrides = {}) {
  return {
    schema: 'axiom-verified-work-graph.v0',
    version: '0.1.0',
    status: 'inert-evidence',
    graph_id: 'work.example.001',
    subject_ref: 'repo:Zoverions/AXIOM-MESH',
    nodes: [
      {
        node_id: 'goal',
        kind: 'goal',
        label: 'Produce verified change',
        state: 'accepted',
        dependencies: [],
        artifact_digest: null,
        verification_result: 'not-applicable',
        verifier_ref: null,
        verification_evidence_digest: null,
        lineage_ref: null
      },
      {
        node_id: 'task.a',
        kind: 'task',
        label: 'Implement bounded change',
        state: 'accepted',
        dependencies: ['goal'],
        artifact_digest: null,
        verification_result: 'not-applicable',
        verifier_ref: null,
        verification_evidence_digest: null,
        lineage_ref: 'agent-lineage:child-a'
      },
      {
        node_id: 'artifact.a',
        kind: 'artifact',
        label: 'Candidate artifact',
        state: 'accepted',
        dependencies: ['task.a'],
        artifact_digest: sha256('candidate-artifact'),
        verification_result: 'not-applicable',
        verifier_ref: null,
        verification_evidence_digest: null,
        lineage_ref: 'agent-lineage:child-a'
      },
      {
        node_id: 'verify.a',
        kind: 'verification',
        label: 'Independent verification',
        state: 'accepted',
        dependencies: ['artifact.a'],
        artifact_digest: null,
        verification_result: 'pass',
        verifier_ref: 'verifier:independent-a',
        verification_evidence_digest: sha256('verification-evidence'),
        lineage_ref: null
      }
    ],
    created_at: '2026-09-05T23:45:00.000Z',
    contains_secret_material: false,
    authority_effect: 'none',
    network_effect: 'none',
    execution_authority: false,
    ...overrides
  };
}

function mutateNode(base, nodeId, changes) {
  return {
    ...base,
    nodes: base.nodes.map(node => node.node_id === nodeId ? { ...node, ...changes } : { ...node })
  };
}

test('valid verified work graph is an inert DAG with deterministic topological order', () => {
  const normalized = validateVerifiedWorkGraph(graph());
  assert.equal(normalized.schema, VERIFIED_WORK_GRAPH_SCHEMA);
  assert.equal(normalized.authority_effect, 'none');
  assert.equal(normalized.execution_authority, false);
  assert.deepEqual(verifiedWorkGraphTopologicalOrder(graph()), ['goal', 'task.a', 'artifact.a', 'verify.a']);
});

test('verified work graph requires exactly one dependency-free goal', () => {
  assert.throws(
    () => validateVerifiedWorkGraph({ ...graph(), nodes: graph().nodes.filter(node => node.kind !== 'goal') }),
    /exactly one goal/i
  );
  assert.throws(
    () => validateVerifiedWorkGraph(mutateNode(graph(), 'goal', { dependencies: ['task.a'] })),
    /goal.*dependencies/i
  );
});

test('verified work graph rejects missing duplicate self and cyclic dependencies', () => {
  assert.throws(
    () => validateVerifiedWorkGraph(mutateNode(graph(), 'task.a', { dependencies: ['missing'] })),
    /missing dependency/i
  );
  assert.throws(
    () => validateVerifiedWorkGraph(mutateNode(graph(), 'task.a', { dependencies: ['goal', 'goal'] })),
    /duplicate dependency/i
  );
  assert.throws(
    () => validateVerifiedWorkGraph(mutateNode(graph(), 'task.a', { dependencies: ['task.a'] })),
    /self-dependency/i
  );
  const cyclic = mutateNode(graph(), 'goal', { dependencies: [] });
  cyclic.nodes = cyclic.nodes.map(node => {
    if (node.node_id === 'task.a') return { ...node, dependencies: ['artifact.a'] };
    if (node.node_id === 'artifact.a') return { ...node, dependencies: ['task.a'] };
    return node;
  });
  assert.throws(() => validateVerifiedWorkGraph(cyclic), /cycle/i);
});

test('verified work graph enforces artifact and verification semantics', () => {
  assert.throws(
    () => validateVerifiedWorkGraph(mutateNode(graph(), 'artifact.a', { artifact_digest: null })),
    /artifact.*digest/i
  );
  assert.throws(
    () => validateVerifiedWorkGraph(mutateNode(graph(), 'task.a', { artifact_digest: sha256('forbidden') })),
    /non-artifact.*digest/i
  );
  assert.throws(
    () => validateVerifiedWorkGraph(mutateNode(graph(), 'verify.a', { verifier_ref: null })),
    /verification.*verifier/i
  );
  assert.throws(
    () => validateVerifiedWorkGraph(mutateNode(graph(), 'task.a', { verification_result: 'pass' })),
    /non-verification/i
  );
});

test('verified work graph rejects authority widening and unknown fields', () => {
  assert.throws(() => validateVerifiedWorkGraph(graph({ authority_effect: 'grant' })), /authority_effect/i);
  assert.throws(() => validateVerifiedWorkGraph(graph({ network_effect: 'egress' })), /network_effect/i);
  assert.throws(() => validateVerifiedWorkGraph(graph({ execution_authority: true })), /execution_authority/i);
  assert.throws(
    () => validateVerifiedWorkGraph(graph({ capability_grant: 'x' })),
    error => error instanceof ValidationError && /unknown field/i.test(error.message)
  );
});

test('verified work graph digest is deterministic', () => {
  assert.equal(verifiedWorkGraphDigest(graph()), verifiedWorkGraphDigest(graph()));
});

test('verified work graph JSON schema mirrors strict node boundary', async () => {
  const schema = JSON.parse(await readFile(new URL('../config/verified-work-graph-v0.schema.json', import.meta.url), 'utf8'));
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.schema.const, VERIFIED_WORK_GRAPH_SCHEMA);
  assert.equal(schema.$defs.node.additionalProperties, false);
  assert.deepEqual(schema.$defs.node.properties.kind.enum, ['goal', 'task', 'artifact', 'verification']);
  assert.equal(schema.properties.authority_effect.const, 'none');
  assert.equal(schema.properties.execution_authority.const, false);
});
