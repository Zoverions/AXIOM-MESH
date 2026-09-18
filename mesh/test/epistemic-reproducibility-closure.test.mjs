import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  REPRODUCIBILITY_CLOSURE_LIMITS,
  REPRODUCIBILITY_CLOSURE_SCHEMA,
  REPRODUCIBILITY_CLOSURE_VERSION,
  computeDependencyClosureDigest,
  finalizeReproducibilityClosure,
  summarizeReproducibilityClosure,
  validateReproducibilityClosure
} from '../src/lib/epistemic-reproducibility-closure.mjs';

const D = (hex = 'a') => `sha256:${hex.repeat(64)}`;

function dep(options = {}) {
  const {
    dependency_kind = 'formal_library',
    dependency_ref = 'dep:base',
    dependency_digest = D('7'),
    disposition = 'freshly_checked',
    child_closure_ref,
    child_closure_digest
  } = options;
  const verification_evidence_ref = Object.hasOwn(options, 'verification_evidence_ref')
    ? options.verification_evidence_ref
    : 'evidence:verify:base';

  return {
    dependency_kind,
    dependency_ref,
    dependency_digest,
    disposition,
    ...(verification_evidence_ref ? { verification_evidence_ref } : {}),
    ...(child_closure_ref ? { child_closure_ref } : {}),
    ...(child_closure_digest ? { child_closure_digest } : {})
  };
}

function baseRecord(overrides = {}) {
  const input = {
    schema: 'axiom-epistemic-reproducibility-closure.v0',
    version: '0.1.0',
    status: 'inert-evidence',
    closure_id: 'closure:fixture:001',
    target: {
      target_ref: 'claim:math:001',
      target_kind: 'formal_statement',
      target_digest: D('1')
    },
    verifier: {
      verifier_id: 'lean-kernel',
      verifier_version: '4.24.0',
      implementation_digest: D('2'),
      profile_digest: D('3')
    },
    environment: {
      environment_digest: D('4'),
      runtime_ref: 'runtime:fixture'
    },
    dependencies: [],
    dependency_closure_digest: '',
    coverage_claim: 'target_only',
    replay: {
      mode: 'original',
      actor_ref: 'actor:fixture',
      run_id: 'run:fixture:001',
      input_digest: D('5'),
      output_digest: D('6')
    },
    result: 'pass',
    limitations: [],
    recorded_at: '2026-09-08T16:00:00.000Z',
    contains_secret_material: false,
    canonical_state: 'proposal',
    authority_effect: 'none',
    network_effect: 'none',
    execution_authority: false,
    ...overrides
  };
  if (!input.dependency_closure_digest) {
    input.dependency_closure_digest = computeDependencyClosureDigest(input.dependencies);
  }
  return input;
}

async function readSchema() {
  return JSON.parse(await readFile(
    new URL('../config/epistemic-reproducibility-closure-v0.schema.json', import.meta.url),
    'utf8'
  ));
}

test('E2-RC public schema and version are exact', () => {
  assert.equal(REPRODUCIBILITY_CLOSURE_SCHEMA, 'axiom-epistemic-reproducibility-closure.v0');
  assert.equal(REPRODUCIBILITY_CLOSURE_VERSION, '0.1.0');
});

test('finalize and validate produce a self-bound inert record', () => {
  const finalized = finalizeReproducibilityClosure(baseRecord());
  assert.match(finalized.content_digest, /^sha256:[0-9a-f]{64}$/);
  assert.deepEqual(validateReproducibilityClosure(finalized), finalized);
  assert.equal(finalized.status, 'inert-evidence');
  assert.equal(finalized.canonical_state, 'proposal');
  assert.equal(finalized.authority_effect, 'none');
  assert.equal(finalized.network_effect, 'none');
  assert.equal(finalized.execution_authority, false);
});

test('fresh_rebuild requires every direct dependency freshly checked', () => {
  const input = baseRecord({
    dependencies: [
      dep({ disposition: 'reused_without_recheck', verification_evidence_ref: undefined })
    ],
    coverage_claim: 'fresh_rebuild'
  });
  input.dependency_closure_digest = computeDependencyClosureDigest(input.dependencies);
  assert.throws(() => finalizeReproducibilityClosure(input), /fresh_rebuild|freshly_checked/i);
});

