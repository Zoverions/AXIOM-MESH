import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  createMachineIdentityCredential,
  createMachineIdentityRevocation
} from '../src/lib/agent-trust-machine-identity.mjs';
import {
  admitVerifierCandidate,
  collectAdmittedVerifierProfiles,
  compileAdmittedAssuranceWorkOrder
} from '../src/lib/assurance-verifier-candidate.mjs';
import { createAdaptiveAssuranceEvaluator } from '../src/lib/adaptive-assurance.mjs';
import { VERIFIER_PROFILE_SCHEMA } from '../src/lib/verifier-independence.mjs';

const CATALOG = JSON.parse(readFileSync(
  new URL('../config/runtime-provider-catalog.v0.json', import.meta.url),
  'utf8'
));
const RUNTIME = CATALOG.entries.find(
  entry => entry.entry_id === 'runtime:hermes-agent:research'
);
const NOW = '2026-09-01T12:00:00.000Z';

function issuer() {
  return generateKeyPairSync('ed25519');
}

function operational() {
  return generateKeyPairSync('ed25519');
}

function principal(id = 'agent.verifier-candidate') {
  return {
    id,
    type: 'agent',
    sponsor: 'owner.verifier-candidate',
    roles: ['researcher'],
    scopes: ['intent:execute'],
    lifetime: 'session',
    expires_at: '2026-09-03T12:00:00.000Z',
    runtime: {
      id: RUNTIME.subject.subject_id,
      kind: 'local-process',
      software_digest: 'a'.repeat(64)
    },
    constraints: {
      actions: ['system.echo'],
      purposes: ['test.conformance'],
      destinations: ['local'],
      budgets: {
        max_requests_per_minute: 10,
        max_concurrent_requests: 1,
        max_execution_ms: 2_000,
        max_request_bytes: 65_536,
        max_response_bytes: 262_144
      },
      delegation: { allowed: false, max_depth: 0 }
    }
  };
}

function profile(id = 'agent.verifier-candidate') {
  return {
    schema: VERIFIER_PROFILE_SCHEMA,
    verifier_id: id,
    context_digest: 'b'.repeat(64),
    evidence_set_digest: 'c'.repeat(64),
    method_id: 'method.independent-review',
    runtime_id: RUNTIME.subject.subject_id,
    model_family: 'family.unverified',
    operator_domain: 'operator.unverified'
  };
}

function fixture() {
  const issuerPair = issuer();
  const operationalPair = operational();
  const credential = createMachineIdentityCredential({
    principal: principal(),
    issuerId: 'issuer.verifier-candidate',
    issuerPrivateKey: issuerPair.privateKey,
    operationalPublicKey: operationalPair.publicKey,
    keyEpoch: 1,
    issuedAt: '2026-09-01T10:00:00.000Z',
    validFrom: '2026-09-01T10:00:00.000Z',
    expiresAt: '2026-09-02T10:00:00.000Z'
  });
  return { issuerPair, credential };
}

test('candidate broker requires active machine identity and matching runtime catalog pin', () => {
  const { issuerPair, credential } = fixture();
  const admission = admitVerifierCandidate({
    profile: profile(),
    catalogEntry: RUNTIME,
    credentialHistory: [credential],
    trustedIssuerPublicKey: issuerPair.publicKey,
    at: NOW
  });

  assert.equal(admission.identity_currentness, 'active');
  assert.equal(admission.runtime_identity_bound, true);
  assert.equal(admission.runtime_id, RUNTIME.subject.subject_id);
  assert.equal(admission.catalog_presence_grants_authority, false);
  assert.equal(admission.authority_effect, 'none');
  assert.equal(admission.execution_effect, 'none');
  assert.equal(admission.model_family_verified, false);
  assert.equal(admission.operator_domain_verified, false);
});

test('catalog presence alone cannot create a verifier candidate admission', () => {
  const { issuerPair } = fixture();
  assert.throws(
    () => admitVerifierCandidate({
      profile: profile(),
      catalogEntry: RUNTIME,
      credentialHistory: [],
      trustedIssuerPublicKey: issuerPair.publicKey,
      at: NOW
    }),
    /credential history/
  );
});

test('candidate broker rejects runtime substitution and revoked machine identity', () => {
  const { issuerPair, credential } = fixture();
  const substituted = {
    ...profile(),
    runtime_id: 'runtime:openclaw:research'
  };
  assert.throws(
    () => admitVerifierCandidate({
      profile: substituted,
      catalogEntry: RUNTIME,
      credentialHistory: [credential],
      trustedIssuerPublicKey: issuerPair.publicKey,
      at: NOW
    }),
    /runtime_id does not match catalog subject/
  );

  const revocation = createMachineIdentityRevocation({
    credential,
    issuerPrivateKey: issuerPair.privateKey,
    effectiveAt: '2026-09-01T11:00:00.000Z',
    reasonCode: 'compromised'
  });
  assert.throws(
    () => admitVerifierCandidate({
      profile: profile(),
      catalogEntry: RUNTIME,
      credentialHistory: [credential],
      revocations: [revocation],
      trustedIssuerPublicKey: issuerPair.publicKey,
      at: NOW
    }),
    /not active: revoked/
  );
});

