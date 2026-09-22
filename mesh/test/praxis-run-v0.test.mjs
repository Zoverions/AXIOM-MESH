import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const cliPath = fileURLToPath(new URL('../../labs/praxis/cli.mjs', import.meta.url));
const corpusUrl = new URL('../../labs/praxis/conformance/semantic-corpus.v0.json', import.meta.url);

const SUCCESS_PROGRAM = `
requires permit deploy_prod: Deploy @ Production;
observe source = "sha256:abc" from "git:main";
op release = Deploy(source) @ Production;
authorize release using deploy_prod as armed_release;
prepare armed_release as prepared_release;
commit prepared_release as release_receipt;
`;

const CHECK_FAILURE_PROGRAM = `
requires permit deploy_prod: Deploy @ Production;
op release = Deploy("artifact") @ Production;
authorize release using deploy_prod as armed_release;
commit armed_release as release_receipt;
`;

const DENIAL_PROGRAM = `
observe source = "sha256:abc" from "git:main";
verify verified_source = source with GitIntegrity;
`;

function runCli(args, { input } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath, ...args], { encoding: 'utf8' });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
    if (input !== undefined) child.stdin.write(input);
    child.stdin.end();
  });
}

function parseDiagnostics(stderr) {
  // Diagnostics are pretty-printed JSON objects, one per failed file.
  return stderr
    .split(/}\s*\n(?={)/)
    .map(block => block.trim())
    .filter(block => block.length > 0)
    .map(block => JSON.parse(block.endsWith('}') ? block : `${block}}`));
}

async function writeFixture(dir, name, source) {
  const file = join(dir, name);
  await writeFile(file, source);
  return file;
}

test('CLI run completes a valid program against the synthetic host (exit 0)', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'praxis-run-'));
  const file = await writeFixture(dir, 'success.prax', SUCCESS_PROGRAM);

  const { code, stdout, stderr } = await runCli(['run', file, '--arg', 'env=lab']);

  assert.equal(code, 0);
  assert.equal(stderr, '', 'success must not emit diagnostics');
  assert.match(
    stdout,
    new RegExp(`^ok ${file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}: completed \\(6 bindings: deploy_prod, source, release, armed_release, prepared_release, release_receipt\\)\n$`)
  );
});

test('CLI run exits 2 with a check-stage diagnostic on invalid programs', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'praxis-run-'));
  const file = await writeFixture(dir, 'check-fail.prax', CHECK_FAILURE_PROGRAM);

  const { code, stdout, stderr } = await runCli(['run', file]);

  assert.equal(code, 2);
  assert.equal(stdout, '', 'check failures produce no program output');
  const [diagnostic] = parseDiagnostics(stderr);
  assert.equal(diagnostic.ok, false);
  assert.equal(diagnostic.file, file);
  assert.equal(diagnostic.stage, 'check');
  assert.equal(diagnostic.code, 'PRAXIS_COMMIT_REQUIRES_PREPARATION');
});

test('CLI run exits 3 with a run-stage diagnostic when the synthetic host refuses', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'praxis-run-'));
  const file = await writeFixture(dir, 'denied.prax', DENIAL_PROGRAM);

  const { code, stdout, stderr } = await runCli(['run', file]);

  assert.equal(code, 3);
  assert.equal(stdout, '', 'denied runs produce no program output');
  const [diagnostic] = parseDiagnostics(stderr);
  assert.equal(diagnostic.ok, false);
  assert.equal(diagnostic.file, file);
  assert.equal(diagnostic.stage, 'run');
  assert.equal(diagnostic.code, 'PRAXIS_VERIFIER_REQUIRED');
});

test('CLI run reads one program from stdin with -', async () => {
  const { code, stdout, stderr } = await runCli(['run', '-'], { input: SUCCESS_PROGRAM });

  assert.equal(code, 0);
  assert.equal(stderr, '');
  assert.match(stdout, /^ok -: completed \(6 bindings/);
});

test('CLI run executes multiple files in sequence with per-file result lines', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'praxis-run-'));
  const first = await writeFixture(dir, 'a.prax', SUCCESS_PROGRAM);
  const second = await writeFixture(dir, 'b.prax', SUCCESS_PROGRAM);

  const { code, stdout, stderr } = await runCli(['run', first, second]);

  assert.equal(code, 0);
  assert.equal(stderr, '');
  const lines = stdout.trim().split('\n');
  assert.equal(lines.length, 2);
  assert.ok(lines[0].startsWith(`ok ${first}: completed`));
  assert.ok(lines[1].startsWith(`ok ${second}: completed`));
});

