#!/usr/bin/env node

import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { meshConfig } from './lib/config.mjs';
import { ensureMeshIdentity } from './lib/identity.mjs';
import { loadDataProtector } from './lib/protector.mjs';
import {
  assertGridStopped,
  recoverStaleGridRuntimeLock
} from './grid/backup.mjs';
import { GridStore } from './grid/store.mjs';

export async function runFullChainVerification({ config = meshConfig() } = {}) {
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
  try {
    return store.verifyFullChain();
  } finally {
    store.close();
  }
}

async function main() {
  const result = await runFullChainVerification();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.valid) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
