import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const moduleUrl = new URL('../src/lib/formal-verification-evidence.mjs', import.meta.url);
const schemaUrl = new URL(
  '../../docs/architecture/contracts/formal-verification-evidence.v0.schema.json',
  import.meta.url
);

const D = char => `sha256:${char.repeat(64)}`;

async function api() {
  assert.equal(existsSync(moduleUrl), true, 'Formal Verification Evidence v0 verifier is missing');
  assert.equal(existsSync(schemaUrl), true, 'Formal Verification Evidence v0 schema is missing');
  return import(moduleUrl.href);
}

function materialize(base, digest) {
  return { ...base, evidence_digest: digest(base) };
}

function strictBase() {
  return {
    schema: 'axiom-formal-verification-evidence.v0',
    evidence_id: 'formal:strict:1',
    target_kind: 'protocol_law',
    target_digest: D('1'),
    formal_statement_digest: D('2'),
    formal_artifact_digest: D('3'),
    checker_kind: 'lean',
    checker_version: '4.x-pinned-example',
    checker_profile_digest: D('4'),
    environment_digest: D('5'),
    dependency_closure_digest: D('6'),
    dependency_statuses: [
      { dependency_digest: D('7'), verification_state: 'freshly_checked' }
    ],
    assumptions: [],
    import_policy: 'exact',
    diagnostics: [],
    proof_check_state: 'passed',
    closure_state: 'strict',
    source_alignment_state: 'not_assessed',
    independence_state: 'unknown',
    checked_at: '2026-09-18T00:00:00.000Z',
    truth_established: false,
    authority_effect: 'none'
  };
}

test('Formal Verification Evidence v0 verifies strict and conditional closure separately', async () => {
  const mod = await api();

  const strict = materialize(strictBase(), mod.formalVerificationEvidenceDigest);
  assert.equal(mod.verifyFormalVerificationEvidence(strict).closure_state, 'strict');

  const conditionalBase = {
    ...strictBase(),
    evidence_id: 'formal:conditional:1',
    dependency_statuses: [
      { dependency_digest: D('7'), verification_state: 'reused' }
    ],
    assumptions: [
      {
        assumption_id: 'assumption:classical-input',
        statement_digest: D('8'),
        source_ref: 'source:published-result'
      }
    ],
    diagnostics: [
      {
        diagnostic_kind: 'conditional_assumption',
        severity: 'warning',
        message_digest: D('9')
      }
    ],
    proof_check_state: 'passed',
    closure_state: 'conditional',
    source_alignment_state: 'partial'
  };
  const conditional = materialize(conditionalBase, mod.formalVerificationEvidenceDigest);
  const verified = mod.verifyFormalVerificationEvidence(conditional);
  assert.equal(verified.proof_check_state, 'passed');
  assert.equal(verified.closure_state, 'conditional');
  assert.equal(verified.truth_established, false);
  assert.equal(verified.authority_effect, 'none');
});

test('strict closure fails closed on assumptions, reused dependencies, non-exact imports, or warnings', async () => {
  const mod = await api();

  const cases = [
    {
      ...strictBase(),
      assumptions: [
        { assumption_id: 'a:1', statement_digest: D('8'), source_ref: 'source:a' }
      ]
    },
    {
      ...strictBase(),
      dependency_statuses: [
        { dependency_digest: D('7'), verification_state: 'reused' }
      ]
    },
    { ...strictBase(), import_policy: 'substituted' },
    {
      ...strictBase(),
      diagnostics: [
        { diagnostic_kind: 'checker_warning', severity: 'warning', message_digest: D('9') }
      ]
    }
  ];

  for (const [index, candidateBase] of cases.entries()) {
    const candidate = materialize(
      { ...candidateBase, evidence_id: `formal:strict-negative:${index}` },
      mod.formalVerificationEvidenceDigest
    );
    assert.throws(
      () => mod.verifyFormalVerificationEvidence(candidate),
      /strict closure/
    );
  }
});

test('blocking diagnostics require incomplete closure even when the checker reports pass', async () => {
  const mod = await api();
  const blockedBase = {
    ...strictBase(),
    evidence_id: 'formal:blocking:1',
    diagnostics: [
      { diagnostic_kind: 'admitted_placeholder', severity: 'blocking', message_digest: D('a') }
    ],
    closure_state: 'conditional'
  };
  const blocked = materialize(blockedBase, mod.formalVerificationEvidenceDigest);
  assert.throws(
    () => mod.verifyFormalVerificationEvidence(blocked),
    /blocking diagnostics require incomplete closure/
  );

  const incompleteBase = { ...blockedBase, closure_state: 'incomplete' };
  const incomplete = materialize(incompleteBase, mod.formalVerificationEvidenceDigest);
  assert.equal(mod.verifyFormalVerificationEvidence(incomplete).proof_check_state, 'passed');
});

