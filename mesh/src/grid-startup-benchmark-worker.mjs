#!/usr/bin/env node

// Opens one Grid in an isolated process so that wall time and peak RSS describe
// exactly one startup. `mode` selects which startup path is measured:
//   anchored — normal restart; the materialization anchor is present and valid
//   rebuild  — the anchor is discarded first, forcing full genesis re-derivation

import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { ensureMeshIdentity } from './lib/identity.mjs';
import { loadDataProtector } from './lib/protector.mjs';
import { GridStore } from './grid/store.mjs';

async function main() {
  const [mode, dataDir, checkpointIntervalRaw] = process.argv.slice(2);
  if (!['anchored', 'rebuild'].includes(mode) || typeof dataDir !== 'string') {
    throw new Error('Usage: grid-startup-benchmark-worker.mjs anchored|rebuild <data-dir> [interval]');
  }
  const path = join(dataDir, 'grid.sqlite');
  if (mode === 'rebuild') {
    const db = new DatabaseSync(path);
    db.prepare("DELETE FROM meta WHERE key = 'materialization_anchor_v1'").run();
    db.prepare("DELETE FROM meta WHERE key = 'protected_column_format_v1'").run();
    db.close();
  }
  const identity = await ensureMeshIdentity(dataDir, 'grid', { create: false });
  const protector = await loadDataProtector({ dataDir, autoBootstrap: false });
  const startedAt = performance.now();
  const store = new GridStore({
    path,
    dataDir,
    identity,
    protector,
    checkpointInterval: Number(checkpointIntervalRaw ?? 10_000),
    materializationAnchor: 'sealed'
  });
  const durationMs = Math.round((performance.now() - startedAt) * 1000) / 1000;
  const materialization = store.materializationStartup;
  const protectedColumns = store.protectedColumnStartup;
  const events = store.currentEventSeq();
  const stateDigest = store.materializedStateDigest();
  store.close();
  const usage = process.resourceUsage();
  process.stdout.write(`${JSON.stringify({
    mode,
    events,
    materialization,
    protected_columns: protectedColumns,
    materialized_state_digest: stateDigest,
    wall_time_ms: durationMs,
    process_max_rss_kib: usage.maxRSS,
    user_cpu_ms: Math.round(usage.userCPUTime / 1000),
    system_cpu_ms: Math.round(usage.systemCPUTime / 1000)
  })}\n`);
}

await main();
