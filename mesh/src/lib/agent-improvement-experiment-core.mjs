import {
  ValidationError,
  assertPlainObject,
  assertString,
  canonicalJson,
  digestObject
} from './canonical.mjs';

export const IMPROVEMENT_PROPOSAL_SCHEMA = 'axiom-agent-improvement-proposal.v1';
export const IMPROVEMENT_EVALUATION_SCHEMA = 'axiom-agent-improvement-evaluation.v1';
export const IMPROVEMENT_EXPERIMENT_SCHEMA = 'axiom-agent-improvement-experiment.v1';
export const IMPROVEMENT_PROMOTION_ASSESSMENT_SCHEMA = 'axiom-agent-improvement-promotion-assessment.v1';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$/;
const DIGEST = /^[a-f0-9]{64}$/;

const SURFACE_MINIMUM = Object.freeze({
  'retrieval-context': 'C0',
  'memory-policy': 'C1',
  'prompt-instructions': 'C0',
  'routing-selection': 'C1',
  'workflow-topology': 'C2',
  'skill-tool': 'C2',
  'runtime-scaffolding-code': 'C2',
  'evaluator-reward': 'C3',
  'training-data-pipeline': 'C4',
  'adapter-parameters': 'C4',
  'model-weights': 'C5',
  'improvement-mechanism': 'C5'
});
const TARGET_SURFACES = new Set(Object.keys(SURFACE_MINIMUM));
const CONSEQUENCE_CLASSES = Object.freeze(['C0', 'C1', 'C2', 'C3', 'C4', 'C5']);
const CONSEQUENCE_SET = new Set(CONSEQUENCE_CLASSES);
const CONSEQUENCE_INDEX = new Map(CONSEQUENCE_CLASSES.map((value, index) => [value, index]));
const VERDICTS = new Set(['positive', 'negative', 'mixed']);
const REGRESSION_SEVERITIES = new Set(['minor', 'major', 'critical']);
const EXPERIMENT_STATUSES = new Set([
  'baseline',
  'candidate',
  'evaluated',
  'rejected',
  'retained-stepping-stone',
  'eligible-for-promotion-request',
  'superseded',
  'rolled-back'
]);

const PROPOSAL_KEYS = new Set([
  'schema',
  'proposal_id',
  'origin',
  'baseline',
  'candidate',
  'target_surface',
  'consequence_class',
  'mutation_digest',
  'objective',
  'resources',
  'resource_envelope',
  'rollback',
  'predecessor_experiment_digests',
  'validity',
  'semantics'
]);
const ORIGIN_KEYS = new Set(['principal_id', 'lineage_record_digest']);
const ARTIFACT_KEYS = new Set(['ref', 'digest']);
const OBJECTIVE_KEYS = new Set(['id', 'metric_definition_digest', 'evaluator_definition_digest']);
const RESOURCE_KEYS = new Set([
  'max_evaluation_runs',
  'max_child_agents',
  'max_cost_units',
  'max_wall_clock_ms',
  'max_storage_bytes'
]);
const RESOURCE_ENVELOPE_KEYS = new Set([
  'lineage_record_digest',
  'aggregate_budget_plan_digest',
  'reservation_id',
  'ceilings'
]);
const VALIDITY_KEYS = new Set(['created_at', 'expires_at']);
const PROPOSAL_SEMANTIC_KEYS = new Set([
  'authority_effect',
  'automatic_application',
  'promotion_authorized',
  'runtime_activation',
  'training_effect',
  'trust_inherited',
  'truth_claimed',
  'global_currentness_claimed'
]);
const PROPOSAL_SEMANTICS = Object.freeze({
  authority_effect: 'none',
  automatic_application: false,
  promotion_authorized: false,
  runtime_activation: false,
  training_effect: 'none',
  trust_inherited: false,
  truth_claimed: false,
  global_currentness_claimed: false
});

const EVALUATION_KEYS = new Set([
  'schema',
  'evaluation_id',
  'proposal_digest',
  'evaluator',
  'benchmark_digest',
  'evidence_digest',
  'deterministic_verifier',
  'independence',
  'metrics',
  'verdict',
  'regressions',
  'evaluated_at',
  'semantics'
]);
const EVALUATOR_KEYS = new Set([
  'principal_id',
  'lineage_record_digest',
  'model_family',
  'runtime_id',
  'provider_domain',
  'evaluator_definition_digest'
]);
const DETERMINISTIC_KEYS = new Set(['enabled', 'evidence_digest']);
const INDEPENDENCE_KEYS = new Set([
  'same_lineage',
  'same_model_family',
  'same_runtime',
  'same_provider_domain',
  'same_evaluator_definition'
]);
const METRIC_KEYS = new Set(['id', 'value_microunits']);
const REGRESSION_KEYS = new Set(['ref', 'digest', 'severity']);
const EVALUATION_SEMANTIC_KEYS = new Set([
  'authority_effect',
  'promotion_authorized',
  'task_success_claimed',
  'truth_claimed',
  'global_currentness_claimed'
]);
const EVALUATION_SEMANTICS = Object.freeze({
  authority_effect: 'none',
  promotion_authorized: false,
  task_success_claimed: false,
  truth_claimed: false,
  global_currentness_claimed: false
});

