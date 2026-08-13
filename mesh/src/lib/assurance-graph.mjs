import {
  ValidationError,
  assertPlainObject,
  assertString,
  digestObject
} from './canonical.mjs';

export const CHANGE_FRONT_SCHEMA = 'axiom-change-front.v1';
export const CHANGE_FRONT_PROVIDER_OBSERVATION_SCHEMA =
  'axiom-change-front-provider-observation.v1';
export const ASSURANCE_EVIDENCE_SCHEMA = 'axiom-assurance-evidence.v1';
export const ASSURANCE_GRAPH_SCHEMA = 'axiom-assurance-graph.v1';

const DIGEST = /^[a-f0-9]{64}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$/;
const LIFECYCLES = new Set([
  'current-main',
  'active',
  'stack-child',
  'research',
  'evidence-only',
  'superseded',
  'rebuild-required',
  'promotion-candidate'
]);
const NEVER_MERGE_LIFECYCLES = new Set([
  'current-main',
  'research',
  'evidence-only',
  'superseded',
  'rebuild-required'
]);
const PROVIDERS = new Set(['github', 'gitlab', 'forgejo', 'radicle', 'other']);
const EVIDENCE_CLASSES = new Set([
  'measured',
  'authenticated_assertion',
  'independently_verified',
  'inference',
  'declaration'
]);
const BASIS_KINDS = new Set([
  'local_bytes',
  'signed_artifact',
  'provider_report',
  'derived',
  'declaration'
]);
const RESULTS = new Set(['pass', 'fail', 'unknown', 'observed']);

const CHANGE_FRONT_FIELDS = new Set([
  'schema',
  'front_id',
  'repository_id',
  'base_state_digest',
  'head_state_digest',
  'lifecycle',
  'merge_eligible',
  'depends_on',
  'supersedes',
  'replaces',
  'claim_boundary_digest',
  'provider_observations',
  'front_digest'
]);
const PROVIDER_OBSERVATION_FIELDS = new Set([
  'schema',
  'provider',
  'locator',
  'branch',
  'review_id',
  'observed_at',
  'non_authoritative',
  'observation_digest'
]);
const EVIDENCE_FIELDS = new Set([
  'schema',
  'evidence_id',
  'front_id',
  'source_state_digest',
  'evidence_class',
  'basis_kind',
  'subject',
  'result',
  'evidence_payload_digest',
  'environment_digest',
  'observed_at',
  'current_for_front',
  'non_authorizing',
  'provider_observation',
  'evidence_digest'
]);
const GRAPH_FIELDS = new Set([
  'schema',
  'repository_id',
  'fronts',
  'evidence',
  'graph_digest'
]);

function rejectUnknown(value, allowed, name) {
  const unknown = Object.keys(value).filter(key => !allowed.has(key));
  if (unknown.length) {
    throw new ValidationError(`${name} contains unsupported fields: ${unknown.join(', ')}`);
  }
}

function id(value, name) {
  return assertString(value, name, { min: 1, max: 192, pattern: ID });
}

function digest(value, name) {
  return assertString(value, name, { min: 64, max: 64, pattern: DIGEST });
}

function optionalDigest(value, name) {
  return value === null || value === undefined ? null : digest(value, name);
}

function iso(value, name) {
  const raw = assertString(value, name, { min: 1, max: 64 });
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.valueOf())) {
    throw new ValidationError(`${name} must be an ISO timestamp`);
  }
  return parsed.toISOString();
}

function normalizedIdList(value, name) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 256) {
    throw new ValidationError(`${name} must be an array with at most 256 items`);
  }
  const normalized = value.map((item, index) => id(item, `${name}[${index}]`));
  if (new Set(normalized).size !== normalized.length) {
    throw new ValidationError(`${name} must not contain duplicates`);
  }
  return normalized.sort();
}

