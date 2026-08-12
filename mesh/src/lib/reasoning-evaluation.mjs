import {
  ValidationError,
  assertPlainObject,
  assertString,
  digestObject
} from './canonical.mjs';

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const PERTURBATION_KINDS = new Set(['load-bearing', 'irrelevant']);
const SELECTION_METHODS = new Set([
  'single',
  'majority-vote',
  'best-of-n',
  'external-verifier'
]);

function assertArray(value, name, { min = 0, max = 10000 } = {}) {
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    throw new ValidationError(`${name} must contain ${min}-${max} items`);
  }
  return value;
}

function assertInteger(value, name, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new ValidationError(`${name} must be an integer between ${min} and ${max}`);
  }
  return value;
}

function assertNumber(value, name, { min = 0, max = Number.MAX_VALUE } = {}) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new ValidationError(`${name} must be a finite number between ${min} and ${max}`);
  }
  return value;
}

function assertSha256(value, name) {
  return assertString(value, name, { min: 64, max: 64, pattern: SHA256_PATTERN });
}

function assertAnswer(value, name) {
  return assertString(value, name, { min: 1, max: 4096 });
}

function assertUniqueId(value, name, seen) {
  const id = assertString(value, name, { min: 1, max: 160, pattern: /^[A-Za-z0-9._:-]+$/ });
  if (seen.has(id)) throw new ValidationError(`${name} duplicates ${id}`);
  seen.add(id);
  return id;
}

function validateItem(item, name, seenItems) {
  assertPlainObject(item, name);
  const itemId = assertUniqueId(item.item_id, `${name}.item_id`, seenItems);
  assertSha256(item.prompt_sha256, `${name}.prompt_sha256`);
  const expectedAnswer = assertAnswer(item.expected_answer, `${name}.expected_answer`);
  return { itemId, expectedAnswer };
}

export function validateReasoningEvaluationSuite(input) {
  const suite = assertPlainObject(input, 'suite');
  if (suite.schema !== 'axiom-reasoning-evaluation-suite.v1') {
    throw new ValidationError('suite.schema must be axiom-reasoning-evaluation-suite.v1');
  }
  assertString(suite.suite_id, 'suite.suite_id', {
    min: 1,
    max: 160,
    pattern: /^[A-Za-z0-9._:-]+$/
  });
  assertString(suite.suite_version, 'suite.suite_version', {
    min: 1,
    max: 80,
    pattern: /^[A-Za-z0-9._+-]+$/
  });
  assertString(suite.task_class, 'suite.task_class', { min: 1, max: 160 });
  if (suite.claim_boundary !== 'evaluation-only') {
    throw new ValidationError('suite.claim_boundary must be evaluation-only');
  }

  const cases = assertArray(suite.cases, 'suite.cases', { min: 1, max: 10000 });
  const seenCases = new Set();
  const seenItems = new Set();
  let loadBearingPairs = 0;
  let irrelevantPairs = 0;

  cases.forEach((entry, caseIndex) => {
    const name = `suite.cases[${caseIndex}]`;
    const current = assertPlainObject(entry, name);
    assertUniqueId(current.case_id, `${name}.case_id`, seenCases);
    const canonical = validateItem(current.canonical, `${name}.canonical`, seenItems);
    const perturbations = assertArray(current.perturbations, `${name}.perturbations`, {
      min: 1,
      max: 64
    });

    perturbations.forEach((perturbation, perturbationIndex) => {
      const perturbationName = `${name}.perturbations[${perturbationIndex}]`;
      const currentPerturbation = assertPlainObject(perturbation, perturbationName);
      if (!PERTURBATION_KINDS.has(currentPerturbation.kind)) {
        throw new ValidationError(
          `${perturbationName}.kind must be load-bearing or irrelevant`
        );
      }
      const validated = validateItem(currentPerturbation, perturbationName, seenItems);
      if (
        currentPerturbation.kind === 'load-bearing' &&
        validated.expectedAnswer === canonical.expectedAnswer
      ) {
        throw new ValidationError(
          `${perturbationName} is load-bearing but does not change the expected answer`
        );
      }
      if (
        currentPerturbation.kind === 'irrelevant' &&
        validated.expectedAnswer !== canonical.expectedAnswer
      ) {
        throw new ValidationError(
          `${perturbationName} is irrelevant but changes the expected answer`
        );
      }
      if (currentPerturbation.kind === 'load-bearing') loadBearingPairs += 1;
      else irrelevantPairs += 1;
    });
  });

  if (loadBearingPairs === 0) {
    throw new ValidationError('suite must include at least one load-bearing perturbation');
  }
  if (irrelevantPairs === 0) {
    throw new ValidationError('suite must include at least one irrelevant perturbation');
  }

  return Object.freeze({
    valid: true,
    schema: suite.schema,
    suite_id: suite.suite_id,
    suite_version: suite.suite_version,
    task_class: suite.task_class,
    cases: cases.length,
    items: seenItems.size,
    load_bearing_pairs: loadBearingPairs,
    irrelevant_pairs: irrelevantPairs,
    digest: digestObject(suite)
  });
}

