import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  validateAgentInfrastructureChallenge,
  validateAgentInfrastructureOffer,
  validateAgentInfrastructureResult
} from '../src/lib/agent-infrastructure-lab.mjs';

const BASE_SHA = 'a'.repeat(40);
const PROFILE_SHA = 'b'.repeat(64);
const PROHIBITED = [
  'production-node-enrollment',
  'credential-issuance',
  'secret-retrieval',
  'firmware-change',
  'boot-chain-change',
  'disk-erasure',
  'purchase-or-subscription',
  'security-boundary-weakening',
  'unbounded-remote-shell',
  'permanent-system-mutation'
];

function offer(overrides = {}) {
  return {
    schema: 'axiom-agent-infrastructure-offer.v1',
    offer_id: 'offer:macmini:m4:test',
    repository: 'Zoverions/AXIOM-MESH',
    publisher: { type: 'human', id: 'contributor:test' },
    node_profile: {
      schema: 'axiom-compute-node-profile.v1',
      profile_id: 'node:macmini:m4:test',
      profile_sha256: PROFILE_SHA
    },
    custody: {
      physical_control: 'contributor',
      remote_access_available: false
    },
    availability: {
      starts_at: '2026-08-17T18:00:00Z',
      expires_at: '2026-09-17T18:00:00Z',
      maximum_sessions: 4
    },
    challenge_classes: [
      'hardware-validation',
      'infrastructure-diagnostics',
      'device-lab-capacity'
    ],
    evidence: {
      fact_status: 'declared',
      evidence_refs: ['github:issue:test-hardware-offer']
    },
    boundaries: {
      destructive_actions_allowed: false,
      production_enrollment_allowed: false,
      credential_issuance_allowed: false,
      secret_access_allowed: false,
      firmware_changes_allowed: false,
      purchases_allowed: false,
      authority_granted: false,
      payment_promised: false
    },
    ...overrides
  };
}

function challenge(overrides = {}) {
  return {
    schema: 'axiom-agent-infrastructure-challenge.v1',
    challenge_id: 'infra:macos:m4:kernel-reproduction',
    repository: 'Zoverions/AXIOM-MESH',
    base_sha: BASE_SHA,
    class: 'hardware-validation',
    target: {
      offer_id: 'offer:macmini:m4:test',
      node_profile_sha256: PROFILE_SHA
    },
    plan: {
      allowed_operations: [
        'read-system-facts',
        'create-disposable-workspace',
        'install-test-dependencies',
        'run-build',
        'run-tests',
        'collect-sanitized-logs',
        'reset-disposable-workspace'
      ],
      prohibited_operations: [...PROHIBITED],
      network: {
        mode: 'bounded-public-read',
        allowed_origins: ['https://github.com', 'https://registry.npmjs.org'],
        credentials_allowed: false
      }
    },
    acceptance: [
      'Record the exact macOS and architecture facts.',
      'Run the repository kernel check against the exact base revision.'
    ],
    evidence_requirements: [
      'Return sanitized test output and exact source revision.',
      'Retain failures as evidence rather than rewriting them as success.'
    ],
    security_reporting: {
      public_safe: true,
      private_route: 'SECURITY.md'
    },
    boundaries: {
      production_enrollment_allowed: false,
      credential_issuance_allowed: false,
      secret_access_allowed: false,
      firmware_changes_allowed: false,
      purchases_allowed: false,
      destructive_actions_allowed: false,
      authority_granted: false,
      payment_promised: false
    },
    expires_at: '2026-09-01T00:00:00Z',
    ...overrides
  };
}

function result(overrides = {}) {
  return {
    schema: 'axiom-agent-infrastructure-result.v1',
    result_id: 'infra-result:macos:m4:001',
    challenge_id: 'infra:macos:m4:kernel-reproduction',
    offer_id: 'offer:macmini:m4:test',
    repository: 'Zoverions/AXIOM-MESH',
    base_sha: BASE_SHA,
    node_profile_sha256: PROFILE_SHA,
    execution: {
      started_at: '2026-08-18T12:00:00Z',
      completed_at: '2026-08-18T12:10:00Z',
      status: 'passed',
      operations_performed: [
        'read-system-facts',
        'create-disposable-workspace',
        'install-test-dependencies',
        'run-build',
        'run-tests',
        'collect-sanitized-logs',
        'reset-disposable-workspace'
      ]
    },
    evidence: {
      fact_status: 'measured',
      evidence_refs: ['artifact:macos-m4-kernel-check:001'],
      logs_redacted: true,
      secrets_embedded: false,
      private_user_content_embedded: false
    },
    effects: {
      production_enrolled: false,
      credentials_issued: false,
      secrets_accessed: false,
      firmware_changed: false,
      purchase_performed: false,
      destructive_action_performed: false,
      security_boundary_weakened: false,
      authority_granted: false,
      capability_promoted: false
    },
    limitations: [
      'Single contributed physical device; no production-node admission claim.'
    ],
    producer: {
      type: 'joint',
      id: 'producer:test-agent-and-human',
      attestation_ref: 'attestation:infra-result:001',
      verification_status: 'unverified'
    },
    ...overrides
  };
}

