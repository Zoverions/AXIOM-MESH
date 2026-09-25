import { digestObject, ValidationError } from './canonical.mjs';
import {
  validateFoundersCouncilFoundation
} from './founder-genesis-council.mjs';
import {
  assessFounderCastingVote
} from './founder-casting-vote.mjs';
import {
  validateGovernanceEraAuthorityPackage
} from './governance-era-authority.mjs';

export const FOUNDERS_CONSOLE_PROJECTION_SCHEMA =
  'axiom-founders-console-projection.v0';

export function buildFoundersConsoleProjection({
  foundationDocument,
  castingAssessment = null,
  eraAuthorityPackage = null
}) {
  const foundation = validateFoundersCouncilFoundation(foundationDocument);

  const seats = foundationDocument.seats.map(seat => Object.freeze({
    seat_id: seat.seat_id,
    seat_class: seat.seat_class,
    seat_number: seat.seat_number,
    designation: seat.designation,
    occupied: seat.current_mind_id !== null,
    mind_id: seat.current_mind_id,
    voting_status: seat.voting_status
  }));

  const genesis = foundationDocument.genesis_authorizations.map(record => Object.freeze({
    slot_number: record.slot_number,
    state: record.state,
    occupied: record.recognized_mind_id !== null,
    mind_id: record.recognized_mind_id,
    receipt_bound: record.genesis_receipt_digest !== null
  }));

  const consumed = genesis.filter(record => record.state === 'consumed').length;
  const activeBiological = seats.filter(
    seat => seat.seat_class === 'biological' && seat.voting_status === 'active'
  ).length;
  const activeDigital = seats.filter(
    seat => seat.seat_class === 'digital' && seat.voting_status === 'active'
  ).length;

  const casting = castingAssessment === null
    ? Object.freeze({
        assessed: false,
        eligible: false,
        reason: 'not-assessed',
        pre_cast_outcome: null
      })
    : castingProjection(assessFounderCastingVote(foundationDocument, castingAssessment));

  const era = eraAuthorityPackage === null
    ? Object.freeze({
        assessed: false,
        current_era: null,
        candidate_era: null,
        transition_eligible: false,
        transition_reason: 'not-assessed',
        authority_windows: Object.freeze([])
      })
    : eraProjection(validateGovernanceEraAuthorityPackage(eraAuthorityPackage));

  const projection = {
    schema: FOUNDERS_CONSOLE_PROJECTION_SCHEMA,
    version: 0,
    status: 'read-only-inert-projection',
    founder_mind_id: foundation.founder_mind_id,
    foundation_digest: foundation.package_digest,
    council: {
      total_original_seats: 20,
      biological_seats: 10,
      digital_seats: 10,
      active_biological_voters: activeBiological,
      active_digital_voters: activeDigital,
      active_voters: activeBiological + activeDigital,
      full_original_council_active:
        activeBiological === 10 && activeDigital === 10,
      seats
    },
    founder_genesis: {
      total_slots: 10,
      consumed_slots: consumed,
      remaining_slots: 10 - consumed,
      slots: genesis
    },
    casting_vote: casting,
    governance_era: era,
    action_surface: 'none',
    credential_material: 'none',
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  };

  projection.projection_digest = digestObject(projectionDigestPayload(projection));
  return Object.freeze(projection);
}