const EXPERIMENT_ARG_KEYS = new Set([
  'proposal',
  'evaluations',
  'predecessor_experiment_digests',
  'status'
]);
const EXPERIMENT_SEMANTICS = Object.freeze({
  authority_effect: 'none',
  automatic_application: false,
  promotion_authorized: false,
  runtime_activation: false,
  training_effect: 'none',
  trust_inherited: false
});

const ASSESSMENT_ARG_KEYS = new Set(['experiment', 'profileOverrides']);
const PROFILE_OVERRIDE_KEYS = new Set([
  'min_positive_evaluations',
  'min_lineage_independent_evaluations',
  'require_second_independent_source_or_deterministic',
  'require_independent_non_candidate_evaluator'
]);
const ASSESSMENT_SEMANTICS = Object.freeze({
  authority_effect: 'none',
  automatic_application: false,
  promotion_authorized: false
});

function exactObject(raw, allowed, label) {
  const value = assertPlainObject(raw, label);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new ValidationError(`${label} contains unsupported field ${key}`);
  }
  return value;
}

function identifier(value, label) {
  return assertString(value, label, { min: 1, max: 192, pattern: ID });
}

function nullableIdentifier(value, label) {
  return value === null ? null : identifier(value, label);
}

function digest(value, label) {
  return assertString(value, label, { min: 64, max: 64, pattern: DIGEST });
}

function nullableDigest(value, label) {
  return value === null ? null : digest(value, label);
}

function boolean(value, label) {
  if (typeof value !== 'boolean') throw new ValidationError(`${label} must be boolean`);
  return value;
}

function safeInteger(value, label, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new ValidationError(`${label} must be an integer between ${min} and ${max}`);
  }
  return value;
}

function canonicalTimestamp(value, label) {
  const text = assertString(value, label, { min: 1, max: 64 });
  const parsed = new Date(text);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== text) {
    throw new ValidationError(`${label} must be a canonical UTC ISO timestamp`);
  }
  return text;
}

function timestampValue(value) {
  return new Date(value).valueOf();
}

function nowValue(value) {
  if (value === undefined || value === null) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.valueOf())) throw new ValidationError('now must be a valid timestamp');
  return parsed.valueOf();
}

function enumValue(value, label, allowed) {
  if (typeof value !== 'string' || !allowed.has(value)) {
    throw new ValidationError(`${label} is unsupported`);
  }
  return value;
}

function exactSemantics(raw, allowedKeys, expected, label) {
  const value = exactObject(raw, allowedKeys, label);
  if (canonicalJson(value) !== canonicalJson(expected)) {
    throw new ValidationError(`${label} widens the non-authorizing boundary`);
  }
  return expected;
}

function artifact(raw, label) {
  const value = exactObject(raw, ARTIFACT_KEYS, label);
  return Object.freeze({
    ref: identifier(value.ref, `${label}.ref`),
    digest: digest(value.digest, `${label}.digest`)
  });
}

function digestArray(raw, label, maxItems = 64) {
  if (!Array.isArray(raw) || raw.length > maxItems) {
    throw new ValidationError(`${label} must be an array with at most ${maxItems} items`);
  }
  const values = raw.map((value, index) => digest(value, `${label}[${index}]`));
  if (new Set(values).size !== values.length) {
    throw new ValidationError(`${label} must not contain duplicates`);
  }
  return Object.freeze([...values].sort());
}

function normalizeOrigin(raw) {
  const value = exactObject(raw, ORIGIN_KEYS, 'improvement proposal origin');
  const principalId = nullableIdentifier(value.principal_id, 'improvement proposal origin principal_id');
  const lineageDigest = nullableDigest(
    value.lineage_record_digest,
    'improvement proposal origin lineage_record_digest'
  );
  if (principalId === null && lineageDigest === null) {
    throw new ValidationError('improvement proposal origin requires a principal_id or lineage_record_digest');
  }
  return Object.freeze({ principal_id: principalId, lineage_record_digest: lineageDigest });
}

