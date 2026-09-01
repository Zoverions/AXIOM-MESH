import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import test from 'node:test';

import {
  createAgentAttenuationProof,
  createAgentAuthorityCeiling
} from '../src/lib/agent-trust-attenuation-proof.mjs';
import {
  createSubagentDelegationAdmission
} from '../src/lib/agent-trust-subagent-delegation-admission.mjs';
import {
  createSubagentAggregateBudgetPlan
} from '../src/lib/agent-trust-subagent-aggregate-budget.mjs';
import {
  SUBAGENT_LINEAGE_RECORD_SCHEMA,
  createSubagentLineageRecord,
  verifySubagentLineageLink,
  verifySubagentLineageRecord
} from '../src/lib/agent-trust-subagent-lineage-record.mjs';

const PARENT_CURRENTNESS = 'a'.repeat(64);
const PARENT_CURRENTNESS_VERIFICATION = 'b'.repeat(64);
const INPUT_DIGEST = 'c'.repeat(64);
const RUNTIME_DESCRIPTOR_DIGEST = 'd'.repeat(64);

function authority({
  action = 'system.echo',
  capabilities = ['cap.echo'],
  maySubdelegate = true,
  remainingDepth = 2,
  requests = 20,
  concurrent = 4,
  cost = 100,
  validFrom = '2026-09-01T17:00:00.000Z',
  expiresAt = '2026-09-01T20:00:00.000Z'
} = {}) {
  return createAgentAuthorityCeiling({
    capabilities,
    actions: [{
      id: action,
      effect_destination: 'local',
      required_assurance: 'A2',
      required_confirmations: 1,
      required_confirmation_values: ['confirm.effect'],
      requires_independent_approval: true,
      timeout_ms: 5_000
    }],
    scopes: ['intent:execute'],
    purposes: ['research.assist'],
    destinations: ['local'],
    data_classes: ['public'],
    budgets: {
      max_requests_per_minute: requests,
      max_concurrent_requests: concurrent,
      max_execution_ms: 5_000,
      max_request_bytes: 65_536,
      max_response_bytes: 262_144,
      max_cost_units: cost
    },
    delegation: { may_subdelegate: maySubdelegate, remaining_depth: remainingDepth },
    valid_from: validFrom,
    expires_at: expiresAt
  });
}

function fixture({
  delegatorId = 'agent.parent.1',
  delegateId = 'agent.child.1',
  parent = authority(),
  child = authority({
    maySubdelegate: true,
    remainingDepth: 1,
    requests: 10,
    concurrent: 2,
    cost: 40,
    validFrom: '2026-09-01T17:05:00.000Z',
    expiresAt: '2026-09-01T19:00:00.000Z'
  }),
  proofId = 'attenuation.lineage.1',
  delegationId = 'delegation.lineage.1',
  planId = 'budget.lineage.1',
  reservationId = 'reservation.lineage.1'
} = {}) {
  const delegator = generateKeyPairSync('ed25519');
  const admissionAuthority = generateKeyPairSync('ed25519');
  const lineageAuthority = generateKeyPairSync('ed25519');

  const proof = createAgentAttenuationProof({
    proofId,
    delegatorId,
    delegateId,
    delegatorPrivateKey: delegator.privateKey,
    parentAuthority: parent,
    childAuthority: child,
    parentContextDigest: PARENT_CURRENTNESS,
    issuedAt: '2026-09-01T17:06:00.000Z',
    expiresAt: '2026-09-01T18:40:00.000Z'
  });

  const admission = createSubagentDelegationAdmission({
    delegationId,
    attenuationProof: proof,
    delegatorPublicKey: delegator.publicKey,
    parentAuthority: parent,
    childAuthority: child,
    expectedDelegatorId: delegatorId,
    expectedDelegateId: delegateId,
    parentCurrentnessDigest: PARENT_CURRENTNESS,
    parentCurrentnessVerificationDigest: PARENT_CURRENTNESS_VERIFICATION,
    retainedLatestParentCurrentnessDigest: PARENT_CURRENTNESS,
    admissionAuthorityId: 'authority.local.delegation',
    admissionAuthorityPrivateKey: admissionAuthority.privateKey,
    issuedAt: '2026-09-01T17:07:00.000Z',
    expiresAt: '2026-09-01T18:30:00.000Z'
  });

  const budgetPlan = createSubagentAggregateBudgetPlan({
    planId,
    parentAuthority: parent,
    reservations: [{
      reservation_id: reservationId,
      child_id: delegateId,
      child_authority: child,
      budgets: {
        max_concurrent_requests: child.budgets.max_concurrent_requests,
        max_cost_units: child.budgets.max_cost_units,
        max_requests_per_minute: child.budgets.max_requests_per_minute
      }
    }],
    validFrom: '2026-09-01T17:07:00.000Z',
    expiresAt: '2026-09-01T18:30:00.000Z'
  });

  return {
    delegatorId,
    delegateId,
    delegator,
    admissionAuthority,
    lineageAuthority,
    parent,
    child,
    proof,
    admission,
    budgetPlan,
    reservationId
  };
}

