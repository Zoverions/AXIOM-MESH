#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { canonicalJson, sha256, ValidationError } from './lib/canonical.mjs';
import { HOST_LAB_BUILD_SCHEMA } from './axiom-host-lab.mjs';
import { verifyAxiomHostArtifactInventory } from './axiom-host-artifact-inventory.mjs';
import { HOST_LAB_SECRET_SCAN_SCHEMA } from './axiom-host-secret-scan.mjs';

export const HOST_LAB_COMPARISON_SCHEMA = 'axiom-host-h0-reproducibility-comparison.v1';
const SHA256 = /^[a-f0-9]{64}$/;
const GIT_SHA = /^[a-f0-9]{40}$/;

export function verifyAxiomHostH0BuildEvidence(evidence) {
  if (
    !evidence
    || typeof evidence !== 'object'
    || Array.isArray(evidence)
    || evidence.schema !== HOST_LAB_BUILD_SCHEMA
    || evidence.status !== 'built-not-promoted'
    || !GIT_SHA.test(evidence.source?.revision ?? '')
    || !GIT_SHA.test(evidence.source?.tree ?? '')
    || !Number.isSafeInteger(evidence.source?.source_date_epoch)
    || evidence.source.source_date_epoch <= 0
    || !SHA256.test(evidence.configuration?.policy_sha256 ?? '')
    || !SHA256.test(evidence.configuration?.mkosi_config_sha256 ?? '')
    || !SHA256.test(evidence.configuration?.tools_config_sha256 ?? '')
    || !SHA256.test(evidence.configuration?.repart_definitions_sha256 ?? '')
    || !SHA256.test(evidence.configuration?.snapshot_lock_sha256 ?? '')
    || evidence.configuration?.snapshot_locked !== true
    || typeof evidence.configuration?.snapshot !== 'string'
    || evidence.configuration.snapshot === 'UNRESOLVED'
    || typeof evidence.configuration?.image_version !== 'string'
    || evidence.builder_observation?.summary_validated !== true
    || evidence.builder_observation?.image_built !== true
    || typeof evidence.builder_observation?.mkosi_version !== 'string'
    || evidence.builder_observation.mkosi_version.length < 1
    || !SHA256.test(evidence.builder_observation?.tool_versions_sha256 ?? '')
    || !SHA256.test(evidence.builder_observation?.artifact_set_sha256 ?? '')
  ) {
    throw new ValidationError('AXIOM Host H0 build evidence is invalid');
  }

  verifyAxiomHostArtifactInventory(evidence.builder_observation.artifact_inventory);
  verifyToolVersions(evidence.builder_observation.tool_versions, evidence.builder_observation.tool_versions_sha256);
  const recomputed = sha256(canonicalJson(evidence.builder_observation.artifact_inventory));
  if (recomputed !== evidence.builder_observation.artifact_set_sha256) {
    throw new ValidationError('AXIOM Host H0 artifact-set digest does not match its inventory');
  }
  verifyArtifactMetadata(evidence.builder_observation.artifact_metadata, evidence.builder_observation.artifact_inventory);
  verifySecretScan(evidence.builder_observation.secret_scan, evidence.builder_observation.artifact_inventory);

  const requiredTrue = [
    'linux_host_required',
    'explicit_non_production_acknowledgement',
    'clean_git_worktree_required',
    'exact_commit_bound',
    'source_date_epoch_from_commit',
    'package_snapshot_locked',
    'tools_tree_snapshot_locked',
    'explicit_repart_layout',
    'deterministic_ext4_time',
    'deterministic_ext4_hash_seed',
    'ext4_journal_disabled_for_h0',
    'deterministic_vfat_metadata',
    'volatile_loader_aux_cache_removed',
    'machine_readable_sbom_generated',
    'draft_host_profile_generated',
    'image_and_build_log_secret_scan_passed',
    'exact_builder_tool_versions_recorded',
    'clean_output_directory_required',
    'artifact_bytes_hashed',
    'build_environment_sanitized',
    'builder_home_isolated',
    'builder_workspace_outside_source_tree',
    'implicit_mkosi_secret_files_rejected'
  ];
  for (const key of requiredTrue) {
    if (evidence.controls?.[key] !== true) {
      throw new ValidationError(`AXIOM Host H0 build evidence control must be true: ${key}`);
    }
  }

  const requiredFalse = [
    'production_credentials_forwarded',
    'capability_registry_changed',
    'production_policy_changed',
    'node_admission_changed',
    'scheduler_authority_changed',
    'remote_execution_promoted',
    'production_host_profile_promoted'
  ];
  for (const key of requiredFalse) {
    if (evidence.controls?.[key] !== false) {
      throw new ValidationError(`AXIOM Host H0 build evidence control must be false: ${key}`);
    }
  }

  return true;
}

