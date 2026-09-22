import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PraxisSyntaxError } from '../../labs/praxis/errors.mjs';
import { parse } from '../../labs/praxis/parser.mjs';
import {
  format,
  formatCheckReport,
  formatProgram,
  isCanonical,
  PraxisFormatError
} from '../../labs/praxis/format.mjs';

const exampleUrl = new URL('../../labs/praxis/examples/release.prax', import.meta.url);
const cliPath = fileURLToPath(new URL('../../labs/praxis/cli.mjs', import.meta.url));

function roundTrips(source) {
  const once = format(source);
  assert.equal(format(once), once, 'formatter must be idempotent');
  assert.deepEqual(parse(once), parse(source), 'formatted AST must equal parsed AST');
  return once;
}

test('formatter is idempotent and round-trip stable on the shipped example', async () => {
  const source = await readFile(exampleUrl, 'utf8');
  const canonical = roundTrips(source);
  assert.match(canonical, /^requires permit deploy_prod: Deploy @ Production;\n/);
  assert.ok(isCanonical(canonical));
});

test('formatter normalizes odd whitespace and blank lines', () => {
  const canonical = roundTrips(
    'requires   permit\tp:\nDeploy   @   Production;\n\n\nobserve\tx =\n"a"\nfrom\n"prov";\n'
  );
  assert.equal(
    canonical,
    'requires permit p: Deploy @ Production;\nobserve x = "a" from "prov";\n'
  );
});

test('formatter strips comments (documented: comments are not in the AST)', () => {
  const canonical = roundTrips(
    '// leading comment\nrequires permit p: Deploy @ Production; # trailing\n# full line\n'
  );
  assert.equal(canonical, 'requires permit p: Deploy @ Production;\n');
});

test('formatter handles empty and whitespace-only programs', () => {
  assert.equal(format(''), '');
  assert.equal(format('   \n\t\n'), '');
  assert.equal(format(format('')), '');
});

test('formatter prints maximal requires constructs canonically', () => {
  const canonical = roundTrips(`requires\tquorum\tq: Vote @ Board threshold 3\tof alice,bob, carol ,dave;
requires lease l: Read @ Store;
requires secret s: token;
requires prepared pr: Snapshot @ Region;
`);
  assert.equal(
    canonical,
    'requires quorum q: Vote @ Board threshold 3 of alice, bob, carol, dave;\n' +
    'requires lease l: Read @ Store;\n' +
    'requires secret s: token;\n' +
    'requires prepared pr: Snapshot @ Region;\n'
  );
});

test('formatter orders op modifiers canonically regardless of source order', () => {
  const canonical = roundTrips(
    'op d = Wipe("x", 42, true, ref1) @ Vault using secrets s2, s1 egress "out" irreversible effect gone;\n'
  );
  assert.equal(
    canonical,
    'op d = Wipe("x", 42, true, ref1) @ Vault effect gone irreversible egress "out" using secrets s2, s1;\n'
  );
});

test('formatter handles empty arg lists and full lifecycle statements', () => {
  const canonical = roundTrips(`op n = Ping() @ Net;
authorize n using p as a1;
prepare a1 as p1;
cancel p1 as c1;
commit p1 as r1;
finalize p1 as f1;
verify v = k with Policy;
assess a = k with Policy;
`);
  assert.equal(
    canonical,
    'op n = Ping() @ Net;\n' +
    'authorize n using p as a1;\n' +
    'prepare a1 as p1;\n' +
    'cancel p1 as c1;\n' +
    'commit p1 as r1;\n' +
    'finalize p1 as f1;\n' +
    'verify v = k with Policy;\n' +
    'assess a = k with Policy;\n'
  );
});

test('formatter prints string escapes canonically', () => {
  const canonical = roundTrips('observe s = "a\\"b\\\\c\\n\\t" from "p";\n');
  assert.equal(canonical, 'observe s = "a\\"b\\\\c\\n\\t" from "p";\n');
});

test('formatter prints numbers exactly, including overflow literals', () => {
  const canonical = roundTrips(`observe a = 42 from "p";
observe b = -7 from "p";
observe c = 3.14 from "p";
observe d = 0.000001 from "p";
observe e = -0 from "p";
observe f = 10000000000000000000000 from "p";
observe g = 9007199254740993 from "p";
`);
  assert.equal(
    canonical,
    'observe a = 42 from "p";\n' +
    'observe b = -7 from "p";\n' +
    'observe c = 3.14 from "p";\n' +
    'observe d = 0.000001 from "p";\n' +
    'observe e = -0 from "p";\n' +
    'observe f = 10000000000000000000000 from "p";\n' +
    'observe g = 9007199254740992 from "p";\n'
  );
});

