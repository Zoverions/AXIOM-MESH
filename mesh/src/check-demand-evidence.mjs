import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPOSITORY_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const DEFAULT_EVIDENCE_DIR = 'docs/growth/evidence';

export const DEMAND_EVIDENCE_SCHEMA = 'axiom-demand-evidence.v0';
export const DEMAND_GATE_VERSION = 'axiom-demand-gate.v0';
export const OWNED_DEMAND_EXPERIMENT_SCHEMA = 'axiom-owned-demand-experiment.v0';
export const DEMAND_GATE_STATES = Object.freeze([
  'DISCOVERY',
  'PROBE',
  'VALIDATE',
  'BUILD'
]);

const SOURCE_KINDS = Object.freeze([
  'firsthand_report',
  'firsthand_request',
  'secondary_snapshot',
  'owned_experiment'
]);
const COMMITMENTS = Object.freeze([
  'none',
  'stated_switch',
  'waitlist',
  'paid_preorder',
  'paid_pilot'
]);
const PACKAGE_FIELDS = Object.freeze([
  'schema',
  'gate_version',
  'hypothesis_id',
  'created_at',
  'persona',
  'problem_hypothesis',
  'offer_probe',
  'declared_status',
  'observations'
]);
const OBSERVATION_FIELDS = Object.freeze([
  'id',
  'source_url',
  'source_kind',
  'published_at',
  'independence_group',
  'payer_confirmed',
  'pain_tags',
  'desired_outcome_tags',
  'commitment',
  'owned_experiment_ref',
  'summary'
]);
const OWNED_EXPERIMENT_FIELDS = Object.freeze([
  'schema',
  'experiment_id',
  'campaign_id',
  'created_at',
  'owner_repo',
  'collection_surface',
  'observation_ids'
]);
const IDENTIFIER = /^[a-z0-9][a-z0-9._:-]{0,127}$/;
const TAG = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const OWNED_EXPERIMENT_REF = /^docs\/growth\/owned-experiments\/[a-z0-9][a-z0-9._-]{0,127}\.json$/;

export class DemandEvidenceError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DemandEvidenceError';
  }
}

function assertObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new DemandEvidenceError(`${label} must be an object`);
  }
  return value;
}

function exactFields(value, fields, label) {
  const object = assertObject(value, label);
  const expected = new Set(fields);
  for (const key of Object.keys(object)) {
    if (!expected.has(key)) {
      throw new DemandEvidenceError(`${label} contains unknown field ${key}`);
    }
  }
  for (const key of fields) {
    if (!Object.hasOwn(object, key)) {
      throw new DemandEvidenceError(`${label}.${key} is required`);
    }
  }
  return object;
}

function string(value, label, { pattern = null, min = 1, max = 2048 } = {}) {
  if (typeof value !== 'string' || value.length < min || value.length > max) {
    throw new DemandEvidenceError(`${label} must be a string of length ${min}-${max}`);
  }
  if (pattern && !pattern.test(value)) {
    throw new DemandEvidenceError(`${label} has invalid format`);
  }
  return value;
}

function enumValue(value, allowed, label) {
  if (!allowed.includes(value)) {
    throw new DemandEvidenceError(`${label} must be one of ${allowed.join(', ')}`);
  }
  return value;
}

function date(value, label) {
  string(value, label, { pattern: DATE, max: 10 });
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new DemandEvidenceError(`${label} must be a real calendar date`);
  }
  return value;
}

function httpsUrl(value, label) {
  string(value, label, { max: 2048 });
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new DemandEvidenceError(`${label} must be a valid URL`);
  }
  if (parsed.protocol !== 'https:') {
    throw new DemandEvidenceError(`${label} must use https`);
  }
  return value;
}

function tags(value, label, { min = 1 } = {}) {
  if (!Array.isArray(value) || value.length < min || value.length > 16) {
    throw new DemandEvidenceError(`${label} must contain ${min}-16 tags`);
  }
  const normalized = value.map((item, index) =>
    string(item, `${label}[${index}]`, { pattern: TAG, max: 64 })
  );
  if (new Set(normalized).size !== normalized.length) {
    throw new DemandEvidenceError(`${label} must not contain duplicate tags`);
  }
  return normalized;
}