test('declared_closure_checked rejects unavailable or unchecked reuse', () => {
  for (const disposition of ['reused_without_recheck', 'unavailable']) {
    const input = baseRecord({
      dependencies: [dep({ disposition, verification_evidence_ref: undefined })],
      coverage_claim: 'declared_closure_checked'
    });
    input.dependency_closure_digest = computeDependencyClosureDigest(input.dependencies);
    assert.throws(() => finalizeReproducibilityClosure(input), /declared_closure_checked|coverage/i);
  }
});

test('checked dependency dispositions require bound verification evidence', () => {
  for (const disposition of ['freshly_checked', 'reused_with_bound_verification']) {
    const input = baseRecord({
      dependencies: [dep({ disposition, verification_evidence_ref: undefined })],
      coverage_claim: 'partial_closure'
    });
    input.dependency_closure_digest = computeDependencyClosureDigest(input.dependencies);
    assert.throws(() => finalizeReproducibilityClosure(input), /verification_evidence_ref/i);
  }
});

test('unchecked dependency dispositions forbid current-run verification evidence', () => {
  for (const disposition of ['reused_without_recheck', 'unavailable']) {
    const input = baseRecord({
      dependencies: [dep({ disposition, verification_evidence_ref: 'evidence:forbidden' })],
      coverage_claim: 'partial_closure'
    });
    input.dependency_closure_digest = computeDependencyClosureDigest(input.dependencies);
    assert.throws(() => finalizeReproducibilityClosure(input), /verification_evidence_ref/i);
  }
});

test('child closure ref and digest are an all-or-nothing pair and reject self-reference', () => {
  const onlyRef = baseRecord({
    dependencies: [dep({ child_closure_ref: 'closure:child:1' })],
    coverage_claim: 'partial_closure'
  });
  onlyRef.dependency_closure_digest = computeDependencyClosureDigest(onlyRef.dependencies);
  assert.throws(() => finalizeReproducibilityClosure(onlyRef), /child closure ref\/digest/i);

  const onlyDigest = baseRecord({
    dependencies: [dep({ child_closure_digest: D('8') })],
    coverage_claim: 'partial_closure'
  });
  onlyDigest.dependency_closure_digest = computeDependencyClosureDigest(onlyDigest.dependencies);
  assert.throws(() => finalizeReproducibilityClosure(onlyDigest), /child closure ref\/digest/i);

  const self = baseRecord({
    dependencies: [
      dep({
        child_closure_ref: 'closure:fixture:001',
        child_closure_digest: D('8')
      })
    ],
    coverage_claim: 'partial_closure'
  });
  self.dependency_closure_digest = computeDependencyClosureDigest(self.dependencies);
  assert.throws(() => finalizeReproducibilityClosure(self), /self-reference/i);
});

test('dependencies are unique, canonically ordered, and bounded', () => {
  const duplicate = baseRecord({
    dependencies: [
      dep({ dependency_ref: 'dep:a', dependency_digest: D('7') }),
      dep({ dependency_ref: 'dep:a', dependency_digest: D('8') })
    ],
    coverage_claim: 'partial_closure'
  });
  duplicate.dependency_closure_digest = computeDependencyClosureDigest(duplicate.dependencies);
  assert.throws(() => finalizeReproducibilityClosure(duplicate), /duplicate dependency_ref/i);

  const unsorted = baseRecord({
    dependencies: [
      dep({ dependency_ref: 'dep:b', dependency_digest: D('8') }),
      dep({ dependency_ref: 'dep:a', dependency_digest: D('7') })
    ],
    coverage_claim: 'partial_closure'
  });
  unsorted.dependency_closure_digest = computeDependencyClosureDigest(unsorted.dependencies);
  assert.throws(() => finalizeReproducibilityClosure(unsorted), /canonical order/i);

  const tooMany = Array.from({ length: 257 }, (_, index) => dep({
    dependency_kind: 'other',
    dependency_ref: `dep:${String(index).padStart(3, '0')}`,
    dependency_digest: D((index % 10).toString())
  }));
  const oversized = baseRecord({ dependencies: tooMany, coverage_claim: 'partial_closure' });
  oversized.dependency_closure_digest = computeDependencyClosureDigest(oversized.dependencies);
  assert.throws(() => finalizeReproducibilityClosure(oversized), /at most 256/i);
});

