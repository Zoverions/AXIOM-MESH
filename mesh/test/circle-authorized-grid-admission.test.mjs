import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { digestObject } from '../src/lib/canonical.mjs';
import {
  ensureMeshIdentity,
  MeshIdentity
} from '../src/lib/identity.mjs';
import { loadDataProtector } from '../src/lib/protector.mjs';
import { CircleGridStore } from '../src/grid/circle-store.mjs';
import {
  commitCirclePersistenceWithAuthorizedAdmission,
  deriveCircleAuthorizedGridAdmissionInvocationDigest,
  deriveCircleAuthorizedGridAdmissionJti,
  deriveCircleAuthorizedGridAdmissionTraceId,
  getCircleAuthorizedGridAdmissionPolicy,
  issueCircleAuthorizedGridAdmissionCapability,
  validateCircleAuthorizedGridAdmissionPolicy,
  verifyCircleAuthorizedGridAdmissionCapability,
  verifyCircleAuthorizedGridAdmissionReceipt
} from '../src/grid/circle-authorized-admission.mjs';
import {
  CIRCLE_CHARTER_SCHEMA,
  CIRCLE_CORE_PACKAGE_SCHEMA,
  CIRCLE_DECISION_SCHEMA,
  CIRCLE_INVITATION_SCHEMA,
  CIRCLE_MEMBERSHIP_SCHEMA,
  CIRCLE_PROPOSAL_SCHEMA,
  CIRCLE_SCHEMA
} from '../src/lib/circle-core.mjs';
import {
  assessCircleRecordAuthorizationWithEligibility,
  getCircleRecordAuthorizationLifecyclePolicy,
  validateCircleRecordAuthorizationEligibilityResult,
  validateCircleRecordAuthorizationLifecyclePolicy
} from '../../packages/axiom-circle-record-authorization-lifecycle/index.mjs';
import { issueCircleDecisionParticipationAttestation } from '../../packages/axiom-circle-record-authorization/index.mjs';
import {
  buildCircleGridPersistenceCandidate,
  getCircleGridPersistencePolicy
} from '../../packages/axiom-circle-grid-persistence/index.mjs';

const NOW = new Date('2026-08-20T13:00:00.000Z');
const INTENT_DIGEST = digestObject({ schema: 'test-intent.v0', action: 'circle-authorized-persist' });
const PLAN_DIGEST = digestObject({ schema: 'test-plan.v0', step: 'authorize-then-persist' });
const POLICY_DIGEST = digestObject({ schema: 'test-policy.v0', decision: 'allow-bounded-circle-persist' });

const policyUrls = {
  eligibilityPolicy: new URL('../config/circle-member-eligibility-lifecycle.v0.json', import.meta.url),
  charterPolicy: new URL('../config/circle-charter-lifecycle.v0.json', import.meta.url),
  historicalBindingPolicy: new URL('../config/circle-historical-rule-binding.v0.json', import.meta.url),
  credentialPolicy: new URL('../config/circle-membership-credential-lifecycle.v0.json', import.meta.url)
};

async function loadPolicies() {
  const entries = await Promise.all(Object.entries(policyUrls).map(async ([key, url]) => [
    key,
    JSON.parse(await readFile(url, 'utf8'))
  ]));
  return Object.fromEntries(entries);
}

function identity(service = 'hypervisor') {
  const pair = generateKeyPairSync('ed25519');
  return new MeshIdentity(
    service,
    pair.privateKey.export({ type: 'pkcs8', format: 'pem' }),
    pair.publicKey.export({ type: 'spki', format: 'pem' })
  );
}

function charter() {
  return {
    schema: CIRCLE_CHARTER_SCHEMA,
    circle_id: 'circle.composed',
    version: 1,
    effective_from: '2026-08-20T12:01:00.000Z',
    supersedes_digest: null,
    roles: [
      {
        role_id: 'governor',
        label: 'Governor',
        declared_modes: ['approve', 'propose', 'vote', 'review', 'observe'],
        execution_authority: false
      },
      {
        role_id: 'voter',
        label: 'Voter',
        declared_modes: ['vote', 'observe'],
        execution_authority: false
      },
      {
        role_id: 'reviewer',
        label: 'Reviewer',
        declared_modes: ['review', 'observe'],
        execution_authority: false
      }
    ],
    decision_rule: {
      quorum_basis_points: 10000,
      approval_basis_points: 6000,
      abstention_counts_toward_quorum: false
    },
    appeal_enabled: true,
    member_exit_enabled: true,
    execution_authority: false,
    authority_effect: 'none'
  };
}

function circleDescriptor() {
  return {
    schema: CIRCLE_SCHEMA,
    circle_id: 'circle.composed',
    name: 'Authorized Admission Circle',
    purpose: 'Exercise lifecycle-aware authorization before inert Grid admission.',
    created_by: 'human.alpha',
    created_at: '2026-08-20T12:00:00.000Z',
    trust_anchor_id: 'anchor.composed',
    participation_model: 'voluntary',
    member_state_ownership: 'independent-node',
    policy_floor: 'raise-only',
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  };
}