function normalizeObjective(raw) {
  const value = exactObject(raw, OBJECTIVE_KEYS, 'improvement proposal objective');
  return Object.freeze({
    id: identifier(value.id, 'improvement proposal objective id'),
    metric_definition_digest: digest(
      value.metric_definition_digest,
      'improvement proposal objective metric_definition_digest'
    ),
    evaluator_definition_digest: digest(
      value.evaluator_definition_digest,
      'improvement proposal objective evaluator_definition_digest'
    )
  });
}

function normalizeResources(raw, label = 'improvement proposal resources') {
  const value = exactObject(raw, RESOURCE_KEYS, label);
  return Object.freeze({
    max_evaluation_runs: safeInteger(value.max_evaluation_runs, `${label} max_evaluation_runs`, {
      min: 1,
      max: 100_000
    }),
    max_child_agents: safeInteger(value.max_child_agents, `${label} max_child_agents`, {
      min: 1,
      max: 10_000
    }),
    max_cost_units: safeInteger(value.max_cost_units, `${label} max_cost_units`, {
      min: 1,
      max: 1_000_000_000_000
    }),
    max_wall_clock_ms: safeInteger(value.max_wall_clock_ms, `${label} max_wall_clock_ms`, {
      min: 1,
      max: 2_678_400_000
    }),
    max_storage_bytes: safeInteger(value.max_storage_bytes, `${label} max_storage_bytes`, {
      min: 1,
      max: 1_125_899_906_842_624
    })
  });
}

function normalizeResourceEnvelope(raw, origin, resources) {
  if (raw === undefined || raw === null) return null;
  const value = exactObject(raw, RESOURCE_ENVELOPE_KEYS, 'improvement proposal resource envelope');
  const lineageRecordDigest = digest(
    value.lineage_record_digest,
    'improvement proposal resource envelope lineage_record_digest'
  );
  if (origin.lineage_record_digest === null) {
    throw new ValidationError('improvement proposal resource envelope requires bound origin lineage evidence');
  }
  if (lineageRecordDigest !== origin.lineage_record_digest) {
    throw new ValidationError('improvement proposal resource envelope lineage digest mismatch');
  }
  const ceilings = normalizeResources(
    value.ceilings,
    'improvement proposal resource envelope ceilings'
  );
  for (const key of RESOURCE_KEYS) {
    if (resources[key] > ceilings[key]) {
      throw new ValidationError(`improvement proposal resource envelope ${key} is exceeded by proposal resources`);
    }
  }
  return Object.freeze({
    lineage_record_digest: lineageRecordDigest,
    aggregate_budget_plan_digest: digest(
      value.aggregate_budget_plan_digest,
      'improvement proposal resource envelope aggregate_budget_plan_digest'
    ),
    reservation_id: identifier(
      value.reservation_id,
      'improvement proposal resource envelope reservation_id'
    ),
    ceilings
  });
}

function normalizeValidity(raw) {
  const value = exactObject(raw, VALIDITY_KEYS, 'improvement proposal validity');
  const createdAt = canonicalTimestamp(value.created_at, 'improvement proposal validity created_at');
  const expiresAt = canonicalTimestamp(value.expires_at, 'improvement proposal validity expires_at');
  if (timestampValue(expiresAt) <= timestampValue(createdAt)) {
    throw new ValidationError('improvement proposal expiry must follow creation');
  }
  return Object.freeze({ created_at: createdAt, expires_at: expiresAt });
}

