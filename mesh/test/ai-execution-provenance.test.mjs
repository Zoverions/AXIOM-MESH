import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { digestObject, sha256, ValidationError } from '../src/lib/canonical.mjs';
import {
  LOCAL_ORGANIZE_MODEL,
  LOCAL_ORGANIZE_PROVIDER_ID,
  aiProviderInvokeDigest,
  buildAiProviderReceipt
} from '../src/lib/ai-provider-invoke.mjs';
import {
  AI_EXECUTION_PROVENANCE_SCHEMA,
  aiExecutionProvenanceDigest,
  bindAiExecutionProvenance,
  validateAiExecutionProvenance
} from '../src/lib/ai-execution-provenance.mjs';

function invoke() {
  const includedText = '# Title\n\n- one\n- two\n\nBody line.';
  return {
    schema: 'axiom-ai-provider-invoke.v0',
    provider_id: LOCAL_ORGANIZE_PROVIDER_ID,
    model: LOCAL_ORGANIZE_MODEL,
    purpose: 'owner-local-organize-draft',
    data_scope: { kind: 'owner-selected-note-text', max_chars: 8_000 },
    budget: { max_input_chars: 8_000, max_output_chars: 4_000, max_wall_ms: 10_000 },
    timeout_ms: 10_000,
    cancel: { allowed: true, signal: 'owner-abort' },
    retention: { kind: 'ephemeral-draft', persist: false },
    included_text: includedText,
    note_digest: sha256(includedText),
    draft_only: true,
    principal_id: 'owner.alice'
  };
}

function suggestion() {
  return {
    title: 'Title',
    headings: ['Title'],
    bullets: ['one', 'two'],
    summary_text: 'Headings (1): Title\nBullets (2):\n- one\n- two\nBody:\nBody line.',
    truncated: false,
    char_count: 64
  };
}

function provenance(overrides = {}) {
  const request = invoke();
  const receipt = buildAiProviderReceipt({ invoke: request, suggestion: suggestion() });
  return {
    schema: 'axiom-ai-execution-provenance.v0',
    version: '0.1.0',
    status: 'inert-evidence',
    provenance_id: 'prov.local-organize.001',
    provider_id: LOCAL_ORGANIZE_PROVIDER_ID,
    model: LOCAL_ORGANIZE_MODEL,
    request_digest: aiProviderInvokeDigest(request),
    receipt_digest: digestObject(receipt),
    adapter: {
      adapter_id: 'local.organize.adapter',
      adapter_version: '0.1.0',
      implementation_digest: sha256('local-organize-adapter-v0')
    },
    orchestrator: {
      orchestrator_id: 'axiom-one.local-organize',
      orchestrator_version: '0.1.0'
    },
    runtime: {
      runtime_id: 'deterministic.local.organizer',
      runtime_version: '0.1.0',
      runtime_descriptor_digest: sha256('deterministic-local-organizer-v0')
    },
    context: {
      state_mode: 'stateless',
      context_policy_digest: sha256('owner-selected-note-only'),
      memory_projection_digest: null
    },
    tools: {
      tool_policy_digest: sha256('no-tools'),
      toolset_digest: digestObject([])
    },
    environment: {
      environment_id: 'axiom-one.loopback-preview',
      environment_version: '0.1.0',
      environment_digest: sha256('loopback-no-egress-preview')
    },
    recorded_at: '2026-09-05T23:45:00.000Z',
    contains_secret_material: false,
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false,
    ...overrides
  };
}

test('valid AI execution provenance binds exact provider result', () => {
  const normalized = validateAiExecutionProvenance(provenance());
  assert.equal(normalized.schema, AI_EXECUTION_PROVENANCE_SCHEMA);
  assert.equal(normalized.status, 'inert-evidence');
  assert.equal(normalized.authority_effect, 'none');
  assert.equal(normalized.runtime_activation, false);

  const request = invoke();
  const receipt = buildAiProviderReceipt({ invoke: request, suggestion: suggestion() });
  const binding = bindAiExecutionProvenance({ request, receipt, provenance: provenance() });
  assert.equal(binding.authority_effect, 'none');
  assert.equal(binding.execution_authority, false);
  assert.equal(binding.provenance_digest, aiExecutionProvenanceDigest(provenance()));
});

test('AI execution provenance fails closed on unknown fields and malformed digests', () => {
  assert.throws(
    () => validateAiExecutionProvenance(provenance({ capability_grant: 'x' })),
    error => error instanceof ValidationError && /unknown field/i.test(error.message)
  );
  assert.throws(
    () => validateAiExecutionProvenance(provenance({ request_digest: 'abc' })),
    /request_digest/
  );
});

test('AI execution provenance rejects provider model and exact-result substitution', () => {
  const request = invoke();
  const receipt = buildAiProviderReceipt({ invoke: request, suggestion: suggestion() });

  assert.throws(
    () => bindAiExecutionProvenance({ request, receipt, provenance: provenance({ provider_id: 'other.provider' }) }),
    /provider/i
  );
  assert.throws(
    () => bindAiExecutionProvenance({ request, receipt, provenance: provenance({ model: 'other.model' }) }),
    /model/i
  );
  assert.throws(
    () => bindAiExecutionProvenance({ request, receipt, provenance: provenance({ request_digest: sha256('other-request') }) }),
    /request_digest/i
  );
  assert.throws(
    () => bindAiExecutionProvenance({ request, receipt, provenance: provenance({ receipt_digest: sha256('other-receipt') }) }),
    /receipt_digest/i
  );
});

test('AI execution provenance digest is deterministic', () => {
  assert.equal(aiExecutionProvenanceDigest(provenance()), aiExecutionProvenanceDigest(provenance()));
});

test('AI execution provenance JSON schema mirrors strict evidence boundary', async () => {
  const schema = JSON.parse(await readFile(new URL('../config/ai-execution-provenance-v0.schema.json', import.meta.url), 'utf8'));
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.schema.const, AI_EXECUTION_PROVENANCE_SCHEMA);
  for (const field of ['request_digest', 'receipt_digest', 'adapter', 'orchestrator', 'runtime', 'context', 'tools', 'environment']) {
    assert.ok(schema.required.includes(field), field);
  }
  assert.equal(schema.properties.authority_effect.const, 'none');
  assert.equal(schema.properties.network_effect.const, 'none');
  assert.equal(schema.properties.runtime_activation.const, false);
});