function validateSubject(subject) {
  const current = assertPlainObject(subject, 'run.subject');
  assertString(current.model_id, 'run.subject.model_id', { min: 1, max: 256 });
  assertString(current.model_version, 'run.subject.model_version', { min: 1, max: 160 });
  assertSha256(current.artifact_sha256, 'run.subject.artifact_sha256');
  assertString(current.runtime_id, 'run.subject.runtime_id', { min: 1, max: 256 });
  assertSha256(current.runtime_sha256, 'run.subject.runtime_sha256');
}

function validateInference(inference) {
  const current = assertPlainObject(inference, 'run.inference');
  const samples = assertInteger(current.samples_per_item, 'run.inference.samples_per_item', {
    min: 1,
    max: 128
  });
  if (!SELECTION_METHODS.has(current.selection_method)) {
    throw new ValidationError(
      'run.inference.selection_method must be single, majority-vote, best-of-n, or external-verifier'
    );
  }
  if (samples === 1 && current.selection_method !== 'single') {
    throw new ValidationError(
      'run.inference.selection_method must be single when samples_per_item is 1'
    );
  }
  if (samples > 1 && current.selection_method === 'single') {
    throw new ValidationError(
      'run.inference.selection_method must disclose aggregation when samples_per_item exceeds 1'
    );
  }
  assertSha256(current.sampling_policy_sha256, 'run.inference.sampling_policy_sha256');
  if (samples > 1) {
    assertSha256(current.selection_policy_sha256, 'run.inference.selection_policy_sha256');
  } else if (current.selection_policy_sha256 !== undefined) {
    assertSha256(current.selection_policy_sha256, 'run.inference.selection_policy_sha256');
  }
  assertNumber(current.temperature, 'run.inference.temperature', { min: 0, max: 5 });
  assertInteger(current.maximum_reasoning_steps, 'run.inference.maximum_reasoning_steps', {
    min: 1,
    max: 1000000
  });
}

function validateCompute(compute) {
  const current = assertPlainObject(compute, 'run.compute');
  assertInteger(current.model_calls, 'run.compute.model_calls', { min: 1 });
  assertInteger(current.sample_generations, 'run.compute.sample_generations', { min: 1 });
  assertInteger(current.input_units, 'run.compute.input_units', { min: 0 });
  assertInteger(current.output_units, 'run.compute.output_units', { min: 0 });
  assertInteger(current.wall_ms, 'run.compute.wall_ms', { min: 0 });
  if (current.estimated_flops !== undefined) {
    assertNumber(current.estimated_flops, 'run.compute.estimated_flops', {
      min: 0,
      max: Number.MAX_VALUE
    });
  }
  if (current.peak_memory_bytes !== undefined) {
    assertInteger(current.peak_memory_bytes, 'run.compute.peak_memory_bytes', { min: 0 });
  }
  if (current.energy_joules !== undefined) {
    assertNumber(current.energy_joules, 'run.compute.energy_joules', {
      min: 0,
      max: Number.MAX_VALUE
    });
  }
}

