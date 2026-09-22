import { spawnSync } from 'node:child_process';
import { arch, platform, totalmem } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const GIB = 1024 ** 3;

export function classifyMemory(totalMemoryBytes) {
  if (!Number.isFinite(totalMemoryBytes) || totalMemoryBytes < 0) return 'unknown';
  if (totalMemoryBytes < 4 * GIB) return '<4GiB';
  if (totalMemoryBytes < 8 * GIB) return '4-8GiB';
  if (totalMemoryBytes < 16 * GIB) return '8-16GiB';
  if (totalMemoryBytes < 32 * GIB) return '16-32GiB';
  if (totalMemoryBytes < 64 * GIB) return '32-64GiB';
  return '>=64GiB';
}

export function buildProbe({
  sourceRef,
  workingTreeClean,
  platformName,
  architecture,
  nodeVersion,
  totalMemoryBytes
}) {
  const exactSource = typeof sourceRef === 'string' && /^[0-9a-f]{40}$/u.test(sourceRef)
    ? sourceRef
    : null;
  const clean = workingTreeClean === true ? true : workingTreeClean === false ? false : null;

  return {
    schema: 'axiom-community-testnet-probe.v0',
    campaign_reference: 'ua-2026-09-22-community-testnet-probe',
    source_ref: exactSource,
    working_tree_clean: clean,
    scope: 'community-testnet-environment-only',
    environment: {
      platform: platformName,
      architecture,
      node_version: nodeVersion,
      memory_class: classifyMemory(totalMemoryBytes)
    },
    suggested_lanes: ['T4', 'T5'],
    next_commands: ['npm run doctor', 'npm run setup:check'],
    testnet_contract_url: 'https://github.com/Zoverions/AXIOM-MESH/blob/main/docs/community/COMMUNITY-TESTNET-V0.md',
    result_intake_url: 'https://github.com/Zoverions/AXIOM-MESH/issues/new?template=community-testnet-result.yml',
    network_accessed: false,
    telemetry_sent: false,
    authority_granted: false,
    production_certification: false,
    ready_to_submit: exactSource !== null && clean === true
  };
}

function readSourceState() {
  const refResult = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    windowsHide: true
  });

  if (refResult.error || refResult.status !== 0) {
    return { sourceRef: null, workingTreeClean: null };
  }

  const sourceRef = refResult.stdout.trim();
  if (!/^[0-9a-f]{40}$/u.test(sourceRef)) {
    return { sourceRef: null, workingTreeClean: null };
  }

  const statusResult = spawnSync('git', ['status', '--porcelain=v1', '--untracked-files=all'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    windowsHide: true
  });

  if (statusResult.error || statusResult.status !== 0) {
    return { sourceRef, workingTreeClean: null };
  }

  return {
    sourceRef,
    workingTreeClean: statusResult.stdout.length === 0
  };
}

function main() {
  const sourceState = readSourceState();
  const probe = buildProbe({
    ...sourceState,
    platformName: platform(),
    architecture: arch(),
    nodeVersion: process.version,
    totalMemoryBytes: totalmem()
  });

  process.stdout.write(`${JSON.stringify(probe, null, 2)}\n`);
  process.exitCode = probe.ready_to_submit ? 0 : 1;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
if (invokedPath !== null && invokedPath === fileURLToPath(import.meta.url)) {
  main();
}
