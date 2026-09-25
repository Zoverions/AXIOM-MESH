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

  if (projection.projection_digest !== digestObject(projectionDigestPayload(projection))) {
    throw new ValidationError('Founders Console projection digest is invalid');
  }

  return projection;
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