test('cloned candidate admission cannot be laundered into the verifier pool', () => {
  const { issuerPair, credential } = fixture();
  const admission = admitVerifierCandidate({
    profile: profile(),
    catalogEntry: RUNTIME,
    credentialHistory: [credential],
    trustedIssuerPublicKey: issuerPair.publicKey,
    at: NOW
  });
  assert.equal(collectAdmittedVerifierProfiles([admission]).length, 1);

  assert.throws(
    () => collectAdmittedVerifierProfiles([{ ...admission }]),
    /only live broker admissions/
  );
});

test('candidate broker rejects self-asserted model-family or operator diversity', () => {
  const { issuerPair, credential } = fixture();
  assert.throws(
    () => admitVerifierCandidate({
      profile: { ...profile(), model_family: 'family.claimed-diverse' },
      catalogEntry: RUNTIME,
      credentialHistory: [credential],
      trustedIssuerPublicKey: issuerPair.publicKey,
      at: NOW
    }),
    /cannot self-assert model_family/
  );
  assert.throws(
    () => admitVerifierCandidate({
      profile: { ...profile(), operator_domain: 'operator.claimed-diverse' },
      catalogEntry: RUNTIME,
      credentialHistory: [credential],
      trustedIssuerPublicKey: issuerPair.publicKey,
      at: NOW
    }),
    /cannot self-assert model_family/
  );
});

test('admitted work-order compiler accepts only admitted origin and reviewer identities', () => {
  const issuerPair = issuer();

  function makeAdmission(id, contextChar, evidenceChar, methodId) {
    const operationalPair = operational();
    const machineCredential = createMachineIdentityCredential({
      principal: principal(id),
      issuerId: 'issuer.verifier-candidate',
      issuerPrivateKey: issuerPair.privateKey,
      operationalPublicKey: operationalPair.publicKey,
      keyEpoch: 1,
      issuedAt: '2026-09-01T10:00:00.000Z',
      validFrom: '2026-09-01T10:00:00.000Z',
      expiresAt: '2026-09-02T10:00:00.000Z'
    });
    return admitVerifierCandidate({
      profile: {
        ...profile(id),
        context_digest: contextChar.repeat(64),
        evidence_set_digest: evidenceChar.repeat(64),
        method_id: methodId
      },
      catalogEntry: RUNTIME,
      credentialHistory: [machineCredential],
      trustedIssuerPublicKey: issuerPair.publicKey,
      at: NOW
    });
  }

  const origin = makeAdmission(
    'agent.verifier-origin',
    '1',
    '2',
    'method.primary'
  );
  const reviewers = [
    makeAdmission('agent.verifier-one', '3', '4', 'method.reconstruct'),
    makeAdmission('agent.verifier-two', '5', '6', 'method.adversarial')
  ];

  const decision = createAdaptiveAssuranceEvaluator({
    randomIntFn: () => 9_999
  })({
    schema: 'axiom-adaptive-assurance-input.v1',
    task_id: 'task.admitted-work-order',
    risk_class: 'high',
    signals: {
      consequence: 90,
      uncertainty: 80,
      irreversibility: 80,
      authority_exposure: 90,
      anomaly: 50,
      provenance_weakness: 60,
      correlation_risk: 70,
      context_integrity_risk: 60
    },
    reputation_score: 50,
    reputation_confidence: 0
  });

  const result = compileAdmittedAssuranceWorkOrder({
    decision,
    originVerifierAdmission: origin,
    verifierCandidateAdmissions: reviewers,
    checkCosts: {
      'independent-context-verification': {
        compute_units: 10,
        external_cost_units: 0,
        elapsed_ms: 100
      },
      'adversarial-review': {
        compute_units: 10,
        external_cost_units: 0,
        elapsed_ms: 100
      },
      'provenance-review': {
        compute_units: 10,
        external_cost_units: 0,
        elapsed_ms: 100
      },
      'correlation-aware-cross-check': {
        compute_units: 10,
        external_cost_units: 0,
        elapsed_ms: 100
      }
    },
    budgetLimits: {
      maxChecks: 8,
      maxComputeUnits: 100,
      maxExternalCostUnits: 10,
      maxElapsedMs: 2_000
    },
    randomIntFn: () => 0
  });

  const allowed = new Set(reviewers.map(item => item.verifier_profile.verifier_id));
  assert.ok(result.assignments.length >= 4);
  assert.ok(result.assignments.every(item => allowed.has(item.verifier_id)));
  assert.equal(
    result.assignments.some(item => item.verifier_id === origin.verifier_profile.verifier_id),
    false
  );

  assert.throws(
    () => compileAdmittedAssuranceWorkOrder({
      decision,
      originVerifierAdmission: { ...origin },
      verifierCandidateAdmissions: reviewers,
      checkCosts: {},
      budgetLimits: {},
      randomIntFn: () => 0
    }),
    /only live broker admissions/
  );
});

test('candidate broker refuses non-runtime catalog entries', () => {
  const provider = CATALOG.entries.find(
    entry => entry.entry_id === 'provider:openai-api'
  );
  const { issuerPair, credential } = fixture();
  assert.throws(
    () => admitVerifierCandidate({
      profile: profile(),
      catalogEntry: provider,
      credentialHistory: [credential],
      trustedIssuerPublicKey: issuerPair.publicKey,
      at: NOW
    }),
    /must bind an agent-runtime/
  );
});
