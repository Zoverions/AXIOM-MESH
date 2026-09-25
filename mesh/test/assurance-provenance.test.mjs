import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ASSURANCE_PROVENANCE_SCHEMA,
  ASSURANCE_PROVENANCE_RECORD_KIND,
  assuranceProvenanceIntentEvidence,
  assuranceProvenanceMemoryInput,
  buildAssuranceProvenanceBundle,
  normalizeAssuranceProvenanceBundle
} from '../src/lib/assurance-provenance.mjs';

const D = char => char.repeat(64);

test('planned assurance provenance binds upstream lineage without claiming completion', () => {
  const bundle = buildAssuranceProvenanceBundle({
    taskId: 'task.provenance',
    phase: 'planned',
    selectedTier: 'A3',
    signalResolutionDigest: D('a'),
    assuranceDecisionDigest: D('b'),
    workOrderDigest: D('c')
  });
  assert.equal(bundle.schema, ASSURANCE_PROVENANCE_SCHEMA);
  assert.equal(bundle.completion_digest, null);
  assert.equal(bundle.completion_satisfied, false);
  assert.equal(bundle.authority_effect, 'none');
  assert.equal(bundle.execution_effect, 'none');
  assert.match(bundle.provenance_digest, /^[a-f0-9]{64}$/);
});

test('completed provenance requires a satisfied completion digest', () => {
  const bundle = buildAssuranceProvenanceBundle({
    taskId: 'task.provenance',
    phase: 'completed',
    selectedTier: 'A3',
    signalResolutionDigest: D('a'),
    assuranceDecisionDigest: D('b'),
    workOrderDigest: D('c'),
    completionDigest: D('d'),
    completionSatisfied: true
  });
  assert.equal(bundle.completion_satisfied, true);
  assert.equal(bundle.completion_digest, D('d'));

  assert.throws(
    () => buildAssuranceProvenanceBundle({
      taskId: 'task.provenance',
      phase: 'completed',
      selectedTier: 'A3',
      signalResolutionDigest: D('a'),
      assuranceDecisionDigest: D('b'),
      workOrderDigest: D('c'),
      completionDigest: D('d'),
      completionSatisfied: false
    }),
    /satisfied completion/
  );
});

test('tampered provenance digests fail closed', () => {
  const bundle = buildAssuranceProvenanceBundle({
    taskId: 'task.provenance',
    phase: 'completed',
    selectedTier: 'A2',
    signalResolutionDigest: D('a'),
    assuranceDecisionDigest: D('b'),
    workOrderDigest: D('c'),
    completionDigest: D('d'),
    completionSatisfied: true
  });
  assert.throws(
    () => normalizeAssuranceProvenanceBundle({
      ...bundle,
      work_order_digest: D('e')
    }),
    /provenance_digest mismatch/
  );
});

test('provenance becomes Intent evidence only as an explicit evidence artifact', () => {
  const bundle = buildAssuranceProvenanceBundle({
    taskId: 'task.provenance',
    phase: 'completed',
    selectedTier: 'A3',
    signalResolutionDigest: D('a'),
    assuranceDecisionDigest: D('b'),
    workOrderDigest: D('c'),
    completionDigest: D('d'),
    completionSatisfied: true
  });
  const evidence = assuranceProvenanceIntentEvidence(bundle, {
    ref: 'grid://assurance/task.provenance'
  });
  assert.deepEqual(evidence, {
    obligation: 'adaptive-assurance-provenance',
    artifact_digest: bundle.provenance_digest,
    artifact_type: ASSURANCE_PROVENANCE_SCHEMA,
    ref: 'grid://assurance/task.provenance'
  });
});

test('assurance provenance stores through ordinary memory input without authority fields', () => {
  const bundle = buildAssuranceProvenanceBundle({
    taskId: 'task.provenance',
    phase: 'completed',
    selectedTier: 'A3',
    signalResolutionDigest: D('a'),
    assuranceDecisionDigest: D('b'),
    workOrderDigest: D('c'),
    completionDigest: D('d'),
    completionSatisfied: true
  });
  const memoryInput = assuranceProvenanceMemoryInput(bundle);
  assert.equal(memoryInput.kind, ASSURANCE_PROVENANCE_RECORD_KIND);
  assert.equal(memoryInput.content.provenance_digest, bundle.provenance_digest);
  assert.deepEqual(memoryInput.metadata, {});
  assert.equal('capability' in memoryInput, false);
  assert.equal('approval' in memoryInput, false);
  assert.equal('execution' in memoryInput, false);
});

test('planned provenance cannot masquerade as completed provenance', () => {
  assert.throws(
    () => buildAssuranceProvenanceBundle({
      taskId: 'task.provenance',
      phase: 'planned',
      selectedTier: 'A2',
      signalResolutionDigest: D('a'),
      assuranceDecisionDigest: D('b'),
      workOrderDigest: D('c'),
      completionDigest: D('d')
    }),
    /planned assurance provenance cannot contain completionDigest/
  );
});
