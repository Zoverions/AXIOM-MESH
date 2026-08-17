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

test('canonical threat model requires the remote-social companion and current disabled boundary', async () => {
  const threat = await text('docs/security/CURRENT-BUILD-THREAT-MODEL.md');
  for (const required of [
    'REMOTE-SOCIAL-THREAT-REVIEW.md',
    'A remote-social exporter signature proves exporter-Grid attestation of the exact package',
    'A transport signature proves one exact nonce-bound response from the configured transport key/origin',
    'Local admission proves the local Grid accepted the exact staged package',
    'A follow record proves a local owner preference',
    'A mute/block proves only a local owner preference',
    'a report proves only that the owner recorded an assertion',
    'exporter/source quarantine proves only that the owner locally selected fail-closed handling',
    'accepted Grid server remains hard-bound to `SocialGridStore`',
    'no public routes',
    'no network egress',
    'there is no deployed source endpoint or host-side social relay',
    'does not by itself prove content truth',
    'legal/biological identity',
    'personal authorship',
    'never creates Mesh authorization',
    'automatic federation'
  ]) {
    assertContainsNormalized(threat, required, 'canonical threat model missing');
  }
});

test('remote-social companion names every current S3/G1-G6 review surface and trust distinction', async () => {
  const review = await text('docs/security/REMOTE-SOCIAL-THREAT-REVIEW.md');
  for (const path of [
    'mesh/src/lib/social-exchange-package.mjs',
    'mesh/src/lib/social-transport-envelope.mjs',
    'mesh/src/grid/remote-social-store.mjs',
    'mesh/src/grid/remote-social-admission-store.mjs',
    'mesh/src/grid/remote-social-following-store.mjs',
    'mesh/src/grid/remote-social-retention-store.mjs',
    'mesh/src/grid/remote-social-abuse-store.mjs',
    'mesh/src/grid/remote-social-transport-store.mjs',
    'mesh/src/grid/remote-social-protection.mjs',
    'mesh/src/grid/remote-social-runtime-candidate.mjs',
    'mesh/src/grid/server.mjs'
  ]) {
    assert.equal(review.includes(path), true, `remote-social review scope missing: ${path}`);
  }
  for (const required of [
    'Exporter Grid attestation',
    'Transport endpoint attestation',
    'Local admission authority',
    'Private Following',
    'Owner-private abuse controls',
    'Future social relay',
    'content truth',
    'legal identity',
    'personal authorship',
    'exporter-attestation-only',
    'staging-only authenticated handoff',
    'reports are append-only owner assertions',
    'source quarantine accepts only a normalized exact HTTPS origin'
  ]) {
    assertContainsNormalized(review, required, 'remote-social trust review missing');
  }
});

test('threat-model hardening does not activate the remote candidate or transport inside Grid', async () => {
  const server = await text('mesh/src/grid/server.mjs');
  assert.match(server, /import \{ SocialGridStore \} from '\.\/social-store\.mjs';/);
  assert.match(server, /new SocialGridStore\s*\(/);
  assert.equal(server.includes('RemoteSocialRuntimeCandidateGridStore'), false);
  assert.equal(server.includes('RemoteSocialAbuseGridStore'), false);
  assert.equal(server.includes('RemoteSocialTransportGridStore'), false);
  assert.equal(server.includes('AXIOM_REMOTE_SOCIAL'), false);
});

test('canonical threat model contains explicit remote-social threats, abuse cases and invariants', async () => {
  const threat = await text('docs/security/CURRENT-BUILD-THREAT-MODEL.md');
  for (const required of [
    '| Remote-social exporter forgery, compromise, or provenance overclaim |',
    '| Remote-social transport substitution, replay, or origin confusion |',
    '| Remote-social storage amplification or retry exhaustion |',
    '| Remote-social admission confused deputy or approval substitution |',
    '| Remote-social retention erases evidence or replay dependencies |',
    '| Remote-social Following leaks private preference or expands trust |',
    '| Remote-social report or quarantine becomes false authority |',
    '| Future social relay becomes confused deputy or egress bridge |',
    'malicious or compromised remote-social exporter keys',
    'package amplification',
    'trust labels, report state, quarantine state, or provenance UI',
    'private follow/trust/report/quarantine correlation',
    'source/exporter quarantine bypass',
    'Transport verification and staging never create remote-social admission',
    'The accepted Grid remains deny-egress',
    'G6 source quarantine must not perform network I/O',
    'Local mute/block/report/quarantine records remain owner-private safety state',
    'Expiry alone does not silently delete remote-social evidence'
  ]) {
    assertContainsNormalized(threat, required, 'remote-social security boundary missing');
  }
});