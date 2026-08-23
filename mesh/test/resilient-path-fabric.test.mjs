import test from 'node:test';
import assert from 'node:assert/strict';

import {
  FAILURE_DOMAIN_DIMENSIONS,
  validateResilientPathFabric
} from '../src/lib/resilient-path-fabric.mjs';

function domains(prefix) {
  return Object.fromEntries(
    FAILURE_DOMAIN_DIMENSIONS.map(dimension => [dimension, `${prefix}.${dimension}`])
  );
}

function fixture() {
  return {
    schema: 'axiom-resilient-path-fabric.v0',
    version: 0,
    status: 'inert-contract-laboratory',
    traffic_intent: {
      intent_id: 'traffic.critical-1',
      source_node_id: 'node.source',
      destination_node_id: 'node.destination',
      criticality: 'critical',
      required_live_paths: 2,
      minimum_failure_domain_diversity: 4,
      max_path_latency_ms: 100,
      allow_dtn_fallback: true,
      required_attestation_state: 'current'
    },
    nodes: [
      {
        node_id: 'node.source',
        role: 'leaf',
        attestation_state: 'current',
        energy_state: 'sufficient',
        transit_allowed: false,
        compute_class: 'edge',
        maintenance_class: 'routine'
      },
      {
        node_id: 'node.primary-relay',
        role: 'core',
        attestation_state: 'current',
        energy_state: 'mains',
        transit_allowed: true,
        compute_class: 'accelerated',
        maintenance_class: 'routine'
      },
      {
        node_id: 'node.repair-relay',
        role: 'regional-relay',
        attestation_state: 'current',
        energy_state: 'sufficient',
        transit_allowed: true,
        compute_class: 'edge',
        maintenance_class: 'restricted'
      },
      {
        node_id: 'node.destination',
        role: 'leaf',
        attestation_state: 'current',
        energy_state: 'sufficient',
        transit_allowed: false,
        compute_class: 'edge',
        maintenance_class: 'routine'
      }
    ],
    links: [
      {
        link_id: 'link.primary-1',
        from_node_id: 'node.source',
        to_node_id: 'node.primary-relay',
        medium: 'wired',
        regulatory_state: 'allowed',
        observed_latency_ms: 8,
        failure_domains: domains('primary-a'),
        maintenance_class: 'routine'
      },
      {
        link_id: 'link.primary-2',
        from_node_id: 'node.primary-relay',
        to_node_id: 'node.destination',
        medium: 'wifi',
        regulatory_state: 'allowed',
        observed_latency_ms: 12,
        failure_domains: domains('primary-b'),
        maintenance_class: 'restricted'
      },
      {
        link_id: 'link.repair-1',
        from_node_id: 'node.source',
        to_node_id: 'node.repair-relay',
        medium: 'subghz',
        regulatory_state: 'allowed',
        observed_latency_ms: 15,
        failure_domains: domains('repair-a'),
        maintenance_class: 'routine'
      },
      {
        link_id: 'link.repair-2',
        from_node_id: 'node.repair-relay',
        to_node_id: 'node.destination',
        medium: 'cellular',
        regulatory_state: 'allowed',
        observed_latency_ms: 20,
        failure_domains: domains('repair-b'),
        maintenance_class: 'routine'
      }
    ],
    path_portfolio: {
      paths: [
        {
          path_id: 'path.primary',
          role: 'primary',
          link_ids: ['link.primary-1', 'link.primary-2'],
          declared_latency_ms: 20,
          external_effect_performed: false
        },
        {
          path_id: 'path.repair',
          role: 'repair',
          link_ids: ['link.repair-1', 'link.repair-2'],
          declared_latency_ms: 35,
          external_effect_performed: false
        }
      ],
      dtn_fallback: {
        enabled: true,
        protocol: 'bpv7',
        store_forward_only: true,
        authority_effect: 'none',
        network_effect: 'none'
      }
    },
    repair_policy: {
      mode: 'prepared-candidates-only',
      primary_path_id: 'path.primary',
      repair_path_ids: ['path.repair'],
      fast_local_repair_target_ms: 250,
      selective_replication: 'critical-only',
      direct_forwarding_change_allowed: false,
      global_route_mutation_allowed: false,
      authority_effect: 'none',
      network_effect: 'none'
    },
    optimizer: {
      mode: 'shadow-only',
      recommendation_id: 'recommendation.demo-1',
      recommended_path_ids: ['path.primary', 'path.repair'],
      hard_constraints_first: true,
      ai_direct_control: false,
      requires_deterministic_executor: true,
      authority_effect: 'none',
      network_effect: 'none'
    },
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false,
    input_claims_authenticated: false,
    live_measurements_performed: false
  };
}

function relay(document, nodeId) {
  return document.nodes.find(node => node.node_id === nodeId);
}

function link(document, linkId) {
  return document.links.find(item => item.link_id === linkId);
}

test('accepts a critical path portfolio with independent repair and DTN fallback', () => {
  const result = validateResilientPathFabric(fixture());
  assert.equal(result.valid, true);
  assert.equal(result.path_count, 2);
  assert.equal(result.minimum_observed_failure_domain_diversity, 6);
  assert.equal(result.dtn_fallback_enabled, true);
  assert.equal(result.authority_effect, 'none');
  assert.equal(result.network_effect, 'none');
  assert.equal(result.runtime_activation, false);
  assert.equal(result.input_claims_authenticated, false);
  assert.equal(result.live_measurements_performed, false);
  assert.equal(result.live_routing_changed, false);
});

