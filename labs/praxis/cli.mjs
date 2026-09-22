#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { compile } from './index.mjs';
import { format, formatCheckReport } from './format.mjs';

function usage() {
  console.error('usage: node labs/praxis/cli.mjs <check|ir> <file.prax>');
  console.error('       node labs/praxis/cli.mjs format [--check] [file.prax|-]');
  console.error('       node labs/praxis/cli.mjs run <file.prax> [more files...] [--arg k=v ...]');
  console.error('       (format reads stdin when no file is given; --check exits 1 with a diff when input is not canonical)');
}

function fail(error) {
  console.error(JSON.stringify({
    ok: false,
    code: error.code ?? 'PRAXIS_ERROR',
    message: error.message
  }, null, 2));
  process.exitCode = 1;
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

async function readInput(file) {
  if (!file || file === '-') return readStdin();
  return readFile(file, 'utf8');
}

const [command, ...rest] = process.argv.slice(2);

// BEGIN praxis-run-commands
if (command === 'run') {
  const { runPraxisCli } = await import('./run-command.mjs');
  process.exitCode = await runPraxisCli(rest, {
    readInput,
    stdout: process.stdout,
    stderr: process.stderr
  });
} else
// END praxis-run-commands
if (command === 'format') {
  const check = rest.includes('--check');
  const file = rest.find((arg) => arg !== '--check');
  try {
    const source = await readInput(file);
    if (check) {
      const report = formatCheckReport(source, file ?? '<stdin>');
      if (report === null) {
        process.exitCode = 0;
      } else {
        console.log(report);
        process.exitCode = 1;
      }
    } else {
      process.stdout.write(format(source));
    }
  } catch (error) {
    fail(error);
  }
} else if ((command === 'check' || command === 'ir') && rest[0]) {
  try {
    const source = await readFile(rest[0], 'utf8');
    const ir = compile(source);
    if (command === 'check') {
      console.log(JSON.stringify({
        ok: true,
        schema: ir.schema,
        instructions: ir.instructions.length,
        required_permits: ir.required_permits
      }, null, 2));
    } else {
      console.log(JSON.stringify(ir, null, 2));
    }
  } catch (error) {
    fail(error);
  }
} else {
  usage();
  process.exitCode = 2;
}
