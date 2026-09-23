import assert from 'node:assert/strict';
import test from 'node:test';

import {
  authorizeCircleSelfProtectiveLifecycleMutation,
  prepareCircleSelfProtectiveLifecycleMutation
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
  lifecycleMembershipHistory,
  loadCircleLifecycleFixturePolicies
} from './helpers/circle-lifecycle-grid-fixture.mjs';

const NOW = new Date('2026-08-20T12:50:00.000Z');

function suspendCredentialLifecycle() {
  return lifecycleCredentialHistory({
    events: [{
      schema: 'axiom-circle-member-credential-event.v0',
      event_id: 'credential.self.currentness-race.suspend',
      circle_id: FIXTURE_CIRCLE_ID,
      membership_id: FIXTURE_MEMBERSHIP_ID,
      principal_id: FIXTURE_PRINCIPAL,
      target_type: 'credential',
      target_id: FIXTURE_CREDENTIAL_ID,
      kind: 'credential-suspend',
      at: '2026-08-20T12:47:00.000Z',
      reason_code: 'self-protect',
      authority_effect: 'none',
      network_effect: 'none'
    }]
  });
}

test('lifecycle head movement between preparation and authorization invalidates the pre-mutation context before possession evaluation', async () => {
  const policies = await loadCircleLifecycleFixturePolicies();
  const preMembershipLifecycle = lifecycleMembershipHistory();
  const preCredentialLifecycle = lifecycleCredentialHistory();
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
    now: NOW
  });
  const retained = {
    circle_id: FIXTURE_CIRCLE_ID,
    membership_id: FIXTURE_MEMBERSHIP_ID,
    principal_id: FIXTURE_PRINCIPAL,
    lifecycle_head_digest: preCandidate.resulting_grid_lifecycle_head_digest,
    membership_lifecycle_digest: preCandidate.membership_lifecycle_digest,
    credential_lifecycle_digest: preCandidate.credential_lifecycle_digest,
    event_id: preCandidate.event.event_id,
    event_seq: 1,
    updated_at: '2026-08-20T12:45:00.000Z'
  };
  let current = retained;
  const store = {
    getCircleMemberLifecycleHead() {
      return structuredClone(current);
    }
  };
  const input = {
    store,
    authenticatedPrincipal: FIXTURE_PRINCIPAL,
    authorizingCredentialId: FIXTURE_CREDENTIAL_ID,
    ...policies,
    circlePackage,
    charterLifecycle,
    historicalLedger,
    preMembershipLifecycle,
    preCredentialLifecycle,
    postMembershipLifecycle: preMembershipLifecycle,
    postCredentialLifecycle: suspendCredentialLifecycle(),
    nowSeconds: Math.floor(NOW.valueOf() / 1000)
  };

  const prepared = prepareCircleSelfProtectiveLifecycleMutation(input);
  assert.equal(prepared.current_lifecycle_head.lifecycle_head_digest, retained.lifecycle_head_digest);

  current = {
    ...retained,
    lifecycle_head_digest: 'd'.repeat(64),
    credential_lifecycle_digest: 'e'.repeat(64),
    event_id: 'circle_lifecycle_head_moved',
    event_seq: 2,
    updated_at: '2026-08-20T12:49:00.000Z'
  };

  assert.throws(
    () => authorizeCircleSelfProtectiveLifecycleMutation({
      ...input,
      possessionAttestation: null,
      hypervisorPublicKey: null
    }),
    error => error?.code === 'circle_self_protective_pre_mutation_head_mismatch' && error.status === 409
  );
});
