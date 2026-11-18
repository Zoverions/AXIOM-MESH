import { digestObject, ValidationError } from './canonical.mjs';
import { validateCircleCorePackage } from './circle-core.mjs';
import { validateFoundersCouncilFoundation } from './founder-genesis-council.mjs';

export const FOUNDERS_COUNCIL_CIRCLE_COMPOSITION_SCHEMA =
  'axiom-founders-council-circle-composition.v0';
export const FOUNDERS_COUNCIL_CIRCLE_ID = 'circle.founders-council';
export const FOUNDERS_COUNCIL_VOTER_ROLE = 'founders-council.voter';
export const FOUNDERS_COUNCIL_DEVELOPING_ROLE = 'founders-council.developing';

export function assessFoundersCouncilCircleComposition(
  foundationDocument,
  circlePackage,
  evidence
) {
  const foundation = validateFoundersCouncilFoundation(foundationDocument);
  const circle = validateCircleCorePackage(circlePackage);
  validateCompositionEvidence(evidence);

  if (
    evidence.foundation_digest !== foundation.package_digest
    || evidence.circle_package_digest !== circle.package_digest
  ) {
    throw new ValidationError('Founders Council Circle composition digest binding is invalid');
  }
  if (
    circlePackage.circle.circle_id !== FOUNDERS_COUNCIL_CIRCLE_ID
    || circlePackage.circle.created_by !== foundation.founder_mind_id
    || circlePackage.circle.participation_model !== 'contractual'
  ) {
    throw new ValidationError('Founders Council Circle descriptor is invalid');
  }

  const roles = new Map(circlePackage.charter.roles.map(role => [role.role_id, role]));
  const voterRole = roles.get(FOUNDERS_COUNCIL_VOTER_ROLE);
  const developingRole = roles.get(FOUNDERS_COUNCIL_DEVELOPING_ROLE);
  if (
    !voterRole
    || !voterRole.declared_modes.includes('vote')
    || !developingRole
    || developingRole.declared_modes.includes('vote')
  ) {
    throw new ValidationError('Founders Council Circle role model is invalid');
  }

  const occupiedSeats = foundationDocument.seats.filter(seat => seat.current_mind_id !== null);
  const occupiedMindIds = new Set(occupiedSeats.map(seat => seat.current_mind_id));
  const memberships = circlePackage.memberships;
  const membershipByMind = new Map();

  for (const membership of memberships) {
    if (membershipByMind.has(membership.principal_id)) {
      throw new ValidationError('Founders Council Circle contains duplicate principal memberships');
    }
    membershipByMind.set(membership.principal_id, membership);

    if (!occupiedMindIds.has(membership.principal_id)) {
      throw new ValidationError('Founders Council Circle membership is not bound to a Council seat');
    }
  }

  if (membershipByMind.size !== occupiedSeats.length) {
    throw new ValidationError('Every occupied Founders Council seat requires exactly one Circle membership');
  }

  let activeVoters = 0;
  let developingMembers = 0;
  let inactiveMembers = 0;

  for (const seat of occupiedSeats) {
    const membership = membershipByMind.get(seat.current_mind_id);
    if (!membership) {
      throw new ValidationError('Occupied Founders Council seat is missing Circle membership');
    }

    if (seat.voting_status === 'active') {
      if (
        membership.status !== 'active'
        || !membership.role_ids.includes(FOUNDERS_COUNCIL_VOTER_ROLE)
        || membership.role_ids.includes(FOUNDERS_COUNCIL_DEVELOPING_ROLE)
      ) {
        throw new ValidationError('Active Founders Council seat lacks exact voter membership');
      }
      activeVoters += 1;
    } else if (seat.voting_status === 'developing') {
      if (
        seat.seat_class !== 'digital'
        || membership.status !== 'active'
        || !membership.role_ids.includes(FOUNDERS_COUNCIL_DEVELOPING_ROLE)
        || membership.role_ids.includes(FOUNDERS_COUNCIL_VOTER_ROLE)
      ) {
        throw new ValidationError('Developing Founding Mind must remain non-voting in the Council Circle');
      }
      developingMembers += 1;
    } else if (seat.voting_status === 'inactive') {
      if (
        membership.status === 'active'
        || membership.role_ids.includes(FOUNDERS_COUNCIL_VOTER_ROLE)
      ) {
        throw new ValidationError('Inactive Founders Council seat cannot retain active voter membership');
      }
      inactiveMembers += 1;
    } else {
      throw new ValidationError('Occupied Founders Council seat cannot remain reserved');
    }
  }

  return Object.freeze({
    valid: true,
    schema: evidence.schema,
    foundation_digest: foundation.package_digest,
    circle_package_digest: circle.package_digest,
    circle_id: FOUNDERS_COUNCIL_CIRCLE_ID,
    occupied_seats: occupiedSeats.length,
    active_voters: activeVoters,
    developing_members: developingMembers,
    inactive_members: inactiveMembers,
    authority_effect: 'none',
    execution_authority: false,
    network_effect: 'none',
    runtime_activation: false
  });
}

function validateCompositionEvidence(evidence) {
  exactObject(evidence, 'Founders Council Circle composition evidence', [
    'schema',
    'foundation_digest',
    'circle_package_digest',
    'circle_id',
    'voter_role_id',
    'developing_role_id',
    'authority_effect',
    'execution_authority',
    'network_effect',
    'runtime_activation'
  ]);

  if (
    evidence.schema !== FOUNDERS_COUNCIL_CIRCLE_COMPOSITION_SCHEMA
    || !/^[a-f0-9]{64}$/.test(evidence.foundation_digest ?? '')
    || !/^[a-f0-9]{64}$/.test(evidence.circle_package_digest ?? '')
    || evidence.circle_id !== FOUNDERS_COUNCIL_CIRCLE_ID
    || evidence.voter_role_id !== FOUNDERS_COUNCIL_VOTER_ROLE
    || evidence.developing_role_id !== FOUNDERS_COUNCIL_DEVELOPING_ROLE
    || evidence.authority_effect !== 'none'
    || evidence.execution_authority !== false
    || evidence.network_effect !== 'none'
    || evidence.runtime_activation !== false
  ) {
    throw new ValidationError('Founders Council Circle composition activation boundary is invalid');
  }
}

function exactObject(value, label, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError(`${label} must be an object`);
  }
  const expected = [...keys].sort();
  const actual = Object.keys(value).sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new ValidationError(`${label} fields are invalid`);
  }
}
