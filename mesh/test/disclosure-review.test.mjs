import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { validateDisclosureReview } from '../src/lib/disclosure-review.mjs';

const IMPLEMENTATION_URL = new URL('../src/lib/disclosure-review.mjs', import.meta.url);

const VALID_REVIEW = Object.freeze({
  schema: 'axiom-disclosure-review.v1',
  review_id: 'disclosure_review_example',
  object_digest: 'b'.repeat(64),
  threat_profile_digest: 'c'.repeat(64),
  purpose: 'publish-minimized-research-artifact',
  required_categories: ['metadata', 'watermark', 'malware'],
  findings: [
    {
      category: 'metadata',
      status: 'clear',
      severity: 'none',
      detector: 'metadata-lab.v1',
      reason_code: 'no-supported-metadata-found'
    },
    {
      category: 'watermark',
      status: 'clear',
      severity: 'none',
      detector: 'watermark-lab.v1',
      reason_code: 'no-supported-watermark-found'
    },
    {
      category: 'malware',
      status: 'clear',
      severity: 'none',
      detector: 'malware-lab.v1',
      reason_code: 'no-supported-malware-found'
    }
  ],
  decision: 'allow',
  authority_effect: 'none'
});

function clone(value = VALID_REVIEW) {
  return structuredClone(value);
}

test('clear required disclosure categories validate without granting release authority', () => {
  const result = validateDisclosureReview(clone());
  assert.equal(result.valid, true);
  assert.equal(result.schema, 'axiom-disclosure-review.v1');
  assert.equal(result.decision, 'allow');
  assert.match(result.review_digest, /^[a-f0-9]{64}$/);
  assert.deepEqual(result.required_categories, ['metadata', 'watermark', 'malware']);
  assert.equal(result.authority_effect, 'none');
  assert.equal(result.release_authorized, false);
  assert.equal(result.transmission_authorized, false);
  assert.equal(result.sanitizer_executed, false);
});

test('required not_checked, unsupported, and finding states cannot produce allow', () => {
  for (const [status, severity] of [
    ['not_checked', 'none'],
    ['unsupported', 'none'],
    ['finding', 'high']
  ]) {
    const candidate = clone();
    candidate.findings[0].status = status;
    candidate.findings[0].severity = severity;
    assert.throws(
      () => validateDisclosureReview(candidate),
      /allow requires every required disclosure category to be clear/
    );
  }
});

test('every required category must appear exactly once', () => {
  const missing = clone();
  missing.findings = missing.findings.filter(item => item.category !== 'malware');
  assert.throws(
    () => validateDisclosureReview(missing),
    /required category malware is missing/
  );

  const duplicate = clone();
  duplicate.findings.push(structuredClone(duplicate.findings[0]));
  assert.throws(
    () => validateDisclosureReview(duplicate),
    /findings contains duplicate category metadata/
  );
});

test('disclosure review restricts category vocabulary and rejects duplicates', () => {
  const unsupported = clone();
  unsupported.required_categories = ['metadata', 'face-recognition'];
  assert.throws(
    () => validateDisclosureReview(unsupported),
    /required_categories contains unsupported value face-recognition/
  );

  const duplicate = clone();
  duplicate.required_categories = ['metadata', 'metadata'];
  assert.throws(
    () => validateDisclosureReview(duplicate),
    /required_categories contains duplicate value metadata/
  );
});

test('disclosure review enforces status and severity semantics', () => {
  const clearSeverity = clone();
  clearSeverity.findings[0].severity = 'low';
  assert.throws(
    () => validateDisclosureReview(clearSeverity),
    /clear findings require severity none/
  );

  const findingSeverity = clone();
  findingSeverity.findings[0].status = 'finding';
  assert.throws(
    () => validateDisclosureReview(findingSeverity),
    /finding status requires non-none severity/
  );

  for (const status of ['not_checked', 'unsupported']) {
    const candidate = clone();
    candidate.decision = 'requires-review';
    candidate.findings[0].status = status;
    candidate.findings[0].severity = 'medium';
    assert.throws(
      () => validateDisclosureReview(candidate),
      new RegExp(`${status} findings require severity none`)
    );
  }
});

test('disclosure review rejects raw identity, release, sanitizer, and secret fields', () => {
  for (const [field, value] of [
    ['raw_secret', 'secret'],
    ['participant_id', 'person_1'],
    ['owner_email', 'owner@example.test'],
    ['release_token', 'token'],
    ['sanitized_bytes', 'payload']
  ]) {
    const candidate = clone();
    candidate[field] = value;
    assert.throws(
      () => validateDisclosureReview(candidate),
      new RegExp(`unsupported field ${field}`)
    );
  }
});

test('disclosure review rejects authority elevation, invalid decisions, and invalid digests', () => {
  const authority = clone();
  authority.authority_effect = 'publish';
  assert.throws(
    () => validateDisclosureReview(authority),
    /authority_effect must be none/
  );

  const decision = clone();
  decision.decision = 'publish';
  assert.throws(
    () => validateDisclosureReview(decision),
    /decision is invalid/
  );

  for (const field of ['object_digest', 'threat_profile_digest']) {
    const candidate = clone();
    candidate[field] = 'ABC';
    assert.throws(
      () => validateDisclosureReview(candidate),
      new RegExp(`${field} has an invalid format`)
    );
  }
});

test('disclosure review validator is effect-inert and imports no effect-capable modules', async () => {
  const source = await readFile(IMPLEMENTATION_URL, 'utf8');
  for (const forbidden of [
    'node:child_process',
    'node:fs',
    'node:net',
    'node:http',
    'node:https',
    'node:dgram',
    'node:tls',
    'gateway',
    'hypervisor',
    'sandbox',
    'grid',
    'executor'
  ]) {
    assert.equal(source.toLowerCase().includes(forbidden), false, `validator must not import/reference ${forbidden}`);
  }
});
