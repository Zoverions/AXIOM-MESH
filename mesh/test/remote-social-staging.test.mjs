import assert from 'node:assert/strict';
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { ensureMeshIdentity } from '../src/lib/identity.mjs';
import { DataProtector } from '../src/lib/protector.mjs';
import { PUBLICATION_PERSONA_SCHEMA } from '../src/identity/actor-state.mjs';
import {
  createPublicPersonaProjection,
  createSocialPublicationProjection
} from '../src/lib/social-publication.mjs';
import { createSocialExchangePackage } from '../src/lib/social-exchange-package.mjs';
import { SocialGridStore } from '../src/grid/social-store.mjs';
import {
  REMOTE_SOCIAL_STAGE_SCHEMA,
  RemoteSocialGridStore
} from '../src/grid/remote-social-store.mjs';

const T0 = '2026-08-16T18:00:00.000Z';
const T1 = '2026-08-16T18:01:00.000Z';
const T2 = '2026-08-16T18:02:00.000Z';
const T3 = '2026-08-16T18:03:00.000Z';
const T4 = '2026-08-16T19:03:00.000Z';
const NOW = Date.parse(T3);

function exporterKeys() {
  const pair = generateKeyPairSync('ed25519');
  return {
    privateKey: pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    publicKey: pair.publicKey.export({ type: 'spki', format: 'pem' }).toString()
  };
}

function packageFixture() {
  const exporter = exporterKeys();
  const persona = {
    schema: PUBLICATION_PERSONA_SCHEMA,
    persona_id: 'persona-remote-zov',
    controller_actor_id: 'actor-private-remote-zov',
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
      text: 'This remote package is staged for review, not admitted into a feed.'
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
    exporterGridId: 'grid-remote-exporter',
    exporterPrivateKey: exporter.privateKey,
    exporterPublicKey: exporter.publicKey,
    createdAt: T2,
    now: NOW
  });
  return { exporter, persona, publicPersona, publication, packageValue };
}

async function storeFixture(StoreClass = RemoteSocialGridStore) {
  const root = await mkdtemp(join(tmpdir(), 'axiom-remote-social-stage-'));
  const dataDir = join(root, 'data');
  const identity = await ensureMeshIdentity(dataDir, 'grid', { create: true });
  const key = randomBytes(32);
  const protector = new DataProtector(key);
  const path = join(dataDir, 'grid.sqlite');
  const store = new StoreClass({ path, dataDir, identity, protector });
  return { root, dataDir, identity, key, protector, path, store };
}

function stageInput(data, overrides = {}) {
  return {
    owner: 'principal-local-reviewer',
    package: data.packageValue,
    trustedExporterPublicKey: data.exporter.publicKey,
    expectedExporterGridId: 'grid-remote-exporter',
    trustLabel: 'manual-review',
    stagedAt: T3,
    expiresAt: T4,
    now: NOW,
    ...overrides
  };
}

test('ordinary SocialGridStore does not create or activate remote social staging', async t => {
  const setup = await storeFixture(SocialGridStore);
  t.after(async () => {
    setup.store.close();
    await rm(setup.root, { recursive: true, force: true });
  });

  assert.equal(setup.store.getStatus().schema_version, 10);
  assert.equal(setup.store.getStatus().social_schema_version, 1);
  assert.equal(setup.store.db.prepare(`
    SELECT 1 FROM sqlite_master
    WHERE type = 'table' AND name = 'remote_social_staging'
  `).get(), undefined);
  assert.equal(setup.store.db.prepare(`
    SELECT 1 FROM sqlite_master
    WHERE type = 'table' AND name = 'remote_social_schema_migrations'
  `).get(), undefined);
  assert.equal(typeof setup.store.stageRemoteSocialPackage, 'undefined');
});

test('opt-in RemoteSocialGridStore creates a separate review-only schema after local social schema', async t => {
  const setup = await storeFixture();
  t.after(async () => {
    setup.store.close();
    await rm(setup.root, { recursive: true, force: true });
  });

  const status = setup.store.getStatus();
  assert.equal(status.schema_version, 10);
  assert.equal(status.social_schema_version, 1);
  assert.equal(status.remote_social_schema_version, 1);
  assert.equal(status.remote_social_runtime, 'review-staging-laboratory');
  const ledger = setup.store.db.prepare(`
    SELECT version, name, checksum
    FROM remote_social_schema_migrations ORDER BY version
  `).all();
  assert.equal(ledger.length, 1);
  assert.equal(ledger[0].version, 1);
  assert.equal(ledger[0].name, 'encrypted-review-only-remote-social-staging');
  assert.match(ledger[0].checksum, /^[a-f0-9]{64}$/);
});

