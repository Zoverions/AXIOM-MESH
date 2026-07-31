#!/usr/bin/env node

import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { ensureMeshIdentity } from './lib/identity.mjs';
import { loadDataProtector } from './lib/protector.mjs';
import {
  GridStore,
  loadGridVerificationKeys
} from './grid/store.mjs';

async function main() {
  const [mode, dataDir] = process.argv.slice(2);
  if (!['checkpoint', 'full'].includes(mode) || typeof dataDir !== 'string') {
    throw new Error('Usage: chain-verification-benchmark-worker.mjs checkpoint|full <data-dir>');
  }
  const identity = await ensureMeshIdentity(dataDir, 'grid', { create: false });
  const protector = await loadDataProtector({ dataDir, autoBootstrap: false });
  const db = new DatabaseSync(join(dataDir, 'grid.sqlite'), { readOnly: true });
  const store = Object.create(GridStore.prototype);
  Object.assign(store, {
    db,
    dataDir,
    identity,
    protector,
    verificationKeys: loadGridVerificationKeys(dataDir, identity)
  });
  const rssBefore = process.memoryUsage().rss;
  const startedAt = performance.now();
  const verification = mode === 'full'
    ? GridStore.prototype.verifyFullChain.call(store)
    : GridStore.prototype.verifyChain.call(store);
  const durationMs = Math.round((performance.now() - startedAt) * 1000) / 1000;
  const rssAfter = process.memoryUsage().rss;
  const usage = process.resourceUsage();
  db.close();
  process.stdout.write(`${JSON.stringify({
    mode,
    verification,
    wall_time_ms: durationMs,
    rss_before_bytes: rssBefore,
    rss_after_bytes: rssAfter,
    process_max_rss_kib: usage.maxRSS,
    user_cpu_ms: Math.round(usage.userCPUTime / 1000),
    system_cpu_ms: Math.round(usage.systemCPUTime / 1000)
  })}\n`);
}

await main();
