// mesh/test/praxis-spec-v0.test.mjs
//
// Executable companion to labs/praxis/SPEC.md: every statement form
// documented in the spec MUST parse, statically check (compile), and
// be format-stable (canonical form is canonical, round-trips to an
// identical AST, and re-checks). If a documented form fails here, the
// spec is wrong, not the code (code wins).

import test from 'node:test';
import assert from 'node:assert/strict';

import { compile } from '../../labs/praxis/compiler.mjs';
import { format, isCanonical } from '../../labs/praxis/format.mjs';
import { parse } from '../../labs/praxis/parser.mjs';

// Parse + check + canonicalize + round-trip AST equality + re-check.
function assertSpecForm(source, label) {
  const ast = parse(source);
  const ir = compile(source);
  assert.equal(ir.schema, 'praxis-ir.v0', `${label}: IR schema`);
  const canonical = format(source);
  assert.equal(isCanonical(canonical), true, `${label}: canonical form is canonical`);
  assert.deepEqual(parse(canonical), ast, `${label}: round-trip AST equality`);
  compile(canonical);
}

test('SPEC §3: requires permit form parses, checks, and is format-stable', () => {
  assertSpecForm(
    'requires permit deploy_prod: Deploy @ Production;\n' +
    'observe evidence = "ok" from "src";\n' +
    'op release = Deploy(evidence) @ Production;\n' +
    'authorize release using deploy_prod as armed_release;\n' +
    'prepare armed_release as prepared_release;\n' +
    'commit prepared_release as release_receipt;\n',
    'requires permit'
  );
});

test('SPEC §3: requires lease form parses, checks, and is format-stable', () => {
  assertSpecForm(
    'requires lease deploy_window: Deploy @ Production;\n' +
    'op release = Deploy("artifact") @ Production;\n' +
    'authorize release using deploy_window as armed_release;\n',
    'requires lease'
  );
});

test('SPEC §3: requires quorum form parses, checks, and is format-stable', () => {
  assertSpecForm(
    'requires quorum release_gate: Deploy @ Production threshold 2 of Operator, Security, Provider;\n' +
    'op release = Deploy("artifact") @ Production;\n' +
    'authorize release using release_gate as armed_release;\n',
    'requires quorum'
  );
});

test('SPEC §3: requires secret + using secrets form parses, checks, and is format-stable', () => {
  assertSpecForm(
    'requires secret signing_key: SigningCredential;\n' +
    'op sign = Sign("sha256:abc") @ Local using secrets signing_key;\n',
    'requires secret'
  );
});

test('SPEC §3: requires prepared + commit of imported preparation is format-stable', () => {
  assertSpecForm(
    'requires prepared prior: Deploy @ Production;\n' +
    'commit prior as receipt;\n',
    'requires prepared commit'
  );
});

test('SPEC §3: requires prepared + cancel of imported preparation is format-stable', () => {
  assertSpecForm(
    'requires prepared prior: Deploy @ Production;\n' +
    'cancel prior as canceled;\n',
    'requires prepared cancel'
  );
});

test('SPEC §3: observe literal forms (string, number, boolean) parse, check, and are format-stable', () => {
  assertSpecForm(
    'observe text = "hello" from "src";\n' +
    'observe count = 42 from "src";\n' +
    'observe frac = -1.5 from "src";\n' +
    'observe flag = true from "src";\n' +
    'observe other = false from "src";\n',
    'observe literals'
  );
});

test('SPEC §3: observe reference copy from knowledge is format-stable', () => {
  assertSpecForm(
    'observe first = "a" from "src";\n' +
    'observe second = first from "src";\n' +
    'verify third = second with Policy;\n' +
    'observe fourth = third from "src";\n',
    'observe reference'
  );
});

test('SPEC §3: verify form parses, checks, and is format-stable', () => {
  assertSpecForm(
    'observe source_commit = "sha256:abc123" from "git:main";\n' +
    'verify verified_source = source_commit with GitIntegrity;\n',
    'verify'
  );
});

