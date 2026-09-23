import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { CIRCLE_INVITATION_SCHEMA } from '../src/lib/circle-core.mjs';
import { digestObject } from '../src/lib/canonical.mjs';
import {
  ensureMeshIdentity,
  issueCapability
} from '../src/lib/identity.mjs';
import { loadDataProtector } from '../src/lib/protector.mjs';
import { CircleGridStore } from '../src/grid/circle-store.mjs';
import { getCircleGridPersistencePolicy } from '../src/grid/circle-persistence-state.mjs';
import {
  commitCirclePersistenceWithAdmission,
  deriveCircleGridAdmissionInvocationDigest,
  deriveCircleGridAdmissionJti,
  deriveCircleGridAdmissionTraceId,
  getCircleGridAdmissionPolicy,
  issueCircleGridAdmissionCapability,
  validateCircleGridAdmissionPolicy,
  verifyCircleGridAdmissionCapability,
  verifyCircleGridAdmissionReceipt
} from '../src/grid/circle-admission.mjs';

const CIRCLE_ID = 'circle.admission';
const ACTOR = 'human.alpha';
const OTHER_ACTOR = 'human.beta';
const CHARTER_DIGEST = digestObject({ schema: 'test-charter.v0', circle_id: CIRCLE_ID });
const HISTORICAL_POLICY_DIGEST = digestObject({ schema: 'test-historical-policy.v0' });
const CHARTER_POLICY_DIGEST = digestObject({ schema: 'test-charter-policy.v0' });
const INTENT_DIGEST = digestObject({ schema: 'test-intent.v0', action: 'circle-persist' });
const PLAN_DIGEST = digestObject({ schema: 'test-plan.v0', step: 'persist' });
const POLICY_DIGEST = digestObject({ schema: 'test-policy.v0', decision: 'allow' });

function bindingTime(index) {
  return new Date(Date.UTC(2026, 7, 20, 12, index * 2)).toISOString();
}

function boundTime(index) {
  return new Date(Date.UTC(2026, 7, 20, 12, index * 2 + 1)).toISOString();
}

function buildCirclePersistenceEvent({ index = 1, previous = null, circleId = CIRCLE_ID } = {}) {
  const persistencePolicy = getCircleGridPersistencePolicy();
  const invitationId = `invite.admission.${index}`;
  const bindingId = `binding.invitation.admission.${index}`;
  const record = {
    schema: CIRCLE_INVITATION_SCHEMA,
    invitation_id: invitationId,
    circle_id: circleId,
    invited_principal: `human.member.${index}`,
    membership_class: 'member',
    role_ids: ['member'],
    issued_by: ACTOR,
    issued_at: bindingTime(index),
    expires_at: new Date(Date.UTC(2026, 7, 21, 12, index)).toISOString(),
    charter_digest: CHARTER_DIGEST,
    one_use: true,
    authority_effect: 'none'
  };
  const binding = {
    schema: 'axiom-circle-historical-rule-binding.v0',
    binding_id: bindingId,
    circle_id: circleId,
    record_type: 'invitation',
    record_id: invitationId,
    record_digest: digestObject(record),
    record,
    event_time: bindingTime(index),
    bound_at: boundTime(index),
    previous_binding_digest: previous,
    basis_binding_id: null,
    binding_mode: 'resolve-at-event',
    governing_charter_digest: CHARTER_DIGEST,
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  };
  const bindingDigest = digestObject(binding);
  const eventIdentityDigest = digestObject({
    schema: 'axiom-circle-grid-persistence-event-identity.v0',
    circle_id: circleId,
    binding_digest: bindingDigest
  });
  const payload = {
    schema: persistencePolicy.schemas.payload,
    circle_id: circleId,
    binding_id: bindingId,
    binding_digest: bindingDigest,
    binding,
    record_type: binding.record_type,
    record_id: binding.record_id,
    record_digest: binding.record_digest,
    governing_charter_digest: CHARTER_DIGEST,
    previous_circle_binding_digest: previous,
    resulting_circle_head_digest: bindingDigest,
    historical_ledger_prefix_digest: digestObject({
      schema: 'test-circle-historical-prefix.v0',
      circle_id: circleId,
      length: index,
      head_binding_digest: bindingDigest
    }),
    historical_ledger_prefix_length: index,
    charter_lifecycle_prefix_digest: digestObject({
      schema: 'test-circle-charter-prefix.v0',
      circle_id: circleId,
      charter_digest: CHARTER_DIGEST
    }),
    charter_lifecycle_prefix_length: 1,
    persistence_policy_digest: digestObject(persistencePolicy),
    historical_policy_digest: HISTORICAL_POLICY_DIGEST,
    charter_policy_digest: CHARTER_POLICY_DIGEST,
    runtime_authority: false,
    portable_authority: false,
    authority_effect: 'none',
    network_effect: 'none'
  };
  return {
    event: {
      event_id: `${persistencePolicy.event_id_prefix}${eventIdentityDigest}`,
      kind: persistencePolicy.grid_event_kind,
      subject: circleId,
      payload
    },
    bindingDigest
  };
}

