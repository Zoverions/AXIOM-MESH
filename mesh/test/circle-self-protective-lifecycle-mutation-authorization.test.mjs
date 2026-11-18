import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { digestObject } from '../src/lib/canonical.mjs';
import { ensureMeshIdentity } from '../src/lib/identity.mjs';
import {
  attestCircleCredentialPossession,
  circleCredentialPublicKeyFingerprint,
  createCircleCredentialPossessionChallenge,
  signCircleCredentialPossessionChallenge
} from '../src/grid/circle-credential-possession-attestation.mjs';
import {
  authorizeCircleSelfProtectiveLifecycleMutation,
  getCircleSelfProtectiveLifecycleMutationAuthorizationPolicy,
  prepareCircleSelfProtectiveLifecycleMutation,
  validateCircleSelfProtectiveLifecycleMutationAuthorization,
  validateCircleSelfProtectiveLifecycleMutationAuthorizationPolicy
} from '../src/grid/circle-self-protective-lifecycle-mutation-authorization.mjs';
import { buildCircleMemberLifecycleGridHeadCandidate } from '../../packages/axiom-circle-lifecycle-grid-head/index.mjs';
import {
  FIXTURE_CIRCLE_ID,
  FIXTURE_CREDENTIAL_ID,
  FIXTURE_MEMBERSHIP_ID,
  FIXTURE_PRINCIPAL,
  lifecycleCharterHistory,
  lifecycleCirclePackage,
  lifecycleCredentialHistory,
  lifecycleHistoricalLedger,
  lifecycleMembership,
  lifecycleMembershipHistory,
  loadCircleLifecycleFixturePolicies
} from './helpers/circle-lifecycle-grid-fixture.mjs';

const BASE_SECONDS = Math.floor(Date.parse('2026-08-20T12:50:00.000Z') / 1000);

function credentialKeyPair() {
  const pair = generateKeyPairSync('ed25519');
  return {
    privateKey: pair.privateKey,
    publicKey: pair.publicKey,
    fingerprint: circleCredentialPublicKeyFingerprint(pair.publicKey)
  };
}

function credentialLifecycleWithKey(keyPair, events = []) {
  const base = lifecycleCredentialHistory();
  return lifecycleCredentialHistory({
    events,
    credentials: [{
      ...base.credentials[0],
      public_key_fingerprint: keyPair.fingerprint
    }]
  });
}

function credentialEvent({ kind, targetType = 'credential', targetId = FIXTURE_CREDENTIAL_ID, at = '2026-08-20T12:47:00.000Z', id = null }) {
  return {
    schema: 'axiom-circle-member-credential-event.v0',
    event_id: id ?? `credential.self.${kind}`,
    circle_id: FIXTURE_CIRCLE_ID,
    membership_id: FIXTURE_MEMBERSHIP_ID,
    principal_id: FIXTURE_PRINCIPAL,
    target_type: targetType,
    target_id: targetId,
    kind,
    at,
    reason_code: 'self-protect',
    authority_effect: 'none',
    network_effect: 'none'
  };
}

function membershipEvent({ kind, roleIds = null, coreExitId = null, at = '2026-08-20T12:47:00.000Z', id = null }) {
  return {
    schema: 'axiom-circle-member-eligibility-event.v0',
    event_id: id ?? `membership.self.${kind}`,
    circle_id: FIXTURE_CIRCLE_ID,
    membership_id: FIXTURE_MEMBERSHIP_ID,
    principal_id: FIXTURE_PRINCIPAL,
    kind,
    at,
    previous_event_digest: null,
    role_ids: roleIds,
    core_exit_id: coreExitId,
    authority_effect: 'none',
    network_effect: 'none'
  };
}