export function normalizeImprovementProposal(raw, { now } = {}) {
  const value = exactObject(raw, PROPOSAL_KEYS, 'improvement proposal');
  if (value.schema !== IMPROVEMENT_PROPOSAL_SCHEMA) {
    throw new ValidationError(`improvement proposal schema must be ${IMPROVEMENT_PROPOSAL_SCHEMA}`);
  }

  const targetSurface = enumValue(
    value.target_surface,
    'improvement proposal target_surface',
    TARGET_SURFACES
  );
  const consequenceClass = enumValue(
    value.consequence_class,
    'improvement proposal consequence_class',
    CONSEQUENCE_SET
  );
  const minimum = SURFACE_MINIMUM[targetSurface];
  if (CONSEQUENCE_INDEX.get(consequenceClass) < CONSEQUENCE_INDEX.get(minimum)) {
    throw new ValidationError(`improvement proposal minimum consequence for ${targetSurface} is ${minimum}`);
  }

  const baseline = artifact(value.baseline, 'improvement proposal baseline');
  const candidate = artifact(value.candidate, 'improvement proposal candidate');
  if (baseline.digest === candidate.digest) {
    throw new ValidationError('improvement proposal candidate must be distinct from baseline mutation content');
  }

  const rollback = value.rollback === null || value.rollback === undefined
    ? null
    : artifact(value.rollback, 'improvement proposal rollback');
  if (CONSEQUENCE_INDEX.get(consequenceClass) >= 1 && rollback === null) {
    throw new ValidationError('improvement proposal C1+ persistent consequences require rollback evidence');
  }

  const validity = normalizeValidity(value.validity);
  const currentTime = nowValue(now);
  if (currentTime !== null && currentTime >= timestampValue(validity.expires_at)) {
    throw new ValidationError('improvement proposal is expired');
  }

  const origin = normalizeOrigin(value.origin);
  const resources = normalizeResources(value.resources);
  const resourceEnvelope = normalizeResourceEnvelope(value.resource_envelope, origin, resources);

  const normalized = Object.freeze({
    schema: IMPROVEMENT_PROPOSAL_SCHEMA,
    proposal_id: identifier(value.proposal_id, 'improvement proposal proposal_id'),
    origin,
    baseline,
    candidate,
    target_surface: targetSurface,
    consequence_class: consequenceClass,
    mutation_digest: digest(value.mutation_digest, 'improvement proposal mutation_digest'),
    objective: normalizeObjective(value.objective),
    resources,
    resource_envelope: resourceEnvelope,
    rollback,
    predecessor_experiment_digests: digestArray(
      value.predecessor_experiment_digests ?? [],
      'improvement proposal predecessor_experiment_digests'
    ),
    validity,
    semantics: exactSemantics(
      value.semantics,
      PROPOSAL_SEMANTIC_KEYS,
      PROPOSAL_SEMANTICS,
      'improvement proposal semantics'
    )
  });
  return Object.freeze({ ...normalized, proposal_digest: digestObject(normalized) });
}

function revalidateProposal(raw) {
  const value = assertPlainObject(raw, 'normalized improvement proposal');
  const claimedDigest = digest(value.proposal_digest, 'normalized improvement proposal proposal_digest');
  const candidate = { ...value };
  delete candidate.proposal_digest;
  const normalized = normalizeImprovementProposal(candidate);
  if (normalized.proposal_digest !== claimedDigest) {
    throw new ValidationError('normalized improvement proposal digest mismatch');
  }
  return normalized;
}

function normalizeEvaluator(raw) {
  const value = exactObject(raw, EVALUATOR_KEYS, 'improvement evaluation evaluator');
  return Object.freeze({
    principal_id: identifier(value.principal_id, 'improvement evaluation evaluator principal_id'),
    lineage_record_digest: nullableDigest(
      value.lineage_record_digest,
      'improvement evaluation evaluator lineage_record_digest'
    ),
    model_family: identifier(value.model_family, 'improvement evaluation evaluator model_family'),
    runtime_id: identifier(value.runtime_id, 'improvement evaluation evaluator runtime_id'),
    provider_domain: identifier(value.provider_domain, 'improvement evaluation evaluator provider_domain'),
    evaluator_definition_digest: digest(
      value.evaluator_definition_digest,
      'improvement evaluation evaluator evaluator_definition_digest'
    )
  });
}

function normalizeDeterministicVerifier(raw) {
  const value = exactObject(raw, DETERMINISTIC_KEYS, 'improvement evaluation deterministic_verifier');
  const enabled = boolean(value.enabled, 'improvement evaluation deterministic_verifier enabled');
  const evidenceDigest = nullableDigest(
    value.evidence_digest,
    'improvement evaluation deterministic_verifier evidence_digest'
  );
  if (enabled && evidenceDigest === null) {
    throw new ValidationError('deterministic verifier requires deterministic evidence digest');
  }
  if (!enabled && evidenceDigest !== null) {
    throw new ValidationError('disabled deterministic verifier must not claim deterministic evidence');
  }
  return Object.freeze({ enabled, evidence_digest: evidenceDigest });
}

function normalizeIndependence(raw) {
  const value = exactObject(raw, INDEPENDENCE_KEYS, 'improvement evaluation independence');
  return Object.freeze({
    same_lineage: boolean(value.same_lineage, 'improvement evaluation independence same_lineage'),
    same_model_family: boolean(
      value.same_model_family,
      'improvement evaluation independence same_model_family'
    ),
    same_runtime: boolean(value.same_runtime, 'improvement evaluation independence same_runtime'),
    same_provider_domain: boolean(
      value.same_provider_domain,
      'improvement evaluation independence same_provider_domain'
    ),
    same_evaluator_definition: boolean(
      value.same_evaluator_definition,
      'improvement evaluation independence same_evaluator_definition'
    )
  });
}

