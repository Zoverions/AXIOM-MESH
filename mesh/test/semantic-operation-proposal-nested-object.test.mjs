import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createInertOperationManifestFixture,
  createSemanticOperationProposal,
  normalizeGenericProviderResult
} from '../src/lib/semantic-operation-proposal.mjs';

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);

function schema(type, required, { enum_values = null, properties = null } = {}) {
  return { type, required, enum_values, properties };
}

function nestedManifest() {
  return createInertOperationManifestFixture({
    operations: [
      {
        operation_id: 'op.inert.configure',
        description: 'Configure inert nested settings',
        arguments: {
          settings: schema('object', true, {
            properties: {
              label: schema('string', true),
              flags: schema('object', true, {
                properties: {
                  enabled: schema('boolean', true)
                }
              })
            }
          })
        }
      },
      {
        operation_id: 'op.inert.echo',
        description: 'Echo inert text',
        arguments: {
          value: schema('string', true)
        }
      },
      {
        operation_id: 'op.inert.limit',
        description: 'Record inert limit',
        arguments: {
          value: schema('integer', false)
        }
      }
    ]
  });
}

function provider() {
  return {
    provider_ref: 'provider.semantic-op.nested-fixture',
    profile_ref: 'profile.semantic-op.local.v0',
    artifact_ref: 'artifact.semantic-op.nested-fixture.v0',
    runtime_ref: 'runtime.semantic-op.fixture.v0',
    revision_evidence: 'content-addressed',
    provider_mode: 'owner-local'
  };
}

function proposal(argumentsValue) {
  const manifest = nestedManifest();
  const providerIdentity = provider();
  const candidates = manifest.operations.map((entry) => ({
    operation_id: entry.operation_id,
    eligible: true,
    eligibility_reason: 'eligible'
  }));
  const providerResult = normalizeGenericProviderResult({
    calls: [{
      operation_id: 'op.inert.configure',
      arguments: { settings: argumentsValue },
      confidence: 0.8
    }],
    suppressed: [],
    confidence: 0.8,
    latency_ms: 1,
    usage_evidence: null,
    explanation: null
  });
  return createSemanticOperationProposal({
    provider: providerIdentity,
    manifest,
    candidates,
    request_digest: A,
    state_digest: B,
    state_classification: 'internal',
    candidate_mode: 'eligible-only',
    provider_result: providerResult,
    expected_provider_identity: providerIdentity,
    locality_policy: 'any',
    calibration_report_ref: null
  });
}

test('nested object arguments are validated recursively before proposal', () => {
  const valid = proposal({ label: 'safe', flags: { enabled: true } });
  assert.equal(valid.proposed.length, 1);
  assert.equal(valid.withheld.length, 0);

  const missingRequired = proposal({ label: 'safe', flags: {} });
  assert.equal(missingRequired.proposed.length, 0);
  assert.equal(missingRequired.withheld[0].reason, 'missing-required-argument');

  const unknownNested = proposal({
    label: 'safe',
    flags: { enabled: true, surprise: true }
  });
  assert.equal(unknownNested.proposed.length, 0);
  assert.equal(unknownNested.withheld[0].reason, 'unknown-argument');

  const wrongNestedType = proposal({ label: 'safe', flags: { enabled: 'yes' } });
  assert.equal(wrongNestedType.proposed.length, 0);
  assert.equal(wrongNestedType.withheld[0].reason, 'wrong-argument-type');
});

test('malformed nested argument schemas fail closed before manifest use', () => {
  assert.throws(
    () => createInertOperationManifestFixture({
      operations: [
        {
          operation_id: 'op.inert.configure',
          description: 'Configure inert nested settings',
          arguments: {
            settings: schema('object', true, {
              properties: {
                broken: { type: 'string', required: true, enum_values: null }
              }
            })
          }
        },
        {
          operation_id: 'op.inert.echo',
          description: 'Echo inert text',
          arguments: { value: schema('string', true) }
        },
        {
          operation_id: 'op.inert.limit',
          description: 'Record inert limit',
          arguments: { value: schema('integer', false) }
        }
      ]
    }),
    /properties is required/
  );
});