function verifyArtifactMetadata(metadata, inventory) {
  if (
    !metadata
    || typeof metadata !== 'object'
    || metadata.sbom_name !== 'axiom-host-h0-sbom.cdx.json'
    || metadata.profile_name !== 'axiom-host-profile.h0-draft.json'
    || !Number.isSafeInteger(metadata.package_count)
    || metadata.package_count < 1
    || typeof metadata.kernel_version !== 'string'
    || metadata.kernel_version.length < 1
    || !SHA256.test(metadata.image_sha256 ?? '')
    || !SHA256.test(metadata.uki_sha256 ?? '')
    || !SHA256.test(metadata.kernel_sha256 ?? '')
  ) {
    throw new ValidationError('AXIOM Host H0 artifact metadata observation is invalid');
  }
  const byName = new Map(inventory.map(item => [item.name, item]));
  const raw = inventory.find(item => item.link_target === undefined && item.name.endsWith('.raw'));
  const uki = inventory.find(item => item.link_target === undefined && item.name.endsWith('.efi'));
  const kernel = inventory.find(item => item.link_target === undefined && item.name.endsWith('.vmlinuz'));
  if (
    !byName.has(metadata.sbom_name)
    || !byName.has(metadata.profile_name)
    || raw?.sha256 !== metadata.image_sha256
    || uki?.sha256 !== metadata.uki_sha256
    || kernel?.sha256 !== metadata.kernel_sha256
  ) {
    throw new ValidationError('AXIOM Host H0 artifact metadata does not bind the inventoried image artifacts');
  }
}

function verifySecretScan(scan, inventory) {
  if (
    !scan
    || typeof scan !== 'object'
    || scan.schema !== HOST_LAB_SECRET_SCAN_SCHEMA
    || scan.status !== 'passed'
    || scan.passed !== true
    || !Array.isArray(scan.files)
    || scan.files.length !== 2
    || !Array.isArray(scan.matched_pattern_ids)
    || scan.matched_pattern_ids.length !== 0
    || scan.method?.matched_values_omitted !== true
    || scan.authority?.production_promoted !== false
    || !SHA256.test(scan.scan_sha256 ?? '')
  ) {
    throw new ValidationError('AXIOM Host H0 secret-scan observation is invalid');
  }
  const { scan_sha256: recorded, ...body } = scan;
  if (sha256(canonicalJson(body)) !== recorded) {
    throw new ValidationError('AXIOM Host H0 secret-scan digest does not match its observation');
  }
  const raw = inventory.find(item => item.link_target === undefined && item.name.endsWith('.raw'));
  const rawScan = scan.files.find(item => item.label === raw?.name);
  const logScan = scan.files.find(item => item.label === 'mkosi-build.log');
  if (
    rawScan?.bytes !== raw?.bytes
    || rawScan?.sha256 !== raw?.sha256
    || !Number.isSafeInteger(logScan?.bytes)
    || logScan.bytes < 1
    || !SHA256.test(logScan.sha256 ?? '')
    || rawScan.matched_pattern_ids?.length !== 0
    || logScan.matched_pattern_ids?.length !== 0
  ) {
    throw new ValidationError('AXIOM Host H0 secret scan does not bind the raw image and build log');
  }
}

