#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { ValidationError } from './lib/canonical.mjs';
import { parseMkosiConfiguration } from './check-axiom-host-lab.mjs';

const H1_ROOT = new URL('../../host/h1/', import.meta.url);
const FILES = Object.freeze({
  policy: new URL('axiom-host-h1-policy.json', H1_ROOT),
  config: new URL('mkosi.conf', H1_ROOT),
  tools: new URL('mkosi.tools.conf', H1_ROOT),
  snapshot: new URL('mkosi.snapshot', H1_ROOT),
  version: new URL('mkosi.version', H1_ROOT),
  esp: new URL('mkosi.repart/00-esp.conf', H1_ROOT),
  root: new URL('mkosi.repart/10-root.conf', H1_ROOT),
  verity: new URL('mkosi.repart/20-root-verity.conf', H1_ROOT),
  state: new URL('mkosi.repart/30-var.conf', H1_ROOT),
  finalize: new URL('mkosi.finalize', H1_ROOT),
  unit: new URL('mkosi.extra/usr/lib/systemd/system/axiom-host-h1-check.service', H1_ROOT),
  fstab: new URL('mkosi.extra/etc/fstab', H1_ROOT),
  guestCheck: new URL('mkosi.extra/usr/libexec/axiom-host-h1-check.mjs', H1_ROOT)
});

const REQUIRED_PACKAGES = Object.freeze([
  'kernel-core',
  'systemd',
  'systemd-udev',
  'systemd-boot',
  'device-mapper',
  'cryptsetup-libs',
  'util-linux-core',
  'dbus-broker',
  'nodejs24',
  'nodejs24-bin',
  'nodejs24-npm',
  'nodejs24-npm-bin',
  'git',
  'ca-certificates'
]);

const FORBIDDEN_KEYS = Object.freeze([
  'RootPassword',
  'Passphrase',
  'SecureBoot',
  'SecureBootKey',
  'SecureBootCertificate',
  'VerityKey',
  'VerityCertificate',
  'SignExpectedPcr',
  'SignExpectedPcrKey',
  'Credentials',
  'SshKey',
  'SshCertificate'
]);

