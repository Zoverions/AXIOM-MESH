import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  computeDependencyClosureDigest,
  finalizeReproducibilityClosure
} from '../src/lib/epistemic-reproducibility-closure.mjs';

const D = (hex = 'a') => `sha256:${hex.repeat(64)}`;

function validInput(overrides = {}) {
  const input = {
    schema: 'axiom-epistemic-reproducibility-closure.v0',
    version: '0.1.0',
    status: 'inert-evidence',
    closure_id: 'closure:authority:001',
    target: {
      target_ref: 'claim:001',
      target_kind: 'epistemic_claim',
      target_digest: D('1')
    },
    verifier: {
      verifier_id: 'validator:fixture',
      verifier_version: '1.0.0',
      implementation_digest: D('2'),
      profile_digest: D('3')
    },
    environment: { environment_digest: D('4') },
    dependencies: [],
    dependency_closure_digest: '',
    coverage_claim: 'target_only',
    replay: {
      mode: 'original',
      actor_ref: 'actor:fixture',
      run_id: 'run:fixture',
      input_digest: D('5'),
      output_digest: D('6')
    },
    result: 'pass',
    limitations: [],
    recorded_at: '2026-09-08T16:00:00.000Z',
    contains_secret_material: false,
    canonical_state: 'proposal',
    authority_effect: 'none',
    network_effect: 'none',
    execution_authority: false,
    ...overrides
  };
  input.dependency_closure_digest = computeDependencyClosureDigest(input.dependencies);
  return input;
}

test('E2-RC cannot claim truth, scalar confidence, canonicality, independence, or authority', () => {
  for (const mutation of [
    { verified: true },
    { truth: true },
    { confidence: 1 },
    { score: 100 },
    { independent: true },
    { capability_id: 'cap:forbidden' },
    { grant_id: 'grant:forbidden' },
    { consent: true },
    { permission: true },
    { canonical_state: 'canonical' },
    { authority_effect: 'allow' },
    { network_effect: 'allowed' },
    { execution_authority: true }
  ]) {
    assert.throws(
      () => finalizeReproducibilityClosure(validInput(mutation)),
      /unknown|canonical|authority|network|execution|field/i
    );
  }
});

test('E2-RC production module imports no authority, network, provider, prover, or filesystem surfaces', async () => {
  const source = await readFile(
    new URL('../src/lib/epistemic-reproducibility-closure.mjs', import.meta.url),
    'utf8'
  );
  const imports = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map(match => match[1]);
  assert.deepEqual(imports, ['./canonical.mjs']);

  const forbiddenImports = [
    'node:fs',
    'node:http',
    'node:https',
    'node:net',
    'node:dgram',
    'node:tls',
    'node:child_process'
  ];
  for (const token of forbiddenImports) {
    assert.equal(imports.includes(token), false, `forbidden production import: ${token}`);
  }
  for (const token of ['fetch(', 'WebSocket', 'process.env', 'process.cwd()', 'Date.now()', 'Math.random()']) {
    assert.equal(source.includes(token), false, `forbidden ambient/effect surface: ${token}`);
  }
});

test('E0/E1 approved schema bytes remain exact', async () => {
  const expectedSchemaDigests = new Map([
    ['epistemic-record-v0.schema.json', 'd647878abe6912d580ac60122b4a15a2ae845b411d4236630ce19a62deb0c7ae'],
    ['epistemic-source-v0.schema.json', 'd359eb1238eb44d573ff273aa8b89780b42b85b7e67f0f80f2a47f3eae6a3868'],
    ['epistemic-claim-v0.schema.json', 'a7c6b20afcb223a2e48db9543d5e332bb8de9b752110d68b80582e63f02f2c87'],
    ['epistemic-evidence-v0.schema.json', '207ab9477334eb6654869abc9e688a7cbe40ba5065c72f349f22ede8d944d628']
  ]);

  for (const [name, expected] of expectedSchemaDigests) {
    const bytes = await readFile(new URL(`../config/${name}`, import.meta.url));
    const actual = createHash('sha256').update(bytes).digest('hex');
    assert.equal(actual, expected, `${name} must remain byte-identical to Amendment A approval`);
  }
});

test('E2-RC creates no runnable capability', async () => {
  const registry = JSON.parse(await readFile(
    new URL('../config/capabilities.json', import.meta.url),
    'utf8'
  ));
  assert.deepEqual(
    registry.capabilities
      .map(item => item.id)
      .filter(id => /reproduc|epistemic/i.test(id)),
    []
  );
});

test('E2-RC schema contains no truth, confidence, independence, capability, grant, consent, or permission field', async () => {
  const schema = JSON.parse(await readFile(
    new URL('../config/epistemic-reproducibility-closure-v0.schema.json', import.meta.url),
    'utf8'
  ));
  const forbidden = new Set([
    'truth', 'confidence', 'score', 'verified', 'independent',
    'capability', 'capability_id', 'grant', 'grant_id', 'consent', 'permission'
  ]);

  const walk = value => {
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }
    if (!value || typeof value !== 'object') return;
    for (const [key, nested] of Object.entries(value)) {
      assert.equal(forbidden.has(key), false, `forbidden schema field: ${key}`);
      walk(nested);
    }
  };
  walk(schema);
});