async function fixture(t) {
  const policies = await loadCircleLifecycleFixturePolicies();
  const keyPair = credentialKeyPair();
  const preMembershipLifecycle = lifecycleMembershipHistory();
  const preCredentialLifecycle = credentialLifecycleWithKey(keyPair);
  const circlePackage = lifecycleCirclePackage();
  const charterLifecycle = lifecycleCharterHistory();
  const historicalLedger = lifecycleHistoricalLedger();
  const preCandidate = buildCircleMemberLifecycleGridHeadCandidate({
    ...policies,
    circlePackage,
    charterLifecycle,
    historicalLedger,
    membershipLifecycle: preMembershipLifecycle,
    credentialLifecycle: preCredentialLifecycle,
    previousGridLifecycleHeadDigest: null,
    now: new Date(BASE_SECONDS * 1000)
  });
  const currentHead = Object.freeze({
    circle_id: FIXTURE_CIRCLE_ID,
    membership_id: FIXTURE_MEMBERSHIP_ID,
    principal_id: FIXTURE_PRINCIPAL,
    lifecycle_head_digest: preCandidate.resulting_grid_lifecycle_head_digest,
    membership_lifecycle_digest: preCandidate.membership_lifecycle_digest,
    credential_lifecycle_digest: preCandidate.credential_lifecycle_digest,
    event_id: preCandidate.event.event_id,
    event_seq: 1,
    updated_at: '2026-08-20T12:45:00.000Z'
  });
  const store = {
    getCircleMemberLifecycleHead(circleId, membershipId) {
      assert.equal(circleId, FIXTURE_CIRCLE_ID);
      assert.equal(membershipId, FIXTURE_MEMBERSHIP_ID);
      return structuredClone(currentHead);
    }
  };
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-circle-self-protective-'));
  const hypervisor = await ensureMeshIdentity(dataDir, 'hypervisor', { create: true });
  t.after(async () => rm(dataDir, { recursive: true, force: true }));
  return {
    ...policies,
    keyPair,
    hypervisor,
    store,
    currentHead,
    circlePackage,
    charterLifecycle,
    historicalLedger,
    preMembershipLifecycle,
    preCredentialLifecycle
  };
}

function baseInput(f, overrides = {}) {
  return {
    store: f.store,
    authenticatedPrincipal: FIXTURE_PRINCIPAL,
    authorizingCredentialId: FIXTURE_CREDENTIAL_ID,
    memberEligibilityPolicy: f.memberEligibilityPolicy,
    credentialPolicy: f.credentialPolicy,
    charterPolicy: f.charterPolicy,
    historicalBindingPolicy: f.historicalBindingPolicy,
    circlePackage: f.circlePackage,
    charterLifecycle: f.charterLifecycle,
    historicalLedger: f.historicalLedger,
    preMembershipLifecycle: f.preMembershipLifecycle,
    preCredentialLifecycle: f.preCredentialLifecycle,
    postMembershipLifecycle: f.preMembershipLifecycle,
    postCredentialLifecycle: f.preCredentialLifecycle,
    nowSeconds: BASE_SECONDS + 4,
    ...overrides
  };
}

function possessionAttestation(f, prepared, nowSeconds = BASE_SECONDS + 3) {
  const challenge = createCircleCredentialPossessionChallenge(f.hypervisor, {
    circleId: FIXTURE_CIRCLE_ID,
    membershipId: FIXTURE_MEMBERSHIP_ID,
    principalId: FIXTURE_PRINCIPAL,
    credentialId: FIXTURE_CREDENTIAL_ID,
    requestDigest: prepared.request_digest,
    lifecycleHead: f.currentHead,
    nowSeconds: BASE_SECONDS + 1,
    ttlSeconds: 20
  });
  const response = signCircleCredentialPossessionChallenge(
    challenge,
    f.keyPair.privateKey,
    f.keyPair.publicKey,
    {
      hypervisorPublicKey: f.hypervisor.publicKey,
      nowSeconds: BASE_SECONDS + 2,
      maxTtlSeconds: 20
    }
  );
  return attestCircleCredentialPossession(f.hypervisor, {
    challenge,
    response,
    hypervisorPublicKey: f.hypervisor.publicKey,
    credentialPolicy: f.credentialPolicy,
    circlePackage: f.circlePackage,
    credentialLifecycle: f.preCredentialLifecycle,
    lifecycleHead: f.currentHead,
    nowSeconds,
    maxTtlSeconds: 20
  });
}

