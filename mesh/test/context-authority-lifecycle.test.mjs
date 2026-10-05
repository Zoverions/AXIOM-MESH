import assert from 'node:assert/strict';
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { digestObject } from '../src/lib/canonical.mjs';
import { MeshIdentity, ensureMeshIdentity } from '../src/lib/identity.mjs';
import { DataProtector } from '../src/lib/protector.mjs';
import {
  CONTEXT_AUTHORITY_EVIDENCE_REVOKED_EVENT,
  CONTEXT_AUTHORITY_EVIDENCE_SUPERSEDED_EVENT,
  CONTEXT_AUTHORITY_EVIDENCE_LIFECYCLE_SCHEMA,
  ContextAuthorityLifecycleGridStore
} from '../src/grid/context-authority-lifecycle-store.mjs';

function makeIdentity(service) {
  const pair = generateKeyPairSync('ed25519');
  return new MeshIdentity(
    service,
    pair.privateKey.export({ type: 'pkcs8', format: 'pem' }),
    pair.publicKey.export({ type: 'spki', format: 'pem' })
  );
}

const policyIdentity = makeIdentity('context-policy');
const gatekeeperIdentity = makeIdentity('vault-gatekeeper');
const receiptIdentity = makeIdentity('context-receipt');

function publicPem(identity) {
  return String(identity.publicKey.export({ type: 'spki', format: 'pem' }));
}

function trustPins() {
  return [
    {
      issuer_principal_ref: 'policy_authority_1',
      key_id: policyIdentity.keyId,
      public_key_pem: publicPem(policyIdentity),
      allowed_evidence_types: ['context-disclosure-policy-decision']
    },
    {
      issuer_principal_ref: 'vault_gatekeeper_1',
      key_id: gatekeeperIdentity.keyId,
      public_key_pem: publicPem(gatekeeperIdentity),
      allowed_evidence_types: [
        'vault-access-lease',
        'vault-lease-revocation-check'
      ]
    },
    {
      issuer_principal_ref: 'receipt_authority_1',
      key_id: receiptIdentity.keyId,
      public_key_pem: publicPem(receiptIdentity),
      allowed_evidence_types: ['vault-access-receipt']
    }
  ];
}

function iso(now, offsetMs = 0) {
  return new Date(now + offsetMs).toISOString();
}

function request(now) {
  return {
    schema: 'axiom-context-request.v1',
    request_id: 'request_1',
    owner_subject_ref: 'owner_1',
    requester_principal_ref: 'assistant_1',
    recipient_principal_ref: 'travel_agent_1',
    purpose: 'choose an accessible hotel',
    task_class: 'travel.hotel-selection',
    issued_at: iso(now, -300_000),
    expires_at: iso(now, 600_000),
    semantic_needs: [{
      semantic_type: 'travel.accessibility.requirements',
      need: 'minimum accommodation constraints for hotel selection',
      required: true,
      maximum_sensitivity: 'restricted',
      acceptable_disclosure_modes: ['transformed-constraint'],
      minimum_confidence: 0.8
    }],
    retention_request: {
      max_seconds: 600,
      recipient_may_persist_requested: false
    },
    minimum_necessary_requested: true,
    source_vault_selector_in_request: false,
    requests_vault_mount: false,
    requests_raw_vault_object: false,
    grants_vault_access: false,
    grants_execution_authority: false,
    onward_disclosure_requested: false
  };
}

function policyDecision(label = 'one') {
  return {
    schema: 'axiom-context-disclosure-policy-decision.v1',
    decision_ref: `policy_decision_${label}`,
    request_id: 'request_1',
    owner_subject_ref: 'owner_1',
    recipient_principal_ref: 'travel_agent_1',
    allowed: true,
    allowed_semantic_types: ['travel.accessibility.requirements'],
    allowed_disclosure_modes: ['transformed-constraint'],
    maximum_sensitivity: 'restricted',
    max_retention_seconds: 600,
    recipient_may_persist: false,
    max_capsule_lifetime_seconds: 600,
    minimum_necessary_confirmed: true
  };
}