function normalizeObservation(input, index) {
  const value = exactFields(input, OBSERVATION_FIELDS, `observation[${index}]`);
  if (typeof value.payer_confirmed !== 'boolean') {
    throw new DemandEvidenceError(`observation[${index}].payer_confirmed must be boolean`);
  }
  const sourceKind = enumValue(
    value.source_kind,
    SOURCE_KINDS,
    `observation[${index}].source_kind`
  );
  let ownedExperimentRef = null;
  if (sourceKind === 'owned_experiment') {
    ownedExperimentRef = string(
      value.owned_experiment_ref,
      `observation[${index}].owned_experiment_ref`,
      { pattern: OWNED_EXPERIMENT_REF, max: 220 }
    );
  } else if (value.owned_experiment_ref !== null) {
    throw new DemandEvidenceError(
      `observation[${index}].owned_experiment_ref must be null for non-owned evidence`
    );
  }

  return Object.freeze({
    id: string(value.id, `observation[${index}].id`, { pattern: IDENTIFIER, max: 128 }),
    source_url: httpsUrl(value.source_url, `observation[${index}].source_url`),
    source_kind: sourceKind,
    published_at: date(value.published_at, `observation[${index}].published_at`),
    independence_group: string(
      value.independence_group,
      `observation[${index}].independence_group`,
      { pattern: IDENTIFIER, max: 128 }
    ),
    payer_confirmed: value.payer_confirmed,
    pain_tags: Object.freeze(tags(value.pain_tags, `observation[${index}].pain_tags`)),
    desired_outcome_tags: Object.freeze(tags(
      value.desired_outcome_tags,
      `observation[${index}].desired_outcome_tags`,
      { min: 0 }
    )),
    commitment: enumValue(
      value.commitment,
      COMMITMENTS,
      `observation[${index}].commitment`
    ),
    owned_experiment_ref: ownedExperimentRef,
    summary: string(value.summary, `observation[${index}].summary`, { min: 20, max: 800 })
  });
}

function countTagGroups(observations, field) {
  const byTag = new Map();
  for (const observation of observations) {
    for (const tag of observation[field]) {
      if (!byTag.has(tag)) byTag.set(tag, new Set());
      byTag.get(tag).add(observation.independence_group);
    }
  }
  return [...byTag.entries()]
    .map(([tag, groups]) => ({ tag, count: groups.size }))
    .sort((left, right) => {
      if (right.count !== left.count) return right.count - left.count;
      if (left.tag < right.tag) return -1;
      if (left.tag > right.tag) return 1;
      return 0;
    });
}

function uniqueGroups(observations) {
  return new Set(observations.map(item => item.independence_group));
}

function evaluationDate(value) {
  const instant = value ?? new Date();
  if (!(instant instanceof Date) || Number.isNaN(instant.valueOf())) {
    throw new DemandEvidenceError('evaluationTime must be a valid Date');
  }
  return instant.toISOString().slice(0, 10);
}

function normalizeTrustedOwnedExperiments(value) {
  if (value === undefined) return new Map();
  if (!(value instanceof Map)) {
    throw new DemandEvidenceError('trustedOwnedExperiments must be a Map');
  }
  return value;
}

function validateOwnedExperimentReceipt(input, ref, evaluatedOn) {
  const value = exactFields(input, OWNED_EXPERIMENT_FIELDS, `owned experiment receipt ${ref}`);
  if (value.schema !== OWNED_DEMAND_EXPERIMENT_SCHEMA) {
    throw new DemandEvidenceError(
      `owned experiment receipt ${ref}.schema must be ${OWNED_DEMAND_EXPERIMENT_SCHEMA}`
    );
  }
  const experimentId = string(value.experiment_id, `owned experiment receipt ${ref}.experiment_id`, {
    pattern: IDENTIFIER,
    max: 128
  });
  string(value.campaign_id, `owned experiment receipt ${ref}.campaign_id`, {
    pattern: IDENTIFIER,
    max: 128
  });
  const createdAt = date(value.created_at, `owned experiment receipt ${ref}.created_at`);
  if (createdAt > evaluatedOn) {
    throw new DemandEvidenceError(`owned experiment receipt ${ref} is future-dated`);
  }
  if (value.owner_repo !== 'Zoverions/AXIOM-MESH') {
    throw new DemandEvidenceError(
      `owned experiment receipt ${ref}.owner_repo must be Zoverions/AXIOM-MESH`
    );
  }
  httpsUrl(value.collection_surface, `owned experiment receipt ${ref}.collection_surface`);
  if (
    !Array.isArray(value.observation_ids)
    || value.observation_ids.length === 0
    || value.observation_ids.length > 256
  ) {
    throw new DemandEvidenceError(
      `owned experiment receipt ${ref}.observation_ids must contain 1-256 entries`
    );
  }
  const observationIds = value.observation_ids.map((id, index) =>
    string(id, `owned experiment receipt ${ref}.observation_ids[${index}]`, {
      pattern: IDENTIFIER,
      max: 128
    })
  );
  if (new Set(observationIds).size !== observationIds.length) {
    throw new DemandEvidenceError(
      `owned experiment receipt ${ref}.observation_ids must be unique`
    );
  }
  return Object.freeze({
    experiment_id: experimentId,
    observation_ids: new Set(observationIds)
  });
}