test('self-protective lifecycle mutation policy is exact, contraction-only, inert, and non-authorizing', () => {
  const policy = getCircleSelfProtectiveLifecycleMutationAuthorizationPolicy();
  assert.equal(validateCircleSelfProtectiveLifecycleMutationAuthorizationPolicy(policy), true);
  assert.deepEqual(policy.mutation_kinds.membership, ['role-narrow', 'membership-suspend', 'membership-exit']);
  assert.deepEqual(policy.mutation_kinds.credential, ['credential-suspend', 'credential-revoke', 'device-compromise']);
  assert.equal(policy.requirements.mutation_event_after_current_grid_head, true);
  assert.equal(policy.requirements.mutation_event_not_future_at_authorization, true);
  assert.equal(policy.requirements.membership_resume_supported, false);
  assert.equal(policy.requirements.role_widening_supported, false);
  assert.equal(policy.requirements.credential_resume_supported, false);
  assert.equal(policy.requirements.credential_issuance_supported, false);
  assert.equal(policy.requirements.recovery_admission_supported, false);
  assert.equal(policy.runtime_activation, false);
});

test('member may use a currently eligible credential to authorize suspension of that same credential', async t => {
  const f = await fixture(t);
  const event = credentialEvent({ kind: 'credential-suspend' });
  const postCredentialLifecycle = credentialLifecycleWithKey(f.keyPair, [event]);
  const input = baseInput(f, { postCredentialLifecycle });
  const prepared = prepareCircleSelfProtectiveLifecycleMutation(input);
  assert.equal(prepared.mutation.domain, 'credential');
  assert.equal(prepared.mutation.kind, 'credential-suspend');
  assert.equal(prepared.mutation.target_id, FIXTURE_CREDENTIAL_ID);
  assert.equal(prepared.current_lifecycle_head.lifecycle_head_digest, f.currentHead.lifecycle_head_digest);
  assert.notEqual(prepared.proposed_candidate.resulting_grid_lifecycle_head_digest, f.currentHead.lifecycle_head_digest);

  const attestation = possessionAttestation(f, prepared);
  const assessment = authorizeCircleSelfProtectiveLifecycleMutation({
    ...input,
    possessionAttestation: attestation,
    hypervisorPublicKey: f.hypervisor.publicKey,
    possessionMaxAgeSeconds: 60
  });
  assert.equal(validateCircleSelfProtectiveLifecycleMutationAuthorization(assessment), true);
  assert.equal(assessment.authorizing_credential_id, FIXTURE_CREDENTIAL_ID);
  assert.equal(assessment.mutation_target_id, FIXTURE_CREDENTIAL_ID);
  assert.equal(assessment.credential_possession_verified, true);
  assert.equal(assessment.self_protective_contraction_only, true);
  assert.equal(assessment.grid_commit_performed, false);
  assert.equal(assessment.runtime_authority, false);
});

test('role narrowing is self-service only and leaves credential lifecycle unchanged', async t => {
  const f = await fixture(t);
  const event = membershipEvent({ kind: 'role-narrow', roleIds: [] });
  const postMembershipLifecycle = lifecycleMembershipHistory([event]);
  const narrowedCirclePackage = lifecycleCirclePackage(lifecycleMembership({ roleIds: [] }));
  const input = baseInput(f, {
    circlePackage: narrowedCirclePackage,
    postMembershipLifecycle
  });
  const prepared = prepareCircleSelfProtectiveLifecycleMutation(input);
  assert.equal(prepared.mutation.domain, 'membership');
  assert.equal(prepared.mutation.kind, 'role-narrow');
  assert.equal(prepared.mutation.target_type, 'membership');
  assert.equal(digestObject(f.preCredentialLifecycle), prepared.request.post_credential_lifecycle_digest);
  const attestation = possessionAttestation(f, prepared);
  const assessment = authorizeCircleSelfProtectiveLifecycleMutation({
    ...input,
    possessionAttestation: attestation,
    hypervisorPublicKey: f.hypervisor.publicKey
  });
  assert.equal(assessment.mutation_kind, 'role-narrow');
  assert.equal(assessment.post_credential_lifecycle_digest, assessment.pre_credential_lifecycle_digest);
});

