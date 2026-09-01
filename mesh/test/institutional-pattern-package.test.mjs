import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { validateInstitutionalPatternPackage } from '../src/lib/institutional-pattern-package.mjs';

const registryUrl = new URL('../../institutional/primitives.v1.json', import.meta.url);
const packageUrl = new URL('../../institutional/examples/appointment-credential-review-cycle.v1.json', import.meta.url);

async function load() {
  const registry = JSON.parse(await readFile(registryUrl, 'utf8'));
  const pattern = JSON.parse(await readFile(packageUrl, 'utf8'));
  const primitiveIds = new Set(registry.primitives.map(({ id }) => id));
  return { registry, pattern, primitiveIds };
}

test('institutional pattern is inert, locally adapted, simulated, and composed only from known primitives', async () => {
  const { pattern, primitiveIds } = await load();
  const result = validateInstitutionalPatternPackage(pattern, { primitiveIds });
  assert.equal(result.valid, true);
  assert.equal(result.authority_effect, 'none');
  assert.equal(result.local_adaptation_required, true);
  assert.equal(result.simulation_required_before_live_adoption, true);
  assert.ok(result.primitive_count >= 8);
});

test('imported pattern cannot smuggle authority', async () => {
  const { pattern, primitiveIds } = await load();
  for (const field of [
    'import_grants_authority',
    'installation_grants_authority',
    'pattern_role_grants_authority',
    'credential_grants_authority',
    'collective_result_grants_authority'
  ]) {
    const mutated = structuredClone(pattern);
    mutated.authority[field] = true;
    assert.throws(
      () => validateInstitutionalPatternPackage(mutated, { primitiveIds }),
      new RegExp(field)
    );
  }
});

test('pattern cannot disable local effect admission, adaptation, or simulation gates', async () => {
  const { pattern, primitiveIds } = await load();

  const noAdmission = structuredClone(pattern);
  noAdmission.authority.effect_requires_local_admission = false;
  assert.throws(() => validateInstitutionalPatternPackage(noAdmission, { primitiveIds }), /effect_requires_local_admission/);

  const noAdaptation = structuredClone(pattern);
  noAdaptation.local_adaptation_required = false;
  assert.throws(() => validateInstitutionalPatternPackage(noAdaptation, { primitiveIds }), /require local adaptation/);

  const noSimulation = structuredClone(pattern);
  noSimulation.simulation_required_before_live_adoption = false;
  assert.throws(() => validateInstitutionalPatternPackage(noSimulation, { primitiveIds }), /require simulation/);
});

test('domain projection remains vocabulary, not primitive semantics', async () => {
  const projections = JSON.parse(await readFile(
    new URL('../../institutional/domain-projections.v1.json', import.meta.url),
    'utf8'
  ));
  const registry = JSON.parse(await readFile(registryUrl, 'utf8'));
  const ids = new Set(registry.primitives.map(({ id }) => id));

  for (const domain of Object.values(projections.domains)) {
    for (const primitive of Object.keys(domain.mappings)) {
      assert.ok(ids.has(primitive), primitive);
    }
  }
});
