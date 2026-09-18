import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import test from 'node:test';

import { digestObject } from '../src/lib/canonical.mjs';
import {
  AMN_TRUST_SCHEMAS,
  AMN_TRUST_SIGNATURE_PROFILE,
  amnTrustKeyId,
  createAmnTrustStatement,
  verifyAmnTrustStatement
} from '../src/lib/amn-trust-evidence.mjs';

function keys() {
  return generateKeyPairSync('ed25519');
}

function hex(label) {
  return digestObject({ label });
}

const issuedAt = '2026-09-18T12:00:00.000Z';
const validFrom = '2026-09-18T12:00:00.000Z';
const validUntil = '2026-09-19T12:00:00.000Z';

function nodeClaims(subjectKey) {
  const publicKey = subjectKey.export({ type: 'spki', format: 'pem' }).toString();
  return {
    node_id: 'node.vendor-a.001',
    trust_domain: 'spiffe://customer.example',
    platform_vendor: 'vendor-a',
    platform_family: 'airframe-alpha',
    identity_method: 'software-key',
    subject_key_id: amnTrustKeyId(subjectKey),
    subject_public_key: publicKey
  };
}

function claimsFor(schema, subjectKey) {
  switch (schema) {
    case AMN_TRUST_SCHEMAS.node_identity:
      return nodeClaims(subjectKey);
    case AMN_TRUST_SCHEMAS.workload_binding:
      return {
        workload_id: 'workload.node-001.edge',
        node_id: 'node.vendor-a.001',
        runtime_instance_id: 'runtime.session-001',
        software_digest: hex('software'),
        configuration_digest: hex('configuration'),
        model_digests: [hex('model-a')],
        identity_method: 'software-runtime'
      };
    case AMN_TRUST_SCHEMAS.configuration_attestation:
      return {
        node_id: 'node.vendor-a.001',
        configuration_id: 'config.node-001.v1',
        configuration_digest: hex('configuration'),
        approved_by: 'customer.assurance',
        approval_policy: 'policy.amn.config.v1',
        valid_from: validFrom,
        valid_until: validUntil,
        calibration_reference_digest: null,
        interface_profiles: ['amn.tracklet.v1', 'tak.adapter.v1']
      };
    case AMN_TRUST_SCHEMAS.software_model_attestation:
      return {
        artifact_type: 'model',
        artifact_id: 'model.detector.v1',
        artifact_digest: hex('model-a'),
        version: '1.0.0',
        publisher: 'vendor-a.software',
        build_provenance_digest: hex('provenance'),
        sbom_digest: null,
        approved_profiles: ['attritable-assurance.v1']
      };
    case AMN_TRUST_SCHEMAS.observation_proof:
      return {
        observation_id: 'obs.001',
        node_id: 'node.vendor-a.001',
        workload_id: 'workload.node-001.edge',
        sensor_id: 'sensor.rgb.001',
        capture_time: issuedAt,
        observation_digest: hex('observation'),
        configuration_digest: hex('configuration'),
        software_digest: hex('software'),
        model_digests: [hex('model-a')],
        coordinate_frame: 'wgs84',
        status_snapshot_digest: hex('status-snapshot'),
        time_uncertainty_ms: 25
      };
    case AMN_TRUST_SCHEMAS.status:
      return {
        subject_id: 'node.vendor-a.001',
        subject_type: 'node',
        status: 'active',
        reason_code: 'operator-confirmed',
        effective_at: issuedAt,
        sequence: 1
      };
    case AMN_TRUST_SCHEMAS.conformance_receipt:
      return {
        test_suite_id: 'suite.cross-vendor.v1',
        test_suite_version: '1.0.0',
        subject_platform: 'node.vendor-a.001',
        software_digest: hex('software'),
        configuration_digest: hex('configuration'),
        adapter_version: 'adapter-a.1.0.0',
        environment_digest: hex('environment'),
        executed_at: issuedAt,
        result: 'pass',
        result_set_digest: hex('results'),
        exceptions: [],
        evidence_bundle_digest: hex('bundle'),
        tester_identity: 'customer.assurance.lab'
      };
    default:
      throw new Error('unsupported fixture schema');
  }
}