function recordArgs(f, overrides = {}) {
  return {
    lineageId: 'lineage.root.1',
    rootLineageId: 'lineage.root.1',
    depth: 1,
    parentLineageRecordDigest: null,
    delegationAdmission: f.admission,
    admissionAuthorityPublicKey: f.admissionAuthority.publicKey,
    attenuationProof: f.proof,
    delegatorPublicKey: f.delegator.publicKey,
    parentAuthority: f.parent,
    childAuthority: f.child,
    expectedDelegatorId: f.delegatorId,
    expectedDelegateId: f.delegateId,
    expectedParentCurrentnessDigest: PARENT_CURRENTNESS,
    retainedLatestParentCurrentnessDigest: PARENT_CURRENTNESS,
    aggregateBudgetPlan: f.budgetPlan,
    aggregateBudgetChildAuthorities: { [f.delegateId]: f.child },
    reservationId: f.reservationId,
    task: {
      id: 'task.research.1',
      purpose: 'research.assist',
      input_digest: INPUT_DIGEST
    },
    runtimeDescriptorDigest: RUNTIME_DESCRIPTOR_DIGEST,
    lineageAuthorityId: 'authority.local.lineage',
    lineageAuthorityPrivateKey: f.lineageAuthority.privateKey,
    createdAt: '2026-09-01T17:08:00.000Z',
    expiresAt: '2026-09-01T18:20:00.000Z',
    ...overrides
  };
}

function verifyArgs(f, overrides = {}) {
  return {
    lineageAuthorityPublicKey: f.lineageAuthority.publicKey,
    admissionAuthorityPublicKey: f.admissionAuthority.publicKey,
    attenuationProof: f.proof,
    delegatorPublicKey: f.delegator.publicKey,
    parentAuthority: f.parent,
    childAuthority: f.child,
    expectedDelegatorId: f.delegatorId,
    expectedDelegateId: f.delegateId,
    expectedParentCurrentnessDigest: PARENT_CURRENTNESS,
    retainedLatestParentCurrentnessDigest: PARENT_CURRENTNESS,
    aggregateBudgetPlan: f.budgetPlan,
    aggregateBudgetChildAuthorities: { [f.delegateId]: f.child },
    ...overrides
  };
}

test('signed lineage record binds exact delegation budget task and runtime provenance without granting authority', () => {
  const f = fixture();
  const record = createSubagentLineageRecord(recordArgs(f));
  const verified = verifySubagentLineageRecord(record, verifyArgs(f));

  assert.equal(SUBAGENT_LINEAGE_RECORD_SCHEMA, 'axiom-subagent-lineage-record.v1');
  assert.equal(verified.schema, SUBAGENT_LINEAGE_RECORD_SCHEMA);
  assert.equal(verified.statement.lineage_id, 'lineage.root.1');
  assert.equal(verified.statement.root_lineage_id, 'lineage.root.1');
  assert.equal(verified.statement.depth, 1);
  assert.equal(verified.statement.parent_lineage_record_digest, null);
  assert.equal(verified.statement.delegator_id, f.delegatorId);
  assert.equal(verified.statement.delegate_id, f.delegateId);
  assert.equal(verified.statement.delegation_admission_digest, f.admission.admission_digest);
  assert.equal(verified.statement.attenuation_proof_digest, f.proof.proof_digest);
  assert.equal(verified.statement.aggregate_budget_plan_digest, f.budgetPlan.plan_digest);
  assert.equal(verified.statement.budget_reservation_id, f.reservationId);
  assert.equal(verified.statement.task_id, 'task.research.1');
  assert.equal(verified.statement.task_purpose, 'research.assist');
  assert.equal(verified.statement.task_input_digest, INPUT_DIGEST);
  assert.equal(verified.statement.runtime_descriptor_digest, RUNTIME_DESCRIPTOR_DIGEST);
  assert.equal(verified.statement.authority_effect, 'none');
  assert.equal(verified.statement.delegation_effect, 'none');
  assert.equal(verified.statement.execution_authorized, false);
  assert.equal(verified.statement.spawn_execution_claimed, false);
  assert.equal(verified.statement.runtime_attestation_claimed, false);
  assert.equal(verified.statement.task_success_claimed, false);
  assert.equal(verified.statement.output_verified, false);
  assert.equal(verified.statement.trust_inherited, false);
  assert.equal(verified.statement.global_currentness_claimed, false);
  assert.equal(verified.statement.descendant_effect_requires_recheck, true);
  assert.equal(verified.statement.budget_runtime_enforcement_claimed, false);
  assert.match(verified.record_digest, /^[a-f0-9]{64}$/);
});

