import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { digestObject } from '../src/lib/canonical.mjs';
import {
  CIRCLE_CHARTER_SCHEMA,
  CIRCLE_CORE_PACKAGE_SCHEMA,
  CIRCLE_SCHEMA
} from '../src/lib/circle-core.mjs';
import {
  resolveCircleCharterAt,
  validateCircleCharterLifecycle,
  validateCircleCharterLifecyclePolicy
} from '../../packages/axiom-circle-charter-lifecycle/index.mjs';

const policyUrl = new URL('../config/circle-charter-lifecycle.v0.json', import.meta.url);

async function loadPolicy() {
  return JSON.parse(await readFile(policyUrl, 'utf8'));
}

function circleDescriptor() {
  return {
    schema: CIRCLE_SCHEMA,
    circle_id: 'circle.charter.history',
    name: 'Charter History Circle',
    purpose: 'Exercise append-only activated charter history without runtime authority.',
    created_by: 'human.alpha',
    created_at: '2026-08-20T11:50:00.000Z',
    trust_anchor_id: 'anchor.charter.history',
    participation_model: 'voluntary',
    member_state_ownership: 'independent-node',
    policy_floor: 'raise-only',
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  };
}

function charterV1() {
  return {
    schema: CIRCLE_CHARTER_SCHEMA,
    circle_id: 'circle.charter.history',
    version: 1,
    effective_from: '2026-08-20T12:00:00.000Z',
    supersedes_digest: null,
    roles: [{
      role_id: 'member',
      label: 'Member',
      declared_modes: ['observe', 'deliberate', 'vote'],
      execution_authority: false
    }],
    decision_rule: {
      quorum_basis_points: 5000,
      approval_basis_points: 6000,
      abstention_counts_toward_quorum: true
    },
    appeal_enabled: true,
    member_exit_enabled: true,
    execution_authority: false,
    authority_effect: 'none'
  };
}

function charterV2() {
  const first = charterV1();
  return {
    schema: CIRCLE_CHARTER_SCHEMA,
    circle_id: 'circle.charter.history',
    version: 2,
    effective_from: '2026-08-20T13:00:00.000Z',
    supersedes_digest: digestObject(first),
    roles: [
      ...first.roles,
      {
        role_id: 'reviewer',
        label: 'Reviewer',
        declared_modes: ['observe', 'review', 'appeal'],
        execution_authority: false
      }
    ],
    decision_rule: {
      quorum_basis_points: 6000,
      approval_basis_points: 6500,
      abstention_counts_toward_quorum: true
    },
    appeal_enabled: true,
    member_exit_enabled: true,
    execution_authority: false,
    authority_effect: 'none'
  };
}

function circlePackage(currentCharter = charterV2()) {
  return {
    schema: CIRCLE_CORE_PACKAGE_SCHEMA,
    version: 0,
    status: 'inert-contract-laboratory',
    circle: circleDescriptor(),
    charter: currentCharter,
    invitations: [],
    memberships: [],
    proposals: [],
    tasks: [],
    decisions: [],
    appeals: [],
    exits: [],
    exports: [],
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  };
}

function entry(charter, recordedAt, evidenceRef) {
  const charterDigest = digestObject(charter);
  return {
    schema: 'axiom-circle-charter-history-entry.v0',
    circle_id: 'circle.charter.history',
    charter,
    charter_digest: charterDigest,
    recorded_at: recordedAt,
    activation: {
      schema: 'axiom-circle-charter-activation.v0',
      circle_id: 'circle.charter.history',
      charter_digest: charterDigest,
      basis_charter_digest: charter.supersedes_digest,
      activated_at: charter.effective_from,
      evidence_refs: [evidenceRef],
      creates_runtime_authority: false,
      authority_effect: 'none',
      network_effect: 'none'
    },
    authority_effect: 'none',
    network_effect: 'none'
  };
}

function lifecycleFixture() {
  const first = charterV1();
  const second = charterV2();
  return {
    schema: 'axiom-circle-charter-lifecycle.v0',
    circle_id: 'circle.charter.history',
    entries: [
      entry(first, '2026-08-20T11:59:00.000Z', 'evidence:charter:genesis'),
      entry(second, '2026-08-20T12:50:00.000Z', 'evidence:charter:amendment:2')
    ],
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  };
}

