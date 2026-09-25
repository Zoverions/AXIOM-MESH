import assert from 'node:assert/strict';
import test from 'node:test';

import {
  GOVERNANCE_AUTHORITY_RECORD_SCHEMA,
  GOVERNANCE_ERA_AUTHORITY_PACKAGE_SCHEMA,
  assessGovernanceAuthorityAtEra,
  governanceEraAuthorityDigest,
  validateGovernanceEraAuthorityPackage
} from '../src/lib/governance-era-authority.mjs';
import { digestObject } from '../src/lib/canonical.mjs';

function authority(overrides = {}) {
  return {
    schema: GOVERNANCE_AUTHORITY_RECORD_SCHEMA,
    authority_id: 'founders-council.general-rulemaking',
    holder_id: 'circle.founders-council',
    domain: 'axiom-governance',
    minimum_era: 'founding-stewardship',
    maximum_era: 'founding-stewardship',
    delegable: false,
    execution_binding: false,
    requires_local_authority_evaluation: true,
    authority_effect: 'none',
    runtime_activation: false,
    ...overrides
  };
}

function fixture() {
  return {
    schema: GOVERNANCE_ERA_AUTHORITY_PACKAGE_SCHEMA,
    version: 0,
    status: 'inert-contract-laboratory',
    current_era: 'founding-stewardship',
    transition: {
      candidate_era: 'distributed-settlement',
      schedule_digest: 'a'.repeat(64),
      required_continuous_days: 180,
      observed_continuous_days: 180,
      required_attestations: 2,
      attestation_digests: ['b'.repeat(64), 'c'.repeat(64)],
      challenge_status: 'none',
      gates: [
        {
          gate_id: 'population',
          status: 'satisfied',
          evidence_digest: 'd'.repeat(64)
        },
        {
          gate_id: 'operators',
          status: 'satisfied',
          evidence_digest: 'e'.repeat(64)
        },
        {
          gate_id: 'circles',
          status: 'satisfied',
          evidence_digest: 'f'.repeat(64)
        }
      ]
    },
    authority_records: [
      authority(),
      authority({
        authority_id: 'founders-council.internal-governance',
        domain: 'founders-council',
        maximum_era: null
      })
    ],
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  };
}

test('governance transition is eligible only when every inert evidence gate is satisfied', () => {
  const document = fixture();
  const result = validateGovernanceEraAuthorityPackage(document);

  assert.equal(result.valid, true);
  assert.equal(result.current_era, 'founding-stewardship');
  assert.equal(result.package_digest, digestObject(document));
  assert.equal(governanceEraAuthorityDigest(document), digestObject(document));
  assert.equal(result.transition.candidate_era, 'distributed-settlement');
  assert.equal(result.transition.eligible, true);
  assert.equal(result.transition.reason, 'eligible');
  assert.equal(result.authority_effect, 'none');
  assert.equal(result.runtime_activation, false);
});

test('governance eras can only advance exactly one step and cannot roll back', () => {
  const rollback = fixture();
  rollback.current_era = 'distributed-settlement';
  rollback.transition.candidate_era = 'founding-stewardship';

  assert.throws(
    () => validateGovernanceEraAuthorityPackage(rollback),
    /advance exactly one era/
  );

  const skip = fixture();
  skip.transition.candidate_era = 'polycentric-society';

  assert.throws(
    () => validateGovernanceEraAuthorityPackage(skip),
    /advance exactly one era/
  );
});

test('unknown, disputed, stale, and unsatisfied gates all fail closed', () => {
  for (const status of ['unsatisfied', 'insufficient-evidence', 'disputed', 'stale']) {
    const document = fixture();
    document.transition.gates[1].status = status;
    if (status === 'insufficient-evidence') {
      document.transition.gates[1].evidence_digest = null;
    }

    const result = validateGovernanceEraAuthorityPackage(document);
    assert.equal(result.transition.eligible, false);
    assert.equal(result.transition.reason, `gate-${status}:operators`);
  }
});