function lease(now) {
  return {
    schema: 'axiom-vault-access-lease.v1',
    lease_id: 'lease_1',
    owner_subject_ref: 'owner_1',
    holder_principal_ref: 'broker_1',
    vault_id: 'vault_health_1',
    purpose: 'choose an accessible hotel',
    task_class: 'travel.hotel-selection',
    issued_at: iso(now, -300_000),
    expires_at: iso(now, 600_000),
    allowed_operations: ['derive'],
    resource_scope: {
      wildcard_scope: false,
      resource_refs: ['record_accessibility_1'],
      semantic_types: ['travel.accessibility.requirements'],
      maximum_sensitivity: 'restricted'
    },
    policy_decision_ref: 'lease_policy_1',
    grant_ref: 'lease_grant_1',
    access_receipt_reservation_ref: 'reservation_1',
    delegable: false,
    usable_outside_owner_trust_domain: false,
    contains_raw_key_material: false,
    grants_other_vault_access: false,
    grants_kernel_effect_authority: false,
    permits_raw_content_export: false,
    mutation_authority: false,
    requires_revocation_check_before_use: true,
    access_receipt_required: true
  };
}

function accessReceipt(now) {
  return {
    receipt_ref: 'receipt_1',
    reservation_ref: 'reservation_1',
    lease_id: 'lease_1',
    owner_subject_ref: 'owner_1',
    holder_principal_ref: 'broker_1',
    vault_id: 'vault_health_1',
    purpose: 'choose an accessible hotel',
    task_class: 'travel.hotel-selection',
    recorded_at: iso(now, -60_000),
    committed: true
  };
}

function revocationCheck(now) {
  return {
    check_ref: 'revocation_check_1',
    lease_id: 'lease_1',
    checked_at: iso(now, -120_000),
    valid_until: iso(now, 300_000),
    revoked: false
  };
}

function claims() {
  return [{
    claim_id: 'claim_1',
    semantic_type: 'travel.accessibility.requirements',
    value: {
      step_free_entry_required: true,
      elevator_required_if_room_above_ground: true
    },
    disclosure_type: 'transformed-constraint',
    sensitivity: 'sensitive',
    confidence: 0.95,
    limitations: 'Constraint only; diagnosis and source topology omitted.',
    source_vault_id: 'vault_health_1',
    source_resource_refs: ['record_accessibility_1']
  }];
}

function signEvidence({
  identity,
  issuer,
  type,
  evidenceId,
  nonce,
  payload,
  now,
  issuedOffsetMs = -180_000,
  expiresOffsetMs = 600_000
}) {
  const unsigned = {
    schema: 'axiom-context-authority-evidence.v1',
    evidence_id: evidenceId,
    evidence_type: type,
    issuer_principal_ref: issuer,
    issued_at: iso(now, issuedOffsetMs),
    expires_at: iso(now, expiresOffsetMs),
    nonce,
    payload_sha256: digestObject(payload),
    payload: structuredClone(payload)
  };
  return {
    ...unsigned,
    attestation: identity.signObject(unsigned)
  };
}

function evidenceSet(now, {
  policyEvidenceId = 'evidence_policy_1',
  policyNonce = 'nonce_policy_1',
  policyLabel = 'one',
  policyIssuedOffsetMs = -180_000
} = {}) {
  return {
    policyDecisionEvidence: signEvidence({
      identity: policyIdentity,
      issuer: 'policy_authority_1',
      type: 'context-disclosure-policy-decision',
      evidenceId: policyEvidenceId,
      nonce: policyNonce,
      payload: policyDecision(policyLabel),
      now,
      issuedOffsetMs: policyIssuedOffsetMs
    }),
    leaseEvidence: [signEvidence({
      identity: gatekeeperIdentity,
      issuer: 'vault_gatekeeper_1',
      type: 'vault-access-lease',
      evidenceId: 'evidence_lease_1',
      nonce: 'nonce_lease_1',
      payload: lease(now),
      now
    })],
    accessReceiptEvidence: [signEvidence({
      identity: receiptIdentity,
      issuer: 'receipt_authority_1',
      type: 'vault-access-receipt',
      evidenceId: 'evidence_receipt_1',
      nonce: 'nonce_receipt_1',
      payload: accessReceipt(now),
      now
    })],
    revocationCheckEvidence: [signEvidence({
      identity: gatekeeperIdentity,
      issuer: 'vault_gatekeeper_1',
      type: 'vault-lease-revocation-check',
      evidenceId: 'evidence_revocation_1',
      nonce: 'nonce_revocation_1',
      payload: revocationCheck(now),
      now
    })]
  };
}

