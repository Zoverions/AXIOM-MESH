import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { canonicalJson, sha256 } from '../src/lib/canonical.mjs';
import {
  runCredentialRotationDrill,
  verifyCredentialRotationDrillEvidence
} from '../src/credential-rotation-drill.mjs';
import { provisionProduction } from '../src/provision-production.mjs';
import {
  rollbackProductionCredentials,
  rotateProductionCredentials,
  verifyCredentialRotationManifest
} from '../src/rotate-production.mjs';

test('credential rotation drill proves replacement, rejection, and exact rollback', async t => {
  const workspace = await mkdtemp(join(os.tmpdir(), 'axiom-credential-rotation-'));
  t.after(() => rm(workspace, { recursive: true, force: true }));

  const evidence = await runCredentialRotationDrill({ workspaceDir: workspace });

  assert.equal(evidence.status, 'passed');
  assert.ok(Object.values(evidence.checks).every(Boolean));
  assert.equal(evidence.rotation.all_four_service_identities_rotated, true);
  assert.equal(evidence.rotation.operator_api_token_rotated, true);
  assert.equal(evidence.rotation.data_protection_key_rotated, false);
  assert.equal(evidence.rollback.exact_original_key_set_restored, true);
  assert.equal(evidence.rollback.exact_original_operator_token_restored, true);
  assert.equal(evidence.authorization.retired_operator_token_status, 401);
  assert.equal(
    evidence.authorization.rotated_operator_token_after_rollback_status,
    401
  );
  assert.equal(evidence.authorization.rotated_trust.accepted, true);
  assert.equal(evidence.authorization.rotated_trust.rejected, true);
  assert.equal(evidence.authorization.restored_trust.accepted, true);
  assert.equal(evidence.authorization.restored_trust.rejected, true);
  assert.equal(verifyCredentialRotationDrillEvidence(evidence).valid, true);

  for (const service of ['gateway', 'hypervisor', 'sandbox', 'grid']) {
    assert.notEqual(
      evidence.key_ids.before[service],
      evidence.key_ids.rotated[service]
    );
    assert.equal(
      evidence.key_ids.before[service],
      evidence.key_ids.restored[service]
    );
  }

  const serialized = JSON.stringify(evidence);
  const dataKey = (
    await readFile(join(workspace, 'secrets', 'data-protection.key'), 'utf8')
  ).trim();
  const operatorToken = (
    await readFile(join(workspace, 'secrets', 'operator.token'), 'utf8')
  ).trim();
  assert.equal(serialized.includes(dataKey), false);
  assert.equal(serialized.includes(operatorToken), false);

  const manifestPath = join(
    workspace,
    ...evidence.rotation.manifest_path.split('/')
  );
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  for (const state of [manifest.before, manifest.after]) {
    const secretTargets = state.targets.filter(target => target.root === 'secret');
    assert.equal(secretTargets.length, 2);
    assert.ok(secretTargets.every(target => (
      target.authentication === 'HMAC-SHA256'
      && /^[a-f0-9]{64}$/.test(target.digest)
      && !Object.hasOwn(target, 'sha256')
    )));
  }
  const rollbackEnvelope = await readFile(
    join(manifestPath, '..', manifest.rollback.name)
  );
  assert.equal(
    verifyCredentialRotationManifest({ manifest, rollbackEnvelope }).valid,
    true
  );
  const tamperedManifest = structuredClone(manifest);
  tamperedManifest.successor_attestation.signature = (
    `${
      tamperedManifest.successor_attestation.signature[0] === 'A' ? 'B' : 'A'
    }${tamperedManifest.successor_attestation.signature.slice(1)}`
  );
  assert.throws(
    () => verifyCredentialRotationManifest({
      manifest: tamperedManifest,
      rollbackEnvelope
    }),
    /successor attestation/
  );
  const tamperedEnvelope = Buffer.from(rollbackEnvelope);
  tamperedEnvelope[0] ^= 1;
  assert.throws(
    () => verifyCredentialRotationManifest({
      manifest,
      rollbackEnvelope: tamperedEnvelope
    }),
    /envelope digest/
  );

  const tampered = structuredClone(evidence);
  tampered.rollback.duration_ms += 1;
  assert.throws(
    () => verifyCredentialRotationDrillEvidence(tampered),
    /attestation/
  );
  await assert.rejects(
    () => runCredentialRotationDrill({ workspaceDir: workspace }),
    /workspace must be empty/
  );
});

test('interrupted rotation rollback quarantines only a provably stale runtime lock', async t => {
  const workspace = await mkdtemp(join(os.tmpdir(), 'axiom-rotation-interrupted-'));
  t.after(() => rm(workspace, { recursive: true, force: true }));
  const provisioned = await provisionProduction({
    dataDir: join(workspace, 'data'),
    secretDir: join(workspace, 'secrets')
  });
  const rotation = await rotateProductionCredentials({
    dataDir: provisioned.data_dir,
    secretDir: provisioned.secret_dir
  });
  const manifest = await readFile(rotation.manifest_path);
  await writeFile(
    join(provisioned.data_dir, 'pending-credential-rotation.json'),
    `${canonicalJson({
      format: 'axiom-credential-rotation.v1',
      rotation_id: rotation.rotation_id,
      manifest_sha256: sha256(manifest),
      transaction: 'applying'
    })}\n`,
    { mode: 0o600, flag: 'wx' }
  );
  const holder = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)']);
  const deadPid = holder.pid;
  await writeFile(
    join(provisioned.data_dir, 'grid-runtime.lock'),
    `${canonicalJson({
      pid: deadPid,
      token: 'simulated-interrupted-rotation',
      started_at: new Date().toISOString()
    })}\n`,
    { mode: 0o600, flag: 'wx' }
  );
  await assert.rejects(
    () => rollbackProductionCredentials({
      manifestPath: rotation.manifest_path,
      dataDir: provisioned.data_dir,
      secretDir: provisioned.secret_dir
    }),
    /live process/
  );
  const holderExit = once(holder, 'exit');
  holder.kill();
  await holderExit;

  const rollback = await rollbackProductionCredentials({
    manifestPath: rotation.manifest_path,
    dataDir: provisioned.data_dir,
    secretDir: provisioned.secret_dir
  });

  assert.equal(rollback.rolled_back, true);
  assert.equal(rollback.interrupted_rotation_recovered, true);
  assert.equal(rollback.stale_runtime_lock_recovered, true);
  assert.equal(rollback.forward_recovery_available, false);
});
