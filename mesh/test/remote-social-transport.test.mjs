import assert from 'node:assert/strict';
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { PUBLICATION_PERSONA_SCHEMA } from '../src/identity/actor-state.mjs';
import { ensureMeshIdentity } from '../src/lib/identity.mjs';
import { DataProtector } from '../src/lib/protector.mjs';
import {
  createPublicPersonaProjection,
  createSocialPublicationProjection
} from '../src/lib/social-publication.mjs';
import { createSocialExchangePackage } from '../src/lib/social-exchange-package.mjs';
import {
  createSocialTransportEnvelope,
  verifySocialTransportEnvelope
} from '../src/lib/social-transport-envelope.mjs';
import { RemoteSocialGridStore } from '../src/grid/remote-social-store.mjs';
import { RemoteSocialTransportGridStore } from '../src/grid/remote-social-transport-store.mjs';

const T0 = '2026-08-17T03:40:00.000Z';
const T1 = '2026-08-17T03:41:00.000Z';
const T2 = '2026-08-17T03:42:00.000Z';
const NOW_ISO = '2026-08-17T03:50:00.000Z';
const EXPIRES = '2026-08-17T04:50:00.000Z';
const NOW = Date.parse(NOW_ISO);
const SOURCE = 'https://social-source.example';
const TOKEN = 'source-read-token-'.padEnd(48, 'x');
const OWNER = 'principal-local-reviewer';

function keys() {
  const pair = generateKeyPairSync('ed25519');
  return {
    privateKey: pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    publicKey: pair.publicKey.export({ type: 'spki', format: 'pem' }).toString()
  };
}

function fixture() {
  const exporter = keys();
  const transport = keys();
  const persona = {
    schema: PUBLICATION_PERSONA_SCHEMA,
    persona_id: 'persona-remote-one',
    controller_actor_id: 'actor-private-remote-one',
    represented_actor_id: null,
    attribution_mode: 'pseudonymous',
    public_actor_link: null,
    selective_link_commitment: null,
    delegation_authority_digest: null,
    created_at: T0,
    status: 'active'
  };
  const publicPersona = createPublicPersonaProjection(persona);
  const publication = createSocialPublicationProjection({
    publication_id: 'publication-remote-one',
    content: {
      media_type: 'text/plain',
      text: 'Transport can stage this public projection, but it cannot admit it.'
    },
    attachment_digests: [],
    audience: { mode: 'public' },
    discoverability: 'listed',
    authorship_mode: 'human-authored',
    created_at: T1,
    supersedes_digest: null
  }, { persona });
  const packageValue = createSocialExchangePackage({
    personas: [publicPersona],
    publications: [publication],
    transitions: [],
    exporterGridId: 'grid-exporter-one',
    exporterPrivateKey: exporter.privateKey,
    exporterPublicKey: exporter.publicKey,
    createdAt: T2,
    now: NOW
  });
  return { exporter, transport, persona, publicPersona, publication, packageValue };
}

async function createStore(t, StoreClass = RemoteSocialTransportGridStore) {
  const root = await mkdtemp(join(tmpdir(), 'axiom-social-transport-'));
  const dataDir = join(root, 'data');
  const identity = await ensureMeshIdentity(dataDir, 'grid', { create: true });
  const protector = new DataProtector(randomBytes(32));
  const path = join(dataDir, 'grid.sqlite');
  const store = new StoreClass({ path, dataDir, identity, protector });
  t.after(async () => {
    try { store.close(); } catch {}
    await rm(root, { recursive: true, force: true });
  });
  return { root, dataDir, identity, protector, path, store };
}

