import { createHash } from 'node:crypto';

export const GTM_ACCOUNT_EVIDENCE_SCHEMA = 'axiom-gtm-account-evidence.v0';
export const GTM_PRIORITY_VERSION = 'axiom-gtm-priority.v0';
export const GTM_LANES = Object.freeze([
  'EXCLUDE',
  'WATCH',
  'RESEARCH',
  'HIGH_SIGNAL'
]);

const DIMENSIONS = Object.freeze(['fit', 'timing', 'intent']);
const SOURCE_QUALITY = Object.freeze({
  semantic_inference: 0,
  public_secondary: 1,
  public_primary: 2,
  owned_first_party: 3
});
const PACKAGE_FIELDS = Object.freeze([
  'schema',
  'evaluation_version',
  'account_id',
  'created_at',
  'declared_lane',
  'signals'
]);
const SIGNAL_FIELDS = Object.freeze([
  'id',
  'dimension',
  'level',
  'source_url',
  'source_kind',
  'observed_at',
  'valid_until',
  'independence_group',
  'summary'
]);
const IDENTIFIER = /^[a-z0-9][a-z0-9._:-]{0,127}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export class GtmEvidenceError extends Error {
  constructor(message) {
    super(message);
    this.name = 'GtmEvidenceError';
  }
}

function assertObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new GtmEvidenceError(`${label} must be an object`);
  }
  return value;
}

function exactFields(value, fields, label) {
  const object = assertObject(value, label);
  const expected = new Set(fields);
  for (const key of Object.keys(object)) {
    if (!expected.has(key)) {
      throw new GtmEvidenceError(`${label} contains unknown field ${key}`);
    }
  }
  for (const key of fields) {
    if (!Object.hasOwn(object, key)) {
      throw new GtmEvidenceError(`${label}.${key} is required`);
    }
  }
  return object;
}

function string(value, label, { pattern = null, min = 1, max = 2048 } = {}) {
  if (typeof value !== 'string' || value.length < min || value.length > max) {
    throw new GtmEvidenceError(`${label} must be a string of length ${min}-${max}`);
  }
  if (pattern && !pattern.test(value)) {
    throw new GtmEvidenceError(`${label} has invalid format`);
  }
  return value;
}

function date(value, label) {
  string(value, label, { pattern: DATE, max: 10 });
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new GtmEvidenceError(`${label} must be a real calendar date`);
  }
  return value;
}

function enumValue(value, allowed, label) {
  if (!allowed.includes(value)) {
    throw new GtmEvidenceError(`${label} must be one of ${allowed.join(', ')}`);
  }
  return value;
}

function level(value, label) {
  if (!Number.isInteger(value) || value < 0 || value > 3) {
    throw new GtmEvidenceError(`${label} must be an integer from 0 to 3`);
  }
  return value;
}

function httpsUrl(value, label) {
  string(value, label, { max: 2048 });
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new GtmEvidenceError(`${label} must be a valid URL`);
  }
  if (parsed.protocol !== 'https:') {
    throw new GtmEvidenceError(`${label} must use https`);
  }
  return value;
}

function evaluationDate(value) {
  const instant = value ?? new Date();
  if (!(instant instanceof Date) || Number.isNaN(instant.valueOf())) {
    throw new GtmEvidenceError('evaluationTime must be a valid Date');
  }
  return instant.toISOString().slice(0, 10);
}

function normalizeSignal(input, index, evaluatedOn) {
  const value = exactFields(input, SIGNAL_FIELDS, `signal[${index}]`);
  const observedAt = date(value.observed_at, `signal[${index}].observed_at`);
  const validUntil = date(value.valid_until, `signal[${index}].valid_until`);
  if (validUntil < observedAt) {
    throw new GtmEvidenceError(`signal[${index}].valid_until cannot precede observed_at`);
  }
  if (observedAt > evaluatedOn) {
    throw new GtmEvidenceError(`signal[${index}] is future-dated relative to evaluation`);
  }

  const sourceKind = enumValue(
    value.source_kind,
    Object.keys(SOURCE_QUALITY),
    `signal[${index}].source_kind`
  );

  return Object.freeze({
    id: string(value.id, `signal[${index}].id`, { pattern: IDENTIFIER, max: 128 }),
    dimension: enumValue(value.dimension, DIMENSIONS, `signal[${index}].dimension`),
    level: level(value.level, `signal[${index}].level`),
    source_url: httpsUrl(value.source_url, `signal[${index}].source_url`),
    source_kind: sourceKind,
    source_quality: SOURCE_QUALITY[sourceKind],
    observed_at: observedAt,
    valid_until: validUntil,
    independence_group: string(
      value.independence_group,
      `signal[${index}].independence_group`,
      { pattern: IDENTIFIER, max: 128 }
    ),
    summary: string(value.summary, `signal[${index}].summary`, { min: 20, max: 800 })
  });
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value).sort().map(key => [key, stableValue(value[key])])
  );
}

