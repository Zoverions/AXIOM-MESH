import { defineAssertionLadder } from './index.mjs';

export const ASSURANCE_TIERS = Object.freeze([
  Object.freeze({
    id: 'A0',
    rank: 0,
    name: 'local_optimistic',
    latency_class: 'sub_10ms_target',
    mechanism: 'ephemeral local state; no durable evidence requirement',
    reversibility: 'silent_local_replacement',
    suitable_for: ['ui_state', 'drafts', 'hints']
  }),
  Object.freeze({
    id: 'A1',
    rank: 1,
    name: 'local_durable',
    latency_class: 'sub_100ms_target',
    mechanism: 'durable local evidence under one authoritative writer',
    reversibility: 'compensating_record',
    suitable_for: ['learner_events', 'notes', 'progress']
  }),
  Object.freeze({
    id: 'A2',
    rank: 2,
    name: 'locally_approved',
    latency_class: 'human_or_policy_bound',
    mechanism: 'A1 plus required independent local approval',
    reversibility: 'receipt_bound_compensation',
    suitable_for: ['configuration_change', 'pack_activation', 'bounded_agent_budget']
  }),
  Object.freeze({
    id: 'A3',
    rank: 3,
    name: 'attested',
    latency_class: 'interactive_network',
    mechanism: 'A2 plus Grid-attested externally verifiable receipt',
    reversibility: 'compensating_only',
    suitable_for: ['credentials', 'portfolio_export', 'cross_grid_receipt']
  }),
  Object.freeze({
    id: 'A4',
    rank: 4,
    name: 'anchored',
    latency_class: 'minutes_to_daily',
    mechanism: 'A3 plus externally ordered public checkpoint anchor',
    reversibility: 'append_only_correction',
    suitable_for: ['transcript_checkpoint', 'audit_checkpoint', 'history_anti_backdating']
  }),
  Object.freeze({
    id: 'A5',
    rank: 5,
    name: 'agreed',
    latency_class: 'seconds_to_minutes',
    mechanism: 'A4 plus bounded multi-Grid threshold/quorum agreement',
    reversibility: 'new_governance_event_only',
    suitable_for: ['circle_governance', 'shared_registry', 'multi_org_approval']
  }),
  Object.freeze({
    id: 'A6',
    rank: 6,
    name: 'settled',
    latency_class: 'external_settlement_finality',
    mechanism: 'A5 or policy-approved lower prerequisite plus independently evidenced external value settlement',
    reversibility: 'external_protocol_rules_only',
    suitable_for: ['value_transfer']
  })
]);

export const ASSURANCE_LADDER = defineAssertionLadder({
  schema: 'axiom-assertion-ladder.v1',
  ladder_id: 'axiom.assurance',
  version: '1.0.0',
  description: 'Policy-declared assurance achieved by an AXIOM record or effect. Higher states may render lower states; lower states may never render higher states.',
  states: ASSURANCE_TIERS
});

export const ASSURANCE_TIER_IDS = Object.freeze(ASSURANCE_TIERS.map(tier => tier.id));

export function getAssuranceTier(tierId) {
  const tier = ASSURANCE_TIERS.find(candidate => candidate.id === tierId);
  if (!tier) throw new Error(`Unknown assurance tier ${tierId}`);
  return tier;
}
