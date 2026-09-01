import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { rm } from 'node:fs/promises';
import test from 'node:test';

import {
  AGENT_READ_SYSTEM_FACTS_EFFECT_ADMISSION_MAX_LIFETIME_MS,
  AGENT_READ_SYSTEM_FACTS_EFFECT_ADMISSION_SCHEMA,
  AGENT_READ_SYSTEM_FACTS_ISOLATION_POLICY,
  AGENT_READ_SYSTEM_FACTS_ISOLATION_POLICY_DIGEST,
  createAgentReadSystemFactsEffectAdmission,
  verifyAgentReadSystemFactsEffectAdmission
} from '../src/lib/agent-read-system-facts-effect-admission.mjs';
import {
  READ_SYSTEM_FACTS_TEST_REVISION,
  consumeReadSystemFactsFixture,
  createReadSystemFactsFixture
} from './helpers/agent-read-system-facts-fixture.mjs';

const NOT_BEFORE = '2026-08-17T20:02:41.000Z';
const EXPIRES_AT = '2026-08-17T20:03:10.000Z';
const VERIFY_AT = '2026-08-17T20:02:50.000Z';

async function admittedFixture(t) {
  const fixture = createReadSystemFactsFixture();
  const { stateRoot, consumption } = await consumeReadSystemFactsFixture(fixture);
  t.after(() => rm(stateRoot, { recursive: true, force: true }));
  const admission = createAgentReadSystemFactsEffectAdmission({
    admissionId: 'admission.read-facts.1',
    issuerId: 'effect-admission.reviewed-lab',
    issuerPrivateKey: fixture.admissionIssuer.privateKey,
    revision: READ_SYSTEM_FACTS_TEST_REVISION,
    handoff: fixture.handoff,
    handoffEvidence: fixture.handoffEvidence,
    executorIdentityCredential: fixture.executor.credential,
    trustedExecutorIssuerPublicKey: fixture.issuer.publicKey,
    consumptionRecord: consumption.record,
    trustedConsumptionStorePublicKey: fixture.store.publicKey,
    notBefore: NOT_BEFORE,
    expiresAt: EXPIRES_AT
  });
  return { fixture, consumption, admission };
}

function verifyArgs({ fixture, consumption }, overrides = {}) {
  return {
    trustedIssuerPublicKey: fixture.admissionIssuer.publicKey,
    expectedRevision: READ_SYSTEM_FACTS_TEST_REVISION,
    now: VERIFY_AT,
    handoff: fixture.handoff,
    handoffEvidence: fixture.handoffEvidence,
    executorIdentityCredential: fixture.executor.credential,
    trustedExecutorIssuerPublicKey: fixture.issuer.publicKey,
    consumptionRecord: consumption.record,
    trustedConsumptionStorePublicKey: fixture.store.publicKey,
    ...overrides
  };
}

test('fixed admission binds exact consumed A4/A1 evidence and remains non-executing', async t => {
  const state = await admittedFixture(t);
  const verified = verifyAgentReadSystemFactsEffectAdmission(
    state.admission,
    verifyArgs(state)
  );

  assert.equal(verified.schema, AGENT_READ_SYSTEM_FACTS_EFFECT_ADMISSION_SCHEMA);
  assert.match(verified.admission_digest, /^[a-f0-9]{64}$/);
  const statement = verified.statement;
  assert.equal(statement.repository, 'Zoverions/AXIOM-MESH');
  assert.equal(statement.revision, READ_SYSTEM_FACTS_TEST_REVISION);
  assert.equal(statement.handoff_digest, state.fixture.handoff.handoff_digest);
  assert.equal(statement.consumption_record_digest, state.consumption.record_digest);
  assert.equal(statement.consumption_storage_key, state.consumption.storage_key);
  assert.equal(
    statement.currentness_set_digest,
    state.consumption.record.statement.currentness_set_digest
  );
  assert.equal(statement.isolation_policy_id, AGENT_READ_SYSTEM_FACTS_ISOLATION_POLICY.policy_id);
  assert.equal(statement.isolation_policy_revision, 1);
  assert.equal(statement.isolation_policy_digest, AGENT_READ_SYSTEM_FACTS_ISOLATION_POLICY_DIGEST);
  assert.equal(statement.fixed_operation_only, true);
  assert.equal(statement.consumption_record_required, true);
  assert.equal(statement.effect_boundary_currentness_recheck_required, true);
  assert.equal(statement.effect_already_executed, false);
  assert.equal(statement.general_executor_authority, false);
  assert.equal(statement.repository_code_execution_authority, false);
  assert.equal(statement.arbitrary_command_authority, false);
  assert.equal(statement.arbitrary_path_authority, false);
  assert.equal(statement.network_authority, false);
  assert.equal(statement.credential_authority, false);
  assert.equal(statement.secret_authority, false);
  assert.equal(statement.remote_hardware_authority, false);
  assert.equal(statement.production_authority, false);
  assert.equal(statement.deployment_authority, false);
  assert.equal(statement.capability_promotion_authority, false);
  assert.equal(statement.global_currentness_claimed, false);
  assert.equal(statement.task_success_claimed, false);
  assert.equal(statement.truth_claimed, false);
  assert.equal(statement.application_correctness_claimed, false);
  assert.equal(statement.authority_effect, 'none');
  assert.equal(statement.delegation_effect, 'none');
});

test('admission issuer and candidate revision substitution fail closed', async t => {
  const state = await admittedFixture(t);
  const wrongIssuer = generateKeyPairSync('ed25519');
  assert.throws(
    () => verifyAgentReadSystemFactsEffectAdmission(
      state.admission,
      verifyArgs(state, { trustedIssuerPublicKey: wrongIssuer.publicKey })
    ),
    /issuer key substitution|signature verification failed/
  );
  assert.throws(
    () => verifyAgentReadSystemFactsEffectAdmission(
      state.admission,
      verifyArgs(state, { expectedRevision: 'b'.repeat(40) })
    ),
    /revision mismatch/
  );
});

