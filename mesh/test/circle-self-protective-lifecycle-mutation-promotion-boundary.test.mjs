import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('self-protective mutation authorization remains unwired from runtime servers and performs no Grid write', async () => {
  const source = await readFile(new URL('../src/grid/circle-self-protective-lifecycle-mutation-authorization.mjs', import.meta.url), 'utf8');
  const gridServer = await readFile(new URL('../src/grid/server.mjs', import.meta.url), 'utf8');
  const hypervisorServer = await readFile(new URL('../src/hypervisor/server.mjs', import.meta.url), 'utf8');
  const gatewayServer = await readFile(new URL('../src/gateway/server.mjs', import.meta.url), 'utf8');

  for (const server of [gridServer, hypervisorServer, gatewayServer]) {
    assert.doesNotMatch(server, /circle-self-protective-lifecycle-mutation-authorization\.mjs/);
    assert.doesNotMatch(server, /authorizeCircleSelfProtectiveLifecycleMutation/);
  }
  assert.doesNotMatch(source, /appendCirclePersistenceWithLifecycleGuards/);
  assert.doesNotMatch(source, /appendEvents\s*\(/);
  assert.doesNotMatch(source, /runtime_authority:\s*true/);
  assert.doesNotMatch(source, /external_effect_authority:\s*true/);
});

test('self-protective authorization reuses parent lifecycle candidate validation and possession evidence instead of inventing authority', async () => {
  const source = await readFile(new URL('../src/grid/circle-self-protective-lifecycle-mutation-authorization.mjs', import.meta.url), 'utf8');
  assert.match(source, /buildCircleMemberLifecycleGridHeadCandidate/);
  assert.match(source, /verifyCircleCredentialPossessionAttestation/);
  assert.match(source, /normalizeCircleLifecycleHeadSnapshot/);
  assert.match(source, /getCircleMemberLifecycleHead/);
  assert.match(source, /grid_commit_performed:\s*false/);
  assert.match(source, /self_protective_contraction_only:\s*true/);
});

test('promotion boundary structurally excludes restoration and administrative mutation paths', async () => {
  const policy = JSON.parse(await readFile(
    new URL('../config/circle-self-protective-lifecycle-mutation-authorization.v0.json', import.meta.url),
    'utf8'
  ));
  assert.deepEqual(policy.mutation_kinds.membership, ['role-narrow', 'membership-suspend', 'membership-exit']);
  assert.deepEqual(policy.mutation_kinds.credential, ['credential-suspend', 'credential-revoke', 'device-compromise']);
  assert.equal(policy.requirements.membership_revoke_self_service_supported, false);
  assert.equal(policy.requirements.membership_resume_supported, false);
  assert.equal(policy.requirements.credential_resume_supported, false);
  assert.equal(policy.requirements.credential_issuance_supported, false);
  assert.equal(policy.requirements.credential_rotation_supported, false);
  assert.equal(policy.requirements.recovery_admission_supported, false);
  assert.equal(policy.requirements.administrative_or_third_party_mutation_supported, false);
});
