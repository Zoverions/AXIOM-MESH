import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const policyUrl = new URL('../config/circle-lifecycle-grid-head.v0.json', import.meta.url);
const threatUrl = new URL('../config/circle-lifecycle-grid-head-threat-review.v0.json', import.meta.url);
const gridServerUrl = new URL('../src/grid/server.mjs', import.meta.url);
const hypervisorServerUrl = new URL('../src/hypervisor/server.mjs', import.meta.url);
const gatewayServerUrl = new URL('../src/gateway/server.mjs', import.meta.url);
const circleStoreUrl = new URL('../src/grid/circle-store.mjs', import.meta.url);
const circlePersistenceMigrationUrl = new URL('../src/grid/circle-persistence-migrations.mjs', import.meta.url);
const lifecycleMigrationUrl = new URL('../src/grid/circle-lifecycle-head-migrations.mjs', import.meta.url);

async function readJson(url) {
  return JSON.parse(await readFile(url, 'utf8'));
}

test('durable lifecycle heads remain internal state and cannot self-promote into a runtime route', async () => {
  const [policy, threat, gridServer, hypervisorServer, gatewayServer] = await Promise.all([
    readJson(policyUrl),
    readJson(threatUrl),
    readFile(gridServerUrl, 'utf8'),
    readFile(hypervisorServerUrl, 'utf8'),
    readFile(gatewayServerUrl, 'utf8')
  ]);

  assert.equal(policy.runtime_activation, false);
  assert.equal(policy.requirements.public_grid_route, false);
  assert.equal(policy.requirements.gateway_route, false);
  assert.equal(policy.requirements.hypervisor_runtime_route, false);
  assert.equal(policy.requirements.lifecycle_head_record_is_authorization_proof, false);
  assert.equal(policy.requirements.credential_possession_proved, false);
  assert.ok(threat.non_claims.includes('authorized-lifecycle-mutation-service'));
  assert.ok(threat.non_claims.includes('authorization-commit-atomicity'));

  for (const source of [gridServer, hypervisorServer, gatewayServer]) {
    assert.doesNotMatch(source, /circle-lifecycle-grid-head/);
    assert.doesNotMatch(source, /circle\.member\.lifecycle\.head\.recorded/);
    assert.doesNotMatch(source, /getCircleMemberLifecycleHead/);
  }
});

test('lifecycle-head integration stays inside CircleGridStore and preserves the parent migration namespace', async () => {
  const [circleStore, parentMigrations, lifecycleMigrations] = await Promise.all([
    readFile(circleStoreUrl, 'utf8'),
    readFile(circlePersistenceMigrationUrl, 'utf8'),
    readFile(lifecycleMigrationUrl, 'utf8')
  ]);

  assert.match(circleStore, /reconstructCircleMemberLifecycleGridHeadCandidate/);
  assert.match(circleStore, /circle_member_lifecycle_heads/);
  assert.match(circleStore, /getCircleMemberLifecycleHead/);
  assert.match(circleStore, /previous_grid_lifecycle_head_digest/);

  assert.match(parentMigrations, /durable-circle-head-projection/);
  assert.match(parentMigrations, /runCircleLifecycleHeadMigrations/);
  assert.doesNotMatch(parentMigrations, /version:\s*2/);
  assert.match(lifecycleMigrations, /circle_lifecycle_head_schema_migrations/);
  assert.match(lifecycleMigrations, /durable-circle-member-lifecycle-head-projection/);
  assert.match(lifecycleMigrations, /circle_member_lifecycle_heads_reject_noop/);
});

test('promotion blockers require atomic admission CAS rather than pre-checking lifecycle state', async () => {
  const threat = await readJson(threatUrl);
  const blockers = new Set(threat.promotion_blockers);
  assert.ok(blockers.has('circle-record-admission-compare-and-set-against-exact-current-lifecycle-heads'));
  assert.ok(blockers.has('atomic-or-serializable-lifecycle-head-check-with-circle-record-commit'));
  assert.ok(blockers.has('authorized-membership-and-credential-lifecycle-mutation-procedure'));
  assert.ok(blockers.has('credential-possession-proof-bound-to-lifecycle-mutation'));
});
