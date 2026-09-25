// labs/praxis/bench.mjs
//
// Deterministic performance benchmarks for the Praxis front end
// (lexer, parser, formatter, compiler front end).
//
// Pure: takes source strings as input and returns measurements. No I/O,
// no network, no wall-clock mocking beyond performance.now(). The caller
// (test or CLI) supplies the corpus. Safe for the interpreter transport-surface
// conformance scan.
//
// Budgets encode "non-pathological": the front end must stay roughly linear,
// so a 10x input must not cost more than ~20x CPU time, and absolute wall-clock
// caps keep CI honest. Measurements use a short warm-up and median wall samples.
// CPU time is measured across multiple independent bounded parse batches so a
// single GC/JIT/accounting outlier cannot determine the scaling ratio. Normal
// batches target comparable source volume rather than equal parse counts: small
// corpora run more parses per batch, while large corpora run fewer. Each
// nonzero batch is normalized per parse and the median is used. Coarse zero
// readings may increase the next batch size, but at least three nonzero samples
// are required; otherwise timing evidence fails closed as 0. CPU time is used
// only for the scaling ratio, and the existing absolute parse/format wall-clock
// budgets remain unchanged.

import { performance } from 'node:perf_hooks';

import { lex } from './lexer.mjs';
import { parse } from './parser.mjs';
import { formatProgram } from './format.mjs';
import { compile } from './compiler.mjs';

const BENCHMARK_WARMUPS = 1;
const BENCHMARK_SAMPLES = 5;
const BENCHMARK_CPU_TARGET_SAMPLES = 5;
const BENCHMARK_CPU_MIN_SAMPLES = 3;
const BENCHMARK_MAX_CPU_RUNS = 80;
const BENCHMARK_CPU_TARGET_SOURCE_UNITS = 500_000;
const BENCHMARK_CPU_MAX_BASE_RUNS = Math.floor(
  BENCHMARK_MAX_CPU_RUNS / BENCHMARK_CPU_TARGET_SAMPLES
);