test('credential resume, membership revocation, and bundled lifecycle changes fail before possession can authorize them', async t => {
  const f = await fixture(t);
  const resume = credentialEvent({ kind: 'credential-resume' });
  assert.throws(
    () => prepareCircleSelfProtectiveLifecycleMutation(baseInput(f, {
      postCredentialLifecycle: credentialLifecycleWithKey(f.keyPair, [resume])
    })),
    /mutation kind is not allowed/
  );

  const revokeMembership = membershipEvent({ kind: 'membership-revoke', coreExitId: 'exit.self.revoke' });
  assert.throws(
    () => prepareCircleSelfProtectiveLifecycleMutation(baseInput(f, {
      postMembershipLifecycle: lifecycleMembershipHistory([revokeMembership])
    })),
    /mutation kind is not allowed/
  );

  const suspend = credentialEvent({ kind: 'credential-suspend', id: 'credential.self.suspend.one' });
  const revoke = credentialEvent({
    kind: 'credential-revoke',
    at: '2026-08-20T12:48:00.000Z',
    id: 'credential.self.revoke.two'
  });
  assert.throws(
    () => prepareCircleSelfProtectiveLifecycleMutation(baseInput(f, {
      postCredentialLifecycle: credentialLifecycleWithKey(f.keyPair, [suspend, revoke])
    })),
    /append exactly one event/
  );
});

test('credential issuance or rotation records cannot be smuggled alongside a self-protective event', async t => {
  const f = await fixture(t);
  const event = credentialEvent({ kind: 'credential-suspend' });
  const first = f.preCredentialLifecycle.credentials[0];
  const added = {
    ...first,
    credential_id: 'credential.lifecycle.alpha.2',
    public_key_fingerprint: 'c'.repeat(64),
    issued_at: '2026-08-20T12:46:00.000Z',
    expires_at: '2027-08-19T12:46:00.000Z',
    supersedes_credential_id: first.credential_id
  };
  const post = lifecycleCredentialHistory({ events: [event], credentials: [first, added] });
  assert.throws(
    () => prepareCircleSelfProtectiveLifecycleMutation(baseInput(f, { postCredentialLifecycle: post })),
    /cannot change non-event lifecycle records/
  );
});

test('principal substitution, stale pre-head context, and wrong-request possession evidence fail closed', async t => {
  const f = await fixture(t);
  const event = credentialEvent({ kind: 'credential-suspend' });
  const postCredentialLifecycle = credentialLifecycleWithKey(f.keyPair, [event]);
  const input = baseInput(f, { postCredentialLifecycle });
  const prepared = prepareCircleSelfProtectiveLifecycleMutation(input);
  const attestation = possessionAttestation(f, prepared);

  assert.throws(
    () => prepareCircleSelfProtectiveLifecycleMutation({ ...input, authenticatedPrincipal: 'human.other' }),
    /self-service only/
  );

  const movedStore = {
    getCircleMemberLifecycleHead() {
      return { ...f.currentHead, lifecycle_head_digest: 'd'.repeat(64) };
    }
  };
  assert.throws(
    () => authorizeCircleSelfProtectiveLifecycleMutation({
      ...input,
      store: movedStore,
      possessionAttestation: attestation,
      hypervisorPublicKey: f.hypervisor.publicKey
    }),
    error => error?.code === 'circle_possession_attestation_context_mismatch'
      || error?.code === 'circle_self_protective_pre_mutation_head_mismatch'
  );

  const wrong = structuredClone(attestation);
  wrong.statement.request_digest = 'e'.repeat(64);
  wrong.signature = f.hypervisor.signObject(wrong.statement);
  assert.throws(
    () => authorizeCircleSelfProtectiveLifecycleMutation({
      ...input,
      possessionAttestation: wrong,
      hypervisorPublicKey: f.hypervisor.publicKey
    }),
    error => error?.code === 'circle_possession_attestation_context_mismatch'
  );
});

test('backdated and future-dated self-protective mutation events fail closed before possession', async t => {
  const f = await fixture(t);
  const backdated = credentialEvent({ kind: 'credential-suspend', at: '2026-08-20T12:44:59.000Z' });
  assert.throws(
    () => prepareCircleSelfProtectiveLifecycleMutation(baseInput(f, {
      postCredentialLifecycle: credentialLifecycleWithKey(f.keyPair, [backdated])
    })),
    error => error?.code === 'circle_self_protective_mutation_not_after_current_head'
  );

  const future = credentialEvent({ kind: 'credential-suspend', at: '2026-08-20T12:51:00.000Z' });
  assert.throws(
    () => prepareCircleSelfProtectiveLifecycleMutation(baseInput(f, {
      postCredentialLifecycle: credentialLifecycleWithKey(f.keyPair, [future])
    })),
    /cannot be in the future/
  );
});