function invitation({ id, principal, roles, issuedBy, issuedAt }) {
  return {
    schema: CIRCLE_INVITATION_SCHEMA,
    invitation_id: id,
    circle_id: 'circle.composed',
    invited_principal: principal,
    membership_class: 'member',
    role_ids: roles,
    issued_by: issuedBy,
    issued_at: issuedAt,
    expires_at: '2026-08-20T12:45:00.000Z',
    charter_digest: digestObject(charter()),
    one_use: true,
    authority_effect: 'none'
  };
}

function membership({ id, invitationId, principal, roles, acceptedAt, status = 'active', statusEffectiveAt = acceptedAt }) {
  return {
    schema: CIRCLE_MEMBERSHIP_SCHEMA,
    membership_id: id,
    circle_id: 'circle.composed',
    invitation_id: invitationId,
    principal_id: principal,
    role_ids: [...roles],
    accepted_at: acceptedAt,
    status,
    status_effective_at: statusEffectiveAt,
    member_state_ownership: 'independent-node',
    disclosure_profile: 'selective',
    authority_effect: 'none',
    network_effect: 'none'
  };
}

function proposal({ proposer = 'human.alpha' } = {}) {
  return {
    schema: CIRCLE_PROPOSAL_SCHEMA,
    proposal_id: 'proposal.composed',
    circle_id: 'circle.composed',
    charter_digest: digestObject(charter()),
    proposer,
    title: 'Persist one bounded collective decision',
    summary: 'Exercise lifecycle-aware electorate and authorization-to-admission binding.',
    created_at: '2026-08-20T12:10:00.000Z',
    closes_at: '2026-08-20T12:30:00.000Z',
    status: 'open',
    evidence_refs: ['evidence:composed:proposal'],
    execution_effect: 'none',
    authority_effect: 'none'
  };
}

function decision({ outcome = 'accepted', receipts = [] } = {}) {
  return {
    schema: CIRCLE_DECISION_SCHEMA,
    decision_id: 'decision.composed',
    circle_id: 'circle.composed',
    proposal_id: 'proposal.composed',
    charter_digest: digestObject(charter()),
    outcome,
    decided_at: '2026-08-20T12:31:00.000Z',
    participant_receipts: receipts,
    finality: 'circle-local-accepted',
    runtime_authority: false,
    authority_effect: 'none'
  };
}

function baseRecords() {
  const inviteAlpha = invitation({
    id: 'invite.alpha.composed',
    principal: 'human.alpha',
    roles: ['governor'],
    issuedBy: 'human.alpha',
    issuedAt: '2026-08-20T12:02:00.000Z'
  });
  const memberAlpha = membership({
    id: 'membership.alpha.composed',
    invitationId: inviteAlpha.invitation_id,
    principal: 'human.alpha',
    roles: ['governor'],
    acceptedAt: '2026-08-20T12:03:00.000Z'
  });
  const inviteBeta = invitation({
    id: 'invite.beta.composed',
    principal: 'human.beta',
    roles: ['voter'],
    issuedBy: 'human.alpha',
    issuedAt: '2026-08-20T12:04:00.000Z'
  });
  const memberBeta = membership({
    id: 'membership.beta.composed',
    invitationId: inviteBeta.invitation_id,
    principal: 'human.beta',
    roles: ['voter'],
    acceptedAt: '2026-08-20T12:05:00.000Z'
  });
  const inviteGamma = invitation({
    id: 'invite.gamma.composed',
    principal: 'human.gamma',
    roles: ['reviewer'],
    issuedBy: 'human.alpha',
    issuedAt: '2026-08-20T12:06:00.000Z'
  });
  const memberGamma = membership({
    id: 'membership.gamma.composed',
    invitationId: inviteGamma.invitation_id,
    principal: 'human.gamma',
    roles: ['reviewer'],
    acceptedAt: '2026-08-20T12:07:00.000Z'
  });
  return {
    inviteAlpha,
    memberAlpha,
    inviteBeta,
    memberBeta,
    inviteGamma,
    memberGamma,
    proposal: proposal()
  };
}

function circlePackage(records, overrides = {}) {
  const memberships = [records.memberAlpha, records.memberBeta, records.memberGamma].map(item => {
    const patch = overrides[item.membership_id] ?? {};
    return { ...item, ...patch, role_ids: [...(patch.role_ids ?? item.role_ids)] };
  });
  return {
    schema: CIRCLE_CORE_PACKAGE_SCHEMA,
    version: 0,
    status: 'inert-contract-laboratory',
    circle: circleDescriptor(),
    charter: charter(),
    invitations: [records.inviteAlpha, records.inviteBeta, records.inviteGamma],
    memberships,
    proposals: [],
    tasks: [],
    decisions: [],
    appeals: [],
    exits: [],
    exports: [],
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  };
}