const VALIDATION_NOW = new Date('2026-08-20T15:00:00.000Z');

test('Circle charter lifecycle policy is inert, append-only, and non-authorizing', async () => {
  const policy = await loadPolicy();
  assert.equal(validateCircleCharterLifecyclePolicy(policy), true);
  assert.equal(policy.runtime_activation, false);
  assert.equal(policy.requirements.activated_entries_only, true);
  assert.equal(policy.requirements.current_circle_charter_must_equal_active_head, true);
  assert.equal(policy.requirements.strict_effective_chronology, true);
  assert.equal(policy.requirements.historical_rules_rewritten, false);
  assert.equal(policy.requirements.charter_history_may_mint_runtime_authority, false);
  assert.equal(policy.output.runtime_authority, false);
  assert.equal(policy.output.portable_authority, false);
});

test('valid activated history binds exact digests and current Circle charter head', async () => {
  const policy = await loadPolicy();
  const circle = circlePackage();
  const lifecycle = lifecycleFixture();
  const result = validateCircleCharterLifecycle(policy, circle, lifecycle, { now: VALIDATION_NOW });
  assert.equal(result.valid, true);
  assert.equal(result.circle_id, 'circle.charter.history');
  assert.equal(result.charter_count, 2);
  assert.equal(result.active_charter_version, 2);
  assert.equal(result.active_charter_digest, digestObject(charterV2()));
  assert.equal(result.policy_digest, digestObject(policy));
  assert.equal(result.circle_package_digest, digestObject(circle));
  assert.equal(result.lifecycle_digest, digestObject(lifecycle));
  assert.equal(result.runtime_authority, false);
  assert.equal(result.portable_authority, false);
});

test('historical resolution returns the charter active at the requested past timestamp', async () => {
  const policy = await loadPolicy();
  const circle = circlePackage();
  const lifecycle = lifecycleFixture();

  const first = resolveCircleCharterAt(policy, circle, lifecycle, {
    at: '2026-08-20T12:30:00.000Z',
    now: VALIDATION_NOW
  });
  assert.equal(first.schema, 'axiom-circle-charter-resolution.v0');
  assert.equal(first.charter_version, 1);
  assert.equal(first.charter_digest, digestObject(charterV1()));
  assert.equal(first.historical_resolution_is_local_derivation, true);
  assert.equal(first.runtime_authority, false);

  const second = resolveCircleCharterAt(policy, circle, lifecycle, {
    at: '2026-08-20T13:30:00.000Z',
    now: VALIDATION_NOW
  });
  assert.equal(second.charter_version, 2);
  assert.equal(second.charter_digest, digestObject(charterV2()));
});

test('historical resolution refuses times before genesis or after validation now', async () => {
  const policy = await loadPolicy();
  const circle = circlePackage();
  const lifecycle = lifecycleFixture();

  assert.throws(
    () => resolveCircleCharterAt(policy, circle, lifecycle, {
      at: '2026-08-20T11:59:59.000Z',
      now: VALIDATION_NOW
    }),
    /No Circle charter was active/
  );
  assert.throws(
    () => resolveCircleCharterAt(policy, circle, lifecycle, {
      at: '2026-08-20T15:00:01.000Z',
      now: VALIDATION_NOW
    }),
    /cannot project into the future/
  );
});

test('charter lifecycle rejects digest substitution and broken supersedes chains', async () => {
  const policy = await loadPolicy();
  const circle = circlePackage();

  const digestSwap = lifecycleFixture();
  digestSwap.entries[1].charter_digest = 'f'.repeat(64);
  digestSwap.entries[1].activation.charter_digest = 'f'.repeat(64);
  assert.throws(
    () => validateCircleCharterLifecycle(policy, circle, digestSwap, { now: VALIDATION_NOW }),
    /digest does not match charter/
  );

  const brokenChain = lifecycleFixture();
  brokenChain.entries[1].charter.supersedes_digest = 'e'.repeat(64);
  brokenChain.entries[1].charter_digest = digestObject(brokenChain.entries[1].charter);
  brokenChain.entries[1].activation.charter_digest = brokenChain.entries[1].charter_digest;
  brokenChain.entries[1].activation.basis_charter_digest = 'e'.repeat(64);
  assert.throws(
    () => validateCircleCharterLifecycle(policy, circle, brokenChain, { now: VALIDATION_NOW }),
    /supersedes chain is invalid/
  );
});

