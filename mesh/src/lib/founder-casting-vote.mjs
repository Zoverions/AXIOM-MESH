import { digestObject, ValidationError } from './canonical.mjs';
import { validateFoundersCouncilFoundation } from './founder-genesis-council.mjs';

export const FOUNDER_CASTING_VOTE_ASSESSMENT_SCHEMA =
  'axiom-founder-casting-vote-assessment.v0';

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const DECISION_CLASSES = new Set([
  'ordinary',
  'significant',
  'constitutional',
  'protected',
  'emergency'
]);
const DECISION_MODES = new Set(['simple-majority', 'fixed-threshold']);

export function assessFounderCastingVote(foundationDocument, assessment) {
  const foundation = validateFoundersCouncilFoundation(foundationDocument);
  validateAssessment(assessment);

  if (assessment.foundation_digest !== foundation.package_digest) {
    throw new ValidationError('Founder casting-vote assessment foundation digest is invalid');
  }
  if (assessment.founder_mind_id !== foundation.founder_mind_id) {
    throw new ValidationError('Founder casting-vote assessment Founder binding is invalid');
  }

  const activeSeats = foundationDocument.seats.filter(seat => seat.voting_status === 'active');
  const activeBiological = activeSeats.filter(seat => seat.seat_class === 'biological');
  const activeDigital = activeSeats.filter(seat => seat.seat_class === 'digital');
  const fullOriginalCouncilActive =
    activeSeats.length === 20
    && activeBiological.length === 10
    && activeDigital.length === 10;

  const votes = assessment.ballot_summary;
  validateBallotCeilings(votes);

  const votesFor = votes.biological_for + votes.digital_for;
  const votesAgainst = votes.biological_against + votes.digital_against;
  const abstentions = votes.biological_abstain + votes.digital_abstain;
  const participation = votesFor + votesAgainst + abstentions;

  if (participation > activeSeats.length) {
    throw new ValidationError('Founder casting-vote ballot exceeds active Council electorate');
  }
  if (votes.biological_for + votes.biological_against + votes.biological_abstain > activeBiological.length) {
    throw new ValidationError('Founder casting-vote biological ballot exceeds active electorate');
  }
  if (votes.digital_for + votes.digital_against + votes.digital_abstain > activeDigital.length) {
    throw new ValidationError('Founder casting-vote digital ballot exceeds active electorate');
  }

  const rule = assessment.decision_rule;
  const quorumSatisfied = participation >= rule.quorum_required;
  const biologicalMinimumSatisfied = votes.biological_for >= rule.biological_yes_minimum;
  const digitalMinimumSatisfied = votes.digital_for >= rule.digital_yes_minimum;
  const exactTie = votesFor === votesAgainst;
  const simpleMajority = rule.mode === 'simple-majority';
  const fixedThresholdSatisfied =
    rule.mode === 'fixed-threshold'
      ? votesFor >= rule.yes_threshold
      : null;

  let eligible = true;
  let reason = 'eligible';

  if (!fullOriginalCouncilActive) {
    eligible = false;
    reason = 'full-original-council-not-active';
  } else if (!assessment.ballot_closed) {
    eligible = false;
    reason = 'ordinary-ballot-not-closed';
  } else if (assessment.decision_class !== 'ordinary') {
    eligible = false;
    reason = 'decision-class-does-not-permit-casting-vote';
  } else if (!rule.casting_vote_permitted) {
    eligible = false;
    reason = 'casting-vote-disabled-by-decision-rule';
  } else if (!quorumSatisfied) {
    eligible = false;
    reason = 'quorum-not-satisfied';
  } else if (!biologicalMinimumSatisfied) {
    eligible = false;
    reason = 'biological-yes-minimum-not-satisfied';
  } else if (!digitalMinimumSatisfied) {
    eligible = false;
    reason = 'digital-yes-minimum-not-satisfied';
  } else if (!simpleMajority) {
    eligible = false;
    reason = fixedThresholdSatisfied
      ? 'fixed-threshold-decision-does-not-use-casting-vote'
      : 'fixed-threshold-not-satisfied';
  } else if (!exactTie) {
    eligible = false;
    reason = 'ordinary-vote-is-not-tied';
  }

  const preCastOutcome = derivePreCastOutcome({
    decisionMode: rule.mode,
    votesFor,
    votesAgainst,
    yesThreshold: rule.yes_threshold,
    quorumSatisfied,
    biologicalMinimumSatisfied,
    digitalMinimumSatisfied
  });

  return Object.freeze({
    valid: true,
    schema: assessment.schema,
    proposal_id: assessment.proposal_id,
    founder_mind_id: assessment.founder_mind_id,
    foundation_digest: foundation.package_digest,
    assessment_digest: digestObject(assessment),
    full_original_council_active: fullOriginalCouncilActive,
    active_voters: activeSeats.length,
    votes_for: votesFor,
    votes_against: votesAgainst,
    abstentions,
    participation,
    quorum_satisfied: quorumSatisfied,
    biological_yes_minimum_satisfied: biologicalMinimumSatisfied,
    digital_yes_minimum_satisfied: digitalMinimumSatisfied,
    pre_cast_outcome: preCastOutcome,
    casting_vote_eligible: eligible,
    reason,
    authority_effect: 'none',
    execution_authority: false,
    runtime_activation: false
  });
}

