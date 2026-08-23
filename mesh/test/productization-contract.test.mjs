import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

async function readJson(path) {
  return JSON.parse(await readFile(resolve(REPOSITORY_ROOT, path), 'utf8'));
}

async function readText(path) {
  return readFile(resolve(REPOSITORY_ROOT, path), 'utf8');
}

function exactKeys(value, keys, label) {
  assert.deepEqual(Object.keys(value).sort(), [...keys].sort(), `${label} key inventory drifted`);
}

test('install targets distinguish source setup from unfinished host installers without granting authority', async () => {
  const manifest = await readJson('mesh/config/install-targets.json');
  exactKeys(manifest, [
    'schema',
    'version',
    'kernel_version',
    'installation_grants_authority',
    'source_setup',
    'targets'
  ], 'install targets');
  assert.equal(manifest.schema, 'axiom-install-targets.v1');
  assert.equal(manifest.version, 1);
  assert.equal(manifest.kernel_version, '0.12.0-dev.3');
  assert.equal(manifest.installation_grants_authority, false);

  assert.deepEqual(manifest.source_setup, {
    id: 'source-checkout',
    status: 'implemented',
    command: 'npm run setup',
    host_toolchain_installed: false,
    production_credentials_created: false,
    authority_effect: 'none'
  });

  assert.deepEqual(manifest.targets.map(target => target.id), [
    'personal-local',
    'infrastructure-node'
  ]);
  for (const target of manifest.targets) {
    assert.equal(target.status, 'specified');
    assert.equal(target.platform_family, 'linux');
    assert.equal(target.runtime_identity, 'unprivileged-dedicated');
    assert.equal(target.public_ingress_default, false);
    assert.equal(target.external_egress_default, 'deny');
    assert.equal(target.installation_grants_authority, false);
    assert.equal(target.mesh_enrollment, 'explicit-separate-step');
    assert.ok(target.backup_surfaces.includes('local-encrypted-implemented'));
    assert.ok(target.backup_surfaces.includes('remote-provider-adapter-required'));
  }

  const personal = manifest.targets[0];
  assert.equal(personal.priority, 'P0');
  assert.equal(personal.topology, 'single-host');
  assert.equal(personal.intended_operator, 'individual');
  assert.deepEqual(personal.application_catalog, ['axiom-one', 'axiom-education']);

  const infrastructure = manifest.targets[1];
  assert.equal(infrastructure.priority, 'P0-P1');
  assert.equal(infrastructure.topology, 'independent-service-units');
  assert.equal(infrastructure.intended_operator, 'node-operator');
  assert.equal(infrastructure.service_units, 'required');
  assert.deepEqual(infrastructure.role_boundaries, {
    admitted_node: 'implemented-local',
    storage_offer: 'implemented-local-no-object-transfer',
    scheduling: 'implemented-local-no-remote-dispatch',
    causal_exchange: 'implemented-operator-approved-no-consensus'
  });
});

test('application catalog treats Axiom Education as first-class but independently releasable', async () => {
  const catalog = await readJson('mesh/config/application-catalog.json');
  exactKeys(catalog, [
    'schema',
    'version',
    'kernel_version',
    'installation_grants_authority',
    'applications'
  ], 'application catalog');
  assert.equal(catalog.schema, 'axiom-application-catalog.v1');
  assert.equal(catalog.version, 1);
  assert.equal(catalog.kernel_version, '0.12.0-dev.3');
  assert.equal(catalog.installation_grants_authority, false);

  assert.deepEqual(catalog.applications.map(application => application.id), [
    'axiom-one',
    'axiom-education',
    'axiom-circles',
    'axiom-verify',
    'axiom-studio',
    'axiom-managed-node'
  ]);
  for (const application of catalog.applications) {
    assert.equal(application.installation_grants_authority, false);
  }

  const education = catalog.applications.find(application => application.id === 'axiom-education');
  assert.ok(education);
  assert.equal(education.name, 'Axiom Education');
  assert.equal(education.repository, 'Zoverions/Axiom-Education');
  assert.equal(education.release_model, 'independent');
  assert.equal(education.status, 'active-development');
  assert.equal(
    education.mesh_relationship,
    'optional-for-local-offline-required-for-governed-effects'
  );
  assert.equal(
    education.compatibility_profile,
    'config/axiom-mesh-compatibility.v1.json'
  );
});

test('canonical productization documents preserve install, Education, backup, and authority non-claims', async () => {
  const [install, applications, sourceSetup] = await Promise.all([
    readText('docs/operations/HOST-INSTALLATION-PROFILES.md'),
    readText('docs/rebuild/APPLICATION-AND-DOWNSTREAM-INTEGRATION.md'),
    readText('docs/operations/AUTOMATED-SOURCE-SETUP.md')
  ]);

  for (const anchor of [
    '## Installation layers',
    '## Profile A — personal/local node',
    '## Profile B — infrastructure/support node',
    '## Personal cloud and remote backup adapters',
    'https://github.com/Zoverions/Axiom-Education',
    '## Promotion gates for the first real Linux installer',
    'installation never grants authority'
  ]) assert.ok(install.includes(anchor), `host installation document missing ${anchor}`);

  for (const anchor of [
    '## First-class application family',
    '### Axiom Education',
    'https://github.com/Zoverions/Axiom-Education',
    '## Downstream compatibility contract',
    '## Change-impact classes',
    '## Feature-adoption ledger',
    '## Documentation synchronization',
    '## Full-stack principle'
  ]) assert.ok(applications.includes(anchor), `application integration document missing ${anchor}`);

  assert.ok(sourceSetup.includes('does not install Node.js, npm, Git, Docker'));
  assert.ok(sourceSetup.includes('Source setup also does not start services'));
});