test('charter lifecycle rejects skipped versions and non-increasing effective chronology', async () => {
  const policy = await loadPolicy();
  const circle = circlePackage();

  const skipped = lifecycleFixture();
  skipped.entries[1].charter.version = 3;
  skipped.entries[1].charter_digest = digestObject(skipped.entries[1].charter);
  skipped.entries[1].activation.charter_digest = skipped.entries[1].charter_digest;
  assert.throws(
    () => validateCircleCharterLifecycle(policy, circle, skipped, { now: VALIDATION_NOW }),
    /versions must be contiguous from one/
  );

  const nonIncreasing = lifecycleFixture();
  nonIncreasing.entries[1].charter.effective_from = '2026-08-20T12:00:00.000Z';
  nonIncreasing.entries[1].activation.activated_at = '2026-08-20T12:00:00.000Z';
  nonIncreasing.entries[1].charter_digest = digestObject(nonIncreasing.entries[1].charter);
  nonIncreasing.entries[1].activation.charter_digest = nonIncreasing.entries[1].charter_digest;
  assert.throws(
    () => validateCircleCharterLifecycle(policy, circle, nonIncreasing, { now: VALIDATION_NOW }),
    /effective times must strictly increase/
  );
});

test('charter lifecycle rejects retroactive recording and future activation', async () => {
  const policy = await loadPolicy();
  const circle = circlePackage();

  const retroactive = lifecycleFixture();
  retroactive.entries[1].recorded_at = '2026-08-20T13:00:01.000Z';
  assert.throws(
    () => validateCircleCharterLifecycle(policy, circle, retroactive, { now: VALIDATION_NOW }),
    /cannot be recorded retroactively/
  );

  const future = lifecycleFixture();
  future.entries[1].charter.effective_from = '2026-08-20T15:00:01.000Z';
  future.entries[1].activation.activated_at = '2026-08-20T15:00:01.000Z';
  future.entries[1].charter_digest = digestObject(future.entries[1].charter);
  future.entries[1].activation.charter_digest = future.entries[1].charter_digest;
  assert.throws(
    () => validateCircleCharterLifecycle(policy, circle, future, { now: VALIDATION_NOW }),
    /contains a future activation/
  );
});

test('current Circle package must equal the final activated charter head', async () => {
  const policy = await loadPolicy();
  const lifecycle = lifecycleFixture();
  assert.throws(
    () => validateCircleCharterLifecycle(policy, circlePackage(charterV1()), lifecycle, {
      now: VALIDATION_NOW
    }),
    /does not equal the activated lifecycle head/
  );
});

test('activation evidence cannot mint authority and must remain explicit', async () => {
  const policy = await loadPolicy();
  const circle = circlePackage();

  const authority = lifecycleFixture();
  authority.entries[1].activation.creates_runtime_authority = true;
  assert.throws(
    () => validateCircleCharterLifecycle(policy, circle, authority, { now: VALIDATION_NOW }),
    /activation record is invalid/
  );

  const noEvidence = lifecycleFixture();
  noEvidence.entries[1].activation.evidence_refs = [];
  assert.throws(
    () => validateCircleCharterLifecycle(policy, circle, noEvidence, { now: VALIDATION_NOW }),
    /evidence_refs are invalid/
  );
});

test('historical charter snapshots retain Circle Core role non-execution boundary', async () => {
  const policy = await loadPolicy();
  const circle = circlePackage();
  const lifecycle = lifecycleFixture();
  lifecycle.entries[0].charter.roles[0].execution_authority = true;
  lifecycle.entries[0].charter_digest = digestObject(lifecycle.entries[0].charter);
  lifecycle.entries[0].activation.charter_digest = lifecycle.entries[0].charter_digest;
  assert.throws(
    () => validateCircleCharterLifecycle(policy, circle, lifecycle, { now: VALIDATION_NOW }),
    /Circle role is invalid/
  );
});