test('all seven AMN trust statement classes sign and verify with zero authority semantics', () => {
  const issuer = keys();
  const subject = keys();

  for (const schema of Object.values(AMN_TRUST_SCHEMAS)) {
    const statement = createAmnTrustStatement({
      schema,
      issuerId: 'issuer.customer.assurance',
      issuerPrivateKey: issuer.privateKey,
      issuedAt,
      claims: claimsFor(schema, subject.publicKey)
    });
    const verified = verifyAmnTrustStatement(statement, {
      trustedIssuerPublicKey: issuer.publicKey,
      expectedIssuerId: 'issuer.customer.assurance'
    });

    assert.equal(verified.schema, schema);
    assert.equal(verified.signature_profile, AMN_TRUST_SIGNATURE_PROFILE);
    assert.equal(verified.non_authority.authority_effect, 'none');
    assert.equal(verified.non_authority.delegation_effect, 'none');
    assert.equal(verified.non_authority.truth_claimed, false);
    assert.equal(verified.non_authority.hardware_attestation_claimed, false);
    assert.equal(verified.verification.cryptographic_validity, true);
    assert.equal(verified.verification.authority_effect, 'none');
    assert.match(verified.statement_digest, /^[a-f0-9]{64}$/);
    assert.match(verified.evidence_digest, /^[a-f0-9]{64}$/);
  }
});

test('unknown claim fields fail closed', () => {
  const issuer = keys();
  const subject = keys();
  const claims = nodeClaims(subject.publicKey);
  claims.execution_authority = ['effect.any'];

  assert.throws(
    () => createAmnTrustStatement({
      schema: AMN_TRUST_SCHEMAS.node_identity,
      issuerId: 'issuer.customer.assurance',
      issuerPrivateKey: issuer.privateKey,
      issuedAt,
      claims
    }),
    /unsupported field execution_authority/
  );
});

test('non-authority boundary rejects truth, hardware-attestation and authority widening', () => {
  const issuer = keys();
  const subject = keys();
  const statement = createAmnTrustStatement({
    schema: AMN_TRUST_SCHEMAS.node_identity,
    issuerId: 'issuer.customer.assurance',
    issuerPrivateKey: issuer.privateKey,
    issuedAt,
    claims: nodeClaims(subject.publicKey)
  });

  for (const mutate of [
    value => { value.non_authority.authority_effect = 'execute'; },
    value => { value.non_authority.truth_claimed = true; },
    value => { value.non_authority.hardware_attestation_claimed = true; },
    value => { value.non_authority.global_currentness_claimed = true; }
  ]) {
    const widened = structuredClone(statement);
    mutate(widened);
    assert.throws(
      () => verifyAmnTrustStatement(widened, {
        trustedIssuerPublicKey: issuer.publicKey
      }),
      /widens its non-authority boundary/
    );
  }
});

test('issuer substitution is rejected even when the statement is otherwise intact', () => {
  const issuer = keys();
  const wrongIssuer = keys();
  const subject = keys();
  const statement = createAmnTrustStatement({
    schema: AMN_TRUST_SCHEMAS.node_identity,
    issuerId: 'issuer.customer.assurance',
    issuerPrivateKey: issuer.privateKey,
    issuedAt,
    claims: nodeClaims(subject.publicKey)
  });

  assert.throws(
    () => verifyAmnTrustStatement(statement, {
      trustedIssuerPublicKey: wrongIssuer.publicKey
    }),
    /issuer key substitution/
  );
});

test('claim tampering is rejected by the statement digest before it can be trusted', () => {
  const issuer = keys();
  const subject = keys();
  const statement = createAmnTrustStatement({
    schema: AMN_TRUST_SCHEMAS.observation_proof,
    issuerId: 'issuer.customer.assurance',
    issuerPrivateKey: issuer.privateKey,
    issuedAt,
    claims: claimsFor(AMN_TRUST_SCHEMAS.observation_proof, subject.publicKey)
  });
  const tampered = structuredClone(statement);
  tampered.claims.sensor_id = 'sensor.attacker.001';

  assert.throws(
    () => verifyAmnTrustStatement(tampered, {
      trustedIssuerPublicKey: issuer.publicKey
    }),
    /statement digest mismatch/
  );
});

