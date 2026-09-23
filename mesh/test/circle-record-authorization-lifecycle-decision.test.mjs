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
  assessCircleRecordAuthorizationWithEligibility
} from '../../packages/axiom-circle-record-authorization-lifecycle/index.mjs';
import {
  issueCircleDecisionParticipationAttestation
} from '../../packages/axiom-circle-record-authorization/index.mjs';

const NOW = new Date('2026-08-20T13:00:00.000Z');
const CIRCLE_ID = 'circle.lifecycle.decision';

const urls = {
  eligibilityPolicy: new URL('../config/circle-member-eligibility-lifecycle.v0.json', import.meta.url),
  charterPolicy: new URL('../config/circle-charter-lifecycle.v0.json', import.meta.url),
  historicalBindingPolicy: new URL('../config/circle-historical-rule-binding.v0.json', import.meta.url),
  credentialPolicy: new URL('../config/circle-membership-credential-lifecycle.v0.json', import.meta.url)
};

async function policies() {
  return Object.fromEntries(await Promise.all(Object.entries(urls).map(async ([key, url]) => [
    key,
    JSON.parse(await readFile(url, 'utf8'))
  ])));
}

function hypervisorIdentity() {
  const pair = generateKeyPairSync('ed25519');
  return new MeshIdentity(
    'hypervisor',
    pair.privateKey.export({ type: 'pkcs8', format: 'pem' }),
    pair.publicKey.export({ type: 'spki', format: 'pem' })
  );
}

