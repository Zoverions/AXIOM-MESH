import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('possession-bound atomic admission remains unwired from Grid, Hypervisor, and Gateway runtime servers', async () => {
  const moduleSource = await readFile(new URL('../src/grid/circle-possession-bound-atomic-admission.mjs', import.meta.url), 'utf8');
  const gridServer = await readFile(new URL('../src/grid/server.mjs', import.meta.url), 'utf8');
  const hypervisorServer = await readFile(new URL('../src/hypervisor/server.mjs', import.meta.url), 'utf8');
  const gatewayServer = await readFile(new URL('../src/gateway/server.mjs', import.meta.url), 'utf8');

  for (const source of [gridServer, hypervisorServer, gatewayServer]) {
    assert.doesNotMatch(source, /circle-possession-bound-atomic-admission\.mjs/);
    assert.doesNotMatch(source, /issueCirclePossessionBoundAtomicCapability/);
    assert.doesNotMatch(source, /commitCirclePersistenceWithPossessionBoundAtomicAdmission/);
  }

  assert.match(moduleSource, /appendCirclePersistenceWithLifecycleGuards/);
  assert.match(moduleSource, /verifyCircleCredentialPossessionAttestation/);
  assert.match(moduleSource, /possession_attestations_reverified_at_grid_commit/);
  assert.doesNotMatch(moduleSource, /runtime_authority:\s*true/);
  assert.doesNotMatch(moduleSource, /external_effect_authority:\s*true/);
});

test('possession-bound successor does not redefine parent CAS or possession contracts', async () => {
  const successor = await readFile(new URL('../src/grid/circle-possession-bound-atomic-admission.mjs', import.meta.url), 'utf8');
  const parentCas = await readFile(new URL('../src/grid/circle-authorized-admission-lifecycle-cas.mjs', import.meta.url), 'utf8');
  const possession = await readFile(new URL('../src/grid/circle-credential-possession-attestation.mjs', import.meta.url), 'utf8');

  assert.match(successor, /getCircleAuthorizedGridAdmissionLifecycleCasPolicy/);
  assert.match(successor, /getCircleCredentialPossessionAttestationPolicy/);
  assert.match(successor, /deriveCircleAuthorizedLifecycleCasInvocationDigest/);
  assert.match(successor, /lifecycle_head_check_and_circle_commit_share_one_grid_transaction/);
  assert.match(parentCas, /credential_possession_proved:\s*false/);
  assert.match(possession, /challenge_single_use_persisted:\s*false/);
});
