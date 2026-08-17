import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { ensureMeshIdentity } from '../src/lib/identity.mjs';
import { DataProtector } from '../src/lib/protector.mjs';
import { SocialGridStore } from '../src/grid/social-store.mjs';
import {
  REMOTE_SOCIAL_RUNTIME_CANDIDATE,
  REMOTE_SOCIAL_RUNTIME_CANDIDATE_SCHEMA,
  RemoteSocialRuntimeCandidateGridStore
} from '../src/grid/remote-social-runtime-candidate.mjs';

async function storeFixture(StoreClass) {
  const root = await mkdtemp(join(tmpdir(), 'axiom-remote-social-runtime-candidate-'));
  const dataDir = join(root, 'data');
  const identity = await ensureMeshIdentity(dataDir, 'grid', { create: true });
  const protector = new DataProtector(randomBytes(32));
  const path = join(dataDir, 'grid.sqlite');
  const store = new StoreClass({ path, dataDir, identity, protector });
  return { root, dataDir, identity, protector, path, store };
}

test('candidate descriptor is explicit about disabled no-egress activation state', () => {
  assert.equal(
    REMOTE_SOCIAL_RUNTIME_CANDIDATE.schema,
    REMOTE_SOCIAL_RUNTIME_CANDIDATE_SCHEMA
  );
  assert.equal(REMOTE_SOCIAL_RUNTIME_CANDIDATE.activation_state, 'disabled');
  assert.equal(REMOTE_SOCIAL_RUNTIME_CANDIDATE.network_egress, false);
  assert.equal(REMOTE_SOCIAL_RUNTIME_CANDIDATE.public_routes, false);
  assert.equal(REMOTE_SOCIAL_RUNTIME_CANDIDATE.transport_included, false);
  assert.equal(REMOTE_SOCIAL_RUNTIME_CANDIDATE.staging_included, true);
  assert.equal(REMOTE_SOCIAL_RUNTIME_CANDIDATE.admission_included, true);
  assert.equal(REMOTE_SOCIAL_RUNTIME_CANDIDATE.following_included, true);
  assert.equal(REMOTE_SOCIAL_RUNTIME_CANDIDATE.retention_included, true);
  assert.equal(REMOTE_SOCIAL_RUNTIME_CANDIDATE.abuse_controls_included, true);
  assert.equal(REMOTE_SOCIAL_RUNTIME_CANDIDATE.automatic_federation, false);
  assert.equal(REMOTE_SOCIAL_RUNTIME_CANDIDATE.automatic_admission, false);
  assert.equal(REMOTE_SOCIAL_RUNTIME_CANDIDATE.automatic_follow, false);
  assert.ok(REMOTE_SOCIAL_RUNTIME_CANDIDATE.remaining_activation_gates.includes('threat-model'));
  assert.equal(REMOTE_SOCIAL_RUNTIME_CANDIDATE.remaining_activation_gates.includes('abuse-controls'), false);
  assert.ok(REMOTE_SOCIAL_RUNTIME_CANDIDATE.remaining_activation_gates.includes('transport-relay-separation'));
});

test('base SocialGridStore remains remote-schema-free as a lower-layer invariant', async t => {
  const setup = await storeFixture(SocialGridStore);
  t.after(async () => {
    setup.store.close();
    await rm(setup.root, { recursive: true, force: true });
  });
  const tables = new Set(setup.store.db.prepare(`
    SELECT name FROM sqlite_master WHERE type = 'table'
  `).all().map(row => row.name));
  for (const name of [
    'remote_social_packages',
    'remote_social_admissions',
    'remote_social_observations',
    'remote_social_follows',
    'remote_social_retention_receipts',
    'remote_social_abuse_preferences',
    'remote_social_reports',
    'remote_social_quarantines',
    'remote_social_transport_jobs'
  ]) {
    assert.equal(tables.has(name), false, `${name} unexpectedly enabled in base store`);
  }
});

test('candidate composes staging, admission, following, retention and abuse controls but no transport', async t => {
  const setup = await storeFixture(RemoteSocialRuntimeCandidateGridStore);
  t.after(async () => {
    setup.store.close();
    await rm(setup.root, { recursive: true, force: true });
  });
  const status = setup.store.getStatus();
  assert.equal(status.remote_social_schema_version, 1);
  assert.equal(status.remote_social_admission_schema_version, 1);
  assert.equal(status.remote_social_following_schema_version, 1);
  assert.equal(status.remote_social_retention_schema_version, 1);
  assert.equal(status.remote_social_abuse_schema_version, 1);
  assert.deepEqual(status.remote_social_runtime_candidate, REMOTE_SOCIAL_RUNTIME_CANDIDATE);

  for (const method of [
    'stageRemoteSocialPackage',
    'admitRemoteSocialStage',
    'followRemotePersona',
    'unfollowRemotePersona',
    'getChronologicalFollowing',
    'getRemoteSocialRetentionAssessment',
    'expireUnadmittedRemoteSocialStage',
    'muteRemotePersona',
    'unmuteRemotePersona',
    'blockRemotePersona',
    'unblockRemotePersona',
    'reportRemoteObservation',
    'quarantineRemoteExporter',
    'releaseRemoteExporterQuarantine',
    'quarantineRemoteSource',
    'releaseRemoteSourceQuarantine'
  ]) {
    assert.equal(typeof setup.store[method], 'function', `${method} missing from candidate`);
  }
  for (const method of [
    'queueRemoteSocialTransportJob',
    'processRemoteSocialTransportJob',
    'getRemoteSocialTransportJob',
    'listRemoteSocialTransportJobs'
  ]) {
    assert.equal(typeof setup.store[method], 'undefined', `${method} leaked into no-egress candidate`);
  }
  assert.equal(setup.store.db.prepare(`
    SELECT 1 FROM sqlite_master
    WHERE type = 'table' AND name = 'remote_social_transport_jobs'
  `).get(), undefined);
});

test('accepted Grid selects explicit accepted storage and not candidate or transport classes', async () => {
  const source = await readFile(
    new URL('../src/grid/server.mjs', import.meta.url),
    'utf8'
  );
  assert.match(source, /import \{ AcceptedSocialGridStore \} from '\.\/accepted-social-store\.mjs';/);
  assert.match(source, /new AcceptedSocialGridStore\s*\(/);
  assert.equal(source.includes("import { SocialGridStore } from './social-store.mjs';"), false);
  assert.equal(source.includes('RemoteSocialRuntimeCandidateGridStore'), false);
  assert.equal(source.includes('remote-social-runtime-candidate.mjs'), false);
  assert.equal(source.includes('RemoteSocialTransportGridStore'), false);
  assert.equal(source.includes('remote-social-transport-store.mjs'), false);
  assert.equal(source.includes('AXIOM_REMOTE_SOCIAL'), false);
});
