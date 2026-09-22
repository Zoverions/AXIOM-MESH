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
// so a 10x input must not cost more than ~30x the time, and absolute caps
// keep CI honest. Measurements use a short warm-up and a median sample so
// one JIT/GC/timer outlier cannot create a false scaling failure. The scaling
// budget carries headroom because shared/virtualized CI runners (notably
// macos-15-intel) show ~20-24x on genuinely linear parses; a truly quadratic
// blowup would read ~100x and still fail loudly.

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

  const samples = [];
  let result;
  for (let i = 0; i < BENCHMARK_SAMPLES; i++) {
    const start = performance.now();
    result = fn();
    samples.push(performance.now() - start);
  }

  return { ms: median(samples), result };
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
    formatMs: formatted.ms,
    compileMs
  };
}

export function runBenchmarks(corpus) {
  // corpus: [{ label, source }]
  return corpus.map(({ label, source }) => benchmarkSource(label, source));
}

// Absolute budgets (ms) and scaling budgets for the standard corpus.
export const BUDGETS = {
  maxParseMs10k: 5000,
  maxFormatMs10k: 5000,
  // 10x input must cost less than 30x time (linear-ish, not quadratic).
  // Raised from 20x on 2026-09-22: the 20x budget was a flaky gate on
  // macos-15-intel CI (measured 20.0x and 23.6x on identical, passing code).
  maxScalingRatio: 30
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
  if (small && large && small.parseMs > 0) {
    const ratio = large.parseMs / small.parseMs;
    if (ratio > BUDGETS.maxScalingRatio) {
      failures.push(`parse scaling ratio 1k->10k is ${ratio.toFixed(1)}x (budget ${BUDGETS.maxScalingRatio}x)`);
    }
  }
  return failures;
}

export function formatReport(results) {
  const header = 'label           lines    bytes  lex(ms) parse(ms) format(ms) compile(ms)';
  const rows = results.map((r) =>
    `${r.label.padEnd(15)} ${String(r.lines).padStart(6)} ${String(r.bytes).padStart(7)} ` +
    `${String(r.lexMs).padStart(7)} ${String(r.parseMs).padStart(9)} ${String(r.formatMs).padStart(10)} ` +
    `${r.compileMs === null ? '   n/a'.padStart(11) : String(r.compileMs).padStart(11)}`
  );
  return [header, ...rows].join('\n');
}