test('cannot launder caller-supplied path claims into authenticated evidence', () => {
  const document = fixture();
  document.input_claims_authenticated = true;
  assert.throws(
    () => validateResilientPathFabric(document),
    /activation boundary is invalid/
  );
});

test('cannot claim that the inert validator performed live measurements', () => {
  const document = fixture();
  document.live_measurements_performed = true;
  assert.throws(
    () => validateResilientPathFabric(document),
    /activation boundary is invalid/
  );
});

test('critical traffic requires at least two live paths', () => {
  const document = fixture();
  document.traffic_intent.required_live_paths = 1;
  document.path_portfolio.paths = [document.path_portfolio.paths[0]];
  document.repair_policy.repair_path_ids = [];
  assert.throws(
    () => validateResilientPathFabric(document),
    /Critical traffic requires at least two live paths/
  );
});

test('rejects nominal backup paths that share too many failure domains', () => {
  const document = fixture();
  const primaryDomains = link(document, 'link.primary-1').failure_domains;
  for (const repairId of ['link.repair-1', 'link.repair-2']) {
    const repairDomains = link(document, repairId).failure_domains;
    repairDomains.power = primaryDomains.power;
    repairDomains.backhaul = primaryDomains.backhaul;
    repairDomains.vendor = primaryDomains.vendor;
  }
  assert.throws(
    () => validateResilientPathFabric(document),
    /share too many correlated failure domains/
  );
});

test('shared transit relay cannot be laundered as independence by different link labels', () => {
  const document = fixture();
  link(document, 'link.repair-1').to_node_id = 'node.primary-relay';
  link(document, 'link.repair-2').from_node_id = 'node.primary-relay';
  assert.throws(
    () => validateResilientPathFabric(document),
    /share too many correlated failure domains/
  );
});

test('rejects a path that uses spectrum without confirmed legal availability', () => {
  const document = fixture();
  link(document, 'link.repair-1').regulatory_state = 'unknown';
  assert.throws(
    () => validateResilientPathFabric(document),
    /without confirmed legal availability/
  );
});

test('rejects stale-attestation transit', () => {
  const document = fixture();
  relay(document, 'node.repair-relay').attestation_state = 'stale';
  assert.throws(
    () => validateResilientPathFabric(document),
    /without current attestation/
  );
});

test('rejects a battery relay once it reaches reserve state', () => {
  const document = fixture();
  relay(document, 'node.repair-relay').energy_state = 'reserve';
  assert.throws(
    () => validateResilientPathFabric(document),
    /energy-constrained transit node/
  );
});

test('rejects discontinuous route descriptions', () => {
  const document = fixture();
  link(document, 'link.repair-2').from_node_id = 'node.primary-relay';
  assert.throws(
    () => validateResilientPathFabric(document),
    /not a continuous source-to-destination chain/
  );
});

test('recomputes path latency instead of trusting the declaration', () => {
  const document = fixture();
  document.path_portfolio.paths[1].declared_latency_ms = 34;
  assert.throws(
    () => validateResilientPathFabric(document),
    /declared latency does not match link observations/
  );
});

test('rejects path descriptions that claim a live network effect', () => {
  const document = fixture();
  document.path_portfolio.paths[0].external_effect_performed = true;
  assert.throws(
    () => validateResilientPathFabric(document),
    /cannot claim a live network effect/
  );
});

test('rejects local repair policy that can directly change forwarding', () => {
  const document = fixture();
  document.repair_policy.direct_forwarding_change_allowed = true;
  assert.throws(
    () => validateResilientPathFabric(document),
    /cannot mutate live forwarding or route state/
  );
});

test('requires the repair policy to bind every declared repair path', () => {
  const document = fixture();
  document.repair_policy.repair_path_ids = [];
  assert.throws(
    () => validateResilientPathFabric(document),
    /complete repair path set/
  );
});

test('rejects AI direct control and keeps optimization in shadow mode', () => {
  const document = fixture();
  document.optimizer.ai_direct_control = true;
  assert.throws(
    () => validateResilientPathFabric(document),
    /bypass deterministic hard constraints or authority boundaries/
  );
});

test('rejects an optimizer recommendation for a path outside the validated portfolio', () => {
  const document = fixture();
  document.optimizer.recommended_path_ids = ['path.unknown'];
  assert.throws(
    () => validateResilientPathFabric(document),
    /recommends unknown path/
  );
});

test('DTN fallback cannot be enabled unless traffic intent explicitly allows it', () => {
  const document = fixture();
  document.traffic_intent.allow_dtn_fallback = false;
  assert.throws(
    () => validateResilientPathFabric(document),
    /must be explicitly allowed and use BPv7/
  );
});

test('portfolio digest changes when operator-maintenance facts change', () => {
  const first = fixture();
  const second = fixture();
  relay(second, 'node.repair-relay').maintenance_class = 'specialist';
  const firstDigest = validateResilientPathFabric(first).portfolio_digest;
  const secondDigest = validateResilientPathFabric(second).portfolio_digest;
  assert.notEqual(firstDigest, secondDigest);
});
