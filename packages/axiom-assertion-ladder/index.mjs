export const ASSERTION_LADDER_SCHEMA = 'axiom-assertion-ladder.v1';

export class AssertionLadderError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'AssertionLadderError';
    this.code = code;
  }
}

function requireCondition(condition, code, message) {
  if (!condition) throw new AssertionLadderError(code, message);
}

export function defineAssertionLadder(definition) {
  requireCondition(definition && typeof definition === 'object', 'INVALID_LADDER', 'ladder must be an object');
  requireCondition(definition.schema === ASSERTION_LADDER_SCHEMA, 'INVALID_SCHEMA', 'unsupported assertion-ladder schema');
  requireCondition(typeof definition.ladder_id === 'string' && definition.ladder_id.length > 0, 'INVALID_LADDER_ID', 'ladder_id is required');
  requireCondition(Array.isArray(definition.states) && definition.states.length > 0, 'INVALID_STATES', 'states must be a non-empty array');

  const ids = new Set();
  const ranks = new Set();
  const states = definition.states.map((state, index) => {
    requireCondition(state && typeof state === 'object', 'INVALID_STATE', `state ${index} must be an object`);
    requireCondition(typeof state.id === 'string' && state.id.length > 0, 'INVALID_STATE_ID', `state ${index} id is required`);
    requireCondition(Number.isInteger(state.rank) && state.rank >= 0, 'INVALID_STATE_RANK', `${state.id} rank must be a non-negative integer`);
    requireCondition(!ids.has(state.id), 'DUPLICATE_STATE_ID', `duplicate state id ${state.id}`);
    requireCondition(!ranks.has(state.rank), 'DUPLICATE_STATE_RANK', `duplicate state rank ${state.rank}`);
    ids.add(state.id);
    ranks.add(state.rank);
    return Object.freeze({ ...state });
  }).sort((a, b) => a.rank - b.rank);

  states.forEach((state, index) => {
    requireCondition(state.rank === index, 'NON_CONTIGUOUS_RANKS', 'state ranks must be contiguous starting at zero');
  });

  const failureStates = new Set(definition.failure_states ?? []);
  for (const failureState of failureStates) {
    requireCondition(typeof failureState === 'string' && failureState.length > 0, 'INVALID_FAILURE_STATE', 'failure states must be non-empty strings');
    requireCondition(!ids.has(failureState), 'FAILURE_STATE_COLLISION', `${failureState} cannot be both ranked and failure state`);
  }

  return Object.freeze({
    schema: ASSERTION_LADDER_SCHEMA,
    ladder_id: definition.ladder_id,
    version: definition.version ?? '1.0.0',
    description: definition.description ?? '',
    states: Object.freeze(states),
    failure_states: Object.freeze([...failureStates])
  });
}

function stateIndex(ladder) {
  return new Map(ladder.states.map(state => [state.id, state]));
}

export function describeAssertion(ladder, stateId) {
  const states = stateIndex(ladder);
  const state = states.get(stateId);
  if (state) {
    return {
      kind: 'ranked',
      state,
      not_yet: ladder.states.filter(candidate => candidate.rank > state.rank).map(candidate => candidate.id)
    };
  }
  if (ladder.failure_states.includes(stateId)) {
    return { kind: 'failure', state: { id: stateId, terminal: true }, not_yet: ladder.states.map(candidate => candidate.id) };
  }
  throw new AssertionLadderError('UNKNOWN_STATE', `unknown state ${stateId} for ${ladder.ladder_id}`);
}

export function canRenderAs(ladder, achievedStateId, claimedStateId) {
  const achieved = describeAssertion(ladder, achievedStateId);
  const claimed = describeAssertion(ladder, claimedStateId);

  if (achieved.kind === 'failure' || claimed.kind === 'failure') {
    return achievedStateId === claimedStateId;
  }
  return achieved.state.rank >= claimed.state.rank;
}

export function assertRenderAllowed(ladder, achievedStateId, claimedStateId) {
  requireCondition(
    canRenderAs(ladder, achievedStateId, claimedStateId),
    'CLAIM_EXCEEDS_EVIDENCE',
    `cannot render ${achievedStateId} as ${claimedStateId}`
  );
  return true;
}

export function createAssertionEvent({
  ladder,
  subject_id,
  state,
  evidence = [],
  occurred_at = new Date().toISOString(),
  previous = null,
  metadata = {}
}) {
  requireCondition(typeof subject_id === 'string' && subject_id.length > 0, 'INVALID_SUBJECT', 'subject_id is required');
  requireCondition(Array.isArray(evidence), 'INVALID_EVIDENCE', 'evidence must be an array');
  const described = describeAssertion(ladder, state);

  if (previous) {
    requireCondition(previous.ladder_id === ladder.ladder_id, 'LADDER_MISMATCH', 'previous event belongs to another ladder');
    requireCondition(previous.subject_id === subject_id, 'SUBJECT_MISMATCH', 'previous event belongs to another subject');
    const prior = describeAssertion(ladder, previous.state);
    requireCondition(prior.kind !== 'failure', 'TERMINAL_ASSERTION', 'failure assertions are terminal');
    requireCondition(described.kind !== 'failure' || described.state.terminal === true, 'INVALID_FAILURE_TRANSITION', 'invalid failure transition');
    if (described.kind === 'ranked') {
      requireCondition(described.state.rank > prior.state.rank, 'NON_MONOTONIC_TRANSITION', `transition ${previous.state} -> ${state} is not an upgrade`);
    }
  }

  return Object.freeze({
    schema: 'axiom-assertion-event.v1',
    ladder_id: ladder.ladder_id,
    ladder_version: ladder.version,
    subject_id,
    previous_state: previous?.state ?? null,
    state,
    state_rank: described.kind === 'ranked' ? described.state.rank : null,
    not_yet: described.not_yet,
    evidence: Object.freeze([...evidence]),
    occurred_at,
    metadata: Object.freeze({ ...metadata })
  });
}

export function resolvePolicyDeclaredTier({ policy_tier, caller_tier = null, allowed_tiers }) {
  requireCondition(Array.isArray(allowed_tiers) && allowed_tiers.includes(policy_tier), 'INVALID_POLICY_TIER', 'policy tier is not allowed');
  requireCondition(caller_tier === null || caller_tier === policy_tier, 'CALLER_TIER_OVERRIDE_DENIED', 'caller may not choose or downgrade the policy-declared assurance tier');
  return policy_tier;
}