function charterLifecycle() {
  const active = charter();
  const charterDigest = digestObject(active);
  return {
    schema: 'axiom-circle-charter-lifecycle.v0',
    circle_id: 'circle.composed',
    entries: [{
      schema: 'axiom-circle-charter-history-entry.v0',
      circle_id: 'circle.composed',
      charter: active,
      charter_digest: charterDigest,
      recorded_at: '2026-08-20T12:00:30.000Z',
      activation: {
        schema: 'axiom-circle-charter-activation.v0',
        circle_id: 'circle.composed',
        charter_digest: charterDigest,
        basis_charter_digest: null,
        activated_at: active.effective_from,
        evidence_refs: ['evidence:composed:charter'],
        creates_runtime_authority: false,
        authority_effect: 'none',
        network_effect: 'none'
      },
      authority_effect: 'none',
      network_effect: 'none'
    }],
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  };
}

function historicalBinding({ bindingId, type, record, boundAt, previous = null, basis = null }) {
  const idField = {
    invitation: 'invitation_id',
    membership: 'membership_id',
    proposal: 'proposal_id',
    decision: 'decision_id'
  }[type];
  const eventTime = {
    invitation: record.issued_at,
    membership: record.accepted_at,
    proposal: record.created_at,
    decision: record.decided_at
  }[type];
  const mode = {
    invitation: 'resolve-at-event',
    membership: 'invitation-current-at-acceptance',
    proposal: 'resolve-at-event-and-freeze',
    decision: 'inherit-proposal-frozen-charter'
  }[type];
  return {
    schema: 'axiom-circle-historical-rule-binding.v0',
    binding_id: bindingId,
    circle_id: 'circle.composed',
    record_type: type,
    record_id: record[idField],
    record_digest: digestObject(record),
    record,
    event_time: eventTime,
    bound_at: boundAt,
    previous_binding_digest: previous === null ? null : digestObject(previous),
    basis_binding_id: basis,
    binding_mode: mode,
    governing_charter_digest: digestObject(charter()),
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  };
}

function ledgerThroughProposal(records) {
  const bindings = [];
  const add = (bindingId, type, record, boundAt, basis = null) => {
    const next = historicalBinding({
      bindingId,
      type,
      record,
      boundAt,
      previous: bindings.at(-1) ?? null,
      basis
    });
    bindings.push(next);
    return next;
  };
  const inviteAlpha = add('binding.invite.alpha.composed', 'invitation', records.inviteAlpha, '2026-08-20T12:02:10.000Z');
  add('binding.membership.alpha.composed', 'membership', records.memberAlpha, '2026-08-20T12:03:10.000Z', inviteAlpha.binding_id);
  const inviteBeta = add('binding.invite.beta.composed', 'invitation', records.inviteBeta, '2026-08-20T12:04:10.000Z');
  add('binding.membership.beta.composed', 'membership', records.memberBeta, '2026-08-20T12:05:10.000Z', inviteBeta.binding_id);
  const inviteGamma = add('binding.invite.gamma.composed', 'invitation', records.inviteGamma, '2026-08-20T12:06:10.000Z');
  add('binding.membership.gamma.composed', 'membership', records.memberGamma, '2026-08-20T12:07:10.000Z', inviteGamma.binding_id);
  const proposalBinding = add('binding.proposal.composed', 'proposal', records.proposal, '2026-08-20T12:10:10.000Z');
  return { bindings, proposalBinding };
}

function ledgerObject(bindings) {
  return {
    schema: 'axiom-circle-historical-rule-binding-ledger.v0',
    circle_id: 'circle.composed',
    bindings,
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  };
}

function appendDecisionBinding(bindings, record, proposalBinding) {
  const next = historicalBinding({
    bindingId: 'binding.decision.composed',
    type: 'decision',
    record,
    boundAt: '2026-08-20T12:31:10.000Z',
    previous: bindings.at(-1),
    basis: proposalBinding.binding_id
  });
  bindings.push(next);
  return next;
}

const memberInfo = {
  alpha: {
    principal: 'human.alpha', membership: 'membership.alpha.composed', acceptance: 'binding.membership.alpha.composed',
    acceptedAt: '2026-08-20T12:03:00.000Z', device: 'device.alpha.composed', credential: 'credential.alpha.composed.1', fingerprint: 'a'.repeat(64)
  },
  beta: {
    principal: 'human.beta', membership: 'membership.beta.composed', acceptance: 'binding.membership.beta.composed',
    acceptedAt: '2026-08-20T12:05:00.000Z', device: 'device.beta.composed', credential: 'credential.beta.composed.1', fingerprint: 'b'.repeat(64)
  },
  gamma: {
    principal: 'human.gamma', membership: 'membership.gamma.composed', acceptance: 'binding.membership.gamma.composed',
    acceptedAt: '2026-08-20T12:07:00.000Z', device: 'device.gamma.composed', credential: 'credential.gamma.composed.1', fingerprint: 'c'.repeat(64)
  }
};

