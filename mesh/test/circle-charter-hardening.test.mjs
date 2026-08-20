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
  validateCircleCharterLifecycle
} from '../../packages/axiom-circle-charter-lifecycle/index.mjs';

const policyUrl = new URL('../config/circle-charter-lifecycle.v0.json', import.meta.url);

async function loadPolicy() {
  return JSON.parse(await readFile(policyUrl, 'utf8'));
}

function circleDescriptor() {
  return {
    schema: CIRCLE_SCHEMA,
    circle_id: 'circle.charter.hardening',
    name: 'Charter Hardening Circle',
    purpose: 'Exercise Circle creation chronology and immutable historical resolution.',
    created_by: 'human.alpha',
    created_at: '2026-08-20T12:00:00.000Z',
    trust_anchor_id: 'anchor.charter.hardening',
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
    circle_id: 'circle.charter.hardening',
    version: 1,
    effective_from: '2026-08-20T12:05:00.000Z',
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
    circle_id: 'circle.charter.hardening',
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

function circlePackage() {
  return {
    schema: CIRCLE_CORE_PACKAGE_SCHEMA,
    version: 0,
    status: 'inert-contract-laboratory',
    circle: circleDescriptor(),
    charter: charterV2(),
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

function historyEntry(charter, recordedAt, evidenceRef) {
  const charterDigest = digestObject(charter);
  return {
    schema: 'axiom-circle-charter-history-entry.v0',
    circle_id: 'circle.charter.hardening',
    charter,
    charter_digest: charterDigest,
    recorded_at: recordedAt,
    activation: {
      schema: 'axiom-circle-charter-activation.v0',
      circle_id: 'circle.charter.hardening',
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
    circle_id: 'circle.charter.hardening',
    entries: [
      historyEntry(first, '2026-08-20T12:01:00.000Z', 'evidence:charter:hardening:genesis'),
      historyEntry(second, '2026-08-20T12:50:00.000Z', 'evidence:charter:hardening:v2')
    ],
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  };
}

const NOW = new Date('2026-08-20T15:00:00.000Z');

test('valid charter lifecycle begins after Circle creation', async () => {
  const policy = await loadPolicy();
  const result = validateCircleCharterLifecycle(policy, circlePackage(), lifecycleFixture(), { now: NOW });
  assert.equal(result.valid, true);
  assert.equal(result.active_charter_version, 2);
});

test('charter history cannot be recorded before Circle creation', async () => {
  const policy = await loadPolicy();
  const lifecycle = lifecycleFixture();
  lifecycle.entries[0].recorded_at = '2026-08-20T11:59:59.000Z';

  assert.throws(
    () => validateCircleCharterLifecycle(policy, circlePackage(), lifecycle, { now: NOW }),
    /cannot be recorded before Circle creation/
  );
});

test('charter cannot become effective before Circle creation', async () => {
  const policy = await loadPolicy();
  const lifecycle = lifecycleFixture();
  lifecycle.entries[0].charter.effective_from = '2026-08-20T11:59:59.000Z';
  lifecycle.entries[0].charter_digest = digestObject(lifecycle.entries[0].charter);
  lifecycle.entries[0].activation.charter_digest = lifecycle.entries[0].charter_digest;
  lifecycle.entries[0].activation.activated_at = lifecycle.entries[0].charter.effective_from;

  const second = lifecycle.entries[1];
  second.charter.supersedes_digest = lifecycle.entries[0].charter_digest;
  second.charter_digest = digestObject(second.charter);
  second.activation.charter_digest = second.charter_digest;
  second.activation.basis_charter_digest = lifecycle.entries[0].charter_digest;

  const circle = circlePackage();
  circle.charter = structuredClone(second.charter);

  assert.throws(
    () => validateCircleCharterLifecycle(policy, circle, lifecycle, { now: NOW }),
    /cannot become effective before Circle creation/
  );
});

test('activation evidence references reject control characters and surrounding whitespace', async () => {
  const policy = await loadPolicy();

  for (const invalidRef of [
    ' evidence:charter:hardening:v2',
    'evidence:charter:hardening:v2 ',
    'evidence:charter:hardening:v2\nforged',
    'evidence:charter:hardening:v2\tforged',
    'evidence:charter:hardening:v2\u007fforged'
  ]) {
    const lifecycle = lifecycleFixture();
    lifecycle.entries[1].activation.evidence_refs = [invalidRef];
    assert.throws(
      () => validateCircleCharterLifecycle(policy, circlePackage(), lifecycle, { now: NOW }),
      /evidence reference is not canonical/
    );
  }
});

test('resolved historical charter is deeply immutable and retains its digest', async () => {
  const policy = await loadPolicy();
  const circle = circlePackage();
  const lifecycle = lifecycleFixture();
  const resolved = resolveCircleCharterAt(policy, circle, lifecycle, {
    at: '2026-08-20T13:30:00.000Z',
    now: NOW
  });

  assert.equal(resolved.charter_digest, digestObject(resolved.charter));
  assert.equal(Object.isFrozen(resolved.charter), true);
  assert.equal(Object.isFrozen(resolved.charter.roles), true);
  assert.equal(Object.isFrozen(resolved.charter.roles[0]), true);
  assert.equal(Object.isFrozen(resolved.charter.roles[0].declared_modes), true);
  assert.equal(Object.isFrozen(resolved.charter.decision_rule), true);

  assert.throws(() => {
    resolved.charter.roles[0].label = 'Mutated';
  }, TypeError);
  assert.throws(() => {
    resolved.charter.roles.push({ role_id: 'attacker' });
  }, TypeError);
  assert.throws(() => {
    resolved.charter.decision_rule.quorum_basis_points = 0;
  }, TypeError);

  assert.equal(resolved.charter.roles[0].label, 'Member');
  assert.equal(resolved.charter.roles.length, 2);
  assert.equal(resolved.charter.decision_rule.quorum_basis_points, 6000);
  assert.equal(resolved.charter_digest, digestObject(resolved.charter));
});
