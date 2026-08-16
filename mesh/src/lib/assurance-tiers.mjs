import { defineAssertionLadder } from './assertion-ladder.mjs';

export const ASSURANCE_LADDER = defineAssertionLadder({
  schema: 'axiom-assertion-ladder.v1',
  ladder_id: 'axiom.assurance',
  version: '1.0.0',
  description: 'Monotonic assurance states for claims about AXIOM effects and evidence. Higher states require stronger evidence and cannot be inferred from lower states.',
  states: [
    {
      id: 'A0',
      rank: 0,
      name: 'ephemeral',
      description: 'Unretained or locally ephemeral assertion with no durable attributable evidence.'
    },
    {
      id: 'A1',
      rank: 1,
      name: 'attributable',
      description: 'Assertion is attributable to a named actor, service, or signer.'
    },
    {
      id: 'A2',
      rank: 2,
      name: 'auditable',
      description: 'Assertion is bound to durable inspectable evidence through the AXIOM policy, execution, and evidence path.'
    },
    {
      id: 'A3',
      rank: 3,
      name: 'independently_verified',
      description: 'Assertion has the A2 evidence path plus a separately bound independent verification or approval factor required by policy.'
    },
    {
      id: 'A4',
      rank: 4,
      name: 'collectively_finalized',
      description: 'Assertion has a separately implemented and verified collective-finality profile. The current kernel does not provide this runtime state.'
    }
  ],
  failure_states: ['invalid', 'revoked', 'unknown']
});

export const ASSURANCE_TIER_IDS = Object.freeze(
  ASSURANCE_LADDER.states.map(state => state.id)
);

export function getAssuranceTier(id) {
  const tier = ASSURANCE_LADDER.states.find(state => state.id === id);
  if (!tier) throw new Error(`Unknown assurance tier: ${id}`);
  return tier;
}
