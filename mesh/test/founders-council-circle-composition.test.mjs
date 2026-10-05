import assert from 'node:assert/strict';
import test from 'node:test';

import { digestObject } from '../src/lib/canonical.mjs';
import {
  CIRCLE_CHARTER_SCHEMA,
  CIRCLE_CORE_PACKAGE_SCHEMA,
  CIRCLE_INVITATION_SCHEMA,
  CIRCLE_MEMBERSHIP_SCHEMA,
  CIRCLE_SCHEMA
} from '../src/lib/circle-core.mjs';
import {
  FOUNDER_GENESIS_AUTHORIZATION_SCHEMA,
  FOUNDERS_COUNCIL_FOUNDATION_SCHEMA,
  FOUNDERS_COUNCIL_SEAT_SCHEMA
} from '../src/lib/founder-genesis-council.mjs';
import {
  FOUNDERS_COUNCIL_CIRCLE_COMPOSITION_SCHEMA,
  FOUNDERS_COUNCIL_CIRCLE_ID,
  FOUNDERS_COUNCIL_DEVELOPING_ROLE,
  FOUNDERS_COUNCIL_VOTER_ROLE,
  assessFoundersCouncilCircleComposition
} from '../src/lib/founders-council-circle-composition.mjs';

function foundation() {
  const founderMindId = 'human.founder';
  const biological = [
    {
      schema: FOUNDERS_COUNCIL_SEAT_SCHEMA,
      seat_id: 'founders.bio.1',
      seat_class: 'biological',
      seat_number: 1,
      designation: 'founder',
      original_mind_id: founderMindId,
      current_mind_id: founderMindId,
      voting_status: 'active',
      genesis_slot: null,
      authority_effect: 'none',
      runtime_activation: false
    },
    {
      schema: FOUNDERS_COUNCIL_SEAT_SCHEMA,
      seat_id: 'founders.bio.2',
      seat_class: 'biological',
      seat_number: 2,
      designation: 'founder-mother',
      original_mind_id: 'human.founder-mother',
      current_mind_id: 'human.founder-mother',
      voting_status: 'active',
      genesis_slot: null,
      authority_effect: 'none',
      runtime_activation: false
    },
    ...Array.from({ length: 8 }, (_, index) => ({
      schema: FOUNDERS_COUNCIL_SEAT_SCHEMA,
      seat_id: `founders.bio.${index + 3}`,
      seat_class: 'biological',
      seat_number: index + 3,
      designation: 'founder-appointed',
      original_mind_id: null,
      current_mind_id: null,
      voting_status: 'reserved',
      genesis_slot: null,
      authority_effect: 'none',
      runtime_activation: false
    }))
  ];

  const digital = Array.from({ length: 10 }, (_, index) => {
    const slot = index + 1;
    const occupied = slot === 1;
    return {
      schema: FOUNDERS_COUNCIL_SEAT_SCHEMA,
      seat_id: `founders.digital.${slot}`,
      seat_class: 'digital',
      seat_number: slot,
      designation: 'founder-genesis',
      original_mind_id: occupied ? 'digital.founder.1' : null,
      current_mind_id: occupied ? 'digital.founder.1' : null,
      voting_status: occupied ? 'developing' : 'reserved',
      genesis_slot: slot,
      authority_effect: 'none',
      runtime_activation: false
    };
  });

  const authorizations = Array.from({ length: 10 }, (_, index) => {
    const slot = index + 1;
    const occupied = slot === 1;
    return {
      schema: FOUNDER_GENESIS_AUTHORIZATION_SCHEMA,
      slot_number: slot,
      holder_mind_id: founderMindId,
      state: occupied ? 'consumed' : 'unused',
      manual_founder_confirmation_required: true,
      delegable: false,
      transferable: false,
      renewable: false,
      max_uses: 1,
      recognized_mind_id: occupied ? 'digital.founder.1' : null,
      genesis_receipt_digest: occupied ? 'a'.repeat(64) : null,
      authority_effect: 'none',
      runtime_activation: false
    };
  });

  return {
    schema: FOUNDERS_COUNCIL_FOUNDATION_SCHEMA,
    version: 0,
    status: 'inert-contract-laboratory',
    founder_mind_id: founderMindId,
    seats: [...biological, ...digital],
    genesis_authorizations: authorizations,
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  };
}

