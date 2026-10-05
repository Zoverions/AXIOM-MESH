import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { validateAgentTestCapacityOffer } from '../src/lib/agent-test-capacity-offer.mjs';

const EXAMPLE_URL = new URL('../../agent-commons/test-capacity-offer.example.json', import.meta.url);
const SCHEMA_URL = new URL(
  '../../agent-commons/contracts/agent-test-capacity-offer.v1.schema.json',
  import.meta.url
);
const IMPLEMENTATION_URL = new URL('../src/lib/agent-test-capacity-offer.mjs', import.meta.url);

async function example() {
  return JSON.parse(await readFile(EXAMPLE_URL, 'utf8'));
}

function clone(value) {
  return structuredClone(value);
}

test('Agent Commons test-capacity example validates as operator-run discovery metadata only', async () => {
  const result = validateAgentTestCapacityOffer(await example());
  assert.equal(result.valid, true);
  assert.equal(result.schema, 'axiom-agent-test-capacity-offer.v1');
  assert.equal(result.record_status, 'example');
  assert.equal(result.execution_mode, 'operator-run-only');
  assert.equal(result.evidence_return_contract, 'agent-readiness/CONTRIBUTION-RESULT.schema.json');
  assert.equal(result.authority_effect, 'none');
  assert.equal(result.remote_access_granted, false);
  assert.equal(result.node_admission_granted, false);
});

test('test-capacity offer rejects remote execution, node admission, custody, spending, and compensation elevation', async () => {
  const base = await example();
  for (const field of [
    'offer_authorizes_execution',
    'remote_access_granted',
    'remote_session_created',
    'node_admission_granted',
    'runtime_authority_granted',
    'credential_authority_granted',
    'spending_authority_granted',
    'hardware_custody_granted',
    'production_promotion_granted',
    'capability_promotion_granted',
    'destructive_actions_allowed',
    'firmware_changes_allowed',
    'purchases_allowed',
    'compensation_committed'
  ]) {
    const elevated = clone(base);
    elevated.authority_nonclaims[field] = true;
    assert.throws(
      () => validateAgentTestCapacityOffer(elevated),
      new RegExp(field)
    );
  }
});

test('test-capacity offer remains operator-run and requires separate operator confirmation', async () => {
  const base = await example();
  const remote = clone(base);
  remote.execution_mode = 'remote-session';
  assert.throws(
    () => validateAgentTestCapacityOffer(remote),
    /cannot create remote or delegated execution/
  );

  const implicit = clone(base);
  implicit.availability.operator_confirmation_required = false;
  assert.throws(
    () => validateAgentTestCapacityOffer(implicit),
    /availability boundary is invalid/
  );
});

test('test-capacity offer accepts only Community Testnet T0-T5 lanes and authorized environment classes', async () => {
  const base = await example();
  const lane = clone(base);
  lane.testnet_lanes = ['T0', 'REMOTE-EXEC'];
  assert.throws(
    () => validateAgentTestCapacityOffer(lane),
    /invalid or duplicate lane/
  );

  const ownership = clone(base);
  ownership.environment.ownership = 'third-party-unapproved';
  assert.throws(
    () => validateAgentTestCapacityOffer(ownership),
    /environment ownership is invalid/
  );
});

test('test-capacity offer rejects invalid availability and alternate result envelopes', async () => {
  const base = await example();
  const chronology = clone(base);
  chronology.availability.expires_at = chronology.availability.starts_at;
  assert.throws(
    () => validateAgentTestCapacityOffer(chronology),
    /expiry must follow start/
  );

  const result = clone(base);
  result.evidence_return_contract = 'agent-commons/contracts/agent-infrastructure-result.v1.schema.json';
  assert.throws(
    () => validateAgentTestCapacityOffer(result),
    /evidence return contract is invalid/
  );
});

test('test-capacity offer fails closed on unknown fields and does not borrow node-admission vocabulary', async () => {
  const base = await example();
  const injected = clone(base);
  injected.node_admission_ref = 'node_fake';
  assert.throws(
    () => validateAgentTestCapacityOffer(injected),
    /unsupported field node_admission_ref/
  );

  const schema = JSON.parse(await readFile(SCHEMA_URL, 'utf8'));
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.execution_mode.const, 'operator-run-only');
  assert.equal(
    schema.properties.evidence_return_contract.const,
    'agent-readiness/CONTRIBUTION-RESULT.schema.json'
  );
  assert.equal(JSON.stringify(schema).includes('compute-node-profile'), false);
  assert.equal(JSON.stringify(schema).includes('node_admission_ref'), false);
});

test('test-capacity validator is effect-inert and imports no process, filesystem, network, or service executor', async () => {
  const source = await readFile(IMPLEMENTATION_URL, 'utf8');
  for (const forbidden of [
    "node:child_process",
    "node:fs",
    "node:net",
    "node:http",
    "node:https",
    "node:dgram",
    "node:tls"
  ]) {
    assert.equal(source.includes(forbidden), false, `validator must not import ${forbidden}`);
  }
});
