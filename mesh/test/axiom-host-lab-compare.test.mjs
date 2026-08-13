import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalJson, sha256 } from '../src/lib/canonical.mjs';
import {
  compareAxiomHostH0BuildEvidence,
  verifyAxiomHostH0BuildEvidence
} from '../src/axiom-host-lab-compare.mjs';

const BASE_ARTIFACTS = Object.freeze([
  { name: 'axiom-host-lab.raw', bytes: 1024, sha256: 'a'.repeat(64) },
  { name: 'axiom-host-lab.raw.sha256', bytes: 96, sha256: 'b'.repeat(64) }
]);

test('two identically bound H0 builds can prove byte reproducibility', () => {
  const first = evidence();
  const second = evidence({ generatedAt: '2026-08-13T03:00:00.000Z' });
  assert.equal(verifyAxiomHostH0BuildEvidence(first), true);
  const comparison = compareAxiomHostH0BuildEvidence(first, second);
  assert.equal(comparison.status, 'byte-identical');
  assert.equal(comparison.byte_reproducible, true);
  assert.deepEqual(comparison.artifacts.differences, []);
  assert.match(comparison.comparison_sha256, /^[a-f0-9]{64}$/);
  assert.equal(comparison.authority.production_promoted, false);
});

test('artifact drift is reported without promoting a failed reproducibility result', () => {
  const first = evidence();
  const changedArtifacts = BASE_ARTIFACTS.map(item => ({ ...item }));
  changedArtifacts[0].sha256 = 'c'.repeat(64);
  const second = evidence({ artifacts: changedArtifacts });
  const comparison = compareAxiomHostH0BuildEvidence(first, second);
  assert.equal(comparison.status, 'artifact-drift');
  assert.equal(comparison.byte_reproducible, false);
  assert.equal(comparison.artifacts.differences.length, 1);
  assert.equal(comparison.artifacts.differences[0].name, 'axiom-host-lab.raw');
  assert.equal(comparison.authority.production_promoted, false);
});

test('source, configuration, snapshot, or builder drift makes H0 builds non-comparable', () => {
  const first = evidence();
  const second = evidence();
  second.source.tree = '9'.repeat(40);
  assert.throws(
    () => compareAxiomHostH0BuildEvidence(first, second),
    /build bindings drifted: source.tree/
  );

  const third = evidence();
  third.builder_observation.mkosi_version = 'mkosi 27';
  assert.throws(
    () => compareAxiomHostH0BuildEvidence(first, third),
    /builder_observation.mkosi_version/
  );
});

test('artifact-set digest tampering is rejected before comparison', () => {
  const forged = evidence();
  forged.builder_observation.artifact_set_sha256 = 'f'.repeat(64);
  assert.throws(
    () => verifyAxiomHostH0BuildEvidence(forged),
    /artifact-set digest does not match/
  );
});

function evidence({ artifacts = BASE_ARTIFACTS, generatedAt = '2026-08-13T02:00:00.000Z' } = {}) {
  const inventory = artifacts.map(item => ({ ...item }));
  return {
    schema: 'axiom-host-h0-build-evidence.v1',
    status: 'built-not-promoted',
    generated_at: generatedAt,
    source: {
      revision: '1'.repeat(40),
      tree: '2'.repeat(40),
      source_date_epoch: 1_786_500_000
    },
    configuration: {
      policy_sha256: '3'.repeat(64),
      mkosi_config_sha256: '4'.repeat(64),
      snapshot_lock_sha256: '5'.repeat(64),
      snapshot: 'fedora-43-20260812T000000Z',
      snapshot_locked: true,
      image_version: '0.1.0-h0'
    },
    builder_observation: {
      mkosi_version: 'mkosi 26',
      summary_validated: true,
      image_built: true,
      artifact_inventory: inventory,
      artifact_set_sha256: sha256(canonicalJson(inventory))
    },
    controls: {
      linux_host_required: true,
      explicit_non_production_acknowledgement: true,
      clean_git_worktree_required: true,
      exact_commit_bound: true,
      source_date_epoch_from_commit: true,
      package_snapshot_locked: true,
      clean_output_directory_required: true,
      artifact_bytes_hashed: true,
      build_environment_sanitized: true,
      builder_home_isolated: true,
      implicit_mkosi_secret_files_rejected: true,
      production_credentials_forwarded: false,
      capability_registry_changed: false,
      production_policy_changed: false,
      node_admission_changed: false,
      scheduler_authority_changed: false,
      remote_execution_promoted: false,
      production_host_profile_promoted: false
    },
    limitations: []
  };
}
