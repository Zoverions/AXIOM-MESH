import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  assessResearchReproductionBinding,
  researchContractDigest
} from '../src/lib/research-capsule-contracts.mjs';

const fixtureUrl = new URL('../fixtures/research-capsules/research-capsule-v0.vectors.json', import.meta.url);
const vectors = JSON.parse(await readFile(fixtureUrl, 'utf8'));

function seal(value, digestField) {
  return { ...value, [digestField]: researchContractDigest(value, digestField) };
}

function caseById(id) {
  const raw = vectors.cases.find(item => item.id === id);
  assert.ok(raw);
  const manifest = seal(raw.source_manifest, 'manifest_digest');
  const operation = seal({
    ...raw.operation,
    source_manifest_digest: manifest.manifest_digest
  }, 'operation_digest');
  const evidence = seal({
    ...raw.reproduction,
    source_manifest_digest: manifest.manifest_digest,
    operation_digest: operation.operation_digest
  }, 'evidence_digest');
  return { manifest, operation, evidence };
}

test('reproduction provenance is structurally bound but is not an execution or truth verdict', () => {
  const { manifest, operation, evidence } = caseById('executable-paper');
  assert.deepEqual(assessResearchReproductionBinding(evidence, operation, manifest), {
    binding: 'structurally_consistent',
    manifest_currentness_claim: 'current',
    currentness_assessment: 'manifest_claims_current',
    execution_verified: false,
    truth_established: false,
    authority_effect: 'none'
  });

  // A claimed pass under a non-exact tolerance does not prove output equality.
  const toleratedEvidence = seal({
    ...evidence,
    observed_output_digests: ['sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'],
    tolerance_method: 'self-declared bounded tolerance'
  }, 'evidence_digest');
  assert.equal(
    assessResearchReproductionBinding(toleratedEvidence, operation, manifest).execution_verified,
    false
  );
});

test('stale source revision remains bound historical evidence, not current evidence', () => {
  const { manifest, operation, evidence } = caseById('stale-repository');
  assert.deepEqual(assessResearchReproductionBinding(evidence, operation, manifest), {
    binding: 'structurally_consistent',
    manifest_currentness_claim: 'stale_revision',
    currentness_assessment: 'historical_only',
    execution_verified: false,
    truth_established: false,
    authority_effect: 'none'
  });
});

test('corrected source is historical; unknown currentness stays undetermined', () => {
  const raw = vectors.cases.find(item => item.id === 'executable-paper');
  for (const [state, expected] of [
    ['corrected', 'historical_only'],
    ['unknown', 'unknown']
  ]) {
    const manifest = seal({ ...raw.source_manifest, currentness_state: state }, 'manifest_digest');
    const operation = seal({
      ...raw.operation,
      source_manifest_digest: manifest.manifest_digest
    }, 'operation_digest');
    const evidence = seal({
      ...raw.reproduction,
      source_manifest_digest: manifest.manifest_digest,
      operation_digest: operation.operation_digest
    }, 'evidence_digest');
    assert.equal(
      assessResearchReproductionBinding(evidence, operation, manifest).currentness_assessment,
      expected
    );
  }
});

test('re-sealed substitution of source, operation, revision, environment or expected outputs fails', () => {
  const { manifest, operation, evidence } = caseById('executable-paper');
  const otherDigest = 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const wrongEvidence = [
    [{ source_manifest_digest: otherDigest }, /source manifest digest binding mismatch/],
    [{ operation_digest: otherDigest }, /operation digest binding mismatch/],
    [{ source_revision: 'substituted-revision' }, /source revision binding mismatch/],
    [{ environment_digest: otherDigest }, /environment digest binding mismatch/],
    [{ expected_output_digests: [otherDigest] }, /reference output digest binding mismatch/]
  ];
  for (const [change, error] of wrongEvidence) {
    assert.throws(() => assessResearchReproductionBinding(
      seal({ ...evidence, ...change }, 'evidence_digest'), operation, manifest
    ), error);
  }

  const substitutedOperation = seal({
    ...operation,
    source_manifest_digest: otherDigest
  }, 'operation_digest');
  const reboundEvidence = seal({
    ...evidence,
    operation_digest: substitutedOperation.operation_digest
  }, 'evidence_digest');
  assert.throws(() => assessResearchReproductionBinding(
    reboundEvidence, substitutedOperation, manifest
  ), /source manifest digest binding mismatch/);

  const revisedOperation = seal({
    ...operation,
    source_revision: 'substituted-revision'
  }, 'operation_digest');
  const revisedEvidence = seal({
    ...evidence,
    operation_digest: revisedOperation.operation_digest,
    source_revision: revisedOperation.source_revision
  }, 'evidence_digest');
  assert.throws(() => assessResearchReproductionBinding(
    revisedEvidence, revisedOperation, manifest
  ), /source revision binding mismatch/);
});

test('self-inconsistent and impossible claimed pass receipts fail closed', () => {
  const { manifest, operation, evidence } = caseById('executable-paper');
  assert.throws(() => assessResearchReproductionBinding(
    { ...evidence, attempt_count: 0 }, operation, manifest
  ), /digest/);
  for (const change of [
    { attempt_count: 0 },
    { expected_output_digests: [] },
    { observed_output_digests: [] }
  ]) {
    assert.throws(() => assessResearchReproductionBinding(
      seal({ ...evidence, ...change }, 'evidence_digest'), operation, manifest
    ), /claimed pass requires/);
  }
});

test('not-run evidence may omit outputs without becoming a pass', () => {
  const { manifest, operation, evidence } = caseById('executable-paper');
  const notRun = seal({
    ...evidence,
    attempt_count: 0,
    disposition: 'not_run',
    expected_output_digests: [],
    observed_output_digests: []
  }, 'evidence_digest');
  const assessment = assessResearchReproductionBinding(notRun, operation, manifest);
  assert.equal(assessment.binding, 'structurally_consistent');
  assert.equal(assessment.execution_verified, false);
  assert.equal(Object.hasOwn(assessment, 'disposition'), false);
  assert.equal(Object.isFrozen(assessment), true);
});

test('attempted failure cannot omit declared reference outputs to bypass binding', () => {
  const { manifest, operation, evidence } = caseById('executable-paper');
  const incompleteFailure = seal({
    ...evidence,
    disposition: 'fail',
    expected_output_digests: [],
    observed_output_digests: []
  }, 'evidence_digest');
  assert.throws(() => assessResearchReproductionBinding(
    incompleteFailure, operation, manifest
  ), /reference output digest binding mismatch/);
});