function membershipLifecycle(info, events = []) {
  return {
    schema: 'axiom-circle-member-eligibility-lifecycle.v0',
    circle_id: 'circle.composed',
    membership_id: info.membership,
    principal_id: info.principal,
    acceptance_binding_id: info.acceptance,
    events,
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  };
}

function eligibilityEvent(info, { kind, at, roleIds = null, previous = null }) {
  return {
    schema: 'axiom-circle-member-eligibility-event.v0',
    event_id: `event.${info.membership}.${kind}`,
    circle_id: 'circle.composed',
    membership_id: info.membership,
    principal_id: info.principal,
    kind,
    at,
    previous_event_digest: previous === null ? null : digestObject(previous),
    role_ids: roleIds,
    core_exit_id: null,
    authority_effect: 'none',
    network_effect: 'none'
  };
}

function credentialLifecycle(info, events = []) {
  const registeredAt = new Date(Date.parse(info.acceptedAt) + 10_000).toISOString();
  const issuedAt = new Date(Date.parse(info.acceptedAt) + 20_000).toISOString();
  return {
    schema: 'axiom-circle-membership-credential-lifecycle.v0',
    circle_id: 'circle.composed',
    membership_id: info.membership,
    principal_id: info.principal,
    term: {
      schema: 'axiom-circle-membership-term.v0',
      term_id: `term.${info.membership}`,
      circle_id: 'circle.composed',
      membership_id: info.membership,
      principal_id: info.principal,
      begins_at: info.acceptedAt,
      ends_at: '2027-08-20T12:00:00.000Z',
      changes_core_membership: false,
      authority_effect: 'none'
    },
    devices: [{
      schema: 'axiom-circle-member-device.v0',
      device_id: info.device,
      circle_id: 'circle.composed',
      membership_id: info.membership,
      principal_id: info.principal,
      registered_at: registeredAt,
      state_owner: 'independent-node',
      secret_material_included: false,
      execution_authority: false,
      authority_effect: 'none',
      network_effect: 'none'
    }],
    credentials: [{
      schema: 'axiom-circle-member-device-credential.v0',
      credential_id: info.credential,
      device_id: info.device,
      circle_id: 'circle.composed',
      membership_id: info.membership,
      principal_id: info.principal,
      algorithm: 'Ed25519',
      public_key_fingerprint: info.fingerprint,
      issued_at: issuedAt,
      expires_at: '2027-08-19T12:00:00.000Z',
      supersedes_credential_id: null,
      secret_material_included: false,
      execution_authority: false,
      authority_effect: 'none',
      network_effect: 'none'
    }],
    events,
    recovery_proposals: [],
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  };
}

function credentialEvent(info, { at, kind = 'device-compromise' }) {
  return {
    schema: 'axiom-circle-member-credential-event.v0',
    event_id: `event.${info.membership}.${kind}`,
    circle_id: 'circle.composed',
    membership_id: info.membership,
    principal_id: info.principal,
    target_type: kind === 'device-compromise' ? 'device' : 'credential',
    target_id: kind === 'device-compromise' ? info.device : info.credential,
    kind,
    at,
    reason_code: 'security-event',
    authority_effect: 'none',
    network_effect: 'none'
  };
}

function memberContext(info, { eligibilityEvents = [], credentialEvents = [] } = {}) {
  return {
    schema: 'axiom-circle-record-member-context.v0',
    circle_id: 'circle.composed',
    membership_id: info.membership,
    principal_id: info.principal,
    membership_lifecycle: membershipLifecycle(info, eligibilityEvents),
    credential_lifecycle: credentialLifecycle(info, credentialEvents),
    credential_id: info.credential
  };
}

function issueVotes(hypervisor, proposalBinding) {
  const issue = (info, vote, participatedAt) => issueCircleDecisionParticipationAttestation(hypervisor, {
    authenticated_principal: info.principal,
    circle_id: 'circle.composed',
    decision_id: 'decision.composed',
    proposal_id: 'proposal.composed',
    proposal_binding_id: proposalBinding.binding_id,
    proposal_record_digest: proposalBinding.record_digest,
    governing_charter_digest: digestObject(charter()),
    membership_id: info.membership,
    vote,
    participated_at: participatedAt
  });
  return [
    issue(memberInfo.alpha, 'approve', '2026-08-20T12:20:00.000Z'),
    issue(memberInfo.beta, 'approve', '2026-08-20T12:21:00.000Z')
  ];
}

