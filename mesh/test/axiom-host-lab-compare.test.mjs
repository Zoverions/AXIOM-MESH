import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalJson, sha256 } from '../src/lib/canonical.mjs';
import {
  compareAxiomHostH0BuildEvidence,
  verifyAxiomHostH0BuildEvidence
} from '../src/axiom-host-lab-compare.mjs';

const BASE_ARTIFACTS = Object.freeze([
  { name: 'axiom-host-h0-sbom.cdx.json', bytes: 256, sha256: 'e'.repeat(64) },
  { name: 'axiom-host-lab.raw', bytes: 1024, sha256: 'a'.repeat(64) },
  { name: 'axiom-host-lab.efi', bytes: 512, sha256: 'c'.repeat(64) },
  { name: 'axiom-host-lab.manifest', bytes: 96, sha256: 'b'.repeat(64) },
  { name: 'axiom-host-lab.vmlinuz', bytes: 384, sha256: 'd'.repeat(64) },
  { name: 'axiom-host-profile.h0-draft.json', bytes: 384, sha256: 'f'.repeat(64) }
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
  changedArtifacts.find(item => item.name.endsWith('.raw')).sha256 = '8'.repeat(64);
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

test('artifact-set or external-workspace control tampering is rejected before comparison', () => {
  const forged = evidence();
  forged.builder_observation.artifact_set_sha256 = 'f'.repeat(64);
  assert.throws(
    () => verifyAxiomHostH0BuildEvidence(forged),
    /artifact-set digest does not match/
  );

  const weakened = evidence();
  weakened.controls.builder_workspace_outside_source_tree = false;
  assert.throws(
    () => verifyAxiomHostH0BuildEvidence(weakened),
    /builder_workspace_outside_source_tree/
  );
});

function evidence({ artifacts = BASE_ARTIFACTS, generatedAt = '2026-08-13T02:00:00.000Z' } = {}) {
  const inventory = artifacts
    .map(item => ({ ...item }))
    .sort((left, right) => left.name.localeCompare(right.name));
  const raw = inventory.find(item => item.name.endsWith('.raw'));
  const uki = inventory.find(item => item.name.endsWith('.efi'));
  const kernel = inventory.find(item => item.name.endsWith('.vmlinuz'));
  const secretScanBody = {
    schema: 'axiom-host-h0-secret-scan.v1',
    status: 'passed',
    passed: true,
    method: {
      encoding: 'byte-preserving-latin1-sliding-window',
      overlap_bytes: 512,
      pattern_ids: ['pem-private-key'],
      matched_values_omitted: true
    },
    files: [
      { label: raw.name, bytes: raw.bytes, sha256: raw.sha256, matched_pattern_ids: [] },
      { label: 'mkosi-build.log', bytes: 128, sha256: '9'.repeat(64), matched_pattern_ids: [] }
    ],
    matched_pattern_ids: [],
    authority: { production_promoted: false }
  };
  const toolVersions = {
    systemd_repart: 'systemd 258 (258.10-1.fcrawhide)',
    mkfs_ext4: 'mke2fs 1.47.2',
    mkfs_vfat: 'mkfs.fat 4.2',
    mcopy: 'mcopy (GNU mtools) 4.0.49'
  };
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
      tools_config_sha256: '6'.repeat(64),
      repart_definitions_sha256: '7'.repeat(64),
      snapshot_lock_sha256: '5'.repeat(64),
      snapshot: '20260813.n.0',
      snapshot_locked: true,
      image_version: '0.1.0-h0'
    },
    builder_observation: {
      mkosi_version: 'mkosi 26',
      tool_versions: toolVersions,
      tool_versions_sha256: sha256(canonicalJson(toolVersions)),
      summary_validated: true,
      image_built: true,
      artifact_metadata: {
        sbom_name: 'axiom-host-h0-sbom.cdx.json',
        profile_name: 'axiom-host-profile.h0-draft.json',
        package_count: 42,
        kernel_version: '6.17.0.x86_64',
        image_sha256: raw.sha256,
        uki_sha256: uki.sha256,
        kernel_sha256: kernel.sha256
      },
      secret_scan: {
        ...secretScanBody,
        scan_sha256: sha256(canonicalJson(secretScanBody))
      },
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
      tools_tree_snapshot_locked: true,
      explicit_repart_layout: true,
      deterministic_ext4_time: true,
      deterministic_ext4_hash_seed: true,
      ext4_journal_disabled_for_h0: true,
      machine_readable_sbom_generated: true,
      draft_host_profile_generated: true,
      image_and_build_log_secret_scan_passed: true,
      exact_builder_tool_versions_recorded: true,
      clean_output_directory_required: true,
      artifact_bytes_hashed: true,
      build_environment_sanitized: true,
      builder_home_isolated: true,
      builder_workspace_outside_source_tree: true,
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
