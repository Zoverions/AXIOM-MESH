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
  CONTEXT_AUTHORITY_EVIDENCE_ADMITTED_EVENT
} from '../src/grid/context-authority-admission-store.mjs';
import {
  ContextAuthorityCompilerGridStore
} from '../src/grid/context-authority-admitted-compiler.mjs';

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

function policyDecision() {
  return {
    schema: 'axiom-context-disclosure-policy-decision.v1',
    decision_ref: 'policy_decision_1',
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

function allEvidence(set) {
  return [
    set.policyDecisionEvidence,
    ...set.leaseEvidence,
    ...set.accessReceiptEvidence,
    ...set.revocationCheckEvidence
  ];
}

async function storeFixture() {
  const root = await mkdtemp(join(tmpdir(), 'axiom-context-admitted-compile-'));
  const dataDir = join(root, 'data');
  const identity = await ensureMeshIdentity(dataDir, 'grid', { create: true });
  const key = randomBytes(32);
  const path = join(dataDir, 'grid.sqlite');
  const store = new ContextAuthorityCompilerGridStore({
    path,
    dataDir,
    identity,
    protector: new DataProtector(key),
    contextAuthorityTrustPins: trustPins()
  });
  return { root, dataDir, identity, key, path, store };
}

function admit(store, envelope, index) {
  return store.admitContextAuthorityEvidence({
    envelope,
    actor: 'context_broker_1',
    traceId: `trace_context_admitted_compile_${index}`,
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
    capsuleId: 'capsule_admitted_1',
    issuedAt: iso(),
    localProvenanceReceiptRefs: ['provenance_1'],
    now: NOW,
    ...overrides
  };
}

test('local context compilation fails closed until every signed authority envelope is admitted', async t => {
  const setup = await storeFixture();
  t.after(async () => {
    setup.store.close();
    await rm(setup.root, { recursive: true, force: true });
  });
  const set = evidenceSet();

  assert.throws(
    () => setup.store.compileContextCapsuleFromAdmittedEvidence(
      compileArgs(set)
    ),
    error => error?.code === 'context_authority_evidence_not_admitted'
  );

  admit(setup.store, set.policyDecisionEvidence, 'policy');
  assert.throws(
    () => setup.store.compileContextCapsuleFromAdmittedEvidence(
      compileArgs(set)
    ),
    error => error?.code === 'context_authority_evidence_not_admitted'
  );

  admitAll(setup.store, set);
  const result = setup.store.compileContextCapsuleFromAdmittedEvidence(
    compileArgs(set)
  );

  assert.equal(result.authority_evidence_verified, true);
  assert.equal(result.authority_evidence_admission_verified, true);
  assert.deepEqual(result.authority_evidence_admission_ids, [
    'evidence_lease_1',
    'evidence_policy_1',
    'evidence_receipt_1',
    'evidence_revocation_1'
  ]);
  assert.equal(result.authority_evidence_admission_event_ids.length, 4);
  assert.equal(result.authority_evidence_registry_persistent, true);
  assert.equal(result.authority_evidence_registry_consumes_leases, false);
  assert.equal(result.authority_evidence_registry_issues_authority, false);
  assert.equal(result.authority_evidence_registry_reads_vaults, false);
  assert.equal(result.authority_evidence_registry_delivers_capsule, false);
  assert.equal(result.capsule.disclosures.length, 1);
  assert.equal(result.grants_vault_access, false);
  assert.equal(result.grants_execution_authority, false);

  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /vault_health_1/);
  assert.doesNotMatch(serialized, /record_accessibility_1/);
  assert.doesNotMatch(serialized, /BEGIN PUBLIC KEY/);
  assert.doesNotMatch(serialized, /"signature":/);
});

test('admitted authority evidence remains non-consuming across separate compilations', async t => {
  const setup = await storeFixture();
  t.after(async () => {
    setup.store.close();
    await rm(setup.root, { recursive: true, force: true });
  });
  const set = evidenceSet();
  admitAll(setup.store, set);

  const first = setup.store.compileContextCapsuleFromAdmittedEvidence(
    compileArgs(set, { capsuleId: 'capsule_admitted_first' })
  );
  const second = setup.store.compileContextCapsuleFromAdmittedEvidence(
    compileArgs(set, { capsuleId: 'capsule_admitted_second' })
  );

  assert.equal(
    first.authority_evidence_admission_bundle_sha256,
    second.authority_evidence_admission_bundle_sha256
  );
  assert.deepEqual(
    first.authority_evidence_admission_ids,
    second.authority_evidence_admission_ids
  );
  assert.equal(setup.store.db.prepare(`
    SELECT COUNT(*) AS count
    FROM context_authority_evidence_admissions
  `).get().count, 4);
  assert.equal(setup.store.db.prepare(`
    SELECT COUNT(*) AS count
    FROM events
    WHERE kind = ?
  `).get(CONTEXT_AUTHORITY_EVIDENCE_ADMITTED_EVENT).count, 4);
});

test('materialized admission binding corruption blocks compilation until deterministic rebuild', async t => {
  const setup = await storeFixture();
  t.after(async () => {
    setup.store.close();
    await rm(setup.root, { recursive: true, force: true });
  });
  const set = evidenceSet();
  admitAll(setup.store, set);

  setup.store.db.prepare(`
    UPDATE context_authority_evidence_admissions
    SET envelope_sha256 = ?
    WHERE evidence_id = ?
  `).run('f'.repeat(64), 'evidence_policy_1');

  assert.throws(
    () => setup.store.compileContextCapsuleFromAdmittedEvidence(
      compileArgs(set)
    ),
    error => error?.code === 'context_authority_evidence_binding_mismatch'
  );

  setup.store.rebuildContextAuthorityAdmissionState();
  const result = setup.store.compileContextCapsuleFromAdmittedEvidence(
    compileArgs(set)
  );
  assert.equal(result.authority_evidence_admission_verified, true);
});

test('historically admitted but expired evidence cannot authorize a current compilation', async t => {
  const setup = await storeFixture();
  t.after(async () => {
    setup.store.close();
    await rm(setup.root, { recursive: true, force: true });
  });
  const set = evidenceSet();
  admitAll(setup.store, set);

  assert.throws(
    () => setup.store.compileContextCapsuleFromAdmittedEvidence(
      compileArgs(set, {
        issuedAt: iso(1_860_000),
        now: NOW + 1_860_000
      })
    ),
    error => {
      assert.equal(error?.name, 'ValidationError');
      assert.match(error.message, /not currently valid/);
      return true;
    }
  );
});

test('compiler runtime advertises admission requirement without claiming new authority', async t => {
  const setup = await storeFixture();
  t.after(async () => {
    setup.store.close();
    await rm(setup.root, { recursive: true, force: true });
  });

  const status = setup.store.getStatus();
  assert.equal(
    status.context_authority_compiler_runtime,
    'current-signed-and-persistently-admitted-evidence-required'
  );
  assert.equal(
    status.context_authority_admission_runtime,
    'verified-append-only-replay-resistant-registry'
  );
});
