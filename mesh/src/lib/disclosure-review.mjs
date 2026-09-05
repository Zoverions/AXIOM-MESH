import {
  ValidationError,
  assertPlainObject,
  assertString,
  digestObject
} from './canonical.mjs';

export const DISCLOSURE_REVIEW_SCHEMA = 'axiom-disclosure-review.v1';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const TOKEN = /^[a-z0-9][a-z0-9.-]{0,159}$/;
const SHA256 = /^[a-f0-9]{64}$/;

const CATEGORIES = new Set([
  'metadata',
  'watermark',
  'malware',
  'embedded-content',
  'identity-marker',
  'stylometry',
  'format-risk'
]);

const STATUSES = new Set(['clear', 'finding', 'not_checked', 'unsupported']);
const SEVERITIES = new Set(['none', 'low', 'medium', 'high', 'critical']);
const DECISIONS = new Set(['allow', 'deny', 'requires-review']);

export function validateDisclosureReview(raw) {
  const review = exactObject(raw, 'Disclosure review', [
    'schema',
    'review_id',
    'object_digest',
    'threat_profile_digest',
    'purpose',
    'required_categories',
    'findings',
    'decision',
    'authority_effect'
  ]);

  if (review.schema !== DISCLOSURE_REVIEW_SCHEMA) {
    throw new ValidationError('Disclosure review schema is invalid');
  }

  const reviewId = assertString(review.review_id, 'Disclosure review review_id', {
    min: 1,
    max: 160,
    pattern: ID
  });
  assertString(review.object_digest, 'Disclosure review object_digest', {
    min: 64,
    max: 64,
    pattern: SHA256
  });
  assertString(review.threat_profile_digest, 'Disclosure review threat_profile_digest', {
    min: 64,
    max: 64,
    pattern: SHA256
  });
  assertString(review.purpose, 'Disclosure review purpose', {
    min: 1,
    max: 160,
    pattern: TOKEN
  });

  const requiredCategories = validateCategoryArray(
    review.required_categories,
    'Disclosure review required_categories',
    { minItems: 1, maxItems: CATEGORIES.size }
  );

  if (!Array.isArray(review.findings) || review.findings.length < 1 || review.findings.length > CATEGORIES.size) {
    throw new ValidationError(`Disclosure review findings must contain 1-${CATEGORIES.size} items`);
  }

  const byCategory = new Map();
  for (let index = 0; index < review.findings.length; index += 1) {
    const finding = validateFinding(review.findings[index], index);
    if (byCategory.has(finding.category)) {
      throw new ValidationError(`Disclosure review findings contains duplicate category ${finding.category}`);
    }
    byCategory.set(finding.category, finding);
  }

  for (const category of requiredCategories) {
    if (!byCategory.has(category)) {
      throw new ValidationError(`Disclosure review required category ${category} is missing`);
    }
  }

  if (!DECISIONS.has(review.decision)) {
    throw new ValidationError('Disclosure review decision is invalid');
  }

  if (
    review.decision === 'allow'
    && requiredCategories.some(category => byCategory.get(category).status !== 'clear')
  ) {
    throw new ValidationError(
      'Disclosure review allow requires every required disclosure category to be clear'
    );
  }

  if (review.authority_effect !== 'none') {
    throw new ValidationError('Disclosure review authority_effect must be none');
  }

  return Object.freeze({
    valid: true,
    schema: review.schema,
    review_id: reviewId,
    review_digest: digestObject(review),
    decision: review.decision,
    required_categories: Object.freeze([...requiredCategories]),
    authority_effect: 'none',
    release_authorized: false,
    transmission_authorized: false,
    sanitizer_executed: false
  });
}

function validateFinding(raw, index) {
  const label = `Disclosure review findings[${index}]`;
  const finding = exactObject(raw, label, [
    'category',
    'status',
    'severity',
    'detector',
    'reason_code'
  ]);

  if (!CATEGORIES.has(finding.category)) {
    throw new ValidationError(`${label}.category is invalid`);
  }
  if (!STATUSES.has(finding.status)) {
    throw new ValidationError(`${label}.status is invalid`);
  }
  if (!SEVERITIES.has(finding.severity)) {
    throw new ValidationError(`${label}.severity is invalid`);
  }

  assertString(finding.detector, `${label}.detector`, {
    min: 1,
    max: 160,
    pattern: TOKEN
  });
  assertString(finding.reason_code, `${label}.reason_code`, {
    min: 1,
    max: 160,
    pattern: TOKEN
  });

  if (finding.status === 'clear' && finding.severity !== 'none') {
    throw new ValidationError('Disclosure review clear findings require severity none');
  }
  if (finding.status === 'finding' && finding.severity === 'none') {
    throw new ValidationError('Disclosure review finding status requires non-none severity');
  }
  if (
    (finding.status === 'not_checked' || finding.status === 'unsupported')
    && finding.severity !== 'none'
  ) {
    throw new ValidationError(`Disclosure review ${finding.status} findings require severity none`);
  }

  return finding;
}

function validateCategoryArray(value, label, { minItems, maxItems }) {
  if (!Array.isArray(value) || value.length < minItems || value.length > maxItems) {
    throw new ValidationError(`${label} must contain ${minItems}-${maxItems} items`);
  }

  const seen = new Set();
  const output = [];
  for (let index = 0; index < value.length; index += 1) {
    const item = assertString(value[index], `${label}[${index}]`, {
      min: 1,
      max: 64,
      pattern: TOKEN
    });
    if (seen.has(item)) {
      throw new ValidationError(`${label} contains duplicate value ${item}`);
    }
    if (!CATEGORIES.has(item)) {
      throw new ValidationError(`${label} contains unsupported value ${item}`);
    }
    seen.add(item);
    output.push(item);
  }
  return output;
}

function exactObject(raw, label, fields) {
  const value = assertPlainObject(raw, label);
  const allowed = new Set(fields);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new ValidationError(`${label} contains unsupported field ${key}`);
  }
  for (const key of fields) {
    if (!Object.hasOwn(value, key)) throw new ValidationError(`${label} is missing required field ${key}`);
  }
  return value;
}
