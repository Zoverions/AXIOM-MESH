import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { ValidationError } from '../src/lib/canonical.mjs';
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

// --- P5: the output holds only values that were validated ---

const HOSTILE_ID = '../../not validated\u0000';

function isPlainDataRejection(error) {
  return error instanceof ValidationError && /local admission record must be plain data/.test(error.message);
}

// Every [container path, key] in a JSON value, objects and arrays alike.
function allSlots(value, path = []) {
  if (value === null || typeof value !== 'object') return [];
  const slots = [];
  for (const key of Object.keys(value)) {
    slots.push([path, key]);
    slots.push(...allSlots(value[key], [...path, key]));
  }
  return slots;
}

const at = (root, path) => path.reduce((node, key) => node[key], root);

test('P5: an admission_id getter cannot put an unvalidated value in the output (no getter call)', async () => {
  const raw = await exampleRecord();
  let reads = 0;
  const record = { ...raw };
  Object.defineProperty(record, 'admission_id', {
    enumerable: true,
    get() { reads += 1; return reads === 1 ? raw.admission_id : HOSTILE_ID; }
  });
  let result;
  assert.throws(() => { result = validateLocalAdmissionRecord(record, { now: NOW }); }, isPlainDataRejection);
  assert.equal(result, undefined);
  assert.equal(reads, 0, 'the getter is never called');
});

test('P5: a Proxy record or nested Proxy is rejected before any trap runs', async () => {
  const raw = await exampleRecord();
  let traps = 0;
  const handler = {};
  for (const trap of ['get', 'has', 'ownKeys', 'getOwnPropertyDescriptor', 'getPrototypeOf']) {
    handler[trap] = (...args) => {
      traps += 1;
      if (trap === 'get' && args[1] === 'admission_id' && traps > 1) return HOSTILE_ID;
      return Reflect[trap](...args);
    };
  }
  assert.throws(() => validateLocalAdmissionRecord(new Proxy(raw, handler), { now: NOW }), isPlainDataRejection);
  const nested = structuredClone(raw);
  nested.review = new Proxy(nested.review, handler);
  assert.throws(() => validateLocalAdmissionRecord(nested, { now: NOW }), isPlainDataRejection);
  assert.equal(traps, 0);
});

test('P5: counting sweep - a getter or Proxy at every slot is rejected with zero caller reads', async () => {
  const raw = await exampleRecord();
  const slots = allSlots(raw);
  assert.equal(slots.length, 38, "sweep covers every slot of the example record");
  let reads = 0;
  for (const [path, key] of slots) {
    const record = structuredClone(raw);
    const container = at(record, path);
    const original = container[key];
    Object.defineProperty(container, key, { enumerable: true, configurable: true, get() { reads += 1; return original; } });
    assert.throws(() => validateLocalAdmissionRecord(record, { now: NOW }), isPlainDataRejection, [...path, key].join('.'));
    if (original !== null && typeof original === 'object') {
      const proxied = structuredClone(raw);
      at(proxied, path)[key] = new Proxy(structuredClone(original), {
        get(target, property, receiver) { reads += 1; return Reflect.get(target, property, receiver); },
        ownKeys(target) { reads += 1; return Reflect.ownKeys(target); },
        getOwnPropertyDescriptor(target, property) { reads += 1; return Reflect.getOwnPropertyDescriptor(target, property); }
      });
      assert.throws(() => validateLocalAdmissionRecord(proxied, { now: NOW }), isPlainDataRejection, [...path, key].join('.'));
    }
  }
  assert.equal(reads, 0, 'no caller getter or trap ran anywhere');
});

test('P5: changing the caller record after the call cannot change the frozen result', async () => {
  const raw = await exampleRecord();
  const result = validateLocalAdmissionRecord(raw, { now: NOW });
  raw.admission_id = HOSTILE_ID;
  raw.target_instance_id = HOSTILE_ID;
  raw.review.quarantine_scan_passed = false;
  assert.equal(result.admission_id, 'admission:institution-alpha-enclave-001');
  assert.equal(result.target_instance_id, 'instance:alpha-airgap-01');
  assert.equal(result.checks.quarantine_scan_passed, true);
  assert.ok(Object.isFrozen(result) && Object.isFrozen(result.checks));
});