test('failed, error, exhausted, or unrun checks cannot claim proof closure', async () => {
  const mod = await api();

  for (const state of ['failed', 'checker_error', 'resource_exhausted', 'not_run']) {
    const base = {
      ...strictBase(),
      evidence_id: `formal:nonpass:${state}`,
      proof_check_state: state,
      closure_state: 'conditional'
    };
    const candidate = materialize(base, mod.formalVerificationEvidenceDigest);
    assert.throws(
      () => mod.verifyFormalVerificationEvidence(candidate),
      /non-passing proof cannot claim strict or conditional closure/
    );
  }
});

test('source alignment and checker independence remain separate evidence dimensions', async () => {
  const mod = await api();
  const base = {
    ...strictBase(),
    evidence_id: 'formal:alignment:1',
    source_alignment_state: 'mismatch',
    independence_state: 'same_lineage'
  };
  const candidate = materialize(base, mod.formalVerificationEvidenceDigest);
  const verified = mod.verifyFormalVerificationEvidence(candidate);
  assert.equal(verified.proof_check_state, 'passed');
  assert.equal(verified.source_alignment_state, 'mismatch');
  assert.equal(verified.independence_state, 'same_lineage');
});

test('authority, truth, field widening, and digest substitution fail closed', async () => {
  const mod = await api();
  const strict = materialize(strictBase(), mod.formalVerificationEvidenceDigest);

  for (const mutate of [
    value => ({ ...value, authority_effect: 'grant' }),
    value => ({ ...value, truth_established: true }),
    value => ({ ...value, execution_authority: 'none' }),
    value => ({ ...value, formal_statement_digest: D('f') })
  ]) {
    assert.throws(() => mod.verifyFormalVerificationEvidence(mutate(strict)));
  }
});

test('dependency, assumption, diagnostic, and identifier structures are bounded and unique', async () => {
  const mod = await api();

  const duplicateDependencyBase = {
    ...strictBase(),
    evidence_id: 'formal:duplicate-dep',
    dependency_statuses: [
      { dependency_digest: D('7'), verification_state: 'freshly_checked' },
      { dependency_digest: D('7'), verification_state: 'freshly_checked' }
    ]
  };
  assert.throws(
    () => mod.verifyFormalVerificationEvidence(
      materialize(duplicateDependencyBase, mod.formalVerificationEvidenceDigest)
    ),
    /dependency digests must be unique/
  );

  const duplicateAssumptionBase = {
    ...strictBase(),
    evidence_id: 'formal:duplicate-assumption',
    closure_state: 'conditional',
    assumptions: [
      { assumption_id: 'a:1', statement_digest: D('8'), source_ref: 'source:1' },
      { assumption_id: 'a:1', statement_digest: D('9'), source_ref: 'source:2' }
    ]
  };
  assert.throws(
    () => mod.verifyFormalVerificationEvidence(
      materialize(duplicateAssumptionBase, mod.formalVerificationEvidenceDigest)
    ),
    /assumption IDs must be unique/
  );

  const duplicateDiagnosticBase = {
    ...strictBase(),
    evidence_id: 'formal:duplicate-diagnostic',
    closure_state: 'conditional',
    diagnostics: [
      { diagnostic_kind: 'warning', severity: 'warning', message_digest: D('a') },
      { diagnostic_kind: 'warning', severity: 'warning', message_digest: D('a') }
    ]
  };
  assert.throws(
    () => mod.verifyFormalVerificationEvidence(
      materialize(duplicateDiagnosticBase, mod.formalVerificationEvidenceDigest)
    ),
    /diagnostics must be unique/
  );
});

test('schema mirrors the canonical contract and the verifier has no network/process imports', async () => {
  const mod = await api();
  assert.equal(
    mod.FORMAL_VERIFICATION_EVIDENCE_SCHEMA,
    'axiom-formal-verification-evidence.v0'
  );

  const schema = JSON.parse(await readFile(schemaUrl, 'utf8'));
  assert.equal(schema.properties.schema.const, mod.FORMAL_VERIFICATION_EVIDENCE_SCHEMA);
  assert.equal(schema.properties.truth_established.const, false);
  assert.equal(schema.properties.authority_effect.const, 'none');

  const source = await readFile(moduleUrl, 'utf8');
  for (const forbidden of [
    'node:http',
    'node:https',
    'node:net',
    'node:tls',
    'node:child_process',
    'fetch(',
    'WebSocket'
  ]) {
    assert.equal(source.includes(forbidden), false, `verifier imports/uses forbidden surface: ${forbidden}`);
  }
});
