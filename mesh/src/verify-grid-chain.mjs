#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { canonicalJson, ValidationError } from './lib/canonical.mjs';
import { meshConfig } from './lib/config.mjs';
import { ensureMeshIdentity } from './lib/identity.mjs';
import { loadDataProtector } from './lib/protector.mjs';
import {
  assertGridStopped,
  recoverStaleGridRuntimeLock
} from './grid/backup.mjs';
import { GridStore } from './grid/store.mjs';
import {
  buildGridContinuityAnchor,
  loadClaimBuildContext,
  verifyGridContinuityAnchor
} from './grid/continuity-anchor.mjs';

async function openOfflineGrid(config) {
  await recoverStaleGridRuntimeLock(config.dataDir);
  await assertGridStopped(config.dataDir);
  const identity = await ensureMeshIdentity(config.dataDir, 'grid', { create: false });
  const protector = await loadDataProtector(config);
  const store = new GridStore({
    path: join(config.dataDir, 'grid.sqlite'),
    dataDir: config.dataDir,
    identity,
    protector
  });
  return { identity, store };
}

function externalAnchorPath(path, dataDir) {
  const target = resolve(path);
  const root = resolve(dataDir);
  const relationship = relative(root, target);
  if (
    relationship === ''
    || (!relationship.startsWith('..') && !isAbsolute(relationship))
  ) {
    throw new ValidationError(
      'Continuity anchor must be retained outside AXIOM_DATA_DIR'
    );
  }
  return target;
}

async function readJson(path, name) {
  let parsed;
  try {
    parsed = JSON.parse(await readFile(path, 'utf8'));
  } catch {
    throw new ValidationError(`${name} is not valid JSON`);
  }
  return parsed;
}

export async function runFullChainVerification({ config = meshConfig() } = {}) {
  const { store } = await openOfflineGrid(config);
  try {
    return store.verifyFullChain();
  } finally {
    store.close();
  }
}

export async function createExternalContinuityAnchor({
  exportManifestPath,
  anchorPath,
  config = meshConfig(),
  createdAt = new Date().toISOString()
}) {
  if (!exportManifestPath || !anchorPath) {
    throw new ValidationError('Export manifest path and external anchor path are required');
  }
  const outputPath = externalAnchorPath(anchorPath, config.dataDir);
  const [sourceManifest, buildContext] = await Promise.all([
    readJson(resolve(exportManifestPath), 'Export manifest'),
    loadClaimBuildContext(config.capabilitiesPath)
  ]);
  const { identity, store } = await openOfflineGrid(config);
  try {
    const anchor = buildGridContinuityAnchor({
      store,
      sourceManifest,
      identity,
      buildContext,
      createdAt
    });
    await mkdir(dirname(outputPath), { recursive: true, mode: 0o700 });
    await writeFile(outputPath, `${canonicalJson(anchor)}\n`, {
      mode: 0o600,
      flag: 'wx'
    });
    return {
      valid: true,
      operation: 'anchor-created',
      anchor_path: outputPath,
      anchor_id: anchor.statement.anchor_id,
      anchor_digest: anchor.anchor_digest,
      evidence_seq: anchor.statement.evidence_seq,
      evidence_head: anchor.statement.evidence_head,
      build_context_digest: anchor.statement.build.build_context_digest,
      source_manifest_digest: anchor.statement.context.source_manifest_digest
    };
  } finally {
    store.close();
  }
}

export async function verifyExternalContinuityAnchor({
  anchorPath,
  exportManifestPath,
  config = meshConfig()
}) {
  if (!anchorPath || !exportManifestPath) {
    throw new ValidationError('External anchor path and source export manifest path are required');
  }
  const retainedPath = externalAnchorPath(anchorPath, config.dataDir);
  const [anchor, sourceManifest, buildContext] = await Promise.all([
    readJson(retainedPath, 'Continuity anchor'),
    readJson(resolve(exportManifestPath), 'Export manifest'),
    loadClaimBuildContext(config.capabilitiesPath)
  ]);
  const { store } = await openOfflineGrid(config);
  try {
    return verifyGridContinuityAnchor({
      store,
      anchor,
      sourceManifest,
      expectedBuildContext: buildContext
    });
  } finally {
    store.close();
  }
}

export function verificationHelp() {
  return `AXIOM-MESH Grid verification\n\nUsage:\n  node src/verify-grid-chain.mjs\n  node src/verify-grid-chain.mjs anchor-create <export-manifest.json> <external-anchor.json>\n  node src/verify-grid-chain.mjs anchor-verify <external-anchor.json> <export-manifest.json>\n\nThe external anchor path must be outside AXIOM_DATA_DIR. Anchor verification always performs full genesis chain verification before comparing the retained head.\n`;
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  let result;
  if (command === undefined) {
    result = await runFullChainVerification();
  } else if (command === 'anchor-create') {
    result = await createExternalContinuityAnchor({
      exportManifestPath: args[0],
      anchorPath: args[1]
    });
  } else if (command === 'anchor-verify') {
    result = await verifyExternalContinuityAnchor({
      anchorPath: args[0],
      exportManifestPath: args[1]
    });
  } else if (command === '--help' || command === '-h' || command === 'help') {
    process.stdout.write(verificationHelp());
    return;
  } else {
    throw new ValidationError(`Unknown Grid verification command: ${command}`);
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.valid) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