async function loadOwnedExperimentReceipts(repositoryRoot, refs, evaluatedOn) {
  const trusted = new Map();
  for (const ref of [...refs].sort()) {
    let content;
    try {
      content = await readFile(resolve(repositoryRoot, ref), 'utf8');
    } catch (error) {
      throw new DemandEvidenceError(
        `owned experiment receipt ${ref} could not be read: ${error?.code || 'io_error'}`
      );
    }
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new DemandEvidenceError(`owned experiment receipt ${ref} is not valid JSON`);
    }
    trusted.set(ref, validateOwnedExperimentReceipt(parsed, ref, evaluatedOn));
  }
  return trusted;
}

export function evaluateDemandEvidence(
  input,
  { evaluationTime = new Date(), trustedOwnedExperiments } = {}
) {
  const evaluatedOn = evaluationDate(evaluationTime);
  const trustedOwned = normalizeTrustedOwnedExperiments(trustedOwnedExperiments);
  const value = exactFields(input, PACKAGE_FIELDS, 'demand evidence package');
  if (value.schema !== DEMAND_EVIDENCE_SCHEMA) {
    throw new DemandEvidenceError(`demand evidence package.schema must be ${DEMAND_EVIDENCE_SCHEMA}`);
  }
  if (value.gate_version !== DEMAND_GATE_VERSION) {
    throw new DemandEvidenceError(`demand evidence package.gate_version must be ${DEMAND_GATE_VERSION}`);
  }
  const hypothesisId = string(value.hypothesis_id, 'demand evidence package.hypothesis_id', {
    pattern: IDENTIFIER,
    max: 128
  });
  const createdAt = date(value.created_at, 'demand evidence package.created_at');
  if (createdAt > evaluatedOn) {
    throw new DemandEvidenceError('demand evidence package.created_at cannot be in the future');
  }
  string(value.persona, 'demand evidence package.persona', { min: 20, max: 1000 });
  string(value.problem_hypothesis, 'demand evidence package.problem_hypothesis', {
    min: 20,
    max: 1200
  });
  string(value.offer_probe, 'demand evidence package.offer_probe', { min: 20, max: 1200 });
  const declaredStatus = enumValue(
    value.declared_status,
    DEMAND_GATE_STATES,
    'demand evidence package.declared_status'
  );
  if (
    !Array.isArray(value.observations)
    || value.observations.length === 0
    || value.observations.length > 256
  ) {
    throw new DemandEvidenceError(
      'demand evidence package.observations must contain 1-256 entries'
    );
  }

  const observations = value.observations.map(normalizeObservation);
  const ids = new Set();
  const groupBySourceUrl = new Map();
  for (const observation of observations) {
    if (ids.has(observation.id)) {
      throw new DemandEvidenceError(`duplicate observation id ${observation.id}`);
    }
    ids.add(observation.id);
    if (observation.published_at > evaluatedOn) {
      throw new DemandEvidenceError(
        `observation ${observation.id} is future-dated relative to evaluation`
      );
    }

    const existingGroup = groupBySourceUrl.get(observation.source_url);
    if (existingGroup && existingGroup !== observation.independence_group) {
      throw new DemandEvidenceError(
        `source URL ${observation.source_url} maps to multiple independence groups`
      );
    }
    groupBySourceUrl.set(observation.source_url, observation.independence_group);

    if (observation.source_kind === 'owned_experiment') {
      const receipt = trustedOwned.get(observation.owned_experiment_ref);
      if (!receipt || !receipt.observation_ids.has(observation.id)) {
        throw new DemandEvidenceError(
          `owned observation ${observation.id} is not backed by its trusted experiment receipt`
        );
      }
    }
  }

  const strong = observations.filter(item => item.source_kind !== 'secondary_snapshot');
  const strongGroups = uniqueGroups(strong);
  const payerGroups = uniqueGroups(strong.filter(item => item.payer_confirmed));
  const desiredGroups = uniqueGroups(strong.filter(item => item.desired_outcome_tags.length > 0));
  const painCounts = countTagGroups(strong, 'pain_tags');
  const topPain = painCounts[0] ?? { tag: null, count: 0 };
  const owned = observations.filter(item => item.source_kind === 'owned_experiment');
  const ownedIntentGroups = uniqueGroups(owned.filter(item => item.commitment !== 'none'));
  const ownedHighIntentGroups = uniqueGroups(owned.filter(item =>
    ['waitlist', 'paid_preorder', 'paid_pilot'].includes(item.commitment)
  ));
  const ownedPaidGroups = uniqueGroups(owned.filter(item =>
    ['paid_preorder', 'paid_pilot'].includes(item.commitment)
  ));

  let computedStatus = 'DISCOVERY';
  if (
    strongGroups.size >= 4
    && payerGroups.size >= 2
    && topPain.count >= 3
    && desiredGroups.size >= 2
  ) {
    computedStatus = 'PROBE';
  }
  if (
    computedStatus === 'PROBE'
    && ownedIntentGroups.size >= 5
    && ownedHighIntentGroups.size >= 2
  ) {
    computedStatus = 'VALIDATE';
  }
  if (computedStatus === 'VALIDATE' && ownedPaidGroups.size >= 3) {
    computedStatus = 'BUILD';
  }

  if (declaredStatus !== computedStatus) {
    throw new DemandEvidenceError(
      `declared status ${declaredStatus} does not match computed status ${computedStatus}`
    );
  }

  return Object.freeze({
    valid: true,
    hypothesis_id: hypothesisId,
    status: computedStatus,
    metrics: Object.freeze({
      observations: observations.length,
      strong_independent_groups: strongGroups.size,
      payer_confirmed_groups: payerGroups.size,
      desired_outcome_groups: desiredGroups.size,
      top_pain_tag: topPain.tag,
      top_pain_independent_groups: topPain.count,
      owned_intent_groups: ownedIntentGroups.size,
      owned_high_intent_groups: ownedHighIntentGroups.size,
      owned_paid_groups: ownedPaidGroups.size
    })
  });
}