async function fixture(t) {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-circle-admission-'));
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
  return { dataDir, hypervisor, grid, store };
}

function grant(hypervisor, event, {
  actor = ACTOR,
  nowSeconds = Math.floor(Date.now() / 1000),
  ttlSeconds = 120
} = {}) {
  return issueCircleGridAdmissionCapability(hypervisor, {
    actor,
    event,
    intentDigest: INTENT_DIGEST,
    planDigest: PLAN_DIGEST,
    policyDigest: POLICY_DIGEST,
    nowSeconds,
    ttlSeconds
  });
}

function eventCount(store) {
  return Number(store.db.prepare('SELECT COUNT(*) AS count FROM events').get().count);
}

test('Circle Grid admission policy is exact, inert, and not wired into runtime routes', async () => {
  const policy = getCircleGridAdmissionPolicy();
  assert.equal(validateCircleGridAdmissionPolicy(policy), true);
  assert.equal(policy.runtime_activation, false);
  assert.equal(policy.authority_effect, 'none');
  assert.equal(policy.requirements.public_grid_route, false);
  assert.equal(policy.requirements.gateway_route, false);
  assert.equal(policy.requirements.hypervisor_runtime_route, false);
  assert.equal(policy.requirements.circle_decision_authority, false);
  assert.equal(policy.requirements.external_effect_authority, false);

  const gridServer = await readFile(new URL('../src/grid/server.mjs', import.meta.url), 'utf8');
  const hypervisorServer = await readFile(new URL('../src/hypervisor/server.mjs', import.meta.url), 'utf8');
  for (const source of [gridServer, hypervisorServer]) {
    assert.doesNotMatch(source, /circle-admission\.mjs/);
    assert.doesNotMatch(source, /commitCirclePersistenceWithAdmission/);
    assert.doesNotMatch(source, /circle\.persistence\.append/);
  }
});

test('Hypervisor-issued admission capability is exactly actor/event/audience/tool constrained', async t => {
  const { hypervisor } = await fixture(t);
  const { event } = buildCirclePersistenceEvent();
  const nowSeconds = Math.floor(Date.now() / 1000);
  const issued = grant(hypervisor, event, { nowSeconds });
  const verified = verifyCircleGridAdmissionCapability(
    issued.capability,
    hypervisor.publicKey,
    { actor: ACTOR, event, nowSeconds, maxTtlSeconds: 120 }
  );

  assert.equal(verified.claims.iss, 'hypervisor');
  assert.equal(verified.claims.aud, 'grid');
  assert.equal(verified.claims.subject, ACTOR);
  assert.equal(verified.claims.tool, 'circle.persistence.append');
  assert.equal(verified.claims.jti, deriveCircleGridAdmissionJti(ACTOR, event));
  assert.equal(
    verified.claims.invocation_digest,
    deriveCircleGridAdmissionInvocationDigest(ACTOR, event)
  );
  assert.equal(verified.claims.constraints.circle_id, CIRCLE_ID);
  assert.equal(verified.claims.constraints.event_id, event.event_id);
  assert.equal(verified.claims.constraints.payload_digest, digestObject(event.payload));
  assert.equal(verified.claims.constraints.runtime_authority, false);
  assert.equal(verified.claims.constraints.portable_authority, false);
  assert.equal(verified.claims.constraints.external_effect_authority, false);
});