async function authorizationFixture({
  bindingId = 'binding.proposal.composed',
  requester = 'human.alpha',
  packageOverrides = {},
  contexts = null,
  includeDecision = false,
  reviewerTransport = false,
  betaEligibilityEvents = [],
  betaCredentialEvents = [],
  alphaEligibilityEvents = [],
  alphaCredentialEvents = []
} = {}) {
  const policies = await loadPolicies();
  const records = baseRecords();
  const packageValue = circlePackage(records, packageOverrides);
  const { bindings, proposalBinding } = ledgerThroughProposal(records);
  const hypervisor = identity();
  let participantAttestations = [];
  let targetBindingId = bindingId;
  if (includeDecision) {
    const votes = issueVotes(hypervisor, proposalBinding);
    const record = decision({ receipts: votes.map(item => item.attestation_digest) });
    const decisionBinding = appendDecisionBinding(bindings, record, proposalBinding);
    participantAttestations = votes.map(item => item.attestation);
    targetBindingId = decisionBinding.binding_id;
    if (reviewerTransport) requester = 'human.gamma';
  }
  const ledger = ledgerObject(bindings);
  const memberContexts = contexts ?? [
    memberContext(memberInfo.alpha, { eligibilityEvents: alphaEligibilityEvents, credentialEvents: alphaCredentialEvents }),
    memberContext(memberInfo.beta, { eligibilityEvents: betaEligibilityEvents, credentialEvents: betaCredentialEvents }),
    memberContext(memberInfo.gamma)
  ];
  return {
    records,
    packageValue,
    ledger,
    proposalBinding,
    hypervisor,
    input: {
      ...policies,
      circlePackage: packageValue,
      charterLifecycle: charterLifecycle(),
      historicalLedger: ledger,
      bindingId: targetBindingId,
      authenticatedPrincipal: requester,
      memberContexts,
      participantAttestations,
      hypervisorPublicKey: includeDecision ? hypervisor.publicKey : null,
      now: NOW
    }
  };
}

async function gridFixture(t) {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-circle-authorized-admission-'));
  const hypervisor = await ensureMeshIdentity(dataDir, 'hypervisor', { create: true });
  const grid = await ensureMeshIdentity(dataDir, 'grid', { create: true });
  const protector = await loadDataProtector({ dataDir, autoBootstrap: true });
  const store = new CircleGridStore({
    path: join(dataDir, 'grid.sqlite'),
    dataDir,
    identity: grid,
    protector,
    checkpointInterval: 10_000
  });
  t.after(async () => {
    try { store.close(); } catch {}
    await rm(dataDir, { recursive: true, force: true });
  });
  return { hypervisor, grid, store };
}

function persistenceCandidate(fixture) {
  const policy = getCircleGridPersistencePolicy();
  const binding = fixture.ledger.bindings.find(item => item.binding_id === fixture.input.bindingId);
  return buildCircleGridPersistenceCandidate(
    policy,
    fixture.input.historicalBindingPolicy,
    fixture.input.charterPolicy,
    fixture.packageValue,
    fixture.input.charterLifecycle,
    fixture.ledger,
    {
      bindingId: binding.binding_id,
      expectedPriorCircleHeadDigest: binding.previous_binding_digest,
      now: NOW
    }
  );
}

function eventCount(store) {
  return Number(store.db.prepare('SELECT COUNT(*) AS count FROM events').get().count);
}

test('composed policies are exact, inert, fail closed, and not wired into runtime routes', async () => {
  assert.equal(validateCircleRecordAuthorizationLifecyclePolicy(getCircleRecordAuthorizationLifecyclePolicy()), true);
  assert.equal(validateCircleAuthorizedGridAdmissionPolicy(getCircleAuthorizedGridAdmissionPolicy()), true);
  assert.equal(getCircleRecordAuthorizationLifecyclePolicy().requirements.open_proposal_membership_change_semantics_defined, false);
  assert.equal(getCircleRecordAuthorizationLifecyclePolicy().requirements.open_proposal_membership_change_fails_closed, true);
  assert.equal(getCircleAuthorizedGridAdmissionPolicy().requirements.standalone_unbound_parent_admission_is_runtime_promotion_eligible, false);
  assert.equal(getCircleAuthorizedGridAdmissionPolicy().runtime_activation, false);

  const gridServer = await readFile(new URL('../src/grid/server.mjs', import.meta.url), 'utf8');
  const hypervisorServer = await readFile(new URL('../src/hypervisor/server.mjs', import.meta.url), 'utf8');
  for (const source of [gridServer, hypervisorServer]) {
    assert.doesNotMatch(source, /circle-authorized-admission\.mjs/);
    assert.doesNotMatch(source, /commitCirclePersistenceWithAuthorizedAdmission/);
  }
});

test('bootstrap and self-acceptance do not fabricate preexisting member eligibility', async () => {
  const bootstrap = await authorizationFixture({ bindingId: 'binding.invite.alpha.composed', contexts: [] });
  const first = assessCircleRecordAuthorizationWithEligibility(bootstrap.input);
  assert.equal(first.assessment.authorization_mode, 'creator-bootstrap-first-invitation');
  assert.equal(first.assessment.eligibility_mode, 'creator-bootstrap-no-membership');
  assert.equal(first.eligibility_evidence.items.length, 0);
  assert.equal(first.assessment.credential_possession_verified, false);

  const acceptance = await authorizationFixture({
    bindingId: 'binding.membership.beta.composed',
    requester: 'human.beta',
    contexts: []
  });
  const second = assessCircleRecordAuthorizationWithEligibility(acceptance.input);
  assert.equal(second.assessment.authorization_mode, 'invited-principal-self-acceptance');
  assert.equal(second.assessment.eligibility_mode, 'self-acceptance-pre-membership');
  assert.equal(second.eligibility_evidence.items.length, 0);
});

