#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { compile } from './index.mjs';

function usage() {
  console.error('usage: node labs/praxis/cli.mjs <check|ir> <file.prax>');
}

const [command, file] = process.argv.slice(2);
if (!command || !file || !['check', 'ir'].includes(command)) {
  usage();
  process.exitCode = 2;
} else {
  try {
    const source = await readFile(file, 'utf8');
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
    console.error(JSON.stringify({
      ok: false,
      code: error.code ?? 'PRAXIS_ERROR',
      message: error.message
    }, null, 2));
    process.exitCode = 1;
  }
}