test('admission capability rejects wrong actor, event substitution, hidden event fields, and hidden constraints', async t => {
  const { hypervisor } = await fixture(t);
  const { event } = buildCirclePersistenceEvent({ index: 1 });
  const { event: otherEvent } = buildCirclePersistenceEvent({ index: 2 });
  const nowSeconds = Math.floor(Date.now() / 1000);
  const issued = grant(hypervisor, event, { nowSeconds });

  assert.throws(
    () => verifyCircleGridAdmissionCapability(issued.capability, hypervisor.publicKey, {
      actor: OTHER_ACTOR,
      event,
      nowSeconds,
      maxTtlSeconds: 120
    }),
    error => error.code === 'circle_persistence_admission_mismatch'
  );
  assert.throws(
    () => verifyCircleGridAdmissionCapability(issued.capability, hypervisor.publicKey, {
      actor: ACTOR,
      event: otherEvent,
      nowSeconds,
      maxTtlSeconds: 120
    }),
    /admission_mismatch|constraint|bound/i
  );
  assert.throws(
    () => issueCircleGridAdmissionCapability(hypervisor, {
      actor: ACTOR,
      event: { ...event, hidden: true },
      intentDigest: INTENT_DIGEST,
      planDigest: PLAN_DIGEST,
      policyDigest: POLICY_DIGEST,
      nowSeconds,
      ttlSeconds: 120
    }),
    /fields are invalid/
  );

  const hiddenClaims = structuredClone(issued.claims);
  hiddenClaims.constraints.hidden_authority = true;
  const hiddenToken = issueCapability(hypervisor, hiddenClaims);
  assert.throws(
    () => verifyCircleGridAdmissionCapability(hiddenToken, hypervisor.publicKey, {
      actor: ACTOR,
      event,
      nowSeconds,
      maxTtlSeconds: 120
    }),
    /constraints.*fields are invalid/i
  );
});

test('admission capability rejects wrong signer, wrong audience, expiry, and excessive local TTL', async t => {
  const { hypervisor, grid } = await fixture(t);
  const { event } = buildCirclePersistenceEvent();
  const nowSeconds = Math.floor(Date.now() / 1000);
  const issued = grant(hypervisor, event, { nowSeconds });

  const wrongSigner = issueCapability(grid, issued.claims);
  assert.throws(
    () => verifyCircleGridAdmissionCapability(wrongSigner, hypervisor.publicKey, {
      actor: ACTOR,
      event,
      nowSeconds,
      maxTtlSeconds: 120
    }),
    error => error.code === 'invalid_capability_signature'
  );

  const wrongAudienceClaims = { ...structuredClone(issued.claims), aud: 'sandbox' };
  const wrongAudience = issueCapability(hypervisor, wrongAudienceClaims);
  assert.throws(
    () => verifyCircleGridAdmissionCapability(wrongAudience, hypervisor.publicKey, {
      actor: ACTOR,
      event,
      nowSeconds,
      maxTtlSeconds: 120
    }),
    error => error.code === 'invalid_capability_audience'
  );

  const expired = grant(hypervisor, event, { nowSeconds: nowSeconds - 200, ttlSeconds: 30 });
  assert.throws(
    () => verifyCircleGridAdmissionCapability(expired.capability, hypervisor.publicKey, {
      actor: ACTOR,
      event,
      nowSeconds,
      maxTtlSeconds: 120
    }),
    error => error.code === 'expired_capability'
  );

  assert.throws(
    () => verifyCircleGridAdmissionCapability(issued.capability, hypervisor.publicKey, {
      actor: ACTOR,
      event,
      nowSeconds,
      maxTtlSeconds: 301
    }),
    /local TTL limit/
  );
});

