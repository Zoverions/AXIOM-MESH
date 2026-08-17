import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const ROOT = new URL('../../', import.meta.url);

async function text(path) {
  return readFile(new URL(path, ROOT), 'utf8');
}

test('canonical threat model requires the remote-social companion and current disabled boundary', async () => {
  const threat = await text('docs/security/CURRENT-BUILD-THREAT-MODEL.md');
  for (const required of [
    'REMOTE-SOCIAL-THREAT-REVIEW.md',
    'S3A exporter signatures attest only to what a trusted exporter Grid signed',
    'independently pinned HTTPS transport endpoint',
    'local admission',
    'private local preference',
    'host-side egress relay',
    'RemoteSocialRuntimeCandidateGridStore',
    'accepted Grid service still imports and instantiates `SocialGridStore`',
    'no public routes',
    'no network egress',
    'No source-package endpoint or social relay is\ncurrently deployed',
    'does not by itself prove content truth',
    'legal/biological',
    'personal authorship',
    'never creates Mesh authorization',
    'automatic federation'
  ]) {
    assert.equal(threat.includes(required), true, `canonical threat model missing: ${required}`);
  }
});

test('remote-social companion names every current S3/G1-G3 review surface and trust distinction', async () => {
  const review = await text('docs/security/REMOTE-SOCIAL-THREAT-REVIEW.md');
  for (const path of [
    'mesh/src/lib/social-exchange-package.mjs',
    'mesh/src/lib/social-transport-envelope.mjs',
    'mesh/src/grid/remote-social-store.mjs',
    'mesh/src/grid/remote-social-admission-store.mjs',
    'mesh/src/grid/remote-social-following-store.mjs',
    'mesh/src/grid/remote-social-retention-store.mjs',
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
    'Future social relay',
    'content truth',
    'legal identity',
    'personal authorship',
    'exporter-attestation-only',
    'staging-only authenticated handoff'
  ]) {
    assert.equal(review.includes(required), true, `remote-social trust review missing: ${required}`);
  }
});

test('threat-model hardening does not activate the remote candidate or transport inside Grid', async () => {
  const server = await text('mesh/src/grid/server.mjs');
  assert.match(server, /import \{ SocialGridStore \} from '\.\/social-store\.mjs';/);
  assert.match(server, /new SocialGridStore\s*\(/);
  assert.equal(server.includes('RemoteSocialRuntimeCandidateGridStore'), false);
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
    '| Future social relay becomes confused deputy or egress bridge |',
    'malicious or compromised remote-social exporter keys',
    'package amplification',
    'trust labels or provenance UI',
    'private follow/trust',
    'source/exporter quarantine bypass',
    'Transport verification and staging never create remote-social admission',
    'The accepted Grid remains deny-egress',
    'Expiry alone does not silently delete remote-social evidence'
  ]) {
    assert.equal(threat.includes(required), true, `remote-social security boundary missing: ${required}`);
  }
});