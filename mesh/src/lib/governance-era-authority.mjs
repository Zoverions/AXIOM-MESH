import { digestObject, ValidationError } from './canonical.mjs';

export const GOVERNANCE_ERA_AUTHORITY_PACKAGE_SCHEMA =
  'axiom-governance-era-authority-package.v0';
export const GOVERNANCE_AUTHORITY_RECORD_SCHEMA =
  'axiom-governance-authority-record.v0';

export const GOVERNANCE_ERAS = Object.freeze([
  'formation',
  'founding-stewardship',
  'distributed-settlement',
  'polycentric-society'
]);

const ERA_INDEX = new Map(GOVERNANCE_ERAS.map((era, index) => [era, index]));
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const GATE_STATUSES = new Set([
  'satisfied',
  'unsatisfied',
  'insufficient-evidence',
  'disputed',
  'stale'
]);
const CHALLENGE_STATUSES = new Set(['none', 'open', 'blocking', 'cleared']);

export function validateGovernanceEraAuthorityPackage(document) {
  exactObject(document, 'Governance era authority package', [
    'schema',
    'version',
    'status',
    'current_era',
    'transition',
    'authority_records',
    'authority_effect',
    'network_effect',
    'runtime_activation'
  ]);

  if (
    document.schema !== GOVERNANCE_ERA_AUTHORITY_PACKAGE_SCHEMA
    || document.version !== 0
    || document.status !== 'inert-contract-laboratory'
    || !ERA_INDEX.has(document.current_era)
    || document.authority_effect !== 'none'
    || document.network_effect !== 'none'
    || document.runtime_activation !== false
  ) {
    throw new ValidationError('Governance era authority package activation boundary is invalid');
  }

  const transition = validateTransition(document.transition, document.current_era);
  if (!Array.isArray(document.authority_records) || document.authority_records.length > 256) {
    throw new ValidationError('Governance authority records are invalid');
  }

  const seenAuthorities = new Set();
  const authorityRecords = document.authority_records.map(record => {
    const validated = validateAuthorityRecord(record);
    if (seenAuthorities.has(validated.authority_id)) {
      throw new ValidationError('Governance authority IDs must be unique');
    }
    seenAuthorities.add(validated.authority_id);
    return validated;
  });

  const transitionAssessment = transition === null ? null : assessTransition(transition);
  const authorityAssessments = authorityRecords.map(record => (
    assessGovernanceAuthorityAtEra(record, document.current_era)
  ));

  return Object.freeze({
    valid: true,
    schema: document.schema,
    current_era: document.current_era,
    package_digest: digestObject(document),
    transition: transitionAssessment,
    authority_assessments: Object.freeze(authorityAssessments),
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  });
}

export function governanceEraAuthorityDigest(document) {
  validateGovernanceEraAuthorityPackage(document);
  return digestObject(document);
}

export function assessGovernanceAuthorityAtEra(record, era) {
  validateAuthorityRecord(record);
  if (!ERA_INDEX.has(era)) throw new ValidationError('Governance era is invalid');

  const current = ERA_INDEX.get(era);
  const minimum = ERA_INDEX.get(record.minimum_era);
  const maximum = record.maximum_era === null ? null : ERA_INDEX.get(record.maximum_era);

  let eraWindowSatisfied = true;
  let reason = 'era-window-satisfied';

  if (current < minimum) {
    eraWindowSatisfied = false;
    reason = 'minimum-era-not-reached';
  } else if (maximum !== null && current > maximum) {
    eraWindowSatisfied = false;
    reason = 'maximum-era-exceeded';
  }

  return Object.freeze({
    authority_id: record.authority_id,
    era,
    era_window_satisfied: eraWindowSatisfied,
    reason,
    execution_binding: false,
    requires_local_authority_evaluation: true,
    authority_effect: 'none',
    runtime_activation: false
  });
}

