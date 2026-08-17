import assert from 'node:assert/strict';
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { digestObject } from '../src/lib/canonical.mjs';
import { ensureMeshIdentity } from '../src/lib/identity.mjs';
import { intentRequestDigest } from '../src/lib/intent-binding.mjs';
import { DataProtector } from '../src/lib/protector.mjs';
import {
  REMOTE_SOCIAL_ADMISSION_ACTION,
  REMOTE_SOCIAL_ADMISSION_DATA_SCOPE,
  REMOTE_SOCIAL_ADMISSION_PURPOSE,
  remoteSocialAdmissionIntentInputFromStage
} from '../src/lib/remote-social-admission-authority.mjs';
import { PUBLICATION_PERSONA_SCHEMA } from '../src/identity/actor-state.mjs';
import {
  createPublicPersonaProjection,
  createSocialPublicationProjection
} from '../src/lib/social-publication.mjs';
import { createSocialExchangePackage } from '../src/lib/social-exchange-package.mjs';
import { buildRemoteSocialAdmissionRequest } from '../src/grid/remote-social-admission-store.mjs';
import {
  REMOTE_SOCIAL_RUNTIME_ADMISSION_EVENT,
  REMOTE_SOCIAL_RUNTIME_ADMISSION_SCHEMA,
  RemoteSocialRuntimeGridStore
} from '../src/grid/remote-social-runtime-store.mjs';

function iso(offsetMs) {
  return new Date(Date.now() + offsetMs).toISOString();
}

function exporterKeys() {
  const pair = generateKeyPairSync('ed25519');
  return {
    privateKey: pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    publicKey: pair.publicKey.export({ type: 'spki', format: 'pem' }).toString()
  };
}

function remotePackageFixture({ suffix = 'runtime' } = {}) {
  const exporter = exporterKeys();
  const persona = {
    schema: PUBLICATION_PERSONA_SCHEMA,
    persona_id: `persona-remote-${suffix}`,
    controller_actor_id: `actor-private-remote-${suffix}`,
    represented_actor_id: null,
    attribution_mode: 'pseudonymous',
    public_actor_link: null,
    selective_link_commitment: null,
    delegation_authority_digest: null,
    created_at: iso(-300_000),
    status: 'active'
  };
  const publicPersona = createPublicPersonaProjection(persona);
  const publication = createSocialPublicationProjection({
    publication_id: `publication-remote-${suffix}`,
    content: {
      media_type: 'text/plain',
      text: `Remote runtime observation ${suffix} is not local authorship.`
    },
    attachment_digests: [],
    audience: { mode: 'public' },
    discoverability: 'listed',
    authorship_mode: 'human-authored',
    created_at: iso(-240_000),
    supersedes_digest: null
  }, { persona });
  const packageValue = createSocialExchangePackage({
    personas: [publicPersona],
    publications: [publication],
    transitions: [],
    exporterGridId: `grid-remote-${suffix}`,
    exporterPrivateKey: exporter.privateKey,
    exporterPublicKey: exporter.publicKey,
    createdAt: iso(-180_000),
    now: Date.now()
  });
  return { exporter, packageValue };
}

async function storeFixture() {
  const root = await mkdtemp(join(tmpdir(), 'axiom-remote-social-runtime-'));
  const dataDir = join(root, 'data');
  const identity = await ensureMeshIdentity(dataDir, 'grid', { create: true });
  const key = randomBytes(32);
  const protector = new DataProtector(key);
  const path = join(dataDir, 'grid.sqlite');
  const store = new RemoteSocialRuntimeGridStore({ path, dataDir, identity, protector });
  return { root, dataDir, identity, key, protector, path, store };
}

function stage(store, data, {
  owner = 'principal-local-owner',
  trustLabel = 'manual-review'
} = {}) {
  return store.stageRemoteSocialPackage({
    owner,
    package: data.packageValue,
    trustedExporterPublicKey: data.exporter.publicKey,
    expectedExporterGridId: data.packageValue.statement.exporter.grid_id,
    trustLabel,
    stagedAt: iso(-120_000),
    expiresAt: iso(1_800_000),
    now: Date.now()
  });
}

function runtimeIntent(staged, {
  owner = staged.owner,
  principalType = 'human',
  input = remoteSocialAdmissionIntentInputFromStage(staged)
} = {}) {
  return {
    action: REMOTE_SOCIAL_ADMISSION_ACTION,
    input,
    purpose: REMOTE_SOCIAL_ADMISSION_PURPOSE,
    data_scopes: [REMOTE_SOCIAL_ADMISSION_DATA_SCOPE],
    principal: { id: owner, type: principalType }
  };
}