test('dependency changes alter dependency and content identity', () => {
  const a = baseRecord({
    dependencies: [dep({ dependency_ref: 'dep:a', dependency_digest: D('7') })],
    coverage_claim: 'fresh_rebuild'
  });
  a.dependency_closure_digest = computeDependencyClosureDigest(a.dependencies);
  const fa = finalizeReproducibilityClosure(a);

  const b = baseRecord({
    dependencies: [dep({ dependency_ref: 'dep:a', dependency_digest: D('8') })],
    coverage_claim: 'fresh_rebuild'
  });
  b.dependency_closure_digest = computeDependencyClosureDigest(b.dependencies);
  const fb = finalizeReproducibilityClosure(b);

  assert.notEqual(fa.dependency_closure_digest, fb.dependency_closure_digest);
  assert.notEqual(fa.content_digest, fb.content_digest);
});

test('partial_closure requires at least one declared dependency', () => {
  assert.throws(
    () => finalizeReproducibilityClosure(baseRecord({ coverage_claim: 'partial_closure' })),
    /partial_closure/i
  );
});

test('separate_context_replay requires bound prior context and separation evidence', () => {
  const input = baseRecord({
    replay: {
      mode: 'separate_context_replay',
      actor_ref: 'actor:new',
      run_id: 'run:new',
      input_digest: D('5'),
      output_digest: D('6'),
      prior_run_ref: 'run:old',
      prior_actor_ref: 'actor:old',
      prior_environment_digest: D('8'),
      separation_evidence_refs: []
    }
  });
  assert.throws(
    () => finalizeReproducibilityClosure(input),
    /separation[_ ]evidence/i
  );
});

test('same_context_replay rejects changed actor or environment', () => {
  const input = baseRecord({
    replay: {
      mode: 'same_context_replay',
      actor_ref: 'actor:new',
      run_id: 'run:new',
      input_digest: D('5'),
      output_digest: D('6'),
      prior_run_ref: 'run:old',
      prior_actor_ref: 'actor:old',
      prior_environment_digest: D('4')
    }
  });
  assert.throws(() => finalizeReproducibilityClosure(input), /same_context_replay/i);
});

test('original replay rejects prior context and separation fields', () => {
  for (const extra of [
    { prior_run_ref: 'run:old' },
    { prior_actor_ref: 'actor:old' },
    { prior_environment_digest: D('8') },
    { separation_evidence_refs: ['evidence:sep'] }
  ]) {
    const input = baseRecord({ replay: { ...baseRecord().replay, ...extra } });
    assert.throws(() => finalizeReproducibilityClosure(input), /must be absent for original/i);
  }
});

test('same_context_replay binds prior run, actor, and environment', () => {
  const replay = {
    mode: 'same_context_replay',
    actor_ref: 'actor:fixture',
    run_id: 'run:new',
    input_digest: D('5'),
    output_digest: D('6'),
    prior_run_ref: 'run:old',
    prior_actor_ref: 'actor:fixture',
    prior_environment_digest: D('4')
  };
  const finalized = finalizeReproducibilityClosure(baseRecord({ replay }));
  assert.equal(finalized.replay.mode, 'same_context_replay');

  for (const key of ['prior_run_ref', 'prior_actor_ref', 'prior_environment_digest']) {
    const missing = { ...replay };
    delete missing[key];
    assert.throws(() => finalizeReproducibilityClosure(baseRecord({ replay: missing })));
  }
});

test('separate_context_replay requires changed context and unique separation evidence', () => {
  const same = {
    mode: 'separate_context_replay',
    actor_ref: 'actor:fixture',
    run_id: 'run:new',
    input_digest: D('5'),
    output_digest: D('6'),
    prior_run_ref: 'run:old',
    prior_actor_ref: 'actor:fixture',
    prior_environment_digest: D('4'),
    separation_evidence_refs: ['evidence:sep:1']
  };
  assert.throws(
    () => finalizeReproducibilityClosure(baseRecord({ replay: same })),
    /changed actor or environment/i
  );

  const duplicate = {
    ...same,
    actor_ref: 'actor:new',
    separation_evidence_refs: ['evidence:sep:1', 'evidence:sep:1']
  };
  assert.throws(
    () => finalizeReproducibilityClosure(baseRecord({ replay: duplicate })),
    /unique references/i
  );

  const valid = {
    ...same,
    actor_ref: 'actor:new',
    separation_evidence_refs: ['evidence:sep:1']
  };
  assert.equal(
    finalizeReproducibilityClosure(baseRecord({ replay: valid })).replay.mode,
    'separate_context_replay'
  );
});

