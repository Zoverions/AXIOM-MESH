import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { CIRCLE_INVITATION_SCHEMA } from '../src/lib/circle-core.mjs';
import { digestObject } from '../src/lib/canonical.mjs';
import { ensureMeshIdentity } from '../src/lib/identity.mjs';
import { loadDataProtector } from '../src/lib/protector.mjs';
import { CircleGridStore } from '../src/grid/circle-store.mjs';
import { getCircleGridPersistencePolicy } from '../src/grid/circle-persistence-state.mjs';
import {
  commitCirclePersistenceWithAdmission,
  issueCircleGridAdmissionCapability,
  verifyCircleGridAdmissionReceipt
} from '../src/grid/circle-admission.mjs';

const CIRCLE_ID = 'circle.admission.receipt';
const ACTOR = 'human.alpha';
const CHARTER_DIGEST = digestObject({ schema: 'test-charter.v0', circle_id: CIRCLE_ID });
const HISTORICAL_POLICY_DIGEST = digestObject({ schema: 'test-historical-policy.v0' });
const CHARTER_POLICY_DIGEST = digestObject({ schema: 'test-charter-policy.v0' });
const INTENT_DIGEST = digestObject({ schema: 'test-intent.v0' });
const PLAN_DIGEST = digestObject({ schema: 'test-plan.v0' });
const POLICY_DIGEST = digestObject({ schema: 'test-policy.v0' });

function buildEvent() {
  const policy = getCircleGridPersistencePolicy();
  const issuedAt = '2026-08-20T12:02:00.000Z';
  const boundAt = '2026-08-20T12:03:00.000Z';
  const record = {
    schema: CIRCLE_INVITATION_SCHEMA,
    invitation_id: 'invite.admission.receipt.1',
    circle_id: CIRCLE_ID,
    invited_principal: 'human.member.1',
    membership_class: 'member',
    role_ids: ['member'],
    issued_by: ACTOR,
    issued_at: issuedAt,
    expires_at: '2026-08-21T12:02:00.000Z',
    charter_digest: CHARTER_DIGEST,
    one_use: true,
    authority_effect: 'none'
  };
  const binding = {
    schema: 'axiom-circle-historical-rule-binding.v0',
    binding_id: 'binding.invitation.admission.receipt.1',
    circle_id: CIRCLE_ID,
    record_type: 'invitation',
    record_id: record.invitation_id,
    record_digest: digestObject(record),
    record,
    event_time: issuedAt,
    bound_at: boundAt,
    previous_binding_digest: null,
    basis_binding_id: null,
    binding_mode: 'resolve-at-event',
    governing_charter_digest: CHARTER_DIGEST,
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  };
  const bindingDigest = digestObject(binding);
  const payload = {
    schema: policy.schemas.payload,
    circle_id: CIRCLE_ID,
    binding_id: binding.binding_id,
    binding_digest: bindingDigest,
    binding,
    record_type: binding.record_type,
    record_id: binding.record_id,
    record_digest: binding.record_digest,
    governing_charter_digest: CHARTER_DIGEST,
    previous_circle_binding_digest: null,
    resulting_circle_head_digest: bindingDigest,
    historical_ledger_prefix_digest: digestObject({
      schema: 'test-circle-historical-prefix.v0',
      circle_id: CIRCLE_ID,
      head_binding_digest: bindingDigest
    }),
    historical_ledger_prefix_length: 1,
    charter_lifecycle_prefix_digest: digestObject({
      schema: 'test-circle-charter-prefix.v0',
      circle_id: CIRCLE_ID,
      charter_digest: CHARTER_DIGEST
    }),
    charter_lifecycle_prefix_length: 1,
    persistence_policy_digest: digestObject(policy),
    historical_policy_digest: HISTORICAL_POLICY_DIGEST,
    charter_policy_digest: CHARTER_POLICY_DIGEST,
    runtime_authority: false,
    portable_authority: false,
    authority_effect: 'none',
    network_effect: 'none'
  };
  const eventIdentityDigest = digestObject({
    schema: 'axiom-circle-grid-persistence-event-identity.v0',
    circle_id: CIRCLE_ID,
    binding_digest: bindingDigest
  });
  return {
    event_id: `${policy.event_id_prefix}${eventIdentityDigest}`,
    kind: policy.grid_event_kind,
    subject: CIRCLE_ID,
    payload
  };
}

async function fixture(t) {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-circle-admission-receipt-'));
  const hypervisor = await ensureMeshIdentity(dataDir, 'hypervisor', { create: true });
  const grid = await ensureMeshIdentity(dataDir, 'grid', { create: true });
  const protector = await loadDataProtector({ dataDir, autoBootstrap: true });
  const store = new CircleGridStore({
    path: join(dataDir, 'grid.sqlite'),
    dataDir,
    identity: grid,
    protector,
    checkpointInterval: 10_000
  });
  t.after(async () => {
    try { store.close(); } catch {}
    await rm(dataDir, { recursive: true, force: true });
  });
  return { hypervisor, grid, store };
}