export function validateFoundersConsoleProjection(projection) {
  exactObject(projection, 'Founders Console projection', [
    'schema',
    'version',
    'status',
    'founder_mind_id',
    'foundation_digest',
    'council',
    'founder_genesis',
    'casting_vote',
    'governance_era',
    'action_surface',
    'credential_material',
    'authority_effect',
    'network_effect',
    'runtime_activation',
    'projection_digest'
  ]);

  if (
    projection.schema !== FOUNDERS_CONSOLE_PROJECTION_SCHEMA
    || projection.version !== 0
    || projection.status !== 'read-only-inert-projection'
    || projection.action_surface !== 'none'
    || projection.credential_material !== 'none'
    || projection.authority_effect !== 'none'
    || projection.network_effect !== 'none'
    || projection.runtime_activation !== false
    || !/^[a-f0-9]{64}$/.test(projection.foundation_digest ?? '')
    || !/^[a-f0-9]{64}$/.test(projection.projection_digest ?? '')
  ) {
    throw new ValidationError('Founders Console projection activation boundary is invalid');
  }

  validateCouncilProjection(projection.council);
  validateGenesisProjection(projection.founder_genesis);
  validateCastingProjection(projection.casting_vote);
  validateEraProjection(projection.governance_era);

  if (projection.projection_digest !== digestObject(projectionDigestPayload(projection))) {
    throw new ValidationError('Founders Console projection digest is invalid');
  }

  return projection;
}

function validateCouncilProjection(council) {
  exactObject(council, 'Founders Console council projection', [
    'total_original_seats',
    'biological_seats',
    'digital_seats',
    'active_biological_voters',
    'active_digital_voters',
    'active_voters',
    'full_original_council_active',
    'seats'
  ]);
  if (
    council.total_original_seats !== 20
    || council.biological_seats !== 10
    || council.digital_seats !== 10
    || !integerBetween(council.active_biological_voters, 0, 10)
    || !integerBetween(council.active_digital_voters, 0, 10)
    || council.active_voters
      !== council.active_biological_voters + council.active_digital_voters
    || council.full_original_council_active
      !== (council.active_biological_voters === 10 && council.active_digital_voters === 10)
    || !Array.isArray(council.seats)
    || council.seats.length !== 20
  ) {
    throw new ValidationError('Founders Console council projection is invalid');
  }

  for (const seat of council.seats) {
    exactObject(seat, 'Founders Console seat projection', [
      'seat_id',
      'seat_class',
      'seat_number',
      'designation',
      'occupied',
      'mind_id',
      'voting_status'
    ]);
    if (
      !identifier(seat.seat_id)
      || !['biological', 'digital'].includes(seat.seat_class)
      || !integerBetween(seat.seat_number, 1, 10)
      || !['founder', 'founder-mother', 'founder-appointed', 'founder-genesis']
        .includes(seat.designation)
      || typeof seat.occupied !== 'boolean'
      || !(seat.mind_id === null || identifier(seat.mind_id))
      || seat.occupied !== (seat.mind_id !== null)
      || !['reserved', 'developing', 'active', 'inactive'].includes(seat.voting_status)
    ) {
      throw new ValidationError('Founders Console seat projection is invalid');
    }
  }
}

function validateGenesisProjection(genesis) {
  exactObject(genesis, 'Founders Console Genesis projection', [
    'total_slots',
    'consumed_slots',
    'remaining_slots',
    'slots'
  ]);
  if (
    genesis.total_slots !== 10
    || !integerBetween(genesis.consumed_slots, 0, 10)
    || genesis.remaining_slots !== 10 - genesis.consumed_slots
    || !Array.isArray(genesis.slots)
    || genesis.slots.length !== 10
  ) {
    throw new ValidationError('Founders Console Genesis projection is invalid');
  }

  const slotNumbers = new Set();
  let consumed = 0;
  for (const slot of genesis.slots) {
    exactObject(slot, 'Founders Console Genesis slot projection', [
      'slot_number',
      'state',
      'occupied',
      'mind_id',
      'receipt_bound'
    ]);
    if (
      !integerBetween(slot.slot_number, 1, 10)
      || slotNumbers.has(slot.slot_number)
      || !['unused', 'pending', 'consumed', 'frozen'].includes(slot.state)
      || typeof slot.occupied !== 'boolean'
      || !(slot.mind_id === null || identifier(slot.mind_id))
      || slot.occupied !== (slot.mind_id !== null)
      || typeof slot.receipt_bound !== 'boolean'
    ) {
      throw new ValidationError('Founders Console Genesis slot projection is invalid');
    }
    if (slot.state === 'consumed') {
      consumed += 1;
      if (!slot.occupied || !slot.receipt_bound) {
        throw new ValidationError('Consumed Founder Genesis projection must be identity/receipt bound');
      }
    } else if (slot.occupied || slot.receipt_bound) {
      throw new ValidationError('Unconsumed Founder Genesis projection cannot expose a Genesis result');
    }
    slotNumbers.add(slot.slot_number);
  }
  if (consumed !== genesis.consumed_slots) {
    throw new ValidationError('Founders Console Genesis consumed count is invalid');
  }
}