test('P5: options are read once as own data; getters, Proxies and lying Dates cannot steer now', async () => {
  const raw = await exampleRecord();
  const expired = new Date(raw.expires_at);
  let reads = 0;
  const getterOptions = {};
  Object.defineProperty(getterOptions, 'now', { enumerable: true, get() { reads += 1; return reads === 1 ? NOW : expired; } });
  assert.throws(() => validateLocalAdmissionRecord(raw, getterOptions), /options\.now must be a data property/);
  const proxyOptions = new Proxy({ now: NOW }, { get() { reads += 1; return NOW; } });
  assert.throws(() => validateLocalAdmissionRecord(raw, proxyOptions), /local admission options must be an object/);
  assert.throws(() => validateLocalAdmissionRecord(raw, Object.create({ now: NOW })), /options must be a plain object/);
  for (const options of [null, 'x', 5, [NOW]]) {
    assert.throws(() => validateLocalAdmissionRecord(raw, options), /local admission options must be an object/, String(options));
  }
  assert.equal(reads, 0);
  // A Date whose own valueOf/getTime lie is read through the intrinsic Date.prototype.getTime.
  const lyingDate = new Date(NOW);
  lyingDate.valueOf = () => { reads += 1; return expired.valueOf(); };
  lyingDate.getTime = () => { reads += 1; return expired.valueOf(); };
  assert.equal(validateLocalAdmissionRecord(raw, { now: lyingDate }).valid, true);
  assert.equal(reads, 0);
  // Non-Date objects, bigint and symbol are 'now is invalid', never a raw TypeError or caller code.
  for (const now of [{ valueOf() { reads += 1; return NOW.valueOf(); } }, 1n, Symbol('now'), () => NOW]) {
    assert.throws(() => validateLocalAdmissionRecord(raw, { now }), error => error instanceof ValidationError && /now is invalid/.test(error.message));
  }
  assert.equal(reads, 0);
});

test('P5 controls: plain, JSON, structuredClone and null-prototype records give identical results', async () => {
  const raw = await exampleRecord();
  const expected = validateLocalAdmissionRecord(raw, { now: NOW });
  const nullPrototype = value => {
    if (Array.isArray(value)) return value.map(nullPrototype);
    if (value === null || typeof value !== 'object') return value;
    return Object.assign(Object.create(null), Object.fromEntries(Object.entries(value).map(([k, v]) => [k, nullPrototype(v)])));
  };
  for (const [name, record] of Object.entries({
    json: JSON.parse(JSON.stringify(raw)),
    structuredClone: structuredClone(raw),
    nullPrototype: nullPrototype(raw),
    frozen: Object.freeze(structuredClone(raw))
  })) {
    assert.deepEqual(validateLocalAdmissionRecord(record, { now: NOW }), expected, name);
  }
  // now as a Date, an ISO string, epoch milliseconds or a null-prototype options record agree.
  for (const now of [NOW, NOW.toISOString(), NOW.valueOf()]) {
    assert.deepEqual(validateLocalAdmissionRecord(raw, { now }), expected, String(now));
  }
  assert.deepEqual(validateLocalAdmissionRecord(raw, Object.assign(Object.create(null), { now: NOW })), expected);
  // Omitted options and an omitted now still default to the current time.
  assert.equal(validateLocalAdmissionRecord(raw).admission_id, expected.admission_id);
  assert.equal(validateLocalAdmissionRecord(raw, {}).admission_id, expected.admission_id);
  assert.equal(validateLocalAdmissionRecord(raw, { now: undefined }).admission_id, expected.admission_id);
});

test('fail-closed controls: missing authority or review evidence, expiry and conflicting or malformed ids stay rejected', async () => {
  const raw = await exampleRecord();
  const mutate = change => { const record = structuredClone(raw); change(record); return record; };
  const rejects = [
    [record => { delete record.authority_source; }, /missing required field authority_source/],
    [record => { record.authority_source.authority_evidence_digest = 'x'; }, /authority_evidence_digest/],
    [record => { record.review.review_evidence_digests = []; }, /requires review evidence/],
    [record => { record.review.reviewer_ids = []; }, /requires reviewer_ids/],
    [record => { record.review.quarantine_scan_passed = false; }, /quarantine scan must pass/],
    [record => { record.rejected_artifact_digests = [...record.approved_artifact_digests]; }, /both approved and rejected/],
    [record => { record.admission_id = HOSTILE_ID; }, /admission_id has an invalid format/],
    [record => { record.target_instance_id = '../escape'; }, /target_instance_id has an invalid format/],
    [record => { record.target_instance_id = ''; }, /target_instance_id must contain/]
  ];
  for (const [change, message] of rejects) {
    assert.throws(() => validateLocalAdmissionRecord(mutate(change), { now: NOW }), error => error instanceof ValidationError && message.test(error.message), String(message));
  }
  // Expired and not-yet-effective admissions are reported as not valid.
  const expired = validateLocalAdmissionRecord(raw, { now: new Date('2026-09-09T00:00:00.000Z') });
  assert.equal(expired.valid, false);
  assert.equal(expired.checks.not_expired, false);
  const early = validateLocalAdmissionRecord(raw, { now: new Date('2026-09-01T12:00:00.000Z') });
  assert.equal(early.valid, false);
  assert.equal(early.checks.effective, false);
});
