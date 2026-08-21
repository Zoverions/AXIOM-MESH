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
  validateCircleCharterLifecycle,
  validateCircleCharterLifecyclePolicy
} from '../../packages/axiom-circle-charter-lifecycle/implementation.mjs';

const policyUrl = new URL('../config/circle-charter-lifecycle.v0.json', import.meta.url);
const NOW = new Date('2026-08-20T15:00:00.000Z');

async function loadPolicy() {
  return JSON.parse(await readFile(policyUrl, 'utf8'));
}

function fixture() {
  const circle = {
    schema: CIRCLE_SCHEMA,
    circle_id: 'circle.implementation-boundary',
    name: 'Implementation Boundary Circle',
    purpose: 'Exercise invariants directly through the charter lifecycle implementation module.',
    created_by: 'human.owner',
    created_at: '2026-08-20T12:00:00.000Z',
    trust_anchor_id: 'anchor.implementation-boundary',
    participation_model: 'voluntary',
    member_state_ownership: 'independent-node',
    policy_floor: 'raise-only',
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  };

  const charter = {
    schema: CIRCLE_CHARTER_SCHEMA,
    circle_id: circle.circle_id,
    version: 1,
    effective_from: '2026-08-20T12:05:00.000Z',
    supersedes_digest: null,
    roles: [{
      role_id: 'member',
      label: 'Member',
      declared_modes: ['observe'],
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

  const charterDigest = digestObject(charter);
  const circlePackage = {
    schema: CIRCLE_CORE_PACKAGE_SCHEMA,
    version: 0,
    status: 'inert-contract-laboratory',
    circle,
    charter: structuredClone(charter),
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

  const lifecycle = {
    schema: 'axiom-circle-charter-lifecycle.v0',
    circle_id: circle.circle_id,
    entries: [{
      schema: 'axiom-circle-charter-history-entry.v0',
      circle_id: circle.circle_id,
      charter: structuredClone(charter),
      charter_digest: charterDigest,
      recorded_at: '2026-08-20T12:01:00.000Z',
      activation: {
        schema: 'axiom-circle-charter-activation.v0',
        circle_id: circle.circle_id,
        charter_digest: charterDigest,
        basis_charter_digest: null,
        activated_at: charter.effective_from,
        evidence_refs: ['evidence:charter:genesis'],
        creates_runtime_authority: false,
        authority_effect: 'none',
        network_effect: 'none'
      },
      authority_effect: 'none',
      network_effect: 'none'
    }],
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  };

  return { circlePackage, lifecycle };
}

function rebindSingleEntry(circlePackage, lifecycle) {
  const entry = lifecycle.entries[0];
  entry.charter_digest = digestObject(entry.charter);
  entry.activation.charter_digest = entry.charter_digest;
  entry.activation.activated_at = entry.charter.effective_from;
  circlePackage.charter = structuredClone(entry.charter);
}

test('direct implementation accepts a valid inert charter lifecycle', async () => {
  const policy = await loadPolicy();
  const { circlePackage, lifecycle } = fixture();
  assert.equal(
    validateCircleCharterLifecycle(policy, circlePackage, lifecycle, { now: NOW }).valid,
    true
  );
});

test('policy validation is independent of object insertion order', async () => {
  const policy = await loadPolicy();
  policy.requirements = Object.fromEntries(Object.entries(policy.requirements).reverse());
  policy.schemas = Object.fromEntries(Object.entries(policy.schemas).reverse());
  assert.equal(validateCircleCharterLifecyclePolicy(policy), true);
});

test('direct implementation rejects charter effective time before Circle creation', async () => {
  const policy = await loadPolicy();
  const { circlePackage, lifecycle } = fixture();
  lifecycle.entries[0].charter.effective_from = '2026-08-20T11:59:59.000Z';
  lifecycle.entries[0].recorded_at = '2026-08-20T11:59:58.000Z';
  rebindSingleEntry(circlePackage, lifecycle);

  assert.throws(
    () => validateCircleCharterLifecycle(policy, circlePackage, lifecycle, { now: NOW }),
    /cannot become effective before Circle creation/
  );
});

test('direct implementation rejects charter history recorded before Circle creation', async () => {
  const policy = await loadPolicy();
  const { circlePackage, lifecycle } = fixture();
  lifecycle.entries[0].recorded_at = '2026-08-20T11:59:59.000Z';

  assert.throws(
    () => validateCircleCharterLifecycle(policy, circlePackage, lifecycle, { now: NOW }),
    /cannot be recorded before Circle creation/
  );
});

test('direct implementation rejects non-canonical activation evidence references', async () => {
  const policy = await loadPolicy();
  for (const invalidRef of [
    ' evidence:charter:genesis',
    'evidence:charter:genesis ',
    'evidence:charter:genesis\tforged',
    'evidence:charter:genesis\nforged',
    'evidence:charter:genesis\rforged',
    'evidence:charter:genesis\u007fforged'
  ]) {
    const { circlePackage, lifecycle } = fixture();
    lifecycle.entries[0].activation.evidence_refs = [invalidRef];
    assert.throws(
      () => validateCircleCharterLifecycle(policy, circlePackage, lifecycle, { now: NOW }),
      /activation evidence reference is not canonical/
    );
  }
});
