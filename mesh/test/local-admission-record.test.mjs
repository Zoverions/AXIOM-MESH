import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { validateLocalAdmissionRecord } from '../src/lib/local-admission-record.mjs';

const exampleUrl = new URL('../../agent-commons/examples/local-admission-record.v1.json', import.meta.url);
const profileUrl = new URL('../../agent-commons/local-admission-record-profile.v1.json', import.meta.url);
const NOW = new Date('2026-09-01T13:00:00.000Z');

async function exampleRecord() {
  return JSON.parse(await readFile(exampleUrl, 'utf8'));
}

test('local admission is instance-scoped and inert', async () => {
  const record = await exampleRecord();
  const result = validateLocalAdmissionRecord(record, { now: NOW });
  assert.equal(result.valid, true);
  assert.equal(result.state, 'admitted_inert');
  assert.equal(result.authority_effect, 'none');
  assert.equal(result.activation_requires_fresh_effect_admission, true);
});

test('local admission cannot auto-activate', async () => {
  const record = await exampleRecord();
  record.activation.auto_activate = true;
  assert.throws(
    () => validateLocalAdmissionRecord(record, { now: NOW }),
    /cannot auto-activate/
  );
});

test('quarantine and policy review are mandatory before admission', async () => {
  for (const field of ['quarantine_scan_passed', 'policy_check_passed']) {
    const record = await exampleRecord();
    record.review[field] = false;
    assert.throws(
      () => validateLocalAdmissionRecord(record, { now: NOW }),
      /must pass/
    );
  }
});

test('rollback must exist before activation eligibility', async () => {
  const record = await exampleRecord();
  record.rollback.required = false;
  assert.throws(
    () => validateLocalAdmissionRecord(record, { now: NOW }),
    /rollback plan is required/
  );
});

test('artifact cannot be simultaneously approved and rejected', async () => {
  const record = await exampleRecord();
  record.rejected_artifact_digests = [...record.approved_artifact_digests];
  assert.throws(
    () => validateLocalAdmissionRecord(record, { now: NOW }),
    /both approved and rejected/
  );
});

test('protection profile identifiers must use canonical ID grammar', async () => {
  const record = await exampleRecord();
  record.protection_profile_ids[0] = 'invalid profile id';
  assert.throws(() => validateLocalAdmissionRecord(record, { now: NOW }));
});

test('reviewer identifiers must use canonical ID grammar', async () => {
  const record = await exampleRecord();
  record.review.reviewer_ids[0] = 'invalid reviewer id';
  assert.throws(() => validateLocalAdmissionRecord(record, { now: NOW }));
});

test('duplicate approved artifact digests are rejected', async () => {
  const record = await exampleRecord();
  record.approved_artifact_digests.push(record.approved_artifact_digests[0]);
  assert.throws(
    () => validateLocalAdmissionRecord(record, { now: NOW }),
    /approved artifact digests must be unique/
  );
});

test('duplicate rejected artifact digests are rejected', async () => {
  const record = await exampleRecord();
  record.rejected_artifact_digests.push(record.rejected_artifact_digests[0]);
  assert.throws(
    () => validateLocalAdmissionRecord(record, { now: NOW }),
    /rejected artifact digests must be unique/
  );
});

test('machine-readable lifecycle uses admitted_inert consistently', async () => {
  const profile = JSON.parse(await readFile(profileUrl, 'utf8'));
  assert.ok(profile.lifecycle.includes('admitted_inert'));
  assert.equal(profile.lifecycle.includes('locally_admitted_inert'), false);
});

test('zero-length and inverted admission validity windows fail structurally', async () => {
  const base = await exampleRecord();
  for (const expiresAt of [
    base.valid_from,
    '2026-09-01T12:44:59.999Z'
  ]) {
    const record = structuredClone(base);
    record.expires_at = expiresAt;
    assert.throws(
      () => validateLocalAdmissionRecord(record, { now: NOW }),
      /expires_at must follow valid_from/
    );
  }
});

test('expiry boundary is fail closed when now equals expires_at', async () => {
  const record = await exampleRecord();
  const result = validateLocalAdmissionRecord(record, {
    now: new Date(record.expires_at)
  });
  assert.equal(result.checks.not_expired, false);
  assert.equal(result.valid, false);
});

test('reported audit checks reflect the validated record fields', async () => {
  const record = await exampleRecord();
  const result = validateLocalAdmissionRecord(record, { now: NOW });
  assert.equal(result.checks.quarantine_scan_passed, record.review.quarantine_scan_passed);
  assert.equal(result.checks.policy_check_passed, record.review.policy_check_passed);
  assert.equal(result.checks.rollback_defined, record.rollback.required);
});