function normalizeMetrics(raw) {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 64) {
    throw new ValidationError('improvement evaluation metrics must contain 1-64 items');
  }
  const normalized = raw.map((item, index) => {
    const value = exactObject(item, METRIC_KEYS, `improvement evaluation metrics[${index}]`);
    return Object.freeze({
      id: identifier(value.id, `improvement evaluation metrics[${index}].id`),
      value_microunits: safeInteger(
        value.value_microunits,
        `improvement evaluation metrics[${index}].value_microunits`,
        { min: -Number.MAX_SAFE_INTEGER, max: Number.MAX_SAFE_INTEGER }
      )
    });
  });
  const ids = normalized.map(item => item.id);
  if (new Set(ids).size !== ids.length) {
    throw new ValidationError('improvement evaluation metric IDs must be unique');
  }
  const sorted = [...ids].sort();
  if (ids.some((id, index) => id !== sorted[index])) {
    throw new ValidationError('improvement evaluation metric IDs must be canonically sorted');
  }
  return Object.freeze(normalized);
}

function normalizeRegressions(raw) {
  if (!Array.isArray(raw) || raw.length > 64) {
    throw new ValidationError('improvement evaluation regressions must contain at most 64 items');
  }
  const normalized = raw.map((item, index) => {
    const value = exactObject(item, REGRESSION_KEYS, `improvement evaluation regressions[${index}]`);
    return Object.freeze({
      ref: identifier(value.ref, `improvement evaluation regressions[${index}].ref`),
      digest: digest(value.digest, `improvement evaluation regressions[${index}].digest`),
      severity: enumValue(
        value.severity,
        `improvement evaluation regressions[${index}].severity`,
        REGRESSION_SEVERITIES
      )
    });
  });
  const refs = normalized.map(item => item.ref);
  if (new Set(refs).size !== refs.length) {
    throw new ValidationError('improvement evaluation regression refs must be unique');
  }
  return Object.freeze([...normalized].sort((a, b) => a.ref.localeCompare(b.ref)));
}

export function normalizeImprovementEvaluation(raw, {
  proposal,
  known_same_lineage,
  knownLineageRelations
} = {}) {
  const p = revalidateProposal(proposal);
  const value = exactObject(raw, EVALUATION_KEYS, 'improvement evaluation');
  if (value.schema !== IMPROVEMENT_EVALUATION_SCHEMA) {
    throw new ValidationError(`improvement evaluation schema must be ${IMPROVEMENT_EVALUATION_SCHEMA}`);
  }
  const proposalDigest = digest(value.proposal_digest, 'improvement evaluation proposal_digest');
  if (proposalDigest !== p.proposal_digest) {
    throw new ValidationError('improvement evaluation proposal digest mismatch');
  }

  const evaluator = normalizeEvaluator(value.evaluator);
  const independence = normalizeIndependence(value.independence);
  const originLineage = p.origin.lineage_record_digest;
  if (
    originLineage !== null
    && evaluator.lineage_record_digest !== null
    && evaluator.lineage_record_digest === originLineage
    && independence.same_lineage === false
  ) {
    throw new ValidationError('improvement evaluation same lineage claim contradicts bound lineage digests');
  }
  if (known_same_lineage === true && independence.same_lineage === false) {
    throw new ValidationError('improvement evaluation same lineage claim contradicts supplied lineage relation');
  }
  if (
    knownLineageRelations
    && typeof knownLineageRelations === 'object'
    && knownLineageRelations.same_lineage === true
    && independence.same_lineage === false
  ) {
    throw new ValidationError('improvement evaluation same lineage claim contradicts supplied lineage relation');
  }

  const sameEvaluatorDefinition = evaluator.evaluator_definition_digest
    === p.objective.evaluator_definition_digest;
  if (independence.same_evaluator_definition !== sameEvaluatorDefinition) {
    throw new ValidationError('improvement evaluation evaluator-definition independence claim is contradictory');
  }

  const evaluatedAt = canonicalTimestamp(value.evaluated_at, 'improvement evaluation evaluated_at');
  if (
    timestampValue(evaluatedAt) < timestampValue(p.validity.created_at)
    || timestampValue(evaluatedAt) > timestampValue(p.validity.expires_at)
  ) {
    throw new ValidationError('improvement evaluation lies outside proposal validity window');
  }

  const normalized = Object.freeze({
    schema: IMPROVEMENT_EVALUATION_SCHEMA,
    evaluation_id: identifier(value.evaluation_id, 'improvement evaluation evaluation_id'),
    proposal_digest: proposalDigest,
    evaluator,
    benchmark_digest: digest(value.benchmark_digest, 'improvement evaluation benchmark_digest'),
    evidence_digest: digest(value.evidence_digest, 'improvement evaluation evidence_digest'),
    deterministic_verifier: normalizeDeterministicVerifier(value.deterministic_verifier),
    independence,
    metrics: normalizeMetrics(value.metrics),
    verdict: enumValue(value.verdict, 'improvement evaluation verdict', VERDICTS),
    regressions: normalizeRegressions(value.regressions),
    evaluated_at: evaluatedAt,
    semantics: exactSemantics(
      value.semantics,
      EVALUATION_SEMANTIC_KEYS,
      EVALUATION_SEMANTICS,
      'improvement evaluation semantics'
    )
  });
  return Object.freeze({ ...normalized, evaluation_digest: digestObject(normalized) });
}

