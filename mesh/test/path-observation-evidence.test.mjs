import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';

import { canonicalJson, sha256 } from '../src/lib/canonical.mjs';
import {
  PATH_OBSERVATION_KINDS,
  PATH_OBSERVATION_REQUIRED_ROLE_BY_KIND,
  validatePathObservationEvidence
} from '../src/lib/path-observation-evidence.mjs';
import {
  FAILURE_DOMAIN_DIMENSIONS,
  validateResilientPathFabric
} from '../src/lib/resilient-path-fabric.mjs';

const EVALUATED_AT = '2026-08-23T14:00:00.000Z';
const OBSERVED_AT = '2026-08-23T13:59:30.000Z';
const VALID_UNTIL = '2026-08-23T14:05:00.000Z';

function domains(prefix) {
  return Object.fromEntries(
    FAILURE_DOMAIN_DIMENSIONS.map(dimension => [dimension, `${prefix}.${dimension}`])
  );
}

function pathFabricFixture() {
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

function signerFixture() {
  const trustedSigners = {};
  const privateKeys = new Map();
  for (const [kind, role] of Object.entries(PATH_OBSERVATION_REQUIRED_ROLE_BY_KIND)) {
    const signerId = `signer.${kind}`;
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    trustedSigners[signerId] = {
      public_key: publicKey.export({ type: 'spki', format: 'pem' }),
      roles: [role]
    };
    privateKeys.set(signerId, privateKey);
  }
  return { trustedSigners, privateKeys };
}

function freshnessFixture() {
  return Object.fromEntries(PATH_OBSERVATION_KINDS.map(kind => [kind, 300]));
}

function exactClaims(document, kind, subjectId) {
  if (kind.startsWith('node-')) {
    const node = document.nodes.find(item => item.node_id === subjectId);
    if (kind === 'node-profile') {
      return {
        role: node.role,
        transit_allowed: node.transit_allowed,
        compute_class: node.compute_class,
        maintenance_class: node.maintenance_class
      };
    }
    if (kind === 'node-attestation') return { attestation_state: node.attestation_state };
    if (kind === 'node-energy') return { energy_state: node.energy_state };
  }

  const link = document.links.find(item => item.link_id === subjectId);
  if (kind === 'link-profile') {
    return {
      from_node_id: link.from_node_id,
      to_node_id: link.to_node_id,
      medium: link.medium,
      maintenance_class: link.maintenance_class
    };
  }
  if (kind === 'link-latency') return { observed_latency_ms: link.observed_latency_ms };
  if (kind === 'link-regulatory') return { regulatory_state: link.regulatory_state };
  if (kind === 'link-failure-domains') return { failure_domains: link.failure_domains };
  throw new Error(`Unsupported test evidence kind ${kind}`);
}

function signRecord(statement, privateKey) {
  return {
    statement,
    signature: sign(
      null,
      Buffer.from(canonicalJson(statement)),
      privateKey
    ).toString('base64url')
  };
}

function evidenceFixture(document, signers) {
  const records = [];
  const portfolioDigest = validateResilientPathFabric(document).portfolio_digest;
  let sequence = 0;
  const append = (kind, subjectId) => {
    sequence += 1;
    const signerId = `signer.${kind}`;
    const statement = {
      schema: 'axiom-path-observation-statement.v0',
      portfolio_digest: portfolioDigest,
      evidence_id: `evidence.${sequence}`,
      kind,
      subject_id: subjectId,
      observed_at: OBSERVED_AT,
      valid_until: VALID_UNTIL,
      source_ref: `source.${kind}.${sequence}`,
      source_digest: sha256(`source:${kind}:${subjectId}:${sequence}`),
      signer_id: signerId,
      nonce: `nonce.${sequence}`,
      claims: exactClaims(document, kind, subjectId)
    };
    records.push(signRecord(statement, signers.privateKeys.get(signerId)));
  };

  for (const node of document.nodes) {
    append('node-profile', node.node_id);
    append('node-attestation', node.node_id);
    append('node-energy', node.node_id);
  }
  for (const link of document.links) {
    append('link-profile', link.link_id);
    append('link-latency', link.link_id);
    append('link-regulatory', link.link_id);
    append('link-failure-domains', link.link_id);
  }

  return {
    schema: 'axiom-path-observation-evidence.v0',
    version: 0,
    status: 'inert-evidence-laboratory',
    portfolio_digest: portfolioDigest,
    evidence_records: records,
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  };
}

function validationOptions(signers) {
  return {
    trustedSigners: signers.trustedSigners,
    evaluatedAt: EVALUATED_AT,
    maxAgeSecondsByKind: freshnessFixture()
  };
}

function findRecord(evidence, kind, subjectId) {
  return evidence.evidence_records.find(record =>
    record.statement.kind === kind && record.statement.subject_id === subjectId
  );
}

test('verifies complete attributed fresh evidence without claiming truth or authority', () => {
  const document = pathFabricFixture();
  const signers = signerFixture();
  const evidence = evidenceFixture(document, signers);
  const result = validatePathObservationEvidence(document, evidence, validationOptions(signers));

  assert.equal(result.valid, true);
  assert.equal(result.claim_attribution_complete, true);
  assert.equal(result.signatures_verified, true);
  assert.equal(result.freshness_satisfied, true);
  assert.equal(result.source_artifacts_reproduced, false);
  assert.equal(result.truth_established, false);
  assert.equal(result.authority_effect, 'none');
  assert.equal(result.network_effect, 'none');
  assert.equal(result.runtime_activation, false);
  assert.equal(result.live_routing_changed, false);
  assert.equal(result.evidence_count, 28);
});

test('rejects evidence packages bound to a different path portfolio', () => {
  const document = pathFabricFixture();
  const signers = signerFixture();
  const evidence = evidenceFixture(document, signers);
  evidence.portfolio_digest = 'f'.repeat(64);
  assert.throws(
    () => validatePathObservationEvidence(document, evidence, validationOptions(signers)),
    /does not bind the exact path portfolio/
  );
});

test('rejects individually signed evidence replayed into a different portfolio context', () => {
  const document = pathFabricFixture();
  const signers = signerFixture();
  const evidence = evidenceFixture(document, signers);
  const record = findRecord(evidence, 'link-latency', 'link.primary-1');
  record.statement.portfolio_digest = 'f'.repeat(64);
  Object.assign(
    record,
    signRecord(record.statement, signers.privateKeys.get(record.statement.signer_id))
  );
  assert.throws(
    () => validatePathObservationEvidence(document, evidence, validationOptions(signers)),
    /does not bind the exact path portfolio/
  );
});

test('rejects an evidence signer that is not in the evaluator trust set', () => {
  const document = pathFabricFixture();
  const signers = signerFixture();
  const evidence = evidenceFixture(document, signers);
  const record = findRecord(evidence, 'link-latency', 'link.primary-1');
  const { privateKey } = generateKeyPairSync('ed25519');
  record.statement.signer_id = 'signer.untrusted';
  Object.assign(record, signRecord(record.statement, privateKey));
  assert.throws(
    () => validatePathObservationEvidence(document, evidence, validationOptions(signers)),
    /is not in the evaluator trust set/
  );
});

test('rejects a trusted signer used outside its permitted evidence role', () => {
  const document = pathFabricFixture();
  const signers = signerFixture();
  const evidence = evidenceFixture(document, signers);
  const record = findRecord(evidence, 'link-regulatory', 'link.primary-1');
  record.statement.signer_id = 'signer.link-latency';
  Object.assign(
    record,
    signRecord(record.statement, signers.privateKeys.get('signer.link-latency'))
  );
  assert.throws(
    () => validatePathObservationEvidence(document, evidence, validationOptions(signers)),
    /is not trusted for required role regulatory-authority/
  );
});

test('rejects stale evidence under the externally supplied freshness policy', () => {
  const document = pathFabricFixture();
  const signers = signerFixture();
  const evidence = evidenceFixture(document, signers);
  const record = findRecord(evidence, 'link-latency', 'link.primary-1');
  record.statement.observed_at = '2026-08-23T13:50:00.000Z';
  Object.assign(
    record,
    signRecord(record.statement, signers.privateKeys.get(record.statement.signer_id))
  );
  assert.throws(
    () => validatePathObservationEvidence(document, evidence, validationOptions(signers)),
    /exceeds the configured freshness limit/
  );
});

test('rejects expired evidence even when its observation age would otherwise pass', () => {
  const document = pathFabricFixture();
  const signers = signerFixture();
  const evidence = evidenceFixture(document, signers);
  const record = findRecord(evidence, 'node-energy', 'node.repair-relay');
  record.statement.valid_until = '2026-08-23T13:59:59.000Z';
  Object.assign(
    record,
    signRecord(record.statement, signers.privateKeys.get(record.statement.signer_id))
  );
  assert.throws(
    () => validatePathObservationEvidence(document, evidence, validationOptions(signers)),
    /expired or has an invalid validity window/
  );
});

test('rejects future-dated observations', () => {
  const document = pathFabricFixture();
  const signers = signerFixture();
  const evidence = evidenceFixture(document, signers);
  const record = findRecord(evidence, 'node-attestation', 'node.primary-relay');
  record.statement.observed_at = '2026-08-23T14:00:01.000Z';
  record.statement.valid_until = '2026-08-23T14:05:01.000Z';
  Object.assign(
    record,
    signRecord(record.statement, signers.privateKeys.get(record.statement.signer_id))
  );
  assert.throws(
    () => validatePathObservationEvidence(document, evidence, validationOptions(signers)),
    /is dated in the future/
  );
});

test('rejects signature tampering on provenance metadata', () => {
  const document = pathFabricFixture();
  const signers = signerFixture();
  const evidence = evidenceFixture(document, signers);
  const record = findRecord(evidence, 'link-latency', 'link.primary-1');
  record.statement.source_digest = 'e'.repeat(64);
  assert.throws(
    () => validatePathObservationEvidence(document, evidence, validationOptions(signers)),
    /signature is invalid/
  );
});

test('rejects signer nonce reuse within one evidence package', () => {
  const document = pathFabricFixture();
  const signers = signerFixture();
  const evidence = evidenceFixture(document, signers);
  const first = findRecord(evidence, 'link-latency', 'link.primary-1');
  const second = findRecord(evidence, 'link-latency', 'link.primary-2');
  second.statement.nonce = first.statement.nonce;
  Object.assign(
    second,
    signRecord(second.statement, signers.privateKeys.get(second.statement.signer_id))
  );
  assert.throws(
    () => validatePathObservationEvidence(document, evidence, validationOptions(signers)),
    /signer nonce .* is reused within the package/
  );
});

test('rejects one source reference mapping to inconsistent source digests', () => {
  const document = pathFabricFixture();
  const signers = signerFixture();
  const evidence = evidenceFixture(document, signers);
  const first = findRecord(evidence, 'link-profile', 'link.primary-1');
  const second = findRecord(evidence, 'link-profile', 'link.primary-2');
  second.statement.source_ref = first.statement.source_ref;
  Object.assign(
    second,
    signRecord(second.statement, signers.privateKeys.get(second.statement.signer_id))
  );
  assert.throws(
    () => validatePathObservationEvidence(document, evidence, validationOptions(signers)),
    /maps to inconsistent source digests/
  );
});

test('requires complete evidence coverage for every declared node and link claim', () => {
  const document = pathFabricFixture();
  const signers = signerFixture();
  const evidence = evidenceFixture(document, signers);
  evidence.evidence_records = evidence.evidence_records.filter(record => !(
    record.statement.kind === 'link-failure-domains'
    && record.statement.subject_id === 'link.repair-2'
  ));
  assert.throws(
    () => validatePathObservationEvidence(document, evidence, validationOptions(signers)),
    /coverage is incomplete/
  );
});

test('rejects evidence claims that do not exactly match the bound portfolio', () => {
  const document = pathFabricFixture();
  const signers = signerFixture();
  const evidence = evidenceFixture(document, signers);
  const record = findRecord(evidence, 'link-latency', 'link.primary-1');
  record.statement.claims.observed_latency_ms = 9;
  Object.assign(
    record,
    signRecord(record.statement, signers.privateKeys.get(record.statement.signer_id))
  );
  assert.throws(
    () => validatePathObservationEvidence(document, evidence, validationOptions(signers)),
    /does not match the exact path-fabric claim/
  );
});

test('rejects attempts to turn the evidence package into an authority or network effect', () => {
  const document = pathFabricFixture();
  const signers = signerFixture();
  const evidence = evidenceFixture(document, signers);
  evidence.authority_effect = 'grant';
  assert.throws(
    () => validatePathObservationEvidence(document, evidence, validationOptions(signers)),
    /activation boundary is invalid/
  );
});

test('requires an explicit complete freshness policy rather than a permissive default', () => {
  const document = pathFabricFixture();
  const signers = signerFixture();
  const evidence = evidenceFixture(document, signers);
  const policy = freshnessFixture();
  delete policy['link-regulatory'];
  assert.throws(
    () => validatePathObservationEvidence(document, evidence, {
      trustedSigners: signers.trustedSigners,
      evaluatedAt: EVALUATED_AT,
      maxAgeSecondsByKind: policy
    }),
    /missing required field link-regulatory/
  );
});

test('verification result is bound to the evaluator trust and freshness policy', () => {
  const document = pathFabricFixture();
  const signers = signerFixture();
  const evidence = evidenceFixture(document, signers);
  const first = validatePathObservationEvidence(document, evidence, validationOptions(signers));

  const secondOptions = validationOptions(signers);
  secondOptions.maxAgeSecondsByKind['link-latency'] = 120;
  const second = validatePathObservationEvidence(document, evidence, secondOptions);

  assert.notEqual(first.verification_policy_digest, second.verification_policy_digest);
  assert.notEqual(first.verification_digest, second.verification_digest);
});
