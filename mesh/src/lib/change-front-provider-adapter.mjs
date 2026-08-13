import {
  ValidationError,
  assertPlainObject,
  assertString,
  digestObject
} from './canonical.mjs';
import {
  ASSURANCE_EVIDENCE_SCHEMA,
  CHANGE_FRONT_PROVIDER_OBSERVATION_SCHEMA,
  normalizeAssuranceEvidence,
  normalizeChangeFront,
  normalizeChangeFrontProviderObservation
} from './assurance-graph.mjs';
import { normalizeSourceState } from './source-continuity.mjs';

export const CHANGE_FRONT_PROVIDER_CAPTURE_SCHEMA =
  'axiom-change-front-provider-capture.v1';
export const CHANGE_FRONT_PROVIDER_ADAPTATION_SCHEMA =
  'axiom-change-front-provider-adaptation.v1';

const DIGEST = /^[a-f0-9]{64}$/;
const CHECK_RESULTS = new Set([
  'success',
  'failure',
  'pending',
  'cancelled',
  'skipped',
  'unknown'
]);
const PROVIDERS = new Set(['github', 'gitlab', 'forgejo', 'radicle', 'other']);

const CAPTURE_FIELDS = new Set([
  'schema',
  'provider',
  'repository_id',
  'locator',
  'branch',
  'review_id',
  'external_revision',
  'observed_at',
  'provider_authenticity_verified',
  'provider_evidence_digest',
  'checks',
  'non_authoritative',
  'capture_digest'
]);
const CHECK_FIELDS = new Set([
  'name',
  'result',
  'external_run_id',
  'external_revision',
  'observed_at',
  'provider_evidence_digest'
]);

function rejectUnknown(value, allowed, name) {
  const unknown = Object.keys(value).filter(key => !allowed.has(key));
  if (unknown.length) {
    throw new ValidationError(`${name} contains unsupported fields: ${unknown.join(', ')}`);
  }
}

function digest(value, name) {
  return assertString(value, name, { min: 64, max: 64, pattern: DIGEST });
}

function iso(value, name) {
  const raw = assertString(value, name, { min: 1, max: 64 });
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.valueOf())) {
    throw new ValidationError(`${name} must be an ISO timestamp`);
  }
  return parsed.toISOString();
}

function normalizeCheck(raw, index) {
  const value = assertPlainObject(raw, `provider check[${index}]`);
  rejectUnknown(value, CHECK_FIELDS, `provider check[${index}]`);
  if (!CHECK_RESULTS.has(value.result)) {
    throw new ValidationError(`provider check[${index}] result is unsupported`);
  }
  return {
    name: assertString(value.name, `provider check[${index}].name`, {
      min: 1,
      max: 192,
      pattern: /^[A-Za-z0-9][A-Za-z0-9 _./:-]{0,191}$/
    }),
    result: value.result,
    external_run_id: value.external_run_id === null || value.external_run_id === undefined
      ? null
      : assertString(String(value.external_run_id), `provider check[${index}].external_run_id`, {
          min: 1,
          max: 128
        }),
    external_revision: assertString(
      value.external_revision,
      `provider check[${index}].external_revision`,
      { min: 1, max: 128, pattern: /^[A-Fa-f0-9]+$/ }
    ).toLowerCase(),
    observed_at: iso(value.observed_at, `provider check[${index}].observed_at`),
    provider_evidence_digest: digest(
      value.provider_evidence_digest,
      `provider check[${index}].provider_evidence_digest`
    )
  };
}

export function normalizeChangeFrontProviderCapture(raw) {
  const value = assertPlainObject(raw, 'change-front provider capture');
  rejectUnknown(value, CAPTURE_FIELDS, 'change-front provider capture');
  if (value.schema !== CHANGE_FRONT_PROVIDER_CAPTURE_SCHEMA) {
    throw new ValidationError(
      `change-front provider capture schema must be ${CHANGE_FRONT_PROVIDER_CAPTURE_SCHEMA}`
    );
  }
  if (!PROVIDERS.has(value.provider)) {
    throw new ValidationError('change-front provider capture provider is unsupported');
  }
  if (value.non_authoritative !== true) {
    throw new ValidationError('change-front provider capture must remain non-authoritative');
  }
  if (typeof value.provider_authenticity_verified !== 'boolean') {
    throw new ValidationError('provider_authenticity_verified must be boolean');
  }
  if (!Array.isArray(value.checks) || value.checks.length > 64) {
    throw new ValidationError('change-front provider capture checks must be an array with at most 64 items');
  }
  const checks = value.checks.map(normalizeCheck);
  const names = checks.map(item => item.name);
  if (new Set(names).size !== names.length) {
    throw new ValidationError('change-front provider capture check names must be unique');
  }
  const externalRevision = assertString(
    value.external_revision,
    'external_revision',
    { min: 1, max: 128, pattern: /^[A-Fa-f0-9]+$/ }
  ).toLowerCase();
  for (const check of checks) {
    if (check.external_revision !== externalRevision) {
      throw new ValidationError(
        `provider check ${check.name} is not bound to the captured external revision`
      );
    }
  }
  const body = {
    schema: CHANGE_FRONT_PROVIDER_CAPTURE_SCHEMA,
    provider: value.provider,
    repository_id: assertString(value.repository_id, 'repository_id', {
      min: 1,
      max: 192,
      pattern: /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$/
    }),
    locator: assertString(value.locator, 'provider locator', { min: 1, max: 2048 }),
    branch: value.branch === null || value.branch === undefined
      ? null
      : assertString(value.branch, 'provider branch', { min: 1, max: 256 }),
    review_id: value.review_id === null || value.review_id === undefined
      ? null
      : assertString(String(value.review_id), 'provider review_id', { min: 1, max: 128 }),
    external_revision: externalRevision,
    observed_at: iso(value.observed_at, 'observed_at'),
    provider_authenticity_verified: value.provider_authenticity_verified,
    provider_evidence_digest: digest(value.provider_evidence_digest, 'provider_evidence_digest'),
    checks: checks.sort((left, right) => left.name.localeCompare(right.name)),
    non_authoritative: true
  };
  const captureDigest = digestObject(body);
  if (
    value.capture_digest !== undefined
    && digest(value.capture_digest, 'capture_digest') !== captureDigest
  ) {
    throw new ValidationError('change-front provider capture digest is invalid');
  }
  return { ...body, capture_digest: captureDigest };
}