export async function verifyAxiomHostH1Configuration(urls = FILES) {
  const entries = await Promise.all(
    Object.entries(urls).map(async ([name, url]) => [name, await readFile(url, 'utf8')])
  );
  const source = Object.fromEntries(entries);
  let policy;
  try {
    policy = JSON.parse(source.policy);
  } catch {
    throw new ValidationError('AXIOM Host H1 policy is not valid JSON');
  }
  verifyPolicy(policy);

  const snapshot = source.snapshot.trim();
  const version = source.version.trim();
  exact(snapshot, '20260813.n.0', 'snapshot lock');
  exact(version, '0.2.0-h1', 'image version');

  const config = parseMkosiConfiguration(source.config);
  const tools = parseMkosiConfiguration(source.tools);
  const expectedConfig = [
    ['Config', 'MinimumVersion', '26'],
    ['Distribution', 'Distribution', 'fedora'],
    ['Distribution', 'Release', 'rawhide'],
    ['Distribution', 'Snapshot', snapshot],
    ['Distribution', 'Architecture', 'x86-64'],
    ['Output', 'Format', 'disk'],
    ['Output', 'ImageId', 'axiom-host-h1'],
    ['Output', 'OutputDirectory', 'mkosi.output'],
    ['Content', 'Bootable', 'yes'],
    ['Content', 'Bootloader', 'systemd-boot'],
    ['Content', 'UnifiedKernelImages', 'unsigned'],
    ['Content', 'Ssh', 'never'],
    ['Content', 'Autologin', 'no'],
    ['Validation', 'Checksum', 'yes'],
    ['Validation', 'Verity', 'hash'],
    ['Build', 'BuildSources', '${AXIOM_HOST_SOURCE_TREE}'],
    ['Build', 'ToolsTree', 'yes'],
    ['Build', 'WithNetwork', 'no'],
    ['Runtime', 'Firmware', 'uefi'],
    ['Runtime', 'TPM', 'no'],
    ['Runtime', 'RuntimeNetwork', 'none'],
    ['Runtime', 'Ephemeral', 'no']
  ];
  for (const [section, key, expected] of expectedConfig) {
    exact(value(config, section, key), expected, `[${section}] ${key}`);
  }
  exact(value(tools, 'Distribution', 'Snapshot'), snapshot, 'tools-tree snapshot');
  const toolsPackages = words(value(tools, 'Content', 'Packages'));
  for (const name of ['git', 'tar', 'coreutils']) {
    requireValue(toolsPackages.includes(name), `tools tree is missing ${name}`);
  }
  const packages = words(value(config, 'Content', 'Packages'));
  for (const name of REQUIRED_PACKAGES) {
    requireValue(packages.includes(name), `H1 image package set is missing ${name}`);
  }
  for (const key of FORBIDDEN_KEYS) {
    requireValue(!hasKey(config, key), `H1 mkosi configuration contains forbidden setting ${key}`);
  }
  requireValue(!hasKey(config, 'FinalizeScripts'), 'must use exactly one auto-discovered finalize script');
  requireValue(!/production[-_ ]?(secret|credential|key)/i.test(source.config), 'H1 configuration references production credentials');
  requireValue(/console=ttyS0/.test(value(config, 'Content', 'KernelCommandLine')), 'H1 kernel command line must expose the laboratory serial console');

  const esp = parseRepart(source.esp, '00-esp.conf');
  const root = parseRepart(source.root, '10-root.conf');
  const verity = parseRepart(source.verity, '20-root-verity.conf');
  const state = parseRepart(source.state, '30-var.conf');
  repartExact(esp, 'Type', 'esp', 'ESP');
  repartExact(esp, 'Format', 'vfat', 'ESP');
  repartExact(esp, 'ReadOnly', 'yes', 'ESP');
  repartExact(root, 'Type', 'root', 'root');
  repartExact(root, 'Format', 'ext4', 'root');
  repartExact(root, 'ReadOnly', 'yes', 'root');
  repartExact(root, 'Verity', 'data', 'root');
  repartExact(root, 'VerityMatchKey', 'root', 'root');
  requireValue(root.get('ExcludeFilesTarget')?.includes('/var/'), 'protected root must exclude mutable /var contents');
  repartExact(verity, 'Type', 'root-verity', 'root verity');
  repartExact(verity, 'Verity', 'hash', 'root verity');
  repartExact(verity, 'VerityMatchKey', 'root', 'root verity');
  repartExact(state, 'Type', 'var', 'mutable state');
  repartExact(state, 'Format', 'ext4', 'mutable state');
  repartExact(state, 'CopyFiles', '/var:/', 'mutable state');
  repartExact(state, 'ReadOnly', 'no', 'mutable state');

  for (const required of [
    '#!/bin/bash',
    'set -euo pipefail',
    'test -f "$SRCDIR/package.json"',
    'tar --directory="$SRCDIR" --create --file=-',
    '--sort=name',
    '--mtime="@$SOURCE_DATE_EPOCH" .',
    '$BUILDROOT/usr/lib/axiom-mesh',
    'test -f "$BUILDROOT/usr/lib/axiom-mesh/package.json"',
    'Gateway -> Hypervisor -> Sandbox -> Grid',
    'enable axiom-host-h1-check.service',
    'mask systemd-boot-random-seed.service'
  ]) {
    requireValue(source.finalize.includes(required), `H1 finalize script is missing ${required}`);
  }
  for (const required of [
    'After=local-fs.target',
    'RequiresMountsFor=/var',
    'FailureAction=poweroff-force',
    'WorkingDirectory=/usr/lib/axiom-mesh',
    'AXIOM_DATA_DIR=/var/lib/axiom-host/data',
    'ExecStart=/usr/bin/node /usr/libexec/axiom-host-h1-check.mjs',
    'TimeoutStartSec=20min',
    'WantedBy=multi-user.target'
  ]) {
    requireValue(source.unit.includes(required), `H1 systemd unit is missing ${required}`);
  }
  exact(source.fstab.trim(), [
    '/dev/disk/by-partlabel/esp /boot vfat ro,nosuid,nodev,noexec,noauto,x-systemd.automount 0 0',
    '/dev/disk/by-partlabel/var /var ext4 rw,nosuid,nodev 0 2'
  ].join('\n'), 'immutable boot and mutable state mount declarations');
  for (const required of [
    "findMount('/')",
    "findMount('/boot')",
    "findMount('/var')",
    "['--json', '--output', 'TARGET,SOURCE,FSTYPE,OPTIONS', '--mountpoint', target]",
    'flattenMounts(JSON.parse(output).filesystems)',
    "record.target === target && record.fstype !== 'autofs'",
    "runNpm(['run', 'setup:check'])",
    "runNpm(['run', 'check'])",
    "const commandArgs = ['--prefix', SOURCE_ROOT, ...args]",
    'verifySourcePackage()',
    "integrity_mode: 'dm-verity'",
    'host_grants_mesh_authority: false',
    'AXIOM_HOST_H1_PASS'
  ]) {
    requireValue(source.guestCheck.includes(required), `H1 guest verifier is missing ${required}`);
  }

  return {
    valid: true,
    schema: policy.schema,
    status: policy.status,
    stage: policy.stage,
    issue: policy.issue,
    image_id: value(config, 'Output', 'ImageId'),
    image_version: version,
    snapshot,
    firmware: 'uefi',
    boot_artifact: 'systemd-boot-with-unsigned-uki',
    root: 'read-only-ext4-dm-verity',
    durable_state: 'separate-ext4-var',
    guest_checks: [...policy.required_guest_checks],
    authority_path: policy.authority.normal_effect_path,
    production_promoted: false
  };
}