export async function verifyDemandEvidence(
  repositoryRoot = REPOSITORY_ROOT,
  { evaluationTime = new Date() } = {}
) {
  const evaluatedOn = evaluationDate(evaluationTime);
  const evidenceDir = resolve(repositoryRoot, DEFAULT_EVIDENCE_DIR);
  let entries;
  try {
    entries = (await readdir(evidenceDir, { withFileTypes: true }))
      .filter(entry => entry.isFile() && entry.name.endsWith('.json'))
      .map(entry => entry.name)
      .sort();
  } catch (error) {
    throw new DemandEvidenceError(
      `demand evidence directory could not be read: ${error?.code || 'io_error'}`
    );
  }
  if (entries.length === 0) {
    throw new DemandEvidenceError(
      'demand evidence directory must contain at least one JSON package'
    );
  }

  const packages = [];
  const ownedRefs = new Set();
  for (const name of entries) {
    const path = resolve(evidenceDir, name);
    let content;
    try {
      content = await readFile(path, 'utf8');
    } catch (error) {
      throw new DemandEvidenceError(
        `${name} could not be read: ${error?.code || 'io_error'}`
      );
    }
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new DemandEvidenceError(`${name} is not valid JSON`);
    }
    for (const observation of parsed?.observations ?? []) {
      if (
        observation?.source_kind === 'owned_experiment'
        && typeof observation.owned_experiment_ref === 'string'
      ) {
        if (!OWNED_EXPERIMENT_REF.test(observation.owned_experiment_ref)) {
          throw new DemandEvidenceError(
            `${name} contains an invalid owned_experiment_ref`
          );
        }
        ownedRefs.add(observation.owned_experiment_ref);
      }
    }
    packages.push({ name, parsed });
  }

  const trustedOwnedExperiments = await loadOwnedExperimentReceipts(
    repositoryRoot,
    ownedRefs,
    evaluatedOn
  );
  const results = packages.map(({ name, parsed }) => ({
    file: name,
    ...evaluateDemandEvidence(parsed, {
      evaluationTime,
      trustedOwnedExperiments
    })
  }));
  return Object.freeze({ valid: true, packages: Object.freeze(results) });
}

async function main() {
  process.stdout.write(`${JSON.stringify(await verifyDemandEvidence())}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    process.stderr.write(`${error?.stack || error}\n`);
    process.exitCode = 1;
  });
}