test('SPEC §3: assess form parses, checks, and is format-stable', () => {
  assertSpecForm(
    'observe source_commit = "sha256:abc123" from "git:main";\n' +
    'verify verified_source = source_commit with GitIntegrity;\n' +
    'assess release_candidate = verified_source with ReleasePolicy;\n',
    'assess'
  );
});

test('SPEC §3: op with empty argument list parses, checks, and is format-stable', () => {
  assertSpecForm(
    'requires permit p: Ping @ Local;\n' +
    'op probe = Ping() @ Local;\n' +
    'authorize probe using p as a;\n',
    'op empty args'
  );
});

test('SPEC §3: op with all modifiers parses, checks, and is format-stable', () => {
  assertSpecForm(
    'requires permit p: Destroy @ Production;\n' +
    'requires secret sk: SigningCredential;\n' +
    'op erase = Destroy("artifact") @ Production effect destructive_delete irreversible egress "provider:prod" using secrets sk;\n' +
    'authorize erase using p as a;\n' +
    'prepare a as prep;\n' +
    'finalize prep as receipt;\n',
    'op full modifiers'
  );
});

test('SPEC §3: op modifiers in non-canonical order still parse and canonicalize to README order', () => {
  const source =
    'requires secret sk: SigningCredential;\n' +
    'op erase = Destroy("artifact") @ Production using secrets sk egress "provider:prod" irreversible effect destructive_delete;\n';
  const ast = parse(source);
  const canonical = format(source);
  assert.equal(
    canonical,
    'requires secret sk: SigningCredential;\n' +
    'op erase = Destroy("artifact") @ Production effect destructive_delete irreversible egress "provider:prod" using secrets sk;\n'
  );
  assert.deepEqual(parse(canonical), ast);
  compile(canonical);
});

test('SPEC §3: authorize / prepare / commit lifecycle forms are format-stable', () => {
  assertSpecForm(
    'requires permit p: Deploy @ Production;\n' +
    'op release = Deploy("artifact") @ Production;\n' +
    'authorize release using p as armed;\n' +
    'prepare armed as prepared;\n' +
    'commit prepared as receipt;\n',
    'authorize/prepare/commit'
  );
});

test('SPEC §3: cancel form is format-stable', () => {
  assertSpecForm(
    'requires permit p: Deploy @ Production;\n' +
    'op release = Deploy("artifact") @ Production;\n' +
    'authorize release using p as armed;\n' +
    'prepare armed as prepared;\n' +
    'cancel prepared as canceled;\n',
    'cancel'
  );
});

test('SPEC §3: finalize of statically irreversible op is format-stable', () => {
  assertSpecForm(
    'requires permit p: Destroy @ Production;\n' +
    'op erase = Destroy("artifact") @ Production effect destructive_delete irreversible;\n' +
    'authorize erase using p as armed;\n' +
    'prepare armed as prepared;\n' +
    'finalize prepared as receipt;\n',
    'finalize'
  );
});

test('SPEC §3: commit of unmeasured reversible op (no effect declared) is format-stable', () => {
  assertSpecForm(
    'requires permit p: Deploy @ Production;\n' +
    'op release = Deploy("artifact") @ Production effect deploy_release;\n' +
    'authorize release using p as armed;\n' +
    'prepare armed as prepared;\n' +
    'commit prepared as receipt;\n',
    'commit declared reversible effect'
  );
});

test('SPEC §7: canonical formatter matches the spec statement shapes', () => {
  assert.equal(
    format('requires quorum q: Deploy @ Production threshold 2 of B, A;'),
    'requires quorum q: Deploy @ Production threshold 2 of B, A;\n'
  );
  assert.equal(
    format('requires secret s: SigningCredential;'),
    'requires secret s: SigningCredential;\n'
  );
  assert.equal(
    format('observe o = 1.5 from "src";'),
    'observe o = 1.5 from "src";\n'
  );
  assert.equal(format(''), '');
});