test('verified remote package is staged encrypted and does not materialize into local corpus', async t => {
  const data = packageFixture();
  const setup = await storeFixture();
  t.after(async () => {
    setup.store.close();
    await rm(setup.root, { recursive: true, force: true });
  });

  const stage = setup.store.stageRemoteSocialPackage(stageInput(data));
  assert.equal(stage.schema, REMOTE_SOCIAL_STAGE_SCHEMA);
  assert.equal(stage.owner, 'principal-local-reviewer');
  assert.equal(stage.package_digest, data.packageValue.package_digest);
  assert.equal(stage.exporter_grid_id, 'grid-remote-exporter');
  assert.equal(stage.trust_label, 'manual-review');
  assert.equal(stage.status, 'staged');
  assert.equal(stage.import_plan_json.requires_operator_approval, true);
  assert.equal(stage.import_plan_json.status, 'review-only');
  assert.equal(stage.materialization_effect, 'none');
  assert.equal(stage.network_effect, 'none');
  assert.equal(stage.authority_effect, 'none');

  const raw = setup.store.db.prepare(`
    SELECT package_json, import_plan_json, trusted_exporter_json
    FROM remote_social_staging WHERE stage_id = ?
  `).get(stage.stage_id);
  for (const serialized of Object.values(raw)) {
    assert.equal(setup.protector.isProtected(serialized), true);
    assert.equal(serialized.includes('staged for review'), false);
    assert.equal(serialized.includes('BEGIN PUBLIC KEY'), false);
    assert.equal(serialized.includes('principal-local-reviewer'), false);
  }

  const local = setup.store.listSocialCorpus('principal-local-reviewer');
  assert.equal(local.publications.length, 0);
  assert.equal(local.transitions.length, 0);
  assert.equal(setup.store.db.prepare('SELECT COUNT(*) AS count FROM social_publications').get().count, 0);
  assert.equal(setup.store.db.prepare('SELECT COUNT(*) AS count FROM publication_personas').get().count, 0);
});

test('remote social staging is owner scoped and bounded', async t => {
  const data = packageFixture();
  const setup = await storeFixture();
  t.after(async () => {
    setup.store.close();
    await rm(setup.root, { recursive: true, force: true });
  });

  const stage = setup.store.stageRemoteSocialPackage(stageInput(data));
  assert.equal(setup.store.listRemoteSocialStages('principal-local-reviewer').stages.length, 1);
  assert.equal(setup.store.listRemoteSocialStages('principal-other').stages.length, 0);
  assert.throws(
    () => setup.store.getRemoteSocialStage('principal-other', stage.stage_id),
    error => error?.code === 'remote_social_stage_not_found'
  );
  assert.throws(
    () => setup.store.listRemoteSocialStages('principal-local-reviewer', { limit: 101 }),
    /must be an integer between 1 and 100/
  );
});

test('same exact review plan is idempotent while conflicting review metadata fails closed', async t => {
  const data = packageFixture();
  const setup = await storeFixture();
  t.after(async () => {
    setup.store.close();
    await rm(setup.root, { recursive: true, force: true });
  });

  const first = setup.store.stageRemoteSocialPackage(stageInput(data));
  const replay = setup.store.stageRemoteSocialPackage(stageInput(data));
  assert.equal(replay.stage_id, first.stage_id);
  assert.equal(replay.import_plan_json.plan_digest, first.import_plan_json.plan_digest);
  assert.equal(setup.store.db.prepare('SELECT COUNT(*) AS count FROM remote_social_staging').get().count, 1);

  assert.throws(
    () => setup.store.stageRemoteSocialPackage(stageInput(data, {
      trustLabel: 'secondary-review'
    })),
    error => error?.code === 'remote_social_stage_conflict'
  );
});

test('staging re-verifies the trusted exporter key before any durable write', async t => {
  const data = packageFixture();
  const setup = await storeFixture();
  t.after(async () => {
    setup.store.close();
    await rm(setup.root, { recursive: true, force: true });
  });
  const wrong = exporterKeys();

  assert.throws(
    () => setup.store.stageRemoteSocialPackage(stageInput(data, {
      trustedExporterPublicKey: wrong.publicKey
    })),
    /trusted exporter key/
  );
  assert.equal(setup.store.db.prepare('SELECT COUNT(*) AS count FROM remote_social_staging').get().count, 0);
});

test('encrypted remote review stage survives close and reopen without becoming local authored state', async t => {
  const data = packageFixture();
  const setup = await storeFixture();
  const stage = setup.store.stageRemoteSocialPackage(stageInput(data));
  setup.store.close();

  const reopened = new RemoteSocialGridStore({
    path: setup.path,
    dataDir: setup.dataDir,
    identity: setup.identity,
    protector: new DataProtector(setup.key)
  });
  setup.store = reopened;
  t.after(async () => {
    setup.store.close();
    await rm(setup.root, { recursive: true, force: true });
  });

  const restored = reopened.getRemoteSocialStage('principal-local-reviewer', stage.stage_id);
  assert.equal(restored.package_digest, data.packageValue.package_digest);
  assert.equal(restored.package_json.statement.publications[0].projection_digest, data.publication.projection_digest);
  assert.equal(restored.import_plan_json.requires_operator_approval, true);
  assert.equal(restored.trusted_exporter_json.exporter_grid_id, 'grid-remote-exporter');
  assert.equal(reopened.listSocialCorpus('principal-local-reviewer').publications.length, 0);
});