test('lineage record rejects missing or mismatched aggregate budget reservation', () => {
  const f = fixture();

  assert.throws(
    () => createSubagentLineageRecord(recordArgs(f, { reservationId: 'reservation.missing' })),
    /budget reservation/i
  );

  const otherChild = authority({
    maySubdelegate: false,
    remainingDepth: 0,
    requests: 5,
    concurrent: 1,
    cost: 10,
    validFrom: '2026-09-01T17:05:00.000Z',
    expiresAt: '2026-09-01T19:00:00.000Z'
  });
  assert.throws(
    () => createSubagentLineageRecord(recordArgs(f, {
      aggregateBudgetChildAuthorities: { [f.delegateId]: otherChild }
    })),
    /child ceiling digest mismatch|authority binding mismatch/i
  );
});

test('lineage record rejects task purpose outside the exact admitted child ceiling', () => {
  const f = fixture();
  assert.throws(
    () => createSubagentLineageRecord(recordArgs(f, {
      task: { id: 'task.finance.1', purpose: 'finance.transfer', input_digest: INPUT_DIGEST }
    })),
    /task purpose.*child authority/i
  );
});

test('lineage record cannot bypass stale parent currentness through valid historical delegation artifacts', () => {
  const f = fixture();
  assert.throws(
    () => createSubagentLineageRecord(recordArgs(f, {
      retainedLatestParentCurrentnessDigest: 'e'.repeat(64)
    })),
    /latest parent currentness/i
  );
});

test('lineage record signature, issuer key and fixed non-authorizing semantics fail closed on tamper', () => {
  const f = fixture();
  const record = createSubagentLineageRecord(recordArgs(f));
  const other = generateKeyPairSync('ed25519');

  assert.throws(
    () => verifySubagentLineageRecord(record, verifyArgs(f, {
      lineageAuthorityPublicKey: other.publicKey
    })),
    /lineage authority key substitution/i
  );

  const tampered = structuredClone(record);
  tampered.statement.execution_authorized = true;
  assert.throws(
    () => verifySubagentLineageRecord(tampered, verifyArgs(f)),
    /(statement digest mismatch|non-authorizing boundary)/i
  );
});

test('lineage record lifetime stays inside admission budget plan and child authority', () => {
  const f = fixture();
  assert.throws(
    () => createSubagentLineageRecord(recordArgs(f, {
      expiresAt: '2026-09-01T18:31:00.000Z'
    })),
    /(delegation admission|aggregate budget plan|child authority)/i
  );
});

test('descendant lineage link requires exact parent record depth principal and authority continuity', () => {
  const first = fixture();
  const parentRecord = createSubagentLineageRecord(recordArgs(first));

  const secondParent = first.child;
  const secondChild = authority({
    maySubdelegate: false,
    remainingDepth: 0,
    requests: 5,
    concurrent: 1,
    cost: 20,
    validFrom: '2026-09-01T17:10:00.000Z',
    expiresAt: '2026-09-01T18:00:00.000Z'
  });
  const second = fixture({
    delegatorId: first.delegateId,
    delegateId: 'agent.grandchild.1',
    parent: secondParent,
    child: secondChild,
    proofId: 'attenuation.lineage.2',
    delegationId: 'delegation.lineage.2',
    planId: 'budget.lineage.2',
    reservationId: 'reservation.lineage.2'
  });

  const childRecord = createSubagentLineageRecord(recordArgs(second, {
    lineageId: 'lineage.child.2',
    rootLineageId: 'lineage.root.1',
    depth: 2,
    parentLineageRecordDigest: parentRecord.record_digest,
    task: { id: 'task.research.2', purpose: 'research.assist', input_digest: 'f'.repeat(64) },
    createdAt: '2026-09-01T17:12:00.000Z',
    expiresAt: '2026-09-01T17:50:00.000Z'
  }));

  const linked = verifySubagentLineageLink({ parentRecord, childRecord });
  assert.deepEqual(linked, {
    linked: true,
    root_lineage_id: 'lineage.root.1',
    parent_record_digest: parentRecord.record_digest,
    child_record_digest: childRecord.record_digest,
    depth: 2,
    delegator_id: first.delegateId,
    delegate_id: 'agent.grandchild.1'
  });

  const wrongDigest = structuredClone(childRecord);
  wrongDigest.statement.parent_lineage_record_digest = '9'.repeat(64);
  assert.throws(
    () => verifySubagentLineageLink({ parentRecord, childRecord: wrongDigest }),
    /parent lineage record digest mismatch/i
  );

  const wrongDepth = structuredClone(childRecord);
  wrongDepth.statement.depth = 3;
  assert.throws(
    () => verifySubagentLineageLink({ parentRecord, childRecord: wrongDepth }),
    /depth must increment exactly once/i
  );
});