function validateAssessment(assessment) {
  exactObject(assessment, 'Founder casting-vote assessment', [
    'schema',
    'version',
    'status',
    'proposal_id',
    'founder_mind_id',
    'foundation_digest',
    'decision_class',
    'decision_rule',
    'ballot_summary',
    'ballot_closed',
    'authority_effect',
    'execution_authority',
    'runtime_activation'
  ]);

  if (
    assessment.schema !== FOUNDER_CASTING_VOTE_ASSESSMENT_SCHEMA
    || assessment.version !== 0
    || assessment.status !== 'inert-contract-laboratory'
    || !id(assessment.proposal_id)
    || !id(assessment.founder_mind_id)
    || !digest(assessment.foundation_digest)
    || !DECISION_CLASSES.has(assessment.decision_class)
    || typeof assessment.ballot_closed !== 'boolean'
    || assessment.authority_effect !== 'none'
    || assessment.execution_authority !== false
    || assessment.runtime_activation !== false
  ) {
    throw new ValidationError('Founder casting-vote assessment activation boundary is invalid');
  }

  validateDecisionRule(assessment.decision_rule);
  validateBallotSummary(assessment.ballot_summary);
}

function validateDecisionRule(rule) {
  exactObject(rule, 'Founder casting-vote decision rule', [
    'mode',
    'quorum_required',
    'yes_threshold',
    'casting_vote_permitted',
    'biological_yes_minimum',
    'digital_yes_minimum'
  ]);

  if (
    !DECISION_MODES.has(rule.mode)
    || !integerBetween(rule.quorum_required, 1, 20)
    || typeof rule.casting_vote_permitted !== 'boolean'
    || !integerBetween(rule.biological_yes_minimum, 0, 10)
    || !integerBetween(rule.digital_yes_minimum, 0, 10)
  ) {
    throw new ValidationError('Founder casting-vote decision rule is invalid');
  }

  if (rule.mode === 'simple-majority' && rule.yes_threshold !== null) {
    throw new ValidationError('Simple-majority casting-vote rule cannot define a fixed yes threshold');
  }

  if (
    rule.mode === 'fixed-threshold'
    && !integerBetween(rule.yes_threshold, 1, 20)
  ) {
    throw new ValidationError('Fixed-threshold casting-vote rule requires a yes threshold');
  }
}

function validateBallotSummary(votes) {
  exactObject(votes, 'Founder casting-vote ballot summary', [
    'biological_for',
    'biological_against',
    'biological_abstain',
    'digital_for',
    'digital_against',
    'digital_abstain'
  ]);

  for (const [name, value] of Object.entries(votes)) {
    if (!integerBetween(value, 0, 10)) {
      throw new ValidationError(`Founder casting-vote ballot field ${name} is invalid`);
    }
  }
}

function validateBallotCeilings(votes) {
  const biological =
    votes.biological_for + votes.biological_against + votes.biological_abstain;
  const digital =
    votes.digital_for + votes.digital_against + votes.digital_abstain;

  if (biological > 10 || digital > 10) {
    throw new ValidationError('Founder casting-vote ballot exceeds substrate seat ceiling');
  }
}

function derivePreCastOutcome({
  decisionMode,
  votesFor,
  votesAgainst,
  yesThreshold,
  quorumSatisfied,
  biologicalMinimumSatisfied,
  digitalMinimumSatisfied
}) {
  if (!quorumSatisfied) return 'no-quorum';
  if (!biologicalMinimumSatisfied || !digitalMinimumSatisfied) return 'protected-minimum-failed';

  if (decisionMode === 'fixed-threshold') {
    return votesFor >= yesThreshold ? 'accepted' : 'rejected';
  }

  if (votesFor === votesAgainst) return 'tie';
  return votesFor > votesAgainst ? 'accepted' : 'rejected';
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

function integerBetween(value, min, max) {
  return Number.isSafeInteger(value) && value >= min && value <= max;
}

function id(value) {
  return typeof value === 'string' && IDENTIFIER.test(value);
}

function digest(value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}
