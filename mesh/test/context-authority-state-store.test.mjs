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
  ContextAuthorityStateGridStore
} from '../src/grid/context-authority-state-store.mjs';

const NOW = Date.now();

function iso(offsetMs = 0) {
  return new Date(NOW + offsetMs).toISOString();
}

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

function request() {
  return {
    schema: 'axiom-context-request.v1',
    request_id: 'request_1',
    owner_subject_ref: 'owner_1',
    requester_principal_ref: 'assistant_1',
    recipient_principal_ref: 'travel_agent_1',
    purpose: 'choose an accessible hotel',
    task_class: 'travel.hotel-selection',
    issued_at: iso(-600_000),
    expires_at: iso(1_800_000),
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

function policyDecision(ref = 'policy_decision_1') {
  return {
    schema: 'axiom-context-disclosure-policy-decision.v1',
    decision_ref: ref,
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

function lease() {
  return {
    schema: 'axiom-vault-access-lease.v1',
    lease_id: 'lease_1',
    owner_subject_ref: 'owner_1',
    holder_principal_ref: 'broker_1',
    vault_id: 'vault_health_1',
    purpose: 'choose an accessible hotel',
    task_class: 'travel.hotel-selection',
    issued_at: iso(-480_000),
    expires_at: iso(1_500_000),
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

function accessReceipt() {
  return {
    receipt_ref: 'receipt_1',
    reservation_ref: 'reservation_1',
    lease_id: 'lease_1',
    owner_subject_ref: 'owner_1',
    holder_principal_ref: 'broker_1',
    vault_id: 'vault_health_1',
    purpose: 'choose an accessible hotel',
    task_class: 'travel.hotel-selection',
    recorded_at: iso(-60_000),
    committed: true
  };
}

function revocationCheck() {
  return {
    check_ref: 'revocation_check_1',
    lease_id: 'lease_1',
    checked_at: iso(-120_000),
    valid_until: iso(1_200_000),
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
  issuedAt = iso(-300_000),
  expiresAt = iso(1_800_000)
}) {
  const unsigned = {
    schema: 'axiom-context-authority-evidence.v1',
    evidence_id: evidenceId,
    evidence_type: type,
    issuer_principal_ref: issuer,
    issued_at: issuedAt,
    expires_at: expiresAt,
    nonce,
    payload_sha256: digestObject(payload),
    payload: structuredClone(payload)
  };
  return {
    ...unsigned,
    attestation: identity.signObject(unsigned)
  };
}

function evidenceSet() {
  return {
    policyDecisionEvidence: signEvidence({
      identity: policyIdentity,
      issuer: 'policy_authority_1',
      type: 'context-disclosure-policy-decision',
      evidenceId: 'evidence_policy_1',
      nonce: 'nonce_policy_1',
      payload: policyDecision()
    }),
    leaseEvidence: [signEvidence({
      identity: gatekeeperIdentity,
      issuer: 'vault_gatekeeper_1',
      type: 'vault-access-lease',
      evidenceId: 'evidence_lease_1',
      nonce: 'nonce_lease_1',
      payload: lease()
    })],
    accessReceiptEvidence: [signEvidence({
      identity: receiptIdentity,
      issuer: 'receipt_authority_1',
      type: 'vault-access-receipt',
      evidenceId: 'evidence_receipt_1',
      nonce: 'nonce_receipt_1',
      payload: accessReceipt()
    })],
    revocationCheckEvidence: [signEvidence({
      identity: gatekeeperIdentity,
      issuer: 'vault_gatekeeper_1',
      type: 'vault-lease-revocation-check',
      evidenceId: 'evidence_revocation_1',
      nonce: 'nonce_revocation_1',
      payload: revocationCheck()
    })]
  };
}

function replacementPolicyEvidence() {
  return signEvidence({
    identity: policyIdentity,
    issuer: 'policy_authority_1',
    type: 'context-disclosure-policy-decision',
    evidenceId: 'evidence_policy_2',
    nonce: 'nonce_policy_2',
    payload: policyDecision('policy_decision_2')
  });
}

function allEvidence(set) {
  return [
    set.policyDecisionEvidence,
    ...set.leaseEvidence,
    ...set.accessReceiptEvidence,
    ...set.revocationCheckEvidence
  ];
}

async function storeFixture() {
  const root = await mkdtemp(join(tmpdir(), 'axiom-context-authority-state-'));
  const dataDir = join(root, 'data');
  const identity = await ensureMeshIdentity(dataDir, 'grid', { create: true });
  const key = randomBytes(32);
  const path = join(dataDir, 'grid.sqlite');
  const store = new ContextAuthorityStateGridStore({
    path,
    dataDir,
    identity,
    protector: new DataProtector(key),
    contextAuthorityTrustPins: trustPins(),
    contextAuthorityStateTransitionPrincipals: ['context_admin_1']
  });
  return { root, dataDir, identity, key, path, store };
}

function reopen(setup) {
  return new ContextAuthorityStateGridStore({
    path: setup.path,
    dataDir: setup.dataDir,
    identity: setup.identity,
    protector: new DataProtector(setup.key),
    contextAuthorityTrustPins: trustPins(),
    contextAuthorityStateTransitionPrincipals: ['context_admin_1']
  });
}

function admit(store, envelope, index) {
  return store.admitContextAuthorityEvidence({
    envelope,
    actor: 'context_broker_1',
    traceId: `trace_context_state_admit_${index}`,
    now: NOW
  });
}

function admitAll(store, set) {
  return allEvidence(set).map((envelope, index) =>
    admit(store, envelope, index)
  );
}

function compileArgs(set, overrides = {}) {
  return {
    request: request(),
    ...set,
    claims: claims(),
    brokerPrincipalRef: 'broker_1',
    capsuleId: 'capsule_context_state_1',
    issuedAt: iso(),
    localProvenanceReceiptRefs: ['provenance_1'],
    now: NOW,
    ...overrides
  };
}

test('local revocation is append-only, encrypted, terminal, and blocks compilation', async t => {
  const setup = await storeFixture();
  t.after(async () => {
    setup.store.close();
    await rm(setup.root, { recursive: true, force: true });
  });
  const set = evidenceSet();
  admitAll(setup.store, set);

  const before = setup.store.compileContextCapsuleFromAdmittedEvidence(
    compileArgs(set)
  );
  assert.equal(before.authority_evidence_admission_verified, true);

  const state = setup.store.revokeContextAuthorityEvidence({
    evidenceId: 'evidence_policy_1',
    actor: 'context_admin_1',
    traceId: 'trace_context_state_revoke_1',
    reasonCode: 'owner_revoked'
  });
  assert.equal(state.current_status, 'revoked');
  assert.equal(state.transition.action, 'revoked');
  assert.equal(state.transition.authority_effect, 'deny-only');
  assert.equal(state.transition.grants_vault_access, false);
  assert.equal(state.transition.grants_execution_authority, false);

  const row = setup.store.db.prepare(`
    SELECT payload_json
    FROM events
    WHERE kind = ?
  `).get(CONTEXT_AUTHORITY_EVIDENCE_REVOKED_EVENT);
  assert.ok(row);
  assert.equal(setup.store.protector.isProtected(row.payload_json), true);

  assert.throws(
    () => setup.store.compileContextCapsuleFromAdmittedEvidence(
      compileArgs(set)
    ),
    error => error?.code === 'context_authority_evidence_revoked'
  );
});

test('only constructor-pinned local principals can create deny-only state transitions', async t => {
  const setup = await storeFixture();
  t.after(async () => {
    setup.store.close();
    await rm(setup.root, { recursive: true, force: true });
  });
  const set = evidenceSet();
  admitAll(setup.store, set);

  assert.throws(
    () => setup.store.revokeContextAuthorityEvidence({
      evidenceId: 'evidence_policy_1',
      actor: 'outside_agent_1',
      traceId: 'trace_context_state_unauthorized',
      reasonCode: 'attempted_revoke'
    }),
    error => error?.code === 'context_authority_state_transition_actor_not_allowed'
  );
  assert.equal(
    setup.store.getContextAuthorityEvidenceState('evidence_policy_1').current_status,
    'admitted'
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

test('same terminal transition is idempotent but a conflicting second transition is rejected', async t => {
  const setup = await storeFixture();
  t.after(async () => {
    setup.store.close();
    await rm(setup.root, { recursive: true, force: true });
  });
  const set = evidenceSet();
  admitAll(setup.store, set);

  const first = setup.store.revokeContextAuthorityEvidence({
    evidenceId: 'evidence_policy_1',
    actor: 'context_admin_1',
    traceId: 'trace_context_state_revoke_first',
    reasonCode: 'owner_revoked'
  });
  const second = setup.store.revokeContextAuthorityEvidence({
    evidenceId: 'evidence_policy_1',
    actor: 'context_admin_1',
    traceId: 'trace_context_state_revoke_repeat',
    reasonCode: 'owner_revoked'
  });
  assert.equal(
    first.transition.transition_event_id,
    second.transition.transition_event_id
  );

  const replacement = replacementPolicyEvidence();
  admit(setup.store, replacement, 'replacement');
  assert.throws(
    () => setup.store.supersedeContextAuthorityEvidence({
      evidenceId: 'evidence_policy_1',
      replacementEvidenceId: 'evidence_policy_2',
      actor: 'context_admin_1',
      traceId: 'trace_context_state_conflict',
      reasonCode: 'newer_policy'
    }),
    error => error?.code === 'context_authority_state_transition_conflict'
  );

  assert.equal(setup.store.db.prepare(`
    SELECT COUNT(*) AS count
    FROM events
    WHERE kind = ?
  `).get(CONTEXT_AUTHORITY_EVIDENCE_REVOKED_EVENT).count, 1);
});

test('supersession requires an independently admitted current replacement from the same issuer and evidence class', async t => {
  const setup = await storeFixture();
  t.after(async () => {
    setup.store.close();
    await rm(setup.root, { recursive: true, force: true });
  });
  const set = evidenceSet();
  admitAll(setup.store, set);

  assert.throws(
    () => setup.store.supersedeContextAuthorityEvidence({
      evidenceId: 'evidence_policy_1',
      replacementEvidenceId: 'evidence_policy_2',
      actor: 'context_admin_1',
      traceId: 'trace_context_state_missing_replacement',
      reasonCode: 'newer_policy'
    }),
    error => error?.code === 'context_authority_state_transition_replacement_not_admitted'
  );

  assert.throws(
    () => setup.store.supersedeContextAuthorityEvidence({
      evidenceId: 'evidence_policy_1',
      replacementEvidenceId: 'evidence_lease_1',
      actor: 'context_admin_1',
      traceId: 'trace_context_state_wrong_replacement',
      reasonCode: 'wrong_class'
    }),
    error => {
      assert.equal(error?.name, 'ValidationError');
      assert.match(error.message, /match the original evidence class and issuer/);
      return true;
    }
  );

  const replacement = replacementPolicyEvidence();
  admit(setup.store, replacement, 'replacement');
  const state = setup.store.supersedeContextAuthorityEvidence({
    evidenceId: 'evidence_policy_1',
    replacementEvidenceId: 'evidence_policy_2',
    actor: 'context_admin_1',
    traceId: 'trace_context_state_supersede',
    reasonCode: 'newer_policy'
  });
  assert.equal(state.current_status, 'superseded');
  assert.equal(state.transition.replacement_evidence_id, 'evidence_policy_2');

  assert.throws(
    () => setup.store.compileContextCapsuleFromAdmittedEvidence(
      compileArgs(set)
    ),
    error => error?.code === 'context_authority_evidence_superseded'
  );

  const replacementSet = {
    ...set,
    policyDecisionEvidence: replacement
  };
  const compiled = setup.store.compileContextCapsuleFromAdmittedEvidence(
    compileArgs(replacementSet, { capsuleId: 'capsule_context_state_replacement' })
  );
  assert.equal(compiled.authority_evidence_admission_verified, true);
});

test('materialized transition corruption is repaired deterministically from encrypted Grid history', async t => {
  const setup = await storeFixture();
  t.after(async () => {
    setup.store.close();
    await rm(setup.root, { recursive: true, force: true });
  });
  const set = evidenceSet();
  admitAll(setup.store, set);
  setup.store.revokeContextAuthorityEvidence({
    evidenceId: 'evidence_policy_1',
    actor: 'context_admin_1',
    traceId: 'trace_context_state_rebuild',
    reasonCode: 'owner_revoked'
  });

  setup.store.db.prepare(`
    UPDATE context_authority_evidence_state_transitions
    SET reason_code = ?
    WHERE evidence_id = ?
  `).run('corrupted_reason', 'evidence_policy_1');
  assert.equal(
    setup.store.getContextAuthorityEvidenceTransition('evidence_policy_1')
      .reason_code,
    'corrupted_reason'
  );

  setup.store.rebuildContextAuthorityEvidenceState();
  assert.equal(
    setup.store.getContextAuthorityEvidenceTransition('evidence_policy_1')
      .reason_code,
    'owner_revoked'
  );
});

test('terminal state survives restart while immutable admission provenance remains present', async t => {
  const setup = await storeFixture();
  t.after(async () => {
    try { setup.store.close(); } catch {}
    await rm(setup.root, { recursive: true, force: true });
  });
  const set = evidenceSet();
  admitAll(setup.store, set);
  const admission = setup.store.getContextAuthorityEvidenceAdmission(
    'evidence_policy_1'
  );
  setup.store.revokeContextAuthorityEvidence({
    evidenceId: 'evidence_policy_1',
    actor: 'context_admin_1',
    traceId: 'trace_context_state_restart',
    reasonCode: 'owner_revoked'
  });
  setup.store.close();

  setup.store = reopen(setup);
  const state = setup.store.getContextAuthorityEvidenceState('evidence_policy_1');
  assert.equal(state.current_status, 'revoked');
  assert.equal(state.admitted_event_id, admission.admitted_event_id);
  assert.equal(state.transition.reason_code, 'owner_revoked');
  assert.equal(state.authority_effect, 'none');
  assert.equal(state.transition.authority_effect, 'deny-only');
});

test('state runtime advertises deny-only semantics without claiming vault or execution authority', async t => {
  const setup = await storeFixture();
  t.after(async () => {
    setup.store.close();
    await rm(setup.root, { recursive: true, force: true });
  });
  const status = setup.store.getStatus();
  assert.equal(
    status.context_authority_state_runtime,
    'append-only-terminal-deny-state-transitions'
  );
  assert.equal(status.context_authority_state_grants_authority, false);
});
