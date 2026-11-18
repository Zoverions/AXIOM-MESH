import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const rootFile = path => new URL(`../../${path}`, import.meta.url);

async function readJson(path) {
  return JSON.parse(await readFile(rootFile(path), 'utf8'));
}

async function readText(path) {
  return readFile(rootFile(path), 'utf8');
}

test('AXIOM source registry exposes only the inert human-interface foundation', async () => {
  const registry = await readJson('registry.json');

  assert.equal(registry.$schema, 'https://ui.shadcn.com/schema/registry.json');
  assert.equal(registry.name, 'axiom-mesh');
  assert.equal(registry.homepage, 'https://github.com/Zoverions/AXIOM-MESH');
  assert.equal(registry.items.length, 1);

  const [item] = registry.items;
  assert.equal(item.name, 'axiom-human-interface-foundation');
  assert.equal(item.type, 'registry:item');
  assert.equal(Object.hasOwn(item, 'dependencies'), false);
  assert.equal(Object.hasOwn(item, 'registryDependencies'), false);
  assert.deepEqual(
    item.files.map(file => [file.path, file.type, file.target]),
    [
      [
        'registry/axiom-ui/interface-contract.json',
        'registry:file',
        '~/axiom-ui/interface-contract.json'
      ],
      [
        'registry/axiom-ui/foundation.css',
        'registry:file',
        '~/axiom-ui/foundation.css'
      ],
      [
        'registry/axiom-ui/INTERFACE-BOUNDARY.md',
        'registry:file',
        '~/axiom-ui/INTERFACE-BOUNDARY.md'
      ]
    ]
  );

  for (const file of item.files) {
    const source = await readText(file.path);
    assert.ok(source.length > 0, `empty registry source: ${file.path}`);
  }
});

test('human-interface contract is fail-closed and cannot become an authority plane', async () => {
  const contract = await readJson('registry/axiom-ui/interface-contract.json');

  assert.equal(contract.schema, 'axiom-human-interface-foundation.v0');
  assert.equal(contract.version, 0);
  assert.equal(contract.status, 'experimental-inert-source-registry');
  assert.equal(contract.authority_effect, 'none');
  assert.equal(contract.network_effect, 'none');
  assert.equal(contract.runtime_activation, false);
  assert.equal(contract.production_claim, false);
  assert.deepEqual(contract.authority_path, [
    'Gateway',
    'Hypervisor',
    'Sandbox',
    'Grid'
  ]);

  assert.deepEqual(contract.invariants, {
    discovery_is_authority: false,
    presentation_is_authority: false,
    model_output_is_authority: false,
    ui_state_may_mint_grants: false,
    unknown_is_authorized: false,
    raw_evidence_remains_available: true,
    consequential_actions_require_explicit_review: true,
    authority_must_come_from_trusted_runtime: true
  });

  assert.equal(contract.semantic_roles.length, 6);
  for (const role of contract.semantic_roles) {
    assert.equal(role.authority_effect, 'none', role.id);
    assert.ok(['none', 'proposal-only'].includes(role.write_effect), role.id);
  }

  assert.deepEqual(contract.registry_policy, {
    external_items_are_untrusted_input: true,
    review_before_adoption: true,
    pin_before_distribution: true,
    third_party_runtime_assets: false,
    remote_runtime_imports: false,
    kernel_dependency: false,
    current_axiom_one_runtime_consumer: false
  });
});

test('foundation tokens are local-only and preserve explicit AXIOM state channels', async () => {
  const css = await readText('registry/axiom-ui/foundation.css');

  for (const marker of [
    '--background:',
    '--foreground:',
    '--primary:',
    '--destructive:',
    '--axiom-state-ready:',
    '--axiom-state-pending:',
    '--axiom-state-denied:',
    '--axiom-state-unknown:',
    '--axiom-state-evidence:',
    '[data-axiom-state="unknown"]'
  ]) {
    assert.ok(css.includes(marker), marker);
  }

  for (const forbidden of [
    '@import',
    'url(http://',
    'url(https://',
    '<script',
    'localStorage',
    'sessionStorage'
  ]) {
    assert.equal(css.includes(forbidden), false, forbidden);
  }
});

test('current AXIOM One runtime does not consume or activate the source registry', async () => {
  const sources = await Promise.all([
    'apps/axiom-one/index.html',
    'apps/axiom-one/app.mjs',
    'apps/axiom-one/server.mjs',
    'apps/axiom-one/sw.mjs',
    'apps/axiom-one/app-policy.json'
  ].map(readText));

  for (const source of sources) {
    assert.equal(source.includes('registry/axiom-ui'), false);
    assert.equal(source.includes('axiom-human-interface-foundation'), false);
  }

  const policy = JSON.parse(sources[4]);
  assert.equal(policy.security.third_party_assets, false);
  assert.equal(policy.network.remote_origins_allowed, false);
});