function grantRuntimeAuthority(store, staged, {
  intent = runtimeIntent(staged),
  intentId = 'intent-remote-social-runtime-admit-1',
  approvalId = 'approval-remote-social-runtime-admit-1',
  approver = 'principal-independent-reviewer'
} = {}) {
  const requestDigest = intentRequestDigest(intent);
  store.appendEvents({
    traceId: 'trace-runtime-admit-intent',
    actor: staged.owner,
    events: [{
      kind: 'intent.accepted',
      subject: intentId,
      payload: {
        intent_id: intentId,
        principal: staged.owner,
        action: REMOTE_SOCIAL_ADMISSION_ACTION,
        risk: 'high',
        input_digest: digestObject(intent.input),
        request_digest: requestDigest
      }
    }]
  });
  store.appendEvents({
    traceId: 'trace-runtime-admit-approval',
    actor: approver,
    events: [{
      kind: 'approval.granted',
      subject: approvalId,
      payload: {
        approval_id: approvalId,
        approver,
        requester: staged.owner,
        action: REMOTE_SOCIAL_ADMISSION_ACTION,
        request_digest: requestDigest,
        expires_at: iso(2_400_000)
      }
    }]
  });
  return { intent, intentId, approvalId, requestDigest };
}

function grantLegacyAuthority(store, staged, {
  intentId = 'intent-remote-social-legacy-admit-1',
  approvalId = 'approval-remote-social-legacy-admit-1',
  approver = 'principal-independent-reviewer-legacy'
} = {}) {
  const resolved = buildRemoteSocialAdmissionRequest(staged);
  store.appendEvents({
    traceId: 'trace-legacy-admit-intent',
    actor: staged.owner,
    events: [{
      kind: 'intent.accepted',
      subject: intentId,
      payload: {
        intent_id: intentId,
        principal: staged.owner,
        action: REMOTE_SOCIAL_ADMISSION_ACTION,
        risk: 'high',
        input_digest: digestObject({ stage_id: staged.stage_id }),
        request_digest: resolved.request_digest
      }
    }]
  });
  store.appendEvents({
    traceId: 'trace-legacy-admit-approval',
    actor: approver,
    events: [{
      kind: 'approval.granted',
      subject: approvalId,
      payload: {
        approval_id: approvalId,
        approver,
        requester: staged.owner,
        action: REMOTE_SOCIAL_ADMISSION_ACTION,
        request_digest: resolved.request_digest,
        expires_at: iso(2_400_000)
      }
    }]
  });
  return { intentId, approvalId };
}

test('runtime store remains opt-in, no-egress and dual-bound', async t => {
  const setup = await storeFixture();
  t.after(async () => {
    setup.store.close();
    await rm(setup.root, { recursive: true, force: true });
  });
  const status = setup.store.getStatus().remote_social_runtime_store;
  assert.equal(status.activation_state, 'opt-in-local-laboratory');
  assert.equal(status.intent_authority_binding, 'ordinary-intent-request-digest');
  assert.equal(status.resolved_materialization_binding, 's3d-resolved-request-digest');
  assert.equal(status.requester_principal_type, 'human');
  assert.equal(status.independent_approval_required, true);
  assert.equal(status.approval_consumption, 'atomic-with-admission');
  assert.equal(status.network_egress, false);
  assert.equal(status.transport_included, false);
  assert.equal(status.public_routes, false);
});

test('real intent digest and resolved package digest atomically admit one remote observation set', async t => {
  const setup = await storeFixture();
  t.after(async () => {
    setup.store.close();
    await rm(setup.root, { recursive: true, force: true });
  });
  const staged = stage(setup.store, remotePackageFixture());
  const authority = grantRuntimeAuthority(setup.store, staged);
  const resolved = buildRemoteSocialAdmissionRequest(staged);
  assert.notEqual(authority.requestDigest, resolved.request_digest);

  const admission = setup.store.admitRemoteSocialStageWithIntent({
    owner: staged.owner,
    stageId: staged.stage_id,
    intent: authority.intent,
    intentId: authority.intentId,
    approvalId: authority.approvalId,
    traceId: 'trace-runtime-admit-commit',
    now: Date.now()
  });

  assert.equal(admission.status, 'admitted');
  assert.equal(admission.request_digest, resolved.request_digest);
  assert.equal(admission.summary_json.intent_request_digest, authority.requestDigest);
  assert.equal(admission.summary_json.resolved_request_digest, resolved.request_digest);
  assert.equal(admission.remote_observation_only, true);
  assert.equal(admission.local_authorship_claimed, false);
  assert.equal(admission.network_effect, 'none');
  assert.equal(admission.authority_effect, 'none');

  const approval = setup.store.db.prepare(`
    SELECT status, consumed_by_intent FROM approvals WHERE approval_id = ?
  `).get(authority.approvalId);
  assert.equal(approval.status, 'consumed');
  assert.equal(approval.consumed_by_intent, authority.intentId);

  const tail = setup.store.db.prepare(`
    SELECT kind FROM events ORDER BY seq DESC LIMIT 2
  `).all().reverse();
  assert.deepEqual(tail.map(row => row.kind), [
    'approval.consumed',
    REMOTE_SOCIAL_RUNTIME_ADMISSION_EVENT
  ]);
  assert.equal(setup.store.listRemoteSocialObservations(staged.owner).observations.length, 2);
  assert.equal(setup.store.listSocialCorpus(staged.owner).publications.length, 0);
});