test('post-bootstrap invitation and proposal require event-time member credential eligibility', async () => {
  const invite = await authorizationFixture({ bindingId: 'binding.invite.gamma.composed' });
  const invitationResult = assessCircleRecordAuthorizationWithEligibility(invite.input);
  assert.equal(invitationResult.assessment.authorizing_membership_id, memberInfo.alpha.membership);
  assert.equal(invitationResult.eligibility_evidence.items[0].required_mode, 'approve');

  const proposalFixture = await authorizationFixture();
  const proposalResult = assessCircleRecordAuthorizationWithEligibility(proposalFixture.input);
  assert.equal(proposalResult.assessment.authorization_mode, 'active-member-propose');
  assert.equal(proposalResult.eligibility_evidence.items[0].required_mode, 'propose');
  assert.equal(proposalResult.eligibility_evidence.items[0].credential_id, memberInfo.alpha.credential);
  assert.equal(validateCircleRecordAuthorizationEligibilityResult(proposalResult), true);
});

test('later suspension does not rewrite an earlier authorized proposal', async () => {
  const suspend = eligibilityEvent(memberInfo.alpha, {
    kind: 'membership-suspend',
    at: '2026-08-20T12:40:00.000Z'
  });
  const fixture = await authorizationFixture({
    alphaEligibilityEvents: [suspend],
    packageOverrides: {
      [memberInfo.alpha.membership]: {
        status: 'suspended',
        status_effective_at: suspend.at
      }
    }
  });
  const result = assessCircleRecordAuthorizationWithEligibility(fixture.input);
  assert.equal(result.assessment.authorization_mode, 'active-member-propose');
  assert.equal(result.eligibility_evidence.items[0].at, '2026-08-20T12:10:00.000Z');
});

test('role narrowing before a proposal blocks propose authority without rewriting acceptance history', async () => {
  const narrow = eligibilityEvent(memberInfo.alpha, {
    kind: 'role-narrow',
    at: '2026-08-20T12:09:00.000Z',
    roleIds: []
  });
  const fixture = await authorizationFixture({
    alphaEligibilityEvents: [narrow],
    packageOverrides: {
      [memberInfo.alpha.membership]: { role_ids: [] }
    }
  });
  assert.throws(
    () => assessCircleRecordAuthorizationWithEligibility(fixture.input),
    /requires exactly one lifecycle-resolved active membership with propose mode/
  );
});

test('collective decision binds participant credential eligibility and transport eligibility at their own times', async () => {
  const fixture = await authorizationFixture({ includeDecision: true });
  const result = assessCircleRecordAuthorizationWithEligibility(fixture.input);
  assert.equal(result.assessment.authorization_mode, 'participant-aggregator');
  assert.equal(result.assessment.decision_tally.electorate_size, 2);
  assert.equal(result.assessment.decision_tally.computed_outcome, 'accepted');
  assert.equal(result.assessment.participant_attestation_digests.length, 2);
  assert.equal(result.assessment.eligibility_mode, 'collective-decision-member-use');
  assert.equal(result.eligibility_evidence.items.filter(item => item.purpose === 'decision-participant-vote').length, 2);
  assert.equal(result.eligibility_evidence.items.filter(item => item.purpose === 'decision-transport').length, 1);
  assert.equal(result.assessment.submitter_collective_authority, false);
});

test('review member may transport a decision but receives no vote or collective authority', async () => {
  const fixture = await authorizationFixture({ includeDecision: true, reviewerTransport: true });
  const result = assessCircleRecordAuthorizationWithEligibility(fixture.input);
  assert.equal(result.assessment.authorization_mode, 'review-member-aggregator');
  assert.equal(result.assessment.authorizing_membership_id, memberInfo.gamma.membership);
  const transport = result.eligibility_evidence.items.find(item => item.purpose === 'decision-transport');
  assert.equal(transport.principal_id, memberInfo.gamma.principal);
  assert.equal(transport.required_mode, 'review');
  assert.equal(result.assessment.submitter_collective_authority, false);
});

test('membership or role change during an open proposal fails closed until electorate-change semantics exist', async () => {
  const suspend = eligibilityEvent(memberInfo.beta, {
    kind: 'membership-suspend',
    at: '2026-08-20T12:25:00.000Z'
  });
  const fixture = await authorizationFixture({
    includeDecision: true,
    betaEligibilityEvents: [suspend],
    packageOverrides: {
      [memberInfo.beta.membership]: {
        status: 'suspended',
        status_effective_at: suspend.at
      }
    }
  });
  assert.throws(
    () => assessCircleRecordAuthorizationWithEligibility(fixture.input),
    /electorate membership or roles change during an open proposal/
  );
});

