import { defineAssertionLadder } from './index.mjs';

export const PUBLIC_ORDERING_LADDER = defineAssertionLadder({
  schema: 'axiom-assertion-ladder.v1',
  ladder_id: 'axiom.public-ordering',
  version: '1.0.0',
  description: 'Whether a record has been committed to an ordering authority outside the producing AXIOM domain.',
  states: [
    { id: 'unanchored', rank: 0, name: 'unanchored' },
    { id: 'anchored', rank: 1, name: 'externally_ordered_anchor' }
  ],
  failure_states: ['anchor_invalidated']
});

export const VALUE_SETTLEMENT_LADDER = defineAssertionLadder({
  schema: 'axiom-assertion-ladder.v1',
  ladder_id: 'axiom.value-settlement',
  version: '1.0.0',
  description: 'External value-transfer settlement state. Shape-correct transaction identifiers are not evidence of advancement.',
  states: [
    { id: 'not_submitted', rank: 0 },
    { id: 'submitted', rank: 1 },
    { id: 'confirmed', rank: 2 },
    { id: 'finalized', rank: 3 }
  ],
  failure_states: ['rejected', 'reverted', 'unknown']
});

export function composeAssuranceState({ assurance, public_ordering = 'unanchored', value_settlement = 'not_submitted' }) {
  return Object.freeze({
    schema: 'axiom-composed-assurance-state.v1',
    assurance,
    public_ordering,
    value_settlement
  });
}