test('admitted Circle append binds capability digest into signed Grid trace and returns verifiable receipt', async t => {
  const { hypervisor, grid, store } = await fixture(t);
  const { event, bindingDigest } = buildCirclePersistenceEvent();
  const nowSeconds = Math.floor(Date.now() / 1000);
  const issued = grant(hypervisor, event, { nowSeconds });
  const committed = commitCirclePersistenceWithAdmission({
    store,
    hypervisorPublicKey: hypervisor.publicKey,
    capability: issued.capability,
    actor: ACTOR,
    event,
    nowSeconds,
    maxTtlSeconds: 120
  });

  assert.equal(committed.event.actor, ACTOR);
  assert.equal(committed.event.trace_id, deriveCircleGridAdmissionTraceId(issued.capability));
  assert.equal(committed.event.event_id, event.event_id);
  assert.equal(committed.receipt.statement.binding_digest, bindingDigest);
  assert.equal(committed.receipt.statement.capability_digest, issued.capability
    ? deriveCircleGridAdmissionTraceId(issued.capability).slice('circle_cap_'.length)
    : null);
  assert.equal(committed.receipt.statement.runtime_authority, false);
  assert.equal(committed.receipt.statement.external_effect_authority, false);
  assert.equal(store.getCirclePersistenceHead(CIRCLE_ID).head_binding_digest, bindingDigest);
  assert.equal(store.verifyFullChain().valid, true);
  assert.equal(
    store.db.prepare("SELECT COUNT(*) AS count FROM events WHERE kind = 'capability.consumed'").get().count,
    0
  );

  const verifiedReceipt = verifyCircleGridAdmissionReceipt(committed.receipt, {
    gridPublicKey: grid.publicKey,
    hypervisorPublicKey: hypervisor.publicKey,
    capability: issued.capability,
    actor: ACTOR,
    event,
    gridEvent: committed.event,
    chainVerification: store.verifyFullChain(),
    maxTtlSeconds: 120
  });
  assert.equal(verifiedReceipt.receipt_digest, committed.receipt_digest);
  assert.equal(verifiedReceipt.chain_verified, true);
  assert.equal(verifiedReceipt.runtime_authority, false);
});

test('same exact capability replay is idempotent and does not advance Grid or Circle head', async t => {
  const { hypervisor, store } = await fixture(t);
  const { event, bindingDigest } = buildCirclePersistenceEvent();
  const nowSeconds = Math.floor(Date.now() / 1000);
  const issued = grant(hypervisor, event, { nowSeconds });

  const first = commitCirclePersistenceWithAdmission({
    store,
    hypervisorPublicKey: hypervisor.publicKey,
    capability: issued.capability,
    actor: ACTOR,
    event,
    nowSeconds,
    maxTtlSeconds: 120
  });
  const replay = commitCirclePersistenceWithAdmission({
    store,
    hypervisorPublicKey: hypervisor.publicKey,
    capability: issued.capability,
    actor: ACTOR,
    event: structuredClone(event),
    nowSeconds,
    maxTtlSeconds: 120
  });

  assert.equal(replay.event.seq, first.event.seq);
  assert.equal(replay.event.event_hash, first.event.event_hash);
  assert.equal(eventCount(store), 1);
  assert.equal(store.getCirclePersistenceHead(CIRCLE_ID).head_binding_digest, bindingDigest);
});

