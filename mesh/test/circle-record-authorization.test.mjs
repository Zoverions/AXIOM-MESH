import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { digestObject } from '../src/lib/canonical.mjs';
import { MeshIdentity } from '../src/lib/identity.mjs';
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
  assessCircleRecordAuthorization,
  issueCircleDecisionParticipationAttestation,
  validateCircleRecordAuthorizationPolicy,
  verifyCircleDecisionParticipationAttestation
} from '../../packages/axiom-circle-record-authorization/index.mjs';

const recordPolicyUrl = new URL('../config/circle-record-authorization.v0.json', import.meta.url);
const charterPolicyUrl = new URL('../config/circle-charter-lifecycle.v0.json', import.meta.url);
const historicalPolicyUrl = new URL('../config/circle-historical-rule-binding.v0.json', import.meta.url);
const NOW = new Date('2026-08-20T13:00:00.000Z');

async function loadPolicies() {
  const [policy, charterPolicy, historicalBindingPolicy] = await Promise.all([
    readFile(recordPolicyUrl, 'utf8').then(JSON.parse),
    readFile(charterPolicyUrl, 'utf8').then(JSON.parse),
    readFile(historicalPolicyUrl, 'utf8').then(JSON.parse)
  ]);
  return { policy, charterPolicy, historicalBindingPolicy };
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
    circle_id: 'circle.authz',
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
    circle_id: 'circle.authz',
    name: 'Record Authorization Circle',
    purpose: 'Exercise historically bound Circle record authorization.',
    created_by: 'human.alpha',
    created_at: '2026-08-20T12:00:00.000Z',
    trust_anchor_id: 'anchor.authz',
    participation_model: 'voluntary',
    member_state_ownership: 'independent-node',
    policy_floor: 'raise-only',
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  };
}

function invitation({ id, principal, roles, issuedBy, issuedAt, expiresAt = '2026-08-20T12:45:00.000Z' }) {
  return {
    schema: CIRCLE_INVITATION_SCHEMA,
    invitation_id: id,
    circle_id: 'circle.authz',
    invited_principal: principal,
    membership_class: 'member',
    role_ids: roles,
    issued_by: issuedBy,
    issued_at: issuedAt,
    expires_at: expiresAt,
    charter_digest: digestObject(charter()),
    one_use: true,
    authority_effect: 'none'
  };
}

function membership({ id, invitationId, principal, roles, acceptedAt, status = 'active', statusEffectiveAt = acceptedAt }) {
  return {
    schema: CIRCLE_MEMBERSHIP_SCHEMA,
    membership_id: id,
    circle_id: 'circle.authz',
    invitation_id: invitationId,
    principal_id: principal,
    role_ids: roles,
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
    proposal_id: 'proposal.authz',
    circle_id: 'circle.authz',
    charter_digest: digestObject(charter()),
    proposer,
    title: 'Authorize a bounded Circle decision',
    summary: 'Exercise proposal-time electorate and frozen-charter tally rules.',
    created_at: '2026-08-20T12:10:00.000Z',
    closes_at: '2026-08-20T12:30:00.000Z',
    status: 'open',
    evidence_refs: ['evidence:authz:proposal'],
    execution_effect: 'none',
    authority_effect: 'none'
  };
}

function decision({ outcome = 'accepted', receipts = [] } = {}) {
  return {
    schema: CIRCLE_DECISION_SCHEMA,
    decision_id: 'decision.authz',
    circle_id: 'circle.authz',
    proposal_id: 'proposal.authz',
    charter_digest: digestObject(charter()),
    outcome,
    decided_at: '2026-08-20T12:31:00.000Z',
    participant_receipts: receipts,
    finality: 'circle-local-accepted',
    runtime_authority: false,
    authority_effect: 'none'
  };
}