function expectedItems(suite) {
  const output = new Map();
  for (const entry of suite.cases) {
    output.set(entry.canonical.item_id, {
      case_id: entry.case_id,
      kind: 'canonical',
      expected_answer: entry.canonical.expected_answer,
      canonical_item_id: entry.canonical.item_id
    });
    for (const perturbation of entry.perturbations) {
      output.set(perturbation.item_id, {
        case_id: entry.case_id,
        kind: perturbation.kind,
        expected_answer: perturbation.expected_answer,
        canonical_item_id: entry.canonical.item_id
      });
    }
  }
  return output;
}

function rate(numerator, denominator) {
  return denominator === 0 ? null : numerator / denominator;
}

function perSuccessfulUnit(total, successful) {
  return successful === 0 ? null : total / successful;
}

export function scoreReasoningEvaluationRun(suiteInput, runInput) {
  const suite = assertPlainObject(suiteInput, 'suite');
  const suiteValidation = validateReasoningEvaluationSuite(suite);
  const run = assertPlainObject(runInput, 'run');
  if (run.schema !== 'axiom-reasoning-evaluation-run.v1') {
    throw new ValidationError('run.schema must be axiom-reasoning-evaluation-run.v1');
  }
  if (run.suite_digest !== suiteValidation.digest) {
    throw new ValidationError('run.suite_digest does not match the evaluated suite');
  }
  validateSubject(run.subject);
  validateInference(run.inference);
  validateCompute(run.compute);

  const expected = expectedItems(suite);
  const minimumSampleGenerations = expected.size * run.inference.samples_per_item;
  if (run.compute.sample_generations < minimumSampleGenerations) {
    throw new ValidationError(
      `run.compute.sample_generations must be at least ${minimumSampleGenerations} for the declared samples_per_item`
    );
  }
  const observations = assertArray(run.observations, 'run.observations', {
    min: expected.size,
    max: expected.size
  });
  const observed = new Map();

  observations.forEach((entry, index) => {
    const name = `run.observations[${index}]`;
    const current = assertPlainObject(entry, name);
    const itemId = assertString(current.item_id, `${name}.item_id`, {
      min: 1,
      max: 160,
      pattern: /^[A-Za-z0-9._:-]+$/
    });
    if (!expected.has(itemId)) {
      throw new ValidationError(`${name}.item_id is not present in the suite`);
    }
    if (observed.has(itemId)) {
      throw new ValidationError(`${name}.item_id duplicates ${itemId}`);
    }
    observed.set(itemId, assertAnswer(current.answer, `${name}.answer`));
  });

  for (const itemId of expected.keys()) {
    if (!observed.has(itemId)) {
      throw new ValidationError(`run.observations is missing ${itemId}`);
    }
  }

  let correctItems = 0;
  let canonicalItems = 0;
  let correctCanonicals = 0;
  let perturbationItems = 0;
  let correctPerturbations = 0;
  let jointPairs = 0;
  let jointlyCorrectPairs = 0;
  let loadBearingPairs = 0;
  let loadBearingRelationCorrect = 0;
  let irrelevantPairs = 0;
  let irrelevantRelationCorrect = 0;
  let naiveLoadBearingFlips = 0;
  let wrongLoadBearingFlips = 0;
  let wrongIrrelevantStability = 0;

  for (const [itemId, metadata] of expected) {
    const isCorrect = observed.get(itemId) === metadata.expected_answer;
    if (isCorrect) correctItems += 1;
    if (metadata.kind === 'canonical') {
      canonicalItems += 1;
      if (isCorrect) correctCanonicals += 1;
      continue;
    }

    perturbationItems += 1;
    if (isCorrect) correctPerturbations += 1;
    jointPairs += 1;

    const canonicalMetadata = expected.get(metadata.canonical_item_id);
    const canonicalAnswer = observed.get(metadata.canonical_item_id);
    const canonicalCorrect = canonicalAnswer === canonicalMetadata.expected_answer;
    const jointlyCorrect = canonicalCorrect && isCorrect;
    if (jointlyCorrect) jointlyCorrectPairs += 1;

    const changed = canonicalAnswer !== observed.get(itemId);
    if (metadata.kind === 'load-bearing') {
      loadBearingPairs += 1;
      if (changed) {
        loadBearingRelationCorrect += 1;
        naiveLoadBearingFlips += 1;
        if (!jointlyCorrect) wrongLoadBearingFlips += 1;
      }
    } else {
      irrelevantPairs += 1;
      if (!changed) {
        irrelevantRelationCorrect += 1;
        if (!jointlyCorrect) wrongIrrelevantStability += 1;
      }
    }
  }

  const report = {
    schema: 'axiom-reasoning-evaluation-report.v1',
    suite: {
      id: suite.suite_id,
      version: suite.suite_version,
      task_class: suite.task_class,
      digest: suiteValidation.digest
    },
    subject: structuredClone(run.subject),
    inference: structuredClone(run.inference),
    metrics: {
      item_accuracy: rate(correctItems, expected.size),
      canonical_accuracy: rate(correctCanonicals, canonicalItems),
      perturbation_accuracy: rate(correctPerturbations, perturbationItems),
      paired_joint_accuracy: rate(jointlyCorrectPairs, jointPairs),
      load_bearing_sensitivity: rate(loadBearingRelationCorrect, loadBearingPairs),
      irrelevant_invariance: rate(irrelevantRelationCorrect, irrelevantPairs),
      naive_load_bearing_flip_rate: rate(naiveLoadBearingFlips, loadBearingPairs),
      wrong_load_bearing_flips: wrongLoadBearingFlips,
      wrong_irrelevant_stability: wrongIrrelevantStability,
      counts: {
        items: expected.size,
        correct_items: correctItems,
        canonical_items: canonicalItems,
        perturbation_items: perturbationItems,
        pairs: jointPairs,
        jointly_correct_pairs: jointlyCorrectPairs,
        load_bearing_pairs: loadBearingPairs,
        irrelevant_pairs: irrelevantPairs
      }
    },
    compute: {
      ...structuredClone(run.compute),
      minimum_declared_sample_generations: minimumSampleGenerations,
      extra_sample_generations: run.compute.sample_generations - minimumSampleGenerations,
      sample_generations_per_item: run.compute.sample_generations / expected.size,
      model_calls_per_item: run.compute.model_calls / expected.size,
      model_calls_per_jointly_correct_pair: perSuccessfulUnit(
        run.compute.model_calls,
        jointlyCorrectPairs
      ),
      input_units_per_correct_item: perSuccessfulUnit(run.compute.input_units, correctItems),
      output_units_per_correct_item: perSuccessfulUnit(run.compute.output_units, correctItems),
      estimated_flops_per_correct_item:
        run.compute.estimated_flops === undefined
          ? null
          : perSuccessfulUnit(run.compute.estimated_flops, correctItems),
      estimated_flops_per_jointly_correct_pair:
        run.compute.estimated_flops === undefined
          ? null
          : perSuccessfulUnit(run.compute.estimated_flops, jointlyCorrectPairs),
      energy_joules_per_jointly_correct_pair:
        run.compute.energy_joules === undefined
          ? null
          : perSuccessfulUnit(run.compute.energy_joules, jointlyCorrectPairs)
    },
    limitations: [
      'A relation score is not a correctness score.',
      'The report does not establish general reasoning outside the declared suite and task class.',
      'Parameter count is not treated as a substitute for measured training or inference compute.',
      'This evaluation report grants no execution authority and promotes no capability.'
    ]
  };

  report.run_digest = digestObject(run);
  report.report_digest = digestObject(report);
  return Object.freeze(report);
}