function eventHash(event) {
  return digestObject({
    seq: event.seq,
    event_id: event.event_id,
    trace_id: event.trace_id,
    actor: event.actor,
    kind: event.kind,
    subject: event.subject,
    occurred_at: event.occurred_at,
    payload_digest: event.payload_digest,
    prev_hash: event.prev_hash
  });
}

test('admission receipt verifier authenticates the signed Grid event envelope, not only a claimed chain result', async t => {
  const { hypervisor, grid, store } = await fixture(t);
  const event = buildEvent();
  const nowSeconds = Math.floor(Date.now() / 1000);
  const issued = issueCircleGridAdmissionCapability(hypervisor, {
    actor: ACTOR,
    event,
    intentDigest: INTENT_DIGEST,
    planDigest: PLAN_DIGEST,
    policyDigest: POLICY_DIGEST,
    nowSeconds,
    ttlSeconds: 120
  });
  const committed = commitCirclePersistenceWithAdmission({
    store,
    hypervisorPublicKey: hypervisor.publicKey,
    capability: issued.capability,
    actor: ACTOR,
    event,
    nowSeconds,
    maxTtlSeconds: 120
  });

  const verified = verifyCircleGridAdmissionReceipt(committed.receipt, {
    gridPublicKey: grid.publicKey,
    hypervisorPublicKey: hypervisor.publicKey,
    capability: issued.capability,
    actor: ACTOR,
    event,
    gridEvent: committed.event,
    chainVerification: store.verifyFullChain(),
    maxTtlSeconds: 120
  });
  assert.equal(verified.chain_verified, true);

  const synthetic = structuredClone(committed.event);
  synthetic.actor = 'human.synthetic';
  synthetic.event_hash = eventHash(synthetic);
  assert.throws(
    () => verifyCircleGridAdmissionReceipt(committed.receipt, {
      gridPublicKey: grid.publicKey,
      hypervisorPublicKey: hypervisor.publicKey,
      capability: issued.capability,
      actor: ACTOR,
      event,
      gridEvent: synthetic,
      chainVerification: { valid: true, events: synthetic.seq },
      maxTtlSeconds: 120
    }),
    error => (
      error.code === 'circle_persistence_admission_grid_event_invalid'
      && error.status === 503
      && /signature/i.test(error.message)
    )
  );
});

test('admission receipt verifier rejects event-hash and optional decoded-payload tampering before trusting chain metadata', async t => {
  const { hypervisor, grid, store } = await fixture(t);
  const event = buildEvent();
  const nowSeconds = Math.floor(Date.now() / 1000);
  const issued = issueCircleGridAdmissionCapability(hypervisor, {
    actor: ACTOR,
    event,
    intentDigest: INTENT_DIGEST,
    planDigest: PLAN_DIGEST,
    policyDigest: POLICY_DIGEST,
    nowSeconds,
    ttlSeconds: 120
  });
  const committed = commitCirclePersistenceWithAdmission({
    store,
    hypervisorPublicKey: hypervisor.publicKey,
    capability: issued.capability,
    actor: ACTOR,
    event,
    nowSeconds,
    maxTtlSeconds: 120
  });

  const brokenEnvelope = structuredClone(committed.event);
  brokenEnvelope.kind = 'circle.synthetic.forgery';
  assert.throws(
    () => verifyCircleGridAdmissionReceipt(committed.receipt, {
      gridPublicKey: grid.publicKey,
      hypervisorPublicKey: hypervisor.publicKey,
      capability: issued.capability,
      actor: ACTOR,
      event,
      gridEvent: brokenEnvelope,
      chainVerification: { valid: true, events: brokenEnvelope.seq },
      maxTtlSeconds: 120
    }),
    error => error.code === 'circle_persistence_admission_grid_event_invalid'
  );

  const decoded = { ...structuredClone(committed.event), payload: structuredClone(event.payload) };
  decoded.payload.binding_id = 'binding.tampered';
  assert.throws(
    () => verifyCircleGridAdmissionReceipt(committed.receipt, {
      gridPublicKey: grid.publicKey,
      hypervisorPublicKey: hypervisor.publicKey,
      capability: issued.capability,
      actor: ACTOR,
      event,
      gridEvent: decoded,
      chainVerification: { valid: true, events: decoded.seq },
      maxTtlSeconds: 120
    }),
    error => (
      error.code === 'circle_persistence_admission_grid_event_invalid'
      && /payload digest/i.test(error.message)
    )
  );
});