test('CLI run aggregates exit codes: worst code wins', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'praxis-run-'));
  const ok = await writeFixture(dir, 'ok.prax', SUCCESS_PROGRAM);
  const bad = await writeFixture(dir, 'bad.prax', CHECK_FAILURE_PROGRAM);
  const denied = await writeFixture(dir, 'denied.prax', DENIAL_PROGRAM);

  const checkMixed = await runCli(['run', ok, bad]);
  assert.equal(checkMixed.code, 2);
  assert.ok(checkMixed.stdout.includes(`ok ${ok}: completed`), 'the valid file still reports');

  const denialMixed = await runCli(['run', bad, denied]);
  assert.equal(denialMixed.code, 3, 'a runtime denial dominates a check failure');
});

test('CLI run rejects malformed usage with exit 2', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'praxis-run-'));
  const file = await writeFixture(dir, 'success.prax', SUCCESS_PROGRAM);

  const noFiles = await runCli(['run']);
  assert.equal(noFiles.code, 2);
  assert.match(noFiles.stderr, /run: expected at least one <file\.prax>/);

  const badArg = await runCli(['run', file, '--arg', 'novalue']);
  assert.equal(badArg.code, 2);
  assert.match(badArg.stderr, /run: --arg expects k=v/);

  const unknownFlag = await runCli(['run', file, '--frobnicate']);
  assert.equal(unknownFlag.code, 2);
  assert.match(unknownFlag.stderr, /run: unknown flag/);
});

test('CLI run exits 2 with a read-stage diagnostic for missing files', async () => {
  const missing = join(await mkdtemp(join(tmpdir(), 'praxis-run-')), 'missing.prax');

  const { code, stdout, stderr } = await runCli(['run', missing]);

  assert.equal(code, 2);
  assert.equal(stdout, '');
  const [diagnostic] = parseDiagnostics(stderr);
  assert.equal(diagnostic.stage, 'read');
  assert.equal(diagnostic.file, missing);
});

test('CLI run executes the runnable semantic corpus cases; invalid cases exit 2', async () => {
  const corpus = JSON.parse(await readFile(corpusUrl, 'utf8'));
  const dir = await mkdtemp(join(tmpdir(), 'praxis-run-'));
  const files = [];
  for (const testCase of corpus.compile_cases) {
    files.push(await writeFixture(dir, `${testCase.name}.prax`, testCase.source));
  }

  // One invocation: the CLI runs the whole corpus in sequence.
  const { code, stdout, stderr } = await runCli(['run', ...files]);
  const diagnostics = parseDiagnostics(stderr);

  // Runnable cases complete on the synthetic host...
  for (const name of [
    'valid-authorized-commit',
    'valid-lease-authorization',
    'valid-opaque-secret-binding',
    'valid-explicit-quorum-authority'
  ]) {
    assert.ok(
      stdout.includes(`ok ${join(dir, `${name}.prax`)}: completed`),
      `${name} should complete`
    );
  }
  // ...except the ones that need prepared-effect imports, which the
  // synthetic host cannot supply and so refuses (exit 3).
  for (const name of ['valid-imported-prepared-commit', 'valid-prepared-cancellation']) {
    const diagnostic = diagnostics.find(item => basename(item.file) === `${name}.prax`);
    assert.ok(diagnostic, `${name} should have a diagnostic`);
    assert.equal(diagnostic.stage, 'run');
    assert.equal(diagnostic.code, 'PRAXIS_HOST_PREPARED_REQUIRED');
  }
  // Invalid cases fail the check stage with the code the corpus expects.
  for (const testCase of corpus.compile_cases.filter(item => !item.expect.ok)) {
    const diagnostic = diagnostics.find(item => basename(item.file) === `${testCase.name}.prax`);
    assert.ok(diagnostic, `${testCase.name} should have a diagnostic`);
    assert.equal(diagnostic.stage, 'check');
    assert.equal(diagnostic.code, testCase.expect.code);
  }
  assert.equal(code, 3, 'worst code across the corpus is the prepared-import denial');
});