function validateTransition(transition, currentEra) {
  if (transition === null) {
    if (currentEra !== 'polycentric-society') {
      throw new ValidationError('Only the terminal governance era may omit a transition');
    }
    return null;
  }
  if (currentEra === 'polycentric-society') {
    throw new ValidationError('Terminal governance era cannot define a successor transition');
  }

  exactObject(transition, 'Governance era transition', [
    'candidate_era',
    'schedule_digest',
    'required_continuous_days',
    'observed_continuous_days',
    'required_attestations',
    'attestation_digests',
    'challenge_status',
    'gates'
  ]);

  if (
    !ERA_INDEX.has(transition.candidate_era)
    || !DIGEST.test(transition.schedule_digest ?? '')
    || !integerBetween(transition.required_continuous_days, 0, 3650)
    || !integerBetween(transition.observed_continuous_days, 0, 3650)
    || !integerBetween(transition.required_attestations, 0, 64)
    || !CHALLENGE_STATUSES.has(transition.challenge_status)
    || !Array.isArray(transition.attestation_digests)
    || transition.attestation_digests.length > 64
    || transition.attestation_digests.some(item => !DIGEST.test(item))
    || !Array.isArray(transition.gates)
    || transition.gates.length < 1
    || transition.gates.length > 128
  ) {
    throw new ValidationError('Governance era transition is invalid');
  }

  const currentIndex = ERA_INDEX.get(currentEra);
  const candidateIndex = ERA_INDEX.get(transition.candidate_era);
  if (candidateIndex !== currentIndex + 1) {
    throw new ValidationError('Governance era transition must advance exactly one era');
  }

  const attestationSet = new Set(transition.attestation_digests);
  if (attestationSet.size !== transition.attestation_digests.length) {
    throw new ValidationError('Governance era transition attestations must be unique');
  }

  const gateIds = new Set();
  for (const gate of transition.gates) {
    exactObject(gate, 'Governance transition gate', [
      'gate_id',
      'status',
      'evidence_digest'
    ]);
    if (
      !id(gate.gate_id)
      || gateIds.has(gate.gate_id)
      || !GATE_STATUSES.has(gate.status)
      || !(gate.evidence_digest === null || DIGEST.test(gate.evidence_digest))
    ) {
      throw new ValidationError('Governance transition gate is invalid');
    }
    if (gate.status === 'satisfied' && gate.evidence_digest === null) {
      throw new ValidationError('Satisfied governance transition gate requires evidence');
    }
    gateIds.add(gate.gate_id);
  }

  return transition;
}

function assessTransition(transition) {
  const blockingGate = transition.gates.find(gate => gate.status !== 'satisfied');
  const durationSatisfied =
    transition.observed_continuous_days >= transition.required_continuous_days;
  const attestationsSatisfied =
    transition.attestation_digests.length >= transition.required_attestations;
  const challengeClear =
    transition.challenge_status === 'none' || transition.challenge_status === 'cleared';

  let eligible = true;
  let reason = 'eligible';

  if (blockingGate) {
    eligible = false;
    reason = `gate-${blockingGate.status}:${blockingGate.gate_id}`;
  } else if (!durationSatisfied) {
    eligible = false;
    reason = 'continuous-duration-not-satisfied';
  } else if (!attestationsSatisfied) {
    eligible = false;
    reason = 'attestation-threshold-not-satisfied';
  } else if (!challengeClear) {
    eligible = false;
    reason = transition.challenge_status === 'open'
      ? 'challenge-open'
      : 'blocking-challenge';
  }

  return Object.freeze({
    candidate_era: transition.candidate_era,
    eligible,
    reason,
    all_gates_satisfied: blockingGate === undefined,
    continuous_duration_satisfied: durationSatisfied,
    attestation_threshold_satisfied: attestationsSatisfied,
    challenge_clear: challengeClear,
    authority_effect: 'none',
    runtime_activation: false
  });
}

function validateAuthorityRecord(record) {
  exactObject(record, 'Governance authority record', [
    'schema',
    'authority_id',
    'holder_id',
    'domain',
    'minimum_era',
    'maximum_era',
    'delegable',
    'execution_binding',
    'requires_local_authority_evaluation',
    'authority_effect',
    'runtime_activation'
  ]);

  if (
    record.schema !== GOVERNANCE_AUTHORITY_RECORD_SCHEMA
    || !id(record.authority_id)
    || !id(record.holder_id)
    || !id(record.domain)
    || !ERA_INDEX.has(record.minimum_era)
    || !(record.maximum_era === null || ERA_INDEX.has(record.maximum_era))
    || typeof record.delegable !== 'boolean'
    || record.execution_binding !== false
    || record.requires_local_authority_evaluation !== true
    || record.authority_effect !== 'none'
    || record.runtime_activation !== false
  ) {
    throw new ValidationError('Governance authority record is invalid');
  }

  if (
    record.maximum_era !== null
    && ERA_INDEX.get(record.maximum_era) < ERA_INDEX.get(record.minimum_era)
  ) {
    throw new ValidationError('Governance authority era window is invalid');
  }

  return record;
}

function exactObject(value, label, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError(`${label} must be an object`);
  }
  const expected = [...keys].sort();
  const actual = Object.keys(value).sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new ValidationError(`${label} fields are invalid`);
  }
}

function integerBetween(value, min, max) {
  return Number.isSafeInteger(value) && value >= min && value <= max;
}

function id(value) {
  return typeof value === 'string' && IDENTIFIER.test(value);
}