test('formatter is deterministic across differently-spaced equivalents', () => {
  const a = format('requires permit p:Deploy@Production;');
  const b = format('requires  permit  p  :  Deploy  @  Production  ;');
  assert.equal(a, b);
  assert.equal(a, 'requires permit p: Deploy @ Production;\n');
});

test('invalid input surfaces the parser error unchanged', () => {
  assert.throws(
    () => format('op = ;'),
    (error) => error instanceof PraxisSyntaxError && error.code === 'PRAXIS_SYNTAX_ERROR'
  );
  assert.throws(
    () => format('requires permit p: Deploy @ Production'),
    (error) => error instanceof PraxisSyntaxError
  );
});

test('formatProgram rejects non-program input with PraxisFormatError', () => {
  assert.throws(() => formatProgram(null), PraxisFormatError);
  assert.throws(() => formatProgram({ kind: 'Program' }), PraxisFormatError);
  assert.throws(
    () => formatProgram({ kind: 'Program', body: [{ kind: 'Bogus' }] }),
    (error) => error instanceof PraxisFormatError && error.code === 'PRAXIS_FORMAT_ERROR'
  );
  assert.throws(
    () => formatProgram({ kind: 'Program', body: [{ kind: 'Operation', name: 'x' }] }),
    PraxisFormatError
  );
});

test('isCanonical distinguishes canonical from non-canonical source', () => {
  assert.equal(isCanonical('requires permit p: Deploy @ Production;\n'), true);
  assert.equal(isCanonical('requires permit p: Deploy @ Production;'), false);
  assert.equal(isCanonical('requires  permit p: Deploy @ Production;\n'), false);
  assert.equal(isCanonical(''), true);
});

test('formatCheckReport returns null when canonical and a diff otherwise', () => {
  const canonical = 'requires permit p: Deploy @ Production;\n';
  assert.equal(formatCheckReport(canonical, 'f.prax'), null);
  const report = formatCheckReport('requires  permit p: Deploy @ Production;\n', 'f.prax');
  assert.match(report, /^--- f\.prax\n\+\+\+ canonical\n/m);
  assert.match(report, /^- requires  permit p: Deploy @ Production;$/m);
  assert.match(report, /^\+ requires permit p: Deploy @ Production;$/m);
});

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

test('CLI format prints canonical source from a file', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'praxis-fmt-'));
  const file = join(dir, 'messy.prax');
  await writeFile(file, 'requires  permit p: Deploy @ Production;\n');
  const { code, stdout, stderr } = await runCli(['format', file]);
  assert.equal(code, 0);
  assert.equal(stderr, '');
  assert.equal(stdout, 'requires permit p: Deploy @ Production;\n');
});

test('CLI format reads stdin when no file is given', async () => {
  const { code, stdout } = await runCli(['format'], {
    input: 'observe\tx =\n1\nfrom\n"p";\n'
  });
  assert.equal(code, 0);
  assert.equal(stdout, 'observe x = 1 from "p";\n');
});

test('CLI format --check exits 0 silently when canonical', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'praxis-fmt-'));
  const file = join(dir, 'ok.prax');
  await writeFile(file, 'requires permit p: Deploy @ Production;\n');
  const { code, stdout } = await runCli(['format', '--check', file]);
  assert.equal(code, 0);
  assert.equal(stdout, '');
});

test('CLI format --check exits 1 with a diff when not canonical', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'praxis-fmt-'));
  const file = join(dir, 'messy.prax');
  await writeFile(file, 'requires  permit p: Deploy @ Production;\n');
  const { code, stdout } = await runCli(['format', '--check', file]);
  assert.equal(code, 1);
  assert.match(stdout, /^- requires  permit/m);
  assert.match(stdout, /^\+ requires permit/m);
});

test('CLI format reports invalid input as a JSON error with exit 1', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'praxis-fmt-'));
  const file = join(dir, 'bad.prax');
  await writeFile(file, 'op = ;\n');
  const { code, stdout, stderr } = await runCli(['format', file]);
  assert.equal(code, 1);
  assert.equal(stdout, '');
  const body = JSON.parse(stderr);
  assert.equal(body.ok, false);
  assert.equal(body.code, 'PRAXIS_SYNTAX_ERROR');
});

test('CLI still rejects unknown commands with usage and exit 2', async () => {
  const { code, stderr } = await runCli(['bogus']);
  assert.equal(code, 2);
  assert.match(stderr, /usage:/);
});
