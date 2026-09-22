import assert from 'node:assert/strict';
import test from 'node:test';

import { buildProbe, classifyMemory } from '../../community-testnet-probe.mjs';

const GIB = 1024 ** 3;

test('classifyMemory reports broad non-identifying resource buckets', () => {
  assert.equal(classifyMemory(2 * GIB), '<4GiB');
  assert.equal(classifyMemory(4 * GIB), '4-8GiB');
  assert.equal(classifyMemory(8 * GIB), '8-16GiB');
  assert.equal(classifyMemory(16 * GIB), '16-32GiB');
  assert.equal(classifyMemory(32 * GIB), '32-64GiB');
  assert.equal(classifyMemory(64 * GIB), '>=64GiB');
  assert.equal(classifyMemory(Number.NaN), 'unknown');
});

test('buildProbe binds exact source and exposes only bounded environment data', () => {
  const probe = buildProbe({
    sourceRef: 'a'.repeat(40),
    workingTreeClean: true,
    platformName: 'linux',
    architecture: 'arm64',
    nodeVersion: 'v24.18.0',
    totalMemoryBytes: 8 * GIB
  });

  assert.equal(probe.schema, 'axiom-community-testnet-probe.v0');
  assert.equal(probe.campaign_reference, 'ua-2026-09-22-community-testnet-probe');
  assert.equal(probe.source_ref, 'a'.repeat(40));
  assert.equal(probe.working_tree_clean, true);
  assert.equal(probe.scope, 'community-testnet-environment-only');
  assert.deepEqual(probe.environment, {
    platform: 'linux',
    architecture: 'arm64',
    node_version: 'v24.18.0',
    memory_class: '8-16GiB'
  });
  assert.deepEqual(probe.suggested_lanes, ['T4', 'T5']);
  assert.equal(probe.network_accessed, false);
  assert.equal(probe.telemetry_sent, false);
  assert.equal(probe.authority_granted, false);
  assert.equal(probe.production_certification, false);
  assert.equal(probe.ready_to_submit, true);

  const serialized = JSON.stringify(probe);
  for (const forbidden of [
    'hostname',
    'username',
    'homedir',
    'ip_address',
    'mac_address',
    'environment_variables',
    'credential',
    'serial_number'
  ]) {
    assert.equal(serialized.includes(forbidden), false, `probe must omit ${forbidden}`);
  }
});

test('buildProbe fails closed for dirty or unverifiable source state', () => {
  const dirty = buildProbe({
    sourceRef: 'b'.repeat(40),
    workingTreeClean: false,
    platformName: 'win32',
    architecture: 'x64',
    nodeVersion: 'v24.18.0',
    totalMemoryBytes: 16 * GIB
  });
  assert.equal(dirty.ready_to_submit, false);

  const unknown = buildProbe({
    sourceRef: 'main',
    workingTreeClean: null,
    platformName: 'darwin',
    architecture: 'arm64',
    nodeVersion: 'v24.18.0',
    totalMemoryBytes: 16 * GIB
  });
  assert.equal(unknown.source_ref, null);
  assert.equal(unknown.working_tree_clean, null);
  assert.equal(unknown.ready_to_submit, false);
});