test('bounded infrastructure offer, challenge, and result compose without granting authority', () => {
  const offered = offer();
  const work = challenge();
  const observed = result();
  assert.equal(validateAgentInfrastructureOffer(offered).valid, true);
  assert.equal(validateAgentInfrastructureChallenge(work, { offer: offered, expectedBaseSha: BASE_SHA }).valid, true);
  const verified = validateAgentInfrastructureResult(observed, { challenge: work, offer: offered });
  assert.equal(verified.valid, true);
  assert.equal(verified.authority_granted, false);
  assert.equal(verified.capability_promoted, false);
});

test('hardware offer cannot smuggle production enrollment, secret access, or payment', () => {
  for (const key of ['production_enrollment_allowed', 'secret_access_allowed', 'payment_promised']) {
    const candidate = offer();
    candidate.boundaries[key] = true;
    assert.throws(() => validateAgentInfrastructureOffer(candidate), /cannot elevate/);
  }
});

test('hardware offer availability must be forward and bounded', () => {
  const candidate = offer();
  candidate.availability.expires_at = candidate.availability.starts_at;
  assert.throws(() => validateAgentInfrastructureOffer(candidate), /availability is invalid/);
});

test('infrastructure challenge is exact-base and exact-offer bound', () => {
  assert.throws(
    () => validateAgentInfrastructureChallenge(challenge(), { offer: offer(), expectedBaseSha: 'c'.repeat(40) }),
    /stale base SHA/
  );
  const wrongProfile = challenge();
  wrongProfile.target.node_profile_sha256 = 'd'.repeat(64);
  assert.throws(
    () => validateAgentInfrastructureChallenge(wrongProfile, { offer: offer(), expectedBaseSha: BASE_SHA }),
    /does not match the offered hardware scope/
  );
});

test('challenge cannot omit a consequential prohibited operation', () => {
  const candidate = challenge();
  candidate.plan.prohibited_operations = candidate.plan.prohibited_operations.filter(
    item => item !== 'firmware-change'
  );
  assert.throws(
    () => validateAgentInfrastructureChallenge(candidate, { offer: offer(), expectedBaseSha: BASE_SHA }),
    /must prohibit every consequential v1 operation/
  );
});

test('challenge network none mode cannot smuggle origins or credentials', () => {
  const candidate = challenge();
  candidate.plan.network = {
    mode: 'none',
    allowed_origins: ['https://example.invalid'],
    credentials_allowed: false
  };
  assert.throws(() => validateAgentInfrastructureChallenge(candidate), /cannot name origins/);
  const credentialed = challenge();
  credentialed.plan.network.credentials_allowed = true;
  assert.throws(() => validateAgentInfrastructureChallenge(credentialed), /network boundary is invalid/);
});

test('result cannot report an operation outside the exact challenge plan', () => {
  const work = challenge();
  const observed = result();
  observed.execution.operations_performed = ['collect-benchmark-metrics'];
  assert.throws(
    () => validateAgentInfrastructureResult(observed, { challenge: work, offer: offer() }),
    /not authorized by the challenge/
  );
});

test('result cannot claim production, credentials, firmware, destructive effects, or promotion', () => {
  for (const key of [
    'production_enrolled',
    'credentials_issued',
    'firmware_changed',
    'destructive_action_performed',
    'capability_promoted'
  ]) {
    const observed = result();
    observed.effects[key] = true;
    assert.throws(
      () => validateAgentInfrastructureResult(observed, { challenge: challenge(), offer: offer() }),
      /cannot elevate/
    );
  }
});

test('result evidence must be redacted and secret/private-content free', () => {
  const secret = result();
  secret.evidence.secrets_embedded = true;
  assert.throws(() => validateAgentInfrastructureResult(secret), /evidence boundary is invalid/);
  const raw = result();
  raw.evidence.logs_redacted = false;
  assert.throws(() => validateAgentInfrastructureResult(raw), /evidence boundary is invalid/);
});

test('result must bind the exact challenge base, offer, and profile digest', () => {
  const observed = result({ base_sha: 'e'.repeat(40) });
  assert.throws(
    () => validateAgentInfrastructureResult(observed, { challenge: challenge(), offer: offer() }),
    /does not bind the exact challenge/
  );
});

test('infrastructure contracts and architecture preserve the non-authority boundary', async () => {
  const files = [
    ['../../docs/architecture/contracts/agent-infrastructure-offer.v1.schema.json', 'axiom-agent-infrastructure-offer.v1'],
    ['../../docs/architecture/contracts/agent-infrastructure-challenge.v1.schema.json', 'axiom-agent-infrastructure-challenge.v1'],
    ['../../docs/architecture/contracts/agent-infrastructure-result.v1.schema.json', 'axiom-agent-infrastructure-result.v1']
  ];
  for (const [relative, schema] of files) {
    const document = JSON.parse(await readFile(new URL(relative, import.meta.url), 'utf8'));
    assert.equal(document.properties.schema.const, schema);
    assert.match(JSON.stringify(document), /authority_granted/);
  }
  const architecture = await readFile(
    new URL('../../docs/architecture/AGENT-COMMONS-INFRASTRUCTURE-LAB.md', import.meta.url),
    'utf8'
  );
  assert.match(architecture, /A device offer is not node admission/);
  assert.match(architecture, /axiom-compute-node-profile\.v1/);
  assert.match(architecture, /## Apple use case/);
  assert.match(architecture, /does \*\*not\*\* claim a deployed hardware marketplace/);
});
