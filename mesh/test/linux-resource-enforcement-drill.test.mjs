import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  runLinuxResourceEnforcementDrill
} from '../src/linux-resource-enforcement-drill.mjs';
import {
  verifyLinuxResourceEnforcementEvidence
} from '../src/lib/linux-resource-enforcement-evidence.mjs';
import { canonicalJson, sha256 } from '../src/lib/canonical.mjs';

function identity() {
  const keys = generateKeyPairSync('ed25519');
  return {
    service: 'host-guardian-lab',
    keyId: 'host-guardian-lab:test',
    publicKey: keys.publicKey,
    signObject(value) {
      const body = canonicalJson(value);
      return {
        algorithm: 'Ed25519',
        key_id: this.keyId,
        digest: sha256(body),
        signature: sign(
          null,
          Buffer.from(body),
          keys.privateKey
        ).toString('base64url')
      };
    }
  };
}

const capability = Object.freeze({
  format: 'linux.enforcement-capability-verification.v1',
  available: true,
  observation_digest: 'b'.repeat(64),
  cgroup_version: 2,
  controllers: ['cpu', 'memory', 'pids'],
  property_enforcement_proven: false,
  authority_effect: 'none'
});

test('drill binds capability, fixed enforcement, observed limits, cleanup, and signature', async t => {
  const root = await mkdtemp(join(tmpdir(), 'axiom-g3drill-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const calls = [];
  const effects = {
    async start(enforcement) {
      calls.push(['start', enforcement.unit_name]);
      return {
        control_group: `/system.slice/${enforcement.unit_name}`
      };
    },
    async observe() {
      calls.push(['observe']);
      return {
        cpu_max_quota: 25_000,
        cpu_max_period: 100_000,
        memory_max_bytes: 67_108_864,
        pids_max: 16
      };
    },
    async stop(unitName) {
      calls.push(['stop', unitName]);
      return 'inactive_or_absent';
    }
  };
  const evidence = await runLinuxResourceEnforcementDrill({
    workspaceDir: root,
    sourceRevision: 'a'.repeat(40),
    generatedAt: '2026-09-02T17:30:00.000Z',
    allowEffects: true,
    effects,
    capabilityProvider: async () => capability,
    identityProvider: async () => identity()
  });
  assert.equal(
    verifyLinuxResourceEnforcementEvidence(evidence).valid,
    true
  );
  assert.deepEqual(calls.map(item => item[0]), [
    'start', 'observe', 'stop'
  ]);
  assert.equal(evidence.profile.arbitrary_command_executed, false);
});

test('drill refuses effects without explicit local lab enablement', async () => {
  let called = false;
  await assert.rejects(
    () => runLinuxResourceEnforcementDrill({
      workspaceDir: '/tmp/unused',
      sourceRevision: 'a'.repeat(40),
      allowEffects: false,
      effects: {
        start() {
          called = true;
        }
      }
    }),
    /explicitly enabled/
  );
  assert.equal(called, false);
});

test('cleanup stop is attempted when observation fails', async t => {
  const root = await mkdtemp(join(tmpdir(), 'axiom-g3drill-fail-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  let stopped = false;
  const effects = {
    async start(enforcement) {
      return {
        control_group: `/system.slice/${enforcement.unit_name}`
      };
    },
    async observe() {
      throw new Error('read failed');
    },
    async stop() {
      stopped = true;
      return 'inactive_or_absent';
    }
  };
  await assert.rejects(
    () => runLinuxResourceEnforcementDrill({
      workspaceDir: root,
      sourceRevision: 'a'.repeat(40),
      allowEffects: true,
      effects,
      capabilityProvider: async () => capability,
      identityProvider: async () => identity()
    }),
    /read failed/
  );
  assert.equal(stopped, true);
});
