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
  MEASUREMENT_SOURCE_KINDS,
  SOURCE_KIND_BY_EVIDENCE_KIND,
  SOURCE_RECORDER_ROLE_BY_KIND,
  validateMeasurementSourceEnvelopes
} from '../src/lib/measurement-source-envelope.mjs';
import {
  FAILURE_DOMAIN_DIMENSIONS,
  validateResilientPathFabric
} from '../src/lib/resilient-path-fabric.mjs';

const EVALUATED_AT = '2026-08-23T14:00:00.000Z';
const EVIDENCE_OBSERVED_AT = '2026-08-23T13:59:30.000Z';
const EVIDENCE_VALID_UNTIL = '2026-08-23T14:05:00.000Z';
const SOURCE_STARTED_AT = '2026-08-23T13:59:20.000Z';
const SOURCE_COMPLETED_AT = '2026-08-23T13:59:25.000Z';

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

function evidenceSignerFixture() {
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

function sourceRecorderFixture() {
  const trustedSourceRecorders = {};
  const privateKeys = new Map();
  for (const [sourceKind, role] of Object.entries(SOURCE_RECORDER_ROLE_BY_KIND)) {
    const recorderId = `recorder.${sourceKind}`;
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    trustedSourceRecorders[recorderId] = {
      public_key: publicKey.export({ type: 'spki', format: 'pem' }),
      roles: [role]
    };
    privateKeys.set(recorderId, privateKey);
  }
  return { trustedSourceRecorders, privateKeys };
}

function evidenceFreshnessFixture() {
  return Object.fromEntries(PATH_OBSERVATION_KINDS.map(kind => [kind, 300]));
}

function sourcePolicyFixture(value) {
  return Object.fromEntries(MEASUREMENT_SOURCE_KINDS.map(kind => [kind, value]));
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
  throw new Error(`Unsupported evidence kind ${kind}`);
}

function signRecord(statement, privateKey) {
  return {
    statement,
    signature: sign(null, Buffer.from(canonicalJson(statement)), privateKey).toString('base64url')
  };
}

function evidenceFixture(document, signers) {
  const records = [];
  let sequence = 0;
  const portfolioDigest = validateResilientPathFabric(document).portfolio_digest;
  const append = (kind, subjectId) => {
    sequence += 1;
    const signerId = `signer.${kind}`;
    const statement = {
      schema: 'axiom-path-observation-statement.v0',
      portfolio_digest: portfolioDigest,
      evidence_id: `evidence.${sequence}`,
      kind,
      subject_id: subjectId,
      observed_at: EVIDENCE_OBSERVED_AT,
      valid_until: EVIDENCE_VALID_UNTIL,
      source_ref: `source.${kind}.${sequence}`,
      source_digest: sha256(`artifact:${kind}:${subjectId}:${sequence}`),
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

function evidenceValidationOptions(signers) {
  return {
    trustedSigners: signers.trustedSigners,
    evaluatedAt: EVALUATED_AT,
    maxAgeSecondsByKind: evidenceFreshnessFixture()
  };
}

function fullValidationOptions(signers, recorders) {
  return {
    ...evidenceValidationOptions(signers),
    trustedSourceRecorders: recorders.trustedSourceRecorders,
    maxSourceAgeSecondsByKind: sourcePolicyFixture(300),
    maxClaimLagSecondsByKind: sourcePolicyFixture(60),
    maxClockUncertaintyMsByKind: sourcePolicyFixture(1000)
  };
}

function sourceEnvelopeForStatement(statement) {
  const sourceKind = SOURCE_KIND_BY_EVIDENCE_KIND[statement.kind];
  const latency = statement.kind === 'link-latency'
    ? statement.claims.observed_latency_ms
    : null;
  return {
    schema: 'axiom-measurement-source-envelope.v0',
    source_ref: statement.source_ref,
    artifact_sha256: statement.source_digest,
    source_kind: sourceKind,
    source_recorder_id: `recorder.${sourceKind}`,
    capture: {
      started_at: SOURCE_STARTED_AT,
      completed_at: SOURCE_COMPLETED_AT,
      clock_source: 'fixture-clock',
      clock_uncertainty_ms: 100
    },
    method: {
      method_id: `${sourceKind}.fixture`,
      method_version: '1.0.0',
      implementation_sha256: sha256(`implementation:${sourceKind}`),
      configuration_sha256: sha256(`configuration:${sourceKind}`),
      environment_sha256: sha256(`environment:${sourceKind}`)
    },
    artifact: {
      content_type: 'application/json',
      byte_length: 128,
      retention_status: 'retained-local',
      raw_artifact_included: false
    },
    result: {
      result_kind: statement.kind === 'link-latency' ? 'numeric' : 'structured',
      normalized_result_sha256: sha256(`normalized:${statement.evidence_id}`),
      uncertainty: statement.kind === 'link-latency'
        ? {
            kind: 'interval',
            unit: 'ms',
            lower_bound: latency - 1,
            upper_bound: latency + 1,
            confidence: 0.95
          }
        : {
            kind: 'unknown',
            unit: null,
            lower_bound: null,
            upper_bound: null,
            confidence: null
          }
    },
    supports_evidence_ids: [statement.evidence_id],
    reproduction: {
      status: 'not-attempted',
      independent_reproduction_verified: false
    },
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  };
}

function signSourceEnvelope(envelope, privateKey) {
  return {
    envelope,
    signature: sign(null, Buffer.from(canonicalJson(envelope)), privateKey).toString('base64url')
  };
}

function sourcePackageFixture(document, evidence, signers, recorders) {
  const evidenceVerification = validatePathObservationEvidence(
    document,
    evidence,
    evidenceValidationOptions(signers)
  );
  const bySourceRef = new Map();
  for (const record of evidence.evidence_records) {
    const statement = record.statement;
    let envelope = bySourceRef.get(statement.source_ref);
    if (!envelope) {
      envelope = sourceEnvelopeForStatement(statement);
      bySourceRef.set(statement.source_ref, envelope);
    } else {
      envelope.supports_evidence_ids.push(statement.evidence_id);
    }
  }

  const envelopes = [...bySourceRef.values()].map(envelope => {
    const privateKey = recorders.privateKeys.get(envelope.source_recorder_id);
    return signSourceEnvelope(envelope, privateKey);
  });

  return {
    schema: 'axiom-measurement-source-envelopes.v0',
    version: 0,
    status: 'inert-source-evidence-laboratory',
    portfolio_digest: evidenceVerification.portfolio_digest,
    evidence_verification_digest: evidenceVerification.verification_digest,
    envelopes,
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  };
}

function findEvidence(evidence, kind, subjectId) {
  return evidence.evidence_records.find(record =>
    record.statement.kind === kind && record.statement.subject_id === subjectId
  );
}

function findSource(sourcePackage, sourceRef) {
  return sourcePackage.envelopes.find(record => record.envelope.source_ref === sourceRef);
}

function resignEvidence(record, signers) {
  Object.assign(
    record,
    signRecord(record.statement, signers.privateKeys.get(record.statement.signer_id))
  );
}

function resignSource(record, recorders) {
  Object.assign(
    record,
    signSourceEnvelope(record.envelope, recorders.privateKeys.get(record.envelope.source_recorder_id))
  );
}

function fixture() {
  const document = pathFabricFixture();
  const signers = evidenceSignerFixture();
  const recorders = sourceRecorderFixture();
  const evidence = evidenceFixture(document, signers);
  const sourcePackage = sourcePackageFixture(document, evidence, signers, recorders);
  const options = fullValidationOptions(signers, recorders);
  return { document, signers, recorders, evidence, sourcePackage, options };
}

test('verifies complete source provenance without claiming measurement truth or authority', () => {
  const { document, evidence, sourcePackage, options } = fixture();
  const result = validateMeasurementSourceEnvelopes(document, evidence, sourcePackage, options);

  assert.equal(result.valid, true);
  assert.equal(result.evidence_signatures_verified, true);
  assert.equal(result.source_signatures_verified, true);
  assert.equal(result.source_coverage_complete, true);
  assert.equal(result.method_identity_bound, true);
  assert.equal(result.artifact_digests_bound, true);
  assert.equal(result.clock_uncertainty_bound, true);
  assert.equal(result.source_freshness_satisfied, true);
  assert.equal(result.claim_lag_satisfied, true);
  assert.equal(result.independent_reproduction_verified, false);
  assert.equal(result.measurement_accuracy_established, false);
  assert.equal(result.truth_established, false);
  assert.equal(result.authority_effect, 'none');
  assert.equal(result.network_effect, 'none');
  assert.equal(result.runtime_activation, false);
  assert.equal(result.live_routing_changed, false);
  assert.equal(result.radio_control_performed, false);
  assert.equal(result.source_count, 28);
});

test('rejects substitution of the evidence verification digest', () => {
  const { document, evidence, sourcePackage, options } = fixture();
  sourcePackage.evidence_verification_digest = 'f'.repeat(64);
  assert.throws(
    () => validateMeasurementSourceEnvelopes(document, evidence, sourcePackage, options),
    /does not bind the exact evidence verification/
  );
});

test('rejects source artifact digest substitution', () => {
  const { document, evidence, sourcePackage, options } = fixture();
  sourcePackage.envelopes[0].envelope.artifact_sha256 = 'e'.repeat(64);
  assert.throws(
    () => validateMeasurementSourceEnvelopes(document, evidence, sourcePackage, options),
    /does not bind the evidence source artifact digest/
  );
});

test('rejects an untrusted source recorder', () => {
  const { document, evidence, sourcePackage, options } = fixture();
  const record = sourcePackage.envelopes[0];
  const { privateKey } = generateKeyPairSync('ed25519');
  record.envelope.source_recorder_id = 'recorder.untrusted';
  Object.assign(record, signSourceEnvelope(record.envelope, privateKey));
  assert.throws(
    () => validateMeasurementSourceEnvelopes(document, evidence, sourcePackage, options),
    /is not in the evaluator trust set/
  );
});

test('rejects a trusted source recorder used outside its role', () => {
  const { document, evidence, sourcePackage, options, recorders } = fixture();
  const statement = findEvidence(evidence, 'link-regulatory', 'link.primary-1').statement;
  const record = findSource(sourcePackage, statement.source_ref);
  record.envelope.source_recorder_id = 'recorder.latency-measurement';
  Object.assign(
    record,
    signSourceEnvelope(record.envelope, recorders.privateKeys.get('recorder.latency-measurement'))
  );
  assert.throws(
    () => validateMeasurementSourceEnvelopes(document, evidence, sourcePackage, options),
    /is not trusted for required role regulatory-source-recorder/
  );
});

test('rejects signed method identity tampering', () => {
  const { document, evidence, sourcePackage, options } = fixture();
  sourcePackage.envelopes[0].envelope.method.environment_sha256 = 'd'.repeat(64);
  assert.throws(
    () => validateMeasurementSourceEnvelopes(document, evidence, sourcePackage, options),
    /signature is invalid/
  );
});

test('requires complete source coverage', () => {
  const { document, evidence, sourcePackage, options } = fixture();
  sourcePackage.envelopes.pop();
  assert.throws(
    () => validateMeasurementSourceEnvelopes(document, evidence, sourcePackage, options),
    /source coverage is incomplete/i
  );
});

test('rejects duplicate source envelopes', () => {
  const { document, evidence, sourcePackage, options } = fixture();
  sourcePackage.envelopes.push(structuredClone(sourcePackage.envelopes[0]));
  assert.throws(
    () => validateMeasurementSourceEnvelopes(document, evidence, sourcePackage, options),
    /is duplicated/
  );
});

test('requires the exact evidence support set for each source', () => {
  const { document, evidence, sourcePackage, options, recorders } = fixture();
  const record = sourcePackage.envelopes[0];
  record.envelope.supports_evidence_ids = ['evidence.999'];
  resignSource(record, recorders);
  assert.throws(
    () => validateMeasurementSourceEnvelopes(document, evidence, sourcePackage, options),
    /does not bind the exact evidence support set/
  );
});

test('rejects source data that is stale even when the signed claim is fresh', () => {
  const { document, evidence, sourcePackage, options, recorders } = fixture();
  const record = sourcePackage.envelopes[0];
  record.envelope.capture.started_at = '2026-08-23T13:40:00.000Z';
  record.envelope.capture.completed_at = '2026-08-23T13:40:05.000Z';
  resignSource(record, recorders);
  assert.throws(
    () => validateMeasurementSourceEnvelopes(document, evidence, sourcePackage, options),
    /exceeds the configured source freshness limit/
  );
});

test('rejects excessive measurement-to-claim lag', () => {
  const { document, evidence, sourcePackage, options, recorders } = fixture();
  const record = sourcePackage.envelopes[0];
  record.envelope.capture.started_at = '2026-08-23T13:57:50.000Z';
  record.envelope.capture.completed_at = '2026-08-23T13:58:00.000Z';
  resignSource(record, recorders);
  assert.throws(
    () => validateMeasurementSourceEnvelopes(document, evidence, sourcePackage, options),
    /exceeds the configured source-to-claim lag limit/
  );
});

test('rejects source clock uncertainty above evaluator policy', () => {
  const { document, evidence, sourcePackage, options, recorders } = fixture();
  const record = sourcePackage.envelopes[0];
  record.envelope.capture.clock_uncertainty_ms = 2000;
  resignSource(record, recorders);
  assert.throws(
    () => validateMeasurementSourceEnvelopes(document, evidence, sourcePackage, options),
    /exceeds the configured clock uncertainty limit/
  );
});

test('rejects evidence timestamped before the source was definitely complete', () => {
  const { document, evidence, sourcePackage, options, recorders } = fixture();
  const record = sourcePackage.envelopes[0];
  record.envelope.capture.started_at = '2026-08-23T13:59:35.000Z';
  record.envelope.capture.completed_at = '2026-08-23T13:59:40.000Z';
  resignSource(record, recorders);
  assert.throws(
    () => validateMeasurementSourceEnvelopes(document, evidence, sourcePackage, options),
    /predates definite completion/
  );
});

test('rejects a source that may be future-dated under declared clock uncertainty', () => {
  const { document, evidence, sourcePackage, options, recorders } = fixture();
  const record = sourcePackage.envelopes[0];
  record.envelope.capture.started_at = '2026-08-23T13:59:58.000Z';
  record.envelope.capture.completed_at = '2026-08-23T13:59:59.500Z';
  record.envelope.capture.clock_uncertainty_ms = 1000;
  resignSource(record, recorders);
  assert.throws(
    () => validateMeasurementSourceEnvelopes(document, evidence, sourcePackage, options),
    /may be future-dated under its clock uncertainty/
  );
});

test('does not permit reproduction-status laundering into verified reproduction', () => {
  const { document, evidence, sourcePackage, options, recorders } = fixture();
  const record = sourcePackage.envelopes[0];
  record.envelope.reproduction = {
    status: 'reported-reproduced',
    independent_reproduction_verified: true
  };
  resignSource(record, recorders);
  assert.throws(
    () => validateMeasurementSourceEnvelopes(document, evidence, sourcePackage, options),
    /cannot claim independently verified reproduction in v0/
  );
});

test('rejects raw artifact embedding in the source envelope package', () => {
  const { document, evidence, sourcePackage, options, recorders } = fixture();
  const record = sourcePackage.envelopes[0];
  record.envelope.artifact.raw_artifact_included = true;
  resignSource(record, recorders);
  assert.throws(
    () => validateMeasurementSourceEnvelopes(document, evidence, sourcePackage, options),
    /must not embed the raw artifact in v0/
  );
});

test('rejects invalid numeric uncertainty bounds', () => {
  const { document, evidence, sourcePackage, options, recorders } = fixture();
  const statement = findEvidence(evidence, 'link-latency', 'link.primary-1').statement;
  const record = findSource(sourcePackage, statement.source_ref);
  record.envelope.result.uncertainty.lower_bound = 12;
  record.envelope.result.uncertainty.upper_bound = 4;
  resignSource(record, recorders);
  assert.throws(
    () => validateMeasurementSourceEnvelopes(document, evidence, sourcePackage, options),
    /uncertainty interval is invalid/
  );
});

test('rejects attempts to turn source evidence into authority or network effects', () => {
  const { document, evidence, sourcePackage, options } = fixture();
  sourcePackage.authority_effect = 'grant';
  assert.throws(
    () => validateMeasurementSourceEnvelopes(document, evidence, sourcePackage, options),
    /activation boundary is invalid/
  );
});

test('rejects heterogeneous evidence kinds sharing one source in v0', () => {
  const { document, signers, recorders } = fixture();
  const evidence = evidenceFixture(document, signers);
  const first = findEvidence(evidence, 'link-profile', 'link.primary-1');
  const second = findEvidence(evidence, 'link-latency', 'link.primary-1');
  second.statement.source_ref = first.statement.source_ref;
  second.statement.source_digest = first.statement.source_digest;
  resignEvidence(second, signers);
  const sourcePackage = sourcePackageFixture(document, evidence, signers, recorders);
  assert.throws(
    () => validateMeasurementSourceEnvelopes(
      document,
      evidence,
      sourcePackage,
      fullValidationOptions(signers, recorders)
    ),
    /does not permit heterogeneous evidence kinds/
  );
});

test('verification digest changes with evaluator source policy', () => {
  const { document, evidence, sourcePackage, options } = fixture();
  const first = validateMeasurementSourceEnvelopes(document, evidence, sourcePackage, options);
  const secondOptions = structuredClone(options);
  secondOptions.maxSourceAgeSecondsByKind['latency-measurement'] = 240;
  const second = validateMeasurementSourceEnvelopes(document, evidence, sourcePackage, secondOptions);
  assert.notEqual(first.source_verification_policy_digest, second.source_verification_policy_digest);
  assert.notEqual(first.source_verification_digest, second.source_verification_digest);
});