test('participant credential compromise before voting blocks the vote without inventing membership revocation', async () => {
  const compromise = credentialEvent(memberInfo.beta, {
    at: '2026-08-20T12:19:00.000Z'
  });
  const fixture = await authorizationFixture({
    includeDecision: true,
    betaCredentialEvents: [compromise]
  });
  assert.throws(
    () => assessCircleRecordAuthorizationWithEligibility(fixture.input),
    /credential is not authentication-eligible/
  );
  const currentBeta = fixture.packageValue.memberships.find(item => item.membership_id === memberInfo.beta.membership);
  assert.equal(currentBeta.status, 'active');
});

test('missing lifecycle context for a potentially authorizing membership fails closed', async () => {
  const fixture = await authorizationFixture({
    contexts: [memberContext(memberInfo.beta), memberContext(memberInfo.gamma)]
  });
  assert.throws(
    () => assessCircleRecordAuthorizationWithEligibility(fixture.input),
    /complete member lifecycle context/
  );
});

test('one Hypervisor capability binds exact authorization, eligibility, persistence event, and parent admission policy', async t => {
  const authorizationFixtureValue = await authorizationFixture();
  const candidate = persistenceCandidate(authorizationFixtureValue);
  const { hypervisor } = await gridFixture(t);
  const nowSeconds = Math.floor(Date.now() / 1000);
  const issued = issueCircleAuthorizedGridAdmissionCapability(hypervisor, {
    actor: 'human.alpha',
    event: candidate.event,
    authorizationInput: authorizationFixtureValue.input,
    intentDigest: INTENT_DIGEST,
    planDigest: PLAN_DIGEST,
    policyDigest: POLICY_DIGEST,
    nowSeconds,
    ttlSeconds: 120
  });
  const verified = verifyCircleAuthorizedGridAdmissionCapability(
    issued.capability,
    hypervisor.publicKey,
    {
      actor: 'human.alpha',
      event: candidate.event,
      authorization: issued.authorization,
      nowSeconds,
      maxTtlSeconds: 120
    }
  );
  assert.equal(verified.claims.jti, deriveCircleAuthorizedGridAdmissionJti('human.alpha', candidate.event, issued.authorization));
  assert.equal(
    verified.claims.invocation_digest,
    deriveCircleAuthorizedGridAdmissionInvocationDigest('human.alpha', candidate.event, issued.authorization)
  );
  assert.equal(verified.claims.constraints.record_authorization_assessment_digest, issued.authorization.assessment_digest);
  assert.equal(verified.claims.constraints.eligibility_evidence_digest, issued.authorization.eligibility_evidence_digest);
  assert.equal(verified.claims.constraints.binding_digest, candidate.binding_digest);
  assert.equal(verified.claims.constraints.authorized_admission_policy_digest, digestObject(getCircleAuthorizedGridAdmissionPolicy()));
  assert.equal(verified.claims.constraints.runtime_authority, false);
});

test('authorized admission rejects actor, event, or authorization substitution', async t => {
  const source = await authorizationFixture();
  const candidate = persistenceCandidate(source);
  const { hypervisor } = await gridFixture(t);
  const nowSeconds = Math.floor(Date.now() / 1000);
  const issued = issueCircleAuthorizedGridAdmissionCapability(hypervisor, {
    actor: 'human.alpha',
    event: candidate.event,
    authorizationInput: source.input,
    intentDigest: INTENT_DIGEST,
    planDigest: PLAN_DIGEST,
    policyDigest: POLICY_DIGEST,
    nowSeconds,
    ttlSeconds: 120
  });

  assert.throws(
    () => verifyCircleAuthorizedGridAdmissionCapability(issued.capability, hypervisor.publicKey, {
      actor: 'human.beta',
      event: candidate.event,
      authorization: issued.authorization,
      nowSeconds,
      maxTtlSeconds: 120
    }),
    /does not match|not bound|mismatch/i
  );

  const bootstrap = await authorizationFixture({ bindingId: 'binding.invite.alpha.composed', contexts: [] });
  const otherCandidate = persistenceCandidate(bootstrap);
  assert.throws(
    () => verifyCircleAuthorizedGridAdmissionCapability(issued.capability, hypervisor.publicKey, {
      actor: 'human.alpha',
      event: otherCandidate.event,
      authorization: issued.authorization,
      nowSeconds,
      maxTtlSeconds: 120
    }),
    /does not match|not bound|mismatch/i
  );

  const tamperedAuthorization = structuredClone(issued.authorization);
  tamperedAuthorization.assessment.authorization_mode = 'forged-mode';
  assert.throws(
    () => verifyCircleAuthorizedGridAdmissionCapability(issued.capability, hypervisor.publicKey, {
      actor: 'human.alpha',
      event: candidate.event,
      authorization: tamperedAuthorization,
      nowSeconds,
      maxTtlSeconds: 120
    }),
    /assessment digest is invalid/
  );
});