export function normalizeChangeFrontProviderObservation(raw) {
  const value = assertPlainObject(raw, 'change-front provider observation');
  rejectUnknown(value, PROVIDER_OBSERVATION_FIELDS, 'change-front provider observation');
  if (value.schema !== CHANGE_FRONT_PROVIDER_OBSERVATION_SCHEMA) {
    throw new ValidationError(
      `change-front provider observation schema must be ${CHANGE_FRONT_PROVIDER_OBSERVATION_SCHEMA}`
    );
  }
  if (!PROVIDERS.has(value.provider)) {
    throw new ValidationError('change-front provider is unsupported');
  }
  if (value.non_authoritative !== true) {
    throw new ValidationError(
      'change-front provider observations must remain explicitly non-authoritative'
    );
  }
  const body = {
    schema: CHANGE_FRONT_PROVIDER_OBSERVATION_SCHEMA,
    provider: value.provider,
    locator: assertString(value.locator, 'provider locator', { min: 1, max: 2048 }),
    branch: value.branch === undefined
      ? null
      : assertString(value.branch, 'provider branch', { min: 1, max: 256 }),
    review_id: value.review_id === undefined
      ? null
      : assertString(String(value.review_id), 'provider review_id', { min: 1, max: 128 }),
    observed_at: iso(value.observed_at, 'provider observed_at'),
    non_authoritative: true
  };
  const observationDigest = digestObject(body);
  if (
    value.observation_digest !== undefined
    && digest(value.observation_digest, 'provider observation_digest') !== observationDigest
  ) {
    throw new ValidationError('change-front provider observation digest is invalid');
  }
  return { ...body, observation_digest: observationDigest };
}

function normalizeDependency(raw, index) {
  const value = assertPlainObject(raw, `depends_on[${index}]`);
  rejectUnknown(
    value,
    new Set(['front_id', 'expected_head_state_digest']),
    `depends_on[${index}]`
  );
  return {
    front_id: id(value.front_id, `depends_on[${index}].front_id`),
    expected_head_state_digest: digest(
      value.expected_head_state_digest,
      `depends_on[${index}].expected_head_state_digest`
    )
  };
}

export function normalizeChangeFront(raw) {
  const value = assertPlainObject(raw, 'change front');
  rejectUnknown(value, CHANGE_FRONT_FIELDS, 'change front');
  if (value.schema !== CHANGE_FRONT_SCHEMA) {
    throw new ValidationError(`change front schema must be ${CHANGE_FRONT_SCHEMA}`);
  }
  if (!LIFECYCLES.has(value.lifecycle)) {
    throw new ValidationError('change front lifecycle is unsupported');
  }
  if (typeof value.merge_eligible !== 'boolean') {
    throw new ValidationError('change front merge_eligible must be boolean');
  }
  if (value.merge_eligible && NEVER_MERGE_LIFECYCLES.has(value.lifecycle)) {
    throw new ValidationError(
      `change front lifecycle ${value.lifecycle} can never be merge-eligible`
    );
  }

  const baseStateDigest = digest(value.base_state_digest, 'base_state_digest');
  const headStateDigest = digest(value.head_state_digest, 'head_state_digest');
  if (value.lifecycle === 'current-main') {
    if (baseStateDigest !== headStateDigest) {
      throw new ValidationError('current-main front requires identical base and head state');
    }
  } else if (baseStateDigest === headStateDigest) {
    throw new ValidationError('non-main change front must change source state');
  }

  if (!Array.isArray(value.depends_on ?? [])) {
    throw new ValidationError('change front depends_on must be an array');
  }
  const dependencies = (value.depends_on ?? [])
    .map(normalizeDependency)
    .sort((left, right) => left.front_id.localeCompare(right.front_id));
  if (new Set(dependencies.map(item => item.front_id)).size !== dependencies.length) {
    throw new ValidationError('change front dependencies must not contain duplicates');
  }

  if (!Array.isArray(value.provider_observations ?? [])) {
    throw new ValidationError('change front provider_observations must be an array');
  }
  const providerObservations = (value.provider_observations ?? [])
    .map(normalizeChangeFrontProviderObservation);

  const authoritativeBody = {
    schema: CHANGE_FRONT_SCHEMA,
    front_id: id(value.front_id, 'front_id'),
    repository_id: id(value.repository_id, 'repository_id'),
    base_state_digest: baseStateDigest,
    head_state_digest: headStateDigest,
    lifecycle: value.lifecycle,
    merge_eligible: value.merge_eligible,
    depends_on: dependencies,
    supersedes: normalizedIdList(value.supersedes, 'supersedes'),
    replaces: normalizedIdList(value.replaces, 'replaces'),
    claim_boundary_digest: digest(value.claim_boundary_digest, 'claim_boundary_digest')
  };
  const frontDigest = digestObject(authoritativeBody);
  if (
    value.front_digest !== undefined
    && digest(value.front_digest, 'front_digest') !== frontDigest
  ) {
    throw new ValidationError('change front digest does not match authoritative content');
  }
  return {
    ...authoritativeBody,
    provider_observations: providerObservations,
    front_digest: frontDigest,
    provider_metadata_in_authority_identity: false,
    merge_authority_granted: false
  };
}

