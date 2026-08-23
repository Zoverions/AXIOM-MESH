import test from 'node:test';
import assert from 'node:assert/strict';

import { digestObject } from '../src/lib/canonical.mjs';
import {
  STATE_FABRIC_COMMIT_PATH,
  STATE_FABRIC_REQUIRED_VERIFICATION_CHECKS,
  validateStateFabricSimulation
} from '../src/lib/state-fabric-simulation.mjs';

function fixture() {
  const branch = {
    branch_id: 'branch.demo-1',
    owner_principal_id: 'principal.owner-1',
    authority_domain: 'domain.personal',
    source_head_digest: 'a'.repeat(64),
    source_sequence: 42,
    scope: ['object.profile', 'object.preferences'],
    created_at: '2026-08-23T13:00:00Z',
    expires_at: '2026-08-23T14:00:00Z',
    isolation: 'simulation-only',
    external_effects_allowed: false,
    canonical_writes_allowed: false
  };

  const simulation = {
    simulation_id: 'simulation.demo-1',
    engine_id: 'engine.reference',
    engine_version: '0.1.0',
    started_at: '2026-08-23T13:05:00Z',
    completed_at: '2026-08-23T13:10:00Z',
    input_state_digest: branch.source_head_digest,
    steps: [
      {
        step_id: 'step.1',
        operation: 'state.project',
        target_ref: 'object.profile',
        pre_state_digest: branch.source_head_digest,
        post_state_digest: 'b'.repeat(64),
        evidence_refs: ['evidence.profile-policy'],
        effect_class: 'simulated-state-transition',
        actual_external_effect: false
      },
      {
        step_id: 'step.2',
        operation: 'state.project',
        target_ref: 'object.preferences',
        pre_state_digest: 'b'.repeat(64),
        post_state_digest: 'c'.repeat(64),
        evidence_refs: [],
        effect_class: 'simulated-state-transition',
        actual_external_effect: false
      }
    ],
    result_state_digest: 'c'.repeat(64),
    external_effects_performed: false,
    canonical_writes_performed: false
  };

  const simulationDigest = digestObject({ branch, simulation });
  const verification = {
    verification_id: 'verification.demo-1',
    verifier_principal_id: 'principal.verifier-1',
    verified_at: '2026-08-23T13:11:00Z',
    simulation_digest: simulationDigest,
    checks: [...STATE_FABRIC_REQUIRED_VERIFICATION_CHECKS],
    result: 'verified'
  };
  const verificationDigest = digestObject(verification);

  return {
    schema: 'axiom-state-fabric-simulation.v0',
    version: 0,
    status: 'inert-contract-laboratory',
    branch,
    simulation,
    verification,
    commit_candidate: {
      candidate_id: 'candidate.demo-1',
      requested_action: 'state.commit.proposed',
      source_head_digest: branch.source_head_digest,
      source_sequence: branch.source_sequence,
      simulation_digest: simulationDigest,
      verification_digest: verificationDigest,
      result_state_digest: simulation.result_state_digest,
      fresh_authorization_required: true,
      fresh_canonical_head_required: true,
      direct_commit_allowed: false,
      commit_path: STATE_FABRIC_COMMIT_PATH,
      authority_effect: 'none',
      external_effect_performed: false
    },
    authority_effect: 'none',
    network_effect: 'none',
    canonical_state_mutated: false,
    runtime_activation: false
  };
}

function rebuildDigests(document) {
  document.verification.simulation_digest = digestObject({
    branch: document.branch,
    simulation: document.simulation
  });
  document.commit_candidate.simulation_digest = document.verification.simulation_digest;
  document.commit_candidate.verification_digest = digestObject(document.verification);
}

test('accepts an isolated verified simulation while keeping commit non-authorizing', () => {
  const document = fixture();
  const result = validateStateFabricSimulation(document);
  assert.equal(result.valid, true);
  assert.equal(result.authority_effect, 'none');
  assert.equal(result.runtime_activation, false);
  assert.equal(result.direct_commit_allowed, false);
  assert.equal(result.simulation_digest, document.verification.simulation_digest);
});

test('rejects a simulation whose input is not the exact branch source head', () => {
  const document = fixture();
  document.simulation.input_state_digest = 'd'.repeat(64);
  rebuildDigests(document);
  assert.throws(
    () => validateStateFabricSimulation(document),
    /input must bind the branch source head/
  );
});

test('rejects discontinuous simulated state transitions', () => {
  const document = fixture();
  document.simulation.steps[1].pre_state_digest = 'd'.repeat(64);
  rebuildDigests(document);
  assert.throws(
    () => validateStateFabricSimulation(document),
    /does not continue the state chain/
  );
});

test('rejects simulation steps outside the branch scope', () => {
  const document = fixture();
  document.simulation.steps[1].target_ref = 'object.secret-outside-scope';
  rebuildDigests(document);
  assert.throws(
    () => validateStateFabricSimulation(document),
    /targets state outside branch scope/
  );
});

test('rejects external-effect laundering through a simulation step', () => {
  const document = fixture();
  document.simulation.steps[0].actual_external_effect = true;
  rebuildDigests(document);
  assert.throws(
    () => validateStateFabricSimulation(document),
    /attempts an effect outside simulation/
  );
});

test('rejects canonical writes during simulation', () => {
  const document = fixture();
  document.simulation.canonical_writes_performed = true;
  rebuildDigests(document);
  assert.throws(
    () => validateStateFabricSimulation(document),
    /may not perform external effects or canonical writes/
  );
});

test('rejects a verification record that does not bind the exact simulation', () => {
  const document = fixture();
  document.verification.simulation_digest = 'd'.repeat(64);
  document.commit_candidate.verification_digest = digestObject(document.verification);
  assert.throws(
    () => validateStateFabricSimulation(document),
    /verification does not bind the exact simulation/
  );
});

test('requires the complete verification check set', () => {
  const document = fixture();
  document.verification.checks = document.verification.checks.filter(
    item => item !== 'scope-contained'
  );
  document.commit_candidate.verification_digest = digestObject(document.verification);
  assert.throws(
    () => validateStateFabricSimulation(document),
    /complete required check set/
  );
});

test('rejects stale-source laundering in the commit candidate', () => {
  const document = fixture();
  document.commit_candidate.source_head_digest = 'd'.repeat(64);
  assert.throws(
    () => validateStateFabricSimulation(document),
    /not bound to the exact source, simulation, and verification/
  );
});

test('rejects any attempt to make the commit candidate directly executable', () => {
  const document = fixture();
  document.commit_candidate.direct_commit_allowed = true;
  assert.throws(
    () => validateStateFabricSimulation(document),
    /bypass fresh authority or canonical-head checks/
  );
});

test('rejects a commit path that bypasses the mandatory authority path', () => {
  const document = fixture();
  document.commit_candidate.commit_path = 'agent -> database';
  assert.throws(
    () => validateStateFabricSimulation(document),
    /bypass fresh authority or canonical-head checks/
  );
});

test('changing a simulated result changes the bound simulation digest', () => {
  const document = fixture();
  const originalDigest = document.verification.simulation_digest;
  document.simulation.steps[1].post_state_digest = 'd'.repeat(64);
  document.simulation.result_state_digest = 'd'.repeat(64);
  document.commit_candidate.result_state_digest = 'd'.repeat(64);
  rebuildDigests(document);
  const result = validateStateFabricSimulation(document);
  assert.notEqual(result.simulation_digest, originalDigest);
});
