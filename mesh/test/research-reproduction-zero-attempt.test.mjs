import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assessResearchReproductionBinding,
  researchContractDigest
} from '../src/lib/research-capsule-contracts.mjs';

// Synthetic, self-digested records only. No method execution or external I/O.
const A = `sha256:${'a'.repeat(64)}`;
const B = `sha256:${'b'.repeat(64)}`;
const C = `sha256:${'c'.repeat(64)}`;

function seal(value, field) {
  return { ...value, [field]: researchContractDigest(value, field) };
}

function fixture({
  reference = [A], expected = [A], observed = [], attempts = 0,
  disposition = 'not_run', currentness = 'current'
} = {}) {
  const manifest = seal({
    schema: 'axiom-research-source-manifest.v0',
    manifest_id: 'synthetic-source', source_kind: 'research_paper',
    canonical_identifier: 'synthetic:zero-attempt-binding',
    source_locator: 'https://research.example.invalid/synthetic',
    title: 'Synthetic reproduction binding fixture',
    published_at: '2026-09-24T00:00:00.000Z',
    retrieved_at: '2026-09-24T01:00:00.000Z',
    manuscript_digest: C, source_version: 'v0',
    supplement_refs: [], data_refs: [], code_refs: ['synthetic:method'],
    code_revision: 'synthetic-revision', license_refs: [], authorship_refs: [],
    correction_refs: [], currentness_state: currentness
  }, 'manifest_digest');
  const operation = seal({
    schema: 'axiom-research-operation-candidate.v0',
    operation_id: 'synthetic-operation',
    source_manifest_digest: manifest.manifest_digest,
    source_revision: manifest.code_revision,
    adapter_kind: 'synthetic', interface_kind: 'function',
    source_code_ref: 'synthetic:method',
    declared_inputs: [], declared_outputs: ['synthetic:output'], dependency_refs: [],
    environment_digest: C, network_requirement: 'none',
    filesystem_requirement: 'none', credential_requirement: 'none',
    declared_effect_class: 'read_only', data_classes: ['synthetic'],
    determinism_class: 'deterministic', reference_output_digests: reference,
    domain_constraints: [], execution_authority: 'none'
  }, 'operation_digest');
  const evidence = seal({
    schema: 'axiom-research-reproduction-evidence.v0',
    evidence_id: 'synthetic-evidence',
    source_manifest_digest: manifest.manifest_digest,
    operation_digest: operation.operation_digest,
    source_revision: operation.source_revision,
    environment_digest: operation.environment_digest,
    fixture_digests: [C], expected_output_digests: expected,
    observed_output_digests: observed, tolerance_method: 'synthetic-declared-tolerance',
    attempt_count: attempts, disposition, failure_diagnostics: [],
    verifier_id: 'synthetic-verifier', network_profile: 'none',
    claim_scope: 'Structural consistency of synthetic records only',
    truth_established: false, authority_effect: 'none'
  }, 'evidence_digest');
  return { manifest, operation, evidence };
}

function assess({ manifest, operation, evidence }) {
  return assessResearchReproductionBinding(evidence, operation, manifest);
}

function assertNonAuthorizing(result) {
  assert.equal(result.binding, 'structurally_consistent');
  assert.equal(result.execution_verified, false);
  assert.equal(result.truth_established, false);
  assert.equal(result.authority_effect, 'none');
  assert.equal(Object.hasOwn(result, 'disposition'), false);
  assert.equal(Object.isFrozen(result), true);
}

for (const disposition of ['not_run', 'excluded', 'fail']) {
  test(`zero-attempt ${disposition} rejects conflicting supplied expectations`, () => {
    assert.throws(() => assess(fixture({ disposition, expected: [B] })),
      /reference output digest binding mismatch/);
  });
}

test('zero-attempt non-pass receipts may still omit expected outputs', () => {
  for (const disposition of ['not_run', 'excluded', 'fail']) {
    assertNonAuthorizing(assess(fixture({ disposition, expected: [] })));
  }
});

test('zero-attempt supplied expectations match the reference set regardless of order', () => {
  for (const disposition of ['not_run', 'excluded', 'fail']) {
    assertNonAuthorizing(assess(fixture({ disposition, reference: [A, B], expected: [B, A] })));
  }
});

test('zero-attempt expectations reject partial or extra reference sets', () => {
  for (const expected of [[A], [A, B, C], [A, C]]) {
    assert.throws(() => assess(fixture({ reference: [A, B], expected })),
      /reference output digest binding mismatch/);
  }
});

test('duplicate expected and reference digests remain invalid before binding', () => {
  assert.throws(() => assess(fixture({ expected: [A, A] })),
    /expected_output_digests items must be unique/);
  assert.throws(() => assess(fixture({ reference: [A, A] })),
    /reference_output_digests items must be unique/);
});

test('absent reference outputs do not become a fabricated equality requirement', () => {
  for (const attempts of [0, 1]) {
    for (const expected of [[], [B]]) {
      assertNonAuthorizing(assess(fixture({ reference: [], attempts, expected, disposition: 'fail' })));
    }
  }
});

test('attempted non-pass receipts still cannot omit declared reference outputs', () => {
  for (const disposition of ['not_run', 'excluded', 'fail']) {
    assert.throws(() => assess(fixture({ disposition, attempts: 1, expected: [] })),
      /reference output digest binding mismatch/);
  }
});

test('zero-attempt pass remains impossible even with matching outputs', () => {
  for (const expected of [[], [A]]) {
    assert.throws(() => assess(fixture({ disposition: 'pass', expected, observed: [A] })),
      /claimed pass requires/);
  }
});

test('claimed observed outputs are not independently verified by structural binding', () => {
  assertNonAuthorizing(assess(fixture({ attempts: 1, disposition: 'pass', observed: [B] })));
});

test('matching zero-attempt expectations preserve currentness and input records', () => {
  for (const currentness of ['current', 'stale_revision', 'corrected', 'retracted', 'withdrawn', 'unknown']) {
    const records = fixture({ currentness });
    const before = structuredClone(records);
    const result = assess(records);
    assertNonAuthorizing(result);
    assert.equal(result.currentness_assessment,
      currentness === 'current' ? 'manifest_claims_current' : currentness === 'unknown' ? 'unknown' : 'historical_only');
    assert.deepEqual(records, before);
  }
});

test('binding condition satisfies the complete 144-case receipt-state matrix', () => {
  let checked = 0;
  for (const reference of [[], [A]]) {
    for (const attempts of [0, 1, 1000]) {
      for (const disposition of ['pass', 'fail', 'excluded', 'not_run']) {
        for (const expected of [[], [A], [B]]) {
          for (const observed of [[], [A]]) {
            const options = { reference, attempts, disposition, expected, observed };
            const records = fixture(options);
            const possiblePass = disposition !== 'pass'
              || (attempts > 0 && expected.length > 0 && observed.length > 0);
            const outputsBound = reference.length === 0
              || (attempts === 0 && expected.length === 0)
              || (expected.length === 1 && expected[0] === reference[0]);
            if (possiblePass && outputsBound) {
              assertNonAuthorizing(assess(records));
            } else {
              assert.throws(() => assess(records),
                /claimed pass requires|reference output digest binding mismatch/,
                JSON.stringify(options));
            }
            checked += 1;
          }
        }
      }
    }
  }
  assert.equal(checked, 144);
});
