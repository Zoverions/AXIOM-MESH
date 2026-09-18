import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  computeDependencyClosureDigest,
  finalizeReproducibilityClosure,
  summarizeReproducibilityClosure
} from '../src/lib/epistemic-reproducibility-closure.mjs';

const D = hex => `sha256:${hex.repeat(64)}`;

function baseRecord(overrides = {}) {
  const input = {
    schema: 'axiom-epistemic-reproducibility-closure.v0',
    version: '0.1.0',
    status: 'inert-evidence',
    closure_id: 'closure:formal-profile:001',
    target: {
      target_ref: 'formal:statement:001',
      target_kind: 'formal_statement',
      target_digest: D('1')
    },
    verifier: {
      verifier_id: 'lean',
      verifier_version: '4.x-pinned-fixture',
      implementation_digest: D('2'),
      profile_digest: D('3')
    },
    environment: {
      environment_digest: D('4'),
      runtime_ref: 'formal-checker:offline-fixture'
    },
    dependencies: [],
    dependency_closure_digest: '',
    coverage_claim: 'target_only',
    replay: {
      mode: 'original',
      actor_ref: 'actor:formal-checker-fixture',
      run_id: 'run:formal-checker:001',
      input_digest: D('5'),
      output_digest: D('6')
    },
    result: 'pass',
    limitations: [],
    recorded_at: '2026-09-18T05:00:00.000Z',
    contains_secret_material: false,
    canonical_state: 'proposal',
    authority_effect: 'none',
    network_effect: 'none',
    execution_authority: false,
    ...overrides
  };
  input.dependency_closure_digest = computeDependencyClosureDigest(input.dependencies);
  return input;
}

function externalHypothesis() {
  return {
    dependency_kind: 'source',
    dependency_ref: 'hypothesis:published-external-result',
    dependency_digest: D('7'),
    disposition: 'reused_without_recheck'
  };
}

function admittedObligation() {
  return {
    dependency_kind: 'other',
    dependency_ref: 'obligation:admitted:sorry:001',
    dependency_digest: D('8'),
    disposition: 'unavailable'
  };
}

function checkedLibrary(digest = D('9')) {
  return {
    dependency_kind: 'formal_library',
    dependency_ref: 'lean:mathlib:pinned-fixture',
    dependency_digest: digest,
    disposition: 'freshly_checked',
    verification_evidence_ref: 'evidence:formal-library-check:001'
  };
}

test('external hypotheses remain explicit and prevent a whole-closure claim when not rechecked', () => {
  const input = baseRecord({
    dependencies: [externalHypothesis()],
    coverage_claim: 'partial_closure',
    limitations: [
      'Formal proof is conditional on a published external result that this run did not recheck.'
    ]
  });
  const finalized = finalizeReproducibilityClosure(input);
  const summary = summarizeReproducibilityClosure(finalized);

  assert.equal(finalized.result, 'pass');
  assert.equal(finalized.limitations.length, 1);
  assert.equal(summary.reused_without_recheck_count, 1);
  assert.equal(summary.coverage_claim, 'partial_closure');
  assert.equal(Object.hasOwn(summary, 'verified'), false);
  assert.equal(Object.hasOwn(summary, 'truth'), false);

  assert.throws(
    () => finalizeReproducibilityClosure(baseRecord({
      dependencies: [externalHypothesis()],
      coverage_claim: 'declared_closure_checked',
      limitations: finalized.limitations
    })),
    /declared_closure_checked/i
  );
});

test('admitted or sorry-like obligations stay visible and cannot claim checked closure', () => {
  const limitations = [
    'Checker accepted the artifact with an admitted proof obligation; end-to-end proof closure is not established.'
  ];
  const finalized = finalizeReproducibilityClosure(baseRecord({
    dependencies: [admittedObligation()],
    coverage_claim: 'partial_closure',
    limitations
  }));

  assert.deepEqual(finalized.limitations, limitations);
  assert.equal(
    finalized.dependencies[0].dependency_ref,
    'obligation:admitted:sorry:001'
  );
  assert.equal(finalized.dependencies[0].disposition, 'unavailable');

  for (const coverage_claim of ['declared_closure_checked', 'fresh_rebuild']) {
    assert.throws(
      () => finalizeReproducibilityClosure(baseRecord({
        dependencies: [admittedObligation()],
        coverage_claim,
        limitations
      })),
      /declared_closure_checked|fresh_rebuild|freshly_checked/i
    );
  }
});

