import { defineAssertionLadder } from './index.mjs';

// These identifiers and meanings preserve the approved architecture in
// docs/rebuild/ADAPTIVE-ASSURANCE-AND-PLURAL-AUTHORITY.md.
export const ASSURANCE_TIERS = Object.freeze([
  Object.freeze({
    id: 'A0',
    rank: 0,
    name: 'ephemeral',
    mechanism: 'best-effort reversible execution with no durable claim beyond optional local telemetry',
    suitable_for: ['brainstorming', 'previews', 'disposable_simulation']
  }),
  Object.freeze({
    id: 'A1',
    rank: 1,
    name: 'attributable',
    mechanism: 'authenticated principal, scoped authority and lightweight receipt',
    suitable_for: ['personal_organization', 'reversible_local_change']
  }),
  Object.freeze({
    id: 'A2',
    rank: 2,
    name: 'auditable',
    mechanism: 'inputs, policy decision, grant, execution identity, output digest and evidence continuity retained',
    suitable_for: ['persistent_automation', 'selective_sharing', 'circle_tasks']
  }),
  Object.freeze({
    id: 'A3',
    rank: 3,
    name: 'independently_verified',
    mechanism: 'separate approval, verifier, reproducible execution, witness or equivalent corroboration',
    suitable_for: ['financial', 'legal', 'identity', 'administrative', 'sensitive_governance']
  }),
  Object.freeze({
    id: 'A4',
    rank: 4,
    name: 'collectively_finalized',
    mechanism: 'threshold or chamber decision with explicit quorum, challenge/dispute rules and finality record',
    suitable_for: ['constitutional_change', 'shared_treasury', 'binding_collective_commitment']
  })
]);

export const ASSURANCE_LADDER = defineAssertionLadder({
  schema: 'axiom-assertion-ladder.v1',
  ladder_id: 'axiom.assurance',
  version: '1.0.0',
  description: 'Approved AXIOM adaptive-assurance profiles. Assurance remains distinct from external ordering and value-settlement state.',
  states: ASSURANCE_TIERS
});

export const ASSURANCE_TIER_IDS = Object.freeze(ASSURANCE_TIERS.map(tier => tier.id));

export function getAssuranceTier(tierId) {
  const tier = ASSURANCE_TIERS.find(candidate => candidate.id === tierId);
  if (!tier) throw new Error(`Unknown assurance tier ${tierId}`);
  return tier;
}
