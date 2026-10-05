import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function loadContracts() {
  try {
    return await import('../src/lib/epistemic-contracts.mjs');
  } catch (error) {
    assert.fail(`epistemic contracts implementation unavailable: ${error?.code ?? error?.message}`);
  }
}

async function readRequired(url, label) {
  try {
    return await readFile(url, 'utf8');
  } catch (error) {
    assert.fail(`${label} unavailable: ${error?.code ?? error?.message}`);
  }
}

function sourceInput(overrides = {}) {
  return {
    schema: 'axiom-epistemic-record.v0',
    id: 'source:authority-fixture',
    object_type: 'source',
    schema_version: '0.1.0',
    created_at: '2026-09-08T12:00:00.000Z',
    created_by: 'fixture:human',
    revision: 1,
    provenance_refs: [],
    canonical_state: 'proposal',
    machine_generated: false,
    authority_effect: 'none',
    source_type: 'paper',
    retrieved_at: '2026-09-08T12:00:00.000Z',
    original_content_digest: `sha256:${'1'.repeat(64)}`,
    ...overrides
  };
}

test('epistemic proposals cannot claim capability, grant, canonical, or effect authority', async () => {
  const { finalizeEpistemicProposal } = await loadContracts();
  for (const mutation of [
    { authority_effect: 'capability' },
    { canonical_state: 'canonical' },
    { capability_id: 'cap:forbidden' },
    { grant_id: 'grant:forbidden' },
    { execution_authority: true },
    { network_effect: 'allowed' }
  ]) {
    assert.throws(() => finalizeEpistemicProposal(sourceInput(mutation)), /authority|canonical|unknown|property|field/i);
  }
});

test('E0 E1 implementation imports no Mesh authority or network-effect surfaces', async () => {
  const contractsUrl = new URL('../src/lib/epistemic-contracts.mjs', import.meta.url);
  const storeUrl = new URL('../src/lib/epistemic-proposal-store.mjs', import.meta.url);
  const contracts = await readRequired(contractsUrl, 'epistemic contracts source');
  const store = await readRequired(storeUrl, 'epistemic proposal store source');
  const sources = `${contracts}\n${store}`;
  const importTargets = [...sources.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((match) => match[1]);
  const forbidden = [
    'node:http', 'node:https', 'node:net', 'node:dgram', 'node:tls', 'node:child_process',
    'gateway', 'hypervisor', 'sandbox', 'grid', 'capability', 'credential', 'provider', 'wallet'
  ];
  for (const target of importTargets) {
    for (const token of forbidden) assert.equal(target.toLowerCase().includes(token), false, `forbidden import ${target}`);
  }
});

test('capability registry remains free of an epistemic runnable capability', async () => {
  const raw = await readRequired(new URL('../config/capabilities.json', import.meta.url), 'capability registry');
  const registry = JSON.parse(raw);
  const ids = registry.capabilities.map((item) => item.id);
  assert.deepEqual(ids.filter((id) => /epistemic/i.test(id)), []);
});

test('approved schemas structurally pin proposal and zero-authority semantics', async () => {
  const raw = await readRequired(new URL('../config/epistemic-record-v0.schema.json', import.meta.url), 'epistemic record schema');
  const schema = JSON.parse(raw);
  assert.equal(schema.properties.canonical_state.const, 'proposal');
  assert.equal(schema.properties.authority_effect.const, 'none');
});