test('outer evidence digest tampering is rejected after signature verification', () => {
  const issuer = keys();
  const subject = keys();
  const statement = createAmnTrustStatement({
    schema: AMN_TRUST_SCHEMAS.status,
    issuerId: 'issuer.customer.assurance',
    issuerPrivateKey: issuer.privateKey,
    issuedAt,
    claims: claimsFor(AMN_TRUST_SCHEMAS.status, subject.publicKey)
  });
  const tampered = structuredClone(statement);
  tampered.evidence_digest = hex('wrong-outer-digest');

  assert.throws(
    () => verifyAmnTrustStatement(tampered, {
      trustedIssuerPublicKey: issuer.publicKey
    }),
    /evidence_digest mismatch/
  );
});

test('subject binding prevents envelope/claim identity substitution', () => {
  const issuer = keys();
  const subject = keys();
  const statement = createAmnTrustStatement({
    schema: AMN_TRUST_SCHEMAS.workload_binding,
    issuerId: 'issuer.customer.assurance',
    issuerPrivateKey: issuer.privateKey,
    issuedAt,
    claims: claimsFor(AMN_TRUST_SCHEMAS.workload_binding, subject.publicKey)
  });
  const tampered = structuredClone(statement);
  tampered.subject_id = 'workload.attacker';

  assert.throws(
    () => verifyAmnTrustStatement(tampered, {
      trustedIssuerPublicKey: issuer.publicKey
    }),
    /subject_id does not match claims/
  );
});

test('unsupported schema fails closed', () => {
  const issuer = keys();
  const subject = keys();

  assert.throws(
    () => createAmnTrustStatement({
      schema: 'axiom-amn-unknown.v1',
      issuerId: 'issuer.customer.assurance',
      issuerPrivateKey: issuer.privateKey,
      issuedAt,
      claims: nodeClaims(subject.publicKey)
    }),
    /schema is unsupported/
  );
});

test('duplicate model digests fail closed to keep evidence unambiguous', () => {
  const issuer = keys();
  const subject = keys();
  const claims = claimsFor(AMN_TRUST_SCHEMAS.workload_binding, subject.publicKey);
  claims.model_digests = [hex('model-a'), hex('model-a')];

  assert.throws(
    () => createAmnTrustStatement({
      schema: AMN_TRUST_SCHEMAS.workload_binding,
      issuerId: 'issuer.customer.assurance',
      issuerPrivateKey: issuer.privateKey,
      issuedAt,
      claims
    }),
    /must not contain duplicates/
  );
});

test('node key identifier must bind the exact Ed25519 subject key', () => {
  const issuer = keys();
  const subject = keys();
  const claims = nodeClaims(subject.publicKey);
  claims.subject_key_id = hex('wrong-key');

  assert.throws(
    () => createAmnTrustStatement({
      schema: AMN_TRUST_SCHEMAS.node_identity,
      issuerId: 'issuer.customer.assurance',
      issuerPrivateKey: issuer.privateKey,
      issuedAt,
      claims
    }),
    /subject_key_id does not match public key/
  );
});

test('hardware-backed identity method does not become a hardware-attestation claim', () => {
  const issuer = keys();
  const subject = keys();
  const claims = nodeClaims(subject.publicKey);
  claims.identity_method = 'hardware-backed-key';

  const statement = createAmnTrustStatement({
    schema: AMN_TRUST_SCHEMAS.node_identity,
    issuerId: 'issuer.customer.assurance',
    issuerPrivateKey: issuer.privateKey,
    issuedAt,
    claims
  });
  const verified = verifyAmnTrustStatement(statement, {
    trustedIssuerPublicKey: issuer.publicKey
  });

  assert.equal(verified.claims.identity_method, 'hardware-backed-key');
  assert.equal(verified.non_authority.hardware_attestation_claimed, false);
  assert.equal(verified.verification.hardware_attestation_claimed, false);
});
