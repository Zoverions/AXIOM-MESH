#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { ValidationError } from './lib/canonical.mjs';

export const HOST_LAB_POLICY_SCHEMA = 'axiom-host-lab-policy.v1';
export const HOST_LAB_POLICY_URL = new URL('../../host/axiom-host-lab-policy.json', import.meta.url);
export const HOST_LAB_MKOSI_URL = new URL('../../host/mkosi.conf', import.meta.url);
export const HOST_LAB_VERSION_URL = new URL('../../host/mkosi.version', import.meta.url);
export const HOST_LAB_SNAPSHOT_URL = new URL('../../host/mkosi.snapshot', import.meta.url);
export const HOST_LAB_SNAPSHOT_UNRESOLVED = 'UNRESOLVED';

const REQUIRED_PACKAGES = Object.freeze([
  'kernel-core',
  'systemd',
  'systemd-udev',
  'systemd-boot',
  'nodejs24',
  'nodejs24-bin',
  'nodejs24-npm',
  'nodejs24-npm-bin',
  'git',
  'ca-certificates'
]);

const FORBIDDEN_MKOSI_KEYS = Object.freeze([
  'RootPassword',
  'Passphrase',
  'SecureBootKey',
  'SecureBootCertificate',
  'VerityKey',
  'VerityCertificate',
  'SignExpectedPcrKey',
  'SignExpectedPcrCertificate',
  'Credentials',
  'SshKey',
  'SshCertificate'
]);

export async function verifyAxiomHostLabConfiguration({
  policyUrl = HOST_LAB_POLICY_URL,
  mkosiUrl = HOST_LAB_MKOSI_URL,
  versionUrl = HOST_LAB_VERSION_URL,
  snapshotUrl = HOST_LAB_SNAPSHOT_URL
} = {}) {
  const [policyText, mkosiText, versionText, snapshotText] = await Promise.all([
    readFile(policyUrl, 'utf8'),
    readFile(mkosiUrl, 'utf8'),
    readFile(versionUrl, 'utf8'),
    readFile(snapshotUrl, 'utf8')
  ]);

  let policy;
  try {
    policy = JSON.parse(policyText);
  } catch {
    throw new ValidationError('AXIOM Host laboratory policy is not valid JSON');
  }

  verifyPolicy(policy);
  const snapshot = normalizeSnapshotLock(snapshotText);
  const mkosi = parseMkosiConfiguration(mkosiText);
  verifyMkosiConfiguration(mkosi, mkosiText, policy, snapshot);

  const version = versionText.trim();
  if (version !== '0.1.0-h0') {
    throw new ValidationError('AXIOM Host H0 image version must remain 0.1.0-h0');
  }

  return {
    valid: true,
    schema: policy.schema,
    stage: policy.stage,
    builder_minimum_version: value(mkosi, 'Config', 'MinimumVersion'),
    target: `${policy.target.distribution}-${policy.target.release}-${policy.target.architecture}`,
    tools_tree: `${policy.tools_tree.distribution}-${policy.tools_tree.release}`,
    tools_tree_mirror: policy.tools_tree.mirror,
    production_base_selected: policy.target.production_base_selected,
    snapshot_locked: snapshot !== HOST_LAB_SNAPSHOT_UNRESOLVED,
    snapshot,
    image_id: value(mkosi, 'Output', 'ImageId'),
    output_directory: value(mkosi, 'Output', 'OutputDirectory'),
    image_version: version,
    packages: splitWords(value(mkosi, 'Content', 'Packages')).length,
    bootloader: value(mkosi, 'Content', 'Bootloader'),
    network: value(mkosi, 'Runtime', 'RuntimeNetwork'),
    virtual_tpm: value(mkosi, 'Runtime', 'TPM') === 'yes',
    production_promoted: false
  };
}

export function normalizeSnapshotLock(text) {
  const snapshot = String(text).trim();
  if (snapshot === HOST_LAB_SNAPSHOT_UNRESOLVED) return snapshot;
  if (!/^[A-Za-z0-9][A-Za-z0-9._:+-]{0,159}$/.test(snapshot)) {
    throw new ValidationError('AXIOM Host Fedora Rawhide snapshot lock has an invalid format');
  }
  if (/^Fedora-Rawhide-/i.test(snapshot)) {
    throw new ValidationError('AXIOM Host Rawhide snapshot lock must use mkosi snapshot identity without Fedora-Rawhide- prefix');
  }
  return snapshot;
}