test('checker warnings and caveats remain digest-bound limitations', () => {
  const a = finalizeReproducibilityClosure(baseRecord({
    limitations: ['checker warning: declaration uses a bounded fixture caveat']
  }));
  const b = finalizeReproducibilityClosure(baseRecord({
    limitations: ['checker warning: different bounded fixture caveat']
  }));

  assert.notEqual(a.content_digest, b.content_digest);
  assert.notDeepEqual(a.limitations, b.limitations);
  assert.equal(a.result, 'pass');
  assert.equal(b.result, 'pass');
});

test('changed formal-library bytes change dependency closure and final evidence identity', () => {
  const a = finalizeReproducibilityClosure(baseRecord({
    dependencies: [checkedLibrary(D('9'))],
    coverage_claim: 'fresh_rebuild'
  }));
  const b = finalizeReproducibilityClosure(baseRecord({
    dependencies: [checkedLibrary(D('a'))],
    coverage_claim: 'fresh_rebuild'
  }));

  assert.notEqual(a.dependency_closure_digest, b.dependency_closure_digest);
  assert.notEqual(a.content_digest, b.content_digest);
});

test('timeout or resource failure remains error evidence rather than falsification', () => {
  const finalized = finalizeReproducibilityClosure(baseRecord({
    result: 'error',
    limitations: ['checker timeout/resource ceiling reached before a conclusive result']
  }));
  const summary = summarizeReproducibilityClosure(finalized);

  assert.equal(summary.result, 'error');
  assert.equal(Object.hasOwn(summary, 'falsified'), false);
  assert.throws(
    () => finalizeReproducibilityClosure(baseRecord({
      result: 'error',
      falsified: true
    })),
    /unknown field falsified/i
  );
});

test('formal proof evidence cannot smuggle implementation-conformance claims into E2-RC', () => {
  for (const field of ['implementation_verified', 'implementation_conformance']) {
    assert.throws(
      () => finalizeReproducibilityClosure(baseRecord({ [field]: true })),
      new RegExp(`unknown field ${field}`, 'i')
    );
  }
});

test('source-to-formalization alignment remains a separate epistemic dimension', () => {
  for (const field of ['source_alignment', 'formalization_alignment']) {
    assert.throws(
      () => finalizeReproducibilityClosure(baseRecord({ [field]: 'aligned' })),
      new RegExp(`unknown field ${field}`, 'i')
    );
  }
});

test('checker or checker-profile substitution changes the evidence identity', () => {
  const lean = finalizeReproducibilityClosure(baseRecord());

  const bend = finalizeReproducibilityClosure(baseRecord({
    verifier: {
      verifier_id: 'bend',
      verifier_version: '2.x-pinned-fixture',
      implementation_digest: D('b'),
      profile_digest: D('c')
    }
  }));

  const leanOtherProfile = finalizeReproducibilityClosure(baseRecord({
    verifier: {
      ...baseRecord().verifier,
      profile_digest: D('d')
    }
  }));

  assert.notEqual(lean.content_digest, bend.content_digest);
  assert.notEqual(lean.content_digest, leanOtherProfile.content_digest);
  assert.equal(lean.verifier.verifier_id, 'lean');
  assert.equal(bend.verifier.verifier_id, 'bend');
});

test('formal checker success cannot mint capability, grant, consent, merge, deployment, or execution authority', () => {
  const forbiddenMutations = [
    { capability_id: 'cap:forbidden' },
    { grant_id: 'grant:forbidden' },
    { consent: true },
    { policy_allow: true },
    { merge_authority: true },
    { deployment_authority: true },
    { authority_effect: 'allow' },
    { execution_authority: true }
  ];

  for (const mutation of forbiddenMutations) {
    assert.throws(
      () => finalizeReproducibilityClosure(baseRecord(mutation)),
      /unknown field|authority_effect|execution_authority/i
    );
  }
});

test('formal-checker profile is static and has no live checker, provider, MCP, process, or network dependency', async () => {
  const source = await readFile(
    new URL('./epistemic-formal-checker-profile.test.mjs', import.meta.url),
    'utf8'
  );

  const imports = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map(match => match[1]);
  assert.deepEqual(imports, [
    'node:assert/strict',
    'node:fs/promises',
    'node:test',
    '../src/lib/epistemic-reproducibility-closure.mjs'
  ]);

  const forbiddenImports = [
    'node:http',
    'node:https',
    'node:net',
    'node:tls',
    'node:child_process',
    'axiom-axle-mcp',
    '@axiom',
    'lean',
    'bend'
  ];
  for (const forbidden of forbiddenImports) {
    assert.equal(
      imports.some(value => value === forbidden || value.startsWith(`${forbidden}/`)),
      false,
      `profile must not import live checker/provider surface: ${forbidden}`
    );
  }
});