function charter() {
  return {
    schema: CIRCLE_CHARTER_SCHEMA,
    circle_id: CIRCLE_ID,
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

const PEOPLE = Object.freeze({
  alpha: Object.freeze({ principal: 'human.alpha', role: 'governor', invite: 'invite.alpha.lifecycle', membership: 'membership.alpha.lifecycle', acceptedAt: '2026-08-20T12:03:00.000Z', binding: 'binding.membership.alpha.lifecycle', device: 'device.alpha.lifecycle', credential: 'credential.alpha.lifecycle.1', fingerprint: 'a'.repeat(64) }),
  beta: Object.freeze({ principal: 'human.beta', role: 'voter', invite: 'invite.beta.lifecycle', membership: 'membership.beta.lifecycle', acceptedAt: '2026-08-20T12:05:00.000Z', binding: 'binding.membership.beta.lifecycle', device: 'device.beta.lifecycle', credential: 'credential.beta.lifecycle.1', fingerprint: 'b'.repeat(64) }),
  gamma: Object.freeze({ principal: 'human.gamma', role: 'reviewer', invite: 'invite.gamma.lifecycle', membership: 'membership.gamma.lifecycle', acceptedAt: '2026-08-20T12:07:00.000Z', binding: 'binding.membership.gamma.lifecycle', device: 'device.gamma.lifecycle', credential: 'credential.gamma.lifecycle.1', fingerprint: 'c'.repeat(64) })
});

function invitation(person, issuedAt) {
  return {
    schema: CIRCLE_INVITATION_SCHEMA,
    invitation_id: person.invite,
    circle_id: CIRCLE_ID,
    invited_principal: person.principal,
    membership_class: 'member',
    role_ids: [person.role],
    issued_by: 'human.alpha',
    issued_at: issuedAt,
    expires_at: '2026-08-20T12:45:00.000Z',
    charter_digest: digestObject(charter()),
    one_use: true,
    authority_effect: 'none'
  };
}

function membership(person, { status = 'active', statusEffectiveAt = person.acceptedAt, roles = [person.role] } = {}) {
  return {
    schema: CIRCLE_MEMBERSHIP_SCHEMA,
    membership_id: person.membership,
    circle_id: CIRCLE_ID,
    invitation_id: person.invite,
    principal_id: person.principal,
    role_ids: [...roles],
    accepted_at: person.acceptedAt,
    status,
    status_effective_at: statusEffectiveAt,
    member_state_ownership: 'independent-node',
    disclosure_profile: 'selective',
    authority_effect: 'none',
    network_effect: 'none'
  };
}

function proposal() {
  return {
    schema: CIRCLE_PROPOSAL_SCHEMA,
    proposal_id: 'proposal.lifecycle',
    circle_id: CIRCLE_ID,
    charter_digest: digestObject(charter()),
    proposer: 'human.alpha',
    title: 'Lifecycle-aware collective decision',
    summary: 'Exercise frozen electorate and participant currentness.',
    created_at: '2026-08-20T12:10:00.000Z',
    closes_at: '2026-08-20T12:30:00.000Z',
    status: 'open',
    evidence_refs: ['evidence:lifecycle:decision'],
    execution_effect: 'none',
    authority_effect: 'none'
  };
}

function circlePackage(overrides = {}) {
  const alpha = membership(PEOPLE.alpha, overrides.alpha ?? {});
  const beta = membership(PEOPLE.beta, overrides.beta ?? {});
  const gamma = membership(PEOPLE.gamma, overrides.gamma ?? {});
  return {
    schema: CIRCLE_CORE_PACKAGE_SCHEMA,
    version: 0,
    status: 'inert-contract-laboratory',
    circle: {
      schema: CIRCLE_SCHEMA,
      circle_id: CIRCLE_ID,
      name: 'Lifecycle Decision Circle',
      purpose: 'Exercise lifecycle-aware collective authorization.',
      created_by: 'human.alpha',
      created_at: '2026-08-20T12:00:00.000Z',
      trust_anchor_id: 'anchor.lifecycle.decision',
      participation_model: 'voluntary',
      member_state_ownership: 'independent-node',
      policy_floor: 'raise-only',
      authority_effect: 'none',
      network_effect: 'none',
      runtime_activation: false
    },
    charter: charter(),
    invitations: [
      invitation(PEOPLE.alpha, '2026-08-20T12:02:00.000Z'),
      invitation(PEOPLE.beta, '2026-08-20T12:04:00.000Z'),
      invitation(PEOPLE.gamma, '2026-08-20T12:06:00.000Z')
    ],
    memberships: [alpha, beta, gamma],
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
  const value = charter();
  const charterDigest = digestObject(value);
  return {
    schema: 'axiom-circle-charter-lifecycle.v0',
    circle_id: CIRCLE_ID,
    entries: [{
      schema: 'axiom-circle-charter-history-entry.v0',
      circle_id: CIRCLE_ID,
      charter: value,
      charter_digest: charterDigest,
      recorded_at: '2026-08-20T12:00:30.000Z',
      activation: {
        schema: 'axiom-circle-charter-activation.v0',
        circle_id: CIRCLE_ID,
        charter_digest: charterDigest,
        basis_charter_digest: null,
        activated_at: value.effective_from,
        evidence_refs: ['evidence:lifecycle:charter'],
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

function historicalBinding({ id, type, record, previous = null, basis = null, boundAt }) {
  const idField = { invitation: 'invitation_id', membership: 'membership_id', proposal: 'proposal_id', decision: 'decision_id' }[type];
  const eventTime = { invitation: record.issued_at, membership: record.accepted_at, proposal: record.created_at, decision: record.decided_at }[type];
  const mode = { invitation: 'resolve-at-event', membership: 'invitation-current-at-acceptance', proposal: 'resolve-at-event-and-freeze', decision: 'inherit-proposal-frozen-charter' }[type];
  return {
    schema: 'axiom-circle-historical-rule-binding.v0',
    binding_id: id,
    circle_id: CIRCLE_ID,
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

function historyThroughProposal() {
  const bindings = [];
  const add = (id, type, record, boundAt, basis = null) => {
    const item = historicalBinding({ id, type, record, previous: bindings.at(-1) ?? null, basis, boundAt });
    bindings.push(item);
    return item;
  };
  const inviteAlpha = add('binding.invite.alpha.lifecycle', 'invitation', invitation(PEOPLE.alpha, '2026-08-20T12:02:00.000Z'), '2026-08-20T12:02:10.000Z');
  add(PEOPLE.alpha.binding, 'membership', membership(PEOPLE.alpha), '2026-08-20T12:03:10.000Z', inviteAlpha.binding_id);
  const inviteBeta = add('binding.invite.beta.lifecycle', 'invitation', invitation(PEOPLE.beta, '2026-08-20T12:04:00.000Z'), '2026-08-20T12:04:10.000Z');
  add(PEOPLE.beta.binding, 'membership', membership(PEOPLE.beta), '2026-08-20T12:05:10.000Z', inviteBeta.binding_id);
  const inviteGamma = add('binding.invite.gamma.lifecycle', 'invitation', invitation(PEOPLE.gamma, '2026-08-20T12:06:00.000Z'), '2026-08-20T12:06:10.000Z');
  add(PEOPLE.gamma.binding, 'membership', membership(PEOPLE.gamma), '2026-08-20T12:07:10.000Z', inviteGamma.binding_id);
  const proposalBinding = add('binding.proposal.lifecycle', 'proposal', proposal(), '2026-08-20T12:10:10.000Z');
  return { bindings, proposalBinding };
}

function decision(receipts) {
  return {
    schema: CIRCLE_DECISION_SCHEMA,
    decision_id: 'decision.lifecycle',
    circle_id: CIRCLE_ID,
    proposal_id: 'proposal.lifecycle',
    charter_digest: digestObject(charter()),
    outcome: 'accepted',
    decided_at: '2026-08-20T12:31:00.000Z',
    participant_receipts: receipts,
    finality: 'circle-local-accepted',
    runtime_authority: false,
    authority_effect: 'none'
  };
}

function eligibilityLifecycle(person, events = []) {
  return {
    schema: 'axiom-circle-member-eligibility-lifecycle.v0',
    circle_id: CIRCLE_ID,
    membership_id: person.membership,
    principal_id: person.principal,
    acceptance_binding_id: person.binding,
    events,
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  };
}

function eligibilityEvent(person, { kind, at, roleIds = null }) {
  return {
    schema: 'axiom-circle-member-eligibility-event.v0',
    event_id: `event.${person.membership}.${kind}`,
    circle_id: CIRCLE_ID,
    membership_id: person.membership,
    principal_id: person.principal,
    kind,
    at,
    previous_event_digest: null,
    role_ids: roleIds,
    core_exit_id: null,
    authority_effect: 'none',
    network_effect: 'none'
  };
}

function credentialLifecycle(person, events = []) {
  const issuedAt = new Date(Date.parse(person.acceptedAt) + 20_000).toISOString();
  return {
    schema: 'axiom-circle-membership-credential-lifecycle.v0',
    circle_id: CIRCLE_ID,
    membership_id: person.membership,
    principal_id: person.principal,
    term: {
      schema: 'axiom-circle-membership-term.v0',
      term_id: `term.${person.membership}`,
      circle_id: CIRCLE_ID,
      membership_id: person.membership,
      principal_id: person.principal,
      begins_at: person.acceptedAt,
      ends_at: '2027-08-20T12:00:00.000Z',
      changes_core_membership: false,
      authority_effect: 'none'
    },
    devices: [{
      schema: 'axiom-circle-member-device.v0',
      device_id: person.device,
      circle_id: CIRCLE_ID,
      membership_id: person.membership,
      principal_id: person.principal,
      registered_at: new Date(Date.parse(person.acceptedAt) + 10_000).toISOString(),
      state_owner: 'independent-node',
      secret_material_included: false,
      execution_authority: false,
      authority_effect: 'none',
      network_effect: 'none'
    }],
    credentials: [{
      schema: 'axiom-circle-member-device-credential.v0',
      credential_id: person.credential,
      device_id: person.device,
      circle_id: CIRCLE_ID,
      membership_id: person.membership,
      principal_id: person.principal,
      algorithm: 'Ed25519',
      public_key_fingerprint: person.fingerprint,
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

function credentialCompromise(person, at) {
  return {
    schema: 'axiom-circle-member-credential-event.v0',
    event_id: `event.${person.membership}.compromise`,
    circle_id: CIRCLE_ID,
    membership_id: person.membership,
    principal_id: person.principal,
    target_type: 'device',
    target_id: person.device,
    kind: 'device-compromise',
    at,
    reason_code: 'security-event',
    authority_effect: 'none',
    network_effect: 'none'
  };
}

function memberContext(person, { membershipEvents = [], credentialEvents = [] } = {}) {
  return {
    schema: 'axiom-circle-record-member-context.v0',
    circle_id: CIRCLE_ID,
    membership_id: person.membership,
    principal_id: person.principal,
    membership_lifecycle: eligibilityLifecycle(person, membershipEvents),
    credential_lifecycle: credentialLifecycle(person, credentialEvents),
    credential_id: person.credential
  };
}

function issueVotes(hypervisor, proposalBinding) {
  const issue = (person, participatedAt) => issueCircleDecisionParticipationAttestation(hypervisor, {
    authenticated_principal: person.principal,
    circle_id: CIRCLE_ID,
    decision_id: 'decision.lifecycle',
    proposal_id: 'proposal.lifecycle',
    proposal_binding_id: proposalBinding.binding_id,
    proposal_record_digest: proposalBinding.record_digest,
    governing_charter_digest: digestObject(charter()),
    membership_id: person.membership,
    vote: 'approve',
    participated_at: participatedAt
  });
  return [
    issue(PEOPLE.alpha, '2026-08-20T12:20:00.000Z'),
    issue(PEOPLE.beta, '2026-08-20T12:21:00.000Z')
  ];
}

async function fixture({ requester = 'human.alpha', betaMembershipEvents = [], betaCredentialEvents = [], packageOverrides = {} } = {}) {
  const loaded = await policies();
  const hypervisor = hypervisorIdentity();
  const { bindings, proposalBinding } = historyThroughProposal();
  const votes = issueVotes(hypervisor, proposalBinding);
  const decisionRecord = decision(votes.map(item => item.attestation_digest));
  const decisionBinding = historicalBinding({
    id: 'binding.decision.lifecycle',
    type: 'decision',
    record: decisionRecord,
    previous: bindings.at(-1),
    basis: proposalBinding.binding_id,
    boundAt: '2026-08-20T12:31:10.000Z'
  });
  bindings.push(decisionBinding);
  const historicalLedger = {
    schema: 'axiom-circle-historical-rule-binding-ledger.v0',
    circle_id: CIRCLE_ID,
    bindings,
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  };
  return {
    hypervisor,
    input: {
      ...loaded,
      circlePackage: circlePackage(packageOverrides),
      charterLifecycle: charterLifecycle(),
      historicalLedger,
      bindingId: decisionBinding.binding_id,
      authenticatedPrincipal: requester,
      memberContexts: [
        memberContext(PEOPLE.alpha),
        memberContext(PEOPLE.beta, { membershipEvents: betaMembershipEvents, credentialEvents: betaCredentialEvents }),
        memberContext(PEOPLE.gamma)
      ],
      participantAttestations: votes.map(item => item.attestation),
      hypervisorPublicKey: hypervisor.publicKey,
      now: NOW
    }
  };
}

test('collective decision checks each voter credential at participation time and requester transport at decision time', async () => {
  const value = await fixture();
  const result = assessCircleRecordAuthorizationWithEligibility(value.input);
  assert.equal(result.assessment.authorization_mode, 'participant-aggregator');
  assert.equal(result.assessment.decision_tally.electorate_size, 2);
  assert.equal(result.assessment.decision_tally.approve, 2);
  assert.equal(result.assessment.decision_tally.computed_outcome, 'accepted');
  assert.equal(result.assessment.participant_attestation_digests.length, 2);
  assert.equal(result.eligibility_evidence.items.filter(item => item.purpose === 'decision-participant-vote').length, 2);
  assert.equal(result.eligibility_evidence.items.filter(item => item.purpose === 'decision-transport').length, 1);
  assert.equal(result.assessment.submitter_collective_authority, false);
});

test('review member may transport but does not become a voter or collective decider', async () => {
  const value = await fixture({ requester: 'human.gamma' });
  const result = assessCircleRecordAuthorizationWithEligibility(value.input);
  assert.equal(result.assessment.authorization_mode, 'review-member-aggregator');
  assert.equal(result.assessment.authorizing_membership_id, PEOPLE.gamma.membership);
  const transport = result.eligibility_evidence.items.find(item => item.purpose === 'decision-transport');
  assert.equal(transport.principal_id, PEOPLE.gamma.principal);
  assert.equal(transport.required_mode, 'review');
  assert.equal(result.assessment.submitter_collective_authority, false);
});

test('membership or role change during an open proposal fails closed pending explicit electorate-change semantics', async () => {
  const suspend = eligibilityEvent(PEOPLE.beta, {
    kind: 'membership-suspend',
    at: '2026-08-20T12:25:00.000Z'
  });
  const value = await fixture({
    betaMembershipEvents: [suspend],
    packageOverrides: {
      beta: { status: 'suspended', statusEffectiveAt: suspend.at }
    }
  });
  assert.throws(
    () => assessCircleRecordAuthorizationWithEligibility(value.input),
    /electorate membership or roles change during an open proposal/
  );
});

test('credential compromise before participation blocks the vote without fabricating membership revocation', async () => {
  const compromise = credentialCompromise(PEOPLE.beta, '2026-08-20T12:19:00.000Z');
  const value = await fixture({ betaCredentialEvents: [compromise] });
  assert.throws(
    () => assessCircleRecordAuthorizationWithEligibility(value.input),
    /credential is not authentication-eligible/
  );
  const beta = value.input.circlePackage.memberships.find(item => item.membership_id === PEOPLE.beta.membership);
  assert.equal(beta.status, 'active');
});

test('missing lifecycle context for a frozen-electorate member fails closed', async () => {
  const value = await fixture();
  value.input.memberContexts = value.input.memberContexts.filter(item => item.membership_id !== PEOPLE.beta.membership);
  assert.throws(
    () => assessCircleRecordAuthorizationWithEligibility(value.input),
    /complete member lifecycle context/
  );
});