function allEvidence(set) {
  return [
    set.policyDecisionEvidence,
    ...set.leaseEvidence,
    ...set.accessReceiptEvidence,
    ...set.revocationCheckEvidence
  ];
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'axiom-context-authority-life-'));
  const dataDir = join(root, 'data');
  const identity = await ensureMeshIdentity(dataDir, 'grid', { create: true });
  const key = randomBytes(32);
  const path = join(dataDir, 'grid.sqlite');
  const now = Date.now();
  const store = new ContextAuthorityLifecycleGridStore({
    path,
    dataDir,
    identity,
    protector: new DataProtector(key),
    contextAuthorityTrustPins: trustPins(),
    contextAuthorityLifecycleActorRefs: ['context_admin_1']
  });
  return { root, dataDir, identity, key, path, now, store };
}

function reopen(setup) {
  return new ContextAuthorityLifecycleGridStore({
    path: setup.path,
    dataDir: setup.dataDir,
    identity: setup.identity,
    protector: new DataProtector(setup.key),
    contextAuthorityTrustPins: trustPins(),
    contextAuthorityLifecycleActorRefs: ['context_admin_1']
  });
}

function admitSet(store, set, now) {
  for (const envelope of allEvidence(set)) {
    store.admitContextAuthorityEvidence({
      envelope,
      actor: 'context_broker_1',
      traceId: `trace_admit_${envelope.evidence_id}`,
      now
    });
  }
}

function compile(store, set, now, suffix = 'one') {
  return store.compileContextCapsuleFromAdmittedEvidence({
    request: request(now),
    ...set,
    claims: claims(),
    brokerPrincipalRef: 'broker_1',
    capsuleId: `capsule_lifecycle_${suffix}`,
    issuedAt: iso(now),
    localProvenanceReceiptRefs: ['provenance_1'],
    now
  });
}

function lifecyclePayload({
  evidenceId,
  transition,
  reasonCode,
  supersededByEvidenceId = null
}) {
  return {
    schema: CONTEXT_AUTHORITY_EVIDENCE_LIFECYCLE_SCHEMA,
    evidence_id: evidenceId,
    transition,
    reason_code: reasonCode,
    changed_by: 'context_admin_1',
    superseded_by_evidence_id: supersededByEvidenceId,
    future_use_effect: 'deny',
    grants_vault_access: false,
    grants_execution_authority: false
  };
}