export function compareAxiomHostH0BuildEvidence(first, second) {
  verifyAxiomHostH0BuildEvidence(first);
  verifyAxiomHostH0BuildEvidence(second);

  const comparableBindings = [
    ['source.revision', first.source.revision, second.source.revision],
    ['source.tree', first.source.tree, second.source.tree],
    ['source.source_date_epoch', first.source.source_date_epoch, second.source.source_date_epoch],
    ['configuration.policy_sha256', first.configuration.policy_sha256, second.configuration.policy_sha256],
    ['configuration.mkosi_config_sha256', first.configuration.mkosi_config_sha256, second.configuration.mkosi_config_sha256],
    ['configuration.tools_config_sha256', first.configuration.tools_config_sha256, second.configuration.tools_config_sha256],
    ['configuration.repart_definitions_sha256', first.configuration.repart_definitions_sha256, second.configuration.repart_definitions_sha256],
    ['configuration.snapshot_lock_sha256', first.configuration.snapshot_lock_sha256, second.configuration.snapshot_lock_sha256],
    ['configuration.snapshot', first.configuration.snapshot, second.configuration.snapshot],
    ['configuration.image_version', first.configuration.image_version, second.configuration.image_version],
    ['builder_observation.mkosi_version', first.builder_observation.mkosi_version, second.builder_observation.mkosi_version],
    ['builder_observation.tool_versions_sha256', first.builder_observation.tool_versions_sha256, second.builder_observation.tool_versions_sha256]
  ];
  const bindingDrift = comparableBindings
    .filter(([, left, right]) => left !== right)
    .map(([field, left, right]) => ({ field, first: left, second: right }));
  if (bindingDrift.length > 0) {
    throw new ValidationError(
      `AXIOM Host H0 builds are not comparable because build bindings drifted: ${bindingDrift.map(item => item.field).join(', ')}`
    );
  }

  const firstArtifacts = new Map(first.builder_observation.artifact_inventory.map(item => [item.name, item]));
  const secondArtifacts = new Map(second.builder_observation.artifact_inventory.map(item => [item.name, item]));
  const names = [...new Set([...firstArtifacts.keys(), ...secondArtifacts.keys()])].sort();
  const differences = [];
  for (const name of names) {
    const left = firstArtifacts.get(name) ?? null;
    const right = secondArtifacts.get(name) ?? null;
    if (!left || !right) {
      differences.push({ name, kind: 'presence', first: left, second: right });
      continue;
    }
    if (left.bytes !== right.bytes || left.sha256 !== right.sha256) {
      differences.push({ name, kind: 'bytes', first: left, second: right });
    }
  }

  const byteIdentical = differences.length === 0
    && first.builder_observation.artifact_set_sha256 === second.builder_observation.artifact_set_sha256;
  const comparison = {
    schema: HOST_LAB_COMPARISON_SCHEMA,
    status: byteIdentical ? 'byte-identical' : 'artifact-drift',
    byte_reproducible: byteIdentical,
    source: {
      revision: first.source.revision,
      tree: first.source.tree,
      source_date_epoch: first.source.source_date_epoch
    },
    configuration: {
      policy_sha256: first.configuration.policy_sha256,
      mkosi_config_sha256: first.configuration.mkosi_config_sha256,
      tools_config_sha256: first.configuration.tools_config_sha256,
      repart_definitions_sha256: first.configuration.repart_definitions_sha256,
      snapshot_lock_sha256: first.configuration.snapshot_lock_sha256,
      snapshot: first.configuration.snapshot,
      image_version: first.configuration.image_version,
      mkosi_version: first.builder_observation.mkosi_version,
      tool_versions_sha256: first.builder_observation.tool_versions_sha256
    },
    artifacts: {
      first_set_sha256: first.builder_observation.artifact_set_sha256,
      second_set_sha256: second.builder_observation.artifact_set_sha256,
      first_count: first.builder_observation.artifact_inventory.length,
      second_count: second.builder_observation.artifact_inventory.length,
      differences
    },
    authority: {
      production_promoted: false,
      capability_registry_changed: false,
      production_policy_changed: false,
      scheduler_authority_changed: false
    },
    interpretation: byteIdentical
      ? 'The two H0 builds produced the same inventoried artifact bytes under the same bound source, configuration, package snapshot, mkosi version, and filesystem-tool versions. This is reproducibility evidence, not production or runtime correctness evidence.'
      : 'The two otherwise comparable H0 builds produced different artifact bytes. The drift must be explained or removed before a byte-reproducibility claim.'
  };
  return {
    ...comparison,
    comparison_sha256: sha256(canonicalJson(comparison))
  };
}

function verifyToolVersions(versions, recordedDigest) {
  const required = ['systemd_repart', 'mkfs_ext4', 'mkfs_vfat', 'mcopy'];
  if (
    !versions
    || typeof versions !== 'object'
    || Array.isArray(versions)
    || Object.keys(versions).sort().join(',') !== [...required].sort().join(',')
    || required.some(key => typeof versions[key] !== 'string' || versions[key].length < 1 || versions[key].length > 4096)
    || sha256(canonicalJson(versions)) !== recordedDigest
  ) {
    throw new ValidationError('AXIOM Host H0 builder tool-version observation is invalid');
  }
}

async function main() {
  const [firstPath, secondPath] = process.argv.slice(2);
  if (!firstPath || !secondPath || process.argv.length !== 4) {
    throw new ValidationError('Usage: axiom-host-lab-compare.mjs <first-evidence.json> <second-evidence.json>');
  }
  const [first, second] = await Promise.all([
    readJson(firstPath),
    readJson(secondPath)
  ]);
  const comparison = compareAxiomHostH0BuildEvidence(first, second);
  process.stdout.write(`${JSON.stringify(comparison)}\n`);
  if (!comparison.byte_reproducible) process.exitCode = 2;
}

async function readJson(path) {
  let parsed;
  try {
    parsed = JSON.parse(await readFile(path, 'utf8'));
  } catch {
    throw new ValidationError(`AXIOM Host H0 comparison input is not valid JSON: ${path}`);
  }
  return parsed;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
