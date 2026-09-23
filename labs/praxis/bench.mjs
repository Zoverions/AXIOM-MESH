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
// caps keep CI honest. Measurements use a short warm-up and median samples.
// CPU time is used only for the scaling ratio so unrelated runner scheduling
// cannot turn a linear parse into a false superlinear signal; the existing
// absolute parse/format wall-clock budgets remain unchanged.

import { performance } from 'node:perf_hooks';

import { lex } from './lexer.mjs';
import { parse } from './parser.mjs';
import { formatProgram } from './format.mjs';
import { compile } from './compiler.mjs';

const BENCHMARK_WARMUPS = 1;
const BENCHMARK_SAMPLES = 5;

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

function measure(fn) {
  for (let i = 0; i < BENCHMARK_WARMUPS; i++) fn();

  const wallSamples = [];
  const cpuSamples = [];
  let result;
  for (let i = 0; i < BENCHMARK_SAMPLES; i++) {
    const cpuStart = process.cpuUsage();
    const wallStart = performance.now();
    result = fn();
    wallSamples.push(performance.now() - wallStart);
    const cpu = process.cpuUsage(cpuStart);
    cpuSamples.push((cpu.user + cpu.system) / 1000);
  }

  return {
    ms: median(wallSamples),
    cpuMs: median(cpuSamples),
    result
  };
}

export function benchmarkSource(label, source) {
  const lines = source.split('\n').length;
  const bytes = source.length;
  const lexed = measure(() => lex(source));
  const parsed = measure(() => parse(source));
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

export function checkBudgets(results) {
  const failures = [];
  const byLabel = new Map(results.map((r) => [r.label, r]));
  const small = byLabel.get('synthetic-1k');
  const large = byLabel.get('synthetic-10k');
  if (large) {
    if (large.parseMs > BUDGETS.maxParseMs10k) {
      failures.push(`10k-line parse took ${large.parseMs}ms (budget ${BUDGETS.maxParseMs10k}ms)`);
    }
    if (large.formatMs > BUDGETS.maxFormatMs10k) {
      failures.push(`10k-line format took ${large.formatMs}ms (budget ${BUDGETS.maxFormatMs10k}ms)`);
    }
  }
  if (small && large) {
    if (!(small.parseCpuMs > 0) || !(large.parseCpuMs >= 0)) {
      failures.push('parse CPU timing is missing or invalid for scaling check');
    } else {
      const ratio = large.parseCpuMs / small.parseCpuMs;
      if (ratio > BUDGETS.maxScalingRatio) {
        failures.push(`parse CPU scaling ratio 1k->10k is ${ratio.toFixed(1)}x (budget ${BUDGETS.maxScalingRatio}x)`);
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