test('revocation preserves admission provenance but blocks future compilation', async t => {
  const setup = await fixture();
  t.after(async () => {
    setup.store.close();
    await rm(setup.root, { recursive: true, force: true });
  });
  const set = evidenceSet(setup.now);
  admitSet(setup.store, set, setup.now);

  const before = compile(setup.store, set, setup.now, 'before_revoke');
  assert.equal(before.authority_evidence_lifecycle_all_active, true);
  const admissionBefore = setup.store.getContextAuthorityEvidenceAdmission(
    'evidence_policy_1'
  );

  const revoked = setup.store.revokeContextAuthorityEvidence({
    evidenceId: 'evidence_policy_1',
    actor: 'context_admin_1',
    traceId: 'trace_revoke_policy',
    reasonCode: 'owner_revoked'
  });
  assert.equal(revoked.state, 'revoked');
  assert.equal(revoked.usable_for_context_compilation, false);
  assert.equal(revoked.transition_grants_vault_access, false);
  assert.equal(revoked.transition_grants_execution_authority, false);

  const admissionAfter = setup.store.getContextAuthorityEvidenceAdmission(
    'evidence_policy_1'
  );
  assert.deepEqual(admissionAfter, admissionBefore);
  assert.equal(admissionAfter.status, 'admitted');

  assert.throws(
    () => compile(setup.store, set, setup.now, 'after_revoke'),
    error => error?.code === 'context_authority_evidence_revoked'
  );

  const row = setup.store.db.prepare(`
    SELECT *
    FROM context_authority_evidence_lifecycle
    WHERE evidence_id = ?
  `).get('evidence_policy_1');
  assert.equal(row.state, 'revoked');
  assert.equal(row.reason_code, 'owner_revoked');
  assert.equal(row.superseded_by_evidence_id, null);
  assert.equal(Object.hasOwn(row, 'signed_evidence'), false);
});

test('lifecycle transitions require a locally configured actor and grant no authority', async t => {
  const setup = await fixture();
  t.after(async () => {
    setup.store.close();
    await rm(setup.root, { recursive: true, force: true });
  });
  const set = evidenceSet(setup.now);
  admitSet(setup.store, set, setup.now);

  assert.throws(
    () => setup.store.revokeContextAuthorityEvidence({
      evidenceId: 'evidence_policy_1',
      actor: 'untrusted_admin_1',
      traceId: 'trace_untrusted_revoke',
      reasonCode: 'attempted_revoke'
    }),
    error => error?.code === 'context_authority_lifecycle_actor_denied'
  );
  assert.equal(
    setup.store.getContextAuthorityEvidenceLifecycle('evidence_policy_1').state,
    'active'
  );
  assert.equal(setup.store.db.prepare(`
    SELECT COUNT(*) AS count
    FROM events
    WHERE kind IN (?, ?)
  `).get(
    CONTEXT_AUTHORITY_EVIDENCE_REVOKED_EVENT,
    CONTEXT_AUTHORITY_EVIDENCE_SUPERSEDED_EVENT
  ).count, 0);
});

test('supersession blocks the old envelope and the replacement must pass independently', async t => {
  const setup = await fixture();
  t.after(async () => {
    setup.store.close();
    await rm(setup.root, { recursive: true, force: true });
  });
  const original = evidenceSet(setup.now);
  admitSet(setup.store, original, setup.now);

  const replacement = evidenceSet(setup.now, {
    policyEvidenceId: 'evidence_policy_2',
    policyNonce: 'nonce_policy_2',
    policyLabel: 'two',
    policyIssuedOffsetMs: -60_000
  });
  setup.store.admitContextAuthorityEvidence({
    envelope: replacement.policyDecisionEvidence,
    actor: 'context_broker_1',
    traceId: 'trace_admit_policy_2',
    now: setup.now
  });

  const state = setup.store.supersedeContextAuthorityEvidence({
    evidenceId: 'evidence_policy_1',
    supersededByEvidenceId: 'evidence_policy_2',
    actor: 'context_admin_1',
    traceId: 'trace_supersede_policy',
    reasonCode: 'policy_reissued'
  });
  assert.equal(state.state, 'superseded');
  assert.equal(state.superseded_by_evidence_id, 'evidence_policy_2');

  assert.throws(
    () => compile(setup.store, original, setup.now, 'old_policy'),
    error => error?.code === 'context_authority_evidence_superseded'
  );

  const replacementSet = {
    ...original,
    policyDecisionEvidence: replacement.policyDecisionEvidence
  };
  const result = compile(
    setup.store,
    replacementSet,
    setup.now,
    'replacement_policy'
  );
  assert.equal(result.authority_evidence_lifecycle_all_active, true);
  assert.equal(
    result.authority_evidence_admission_ids.includes('evidence_policy_2'),
    true
  );
  assert.equal(
    result.authority_evidence_admission_ids.includes('evidence_policy_1'),
    false
  );
});

