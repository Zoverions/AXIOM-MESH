import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';

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
    'rollback'
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
      args: ['artifact'],
      secret_references: []
    })}`
  );
});

test('Praxis conformance layer remains incapable of external execution by itself', async () => {
  const source = `
requires permit p: Deploy @ Production;
op release = Deploy("artifact") @ Production;
authorize release using p as armed;
prepare armed as prepared;
commit prepared as receipt;
`;

  await assert.rejects(
    () => run(source),
    error => error?.code === 'PRAXIS_HOST_AUTHORITY_REQUIRED'
  );
});


test('Praxis interpreter has no built-in external-effect transport surface', async () => {
  // Keep the core interpreter boundary explicit, while also classifying every
  // non-CLI Praxis module so new files cannot silently escape this transport
  // scan. cli.mjs remains the one intentional file-reading entry point.
  const dir = new URL('../../labs/praxis/', import.meta.url);
  const coreInterpreterModules = [
    'analyzer.mjs',
    'canonical.mjs',
    'charter.mjs',
    'compiler.mjs',
    'crypto.mjs',
    'effects.mjs',
    'errors.mjs',
    'host-symbols.mjs',
    'host.mjs',
    'index.mjs',
    'lexer.mjs',
    'parser.mjs',
    'policy.mjs',
    'registry.mjs'
  ];
  const inertToolModules = [
    'bench.mjs',
    'format.mjs',
    'fuzz.mjs',
    'ledger.mjs',
    'lsp.mjs',
    'repl.mjs',
    'run-command.mjs'
  ];
  const modules = [...coreInterpreterModules, ...inertToolModules].sort();
  const present = new Set(await readdir(dir));
  const presentNonCliModules = [...present]
    .filter((name) => name.endsWith('.mjs') && name !== 'cli.mjs')
    .sort();

  assert.deepEqual(
    presentNonCliModules,
    modules,
    'every non-CLI Praxis module must be explicitly classified in the transport boundary'
  );
  for (const name of modules) {
    assert.ok(present.has(name), `expected classified Praxis module ${name}`);
  }
  assert.ok(coreInterpreterModules.includes('index.mjs'), 'core transport scan must include index.mjs facade');
  assert.ok(coreInterpreterModules.includes('host.mjs'), 'core transport scan must include host.mjs implementation');
  assert.ok(inertToolModules.includes('run-command.mjs'), 'synthetic run tooling must remain transport-scanned');

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
    for (const name of modules) {
      const source = await readFile(new URL(name, dir), 'utf8');
      assert.equal(source.includes(forbidden), false, `Praxis module ${name} must not contain ${forbidden}`);
    }
  }
});

test('Praxis CLI invokes run only through the delimited synthetic run-command block', async () => {
  // The CLI gained a `run` command against the synthetic host (see
  // labs/praxis/RUN.md). The run implementation must live in run-command.mjs
  // behind the BEGIN/END praxis-run-commands markers; cli.mjs itself must not
  // mint authorities or inject effect handlers.
  const source = await readFile(
    new URL('../../labs/praxis/cli.mjs', import.meta.url),
    'utf8'
  );

  assert.match(source, /import \{ compile \} from '\.\/index\.mjs';/);
  assert.match(source, /from '\.\/format\.mjs';/);
  assert.match(source, /\/\/ BEGIN praxis-run-commands/);
  assert.match(source, /\/\/ END praxis-run-commands/);
  assert.match(source, /await import\('\.\/run-command\.mjs'\)/);
  assert.equal(source.includes('createHostPermit'), false);
  assert.equal(source.includes('createHostLease'), false);
  assert.equal(source.includes('createHostSecretRef'), false);

  // run-command.mjs is covered by the no-transport-surface scan above and
  // must stay synthetic-only with no file I/O of its own.
  const runSource = await readFile(
    new URL('../../labs/praxis/run-command.mjs', import.meta.url),
    'utf8'
  );
  assert.match(runSource, /synthetic/);
  assert.equal(runSource.includes('node:fs'), false);
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