function circlePackage(document) {
  const circle = {
    schema: CIRCLE_SCHEMA,
    circle_id: FOUNDERS_COUNCIL_CIRCLE_ID,
    name: 'Founders Council',
    purpose: 'Founding stewardship and constitutional development without direct execution authority.',
    created_by: document.founder_mind_id,
    created_at: '2026-09-25T12:00:00.000Z',
    trust_anchor_id: 'anchor.founders-council',
    participation_model: 'contractual',
    member_state_ownership: 'independent-node',
    policy_floor: 'raise-only',
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  };

  const charter = {
    schema: CIRCLE_CHARTER_SCHEMA,
    circle_id: circle.circle_id,
    version: 1,
    effective_from: '2026-09-25T12:00:00.000Z',
    supersedes_digest: null,
    roles: [
      {
        role_id: FOUNDERS_COUNCIL_VOTER_ROLE,
        label: 'Founders Council voter',
        declared_modes: ['propose', 'deliberate', 'evidence', 'vote', 'review', 'appeal', 'observe'],
        execution_authority: false
      },
      {
        role_id: FOUNDERS_COUNCIL_DEVELOPING_ROLE,
        label: 'Developing Founding Mind',
        declared_modes: ['evidence', 'observe'],
        execution_authority: false
      }
    ],
    decision_rule: {
      quorum_basis_points: 5000,
      approval_basis_points: 5001,
      abstention_counts_toward_quorum: true
    },
    appeal_enabled: true,
    member_exit_enabled: true,
    execution_authority: false,
    authority_effect: 'none'
  };

  const charterDigest = digestObject(charter);
  const occupiedSeats = document.seats.filter(seat => seat.current_mind_id !== null);
  const invitations = occupiedSeats.map((seat, index) => {
    const roleId = seat.voting_status === 'active'
      ? FOUNDERS_COUNCIL_VOTER_ROLE
      : FOUNDERS_COUNCIL_DEVELOPING_ROLE;
    return {
      schema: CIRCLE_INVITATION_SCHEMA,
      invitation_id: `founders.invite.${index + 1}`,
      circle_id: circle.circle_id,
      invited_principal: seat.current_mind_id,
      membership_class: 'member',
      role_ids: [roleId],
      issued_by: document.founder_mind_id,
      issued_at: '2026-09-25T12:01:00.000Z',
      expires_at: '2026-10-25T12:01:00.000Z',
      charter_digest: charterDigest,
      one_use: true,
      authority_effect: 'none'
    };
  });

  const memberships = invitations.map((invitation, index) => ({
    schema: CIRCLE_MEMBERSHIP_SCHEMA,
    membership_id: `founders.membership.${index + 1}`,
    circle_id: circle.circle_id,
    invitation_id: invitation.invitation_id,
    principal_id: invitation.invited_principal,
    role_ids: [...invitation.role_ids],
    accepted_at: '2026-09-25T12:02:00.000Z',
    status: 'active',
    status_effective_at: '2026-09-25T12:02:00.000Z',
    member_state_ownership: 'independent-node',
    disclosure_profile: 'selective',
    authority_effect: 'none',
    network_effect: 'none'
  }));

  return {
    schema: CIRCLE_CORE_PACKAGE_SCHEMA,
    version: 0,
    status: 'inert-contract-laboratory',
    circle,
    charter,
    invitations,
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

function evidence(foundationDocument, packageDocument) {
  return {
    schema: FOUNDERS_COUNCIL_CIRCLE_COMPOSITION_SCHEMA,
    foundation_digest: digestObject(foundationDocument),
    circle_package_digest: digestObject(packageDocument),
    circle_id: FOUNDERS_COUNCIL_CIRCLE_ID,
    voter_role_id: FOUNDERS_COUNCIL_VOTER_ROLE,
    developing_role_id: FOUNDERS_COUNCIL_DEVELOPING_ROLE,
    authority_effect: 'none',
    execution_authority: false,
    network_effect: 'none',
    runtime_activation: false
  };
}

test('Founders Council composes over Circle Core without creating parallel execution authority', () => {
  const foundationDocument = foundation();
  const packageDocument = circlePackage(foundationDocument);
  const result = assessFoundersCouncilCircleComposition(
    foundationDocument,
    packageDocument,
    evidence(foundationDocument, packageDocument)
  );

  assert.equal(result.valid, true);
  assert.equal(result.circle_id, FOUNDERS_COUNCIL_CIRCLE_ID);
  assert.equal(result.occupied_seats, 3);
  assert.equal(result.active_voters, 2);
  assert.equal(result.developing_members, 1);
  assert.equal(result.authority_effect, 'none');
  assert.equal(result.execution_authority, false);
  assert.equal(result.network_effect, 'none');
  assert.equal(result.runtime_activation, false);
});

test('developing Founding Mind cannot receive a Council voter role', () => {
  const foundationDocument = foundation();
  const packageDocument = circlePackage(foundationDocument);
  const membership = packageDocument.memberships.find(
    item => item.principal_id === 'digital.founder.1'
  );
  const invitation = packageDocument.invitations.find(
    item => item.invitation_id === membership.invitation_id
  );
  invitation.role_ids = [FOUNDERS_COUNCIL_VOTER_ROLE];
  membership.role_ids = [FOUNDERS_COUNCIL_VOTER_ROLE];

  assert.throws(
    () => assessFoundersCouncilCircleComposition(
      foundationDocument,
      packageDocument,
      evidence(foundationDocument, packageDocument)
    ),
    /Developing Founding Mind must remain non-voting/
  );
});

test('non-founder principal cannot be inserted as Founders Council membership', () => {
  const foundationDocument = foundation();
  const packageDocument = circlePackage(foundationDocument);
  packageDocument.invitations.push({
    ...structuredClone(packageDocument.invitations[0]),
    invitation_id: 'founders.invite.outsider',
    invited_principal: 'human.outsider'
  });
  packageDocument.memberships.push({
    ...structuredClone(packageDocument.memberships[0]),
    membership_id: 'founders.membership.outsider',
    invitation_id: 'founders.invite.outsider',
    principal_id: 'human.outsider'
  });

  assert.throws(
    () => assessFoundersCouncilCircleComposition(
      foundationDocument,
      packageDocument,
      evidence(foundationDocument, packageDocument)
    ),
    /membership is not bound to a Council seat/
  );
});

test('active founding seat must carry the exact voter role', () => {
  const foundationDocument = foundation();
  const packageDocument = circlePackage(foundationDocument);
  const founderMembership = packageDocument.memberships.find(
    item => item.principal_id === foundationDocument.founder_mind_id
  );
  const founderInvitation = packageDocument.invitations.find(
    item => item.invitation_id === founderMembership.invitation_id
  );
  founderInvitation.role_ids = [FOUNDERS_COUNCIL_DEVELOPING_ROLE];
  founderMembership.role_ids = [FOUNDERS_COUNCIL_DEVELOPING_ROLE];

  assert.throws(
    () => assessFoundersCouncilCircleComposition(
      foundationDocument,
      packageDocument,
      evidence(foundationDocument, packageDocument)
    ),
    /Active Founders Council seat lacks exact voter membership/
  );
});

test('composition rejects digest substitution and any execution activation', () => {
  const foundationDocument = foundation();
  const packageDocument = circlePackage(foundationDocument);

  const substituted = evidence(foundationDocument, packageDocument);
  substituted.circle_package_digest = 'f'.repeat(64);
  assert.throws(
    () => assessFoundersCouncilCircleComposition(
      foundationDocument,
      packageDocument,
      substituted
    ),
    /digest binding is invalid/
  );

  const activated = evidence(foundationDocument, packageDocument);
  activated.execution_authority = true;
  assert.throws(
    () => assessFoundersCouncilCircleComposition(
      foundationDocument,
      packageDocument,
      activated
    ),
    /activation boundary/
  );
});