function verifyPolicy(policy) {
  exact(policy?.schema, 'axiom-host-h1-lab-policy.v1', 'policy schema');
  exact(policy?.status, 'laboratory-only', 'policy status');
  exact(policy?.stage, 'H1', 'policy stage');
  exact(policy?.issue, 1053, 'issue binding');
  exact(policy?.appliance?.root_integrity, 'dm-verity', 'root integrity policy');
  exact(policy?.appliance?.boot_artifact, 'systemd-boot-with-unsigned-uki', 'boot artifact policy');
  exact(policy?.appliance?.source_staging, 'git-archive-exact-head', 'source staging policy');
  exact(policy?.appliance?.boot_partition_runtime_mutability, 'read-only', 'boot partition mutability policy');
  exact(policy?.appliance?.root_runtime_mutability, 'read-only', 'root mutability policy');
  exact(policy?.appliance?.axiom_state_path, '/var/lib/axiom-host', 'AXIOM state path');
  exact(policy?.appliance?.state_encryption, 'absent', 'H1 state encryption non-claim');
  exact(policy?.authority?.normal_effect_path, 'Gateway -> Hypervisor -> Sandbox -> Grid', 'authority path');
  for (const key of [
    'host_grants_mesh_authority',
    'host_grants_node_admission',
    'host_grants_execution_authority',
    'capability_registry_changed',
    'production_policy_changed',
    'scheduler_authority_changed'
  ]) {
    exact(policy?.authority?.[key], false, `authority.${key}`);
  }
  exact(policy?.capacity?.hard_capacity_independent_of_dedupe, true, 'capacity independence');
  exact(policy?.capacity?.cross_owner_private_dedupe, false, 'private dedupe policy');
}

function parseRepart(text, name) {
  const result = new Map();
  let section = false;
  for (const [index, raw] of String(text).replace(/\r\n?/g, '\n').split('\n').entries()) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || line.startsWith(';')) continue;
    if (line === '[Partition]') {
      requireValue(!section, `${name} repeats [Partition]`);
      section = true;
      continue;
    }
    requireValue(section, `${name} has content outside [Partition] at line ${index + 1}`);
    const assignment = line.match(/^([A-Za-z][A-Za-z0-9]*)=(.*)$/);
    requireValue(assignment, `${name} has an invalid assignment at line ${index + 1}`);
    const current = result.get(assignment[1]) ?? [];
    current.push(assignment[2].trim());
    result.set(assignment[1], current);
  }
  requireValue(section, `${name} is missing [Partition]`);
  return result;
}

function repartExact(config, key, expected, name) {
  const values = config.get(key);
  requireValue(values?.length === 1, `${name} must contain exactly one ${key}`);
  exact(values[0], expected, `${name} ${key}`);
}

function value(config, section, key) {
  const current = config.get(section)?.get(key);
  if (current === undefined) throw new ValidationError(`H1 mkosi configuration is missing [${section}] ${key}`);
  return current;
}

function hasKey(config, key) {
  return [...config.values()].some(section => section.has(key));
}

function words(value) {
  return String(value).split(/[\s,]+/).filter(Boolean);
}

function exact(current, expected, name) {
  if (current !== expected) throw new ValidationError(`AXIOM Host H1 ${name} must equal ${expected}`);
}

function requireValue(condition, message) {
  if (!condition) throw new ValidationError(`AXIOM Host H1 ${message}`);
}

async function main() {
  process.stdout.write(`${JSON.stringify(await verifyAxiomHostH1Configuration())}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