test('a reissued token for the same event cannot impersonate the durable admission fingerprint', async t => {
  const { hypervisor, store } = await fixture(t);
  const { event } = buildCirclePersistenceEvent();
  const nowSeconds = Math.floor(Date.now() / 1000);
  const firstGrant = grant(hypervisor, event, { nowSeconds, ttlSeconds: 120 });
  const secondGrant = grant(hypervisor, event, { nowSeconds: nowSeconds + 1, ttlSeconds: 120 });
  assert.equal(firstGrant.claims.jti, secondGrant.claims.jti);
  assert.notEqual(firstGrant.capability, secondGrant.capability);

  commitCirclePersistenceWithAdmission({
    store,
    hypervisorPublicKey: hypervisor.publicKey,
    capability: firstGrant.capability,
    actor: ACTOR,
    event,
    nowSeconds: nowSeconds + 1,
    maxTtlSeconds: 120
  });
  assert.throws(
    () => commitCirclePersistenceWithAdmission({
      store,
      hypervisorPublicKey: hypervisor.publicKey,
      capability: secondGrant.capability,
      actor: ACTOR,
      event,
      nowSeconds: nowSeconds + 1,
      maxTtlSeconds: 120
    }),
    error => error.code === 'circle_persistence_admission_replay_mismatch' && error.status === 409
  );
  assert.equal(eventCount(store), 1);
});

test('same deterministic Circle event cannot be replayed as a different admitted actor', async t => {
  const { hypervisor, store } = await fixture(t);
  const { event } = buildCirclePersistenceEvent();
  const nowSeconds = Math.floor(Date.now() / 1000);
  const alpha = grant(hypervisor, event, { actor: ACTOR, nowSeconds });
  const beta = grant(hypervisor, event, { actor: OTHER_ACTOR, nowSeconds });

  commitCirclePersistenceWithAdmission({
    store,
    hypervisorPublicKey: hypervisor.publicKey,
    capability: alpha.capability,
    actor: ACTOR,
    event,
    nowSeconds,
    maxTtlSeconds: 120
  });
  assert.throws(
    () => commitCirclePersistenceWithAdmission({
      store,
      hypervisorPublicKey: hypervisor.publicKey,
      capability: beta.capability,
      actor: OTHER_ACTOR,
      event,
      nowSeconds,
      maxTtlSeconds: 120
    }),
    error => error.code === 'circle_persistence_admission_replay_mismatch' && error.status === 409
  );
  assert.equal(eventCount(store), 1);
});

test('admission receipt cannot replace Grid chain verification or survive receipt tampering', async t => {
  const { hypervisor, grid, store } = await fixture(t);
  const { event } = buildCirclePersistenceEvent();
  const nowSeconds = Math.floor(Date.now() / 1000);
  const issued = grant(hypervisor, event, { nowSeconds });
  const committed = commitCirclePersistenceWithAdmission({
    store,
    hypervisorPublicKey: hypervisor.publicKey,
    capability: issued.capability,
    actor: ACTOR,
    event,
    nowSeconds,
    maxTtlSeconds: 120
  });

  assert.throws(
    () => verifyCircleGridAdmissionReceipt(committed.receipt, {
      gridPublicKey: grid.publicKey,
      hypervisorPublicKey: hypervisor.publicKey,
      capability: issued.capability,
      actor: ACTOR,
      event,
      gridEvent: committed.event,
      chainVerification: { valid: false, events: 1 },
      maxTtlSeconds: 120
    }),
    /requires Grid chain verification/
  );

  const tampered = structuredClone(committed.receipt);
  tampered.statement.actor = OTHER_ACTOR;
  assert.throws(
    () => verifyCircleGridAdmissionReceipt(tampered, {
      gridPublicKey: grid.publicKey,
      hypervisorPublicKey: hypervisor.publicKey,
      capability: issued.capability,
      actor: ACTOR,
      event,
      gridEvent: committed.event,
      chainVerification: store.verifyFullChain(),
      maxTtlSeconds: 120
    }),
    error => error.code === 'invalid_circle_persistence_admission_receipt'
  );
});