test('supersession cannot substitute a different evidence class or issuer binding', async t => {
  const setup = await fixture();
  t.after(async () => {
    setup.store.close();
    await rm(setup.root, { recursive: true, force: true });
  });
  const set = evidenceSet(setup.now);
  admitSet(setup.store, set, setup.now);

  assert.throws(
    () => setup.store.supersedeContextAuthorityEvidence({
      evidenceId: 'evidence_policy_1',
      supersededByEvidenceId: 'evidence_lease_1',
      actor: 'context_admin_1',
      traceId: 'trace_bad_supersede',
      reasonCode: 'invalid_replacement'
    }),
    /same evidence type and issuer/
  );
  assert.equal(
    setup.store.getContextAuthorityEvidenceLifecycle('evidence_policy_1').state,
    'active'
  );
});

test('terminal lifecycle state cannot be overwritten by a later transition', async t => {
  const setup = await fixture();
  t.after(async () => {
    setup.store.close();
    await rm(setup.root, { recursive: true, force: true });
  });
  const set = evidenceSet(setup.now);
  admitSet(setup.store, set, setup.now);

  setup.store.revokeContextAuthorityEvidence({
    evidenceId: 'evidence_policy_1',
    actor: 'context_admin_1',
    traceId: 'trace_terminal_first',
    reasonCode: 'owner_revoked'
  });

  assert.throws(
    () => setup.store.revokeContextAuthorityEvidence({
      evidenceId: 'evidence_policy_1',
      actor: 'context_admin_1',
      traceId: 'trace_terminal_second',
      reasonCode: 'different_reason'
    }),
    error => error?.code === 'context_authority_evidence_terminal'
  );
  const lifecycleEvents = setup.store.db.prepare(`
    SELECT COUNT(*) AS count
    FROM events
    WHERE kind = ? AND subject = ?
  `).get(CONTEXT_AUTHORITY_EVIDENCE_REVOKED_EVENT, 'evidence_policy_1');
  assert.equal(lifecycleEvents.count, 1);
});

test('lifecycle state rebuilds deterministically from signed Grid history', async t => {
  const setup = await fixture();
  t.after(async () => {
    try { setup.store.close(); } catch {}
    await rm(setup.root, { recursive: true, force: true });
  });
  const set = evidenceSet(setup.now);
  admitSet(setup.store, set, setup.now);
  const revoked = setup.store.revokeContextAuthorityEvidence({
    evidenceId: 'evidence_policy_1',
    actor: 'context_admin_1',
    traceId: 'trace_rebuild_revoke',
    reasonCode: 'owner_revoked'
  });

  setup.store.db.exec('DELETE FROM context_authority_evidence_lifecycle');
  assert.equal(
    setup.store.getContextAuthorityEvidenceLifecycle('evidence_policy_1').state,
    'active'
  );
  setup.store.rebuildContextAuthorityLifecycleState();
  assert.deepEqual(
    setup.store.getContextAuthorityEvidenceLifecycle('evidence_policy_1'),
    revoked
  );

  setup.store.close();
  setup.store = reopen(setup);
  assert.equal(
    setup.store.getContextAuthorityEvidenceLifecycle('evidence_policy_1').state,
    'revoked'
  );
});