function validateEvidenceBasis(evidenceClass, basisKind) {
  const allowed = {
    measured: new Set(['local_bytes']),
    authenticated_assertion: new Set(['signed_artifact', 'provider_report']),
    independently_verified: new Set(['local_bytes', 'signed_artifact']),
    inference: new Set(['derived']),
    declaration: new Set(['declaration'])
  }[evidenceClass];
  if (!allowed.has(basisKind)) {
    throw new ValidationError(
      `evidence class ${evidenceClass} cannot use basis ${basisKind}`
    );
  }
}

export function normalizeAssuranceEvidence(raw) {
  const value = assertPlainObject(raw, 'assurance evidence');
  rejectUnknown(value, EVIDENCE_FIELDS, 'assurance evidence');
  if (value.schema !== ASSURANCE_EVIDENCE_SCHEMA) {
    throw new ValidationError(
      `assurance evidence schema must be ${ASSURANCE_EVIDENCE_SCHEMA}`
    );
  }
  if (!EVIDENCE_CLASSES.has(value.evidence_class)) {
    throw new ValidationError('assurance evidence class is unsupported');
  }
  if (!BASIS_KINDS.has(value.basis_kind)) {
    throw new ValidationError('assurance evidence basis is unsupported');
  }
  validateEvidenceBasis(value.evidence_class, value.basis_kind);
  if (!RESULTS.has(value.result)) {
    throw new ValidationError('assurance evidence result is unsupported');
  }
  if (typeof value.current_for_front !== 'boolean') {
    throw new ValidationError('assurance evidence current_for_front must be boolean');
  }
  if (value.non_authorizing !== true) {
    throw new ValidationError('assurance evidence cannot itself grant authority');
  }

  const providerObservation = value.provider_observation === undefined
    ? null
    : normalizeChangeFrontProviderObservation(value.provider_observation);
  if (value.basis_kind === 'provider_report' && providerObservation === null) {
    throw new ValidationError('provider_report evidence requires provider observation metadata');
  }
  if (value.basis_kind !== 'provider_report' && providerObservation !== null) {
    throw new ValidationError('provider observation metadata is only valid for provider_report evidence');
  }

  const body = {
    schema: ASSURANCE_EVIDENCE_SCHEMA,
    evidence_id: id(value.evidence_id, 'evidence_id'),
    front_id: id(value.front_id, 'front_id'),
    source_state_digest: digest(value.source_state_digest, 'source_state_digest'),
    evidence_class: value.evidence_class,
    basis_kind: value.basis_kind,
    subject: id(value.subject, 'subject'),
    result: value.result,
    evidence_payload_digest: digest(value.evidence_payload_digest, 'evidence_payload_digest'),
    environment_digest: optionalDigest(value.environment_digest, 'environment_digest'),
    observed_at: iso(value.observed_at, 'observed_at'),
    current_for_front: value.current_for_front,
    non_authorizing: true,
    provider_observation_digest: providerObservation?.observation_digest ?? null
  };
  const evidenceDigest = digestObject(body);
  if (
    value.evidence_digest !== undefined
    && digest(value.evidence_digest, 'evidence_digest') !== evidenceDigest
  ) {
    throw new ValidationError('assurance evidence digest does not match canonical content');
  }
  return {
    ...body,
    provider_observation: providerObservation,
    evidence_digest: evidenceDigest,
    negative_evidence: value.result === 'fail' || value.result === 'unknown',
    authority_granted: false
  };
}

function assertUnique(items, key, name) {
  const values = items.map(item => item[key]);
  if (new Set(values).size !== values.length) {
    throw new ValidationError(`${name} must be unique`);
  }
}

