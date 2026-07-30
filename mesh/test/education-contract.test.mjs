import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  EDUCATION_CONTRACT_ID,
  EDUCATION_CONTRACT_PATH,
  EDUCATION_CONTRACT_SHA256,
  EDUCATION_CONTRACT_VERSION,
  loadEducationContract,
  validateEducationContract,
  validateEducationIntent,
  validateEducationPolicy
} from '../src/domain/education-contract.mjs';
import { checkEducationContract } from '../src/check-education-contract.mjs';

const POLICY_PATH = fileURLToPath(new URL('../config/policy.json', import.meta.url));
const DIGEST = 'a'.repeat(64);

async function loadPolicy() {
  return JSON.parse(await readFile(POLICY_PATH, 'utf8'));
}

function contractFields() {
  return {
    contract_id: EDUCATION_CONTRACT_ID,
    contract_version: EDUCATION_CONTRACT_VERSION,
    contract_sha256: EDUCATION_CONTRACT_SHA256
  };
}

test('education contract is pinned, strict-consent, and install-without-authority', async () => {
  const contract = await loadEducationContract();
  assert.equal(contract.install_grants_authority, false);
  assert.equal(contract.minor_data_defaults.data_minimization, true);
  assert.equal(contract.minor_data_defaults.advertising, false);
  assert.equal(contract.minor_data_defaults.behavioural_targeting, false);
  assert.equal(contract.minor_data_defaults.covert_attention_or_emotion_monitoring, false);
  assert.equal(contract.minor_data_defaults.diagnosis_inference, false);
  assert.equal(contract.minor_data_defaults.human_review_and_appeal, true);
  for (const definition of Object.values(contract.actions)) {
    if (definition.consent.required) {
      assert.ok(definition.required_input.includes('subject_id'));
      assert.ok(definition.required_input.includes('consent_id'));
      assert.ok(definition.required_input.includes('purpose'));
      assert.ok(definition.consent.data_scopes.length > 0);
    }
    if (definition.risk === 'high' || definition.risk === 'critical') {
      assert.equal(definition.approval.confirmation, true);
      assert.equal(definition.approval.independent, true);
    }
  }
});

test('education contract rejects digest drift and authority expansion', async () => {
  const raw = await readFile(EDUCATION_CONTRACT_PATH);
  const contract = JSON.parse(raw);
  assert.throws(
    () => validateEducationContract({ ...contract, install_grants_authority: true }),
    /install must not grant authority/
  );
  const tampered = Buffer.from(raw);
  tampered[tampered.length - 2] ^= 1;
  assert.throws(
    () => validateEducationContract(contract, { rawBytes: tampered }),
    /digest/
  );
});

test('every education action is explicitly capability unavailable in the kernel policy', async () => {
  const [contract, policy] = await Promise.all([loadEducationContract(), loadPolicy()]);
  assert.equal(validateEducationPolicy(contract, policy), true);
  for (const [actionName, definition] of Object.entries(contract.actions)) {
    const rule = policy.actions[actionName];
    assert.equal(rule.decision, 'deny');
    assert.equal(rule.risk, definition.risk);
    assert.deepEqual(rule.required_scopes, definition.required_scopes);
    assert.equal(rule.code, 'capability_unavailable');
    assert.equal(rule.http_status, 503);
    assert.equal(rule.tool, undefined);
  }
});

test('curriculum query validates bounded contract input', async () => {
  const contract = await loadEducationContract();
  assert.equal(validateEducationIntent(contract, 'education.curriculum.query', {
    ...contractFields(),
    active_pack_manifest_sha256: DIGEST,
    course_code: 'MTH1W',
    query: 'linear relations',
    limit: 20
  }), true);
  assert.throws(
    () => validateEducationIntent(contract, 'education.curriculum.query', {
      ...contractFields(),
      active_pack_manifest_sha256: DIGEST,
      course_code: 'MTH1W',
      limit: 51
    }),
    /limit/
  );
  assert.throws(
    () => validateEducationIntent(contract, 'education.curriculum.query', {
      ...contractFields(),
      active_pack_manifest_sha256: DIGEST,
      course_code: 'MTH1W',
      ambient_filesystem_path: '/tmp/unsafe'
    }),
    /unknown field/
  );
});

test('learner and tutor intents require exact consent purpose and pinned contract', async () => {
  const contract = await loadEducationContract();
  const tutor = {
    ...contractFields(),
    subject_id: 'learner:test',
    consent_id: 'consent:test',
    purpose: 'personalized-local-tutoring',
    active_pack_manifest_sha256: DIGEST,
    expectation_ids: ['MTH1W-A1'],
    prompt: 'Explain this relationship without giving the final answer.',
    max_output_tokens: 256,
    deadline_ms: 10_000
  };
  assert.equal(validateEducationIntent(contract, 'education.tutor.respond', tutor), true);
  assert.throws(
    () => validateEducationIntent(contract, 'education.tutor.respond', {
      ...tutor,
      purpose: 'advertising'
    }),
    /purpose/
  );
  assert.throws(
    () => validateEducationIntent(contract, 'education.tutor.respond', {
      ...tutor,
      contract_sha256: 'b'.repeat(64)
    }),
    /contract_sha256/
  );
});

test('education conformance command reports adapter unavailable rather than implemented', async () => {
  const result = await checkEducationContract();
  assert.deepEqual(result, {
    valid: true,
    contract_id: EDUCATION_CONTRACT_ID,
    contract_version: EDUCATION_CONTRACT_VERSION,
    contract_sha256: EDUCATION_CONTRACT_SHA256,
    action_count: 8,
    runtime_state: 'capability_unavailable'
  });
});
