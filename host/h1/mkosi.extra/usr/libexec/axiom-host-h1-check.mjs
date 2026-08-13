#!/usr/bin/node

import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  mkdirSync,
  openSync,
  closeSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync
} from 'node:fs';

const STATE_ROOT = '/var/lib/axiom-host';
const EVIDENCE_ROOT = `${STATE_ROOT}/evidence`;
const STATE_PATH = `${STATE_ROOT}/state-contract.json`;
const SOURCE_ROOT = '/usr/lib/axiom-mesh';
const IMAGE_VERSION = readText('/usr/lib/axiom-host-image-version');
const AUTHORITY_PATH = readText('/usr/lib/axiom-host-authority-path');

let state;
let sequence = 1;
let scenario = 'initial-boot';
try {
  mkdirSync(`${STATE_ROOT}/home`, { recursive: true, mode: 0o700 });
  mkdirSync(`${STATE_ROOT}/data`, { recursive: true, mode: 0o700 });
  mkdirSync(EVIDENCE_ROOT, { recursive: true, mode: 0o700 });
  const requestedScenario = readText(`${STATE_ROOT}/lab-scenario`, { optional: true });
  if (requestedScenario) scenario = requestedScenario;
  state = readState();
  sequence = state.boots.length + 1;

  const root = findMount('/');
  const mutableState = findMount('/var');
  const uefiRuntimeObserved = directoryExists('/sys/firmware/efi');
  assert(uefiRuntimeObserved, 'UEFI runtime state was not observed');
  assert(root.options.includes('ro'), `root mount is not read-only: ${root.options.join(',')}`);
  assert(!root.options.includes('rw'), `root mount unexpectedly reports rw: ${root.options.join(',')}`);
  assert(mutableState.options.includes('rw'), `/var mount is not writable: ${mutableState.options.join(',')}`);
  assert(root.source !== mutableState.source, '/var is not separate from the system root');

  const verityDevices = observeVerityDevices();
  assert(verityDevices.length > 0, 'no active device-mapper verity device was observed');
  assert(/\/dev\/mapper\//.test(root.source), `root is not backed by a device-mapper path: ${root.source}`);

  const mutation = verifyRootMutationRefused();
  const sourcePackage = verifySourcePackage();
  const setup = runNpm(['run', 'setup:check']);
  const check = runNpm(['run', 'check']);

  const evidence = {
    schema: 'axiom-host-h1-guest-evidence.v1',
    status: 'pass',
    stage: 'H1',
    scenario,
    image_version: IMAGE_VERSION,
    boot_sequence: sequence,
    observed_at: new Date().toISOString(),
    boot: {
      firmware: 'uefi',
      uefi_runtime_observed: uefiRuntimeObserved,
      boot_manager: 'systemd-boot',
      uki: 'unsigned',
      kernel_command_line: readText('/proc/cmdline')
    },
    system_root: {
      ...root,
      runtime_mutability: 'read-only',
      integrity_mode: 'dm-verity',
      verity_devices: verityDevices,
      mutation_probe: mutation
    },
    mutable_state: {
      ...mutableState,
      separate_from_system_root: true,
      axiom_state_path: STATE_ROOT,
      encryption: 'absent'
    },
    checks: {
      source_package: sourcePackage,
      setup_check: summarizeCheck(setup),
      full_check: summarizeCheck(check)
    },
    authority: {
      normal_effect_path: AUTHORITY_PATH,
      host_grants_mesh_authority: false,
      host_grants_node_admission: false,
      host_grants_execution_authority: false
    },
    non_claims: {
      secure_boot: false,
      measured_boot: false,
      remote_attestation: false,
      encrypted_mutable_state: false,
      production_ready: false
    }
  };

  const bootRecord = {
    sequence,
    scenario,
    image_version: IMAGE_VERSION,
    observed_at: evidence.observed_at,
    evidence_sha256: sha256(canonicalJson(evidence))
  };
  state.boots.push(bootRecord);
  writeFileSync(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  writeFileSync(
    `${EVIDENCE_ROOT}/boot-${String(sequence).padStart(4, '0')}.json`,
    `${JSON.stringify(evidence, null, 2)}\n`,
    { mode: 0o600 }
  );
  writeFileSync(`${EVIDENCE_ROOT}/boot-${String(sequence).padStart(4, '0')}-setup.log`, setup.output, { mode: 0o600 });
  writeFileSync(`${EVIDENCE_ROOT}/boot-${String(sequence).padStart(4, '0')}-check.log`, check.output, { mode: 0o600 });
  process.stdout.write(`AXIOM_HOST_H1_PASS ${JSON.stringify({ sequence, scenario, state_id: state.state_id })}\n`);
} catch (error) {
  const failure = {
    schema: 'axiom-host-h1-guest-evidence.v1',
    status: 'fail',
    stage: 'H1',
    scenario,
    image_version: IMAGE_VERSION,
    boot_sequence: sequence,
    observed_at: new Date().toISOString(),
    error: String(error?.stack ?? error).slice(0, 16384),
    authority_changed: false,
    production_promoted: false
  };
  try {
    writeFileSync(
      `${EVIDENCE_ROOT}/boot-${String(sequence).padStart(4, '0')}-failure.json`,
      `${JSON.stringify(failure, null, 2)}\n`,
      { mode: 0o600 }
    );
  } catch {
    // The state partition may itself be unavailable. The console remains evidence.
  }
  process.stderr.write(`AXIOM_HOST_H1_FAIL ${JSON.stringify({ scenario, error: String(error?.message ?? error) })}\n`);
  process.exitCode = 1;
}

function readState() {
  try {
    const current = JSON.parse(readFileSync(STATE_PATH, 'utf8'));
    assert(current.schema === 'axiom-host-h1-state.v1', 'durable state schema drifted');
    assert(typeof current.state_id === 'string' && /^[0-9a-f-]{36}$/.test(current.state_id), 'durable state id is invalid');
    assert(Array.isArray(current.boots), 'durable boot history is invalid');
    return current;
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    return {
      schema: 'axiom-host-h1-state.v1',
      state_id: randomUUID(),
      created_at: new Date().toISOString(),
      boots: []
    };
  }
}

function findMount(target) {
  const output = execFileSync(
    '/usr/bin/findmnt',
    ['--noheadings', '--raw', '--output', 'SOURCE,FSTYPE,OPTIONS', '--target', target],
    { encoding: 'utf8', timeout: 10_000 }
  ).trim();
  const match = output.match(/^(\S+)\s+(\S+)\s+(\S+)$/);
  assert(match, `findmnt returned an invalid record for ${target}`);
  return { target, source: match[1], filesystem: match[2], options: match[3].split(',').sort() };
}

function observeVerityDevices() {
  const root = '/sys/class/block';
  return readdirSync(root)
    .filter(name => /^dm-\d+$/.test(name))
    .map(name => {
      const uuid = readText(`${root}/${name}/dm/uuid`, { optional: true });
      const mapperName = readText(`${root}/${name}/dm/name`, { optional: true });
      return { block_device: name, mapper_name: mapperName, dm_uuid: uuid };
    })
    .filter(item => /verity/i.test(`${item.mapper_name} ${item.dm_uuid}`));
}

function verifyRootMutationRefused() {
  const path = '/usr/.axiom-host-h1-mutation-probe';
  rmSync(path, { force: true });
  try {
    const fd = openSync(path, 'wx', 0o600);
    closeSync(fd);
    rmSync(path, { force: true });
    throw new Error('protected root mutation unexpectedly succeeded');
  } catch (error) {
    if (error?.message === 'protected root mutation unexpectedly succeeded') throw error;
    assert(['EROFS', 'EACCES', 'EPERM'].includes(error?.code), `protected root mutation failed for an unexpected reason: ${error?.code}`);
    return { path, blocked: true, error_code: error.code };
  }
}

function runNpm(args) {
  const started = Date.now();
  const commandArgs = ['--prefix', SOURCE_ROOT, ...args];
  try {
    const output = execFileSync('/usr/bin/npm', commandArgs, {
      cwd: SOURCE_ROOT,
      encoding: 'utf8',
      timeout: 15 * 60 * 1000,
      maxBuffer: 16 * 1024 * 1024,
      env: {
        PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin',
        HOME: `${STATE_ROOT}/home`,
        TMPDIR: '/var/tmp',
        AXIOM_DATA_DIR: `${STATE_ROOT}/data`,
        LANG: 'C.UTF-8',
        LC_ALL: 'C.UTF-8',
        NO_COLOR: '1'
      }
    });
    return { status: 'pass', duration_ms: Date.now() - started, output };
  } catch (error) {
    const output = `${String(error?.stdout ?? '')}\n${String(error?.stderr ?? '')}`;
    throw new Error(`npm ${commandArgs.join(' ')} failed after ${Date.now() - started}ms: ${output.slice(-12000)}`);
  }
}

function verifySourcePackage() {
  const path = `${SOURCE_ROOT}/package.json`;
  const content = readFileSync(path, 'utf8');
  const parsed = JSON.parse(content);
  assert(parsed.name === 'axiom-mesh', 'protected AXIOM source package name is invalid');
  assert(parsed.private === true, 'protected AXIOM source package must remain private');
  return { path, name: parsed.name, version: parsed.version, sha256: sha256(content) };
}

function summarizeCheck(result) {
  return {
    status: result.status,
    duration_ms: result.duration_ms,
    output_bytes: Buffer.byteLength(result.output),
    output_sha256: sha256(result.output)
  };
}

function readText(path, { optional = false } = {}) {
  try {
    return readFileSync(path, 'utf8').trim();
  } catch (error) {
    if (optional && error?.code === 'ENOENT') return '';
    throw error;
  }
}

function directoryExists(path) {
  try {
    return readdirSync(path).length >= 0;
  } catch {
    return false;
  }
}

function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
