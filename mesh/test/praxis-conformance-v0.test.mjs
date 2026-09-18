import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  canonicalJson,
  digestObject
} from '../src/lib/canonical.mjs';
import {
  canonicalJsonPraxis,
  compile,
  digestPraxis,
  run
} from '../../labs/praxis/index.mjs';

const corpusUrl = new URL(
  '../../labs/praxis/conformance/semantic-corpus.v0.json',
  import.meta.url
);

async function loadCorpus() {
  return JSON.parse(await readFile(corpusUrl, 'utf8'));
}

test('Praxis semantic conformance corpus pins current authority invariants and gaps', async () => {
  const corpus = await loadCorpus();
  assert.equal(corpus.schema, 'praxis-semantic-conformance.v0');
  assert.equal(corpus.status, 'inert-laboratory-corpus');

  for (const fixture of corpus.compile_cases) {
    if (fixture.expect.ok) {
      const ir = compile(fixture.source);
      assert.deepEqual(
        ir.instructions.map(instruction => instruction.op),
        fixture.expect.instruction_ops,
        fixture.name
      );
      continue;
    }

    assert.throws(
      () => compile(fixture.source),
      error => error?.code === fixture.expect.code,
      fixture.name
    );
  }

  const pending = corpus.coverage
    .filter(item => item.status.startsWith('pending'))
    .map(item => item.invariant)
    .sort();

  assert.deepEqual(pending, [
    'cancellation-idempotency-replay-rollback',
    'durable-preparation-before-external-io',
    'secret-reference-separation',
    'uncertain-external-outcome-remains-uncertain'
  ]);
});

test('Praxis canonical JSON differentially matches the current AXIOM oracle', async () => {
  const corpus = await loadCorpus();

  for (const fixture of corpus.canonical_fixtures) {
    assert.equal(
      canonicalJsonPraxis(fixture.value),
      canonicalJson(fixture.value),
      fixture.name
    );
    assert.equal(
      digestPraxis(fixture.value),
      digestObject(fixture.value),
      fixture.name
    );
  }

  const nullPrototype = Object.create(null);
  nullPrototype.z = 3;
  nullPrototype.a = { x: 1 };
  assert.equal(canonicalJsonPraxis(nullPrototype), canonicalJson(nullPrototype));
  assert.equal(digestPraxis(nullPrototype), digestObject(nullPrototype));
});

test('Praxis and AXIOM reject the same adversarial canonicalization classes', () => {
  const sparse = [];
  sparse.length = 1;

  const customArray = [1];
  customArray.extra = true;

  const symbolRecord = { a: 1 };
  symbolRecord[Symbol('hidden')] = 2;

  const nonEnumerable = { a: 1 };
  Object.defineProperty(nonEnumerable, 'hidden', {
    value: 2,
    enumerable: false
  });

  const accessor = {};
  Object.defineProperty(accessor, 'a', {
    enumerable: true,
    get() {
      return 1;
    }
  });

  const cases = [
    NaN,
    Infinity,
    -Infinity,
    undefined,
    Symbol('x'),
    () => 1,
    new Date('2026-09-18T00:00:00.000Z'),
    sparse,
    customArray,
    symbolRecord,
    nonEnumerable,
    accessor
  ];

  for (const value of cases) {
    assert.throws(() => canonicalJson(value));
    assert.throws(() => canonicalJsonPraxis(value));
  }
});

test('Praxis operation digest is byte-equivalent to AXIOM canonical object digest', async () => {
  const result = await run('op release = Deploy("artifact") @ Production;');
  const operation = result.values.release;

  assert.equal(
    operation.operation_digest,
    `sha256:${digestObject({
      schema: 'praxis-operation.v0',
      action: 'Deploy',
      scope: 'Production',
      args: ['artifact']
    })}`
  );
});

test('Praxis conformance layer remains incapable of external execution by itself', async () => {
  const source = `
requires permit p: Deploy @ Production;
op release = Deploy("artifact") @ Production;
authorize release using p as armed;
commit armed as receipt;
`;

  await assert.rejects(
    () => run(source),
    error => error?.code === 'PRAXIS_HOST_AUTHORITY_REQUIRED'
  );
});


test('Praxis interpreter has no built-in external-effect transport surface', async () => {
  const source = await readFile(
    new URL('../../labs/praxis/index.mjs', import.meta.url),
    'utf8'
  );

  for (const forbidden of [
    "node:http",
    "node:https",
    "node:net",
    "node:tls",
    "node:dgram",
    "node:child_process",
    "node:fs",
    "fetch(",
    "process.env",
    "WebSocket",
    "exec(",
    "spawn("
  ]) {
    assert.equal(source.includes(forbidden), false, `interpreter must not contain ${forbidden}`);
  }
});

test('Praxis CLI exposes compile/check surfaces only and cannot invoke run', async () => {
  const source = await readFile(
    new URL('../../labs/praxis/cli.mjs', import.meta.url),
    'utf8'
  );

  assert.match(source, /import \{ compile \} from '\.\/index\.mjs';/);
  assert.equal(source.includes('run('), false);
  assert.equal(source.includes('executor'), false);
  assert.equal(source.includes('createHostPermit'), false);
  assert.equal(source.includes('createHostLease'), false);
});

test('plain objects cannot forge host authority tokens', async () => {
  const source = `
requires permit p: Deploy @ Production;
op release = Deploy("artifact") @ Production;
authorize release using p as armed;
`;

  await assert.rejects(
    () => run(source, {
      authorities: {
        p: {
          schema: 'praxis-host-permit.v0',
          id: 'forged',
          action: 'Deploy',
          scope: 'Production'
        }
      }
    }),
    error => error?.code === 'PRAXIS_HOST_AUTHORITY_REQUIRED'
  );
});