test('unknown_context_replay requires prior run and cannot claim separation evidence', () => {
  const baseReplay = {
    mode: 'unknown_context_replay',
    actor_ref: 'actor:new',
    run_id: 'run:new',
    input_digest: D('5'),
    output_digest: D('6'),
    prior_run_ref: 'run:old'
  };
  assert.equal(
    finalizeReproducibilityClosure(baseRecord({ replay: baseReplay })).replay.mode,
    'unknown_context_replay'
  );

  const missingPrior = { ...baseReplay };
  delete missingPrior.prior_run_ref;
  assert.throws(
    () => finalizeReproducibilityClosure(baseRecord({ replay: missingPrior })),
    /prior_run_ref/i
  );

  assert.throws(
    () => finalizeReproducibilityClosure(baseRecord({
      replay: { ...baseReplay, separation_evidence_refs: ['evidence:sep'] }
    })),
    /cannot claim separation evidence/i
  );
});

test('replay changes alter content identity', () => {
  const original = finalizeReproducibilityClosure(baseRecord());
  const replay = finalizeReproducibilityClosure(baseRecord({
    replay: {
      mode: 'same_context_replay',
      actor_ref: 'actor:fixture',
      run_id: 'run:new',
      input_digest: D('5'),
      output_digest: D('6'),
      prior_run_ref: 'run:old',
      prior_actor_ref: 'actor:fixture',
      prior_environment_digest: D('4')
    }
  }));
  assert.notEqual(original.content_digest, replay.content_digest);

  const changedOutput = finalizeReproducibilityClosure(baseRecord({
    replay: {
      ...baseRecord().replay,
      output_digest: D('9')
    }
  }));
  assert.notEqual(original.content_digest, changedOutput.content_digest);
});

test('limitations are bounded', () => {
  const valid = finalizeReproducibilityClosure(baseRecord({
    limitations: ['conditional on externally supplied theorem']
  }));
  assert.equal(valid.limitations.length, 1);

  assert.throws(
    () => finalizeReproducibilityClosure(baseRecord({
      limitations: Array.from({ length: 65 }, (_, index) => `limit:${index}`)
    })),
    /64/
  );
});

test('summary preserves closure dimensions without truth or independence claims', () => {
  const input = baseRecord({
    dependencies: [
      dep({ dependency_ref: 'dep:a', dependency_digest: D('7') }),
      dep({
        dependency_ref: 'dep:b',
        dependency_digest: D('8'),
        disposition: 'reused_without_recheck',
        verification_evidence_ref: undefined
      })
    ],
    coverage_claim: 'partial_closure',
    result: 'pass'
  });
  input.dependency_closure_digest = computeDependencyClosureDigest(input.dependencies);
  const summary = summarizeReproducibilityClosure(finalizeReproducibilityClosure(input));
  assert.deepEqual(summary, {
    dependency_count: 2,
    freshly_checked_count: 1,
    reused_with_bound_verification_count: 0,
    reused_without_recheck_count: 1,
    unavailable_count: 0,
    coverage_claim: 'partial_closure',
    replay_mode: 'original',
    result: 'pass'
  });
  for (const forbidden of ['verified', 'truth', 'independent', 'confidence', 'score', 'authority']) {
    assert.equal(Object.hasOwn(summary, forbidden), false);
  }
});

test('E2-RC JSON Schema mirrors the closed structural contract', async () => {
  const schema = await readSchema();
  assert.equal(schema.$id, 'axiom-epistemic-reproducibility-closure.v0');
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.status.const, 'inert-evidence');
  assert.equal(schema.properties.canonical_state.const, 'proposal');
  assert.equal(schema.properties.authority_effect.const, 'none');
  assert.equal(schema.properties.network_effect.const, 'none');
  assert.equal(schema.properties.execution_authority.const, false);
  assert.equal(schema.properties.dependencies.maxItems, 256);
  assert.deepEqual(
    schema.properties.coverage_claim.enum,
    ['target_only', 'partial_closure', 'declared_closure_checked', 'fresh_rebuild']
  );
  assert.deepEqual(
    schema.$defs.replay.properties.mode.enum,
    ['original', 'same_context_replay', 'separate_context_replay', 'unknown_context_replay']
  );
  assert.equal(
    schema.properties.dependencies.maxItems,
    REPRODUCIBILITY_CLOSURE_LIMITS.direct_dependencies
  );
  assert.equal(
    schema.properties.limitations.maxItems,
    REPRODUCIBILITY_CLOSURE_LIMITS.limitation_items
  );
  assert.equal(
    schema.$defs.replay.properties.separation_evidence_refs.maxItems,
    REPRODUCIBILITY_CLOSURE_LIMITS.separation_evidence_refs
  );
});
