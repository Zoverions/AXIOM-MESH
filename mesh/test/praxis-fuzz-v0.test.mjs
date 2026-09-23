import test from 'node:test';
import assert from 'node:assert/strict';

import { PraxisSyntaxError, PraxisTypeError } from '../../labs/praxis/errors.mjs';
import { parse } from '../../labs/praxis/parser.mjs';
import { formatProgram } from '../../labs/praxis/format.mjs';
import { compile } from '../../labs/praxis/compiler.mjs';
import { createGenerator, adversarialInputs } from '../../labs/praxis/fuzz.mjs';

const EXPECTED_THROW = new Set([PraxisSyntaxError, PraxisTypeError]);

function assertOnlyExpectedThrows(fn, label) {
  try {
    return { threw: false, value: fn() };
  } catch (error) {
    assert.ok(
      EXPECTED_THROW.has(error.constructor),
      `${label}: unexpected throw ${error?.constructor?.name}: ${error?.message}`
    );
    return { threw: true, error };
  }
}

test('seeded generator produces valid programs with stable format round-trip', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const gen = createGenerator(seed);
    const count = 3 + (seed % 23);
    const source = gen.program(count);
    const ast1 = parse(source); // generator output must always parse
    const canonical = formatProgram(ast1);
    const ast2 = parse(canonical);
    assert.deepEqual(ast2, ast1, `seed ${seed}: format round-trip changed the AST`);
    // Canonical form is idempotent.
    assert.equal(formatProgram(ast2), canonical, `seed ${seed}: format not idempotent`);
  }
});

test('generated and mutated programs never crash the front end', () => {
  let parsed = 0;
  let rejected = 0;
  for (let seed = 101; seed <= 160; seed++) {
    const gen = createGenerator(seed);
    const source = gen.program(1 + (seed % 50));
    const variants = [source];
    for (let m = 1; m <= 3; m++) variants.push(gen.mutate(source, m * 4));
    for (const variant of variants) {
      const p = assertOnlyExpectedThrows(() => parse(variant), `parse seed ${seed}`);
      const c = assertOnlyExpectedThrows(() => compile(variant), `compile seed ${seed}`);
      if (p.threw) rejected++;
      else parsed++;
      // compile may reject what parse accepts (semantic checks); both directions are fine
      // as long as only expected error types escape.
      void c;
    }
  }
  assert.ok(parsed > 0, 'expected some generated programs to parse');
  assert.ok(rejected > 0, 'expected some mutations to be rejected');
});

test('adversarial inputs fail closed with PraxisSyntaxError only', () => {
  for (const input of adversarialInputs()) {
    const label = JSON.stringify(input.slice(0, 60));
    try {
      parse(input);
      // Empty/whitespace/comment-only inputs legitimately parse to empty programs.
      assert.ok(input.trim() === '' || input.trim().startsWith('//') || input.trim().startsWith('#'),
        `${label}: expected PraxisSyntaxError but parsed successfully`);
    } catch (error) {
      assert.ok(error instanceof PraxisSyntaxError,
        `${label}: expected PraxisSyntaxError, got ${error?.constructor?.name}: ${error?.message}`);
    }
  }
});

test('pathological shapes parse within budget (DoS resistance)', () => {
  const shapes = [
    'op x = A(' + 'a,'.repeat(5000) + 'a) @ S;',
    'observe ' + 'x'.repeat(100000) + ' = 1 from "s";',
    'requires quorum q: A @ S threshold 2 of ' + Array.from({ length: 2000 }, (_, i) => 'm' + i).join(', ') + ';'
  ];
  for (const source of shapes) {
    const start = Date.now();
    parse(source); // valid syntax: must succeed, not hang
    const ms = Date.now() - start;
    assert.ok(ms < 2000, `pathological shape took ${ms}ms: ${source.slice(0, 50)}`);
  }
});

test('fuzz corpus: format(parse(x)) is canonical for adversarial-but-valid inputs', () => {
  const validOnes = [
    'observe x = 1 from "s";',
    'requires quorum q: Deploy @ Production threshold 2 of a, b, c;',
    'op release = Deploy("a", "b") @ Production effect ship irreversible egress "net" using secrets s1, s2;',
    '// leading comment\n# another\nop x = A() @ S; // trailing\n'
  ];
  for (const source of validOnes) {
    const ast = parse(source);
    const canonical = formatProgram(ast);
    assert.deepEqual(parse(canonical), ast, `round-trip failed for ${JSON.stringify(source)}`);
  }
});
