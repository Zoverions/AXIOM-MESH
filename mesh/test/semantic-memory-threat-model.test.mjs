import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const ROOT = new URL('../../', import.meta.url);

async function text(path) {
  return readFile(new URL(path, ROOT), 'utf8');
}

function normalized(value) {
  return String(value).replace(/\s+/g, ' ').trim();
}

function assertContainsNormalized(haystack, required, label) {
  assert.equal(
    normalized(haystack).includes(normalized(required)),
    true,
    `${label}: ${required}`
  );
}

test('canonical threat model names semantic contagion, SPSS, durable authority separation and atomic content binding', async () => {
  const threat = await text('docs/security/CURRENT-BUILD-THREAT-MODEL.md');
  for (const required of [
    'Semantic-contagion / Self-Propagating Semantic State (SPSS)',
    'Persistence is not authority',
    'Permission to retain bytes does not prove their source',
    'typed semantic provenance',
    'completed-owner-review evidence',
    'context-lane projection',
    'currentness/lineage invalidation',
    'atomic initial content/provenance binding',
    'one signed initial `memory.put`',
    'same owner/object/content digest',
    'historical signed replay remains distinct from present eligibility',
    'not selected by the production Grid service',
    'current Grid server still selects `AcceptedSocialGridStore`',
    'Generic retained source-observation evidence',
    'not proof of source identity or artifact authenticity'
  ]) {
    assertContainsNormalized(threat, required, 'semantic threat boundary missing');
  }
});

test('canonical threat model contains explicit semantic threats, abuse cases and invariants', async () => {
  const threat = await text('docs/security/CURRENT-BUILD-THREAT-MODEL.md');
  for (const required of [
    '| Semantic content attempts durable prompt injection or self-propagation |',
    '| Memory persistence launders instruction or AXIOM authority |',
    '| Stale or derived semantic state survives revocation/quarantine |',
    '| Content/provenance substitution or post-hoc legacy adoption |',
    '| Source-observation overclaim |',
    '| Semantic retransmission becomes an implicit effect |',
    'model/provider/remote-agent content that says to persist itself',
    'accepted but not completed semantic review request',
    'derived summary/paraphrase attempting to preserve an ancestor',
    'pre-existing/legacy memory adopted post hoc',
    'generic source-observation digest being presented as cryptographic',
    'Semantic-memory persistence never creates instruction, policy, capability',
    'Semantic authority does not inherit through derivation',
    'Semantic propagation/retransmission is a privileged effect',
    'remain production-unselected'
  ]) {
    assertContainsNormalized(threat, required, 'semantic security invariant missing');
  }
});

test('agent interoperability keeps persistence, source authenticity, instruction review and effects separate', async () => {
  const architecture = await text(
    'docs/rebuild/AGENT-INTEROPERABILITY-AND-CAPABILITY-SUBSTRATE.md'
  );
  for (const required of [
    'The same rule applies to durable semantic state',
    'Retrieval, summarization, persistence, embedding, ranking, or repeated exposure must not convert text into AXIOM authority',
    'Permission to persist content is distinct from evidence that the source is authentic',
    'Derived memory must not inherit instruction authority',
    'A write-capable Agent Commons, MCP/A2A adapter, social relay, skill system, or remote agent exchange',
    'durable semantic contagion',
    'authority laundering through memory persistence',
    'source/provenance substitution',
    'four assurance questions must remain independent',
    'existing governed `memory.put` path',
    'one non-bypassable trusted commit boundary',
    'production-unselected'
  ]) {
    assertContainsNormalized(architecture, required, 'agent semantic boundary missing');
  }
});

test('production Grid selection and policy remain semantic-laboratory-free', async () => {
  const [grid, policy, capabilities, contentStore, ingestionStore, stateStore] = await Promise.all([
    text('mesh/src/grid/server.mjs'),
    text('mesh/config/policy.json'),
    text('mesh/config/capabilities.json'),
    text('mesh/src/grid/semantic-memory-content-store.mjs'),
    text('mesh/src/grid/semantic-memory-ingestion-store.mjs'),
    text('mesh/src/grid/semantic-memory-state-store.mjs')
  ]);

  assert.match(grid, /import \{ AcceptedSocialGridStore \} from '\.\/accepted-social-store\.mjs';/);
  assert.match(grid, /new AcceptedSocialGridStore\s*\(/);
  for (const forbidden of [
    'SemanticMemoryContentGridStore',
    'SemanticMemoryIngestionGridStore',
    'SemanticMemoryStateGridStore',
    'AXIOM_SEMANTIC_MEMORY'
  ]) {
    assert.equal(grid.includes(forbidden), false, `production Grid selected ${forbidden}`);
  }
  assert.equal(policy.includes('memory.semantic.ingest'), false);
  assert.equal(capabilities.includes('memory.semantic.ingest'), false);

  for (const laboratory of [contentStore, ingestionStore, stateStore]) {
    assert.equal(laboratory.includes("activation_state: 'opt-in-local-laboratory'"), true);
    assert.equal(laboratory.includes('downstream_effect_authority: false'), true);
  }
  assert.equal(contentStore.includes('provider_direct_write_authority: false'), true);
  assert.equal(contentStore.includes('sandbox_tool_wired: false'), true);
  assert.equal(contentStore.includes('gateway_route_wired: false'), true);
  assert.equal(contentStore.includes('capability_registry_promoted: false'), true);
  assert.equal(contentStore.includes('propagation_authority: false'), true);
});