function historicalBinding({ bindingId, recordType, record, eventTime, boundAt, previous = null, basisBindingId = null }) {
  const idField = {
    invitation: 'invitation_id',
    membership: 'membership_id',
    proposal: 'proposal_id',
    decision: 'decision_id'
  }[recordType];
  const mode = {
    invitation: 'resolve-at-event',
    membership: 'invitation-current-at-acceptance',
    proposal: 'resolve-at-event-and-freeze',
    decision: 'inherit-proposal-frozen-charter'
  }[recordType];
  return {
    schema: 'axiom-circle-historical-rule-binding.v0',
    binding_id: bindingId,
    circle_id: 'circle.authz',
    record_type: recordType,
    record_id: record[idField],
    record_digest: digestObject(record),
    record,
    event_time: eventTime,
    bound_at: boundAt,
    previous_binding_digest: previous === null ? null : digestObject(previous),
    basis_binding_id: basisBindingId,
    binding_mode: mode,
    governing_charter_digest: digestObject(charter()),
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
    circle_id: 'circle.authz',
    entries: [{
      schema: 'axiom-circle-charter-history-entry.v0',
      circle_id: 'circle.authz',
      charter: active,
      charter_digest: charterDigest,
      recorded_at: '2026-08-20T12:00:30.000Z',
      activation: {
        schema: 'axiom-circle-charter-activation.v0',
        circle_id: 'circle.authz',
        charter_digest: charterDigest,
        basis_charter_digest: null,
        activated_at: active.effective_from,
        evidence_refs: ['evidence:authz:charter'],
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

function baseRecords({ gammaIssuer = 'human.alpha', proposalProposer = 'human.alpha', betaStatus = 'active', betaStatusEffectiveAt = '2026-08-20T12:05:00.000Z' } = {}) {
  const inviteAlpha = invitation({
    id: 'invite.alpha',
    principal: 'human.alpha',
    roles: ['governor'],
    issuedBy: 'human.alpha',
    issuedAt: '2026-08-20T12:02:00.000Z'
  });
  const memberAlpha = membership({
    id: 'membership.alpha',
    invitationId: inviteAlpha.invitation_id,
    principal: 'human.alpha',
    roles: ['governor'],
    acceptedAt: '2026-08-20T12:03:00.000Z'
  });
  const inviteBeta = invitation({
    id: 'invite.beta',
    principal: 'human.beta',
    roles: ['voter'],
    issuedBy: 'human.alpha',
    issuedAt: '2026-08-20T12:04:00.000Z'
  });
  const memberBeta = membership({
    id: 'membership.beta',
    invitationId: inviteBeta.invitation_id,
    principal: 'human.beta',
    roles: ['voter'],
    acceptedAt: '2026-08-20T12:05:00.000Z',
    status: betaStatus,
    statusEffectiveAt: betaStatusEffectiveAt
  });
  const inviteGamma = invitation({
    id: 'invite.gamma',
    principal: 'human.gamma',
    roles: ['reviewer'],
    issuedBy: gammaIssuer,
    issuedAt: '2026-08-20T12:06:00.000Z'
  });
  const memberGamma = membership({
    id: 'membership.gamma',
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
    proposal: proposal({ proposer: proposalProposer })
  };
}

function circlePackage(records) {
  return {
    schema: CIRCLE_CORE_PACKAGE_SCHEMA,
    version: 0,
    status: 'inert-contract-laboratory',
    circle: circleDescriptor(),
    charter: charter(),
    invitations: [records.inviteAlpha, records.inviteBeta, records.inviteGamma],
    memberships: [records.memberAlpha, records.memberBeta, records.memberGamma],
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

function ledgerThroughProposal(records) {
  const bindings = [];
  const add = ({ bindingId, recordType, record, eventTime, boundAt, basisBindingId = null }) => {
    const next = historicalBinding({
      bindingId,
      recordType,
      record,
      eventTime,
      boundAt,
      previous: bindings.at(-1) ?? null,
      basisBindingId
    });
    bindings.push(next);
    return next;
  };
  const inviteAlpha = add({
    bindingId: 'binding.invite.alpha',
    recordType: 'invitation',
    record: records.inviteAlpha,
    eventTime: records.inviteAlpha.issued_at,
    boundAt: '2026-08-20T12:02:30.000Z'
  });
  add({
    bindingId: 'binding.membership.alpha',
    recordType: 'membership',
    record: records.memberAlpha,
    eventTime: records.memberAlpha.accepted_at,
    boundAt: '2026-08-20T12:03:30.000Z',
    basisBindingId: inviteAlpha.binding_id
  });
  const inviteBeta = add({
    bindingId: 'binding.invite.beta',
    recordType: 'invitation',
    record: records.inviteBeta,
    eventTime: records.inviteBeta.issued_at,
    boundAt: '2026-08-20T12:04:30.000Z'
  });
  add({
    bindingId: 'binding.membership.beta',
    recordType: 'membership',
    record: records.memberBeta,
    eventTime: records.memberBeta.accepted_at,
    boundAt: '2026-08-20T12:05:30.000Z',
    basisBindingId: inviteBeta.binding_id
  });
  const inviteGamma = add({
    bindingId: 'binding.invite.gamma',
    recordType: 'invitation',
    record: records.inviteGamma,
    eventTime: records.inviteGamma.issued_at,
    boundAt: '2026-08-20T12:06:30.000Z'
  });
  add({
    bindingId: 'binding.membership.gamma',
    recordType: 'membership',
    record: records.memberGamma,
    eventTime: records.memberGamma.accepted_at,
    boundAt: '2026-08-20T12:07:30.000Z',
    basisBindingId: inviteGamma.binding_id
  });
  const proposalBinding = add({
    bindingId: 'binding.proposal.authz',
    recordType: 'proposal',
    record: records.proposal,
    eventTime: records.proposal.created_at,
    boundAt: '2026-08-20T12:10:30.000Z'
  });
  return { bindings, proposalBinding };
}

function ledgerObject(bindings) {
  return {
    schema: 'axiom-circle-historical-rule-binding-ledger.v0',
    circle_id: 'circle.authz',
    bindings,
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  };
}

function appendDecisionBinding(bindings, record, proposalBinding) {
  const decisionBinding = historicalBinding({
    bindingId: 'binding.decision.authz',
    recordType: 'decision',
    record,
    eventTime: record.decided_at,
    boundAt: '2026-08-20T12:31:30.000Z',
    previous: bindings.at(-1),
    basisBindingId: proposalBinding.binding_id
  });
  bindings.push(decisionBinding);
  return decisionBinding;
}

async function authorizationInput({ records = baseRecords(), bindingId, ledger, requester, participantAttestations = [], hypervisorPublicKey = null } = {}) {
  const policies = await loadPolicies();
  return {
    ...policies,
    circlePackage: circlePackage(records),
    charterLifecycle: charterLifecycle(),
    historicalLedger: ledger,
    bindingId,
    authenticatedPrincipal: requester,
    participantAttestations,
    hypervisorPublicKey,
    now: NOW
  };
}

function issueVotes(hypervisor, proposalBinding, votes = { alpha: 'approve', beta: 'approve' }) {
  const issue = (principal, membershipId, vote, participatedAt) => issueCircleDecisionParticipationAttestation(
    hypervisor,
    {
      authenticated_principal: principal,
      circle_id: 'circle.authz',
      decision_id: 'decision.authz',
      proposal_id: 'proposal.authz',
      proposal_binding_id: proposalBinding.binding_id,
      proposal_record_digest: proposalBinding.record_digest,
      governing_charter_digest: digestObject(charter()),
      membership_id: membershipId,
      vote,
      participated_at: participatedAt
    }
  );
  return [
    issue('human.alpha', 'membership.alpha', votes.alpha, '2026-08-20T12:20:00.000Z'),
    issue('human.beta', 'membership.beta', votes.beta, '2026-08-20T12:21:00.000Z')
  ];
}

async function decisionFixture({ requester = 'human.alpha', votes = { alpha: 'approve', beta: 'approve' }, outcome = 'accepted', betaStatus = 'active', betaStatusEffectiveAt = '2026-08-20T12:05:00.000Z' } = {}) {
  const hypervisor = identity();
  const records = baseRecords({ betaStatus, betaStatusEffectiveAt });
  const { bindings, proposalBinding } = ledgerThroughProposal(records);
  const issued = issueVotes(hypervisor, proposalBinding, votes);
  const record = decision({
    outcome,
    receipts: issued.map(item => item.attestation_digest)
  });
  const decisionBinding = appendDecisionBinding(bindings, record, proposalBinding);
  const ledger = ledgerObject(bindings);
  const input = await authorizationInput({
    records,
    bindingId: decisionBinding.binding_id,
    ledger,
    requester,
    participantAttestations: issued.map(item => item.attestation),
    hypervisorPublicKey: hypervisor.publicKey
  });
  return { hypervisor, records, proposalBinding, issued, record, decisionBinding, ledger, input };
}

test('Circle record authorization policy is exact, inert, and non-authorizing', async () => {
  const { policy } = await loadPolicies();
  assert.equal(validateCircleRecordAuthorizationPolicy(policy), true);
  assert.equal(policy.runtime_activation, false);
  assert.equal(policy.requirements.creator_bootstrap_persists_as_founder_authority, false);
  assert.equal(policy.requirements.decision_submitter_has_collective_authority, false);
  assert.equal(policy.requirements.decision_requires_complete_electorate_attestation_set, true);
  assert.equal(policy.output.runtime_authority, false);
  assert.equal(policy.output.external_effect_authority, false);
});

test('first genesis invitation may use creator bootstrap but does not create founder authority', async () => {
  const records = baseRecords();
  const { bindings } = ledgerThroughProposal(records);
  const ledger = ledgerObject(bindings);
  const result = assessCircleRecordAuthorization(await authorizationInput({
    records,
    bindingId: 'binding.invite.alpha',
    ledger,
    requester: 'human.alpha'
  }));
  assert.equal(result.assessment.authorization_mode, 'creator-bootstrap-first-invitation');
  assert.equal(result.assessment.authorizing_membership_id, null);
  assert.equal(result.assessment.runtime_authority, false);
  assert.equal(result.assessment.submitter_collective_authority, false);
});

test('post-bootstrap invitation requires an earlier historically bound approve membership', async () => {
  const records = baseRecords({ gammaIssuer: 'human.beta' });
  const { bindings } = ledgerThroughProposal(records);
  const ledger = ledgerObject(bindings);
  assert.throws(() => assessCircleRecordAuthorization(awaitableInputPlaceholder()), /never/);
  const input = await authorizationInput({
    records,
    bindingId: 'binding.invite.gamma',
    ledger,
    requester: 'human.beta'
  });
  assert.throws(
    () => assessCircleRecordAuthorization(input),
    /historically bound active unexited membership with approve mode/
  );
});

function awaitableInputPlaceholder() {
  throw new Error('never');
}

test('membership acceptance is self-only and proposal submission is role-bound', async () => {
  const records = baseRecords();
  const { bindings } = ledgerThroughProposal(records);
  const ledger = ledgerObject(bindings);
  const membershipOk = assessCircleRecordAuthorization(await authorizationInput({
    records,
    bindingId: 'binding.membership.beta',
    ledger,
    requester: 'human.beta'
  }));
  assert.equal(membershipOk.assessment.authorization_mode, 'invited-principal-self-acceptance');

  const wrongMembershipRequester = await authorizationInput({
    records,
    bindingId: 'binding.membership.beta',
    ledger,
    requester: 'human.alpha'
  });
  assert.throws(() => assessCircleRecordAuthorization(wrongMembershipRequester), /invited principal/);

  const proposalOk = assessCircleRecordAuthorization(await authorizationInput({
    records,
    bindingId: 'binding.proposal.authz',
    ledger,
    requester: 'human.alpha'
  }));
  assert.equal(proposalOk.assessment.authorization_mode, 'active-member-propose');
  assert.equal(proposalOk.assessment.authorizing_membership_id, 'membership.alpha');

  const betaProposalRecords = baseRecords({ proposalProposer: 'human.beta' });
  const betaProposalLedger = ledgerObject(ledgerThroughProposal(betaProposalRecords).bindings);
  const betaProposalInput = await authorizationInput({
    records: betaProposalRecords,
    bindingId: 'binding.proposal.authz',
    ledger: betaProposalLedger,
    requester: 'human.beta'
  });
  assert.throws(
    () => assessCircleRecordAuthorization(betaProposalInput),
    /historically bound active unexited membership with propose mode/
  );
});

test('collective decision recomputes complete electorate quorum and approval without a decider', async () => {
  const fixture = await decisionFixture();
  const result = assessCircleRecordAuthorization(fixture.input);
  assert.equal(result.assessment.authorization_mode, 'participant-aggregator');
  assert.equal(result.assessment.authorizing_membership_id, null);
  assert.equal(result.assessment.submitter_collective_authority, false);
  assert.deepEqual(result.assessment.decision_tally, {
    electorate_size: 2,
    approve: 2,
    reject: 0,
    abstain: 0,
    quorum_basis_points: 10000,
    approval_basis_points: 6000,
    abstention_counts_toward_quorum: false,
    quorum_met: true,
    approval_met: true,
    computed_outcome: 'accepted'
  });
  assert.equal(result.assessment.participant_attestation_digests.length, 2);
  assert.equal(result.assessment.runtime_authority, false);
});

test('review-mode member may aggregate a decision but gains no vote or collective authority', async () => {
  const fixture = await decisionFixture({ requester: 'human.gamma' });
  const result = assessCircleRecordAuthorization(fixture.input);
  assert.equal(result.assessment.authorization_mode, 'review-member-aggregator');
  assert.equal(result.assessment.authorizing_membership_id, 'membership.gamma');
  assert.equal(result.assessment.decision_tally.electorate_size, 2);
  assert.equal(result.assessment.submitter_collective_authority, false);
});

test('decision fails closed on incomplete, duplicate, forged, or context-substituted participant evidence', async () => {
  const fixture = await decisionFixture();
  const missing = {
    ...fixture.input,
    participantAttestations: [fixture.issued[0].attestation]
  };
  assert.throws(
    () => assessCircleRecordAuthorization(missing),
    /one authenticated attestation from every eligible voter/
  );

  const duplicate = {
    ...fixture.input,
    participantAttestations: [fixture.issued[0].attestation, fixture.issued[0].attestation]
  };
  assert.throws(() => assessCircleRecordAuthorization(duplicate), /cannot count a principal or membership twice/);

  const forged = structuredClone(fixture.issued[0].attestation);
  forged.statement.vote = 'reject';
  assert.throws(
    () => verifyCircleDecisionParticipationAttestation(forged, fixture.hypervisor.publicKey),
    /signature is invalid/
  );

  const otherProposal = issueCircleDecisionParticipationAttestation(fixture.hypervisor, {
    authenticated_principal: 'human.alpha',
    circle_id: 'circle.authz',
    decision_id: 'decision.authz',
    proposal_id: 'proposal.authz',
    proposal_binding_id: fixture.proposalBinding.binding_id,
    proposal_record_digest: 'a'.repeat(64),
    governing_charter_digest: digestObject(charter()),
    membership_id: 'membership.alpha',
    vote: 'approve',
    participated_at: '2026-08-20T12:20:00.000Z'
  }).attestation;
  assert.throws(
    () => assessCircleRecordAuthorization({
      ...fixture.input,
      participantAttestations: [otherProposal, fixture.issued[1].attestation]
    }),
    /different decision context/
  );
});

test('decision outcome must equal frozen-charter recomputation and withdrawn remains unsupported', async () => {
  const wrong = await decisionFixture({ votes: { alpha: 'approve', beta: 'reject' }, outcome: 'accepted' });
  assert.throws(
    () => assessCircleRecordAuthorization(wrong.input),
    /outcome does not match frozen-charter quorum and approval recomputation/
  );

  const withdrawn = await decisionFixture({ outcome: 'withdrawn' });
  assert.throws(
    () => assessCircleRecordAuthorization(withdrawn.input),
    /outcome is not supported by record authorization v0/
  );
});

test('decision rejects ambiguous current membership state rather than guessing historical eligibility', async () => {
  const fixture = await decisionFixture({
    betaStatus: 'suspended',
    betaStatusEffectiveAt: '2026-08-20T12:20:30.000Z'
  });
  assert.throws(
    () => assessCircleRecordAuthorization(fixture.input),
    /ambiguous without complete membership lifecycle history/
  );
});

test('participant attestation issuer must be Hypervisor and authority flags remain false', async () => {
  const wrongIdentity = identity('grid');
  const records = baseRecords();
  const { proposalBinding } = ledgerThroughProposal(records);
  assert.throws(() => issueCircleDecisionParticipationAttestation(wrongIdentity, {
    authenticated_principal: 'human.alpha',
    circle_id: 'circle.authz',
    decision_id: 'decision.authz',
    proposal_id: 'proposal.authz',
    proposal_binding_id: proposalBinding.binding_id,
    proposal_record_digest: proposalBinding.record_digest,
    governing_charter_digest: digestObject(charter()),
    membership_id: 'membership.alpha',
    vote: 'approve',
    participated_at: '2026-08-20T12:20:00.000Z'
  }), /Hypervisor identity/);

  const hypervisor = identity();
  const issued = issueVotes(hypervisor, proposalBinding)[0];
  assert.equal(issued.attestation.statement.runtime_authority, false);
  assert.equal(issued.attestation.statement.portable_authority, false);
  assert.equal(issued.attestation.statement.external_effect_authority, false);
});
