import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const ROOT = new URL('../../', import.meta.url);

async function text(path) {
  return readFile(new URL(path, ROOT), 'utf8');
}

function normalized(value) {
  return String(value).replace(/\s+/g, ' ').trim();
}

function assertContainsNormalized(haystack, required, label) {
  assert.equal(
    normalized(haystack).includes(normalized(required)),
    true,
    `${label}: ${required}`
  );
}

test('canonical threat model requires the companion and exact accepted-storage/read-only boundary', async () => {
  const threat = await text('docs/security/CURRENT-BUILD-THREAT-MODEL.md');
  for (const required of [
    'REMOTE-SOCIAL-THREAT-REVIEW.md',
    'S3A exporter signatures attest only to what a trusted exporter Grid signed',
    'independently pinned HTTPS transport endpoint',
    'local admission',
    'private local preference',
    'host-side egress relay',
    'AcceptedSocialGridStore',
    'accepted Grid service imports and instantiates `AcceptedSocialGridStore`',
    'accepted local storage/replay',
    'GET /v1/social/remote-review',
    '/internal/v1/social/remote-review/:owner',
    'no-migration read adapter',
    'no network egress',
    'No source-package endpoint or social relay is currently deployed',
    'does not by itself prove content truth',
    'legal/biological',
    'personal authorship',
    'never creates Mesh authorization',
    'automatic federation'
  ]) {
    assertContainsNormalized(threat, required, 'canonical threat model missing');
  }
});

test('remote-social companion names every current S3/G1-G7B2a review surface and trust distinction', async () => {
  const review = await text('docs/security/REMOTE-SOCIAL-THREAT-REVIEW.md');
  for (const path of [
    'mesh/src/lib/social-exchange-package.mjs',
    'mesh/src/lib/social-transport-envelope.mjs',
    'mesh/src/grid/remote-social-store.mjs',
    'mesh/src/grid/remote-social-admission-store.mjs',
    'mesh/src/grid/remote-social-following-store.mjs',
    'mesh/src/grid/remote-social-retention-store.mjs',
    'mesh/src/grid/remote-social-abuse-store.mjs',
    'mesh/src/grid/remote-social-runtime-store.mjs',
    'mesh/src/grid/accepted-social-store.mjs',
    'mesh/src/grid/remote-social-transport-store.mjs',
    'mesh/src/grid/remote-social-protection.mjs',
    'mesh/src/grid/remote-social-runtime-candidate.mjs',
    'mesh/src/grid/remote-social-review-projection.mjs',
    'mesh/src/grid/remote-social-review-read-adapter.mjs',
    'mesh/src/grid/server.mjs',
    'mesh/src/gateway/server.mjs',
    'mesh/config/gateway-client-contract.json',
    'mesh/config/service-network-policy.json'
  ]) {
    assert.equal(review.includes(path), true, `remote-social review scope missing: ${path}`);
  }
  for (const required of [
    'Exporter Grid attestation',
    'Transport endpoint attestation',
    'Local admission authority',
    'Private Following',
    'Owner-scoped review projection',
    'Owner-private abuse controls',
    'Accepted no-egress social storage',
    'S3G5A/B read-only review exposure',
    'Future social relay',
    'content truth',
    'legal identity',
    'personal authorship',
    'exporter-attestation-only',
    'staging-only authenticated handoff',
    'owner exclusively from `principal.id`',
    'reports are append-only owner assertions',
    'source quarantine accepts only a normalized exact HTTPS origin'
  ]) {
    assertContainsNormalized(review, required, 'remote-social trust review missing');
  }
});

test('accepted storage activation preserves read-only exposure and excludes candidate or transport selection', async () => {
  const [grid, gateway] = await Promise.all([
    text('mesh/src/grid/server.mjs'),
    text('mesh/src/gateway/server.mjs')
  ]);
  assert.match(grid, /import \{ AcceptedSocialGridStore \} from '\.\/accepted-social-store\.mjs';/);
  assert.match(grid, /new AcceptedSocialGridStore\s*\(/);
  assert.equal(grid.includes("import { SocialGridStore } from './social-store.mjs';"), false);
  assert.equal(grid.includes('RemoteSocialRuntimeCandidateGridStore'), false);
  assert.equal(grid.includes('RemoteSocialTransportGridStore'), false);
  assert.equal(grid.includes('AXIOM_REMOTE_SOCIAL'), false);
  assert.equal(
    grid.includes("router.add('GET', '/internal/v1/social/remote-review/:owner'"),
    true
  );
  assert.equal(
    gateway.includes("router.add('GET', '/v1/social/remote-review'"),
    true
  );
  assert.equal(grid.includes('/internal/v1/social/remote-admit'), false);
  assert.equal(gateway.includes('/internal/v1/social/remote-admit'), false);
  assert.equal(gateway.includes('/internal/v1/social/follow'), false);
  assert.equal(gateway.includes('/internal/v1/social/transport'), false);
});

test('canonical threat model contains explicit accepted remote-social threats, abuse cases and invariants', async () => {
  const threat = await text('docs/security/CURRENT-BUILD-THREAT-MODEL.md');
  for (const required of [
    '| Remote-social exporter forgery, compromise, or provenance overclaim |',
    '| Remote-social transport substitution, replay, or origin confusion |',
    '| Remote-social storage amplification or retry exhaustion |',
    '| Remote-social admission confused deputy or approval substitution |',
    '| Remote-social retention erases evidence or replay dependencies |',
    '| Remote-social Following leaks private preference or expands trust |',
    '| Remote-social review owner override or disclosure widening |',
    '| Future social relay becomes confused deputy or egress bridge |',
    'malicious or compromised remote-social exporter keys',
    'package amplification',
    'trust labels, report state, quarantine state, or provenance UI',
    'owner-query/body override',
    'private follow/trust',
    'attempts to turn accepted schema/method presence into an effect',
    'Transport verification and staging never create remote-social admission',
    'The accepted Grid remains deny-egress',
    'Expiry alone does not silently delete remote-social evidence',
    'The current remote-social public surface is inspection-only',
    'Storage/replay activation does not create effect authority'
  ]) {
    assertContainsNormalized(threat, required, 'remote-social security boundary missing');
  }
});

test('remote-social companion contains explicit accepted-storage G6 threats and closed effect boundary', async () => {
  const review = await text('docs/security/REMOTE-SOCIAL-THREAT-REVIEW.md');
  for (const required of [
    '| Remote-social report or quarantine becomes false authority |',
    'trust labels, report state, quarantine state, or provenance UI',
    'private follow/trust/report/quarantine correlation',
    'G6 source quarantine must not perform network I/O',
    'Local mute/block/report/quarantine records remain owner-private safety state',
    'report proves only that the owner recorded an assertion',
    'accepted local storage/replay',
    'no accepted mute, block, report, quarantine, follow, cleanup, staging, or admission mutation route',
    'adjudicated: false',
    'network_effect: none',
    'authority_effect: none',
    'recommendation_effect: none',
    'adjudication_effect: none'
  ]) {
    assertContainsNormalized(review, required, 'remote-social G6 security boundary missing');
  }
});