function validateCastingProjection(casting) {
  exactObject(casting, 'Founders Console casting-vote projection', [
    'assessed',
    'eligible',
    'reason',
    'pre_cast_outcome'
  ]);
  if (
    typeof casting.assessed !== 'boolean'
    || typeof casting.eligible !== 'boolean'
    || typeof casting.reason !== 'string'
    || !(casting.pre_cast_outcome === null || typeof casting.pre_cast_outcome === 'string')
  ) {
    throw new ValidationError('Founders Console casting-vote projection is invalid');
  }
  if (!casting.assessed && (casting.eligible || casting.reason !== 'not-assessed')) {
    throw new ValidationError('Unassessed Founder casting vote cannot appear eligible');
  }
}

function validateEraProjection(era) {
  exactObject(era, 'Founders Console governance-era projection', [
    'assessed',
    'current_era',
    'candidate_era',
    'transition_eligible',
    'transition_reason',
    'authority_windows'
  ]);
  if (
    typeof era.assessed !== 'boolean'
    || !(era.current_era === null || typeof era.current_era === 'string')
    || !(era.candidate_era === null || typeof era.candidate_era === 'string')
    || typeof era.transition_eligible !== 'boolean'
    || typeof era.transition_reason !== 'string'
    || !Array.isArray(era.authority_windows)
    || era.authority_windows.length > 256
  ) {
    throw new ValidationError('Founders Console governance-era projection is invalid');
  }
  if (!era.assessed && (
    era.current_era !== null
    || era.candidate_era !== null
    || era.transition_eligible
    || era.transition_reason !== 'not-assessed'
    || era.authority_windows.length !== 0
  )) {
    throw new ValidationError('Unassessed governance era projection contains derived state');
  }
  for (const authority of era.authority_windows) {
    exactObject(authority, 'Founders Console authority-window projection', [
      'authority_id',
      'era_window_satisfied',
      'reason',
      'execution_binding'
    ]);
    if (
      !identifier(authority.authority_id)
      || typeof authority.era_window_satisfied !== 'boolean'
      || typeof authority.reason !== 'string'
      || authority.execution_binding !== false
    ) {
      throw new ValidationError('Founders Console authority-window projection is invalid');
    }
  }
}

function integerBetween(value, min, max) {
  return Number.isSafeInteger(value) && value >= min && value <= max;
}

function identifier(value) {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/.test(value);
}

function castingProjection(result) {
  return Object.freeze({
    assessed: true,
    eligible: result.casting_vote_eligible,
    reason: result.reason,
    pre_cast_outcome: result.pre_cast_outcome
  });
}

function eraProjection(result) {
  return Object.freeze({
    assessed: true,
    current_era: result.current_era,
    candidate_era: result.transition?.candidate_era ?? null,
    transition_eligible: result.transition?.eligible ?? false,
    transition_reason: result.transition?.reason ?? 'terminal-era',
    authority_windows: Object.freeze(result.authority_assessments.map(item => Object.freeze({
      authority_id: item.authority_id,
      era_window_satisfied: item.era_window_satisfied,
      reason: item.reason,
      execution_binding: false
    })))
  });
}

function projectionDigestPayload(projection) {
  const { projection_digest: _ignored, ...payload } = projection;
  return payload;
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