test('admission cannot substitute another consumed handoff or executor', async t => {
  const state = await admittedFixture(t);
  const other = createReadSystemFactsFixture();
  const otherConsumed = await consumeReadSystemFactsFixture(other);
  t.after(() => rm(otherConsumed.stateRoot, { recursive: true, force: true }));

  assert.throws(
    () => verifyAgentReadSystemFactsEffectAdmission(
      state.admission,
      verifyArgs(state, {
        consumptionRecord: otherConsumed.consumption.record,
        trustedConsumptionStorePublicKey: other.store.publicKey
      })
    ),
    /handoff digest mismatch|binding mismatch/
  );
  assert.throws(
    () => verifyAgentReadSystemFactsEffectAdmission(
      state.admission,
      verifyArgs(state, {
        executorIdentityCredential: other.executor.credential,
        trustedExecutorIssuerPublicKey: other.issuer.publicKey
      })
    ),
    /principal_id mismatch|does not match handoff intended executor identity/
  );
});

test('isolation policy and semantic claim elevation fail before signature trust', async t => {
  const state = await admittedFixture(t);

  const policySwap = structuredClone(state.admission);
  policySwap.statement.isolation_policy_digest = 'c'.repeat(64);
  assert.throws(
    () => verifyAgentReadSystemFactsEffectAdmission(policySwap, verifyArgs(state)),
    /isolation policy binding mismatch/
  );

  for (const [field, elevated] of [
    ['effect_already_executed', true],
    ['general_executor_authority', true],
    ['repository_code_execution_authority', true],
    ['arbitrary_command_authority', true],
    ['arbitrary_path_authority', true],
    ['network_authority', true],
    ['credential_authority', true],
    ['secret_authority', true],
    ['remote_hardware_authority', true],
    ['production_authority', true],
    ['deployment_authority', true],
    ['capability_promotion_authority', true],
    ['global_currentness_claimed', true],
    ['task_success_claimed', true],
    ['truth_claimed', true],
    ['application_correctness_claimed', true],
    ['authority_effect', 'grant']
  ]) {
    const tampered = structuredClone(state.admission);
    tampered.statement[field] = elevated;
    assert.throws(
      () => verifyAgentReadSystemFactsEffectAdmission(tampered, verifyArgs(state)),
      new RegExp(`${field} must remain`)
    );
  }
});

test('admission lifetime is short, inside A4 window and never begins before consumption boundary', async t => {
  const fixture = createReadSystemFactsFixture();
  const { stateRoot, consumption } = await consumeReadSystemFactsFixture(fixture);
  t.after(() => rm(stateRoot, { recursive: true, force: true }));

  const base = {
    admissionId: 'admission.read-facts.lifetime',
    issuerId: 'effect-admission.reviewed-lab',
    issuerPrivateKey: fixture.admissionIssuer.privateKey,
    revision: READ_SYSTEM_FACTS_TEST_REVISION,
    handoff: fixture.handoff,
    handoffEvidence: fixture.handoffEvidence,
    executorIdentityCredential: fixture.executor.credential,
    trustedExecutorIssuerPublicKey: fixture.issuer.publicKey,
    consumptionRecord: consumption.record,
    trustedConsumptionStorePublicKey: fixture.store.publicKey
  };

  assert.equal(AGENT_READ_SYSTEM_FACTS_EFFECT_ADMISSION_MAX_LIFETIME_MS, 60_000);
  assert.throws(
    () => createAgentReadSystemFactsEffectAdmission({
      ...base,
      notBefore: '2026-08-17T20:02:41.000Z',
      expiresAt: '2026-08-17T20:03:42.000Z'
    }),
    /lifetime exceeds sixty-second ceiling/
  );
  assert.throws(
    () => createAgentReadSystemFactsEffectAdmission({
      ...base,
      notBefore: '2026-08-17T20:01:59.000Z',
      expiresAt: '2026-08-17T20:02:20.000Z'
    }),
    /inside handoff window|cannot begin before durable consumption/
  );
  assert.throws(
    () => createAgentReadSystemFactsEffectAdmission({
      ...base,
      notBefore: '2026-08-17T20:05:40.000Z',
      expiresAt: '2026-08-17T20:06:01.000Z'
    }),
    /inside handoff window/
  );
});

test('verification time is independently checked against admission active window', async t => {
  const state = await admittedFixture(t);
  assert.throws(
    () => verifyAgentReadSystemFactsEffectAdmission(
      state.admission,
      verifyArgs(state, { now: '2026-08-17T20:02:40.000Z' })
    ),
    /not yet active/
  );
  assert.throws(
    () => verifyAgentReadSystemFactsEffectAdmission(
      state.admission,
      verifyArgs(state, { now: EXPIRES_AT })
    ),
    /expired/
  );
});

test('unknown fields and admission digest tamper fail closed', async t => {
  const state = await admittedFixture(t);
  const unknown = structuredClone(state.admission);
  unknown.statement.shell = '/bin/sh';
  assert.throws(
    () => verifyAgentReadSystemFactsEffectAdmission(unknown, verifyArgs(state)),
    /unsupported field shell/
  );

  const digestTamper = structuredClone(state.admission);
  digestTamper.admission_digest = 'd'.repeat(64);
  assert.throws(
    () => verifyAgentReadSystemFactsEffectAdmission(digestTamper, verifyArgs(state)),
    /admission digest mismatch/
  );
});
