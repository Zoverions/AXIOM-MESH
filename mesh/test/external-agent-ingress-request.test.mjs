import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { ValidationError } from '../src/lib/canonical.mjs';
import {
  EXTERNAL_AGENT_INGRESS_REQUEST_SCHEMA,
  EXTERNAL_AGENT_INGRESS_REQUEST_SCHEMA_ID,
  createExternalAgentIngressRequest,
  validateExternalAgentIngressRequest
} from '../src/lib/external-agent-ingress-request.mjs';

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);
const NOW = Date.parse('2026-09-20T15:01:00.000Z');
const OPTIONS = Object.freeze({ now: NOW });

function baseInput(overrides = {}) {
  return {
    request_id: overrides.request_id || 'req.muse.1',
    source: overrides.source || {
      surface: 'muse-connector',
      provider: 'meta-muse',
      transport_profile: 'muse',
      connector_ref: 'axiom.external-agent.v0',
      context_digest: A
    },
    principal: overrides.principal || {
      external_principal_ref: 'muse:user:123',
      identity_claim_external_only: true
    },
    intent: overrides.intent || {
      axiom_action: 'service.read',
      input_digest: B,
      requested_effect: 'read-external',
      purpose: 'Read bounded status',
      resource_refs: ['status:one']
    },
    observed_at: overrides.observed_at || '2026-09-20T15:00:00.000Z',
    expires_at: overrides.expires_at || '2026-09-20T15:02:00.000Z',
    evidence: overrides.evidence || {
      source_refs: ['https://muse.ai/platform'],
      external_claim_only: true
    }
  };
}

function clone(value) {
  return structuredClone(value);
}

function allObjectSchemasClosed(node) {
  if (!node || typeof node !== 'object' || Array.isArray(node)) return true;
  if ((node.type === 'object' || node.properties || node.required) && node.additionalProperties !== false) {
    return false;
  }
  return Object.values(node).every((value) => {
    if (Array.isArray(value)) return value.every(allObjectSchemasClosed);
    return allObjectSchemasClosed(value);
  });
}

test('Muse-shaped ingress is deterministic, bounded, and zero-authority', () => {
  const first = createExternalAgentIngressRequest(baseInput(), OPTIONS);
  const second = createExternalAgentIngressRequest(baseInput(), OPTIONS);

  assert.equal(first.schema, EXTERNAL_AGENT_INGRESS_REQUEST_SCHEMA);
  assert.equal(first.request_digest, second.request_digest);
  assert.equal(first.authority_state, 'unresolved');
  assert.equal(first.credentials_present, false);
  assert.equal(first.grants_authority, false);
  assert.equal(first.execution_effect, 'none');
  assert.equal(first.network_effect, 'none');
  assert.equal(first.principal.identity_claim_external_only, true);
  assert.equal(first.evidence.external_claim_only, true);
  assert.ok(Object.isFrozen(first));

  assert.deepEqual(validateExternalAgentIngressRequest(first, OPTIONS), {
    valid: true,
    schema: EXTERNAL_AGENT_INGRESS_REQUEST_SCHEMA,
    request_digest: first.request_digest,
    authority_state: 'unresolved',
    authority_effect: 'none',
    execution_effect: 'none',
    network_effect: 'none'
  });
});

test('external agent cannot smuggle credentials or pre-authorized state', () => {
  const request = createExternalAgentIngressRequest(baseInput(), OPTIONS);

  for (const mutation of [
    (value) => { value.credentials_present = true; },
    (value) => { value.grants_authority = true; },
    (value) => { value.authority_state = 'authorized'; },
    (value) => { value.execution_effect = 'write-external'; },
    (value) => { value.network_effect = 'provider-remote'; }
  ]) {
    const forged = clone(request);
    mutation(forged);
    assert.throws(
      () => validateExternalAgentIngressRequest(forged, OPTIONS),
      (error) => error instanceof ValidationError
    );
  }
});

test('tampering with an accepted request invalidates its content-addressed digest', () => {
  const request = createExternalAgentIngressRequest(baseInput(), OPTIONS);
  const tampered = clone(request);
  tampered.intent.purpose = 'Different purpose';
  assert.throws(
    () => validateExternalAgentIngressRequest(tampered, OPTIONS),
    /digest mismatch/
  );
});

test('expired, future, and overlong ingress requests fail closed', () => {
  const expired = createExternalAgentIngressRequest(baseInput(), OPTIONS);
  assert.throws(
    () => validateExternalAgentIngressRequest(expired, {
      now: Date.parse('2026-09-20T15:03:00.000Z')
    }),
    /expired/
  );

  assert.throws(
    () => createExternalAgentIngressRequest(baseInput({
      observed_at: '2026-09-20T15:01:30.000Z',
      expires_at: '2026-09-20T15:02:30.000Z'
    }), OPTIONS),
    /future/
  );

  assert.throws(
    () => createExternalAgentIngressRequest(baseInput({
      expires_at: '2026-09-20T15:10:00.000Z'
    }), OPTIONS),
    /lifetime exceeds/
  );
});