function digest(value) {
  return createHash('sha256')
    .update(JSON.stringify(stableValue(value)))
    .digest('hex');
}

function vectorFor(activeSignals) {
  const vector = { fit: 0, timing: 0, intent: 0, confidence: 0 };
  const decisiveQuality = new Map();

  for (const dimension of DIMENSIONS) {
    const candidates = activeSignals.filter(signal => signal.dimension === dimension);
    const highest = candidates.reduce((max, signal) => Math.max(max, signal.level), 0);
    vector[dimension] = highest;
    if (highest > 0) {
      const quality = candidates
        .filter(signal => signal.level === highest)
        .reduce((max, signal) => Math.max(max, signal.source_quality), 0);
      decisiveQuality.set(dimension, quality);
    }
  }

  const required = ['fit', 'timing'];
  if (vector.intent > 0) required.push('intent');
  vector.confidence = required.every(dimension => decisiveQuality.has(dimension))
    ? Math.min(...required.map(dimension => decisiveQuality.get(dimension)))
    : 0;

  return Object.freeze(vector);
}

function laneFor(vector) {
  if (vector.fit === 0) return 'EXCLUDE';
  if (vector.fit < 2 || vector.timing < 2) return 'WATCH';
  if (vector.confidence < 2) return 'RESEARCH';
  if (vector.intent < 1) return 'RESEARCH';
  return 'HIGH_SIGNAL';
}

export function evaluateGtmAccount(input, { evaluationTime = new Date() } = {}) {
  const evaluatedOn = evaluationDate(evaluationTime);
  const value = exactFields(input, PACKAGE_FIELDS, 'gtm account evidence');
  if (value.schema !== GTM_ACCOUNT_EVIDENCE_SCHEMA) {
    throw new GtmEvidenceError(
      `gtm account evidence.schema must be ${GTM_ACCOUNT_EVIDENCE_SCHEMA}`
    );
  }
  if (value.evaluation_version !== GTM_PRIORITY_VERSION) {
    throw new GtmEvidenceError(
      `gtm account evidence.evaluation_version must be ${GTM_PRIORITY_VERSION}`
    );
  }
  const accountId = string(value.account_id, 'gtm account evidence.account_id', {
    pattern: IDENTIFIER,
    max: 128
  });
  const createdAt = date(value.created_at, 'gtm account evidence.created_at');
  if (createdAt > evaluatedOn) {
    throw new GtmEvidenceError('gtm account evidence.created_at cannot be in the future');
  }
  const declaredLane = enumValue(
    value.declared_lane,
    GTM_LANES,
    'gtm account evidence.declared_lane'
  );
  if (!Array.isArray(value.signals) || value.signals.length === 0 || value.signals.length > 128) {
    throw new GtmEvidenceError('gtm account evidence.signals must contain 1-128 entries');
  }

  const signals = value.signals.map((signal, index) =>
    normalizeSignal(signal, index, evaluatedOn)
  );
  const ids = new Set();
  const groupBySourceUrl = new Map();
  for (const signal of signals) {
    if (ids.has(signal.id)) {
      throw new GtmEvidenceError(`duplicate signal id ${signal.id}`);
    }
    ids.add(signal.id);
    const existingGroup = groupBySourceUrl.get(signal.source_url);
    if (existingGroup && existingGroup !== signal.independence_group) {
      throw new GtmEvidenceError(
        `source URL ${signal.source_url} maps to multiple independence groups`
      );
    }
    groupBySourceUrl.set(signal.source_url, signal.independence_group);
  }

  const activeSignals = signals.filter(signal => signal.valid_until >= evaluatedOn);
  const expiredSignals = signals.length - activeSignals.length;
  const vector = vectorFor(activeSignals);
  const lane = laneFor(vector);

  if (declaredLane !== lane) {
    throw new GtmEvidenceError(
      `declared lane ${declaredLane} does not match computed lane ${lane}`
    );
  }

  return Object.freeze({
    valid: true,
    account_id: accountId,
    lane,
    vector,
    active_signals: activeSignals.length,
    expired_signals: expiredSignals,
    evidence_digest: digest({
      schema: value.schema,
      evaluation_version: value.evaluation_version,
      account_id: accountId,
      created_at: createdAt,
      evaluated_on: evaluatedOn,
      signals
    })
  });
}