function assertAcyclic(frontsById) {
  const visiting = new Set();
  const visited = new Set();

  function visit(frontId) {
    if (visited.has(frontId)) return;
    if (visiting.has(frontId)) {
      throw new ValidationError(`change-front dependency cycle includes ${frontId}`);
    }
    visiting.add(frontId);
    const front = frontsById.get(frontId);
    for (const dependency of front.depends_on) visit(dependency.front_id);
    visiting.delete(frontId);
    visited.add(frontId);
  }

  for (const frontId of frontsById.keys()) visit(frontId);
}

export function verifyAssuranceGraph(raw) {
  const value = assertPlainObject(raw, 'assurance graph');
  rejectUnknown(value, GRAPH_FIELDS, 'assurance graph');
  if (value.schema !== ASSURANCE_GRAPH_SCHEMA) {
    throw new ValidationError(`assurance graph schema must be ${ASSURANCE_GRAPH_SCHEMA}`);
  }
  if (!Array.isArray(value.fronts) || !Array.isArray(value.evidence)) {
    throw new ValidationError('assurance graph fronts and evidence must be arrays');
  }
  if (value.fronts.length > 10_000 || value.evidence.length > 100_000) {
    throw new ValidationError('assurance graph exceeds bounded v1 size');
  }

  const repositoryId = id(value.repository_id, 'repository_id');
  const fronts = value.fronts.map(normalizeChangeFront);
  const evidence = value.evidence.map(normalizeAssuranceEvidence);
  assertUnique(fronts, 'front_id', 'change front ids');
  assertUnique(evidence, 'evidence_id', 'assurance evidence ids');

  const frontsById = new Map(fronts.map(front => [front.front_id, front]));
  for (const front of fronts) {
    if (front.repository_id !== repositoryId) {
      throw new ValidationError('change front repository does not match assurance graph');
    }
    for (const dependency of front.depends_on) {
      const target = frontsById.get(dependency.front_id);
      if (!target) {
        throw new ValidationError(
          `change front dependency ${dependency.front_id} does not exist`
        );
      }
      if (dependency.front_id === front.front_id) {
        throw new ValidationError('change front cannot depend on itself');
      }
      if (dependency.expected_head_state_digest !== target.head_state_digest) {
        throw new ValidationError(
          `change front dependency ${dependency.front_id} moved from the expected head`
        );
      }
      if (
        front.merge_eligible
        && ['evidence-only', 'superseded', 'rebuild-required'].includes(target.lifecycle)
      ) {
        throw new ValidationError(
          `merge-eligible front cannot depend on ${target.lifecycle} front ${target.front_id}`
        );
      }
    }
    for (const relation of [...front.supersedes, ...front.replaces]) {
      if (relation === front.front_id) {
        throw new ValidationError('change front cannot supersede or replace itself');
      }
      if (!frontsById.has(relation)) {
        throw new ValidationError(`change front relation ${relation} does not exist`);
      }
    }
  }
  assertAcyclic(frontsById);

  for (const item of evidence) {
    const front = frontsById.get(item.front_id);
    if (!front) {
      throw new ValidationError(`assurance evidence front ${item.front_id} does not exist`);
    }
    if (item.current_for_front && item.source_state_digest !== front.head_state_digest) {
      throw new ValidationError(
        `assurance evidence ${item.evidence_id} is stale for current front head`
      );
    }
  }

  const canonicalFronts = fronts
    .map(front => ({ front_id: front.front_id, front_digest: front.front_digest }))
    .sort((left, right) => left.front_id.localeCompare(right.front_id));
  const canonicalEvidence = evidence
    .map(item => ({
      evidence_id: item.evidence_id,
      evidence_digest: item.evidence_digest
    }))
    .sort((left, right) => left.evidence_id.localeCompare(right.evidence_id));
  const graphBody = {
    schema: ASSURANCE_GRAPH_SCHEMA,
    repository_id: repositoryId,
    fronts: canonicalFronts,
    evidence: canonicalEvidence
  };
  const graphDigest = digestObject(graphBody);
  if (
    value.graph_digest !== undefined
    && digest(value.graph_digest, 'graph_digest') !== graphDigest
  ) {
    throw new ValidationError('assurance graph digest does not match canonical content');
  }

  return {
    valid: true,
    repository_id: repositoryId,
    fronts,
    evidence,
    graph_digest: graphDigest,
    provider_observations_grant_authority: false,
    merge_authority_granted: false,
    capability_promotion_granted: false
  };
}