test('transition requires continuous duration and attestation threshold', () => {
  const duration = fixture();
  duration.transition.observed_continuous_days = 179;
  let result = validateGovernanceEraAuthorityPackage(duration);
  assert.equal(result.transition.eligible, false);
  assert.equal(result.transition.reason, 'continuous-duration-not-satisfied');

  const attestations = fixture();
  attestations.transition.attestation_digests = ['b'.repeat(64)];
  result = validateGovernanceEraAuthorityPackage(attestations);
  assert.equal(result.transition.eligible, false);
  assert.equal(result.transition.reason, 'attestation-threshold-not-satisfied');
});

test('open or blocking transition challenge prevents eligibility', () => {
  for (const challengeStatus of ['open', 'blocking']) {
    const document = fixture();
    document.transition.challenge_status = challengeStatus;
    const result = validateGovernanceEraAuthorityPackage(document);
    assert.equal(result.transition.eligible, false);
  }

  const cleared = fixture();
  cleared.transition.challenge_status = 'cleared';
  assert.equal(validateGovernanceEraAuthorityPackage(cleared).transition.eligible, true);
});

test('satisfied transition gates require exact evidence digests', () => {
  const document = fixture();
  document.transition.gates[0].evidence_digest = null;

  assert.throws(
    () => validateGovernanceEraAuthorityPackage(document),
    /Satisfied governance transition gate requires evidence/
  );
});

test('terminal polycentric era is representable without an impossible successor', () => {
  const document = fixture();
  document.current_era = 'polycentric-society';
  document.transition = null;

  const result = validateGovernanceEraAuthorityPackage(document);

  assert.equal(result.current_era, 'polycentric-society');
  assert.equal(result.transition, null);
});

test('non-terminal eras cannot omit their required successor transition', () => {
  const document = fixture();
  document.transition = null;

  assert.throws(
    () => validateGovernanceEraAuthorityPackage(document),
    /Only the terminal governance era may omit a transition/
  );
});

test('era-bound authority expires fail-closed after its maximum era', () => {
  const record = authority();

  let result = assessGovernanceAuthorityAtEra(record, 'founding-stewardship');
  assert.equal(result.era_window_satisfied, true);
  assert.equal(result.reason, 'era-window-satisfied');

  result = assessGovernanceAuthorityAtEra(record, 'distributed-settlement');
  assert.equal(result.era_window_satisfied, false);
  assert.equal(result.reason, 'maximum-era-exceeded');
  assert.equal(result.execution_binding, false);
  assert.equal(result.requires_local_authority_evaluation, true);
  assert.equal(result.authority_effect, 'none');
  assert.equal(result.runtime_activation, false);
});

test('authority cannot activate before its minimum era', () => {
  const record = authority({
    authority_id: 'polycentric.standards-participant',
    minimum_era: 'polycentric-society',
    maximum_era: null
  });

  const result = assessGovernanceAuthorityAtEra(record, 'distributed-settlement');
  assert.equal(result.era_window_satisfied, false);
  assert.equal(result.reason, 'minimum-era-not-reached');
});

test('governance authority records can never directly bind execution', () => {
  const document = fixture();
  document.authority_records[0].execution_binding = true;

  assert.throws(
    () => validateGovernanceEraAuthorityPackage(document),
    /authority record is invalid/
  );
});

test('governance transition package rejects activation laundering and duplicate authority IDs', () => {
  const activated = fixture();
  activated.runtime_activation = true;
  assert.throws(
    () => validateGovernanceEraAuthorityPackage(activated),
    /activation boundary/
  );

  const duplicate = fixture();
  duplicate.authority_records[1].authority_id =
    duplicate.authority_records[0].authority_id;
  assert.throws(
    () => validateGovernanceEraAuthorityPackage(duplicate),
    /authority IDs must be unique/
  );
});
