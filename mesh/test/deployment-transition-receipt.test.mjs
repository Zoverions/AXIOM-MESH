import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { validateDeploymentTransitionReceipt } from '../src/lib/deployment-transition-receipt.mjs';

const activationUrl = new URL('../../agent-commons/examples/deployment-activation-receipt.v1.json', import.meta.url);
const rollbackUrl = new URL('../../agent-commons/examples/deployment-rollback-receipt.v1.json', import.meta.url);

async function activationReceipt() {
  return JSON.parse(await readFile(activationUrl, 'utf8'));
}

async function rollbackReceipt() {
  return JSON.parse(await readFile(rollbackUrl, 'utf8'));
}

test('activation is exact, fresh, and evidence-only', async () => {
  const receipt = await activationReceipt();
  const result = validateDeploymentTransitionReceipt(receipt);
  assert.equal(result.valid, true);
  assert.equal(result.transition, 'staging->active');
  assert.equal(result.runtime_state, 'active');
  assert.equal(result.receipt_effect, 'evidence_only');
  assert.equal(result.authority_effect, 'none');
});

test('preauthorized fail-safe can reduce risk without fresh online authority', async () => {
  const receipt = await rollbackReceipt();
  const result = validateDeploymentTransitionReceipt(receipt);
  assert.equal(result.valid, true);
  assert.equal(result.transition, 'active->rolled_back');
  assert.equal(result.risk_reducing_transition, true);
});

test('preauthorized fail-safe cannot activate or resume', async () => {
  const receipt = await activationReceipt();
  receipt.transition_authority.mode = 'preauthorized_fail_safe';
  receipt.transition_authority.fresh_at_transition = false;
  assert.throws(
    () => validateDeploymentTransitionReceipt(receipt),
    /fresh authority|may only reduce/
  );
});

test('offline activation fails when required external currentness is unsatisfied', async () => {
  const receipt = await activationReceipt();
  receipt.offline_context.offline = true;
  receipt.offline_context.external_currentness_satisfied = false;
  assert.throws(
    () => validateDeploymentTransitionReceipt(receipt),
    /external currentness/
  );
});

test('effect-increasing transition requires rollback availability', async () => {
  const receipt = await activationReceipt();
  receipt.rollback.available = false;
  assert.throws(
    () => validateDeploymentTransitionReceipt(receipt),
    /rollback must be available/
  );
});

test('transition authority mode must be one of the supported modes', async () => {
  const receipt = await activationReceipt();
  receipt.transition_authority.mode = 'fresh_effect_admisson';
  assert.throws(
    () => validateDeploymentTransitionReceipt(receipt),
    /transition_authority\.mode|authority mode/
  );
});

test('rollback availability must be boolean even for risk-reducing transitions', async () => {
  const receipt = await rollbackReceipt();
  receipt.rollback.available = 'yes';
  assert.throws(
    () => validateDeploymentTransitionReceipt(receipt),
    /rollback\.available.*boolean/
  );
});

test('effect-increasing transition fails whenever required external currentness is unsatisfied', async () => {
  const receipt = await activationReceipt();
  receipt.offline_context.offline = false;
  receipt.offline_context.external_currentness_satisfied = false;
  assert.throws(
    () => validateDeploymentTransitionReceipt(receipt),
    /external currentness/
  );
});