function revalidateEvaluation(raw, proposal) {
  const value = assertPlainObject(raw, 'normalized improvement evaluation');
  const claimedDigest = digest(value.evaluation_digest, 'normalized improvement evaluation evaluation_digest');
  const candidate = { ...value };
  delete candidate.evaluation_digest;
  const normalized = normalizeImprovementEvaluation(candidate, { proposal });
  if (normalized.evaluation_digest !== claimedDigest) {
    throw new ValidationError('normalized improvement evaluation digest mismatch');
  }
  return normalized;
}

function summarizeEvaluations(evaluations) {
  const lineages = evaluations
    .map(item => item.evaluator.lineage_record_digest)
    .filter(value => value !== null);
  return Object.freeze({
    evaluations: evaluations.length,
    positive_evaluations: evaluations.filter(item => item.verdict === 'positive').length,
    negative_evaluations: evaluations.filter(item => item.verdict === 'negative').length,
    mixed_evaluations: evaluations.filter(item => item.verdict === 'mixed').length,
    regressions: evaluations.reduce((total, item) => total + item.regressions.length, 0),
    distinct_evaluator_principals: new Set(
      evaluations.map(item => item.evaluator.principal_id)
    ).size,
    distinct_evaluator_lineages: new Set(lineages).size,
    lineage_independent_evaluations: evaluations.filter(
      item => item.independence.same_lineage === false
    ).length,
    distinct_model_families: new Set(evaluations.map(item => item.evaluator.model_family)).size,
    distinct_runtimes: new Set(evaluations.map(item => item.evaluator.runtime_id)).size,
    distinct_provider_domains: new Set(evaluations.map(item => item.evaluator.provider_domain)).size,
    deterministic_verifier_evaluations: evaluations.filter(
      item => item.deterministic_verifier.enabled
    ).length
  });
}

export function createImprovementExperiment(raw = {}) {
  const args = exactObject(raw, EXPERIMENT_ARG_KEYS, 'improvement experiment arguments');
  const proposal = revalidateProposal(args.proposal);
  if (!Array.isArray(args.evaluations)) {
    throw new ValidationError('improvement experiment evaluations must be an array');
  }
  if (args.evaluations.length > proposal.resources.max_evaluation_runs) {
    throw new ValidationError('improvement experiment evaluations exceed proposal evaluation ceiling');
  }
  const evaluations = args.evaluations.map(item => revalidateEvaluation(item, proposal));
  const ids = evaluations.map(item => item.evaluation_id);
  if (new Set(ids).size !== ids.length) {
    throw new ValidationError('improvement experiment contains duplicate evaluation IDs');
  }
  const evaluationDigests = evaluations.map(item => item.evaluation_digest);
  if (new Set(evaluationDigests).size !== evaluationDigests.length) {
    throw new ValidationError('improvement experiment contains duplicate evaluation digests');
  }
  const canonicalEvaluations = Object.freeze(
    [...evaluations].sort((a, b) => a.evaluation_id.localeCompare(b.evaluation_id))
  );
  const predecessors = digestArray(
    args.predecessor_experiment_digests ?? [],
    'improvement experiment predecessor_experiment_digests'
  );
  const status = enumValue(args.status, 'improvement experiment status', EXPERIMENT_STATUSES);
  if (canonicalEvaluations.length === 0 && !['baseline', 'candidate'].includes(status)) {
    throw new ValidationError('improvement experiment status requires evaluation evidence');
  }
  if (canonicalEvaluations.length > 0 && ['baseline', 'candidate'].includes(status)) {
    throw new ValidationError('improvement experiment with evaluations cannot remain baseline or candidate');
  }

  const normalized = Object.freeze({
    schema: IMPROVEMENT_EXPERIMENT_SCHEMA,
    proposal,
    proposal_digest: proposal.proposal_digest,
    evaluations: canonicalEvaluations,
    predecessor_experiment_digests: predecessors,
    status,
    summary: summarizeEvaluations(canonicalEvaluations),
    semantics: EXPERIMENT_SEMANTICS
  });
  const experimentDigest = digestObject(normalized);
  if (predecessors.includes(experimentDigest)) {
    throw new ValidationError('improvement experiment cannot cite itself as a predecessor');
  }
  return Object.freeze({ ...normalized, experiment_digest: experimentDigest });
}