test('stage-summary substitution fails before approval consumption or admission', async t => {
  const setup = await storeFixture();
  t.after(async () => {
    setup.store.close();
    await rm(setup.root, { recursive: true, force: true });
  });
  const staged = stage(setup.store, remotePackageFixture());
  const wrongInput = {
    ...remoteSocialAdmissionIntentInputFromStage(staged),
    trust_label: 'second-review'
  };
  const intent = runtimeIntent(staged, { input: wrongInput });
  const authority = grantRuntimeAuthority(setup.store, staged, { intent });

  assert.throws(
    () => setup.store.admitRemoteSocialStageWithIntent({
      owner: staged.owner,
      stageId: staged.stage_id,
      intent,
      intentId: authority.intentId,
      approvalId: authority.approvalId,
      traceId: 'trace-runtime-admit-substitution',
      now: Date.now()
    }),
    /does not match the exact staged review summary/
  );
  assert.equal(setup.store.db.prepare(`
    SELECT status FROM approvals WHERE approval_id = ?
  `).get(authority.approvalId).status, 'active');
  assert.equal(setup.store.db.prepare(`
    SELECT COUNT(*) AS count FROM events WHERE kind = ?
  `).get(REMOTE_SOCIAL_RUNTIME_ADMISSION_EVENT).count, 0);
});

test('runtime admission requires the exact canonical human owner principal type', async t => {
  const setup = await storeFixture();
  t.after(async () => {
    setup.store.close();
    await rm(setup.root, { recursive: true, force: true });
  });
  const staged = stage(setup.store, remotePackageFixture());
  const humanIntent = runtimeIntent(staged);
  assert.equal(humanIntent.principal.type, 'human');
  assert.equal(humanIntent.principal.kind, undefined);

  const intent = runtimeIntent(staged, { principalType: 'agent' });
  const authority = grantRuntimeAuthority(setup.store, staged, { intent });
  assert.throws(
    () => setup.store.admitRemoteSocialStageWithIntent({
      owner: staged.owner,
      stageId: staged.stage_id,
      intent,
      intentId: authority.intentId,
      approvalId: authority.approvalId,
      traceId: 'trace-runtime-admit-agent-denied',
      now: Date.now()
    }),
    error => error?.code === 'remote_social_runtime_admission_principal_unavailable'
  );
  assert.equal(setup.store.db.prepare(`
    SELECT status FROM approvals WHERE approval_id = ?
  `).get(authority.approvalId).status, 'active');
});

test('mixed legacy v1 and runtime v2 admissions rebuild together in event order', async t => {
  const setup = await storeFixture();
  t.after(async () => {
    try { setup.store.close(); } catch {}
    await rm(setup.root, { recursive: true, force: true });
  });

  const firstStage = stage(setup.store, remotePackageFixture({ suffix: 'legacy-first' }));
  const legacy = grantLegacyAuthority(setup.store, firstStage);
  setup.store.admitRemoteSocialStage({
    owner: firstStage.owner,
    stageId: firstStage.stage_id,
    intentId: legacy.intentId,
    approvalId: legacy.approvalId,
    traceId: 'trace-legacy-admit-commit',
    now: Date.now()
  });

  const secondStage = stage(setup.store, remotePackageFixture({ suffix: 'runtime-second' }));
  const runtime = grantRuntimeAuthority(setup.store, secondStage, {
    intentId: 'intent-runtime-second',
    approvalId: 'approval-runtime-second'
  });
  const runtimeAdmission = setup.store.admitRemoteSocialStageWithIntent({
    owner: secondStage.owner,
    stageId: secondStage.stage_id,
    intent: runtime.intent,
    intentId: runtime.intentId,
    approvalId: runtime.approvalId,
    traceId: 'trace-runtime-second-commit',
    now: Date.now()
  });

  const before = setup.store.listRemoteSocialAdmissions(firstStage.owner, { limit: 10 });
  assert.equal(before.admissions.length, 2);
  assert.equal(
    before.admissions.find(item => item.admission_id === runtimeAdmission.admission_id)
      .summary_json.intent_request_digest,
    runtime.requestDigest
  );

  setup.store.close();
  setup.store = new RemoteSocialRuntimeGridStore({
    path: setup.path,
    dataDir: setup.dataDir,
    identity: setup.identity,
    protector: setup.protector
  });

  const after = setup.store.listRemoteSocialAdmissions(firstStage.owner, { limit: 10 });
  assert.equal(after.admissions.length, 2);
  assert.equal(setup.store.listRemoteSocialObservations(firstStage.owner, { limit: 10 }).observations.length, 4);
  assert.equal(
    after.admissions.find(item => item.admission_id === runtimeAdmission.admission_id)
      .summary_json.intent_request_digest,
    runtime.requestDigest
  );
});

test('runtime admission event schema is explicit and distinct from legacy S3D evidence', () => {
  assert.equal(REMOTE_SOCIAL_RUNTIME_ADMISSION_SCHEMA, 'axiom-remote-social-admission.v2');
  assert.equal(REMOTE_SOCIAL_RUNTIME_ADMISSION_EVENT, 'remote.social.admitted.runtime');
});