function queue(store, data, overrides = {}) {
  return store.queueRemoteSocialTransportJob({
    owner: OWNER,
    sourceOrigin: SOURCE,
    packageDigest: data.packageValue.package_digest,
    trustedTransportPublicKey: data.transport.publicKey,
    trustedExporterPublicKey: data.exporter.publicKey,
    expectedExporterGridId: 'grid-exporter-one',
    trustLabel: 'manually-reviewed',
    plannedAt: NOW_ISO,
    expiresAt: EXPIRES,
    maximumAttempts: 3,
    retryBaseMs: 1_000,
    retryMaximumMs: 8_000,
    now: NOW,
    ...overrides
  });
}

function successfulFetch(data, {
  sentAt = NOW_ISO,
  transport = data.transport,
  packageValue = data.packageValue,
  assertRequest = true,
  calls
} = {}) {
  return async (url, init) => {
    if (calls) calls.count += 1;
    const nonce = init.headers['x-axiom-social-request-nonce'];
    if (assertRequest) {
      assert.equal(
        url,
        `${SOURCE}/v1/social/exchange/packages/${data.packageValue.package_digest}`
      );
      assert.equal(init.method, 'GET');
      assert.equal(init.redirect, 'error');
      assert.equal(init.headers.authorization, `Bearer ${TOKEN}`);
      assert.match(nonce, /^[A-Za-z0-9_-]{16,192}$/);
    }
    const envelope = createSocialTransportEnvelope({
      package: packageValue,
      sourceOrigin: SOURCE,
      transportPrivateKey: transport.privateKey,
      transportPublicKey: transport.publicKey,
      requestNonce: nonce,
      sentAt,
      now: Date.parse(sentAt)
    });
    return new Response(JSON.stringify(envelope), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  };
}

async function process(store, job, data, overrides = {}) {
  return store.processRemoteSocialTransportJob({
    owner: OWNER,
    jobId: job.job_id,
    sourceReadToken: TOKEN,
    trustedTransportPublicKey: data.transport.publicKey,
    trustedExporterPublicKey: data.exporter.publicKey,
    fetchImpl: successfulFetch(data),
    requestTimeoutMs: 2_000,
    now: NOW,
    ...overrides
  });
}

test('transport envelope independently pins source, package bytes, exporter ids, nonce, and claim limits', () => {
  const data = fixture();
  const nonce = 'request-nonce-1234567890';
  const envelope = createSocialTransportEnvelope({
    package: data.packageValue,
    sourceOrigin: SOURCE,
    transportPrivateKey: data.transport.privateKey,
    transportPublicKey: data.transport.publicKey,
    requestNonce: nonce,
    sentAt: NOW_ISO,
    now: NOW
  });
  const verified = verifySocialTransportEnvelope(envelope, {
    trustedTransportPublicKey: data.transport.publicKey,
    expectedSourceOrigin: SOURCE,
    expectedPackageDigest: data.packageValue.package_digest,
    expectedExporterGridId: 'grid-exporter-one',
    expectedExporterKeyId: data.packageValue.statement.exporter.key_id,
    expectedRequestNonce: nonce,
    now: NOW
  });
  assert.equal(verified.valid, true);
  assert.equal(verified.statement.package_digest, data.packageValue.package_digest);
  assert.equal(verified.delivery_claimed, false);
  assert.equal(verified.admission_claimed, false);
  assert.equal(verified.federation_claimed, false);
  assert.equal(verified.authority_effect, 'none');

  const other = keys();
  assert.throws(
    () => verifySocialTransportEnvelope(envelope, {
      trustedTransportPublicKey: other.publicKey,
      expectedRequestNonce: nonce,
      now: NOW
    }),
    /trusted transport key/
  );
  assert.throws(
    () => verifySocialTransportEnvelope(envelope, {
      trustedTransportPublicKey: data.transport.publicKey,
      expectedRequestNonce: 'different-request-nonce-12345',
      now: NOW
    }),
    /current request nonce/
  );
  const tampered = structuredClone(envelope);
  tampered.package.statement.publications[0].content.text = 'tampered';
  assert.throws(
    () => verifySocialTransportEnvelope(tampered, {
      trustedTransportPublicKey: data.transport.publicKey,
      expectedRequestNonce: nonce,
      now: NOW
    }),
    /package digest|package byte digest/
  );
});

test('S3F transport is opt-in above staging and cannot invoke admission or following', async t => {
  const base = await createStore(t, RemoteSocialGridStore);
  assert.equal(base.store.db.prepare(`
    SELECT 1 FROM sqlite_master
    WHERE type = 'table' AND name = 'remote_social_transport_jobs'
  `).get(), undefined);
  assert.equal(typeof base.store.queueRemoteSocialTransportJob, 'undefined');
  assert.equal(typeof base.store.processRemoteSocialTransportJob, 'undefined');

  const transport = await createStore(t);
  const status = transport.store.getStatus();
  assert.equal(status.remote_social_transport_schema_version, 1);
  assert.equal(status.remote_social_transport_runtime, 'pinned-package-fetch-laboratory');
  assert.equal(typeof transport.store.admitRemoteSocialStage, 'undefined');
  assert.equal(typeof transport.store.followRemotePersona, 'undefined');
  assert.equal(typeof transport.store.getChronologicalFollowing, 'undefined');
  assert.equal(transport.store.db.prepare(`
    SELECT 1 FROM sqlite_master
    WHERE type = 'table' AND name = 'remote_social_admissions'
  `).get(), undefined);
});

test('verified pinned fetch stages only review state and persists no bearer token or public key PEM', async t => {
  const data = fixture();
  const setup = await createStore(t);
  const job = queue(setup.store, data);
  const calls = { count: 0 };
  const result = await setup.store.processRemoteSocialTransportJob({
    owner: OWNER,
    jobId: job.job_id,
    sourceReadToken: TOKEN,
    trustedTransportPublicKey: data.transport.publicKey,
    trustedExporterPublicKey: data.exporter.publicKey,
    fetchImpl: successfulFetch(data, { calls }),
    requestTimeoutMs: 2_000,
    now: NOW
  });
  assert.equal(calls.count, 1);
  assert.equal(result.status, 'staged');
  assert.match(result.stage_id, /^remote_stage_/);
  assert.equal(result.automatic_admission, false);
  assert.equal(result.automatic_follow, false);
  assert.equal(result.receipt_json.transport_effect, 'verified-source-fetch');
  assert.equal(result.receipt_json.staging_effect, 'review-stage-created-or-confirmed');
  assert.equal(result.receipt_json.admission_effect, 'none');
  assert.equal(result.receipt_json.follow_effect, 'none');
  assert.equal(result.receipt_json.federation_effect, 'none');
  assert.equal(result.receipt_json.authority_effect, 'none');

  const stage = setup.store.getRemoteSocialStage(OWNER, result.stage_id);
  assert.equal(stage.package_digest, data.packageValue.package_digest);
  assert.equal(stage.materialization_effect, 'none');
  assert.equal(stage.network_effect, 'none');
  assert.equal(stage.authority_effect, 'none');
  assert.equal(setup.store.listSocialCorpus(OWNER).publications.length, 0);
  assert.equal(setup.store.db.prepare('SELECT COUNT(*) AS count FROM social_publications').get().count, 0);
  assert.equal(setup.store.db.prepare('SELECT COUNT(*) AS count FROM publication_personas').get().count, 0);

  const raw = setup.store.db.prepare(`
    SELECT review_json, receipt_json FROM remote_social_transport_jobs WHERE job_id = ?
  `).get(job.job_id);
  assert.equal(setup.protector.isProtected(raw.review_json), true);
  assert.equal(setup.protector.isProtected(raw.receipt_json), true);
  const serializedDbRow = JSON.stringify(
    setup.store.db.prepare('SELECT * FROM remote_social_transport_jobs WHERE job_id = ?').get(job.job_id)
  );
  assert.equal(serializedDbRow.includes(TOKEN), false);
  assert.equal(serializedDbRow.includes(data.transport.publicKey), false);
  assert.equal(serializedDbRow.includes(data.exporter.publicKey), false);
});

test('transport signature/key substitution is terminal and cannot create a stage', async t => {
  const data = fixture();
  const wrongTransport = keys();
  const setup = await createStore(t);
  const job = queue(setup.store, data);
  await assert.rejects(
    () => setup.store.processRemoteSocialTransportJob({
      owner: OWNER,
      jobId: job.job_id,
      sourceReadToken: TOKEN,
      trustedTransportPublicKey: data.transport.publicKey,
      trustedExporterPublicKey: data.exporter.publicKey,
      fetchImpl: successfulFetch(data, { transport: wrongTransport }),
      now: NOW
    }),
    /trusted transport key|transport key/
  );
  const failed = setup.store.getRemoteSocialTransportJob(OWNER, job.job_id);
  assert.equal(failed.status, 'blocked');
  assert.equal(failed.attempts, 1);
  assert.equal(failed.last_error_code, 'remote_social_transport_evidence_invalid');
  assert.equal(setup.store.listRemoteSocialStages(OWNER).stages.length, 0);
});

test('exporter-key substitution is terminal even when transport signature is valid', async t => {
  const data = fixture();
  const wrongExporter = keys();
  const setup = await createStore(t);
  const job = queue(setup.store, data, {
    trustedExporterPublicKey: wrongExporter.publicKey
  });
  await assert.rejects(
    () => setup.store.processRemoteSocialTransportJob({
      owner: OWNER,
      jobId: job.job_id,
      sourceReadToken: TOKEN,
      trustedTransportPublicKey: data.transport.publicKey,
      trustedExporterPublicKey: wrongExporter.publicKey,
      fetchImpl: successfulFetch(data),
      now: NOW
    }),
    /exporter key/
  );
  const failed = setup.store.getRemoteSocialTransportJob(OWNER, job.job_id);
  assert.equal(failed.status, 'blocked');
  assert.equal(failed.last_error_code, 'remote_social_transport_evidence_invalid');
  assert.equal(setup.store.listRemoteSocialStages(OWNER).stages.length, 0);
});

test('transient source failure backs off without admission and later succeeds idempotently', async t => {
  const data = fixture();
  const setup = await createStore(t);
  const job = queue(setup.store, data);
  await assert.rejects(
    () => setup.store.processRemoteSocialTransportJob({
      owner: OWNER,
      jobId: job.job_id,
      sourceReadToken: TOKEN,
      trustedTransportPublicKey: data.transport.publicKey,
      trustedExporterPublicKey: data.exporter.publicKey,
      fetchImpl: async () => { throw new Error('offline'); },
      now: NOW
    }),
    error => error?.code === 'remote_social_transport_source_unavailable'
  );
  const failed = setup.store.getRemoteSocialTransportJob(OWNER, job.job_id);
  assert.equal(failed.status, 'pending');
  assert.equal(failed.attempts, 1);
  assert.equal(failed.next_attempt_at, '2026-08-17T03:50:01.000Z');
  assert.equal(setup.store.listRemoteSocialStages(OWNER).stages.length, 0);

  await assert.rejects(
    () => setup.store.processRemoteSocialTransportJob({
      owner: OWNER,
      jobId: job.job_id,
      sourceReadToken: TOKEN,
      trustedTransportPublicKey: data.transport.publicKey,
      trustedExporterPublicKey: data.exporter.publicKey,
      fetchImpl: async () => { throw new Error('must not be called during backoff'); },
      now: NOW + 500
    }),
    error => error?.code === 'remote_social_transport_backing_off'
  );
  assert.equal(
    setup.store.getRemoteSocialTransportJob(OWNER, job.job_id).attempts,
    1
  );

  const retryIso = '2026-08-17T03:50:01.000Z';
  const calls = { count: 0 };
  const success = await setup.store.processRemoteSocialTransportJob({
    owner: OWNER,
    jobId: job.job_id,
    sourceReadToken: TOKEN,
    trustedTransportPublicKey: data.transport.publicKey,
    trustedExporterPublicKey: data.exporter.publicKey,
    fetchImpl: successfulFetch(data, { sentAt: retryIso, calls }),
    now: NOW + 1_000
  });
  assert.equal(success.status, 'staged');
  assert.equal(success.attempts, 1);
  assert.equal(calls.count, 1);

  const second = await setup.store.processRemoteSocialTransportJob({
    owner: OWNER,
    jobId: job.job_id,
    sourceReadToken: TOKEN,
    trustedTransportPublicKey: data.transport.publicKey,
    trustedExporterPublicKey: data.exporter.publicKey,
    fetchImpl: async () => {
      calls.count += 1;
      throw new Error('completed job must not refetch');
    },
    now: NOW + 2_000
  });
  assert.equal(second.status, 'staged');
  assert.equal(calls.count, 1);
  assert.equal(setup.store.listRemoteSocialStages(OWNER).stages.length, 1);
});

test('maximum transient failures block the job without ever staging', async t => {
  const data = fixture();
  const setup = await createStore(t);
  const job = queue(setup.store, data, { maximumAttempts: 2 });
  const fail = async () => { throw new Error('offline'); };
  for (const now of [NOW, NOW + 1_000]) {
    await assert.rejects(
      () => setup.store.processRemoteSocialTransportJob({
        owner: OWNER,
        jobId: job.job_id,
        sourceReadToken: TOKEN,
        trustedTransportPublicKey: data.transport.publicKey,
        trustedExporterPublicKey: data.exporter.publicKey,
        fetchImpl: fail,
        now
      }),
      error => error?.code === 'remote_social_transport_source_unavailable'
    );
  }
  const blocked = setup.store.getRemoteSocialTransportJob(OWNER, job.job_id);
  assert.equal(blocked.status, 'blocked');
  assert.equal(blocked.attempts, 2);
  assert.equal(blocked.next_attempt_at, null);
  assert.equal(setup.store.listRemoteSocialStages(OWNER).stages.length, 0);
});

test('review expiry blocks before network access and exact queue replay is stable', async t => {
  const data = fixture();
  const setup = await createStore(t);
  const shortExpiry = '2026-08-17T03:50:01.000Z';
  const first = queue(setup.store, data, { expiresAt: shortExpiry });
  const replay = queue(setup.store, data, { expiresAt: shortExpiry });
  assert.equal(replay.job_id, first.job_id);
  let called = false;
  await assert.rejects(
    () => setup.store.processRemoteSocialTransportJob({
      owner: OWNER,
      jobId: first.job_id,
      sourceReadToken: TOKEN,
      trustedTransportPublicKey: data.transport.publicKey,
      trustedExporterPublicKey: data.exporter.publicKey,
      fetchImpl: async () => {
        called = true;
        throw new Error('expired review must not fetch');
      },
      now: NOW + 2_000
    }),
    error => error?.code === 'remote_social_transport_review_expired'
  );
  assert.equal(called, false);
  assert.equal(
    setup.store.getRemoteSocialTransportJob(OWNER, first.job_id).status,
    'blocked'
  );
});

test('transport configuration fails closed on insecure origins and shared trust roots', async t => {
  const data = fixture();
  const setup = await createStore(t);
  assert.throws(
    () => queue(setup.store, data, { sourceOrigin: 'http://social-source.example' }),
    /exact HTTPS origin/
  );
  assert.throws(
    () => queue(setup.store, data, { sourceOrigin: 'https://social-source.example/path' }),
    /exact HTTPS origin/
  );
  assert.throws(
    () => queue(setup.store, data, {
      trustedTransportPublicKey: data.exporter.publicKey
    }),
    /different keys/
  );
});