function assertSourceEvidence({ front, sourceState, sourceEvidence }) {
  const evidence = normalizeAssuranceEvidence(sourceEvidence);
  if (evidence.front_id !== front.front_id) {
    throw new ValidationError('source verification evidence belongs to another change front');
  }
  if (evidence.source_state_digest !== sourceState.state_digest) {
    throw new ValidationError('source verification evidence is not bound to the supplied source state');
  }
  if (
    evidence.evidence_class !== 'measured'
    && evidence.evidence_class !== 'independently_verified'
  ) {
    throw new ValidationError('provider adaptation requires measured or independently verified source evidence');
  }
  if (evidence.basis_kind !== 'local_bytes') {
    throw new ValidationError('provider adaptation source verification must be based on local bytes');
  }
  if (evidence.result !== 'pass') {
    throw new ValidationError('provider adaptation requires passing source verification evidence');
  }
  const expectedCurrent = sourceState.state_digest === front.head_state_digest;
  if (evidence.current_for_front !== expectedCurrent) {
    throw new ValidationError('source verification current_for_front does not match the front head binding');
  }
  return evidence;
}

function providerObservation(capture) {
  return normalizeChangeFrontProviderObservation({
    schema: CHANGE_FRONT_PROVIDER_OBSERVATION_SCHEMA,
    provider: capture.provider,
    locator: capture.locator,
    branch: capture.branch ?? undefined,
    review_id: capture.review_id ?? undefined,
    observed_at: capture.observed_at,
    non_authoritative: true
  });
}

export function adaptChangeFrontProviderCapture({
  front: rawFront,
  source_state: rawSourceState,
  source_evidence: rawSourceEvidence,
  capture: rawCapture
}) {
  const front = normalizeChangeFront(rawFront);
  const sourceState = normalizeSourceState(rawSourceState);
  const capture = normalizeChangeFrontProviderCapture(rawCapture);

  if (sourceState.repository_id !== front.repository_id) {
    throw new ValidationError('source state repository does not match change front');
  }
  if (capture.repository_id !== front.repository_id) {
    throw new ValidationError('provider capture repository does not match change front');
  }
  if (capture.external_revision !== sourceState.commit_oid) {
    throw new ValidationError(
      'provider external revision does not match the independently verified source-state commit'
    );
  }
  const sourceEvidence = assertSourceEvidence({
    front,
    sourceState,
    sourceEvidence: rawSourceEvidence
  });
  const observation = providerObservation(capture);
  const headMatchesFront = sourceState.state_digest === front.head_state_digest;

  const providerEvidence = capture.provider_authenticity_verified
    ? normalizeAssuranceEvidence({
        schema: ASSURANCE_EVIDENCE_SCHEMA,
        evidence_id: `provider:${capture.provider}:${capture.capture_digest}`,
        front_id: front.front_id,
        source_state_digest: sourceState.state_digest,
        evidence_class: 'authenticated_assertion',
        basis_kind: 'provider_report',
        subject: 'provider.change-front-observation',
        result: 'observed',
        evidence_payload_digest: capture.capture_digest,
        environment_digest: null,
        observed_at: capture.observed_at,
        current_for_front: headMatchesFront,
        non_authorizing: true,
        provider_observation: observation
      })
    : null;

  const body = {
    schema: CHANGE_FRONT_PROVIDER_ADAPTATION_SCHEMA,
    front_id: front.front_id,
    front_digest: front.front_digest,
    repository_id: front.repository_id,
    source_state_digest: sourceState.state_digest,
    source_evidence_digest: sourceEvidence.evidence_digest,
    provider: capture.provider,
    provider_capture_digest: capture.capture_digest,
    provider_observation_digest: observation.observation_digest,
    provider_evidence_digest: providerEvidence?.evidence_digest ?? null,
    provider_authenticity_verified: capture.provider_authenticity_verified,
    external_revision: capture.external_revision,
    head_matches_front: headMatchesFront,
    checks_all_success: capture.checks.length > 0
      && capture.checks.every(check => check.result === 'success'),
    checks_complete: capture.checks.every(
      check => !['pending', 'unknown'].includes(check.result)
    ),
    provider_metadata_authoritative: false,
    source_identity_derived_from_provider: false,
    merge_authority_granted: false,
    capability_promotion_granted: false,
    provider_mutation_performed: false,
    network_access_performed_by_adapter: false
  };
  const adaptationDigest = digestObject(body);
  return {
    ...body,
    adaptation_id: `change-front-provider-adaptation:${adaptationDigest}`,
    adaptation_digest: adaptationDigest,
    front,
    source_state: sourceState,
    source_evidence: sourceEvidence,
    provider_capture: capture,
    provider_observation: observation,
    provider_evidence: providerEvidence
  };
}