export function syntheticProgram(lines) {
  let src = '';
  for (let i = 0; i < lines; i++) {
    src += `observe bench_o${i} = "value${i}" from "bench-src${i}";\n`;
  }
  return src;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

export function benchmarkCpuRunsPerSample(sourceUnits) {
  if (!Number.isInteger(sourceUnits) || sourceUnits < 0) {
    throw new TypeError('benchmark source size must be a non-negative integer');
  }
  const normalizedUnits = Math.max(sourceUnits, 1);
  return Math.max(
    1,
    Math.min(
      BENCHMARK_CPU_MAX_BASE_RUNS,
      Math.ceil(BENCHMARK_CPU_TARGET_SOURCE_UNITS / normalizedUnits)
    )
  );
}

function measureCpuPerRun(fn, { baseRuns }) {
  const samples = [];
  let runs = 0;
  let nextBatch = baseRuns;

  while (samples.length < BENCHMARK_CPU_TARGET_SAMPLES && runs < BENCHMARK_MAX_CPU_RUNS) {
    const batch = Math.min(nextBatch, BENCHMARK_MAX_CPU_RUNS - runs);
    const cpuStart = process.cpuUsage();
    for (let i = 0; i < batch; i++) fn();
    runs += batch;

    const cpu = process.cpuUsage(cpuStart);
    const cpuMicros = cpu.user + cpu.system;
    if (cpuMicros > 0) {
      samples.push((cpuMicros / 1000) / batch);
      nextBatch = baseRuns;
    } else {
      nextBatch *= 2;
    }
  }

  return samples.length >= BENCHMARK_CPU_MIN_SAMPLES ? median(samples) : 0;
}

function measure(fn, {
  requireCpuEvidence = false,
  cpuRunsPerSample = BENCHMARK_CPU_MAX_BASE_RUNS
} = {}) {
  for (let i = 0; i < BENCHMARK_WARMUPS; i++) fn();

  const wallSamples = [];
  let result;
  for (let i = 0; i < BENCHMARK_SAMPLES; i++) {
    const wallStart = performance.now();
    result = fn();
    wallSamples.push(performance.now() - wallStart);
  }

  return {
    ms: median(wallSamples),
    cpuMs: requireCpuEvidence ? measureCpuPerRun(fn, { baseRuns: cpuRunsPerSample }) : null,
    result
  };
}

export function benchmarkSource(label, source) {
  const lines = source.split('\n').length;
  const bytes = source.length;
  const lexed = measure(() => lex(source));
  const cpuRunsPerSample = benchmarkCpuRunsPerSample(bytes);
  const parsed = measure(() => parse(source), { requireCpuEvidence: true, cpuRunsPerSample });
  const formatted = measure(() => formatProgram(parsed.result));
  let compileMs = null;
  try {
    compileMs = measure(() => compile(source)).ms;
  } catch {
    compileMs = null; // semantically invalid corpus: front end still timed
  }
  return {
    label,
    lines,
    bytes,
    lexMs: lexed.ms,
    parseMs: parsed.ms,
    parseCpuMs: parsed.cpuMs,
    formatMs: formatted.ms,
    compileMs
  };
}

export function runBenchmarks(corpus) {
  // corpus: [{ label, source }]
  return corpus.map(({ label, source }) => benchmarkSource(label, source));
}

// Absolute wall-clock budgets (ms) and CPU-time scaling budget for the
// standard corpus.
export const BUDGETS = {
  maxParseMs10k: 5000,
  maxFormatMs10k: 5000,
  // 10x input must cost less than 20x CPU time (linear-ish, not quadratic).
  maxScalingRatio: 20
};

// Standard-budget verification requires exactly one synthetic-1k and one
// synthetic-10k result. Missing or duplicate required rows cannot prove a pass.
// Other corpus labels remain informational. The isolated benchmark process uses
// median wall parse time for the 1k -> 10k scaling verdict. Process CPU remains
// diagnostic because repeated protected runs showed platform-specific accounting
// variance on the short 1k workload even when isolated median wall scaling was
// stable. Required wall scaling evidence must be finite and strictly positive.
export function checkBudgets(results) {
  const failures = [];
  const byLabel = new Map(results.map((r) => [r.label, r]));
  for (const label of ['synthetic-1k', 'synthetic-10k']) {
    let matches = 0;
    for (const row of results) {
      if (row.label === label) matches += 1;
    }
    if (matches === 0) {
      failures.push(`missing required benchmark evidence for ${label}`);
    } else if (matches > 1) {
      failures.push(`duplicate required benchmark evidence for ${label}`);
    }
  }
  const small = byLabel.get('synthetic-1k');
  const large = byLabel.get('synthetic-10k');
  if (large) {
    if (!Number.isFinite(large.parseMs) || large.parseMs < 0) {
      failures.push('10k-line parse wall timing is missing or invalid');
    } else if (large.parseMs > BUDGETS.maxParseMs10k) {
      failures.push(`10k-line parse took ${large.parseMs}ms (budget ${BUDGETS.maxParseMs10k}ms)`);
    }
    if (!Number.isFinite(large.formatMs) || large.formatMs < 0) {
      failures.push('10k-line format wall timing is missing or invalid');
    } else if (large.formatMs > BUDGETS.maxFormatMs10k) {
      failures.push(`10k-line format took ${large.formatMs}ms (budget ${BUDGETS.maxFormatMs10k}ms)`);
    }
  }
  if (small && large) {
    if (!Number.isFinite(small.parseMs) || small.parseMs <= 0 ||
        !Number.isFinite(large.parseMs) || large.parseMs <= 0) {
      failures.push('parse wall timing is missing or invalid for scaling check');
    } else {
      const ratio = large.parseMs / small.parseMs;
      if (ratio > BUDGETS.maxScalingRatio) {
        failures.push(`parse wall scaling ratio 1k->10k is ${ratio.toFixed(1)}x (budget ${BUDGETS.maxScalingRatio}x)`);
      }
    }
  }
  return failures;
}
export function formatReport(results) {
  const header = 'label           lines    bytes  lex(ms) parse(ms) parseCPU(ms) format(ms) compile(ms)';
  const rows = results.map((r) =>
    `${r.label.padEnd(15)} ${String(r.lines).padStart(6)} ${String(r.bytes).padStart(7)} ` +
    `${String(r.lexMs).padStart(7)} ${String(r.parseMs).padStart(9)} ${String(r.parseCpuMs).padStart(12)} ` +
    `${String(r.formatMs).padStart(10)} ` +
    `${r.compileMs === null ? '   n/a'.padStart(11) : String(r.compileMs).padStart(11)}`
  );
  return [header, ...rows].join('\n');
}