function revalidateExperiment(raw) {
  const value = assertPlainObject(raw, 'normalized improvement experiment');
  const claimedDigest = digest(value.experiment_digest, 'normalized improvement experiment experiment_digest');
  const reconstructed = createImprovementExperiment({
    proposal: value.proposal,
    evaluations: value.evaluations,
    predecessor_experiment_digests: value.predecessor_experiment_digests,
    status: value.status
  });
  if (reconstructed.experiment_digest !== claimedDigest) {
    throw new ValidationError('normalized improvement experiment digest mismatch');
  }
  return reconstructed;
}

function positiveEvidenceFacts(experiment) {
  const positive = experiment.evaluations.filter(item => item.verdict === 'positive');
  const independent = positive.filter(item => item.independence.same_lineage === false);
  const deterministic = positive.filter(item => item.deterministic_verifier.enabled);
  return Object.freeze({
    positive_evaluations: positive.length,
    lineage_independent_evaluations: independent.length,
    distinct_lineage_independent_principals: new Set(
      independent.map(item => item.evaluator.principal_id)
    ).size,
    deterministic_verifier_evaluations: deterministic.length
  });
}

function baseAssessmentRequirements(consequenceClass) {
  switch (consequenceClass) {
    case 'C0':
      return Object.freeze({
        rollback_required: false,
        min_positive_evaluations: 1,
        min_lineage_independent_evaluations: 0,
        second_independent_source_or_deterministic: false,
        independent_non_candidate_evaluator_required: false
      });
    case 'C1':
      return Object.freeze({
        rollback_required: true,
        min_positive_evaluations: 1,
        min_lineage_independent_evaluations: 1,
        second_independent_source_or_deterministic: false,
        independent_non_candidate_evaluator_required: false
      });
    case 'C2':
      return Object.freeze({
        rollback_required: true,
        min_positive_evaluations: 1,
        min_lineage_independent_evaluations: 1,
        second_independent_source_or_deterministic: true,
        independent_non_candidate_evaluator_required: false
      });
    case 'C3':
      return Object.freeze({
        rollback_required: true,
        min_positive_evaluations: 1,
        min_lineage_independent_evaluations: 1,
        second_independent_source_or_deterministic: false,
        independent_non_candidate_evaluator_required: true
      });
    default:
      return Object.freeze({
        rollback_required: true,
        min_positive_evaluations: 1,
        min_lineage_independent_evaluations: 1,
        second_independent_source_or_deterministic: true,
        independent_non_candidate_evaluator_required: true
      });
  }
}

function effectiveAssessmentRequirements(consequenceClass, rawOverrides) {
  const base = baseAssessmentRequirements(consequenceClass);
  if (rawOverrides === undefined || rawOverrides === null) return base;
  const overrides = exactObject(rawOverrides, PROFILE_OVERRIDE_KEYS, 'improvement promotion profileOverrides');

  const minPositive = overrides.min_positive_evaluations === undefined
    ? base.min_positive_evaluations
    : safeInteger(
      overrides.min_positive_evaluations,
      'improvement promotion profileOverrides min_positive_evaluations',
      { min: 0, max: 64 }
    );
  if (minPositive < base.min_positive_evaluations) {
    throw new ValidationError('improvement promotion profileOverrides cannot weaken minimum positive evaluations');
  }

  const minLineage = overrides.min_lineage_independent_evaluations === undefined
    ? base.min_lineage_independent_evaluations
    : safeInteger(
      overrides.min_lineage_independent_evaluations,
      'improvement promotion profileOverrides min_lineage_independent_evaluations',
      { min: 0, max: 64 }
    );
  if (minLineage < base.min_lineage_independent_evaluations) {
    throw new ValidationError('improvement promotion profileOverrides cannot weaken minimum lineage-independent evaluations');
  }

  const secondSource = overrides.require_second_independent_source_or_deterministic === undefined
    ? base.second_independent_source_or_deterministic
    : boolean(
      overrides.require_second_independent_source_or_deterministic,
      'improvement promotion profileOverrides require_second_independent_source_or_deterministic'
    );
  if (base.second_independent_source_or_deterministic && !secondSource) {
    throw new ValidationError('improvement promotion profileOverrides cannot weaken second-source requirement');
  }

  const nonCandidate = overrides.require_independent_non_candidate_evaluator === undefined
    ? base.independent_non_candidate_evaluator_required
    : boolean(
      overrides.require_independent_non_candidate_evaluator,
      'improvement promotion profileOverrides require_independent_non_candidate_evaluator'
    );
  if (base.independent_non_candidate_evaluator_required && !nonCandidate) {
    throw new ValidationError('improvement promotion profileOverrides cannot weaken independent evaluator requirement');
  }

  return Object.freeze({
    rollback_required: base.rollback_required,
    min_positive_evaluations: minPositive,
    min_lineage_independent_evaluations: minLineage,
    second_independent_source_or_deterministic: secondSource,
    independent_non_candidate_evaluator_required: nonCandidate
  });
}