test('supersession ordering requires the replacement admission to precede the transition', async t => {
  const setup = await fixture();
  t.after(async () => {
    setup.store.close();
    await rm(setup.root, { recursive: true, force: true });
  });
  const original = evidenceSet(setup.now);
  admitSet(setup.store, original, setup.now);
  const replacement = evidenceSet(setup.now, {
    policyEvidenceId: 'evidence_policy_2',
    policyNonce: 'nonce_policy_2',
    policyLabel: 'two',
    policyIssuedOffsetMs: -60_000
  });
  setup.store.admitContextAuthorityEvidence({
    envelope: replacement.policyDecisionEvidence,
    actor: 'context_broker_1',
    traceId: 'trace_order_replacement',
    now: setup.now
  });
  const replacementAdmission = setup.store.getContextAuthorityEvidenceAdmission(
    'evidence_policy_2'
  );
  const replacementSeq = setup.store.db.prepare(`
    SELECT seq FROM events WHERE event_id = ?
  `).get(replacementAdmission.admitted_event_id).seq;

  const payload = lifecyclePayload({
    evidenceId: 'evidence_policy_1',
    transition: 'superseded',
    reasonCode: 'policy_reissued',
    supersededByEvidenceId: 'evidence_policy_2'
  });
  assert.throws(
    () => setup.store.validateContextAuthorityLifecycleEvent({
      kind: CONTEXT_AUTHORITY_EVIDENCE_SUPERSEDED_EVENT,
      subject: 'evidence_policy_1',
      payload
    }, 'context_admin_1', {
      occurredAtMs: Date.now(),
      eventSeq: replacementSeq
    }),
    /Superseding evidence must have been admitted earlier/
  );
});

test('a terminal replacement cannot be used to supersede another evidence object', async t => {
  const setup = await fixture();
  t.after(async () => {
    setup.store.close();
    await rm(setup.root, { recursive: true, force: true });
  });
  const original = evidenceSet(setup.now);
  admitSet(setup.store, original, setup.now);
  const replacement = evidenceSet(setup.now, {
    policyEvidenceId: 'evidence_policy_2',
    policyNonce: 'nonce_policy_2',
    policyLabel: 'two',
    policyIssuedOffsetMs: -60_000
  });
  setup.store.admitContextAuthorityEvidence({
    envelope: replacement.policyDecisionEvidence,
    actor: 'context_broker_1',
    traceId: 'trace_terminal_replacement_admit',
    now: setup.now
  });
  setup.store.revokeContextAuthorityEvidence({
    evidenceId: 'evidence_policy_2',
    actor: 'context_admin_1',
    traceId: 'trace_terminal_replacement_revoke',
    reasonCode: 'replacement_withdrawn'
  });

  assert.throws(
    () => setup.store.supersedeContextAuthorityEvidence({
      evidenceId: 'evidence_policy_1',
      supersededByEvidenceId: 'evidence_policy_2',
      actor: 'context_admin_1',
      traceId: 'trace_terminal_replacement_use',
      reasonCode: 'policy_reissued'
    }),
    error => error?.code === 'context_authority_superseding_evidence_terminal'
  );
});

test('lifecycle events contain no authority grant and compiler output exposes only a lifecycle proof digest', async t => {
  const setup = await fixture();
  t.after(async () => {
    setup.store.close();
    await rm(setup.root, { recursive: true, force: true });
  });
  const set = evidenceSet(setup.now);
  admitSet(setup.store, set, setup.now);
  const result = compile(setup.store, set, setup.now, 'proof');

  assert.equal(result.authority_evidence_lifecycle_verified, true);
  assert.equal(result.authority_evidence_lifecycle_all_active, true);
  assert.equal(result.authority_evidence_lifecycle_mutates_admission_history, false);
  assert.equal(result.authority_evidence_lifecycle_grants_authority, false);
  assert.match(result.authority_evidence_lifecycle_bundle_sha256, /^[a-f0-9]{64}$/);
  assert.equal(result.grants_vault_access, false);
  assert.equal(result.grants_execution_authority, false);
  assert.doesNotMatch(JSON.stringify(result), /source_resource_refs/);
  assert.doesNotMatch(JSON.stringify(result), /source_vault_id/);

  const status = setup.store.getStatus();
  assert.equal(
    status.context_authority_lifecycle_runtime,
    'append-only-terminal-revocation-and-supersession'
  );
  assert.equal(status.context_authority_lifecycle_mutates_admission_history, false);
  assert.equal(status.context_authority_lifecycle_grants_authority, false);
});
