// mesh/test/praxis-repl-v0.test.mjs
//
// CLI integration tests for the Praxis REPL (`node cli.mjs repl`).
// The REPL is driven via piped stdin; each submission is checked with the
// real compiler, so these are end-to-end tests of the interactive loop.

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { evaluateSubmission, handleDotCommand, REPL_HELP } from '../../labs/praxis/repl.mjs';

const cliPath = fileURLToPath(new URL('../../labs/praxis/cli.mjs', import.meta.url));

function runRepl(input) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath, 'repl'], { encoding: 'utf8' });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
    child.stdin.write(input);
    child.stdin.end();
  });
}

test('unit: evaluateSubmission prints canonical form plus pretty IR on success', () => {
  const { ok, output } = evaluateSubmission('observe  x = 1\nfrom "p";\n');
  assert.equal(ok, true);
  assert.match(output, /^observe x = 1 from "p";$/m);
  assert.match(output, /"schema": "praxis-ir\.v0"/);
});

test('unit: evaluateSubmission reports the check error without throwing', () => {
  const { ok, output } = evaluateSubmission('bogus !!!\n');
  assert.equal(ok, false);
  assert.match(output, /^error: PRAXIS_SYNTAX_ERROR: /m);
});

test('unit: :ir toggles state and unknown commands are named', () => {
  const writes = [];
  const state = { output: { write: (s) => writes.push(s) }, buffer: [], showIr: true };
  assert.equal(handleDotCommand(':ir', state), 'ir');
  assert.equal(state.showIr, false);
  assert.equal(handleDotCommand(':ir', state), 'ir');
  assert.equal(state.showIr, true);
  assert.equal(handleDotCommand(':frobnicate', state), 'unknown');
  assert.match(writes.join(''), /unknown command :frobnicate/);
});

test('unit: :reset clears the buffer', () => {
  const state = { output: { write: () => {} }, buffer: ['observe x = 1 from "p";'], showIr: true };
  assert.equal(handleDotCommand(':reset', state), 'reset');
  assert.deepEqual(state.buffer, []);
});

test('cli: repl prints the prompt and evaluates a multi-line submission on a blank line', async () => {
  const { code, stdout, stderr } = await runRepl('observe x = 1\nfrom "p";\n\n:quit\n');
  assert.equal(code, 0);
  assert.equal(stderr, '');
  assert.match(stdout, /praxis> /);
  assert.match(stdout, /observe x = 1 from "p";/);
  assert.match(stdout, /"schema": "praxis-ir\.v0"/);
});

test('cli: repl reports check errors and keeps the session alive', async () => {
  const { code, stdout } = await runRepl('bogus !!!\n\nobserve x = 1 from "p";\n\n:quit\n');
  assert.equal(code, 0);
  assert.match(stdout, /error: PRAXIS_SYNTAX_ERROR: /);
  assert.match(stdout, /observe x = 1 from "p";/);
});

test('cli: repl :help documents the blank-line rule', async () => {
  const { code, stdout } = await runRepl(':help\n:quit\n');
  assert.equal(code, 0);
  assert.match(stdout, /blank line/i);
  assert.match(stdout, /:quit/);
  assert.ok(stdout.includes(REPL_HELP.split('\n')[0]));
});

test('cli: repl :ir off prints a one-line summary instead of full IR', async () => {
  const { code, stdout } = await runRepl(':ir\nobserve x = 1 from "p";\n\n:quit\n');
  assert.equal(code, 0);
  assert.match(stdout, /IR printing: off/);
  assert.match(stdout, /^\{"ok":true,"schema":"praxis-ir\.v0","instructions":1,"required_permits":\[\]\}$/m);
  assert.doesNotMatch(stdout, /"schema": "praxis-ir\.v0"/);
});

test('cli: repl :reset discards the buffered submission', async () => {
  const { code, stdout } = await runRepl('bogus !!!\n:reset\n:quit\n');
  assert.equal(code, 0);
  assert.doesNotMatch(stdout, /error:/);
});

test('cli: repl evaluates buffered input on EOF without :quit', async () => {
  const { code, stdout } = await runRepl('observe x = 1 from "p";\n');
  assert.equal(code, 0);
  assert.match(stdout, /observe x = 1 from "p";/);
});

test('cli: repl ignores blank lines on an empty buffer', async () => {
  const { code, stdout } = await runRepl('\n\n:quit\n');
  assert.equal(code, 0);
  assert.doesNotMatch(stdout, /error:/);
  assert.doesNotMatch(stdout, /observe/);
});