test('authorized append persists one event, binds capability digest in Grid trace, and returns verifiable receipt', async t => {
  const source = await authorizationFixture();
  const candidate = persistenceCandidate(source);
  const { hypervisor, grid, store } = await gridFixture(t);
  const nowSeconds = Math.floor(Date.now() / 1000);
  const issued = issueCircleAuthorizedGridAdmissionCapability(hypervisor, {
    actor: 'human.alpha',
    event: candidate.event,
    authorizationInput: source.input,
    intentDigest: INTENT_DIGEST,
    planDigest: PLAN_DIGEST,
    policyDigest: POLICY_DIGEST,
    nowSeconds,
    ttlSeconds: 120
  });
  const committed = commitCirclePersistenceWithAuthorizedAdmission({
    store,
    hypervisorPublicKey: hypervisor.publicKey,
    capability: issued.capability,
    authorization: issued.authorization,
    actor: 'human.alpha',
    event: candidate.event,
    nowSeconds,
    maxTtlSeconds: 120
  });
  assert.equal(committed.event.trace_id, deriveCircleAuthorizedGridAdmissionTraceId(issued.capability));
  assert.equal(committed.event.event_id, candidate.event.event_id);
  assert.equal(committed.receipt.statement.record_authorization_assessment_digest, issued.authorization.assessment_digest);
  assert.equal(committed.receipt.statement.eligibility_evidence_digest, issued.authorization.eligibility_evidence_digest);
  assert.equal(store.getCirclePersistenceHead('circle.composed').head_binding_digest, candidate.binding_digest);
  assert.equal(store.verifyFullChain().valid, true);
  assert.equal(eventCount(store), 1);

  const verifiedReceipt = verifyCircleAuthorizedGridAdmissionReceipt(committed.receipt, {
    gridPublicKey: grid.publicKey,
    hypervisorPublicKey: hypervisor.publicKey,
    capability: issued.capability,
    authorization: issued.authorization,
    actor: 'human.alpha',
    event: candidate.event,
    gridEvent: committed.event,
    chainVerification: store.verifyFullChain(),
    maxTtlSeconds: 120
  });
  assert.equal(verifiedReceipt.receipt_digest, committed.receipt_digest);
  assert.equal(verifiedReceipt.chain_verified, true);
  assert.equal(verifiedReceipt.authorization_bound, true);
});

test('same exact authorized capability replay is idempotent while reissued authorization capability cannot impersonate the first admission', async t => {
  const source = await authorizationFixture();
  const candidate = persistenceCandidate(source);
  const { hypervisor, store } = await gridFixture(t);
  const nowSeconds = Math.floor(Date.now() / 1000);
  const firstGrant = issueCircleAuthorizedGridAdmissionCapability(hypervisor, {
    actor: 'human.alpha',
    event: candidate.event,
    authorizationInput: source.input,
    intentDigest: INTENT_DIGEST,
    planDigest: PLAN_DIGEST,
    policyDigest: POLICY_DIGEST,
    nowSeconds,
    ttlSeconds: 120
  });
  const first = commitCirclePersistenceWithAuthorizedAdmission({
    store,
    hypervisorPublicKey: hypervisor.publicKey,
    capability: firstGrant.capability,
    authorization: firstGrant.authorization,
    actor: 'human.alpha',
    event: candidate.event,
    nowSeconds,
    maxTtlSeconds: 120
  });
  const replay = commitCirclePersistenceWithAuthorizedAdmission({
    store,
    hypervisorPublicKey: hypervisor.publicKey,
    capability: firstGrant.capability,
    authorization: firstGrant.authorization,
    actor: 'human.alpha',
    event: structuredClone(candidate.event),
    nowSeconds,
    maxTtlSeconds: 120
  });
  assert.equal(replay.event.seq, first.event.seq);
  assert.equal(eventCount(store), 1);

  const secondGrant = issueCircleAuthorizedGridAdmissionCapability(hypervisor, {
    actor: 'human.alpha',
    event: candidate.event,
    authorizationInput: source.input,
    intentDigest: INTENT_DIGEST,
    planDigest: PLAN_DIGEST,
    policyDigest: POLICY_DIGEST,
    nowSeconds: nowSeconds + 1,
    ttlSeconds: 120
  });
  assert.equal(secondGrant.authorization.assessment_digest, firstGrant.authorization.assessment_digest);
  assert.notEqual(secondGrant.capability, firstGrant.capability);
  assert.throws(
    () => commitCirclePersistenceWithAuthorizedAdmission({
      store,
      hypervisorPublicKey: hypervisor.publicKey,
      capability: secondGrant.capability,
      authorization: secondGrant.authorization,
      actor: 'human.alpha',
      event: candidate.event,
      nowSeconds: nowSeconds + 1,
      maxTtlSeconds: 120
    }),
    error => error.code === 'circle_authorized_admission_replay_mismatch' && error.status === 409
  );
  assert.equal(eventCount(store), 1);
});
