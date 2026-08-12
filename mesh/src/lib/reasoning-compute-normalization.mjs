import {
  ValidationError,
  assertPlainObject,
  assertString,
  digestObject
} from './canonical.mjs';

const BASIS = new Set(['measured', 'estimated', 'reported']);

function assertNonNegativeNumber(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new ValidationError(`${name} must be a finite non-negative number`);
  }
  return value;
}

function assertOptionalNonNegativeNumber(value, name) {
  if (value === undefined) return undefined;
  return assertNonNegativeNumber(value, name);
}

function assertOptionalSafeInteger(value, name) {
  if (value === undefined) return undefined;
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new ValidationError(`${name} must be a non-negative safe integer`);
  }
  return value;
}

function perSuccess(total, successful) {
  return total === undefined || successful === 0 ? null : total / successful;
}

export function normalizeReasoningCompute(reportInput, disclosureInput) {
  const report = assertPlainObject(reportInput, 'report');
  if (report.schema !== 'axiom-reasoning-evaluation-report.v1') {
    throw new ValidationError(
      'report.schema must be axiom-reasoning-evaluation-report.v1'
    );
  }
  const claimedReportDigest = assertString(
    report.report_digest,
    'report.report_digest',
    { min: 64, max: 64, pattern: /^[a-f0-9]{64}$/ }
  );
  const unsignedReport = structuredClone(report);
  delete unsignedReport.report_digest;
  if (digestObject(unsignedReport) !== claimedReportDigest) {
    throw new ValidationError('report.report_digest does not match report content');
  }

  const metrics = assertPlainObject(report.metrics, 'report.metrics');
  const counts = assertPlainObject(metrics.counts, 'report.metrics.counts');
  const correctItems = assertOptionalSafeInteger(
    counts.correct_items,
    'report.metrics.counts.correct_items'
  );
  const jointlyCorrectPairs = assertOptionalSafeInteger(
    counts.jointly_correct_pairs,
    'report.metrics.counts.jointly_correct_pairs'
  );
  if (correctItems === undefined || jointlyCorrectPairs === undefined) {
    throw new ValidationError(
      'report must expose correct_items and jointly_correct_pairs counts'
    );
  }

  const disclosure = assertPlainObject(disclosureInput, 'disclosure');
  if (!BASIS.has(disclosure.basis)) {
    throw new ValidationError(
      'disclosure.basis must be measured, estimated, or reported'
    );
  }
  const source = assertString(disclosure.source, 'disclosure.source', {
    min: 1,
    max: 512
  });

  const parameterCount = assertOptionalSafeInteger(
    disclosure.parameter_count,
    'disclosure.parameter_count'
  );
  const inferenceFlops = assertOptionalNonNegativeNumber(
    disclosure.inference_flops,
    'disclosure.inference_flops'
  );
  const inferenceEnergy = assertOptionalNonNegativeNumber(
    disclosure.inference_energy_joules,
    'disclosure.inference_energy_joules'
  );
  const peakMemory = assertOptionalSafeInteger(
    disclosure.peak_memory_bytes,
    'disclosure.peak_memory_bytes'
  );
  const trainingFlops = assertOptionalNonNegativeNumber(
    disclosure.training_flops,
    'disclosure.training_flops'
  );
  const trainingEnergy = assertOptionalNonNegativeNumber(
    disclosure.training_energy_joules,
    'disclosure.training_energy_joules'
  );

  if (
    inferenceFlops === undefined &&
    inferenceEnergy === undefined &&
    peakMemory === undefined &&
    trainingFlops === undefined &&
    trainingEnergy === undefined &&
    parameterCount === undefined
  ) {
    throw new ValidationError(
      'disclosure must contain at least one compute or model-size observation'
    );
  }

  const normalized = {
    schema: 'axiom-reasoning-compute-normalization.v1',
    evaluation_report_digest: claimedReportDigest,
    disclosure: {
      basis: disclosure.basis,
      source,
      parameter_count: parameterCount ?? null,
      inference_flops: inferenceFlops ?? null,
      inference_energy_joules: inferenceEnergy ?? null,
      peak_memory_bytes: peakMemory ?? null,
      training_flops: trainingFlops ?? null,
      training_energy_joules: trainingEnergy ?? null
    },
    derived: {
      inference_flops_per_correct_item: perSuccess(inferenceFlops, correctItems),
      inference_flops_per_jointly_correct_pair: perSuccess(
        inferenceFlops,
        jointlyCorrectPairs
      ),
      inference_energy_joules_per_correct_item: perSuccess(
        inferenceEnergy,
        correctItems
      ),
      inference_energy_joules_per_jointly_correct_pair: perSuccess(
        inferenceEnergy,
        jointlyCorrectPairs
      )
    },
    limitations: [
      'Parameter count is descriptive and is not a substitute for measured compute.',
      'Estimated or reported compute must not be presented as measured compute.',
      'Training and inference compute are separate quantities and must not be conflated.',
      'This normalization grants no execution authority and promotes no capability.'
    ]
  };

  normalized.disclosure_digest = digestObject(normalized.disclosure);
  normalized.normalization_digest = digestObject(normalized);
  return Object.freeze(normalized);
}
