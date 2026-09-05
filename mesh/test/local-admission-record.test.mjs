import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { validateLocalAdmissionRecord } from '../src/lib/local-admission-record.mjs';

const exampleUrl = new URL('../../agent-commons/examples/local-admission-record.v1.json', import.meta.url);
const NOW = new Date('2026-09-01T13:00:00.000Z');

test('local admission is instance-scoped and inert', async () => {
  const record = JSON.parse(await readFile(exampleUrl, 'utf8'));
  const result = validateLocalAdmissionRecord(record, { now: NOW });
  assert.equal(result.valid, true);
  assert.equal(result.state, 'admitted_inert');
  assert.equal(result.authority_effect, 'none');
  assert.equal(result.activation_requires_fresh_effect_admission, true);
});

test('local admission cannot auto-activate', async () => {
  const record = JSON.parse(await readFile(exampleUrl, 'utf8'));
  record.activation.auto_activate = true;
  assert.throws(
    () => validateLocalAdmissionRecord(record, { now: NOW }),
    /cannot auto-activate/
  );
});

test('quarantine and policy review are mandatory before admission', async () => {
  for (const field of ['quarantine_scan_passed','policy_check_passed']) {
    const record = JSON.parse(await readFile(exampleUrl, 'utf8'));
    record.review[field] = false;
    assert.throws(
      () => validateLocalAdmissionRecord(record, { now: NOW }),
      /must pass/
    );
  }
});

test('rollback must exist before activation eligibility', async () => {
  const record = JSON.parse(await readFile(exampleUrl, 'utf8'));
  record.rollback.required = false;
  assert.throws(
    () => validateLocalAdmissionRecord(record, { now: NOW }),
    /rollback plan is required/
  );
});

test('artifact cannot be simultaneously approved and rejected', async () => {
  const record = JSON.parse(await readFile(exampleUrl, 'utf8'));
  record.rejected_artifact_digests = [...record.approved_artifact_digests];
  assert.throws(
    () => validateLocalAdmissionRecord(record, { now: NOW }),
    /both approved and rejected/
  );
});
