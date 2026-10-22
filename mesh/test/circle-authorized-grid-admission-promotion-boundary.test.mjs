import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const admissionPolicyUrl = new URL('../config/circle-authorized-grid-admission.v0.json', import.meta.url);
const authorizationPolicyUrl = new URL('../config/circle-record-authorization-lifecycle.v0.json', import.meta.url);
const threatReviewUrl = new URL('../config/circle-authorized-grid-admission-threat-review.v0.json', import.meta.url);
const composedSourceUrl = new URL('../src/grid/circle-authorized-admission.mjs', import.meta.url);
const parentSourceUrl = new URL('../src/grid/circle-admission.mjs', import.meta.url);
const gridServerUrl = new URL('../src/grid/server.mjs', import.meta.url);
const hypervisorServerUrl = new URL('../src/hypervisor/server.mjs', import.meta.url);

test('composed Circle admission cannot be promoted as unbound parent admission', async () => {
  const [admission, authorization, threat] = await Promise.all([
    readFile(admissionPolicyUrl, 'utf8').then(JSON.parse),
    readFile(authorizationPolicyUrl, 'utf8').then(JSON.parse),
    readFile(threatReviewUrl, 'utf8').then(JSON.parse)
  ]);

  assert.equal(admission.runtime_activation, false);
  assert.equal(admission.requirements.single_hypervisor_capability_for_authorization_and_admission, true);
  assert.equal(admission.requirements.authorization_assessment_recomputed_before_issue, true);
  assert.equal(admission.requirements.authorization_assessment_digest_bound, true);
  assert.equal(admission.requirements.eligibility_evidence_digest_bound, true);
  assert.equal(admission.requirements.parent_grid_admission_policy_digest_bound, true);
  assert.equal(admission.requirements.standalone_unbound_parent_admission_is_runtime_promotion_eligible, false);
  assert.equal(admission.requirements.hypervisor_runtime_route, false);
  assert.equal(admission.requirements.public_grid_route, false);
  assert.equal(admission.requirements.gateway_route, false);

  assert.equal(authorization.runtime_activation, false);
  assert.equal(authorization.requirements.historical_member_state_resolver_required, true);
  assert.equal(authorization.requirements.role_use_requires_event_time_membership_eligibility, true);
  assert.equal(authorization.requirements.role_use_requires_event_time_credential_currentness, true);
  assert.equal(authorization.requirements.open_proposal_membership_change_semantics_defined, false);
  assert.equal(authorization.requirements.open_proposal_membership_change_fails_closed, true);

  const blockers = new Set(threat.promotion_blockers);
  for (const blocker of [
    'hypervisor-bound-proof-of-current-credential-possession-and-request-binding',
    'historical-backfill-import-authority-and-live-event-freshness-policy',
    'current-membership-and-credential-lifecycle-head-guard-at-grid-commit-or-atomic-equivalent',
    'composed-authorized-admission-as-sole-service-level-circle-append-path'
  ]) assert.ok(blockers.has(blocker), `missing promotion blocker: ${blocker}`);
});

test('composed source structurally binds authorization while public runtime servers remain unwired', async () => {
  const [composed, parent, gridServer, hypervisorServer] = await Promise.all([
    readFile(composedSourceUrl, 'utf8'),
    readFile(parentSourceUrl, 'utf8'),
    readFile(gridServerUrl, 'utf8'),
    readFile(hypervisorServerUrl, 'utf8')
  ]);

  for (const required of [
    'assessCircleRecordAuthorizationWithEligibility',
    'authorizationInput.authenticatedPrincipal !== principal',
    'record_authorization_assessment_digest',
    'eligibility_evidence_digest',
    'record_authorization_policy_digest',
    'parent_grid_admission_policy_digest',
    'authorized_admission_policy_digest',
    'assertAuthorizationMatchesEvent'
  ]) assert.ok(composed.includes(required), `missing composed binding: ${required}`);

  assert.ok(parent.includes('circle-admission-implementation.mjs'));
  assert.doesNotMatch(parent, /circle-authorized-admission\.mjs/);
  for (const runtimeSource of [gridServer, hypervisorServer]) {
    assert.doesNotMatch(runtimeSource, /circle-authorized-admission\.mjs/);
    assert.doesNotMatch(runtimeSource, /commitCirclePersistenceWithAuthorizedAdmission/);
  }
});