test('raw context and unknown fields are rejected rather than silently ignored', () => {
  const input = baseInput();
  input.source = { ...input.source, raw_context: 'do not admit raw conversation state' };
  assert.throws(
    () => createExternalAgentIngressRequest(input, OPTIONS),
    /unknown field raw_context/
  );

  const topLevel = { ...baseInput(), approval_token: 'forged' };
  assert.throws(
    () => createExternalAgentIngressRequest(topLevel, OPTIONS),
    /unknown field approval_token/
  );
});

test('external identity is claim-only and cannot be upgraded by transport profile', () => {
  for (const transport_profile of ['muse', 'mcp', 'a2a', 'other']) {
    const request = createExternalAgentIngressRequest(baseInput({
      source: { ...baseInput().source, transport_profile }
    }), OPTIONS);
    const result = validateExternalAgentIngressRequest(request, OPTIONS);
    assert.equal(result.authority_effect, 'none');
    assert.equal(result.authority_state, 'unresolved');
  }
});

test('unsupported transport/effect values and duplicate refs fail closed', () => {
  assert.throws(
    () => createExternalAgentIngressRequest(baseInput({
      source: { ...baseInput().source, transport_profile: 'magic-authority' }
    }), OPTIONS),
    /transport_profile is invalid/
  );

  assert.throws(
    () => createExternalAgentIngressRequest(baseInput({
      intent: { ...baseInput().intent, requested_effect: 'root-authority' }
    }), OPTIONS),
    /requested_effect is invalid/
  );

  assert.throws(
    () => createExternalAgentIngressRequest(baseInput({
      evidence: {
        source_refs: ['https://muse.ai/platform', 'https://muse.ai/platform'],
        external_claim_only: true
      }
    }), OPTIONS),
    /duplicate values/
  );
});

test('canonicalization failures are normalized to ValidationError', () => {
  const request = clone(createExternalAgentIngressRequest(baseInput(), OPTIONS));
  Object.defineProperty(request.intent, 'hidden_state', {
    value: 'must-not-escape-as-TypeError',
    enumerable: false
  });
  assert.throws(
    () => validateExternalAgentIngressRequest(request, OPTIONS),
    (error) => error instanceof ValidationError
      && /cannot be canonically digested/.test(error.message)
  );
});

test('schema hard-codes the zero-authority ingress boundary', () => {
  const schema = JSON.parse(readFileSync(
    new URL('../config/external-agent-ingress-request-v0.schema.json', import.meta.url),
    'utf8'
  ));
  assert.equal(schema.$id, EXTERNAL_AGENT_INGRESS_REQUEST_SCHEMA_ID);
  assert.equal(schema.properties.schema.const, EXTERNAL_AGENT_INGRESS_REQUEST_SCHEMA);
  assert.equal(schema.properties.authority_state.const, 'unresolved');
  assert.equal(schema.properties.credentials_present.const, false);
  assert.equal(schema.properties.grants_authority.const, false);
  assert.equal(schema.properties.execution_effect.const, 'none');
  assert.equal(schema.properties.network_effect.const, 'none');
  assert.equal(schema.properties.principal.properties.identity_claim_external_only.const, true);
  assert.equal(schema.properties.evidence.properties.external_claim_only.const, true);
  assert.equal(allObjectSchemasClosed(schema), true);

  const observedPattern = new RegExp(schema.properties.observed_at.pattern);
  assert.equal(observedPattern.test('2026-09-20T15:00:00.000Z'), true);
  assert.equal(observedPattern.test('2026-09-20T15:00:00Z'), false);
  assert.equal(observedPattern.test('2026-09-20T11:00:00.000-04:00'), false);
  assert.equal(
    schema.properties.expires_at.pattern,
    schema.properties.observed_at.pattern
  );
});

test('A0 implementation has no network, Gateway, authority-engine, or secret path', () => {
  const source = readFileSync(
    new URL('../src/lib/external-agent-ingress-request.mjs', import.meta.url),
    'utf8'
  );
  const imports = [...source.matchAll(/^import .* from ['"]([^'"]+)['"];$/gm)].map((match) => match[1]);
  assert.deepEqual(imports, ['./canonical.mjs']);
  for (const forbidden of [
    'fetch(',
    'node:http',
    'node:https',
    'process.env',
    'Authorization',
    'Bearer ',
    '/gateway/',
    '/hypervisor/',
    '/sandbox/',
    '/grid/'
  ]) {
    assert.equal(source.includes(forbidden), false, `forbidden A0 dependency: ${forbidden}`);
  }
});
