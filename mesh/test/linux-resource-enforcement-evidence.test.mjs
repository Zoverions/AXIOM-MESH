import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import test from 'node:test';
import { canonicalJson, sha256 } from '../src/lib/canonical.mjs';
import {
  verifyLinuxResourceEnforcementEvidence
} from '../src/lib/linux-resource-enforcement-evidence.mjs';

function evidence() {
  const keys = generateKeyPairSync('ed25519');
  const publicKeyPem = String(keys.publicKey.export({
    type: 'spki',
    format: 'pem'
  }));
  const unsigned = {
    schema: 'linux.resource-enforcement-drill-evidence.v1',
    status: 'passed',
    generated_at: '2026-09-02T17:30:00.000Z',
    source: { revision: 'a'.repeat(40) },
    profile: {
      backend: 'systemd-cgroup-v2',
      guardian_fixture: 'synthetic-local-lab',
      remote_execution_authorized: false,
      arbitrary_command_executed: false,
      network_task_executed: false
    },
    capability: {
      observation_digest: 'b'.repeat(64),
      cgroup_version: 2,
      controllers: ['cpu', 'memory', 'pids']
    },
    enforcement: {
      unit_name: `mesh-contribution-${'c'.repeat(24)}.service`,
      request_digest: 'd'.repeat(64),
      guardian_binding_digest: 'e'.repeat(64),
      requested_cpu_millis: 250,
      requested_memory_bytes: 67_108_864,
      requested_pids_max: 16,
      lease_seconds: 30
    },
    observations: {
      cpu_max_quota: 25_000,
      cpu_max_period: 100_000,
      memory_max_bytes: 67_108_864,
      pids_max: 16,
      stop_state: 'inactive_or_absent'
    },
    checks: {
      cpu_limit_matches: true,
      memory_limit_matches: true,
      pids_limit_matches: true,
      stop_confirmed: true,
      no_unrequested_network_or_storage_resource: true
    },
    signer: {
      service: 'host-guardian-lab',
      key_id: 'host-guardian-lab:test',
      public_key_pem: publicKeyPem
    },
    limitations: [
      'synthetic Guardian admission is not physical host resource-policy evidence'
    ]
  };
  const body = canonicalJson(unsigned);
  return {
    ...unsigned,
    attestation: {
      algorithm: 'Ed25519',
      key_id: unsigned.signer.key_id,
      digest: sha256(body),
      signature: sign(
        null,
        Buffer.from(body),
        keys.privateKey
      ).toString('base64url')
    }
  };
}

test('verifier accepts signed evidence only when observed cgroup limits match the request', () => {
  const result = verifyLinuxResourceEnforcementEvidence(evidence());
  assert.equal(result.valid, true);
  assert.equal(result.cpu_millis, 250);
});

test('verifier rejects metadata or non-claim elevation', () => {
  for (const mutate of [
    item => { item.profile.remote_execution_authorized = true; },
    item => { item.profile.arbitrary_command_executed = true; },
    item => { item.profile.network_task_executed = true; },
    item => { item.profile.guardian_fixture = 'physical-host-verified'; }
  ]) {
    const item = evidence();
    mutate(item);
    assert.throws(() => verifyLinuxResourceEnforcementEvidence(item));
  }
});

test('verifier rejects mismatched cgroup observations even if check booleans are forged true', () => {
  for (const mutate of [
    item => { item.observations.cpu_max_quota = 50_000; },
    item => { item.observations.memory_max_bytes += 4096; },
    item => { item.observations.pids_max = 17; },
    item => { item.observations.stop_state = 'active'; }
  ]) {
    const item = evidence();
    mutate(item);
    assert.throws(() => verifyLinuxResourceEnforcementEvidence(item));
  }
});

test('verifier rejects tampering under a valid signer identity', () => {
  const item = evidence();
  item.enforcement.lease_seconds = 60;
  assert.throws(
    () => verifyLinuxResourceEnforcementEvidence(item),
    /attestation/
  );
});