export function parseMkosiConfiguration(text) {
  const sections = new Map();
  let section = null;
  let priorKey = null;

  for (const [index, rawLine] of String(text).replace(/\r\n?/g, '\n').split('\n').entries()) {
    const lineNumber = index + 1;
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith(';')) continue;

    const sectionMatch = trimmed.match(/^\[([^\]]+)]$/);
    if (sectionMatch) {
      section = sectionMatch[1];
      priorKey = null;
      if (!sections.has(section)) sections.set(section, new Map());
      continue;
    }

    if (!section) {
      throw new ValidationError(`mkosi configuration has content before a section at line ${lineNumber}`);
    }

    const assignment = rawLine.match(/^\s*([A-Za-z][A-Za-z0-9]*)=(.*)$/);
    if (assignment) {
      const [, key, rawValue] = assignment;
      if (sections.get(section).has(key)) {
        throw new ValidationError(`mkosi configuration repeats [${section}] ${key}`);
      }
      sections.get(section).set(key, rawValue.trim());
      priorKey = key;
      continue;
    }

    if (/^\s+\S/.test(rawLine) && priorKey) {
      const prior = sections.get(section).get(priorKey);
      sections.get(section).set(priorKey, `${prior} ${trimmed}`.trim());
      continue;
    }

    throw new ValidationError(`mkosi configuration has an unsupported line ${lineNumber}`);
  }

  return sections;
}

function verifyPolicy(policy) {
  if (!policy || typeof policy !== 'object' || Array.isArray(policy)) {
    throw new ValidationError('AXIOM Host laboratory policy must be an object');
  }
  if (policy.schema !== HOST_LAB_POLICY_SCHEMA) {
    throw new ValidationError('AXIOM Host laboratory policy schema drifted');
  }
  if (policy.status !== 'laboratory-only' || policy.stage !== 'H0') {
    throw new ValidationError('AXIOM Host laboratory policy must remain H0 laboratory-only');
  }
  if (
    policy.builder?.tool !== 'mkosi'
    || policy.builder?.upstream !== 'systemd/mkosi'
    || policy.builder?.minimum_version !== '26'
    || policy.target?.distribution !== 'fedora'
    || policy.target?.release !== 'rawhide'
    || policy.target?.architecture !== 'x86-64'
    || policy.target?.node_major !== 24
    || policy.target?.node_engine_minimum !== '24.14.0'
    || policy.target?.production_base_selected !== false
    || policy.tools_tree?.distribution !== 'fedora'
    || String(policy.tools_tree?.release) !== '43'
    || policy.tools_tree?.mirror !== 'https://dl.fedoraproject.org/pub/fedora'
  ) {
    throw new ValidationError('AXIOM Host laboratory target, tools tree, or builder drifted');
  }
  if (
    policy.package_source?.snapshot_required_before_build !== true
    || policy.package_source?.snapshot_lock_file !== 'mkosi.snapshot'
    || policy.package_source?.snapshot_semantics !== 'mkosi-v26-fedora-rawhide-compose'
    || policy.package_source?.automatic_latest_snapshot_build !== false
  ) {
    throw new ValidationError('AXIOM Host laboratory package-source policy drifted');
  }

  const requiredFalse = [
    ['security.production_credentials_embedded', policy.security?.production_credentials_embedded],
    ['security.secure_boot_claimed', policy.security?.secure_boot_claimed],
    ['security.remote_attestation_claimed', policy.security?.remote_attestation_claimed],
    ['security.host_grants_mesh_authority', policy.security?.host_grants_mesh_authority],
    ['security.cross_owner_private_deduplication', policy.security?.cross_owner_private_deduplication],
    ['security.hard_capacity_depends_on_dedupe', policy.security?.hard_capacity_depends_on_dedupe],
    ['authority.capability_registry_changed', policy.authority?.capability_registry_changed],
    ['authority.production_policy_changed', policy.authority?.production_policy_changed],
    ['authority.node_admission_changed', policy.authority?.node_admission_changed],
    ['authority.scheduler_authority_changed', policy.authority?.scheduler_authority_changed],
    ['authority.remote_execution_promoted', policy.authority?.remote_execution_promoted],
    ['authority.production_host_profile_promoted', policy.authority?.production_host_profile_promoted]
  ];
  for (const [name, current] of requiredFalse) {
    if (current !== false) {
      throw new ValidationError(`AXIOM Host laboratory invariant drifted: ${name} must be false`);
    }
  }

  if (
    policy.image?.format !== 'disk'
    || policy.image?.image_id !== 'axiom-host-lab'
    || policy.image?.output_directory !== 'mkosi.output'
    || policy.image?.bootable !== true
    || policy.image?.bootloader !== 'systemd-boot'
    || policy.image?.unified_kernel_images !== 'unsigned'
    || policy.image?.checksums !== true
    || policy.image?.fixed_partition_seed_required !== true
    || policy.image?.source_date_epoch_from_exact_git_commit !== true
    || !Array.isArray(policy.image?.manifest_formats)
    || policy.image.manifest_formats.join(',') !== 'json,changelog'
  ) {
    throw new ValidationError('AXIOM Host laboratory image policy drifted');
  }

  if (
    policy.runtime?.virtual_machine_monitor !== 'qemu'
    || policy.runtime?.firmware !== 'uefi'
    || policy.runtime?.virtual_tpm !== false
    || policy.runtime?.network !== 'none'
    || policy.runtime?.ephemeral !== true
    || policy.runtime?.cpus !== 2
    || policy.runtime?.ram !== '2G'
    || policy.security?.ssh_enabled !== false
    || policy.security?.autologin_enabled !== false
  ) {
    throw new ValidationError('AXIOM Host laboratory runtime policy drifted');
  }
}

