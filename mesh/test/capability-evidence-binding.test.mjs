import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  validateCapabilityEvidenceBindings,
  validateCapabilityRegistry
} from '../src/check-registry.mjs';
import { digestObject } from '../src/lib/canonical.mjs';

test('repository capability evidence resolves every implemented claim to exact assertions', async () => {
  const registry = JSON.parse(
    await readFile(new URL('../config/capabilities.json', import.meta.url), 'utf8')
  );
  const result = await validateCapabilityEvidenceBindings(registry);
  assert.equal(result.valid, true);
  assert.equal(result.schema, 'axiom-capability-evidence-bindings.v1');
  assert.equal(result.kernel_version, registry.kernel_version);
  assert.equal(result.registry_digest, digestObject(registry));
  assert.equal(
    result.bindings,
    registry.capabilities.filter(item => item.status === 'implemented').length
  );
  assert.ok(result.evidence_files >= result.bindings / 2);
  assert.match(result.digest, /^[a-f0-9]{64}$/);
});

test('registry rejects non-normalized and non-runnable implemented evidence', async () => {
  const registry = JSON.parse(
    await readFile(new URL('../config/capabilities.json', import.meta.url), 'utf8')
  );
  const escaped = structuredClone(registry);
  escaped.capabilities.find(item => item.status === 'implemented').evidence = [
    '../outside.test.mjs'
  ];
  assert.throws(
    () => validateCapabilityRegistry(escaped),
    /normalized and repository-relative/
  );

  const supportOnly = structuredClone(registry);
  supportOnly.capabilities.find(item => item.status === 'implemented').evidence = [
    'docs/operations/README.md'
  ];
  assert.throws(
    () => validateCapabilityRegistry(supportOnly),
    /runnable Node test/
  );
});

test('evidence binding rejects missing files, unregistered tests, and removed assertions', async t => {
  const root = await mkdtemp(join(tmpdir(), 'axiom-capability-evidence-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const testDirectory = join(root, 'mesh', 'test');
  const configDirectory = join(root, 'mesh', 'config');
  await Promise.all([
    mkdir(testDirectory, { recursive: true }),
    mkdir(configDirectory, { recursive: true })
  ]);
  const testPath = join(testDirectory, 'feature.test.mjs');
  const bindingsPath = join(configDirectory, 'capability-evidence-bindings.json');
  const registry = {
    kernel_version: '1.0.0',
    capabilities: [{
      id: 'feature.one',
      status: 'implemented',
      evidence: ['mesh/test/feature.test.mjs']
    }]
  };
  const bindings = {
    schema: 'axiom-capability-evidence-bindings.v1',
    kernel_version: '1.0.0',
    registry_digest: digestObject(registry),
    bindings: [{
      capability_id: 'feature.one',
      path: 'mesh/test/feature.test.mjs',
      test: 'feature one denies unsafe input',
      assertions: ["assert.equal(result.allowed, false);"]
    }]
  };
  await writeFile(testPath, [
    "import assert from 'node:assert/strict';",
    "import test from 'node:test';",
    '',
    "test('feature one denies unsafe input', () => {",
    '  const result = { allowed: false };',
    '  assert.equal(result.allowed, false);',
    '});',
    ''
  ].join('\n'));
  await writeFile(bindingsPath, `${JSON.stringify(bindings, null, 2)}\n`);

  const accepted = await validateCapabilityEvidenceBindings(registry, {
    repositoryRoot: root,
    bindingsPath
  });
  assert.equal(accepted.bindings, 1);

  const removedAssertion = structuredClone(bindings);
  removedAssertion.bindings[0].assertions = [
    "assert.equal(result.reason, 'policy_denied');"
  ];
  await writeFile(
    bindingsPath,
    `${JSON.stringify(removedAssertion, null, 2)}\n`
  );
  await assert.rejects(
    validateCapabilityEvidenceBindings(registry, {
      repositoryRoot: root,
      bindingsPath
    }),
    /assertion binding is missing/
  );

  await writeFile(testPath, [
    "import assert from 'node:assert/strict';",
    "import test from 'node:test';",
    '',
    "test('feature one denies unsafe input', () => {",
    '  const result = { allowed: false };',
    '  // assert.equal(result.allowed, false);',
    '});',
    ''
  ].join('\n'));
  await writeFile(bindingsPath, `${JSON.stringify(bindings, null, 2)}\n`);
  await assert.rejects(
    validateCapabilityEvidenceBindings(registry, {
      repositoryRoot: root,
      bindingsPath
    }),
    /assertion binding is missing/
  );
  await writeFile(testPath, [
    "import assert from 'node:assert/strict';",
    "import test from 'node:test';",
    '',
    "test('feature one denies unsafe input', () => {",
    '  const result = { allowed: false };',
    '  assert.equal(result.allowed, false);',
    '});',
    ''
  ].join('\n'));

  const wrongTest = structuredClone(bindings);
  wrongTest.bindings[0].test = 'feature one allows unsafe input';
  await writeFile(bindingsPath, `${JSON.stringify(wrongTest, null, 2)}\n`);
  await assert.rejects(
    validateCapabilityEvidenceBindings(registry, {
      repositoryRoot: root,
      bindingsPath
    }),
    /test declaration was not found/
  );

  await rm(testPath);
  await writeFile(bindingsPath, `${JSON.stringify(bindings, null, 2)}\n`);
  await assert.rejects(
    validateCapabilityEvidenceBindings(registry, {
      repositoryRoot: root,
      bindingsPath
    }),
    /Evidence path does not exist/
  );
});

test('evidence binding must target a test already named by that capability', async t => {
  const root = await mkdtemp(join(tmpdir(), 'axiom-capability-authority-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await Promise.all([
    mkdir(join(root, 'mesh', 'test'), { recursive: true }),
    mkdir(join(root, 'mesh', 'config'), { recursive: true })
  ]);
  await Promise.all([
    writeFile(
      join(root, 'mesh', 'test', 'named.test.mjs'),
      "test('named evidence test', () => { assert.equal(true, true); });\n"
    ),
    writeFile(
      join(root, 'mesh', 'test', 'other.test.mjs'),
      "test('other evidence test', () => { assert.equal(true, true); });\n"
    )
  ]);
  const bindingsPath = join(
    root,
    'mesh',
    'config',
    'capability-evidence-bindings.json'
  );
  const registry = {
    kernel_version: '1.0.0',
    capabilities: [{
      id: 'feature.one',
      status: 'implemented',
      evidence: ['mesh/test/named.test.mjs']
    }]
  };
  await writeFile(bindingsPath, `${JSON.stringify({
    schema: 'axiom-capability-evidence-bindings.v1',
    kernel_version: '1.0.0',
    registry_digest: digestObject(registry),
    bindings: [{
      capability_id: 'feature.one',
      path: 'mesh/test/other.test.mjs',
      test: 'other evidence test',
      assertions: ['assert.equal(true, true);']
    }]
  }, null, 2)}\n`);

  await assert.rejects(
    validateCapabilityEvidenceBindings(registry, {
      repositoryRoot: root,
      bindingsPath
    }),
    /binding path is not named by its registry evidence/
  );
});