export function assessImprovementPromotion(raw = {}) {
  const args = exactObject(raw, ASSESSMENT_ARG_KEYS, 'improvement promotion assessment arguments');
  const experiment = revalidateExperiment(args.experiment);
  const proposal = experiment.proposal;
  const requirements = effectiveAssessmentRequirements(
    proposal.consequence_class,
    args.profileOverrides
  );
  const positiveFacts = positiveEvidenceFacts(experiment);
  const achieved = Object.freeze({
    ...positiveFacts,
    distinct_evaluator_principals: experiment.summary.distinct_evaluator_principals,
    negative_evaluations: experiment.summary.negative_evaluations,
    mixed_evaluations: experiment.summary.mixed_evaluations,
    regressions: experiment.summary.regressions,
    rollback_present: proposal.rollback !== null
  });

  const structuralReasons = [];
  const evidenceReasons = [];
  const promotable = !['C4', 'C5'].includes(proposal.consequence_class);
  if (!promotable) structuralReasons.push('surface-not-promotable-in-v0');

  if (requirements.rollback_required && proposal.rollback === null) {
    evidenceReasons.push('rollback-evidence-required');
  }
  if (positiveFacts.positive_evaluations < requirements.min_positive_evaluations) {
    evidenceReasons.push('positive-evaluation-required');
  }

  if (proposal.consequence_class === 'C1' && requirements.min_lineage_independent_evaluations === 1) {
    const hasIndependent = positiveFacts.lineage_independent_evaluations >= 1;
    const hasDeterministic = positiveFacts.deterministic_verifier_evaluations >= 1;
    if (!hasIndependent && !hasDeterministic) {
      evidenceReasons.push('independent-or-deterministic-evidence-required');
    }
  } else if (
    positiveFacts.lineage_independent_evaluations
    < requirements.min_lineage_independent_evaluations
  ) {
    evidenceReasons.push('lineage-independent-evaluation-required');
  }

  if (requirements.second_independent_source_or_deterministic) {
    const secondIndependent = positiveFacts.distinct_lineage_independent_principals >= 2;
    const deterministic = positiveFacts.deterministic_verifier_evaluations >= 1;
    if (!secondIndependent && !deterministic) {
      evidenceReasons.push('second-independent-source-or-deterministic-verifier-required');
    }
  }

  const candidateEvaluatorDigest = proposal.candidate.digest;
  const positive = experiment.evaluations.filter(item => item.verdict === 'positive');
  const independentlyDefinedJudge = positive.some(item => (
    item.independence.same_lineage === false
    && item.evaluator.evaluator_definition_digest !== candidateEvaluatorDigest
  ));
  if (
    (proposal.target_surface === 'evaluator-reward'
      || requirements.independent_non_candidate_evaluator_required)
    && !independentlyDefinedJudge
  ) {
    evidenceReasons.push('candidate-evaluator-cannot-solely-certify');
  }

  if (experiment.summary.negative_evaluations > 0 || experiment.summary.mixed_evaluations > 0) {
    evidenceReasons.push('conflicting-evaluation-evidence-present');
  }
  if (experiment.summary.regressions > 0) {
    evidenceReasons.push('unresolved-regression-evidence-present');
  }

  let recommendation;
  if (structuralReasons.length > 0) recommendation = 'ineligible';
  else if (evidenceReasons.length > 0) recommendation = 'insufficient-evidence';
  else recommendation = 'eligible';

  const reasonCodes = Object.freeze([...new Set([...structuralReasons, ...evidenceReasons])].sort());
  const normalized = Object.freeze({
    schema: IMPROVEMENT_PROMOTION_ASSESSMENT_SCHEMA,
    experiment_digest: experiment.experiment_digest,
    target_surface: proposal.target_surface,
    consequence_class: proposal.consequence_class,
    promotable_in_v0: promotable,
    required: requirements,
    achieved,
    recommendation,
    reason_codes: reasonCodes,
    semantics: ASSESSMENT_SEMANTICS
  });
  return Object.freeze({ ...normalized, assessment_digest: digestObject(normalized) });
}