function verifyMkosiConfiguration(config, source, policy, snapshot) {
  const exact = [
    ['Config', 'MinimumVersion', policy.builder.minimum_version],
    ['Distribution', 'Distribution', policy.target.distribution],
    ['Distribution', 'Release', policy.target.release],
    ['Distribution', 'Architecture', policy.target.architecture],
    ['Output', 'Format', policy.image.format],
    ['Output', 'ImageId', policy.image.image_id],
    ['Output', 'OutputDirectory', policy.image.output_directory],
    ['Output', 'ManifestFormat', policy.image.manifest_formats.join(',')],
    ['Output', 'CompressOutput', 'no'],
    ['Content', 'WithDocs', 'no'],
    ['Content', 'Bootable', 'yes'],
    ['Content', 'Bootloader', policy.image.bootloader],
    ['Content', 'UnifiedKernelImages', policy.image.unified_kernel_images],
    ['Content', 'Ssh', 'never'],
    ['Content', 'Autologin', 'no'],
    ['Validation', 'Checksum', 'yes'],
    ['Build', 'ToolsTree', 'yes'],
    ['Build', 'ToolsTreeDistribution', policy.tools_tree.distribution],
    ['Build', 'ToolsTreeRelease', String(policy.tools_tree.release)],
    ['Build', 'ToolsTreeMirror', policy.tools_tree.mirror],
    ['Build', 'WithNetwork', 'no'],
    ['Runtime', 'VirtualMachineMonitor', policy.runtime.virtual_machine_monitor],
    ['Runtime', 'Firmware', policy.runtime.firmware],
    ['Runtime', 'TPM', 'no'],
    ['Runtime', 'RuntimeNetwork', policy.runtime.network],
    ['Runtime', 'Ephemeral', 'yes'],
    ['Runtime', 'CPUs', String(policy.runtime.cpus)],
    ['Runtime', 'RAM', policy.runtime.ram]
  ];

  for (const [section, key, expected] of exact) {
    if (value(config, section, key) !== expected) {
      throw new ValidationError(`mkosi H0 invariant drifted: [${section}] ${key} must equal ${expected}`);
    }
  }

  if (snapshot === HOST_LAB_SNAPSHOT_UNRESOLVED) {
    if (config.get('Distribution')?.has('Snapshot')) {
      throw new ValidationError('mkosi H0 must not declare Snapshot while the snapshot lock is UNRESOLVED');
    }
  } else if (value(config, 'Distribution', 'Snapshot') !== snapshot) {
    throw new ValidationError('mkosi H0 Snapshot must exactly match mkosi.snapshot');
  }

  const seed = value(config, 'Output', 'Seed');
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(seed)) {
    throw new ValidationError('mkosi H0 requires a fixed UUID partition seed');
  }

  const packages = new Set(splitWords(value(config, 'Content', 'Packages')));
  for (const requiredPackage of REQUIRED_PACKAGES) {
    if (!packages.has(requiredPackage)) {
      throw new ValidationError(`mkosi H0 is missing required package ${requiredPackage}`);
    }
  }

  for (const key of FORBIDDEN_MKOSI_KEYS) {
    if (hasKey(config, key)) {
      throw new ValidationError(`mkosi H0 must not contain secret-bearing or remote-access setting ${key}`);
    }
  }

  if (hasKey(config, 'SecureBoot') || hasKey(config, 'SignExpectedPcr')) {
    throw new ValidationError('mkosi H0 must not enable Secure Boot or expected-PCR signing');
  }

  if (/\bAXIOM_DATA_DIR\b/.test(source) || /production[-_ ]?(secret|credential|key)/i.test(source)) {
    throw new ValidationError('mkosi H0 configuration must not reference AXIOM production state or credentials');
  }
}

function value(config, section, key) {
  const current = config.get(section)?.get(key);
  if (current === undefined) {
    throw new ValidationError(`mkosi H0 is missing [${section}] ${key}`);
  }
  return current;
}

function hasKey(config, key) {
  for (const section of config.values()) {
    if (section.has(key)) return true;
  }
  return false;
}

function splitWords(input) {
  return String(input).split(/[\s,]+/).filter(Boolean);
}

async function main() {
  process.stdout.write(`${JSON.stringify(await verifyAxiomHostLabConfiguration())}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
