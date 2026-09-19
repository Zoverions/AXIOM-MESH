import assert from 'node:assert/strict';
import test from 'node:test';
import { digestObject } from '../src/lib/canonical.mjs';
import { createGenerativeInterfaceProposal } from '../src/lib/generative-interface-proposal.mjs';
import { buildGenerativeInterfaceActionHandoff } from '../src/lib/generative-interface-action-handoff.mjs';

// External regression provenance (evidence only, never authority):
// openai/openai-agents-python v0.22.3
// PR #5066 head 77ccd462acc469bb16088dd4cd8f6ed3d2343539
// merged as 1d17ca40b927452d5f27df662092f767fa9f05b7
// The upstream bug class allowed conditional approval to inspect arguments that
// differed from the arguments ultimately used after validation. AXIOM G2 v0
// intentionally has a narrower contract: validation may reject or clone scalar
// arguments, but it must not add defaults, coerce values, or transform them.

function operationCatalog() {
  return [
    {
      operation_ref: 'workspace.edit.propose',
      consequence: 'reversible',
      confirmation: 'not-required'
    }
  ];
}

function validationContext() {
  return {
    componentRegistry: [{ type: 'action' }],
    operationCatalog: operationCatalog(),
    contextProjection: {
      purpose: 'workspace-edit',
      artifact_id: 'artifact:workspace'
    },
    capabilitySnapshot: {
      principal_ref: 'principal:owner',
      implemented: ['workspace.edit.propose'],
      available: ['workspace.edit.propose'],
      authorized: []
    }
  };
}

function proposal(argumentsValue) {
  const context = validationContext();
  return createGenerativeInterfaceProposal({
    proposalId: 'ui:validated-argument-binding-regression',
    generator: {
      provider_ref: 'provider:fixture',
      model_ref: 'model:fixture',
      adapter_ref: 'adapter:fixture'
    },
    renderer: {
      renderer_ref: 'renderer:axiom-one',
      renderer_version: '0.1.0'
    },
    componentRegistry: context.componentRegistry,
    operationCatalog: context.operationCatalog,
    contextProjection: context.contextProjection,
    capabilitySnapshot: context.capabilitySnapshot,
    components: [
      {
        component_id: 'component:edit',
        type: 'action',
        props: { label: 'Propose edit' },
        action_request_id: 'request:edit'
      }
    ],
    actionRequests: [
      {
        request_id: 'request:edit',
        operation_ref: 'workspace.edit.propose',
        arguments: argumentsValue,
        consequence: 'reversible',
        confirmation: 'not-required'
      }
    ],
    proposedAt: '2026-09-18T05:10:00.000Z'
  });
}

function manifest(argumentSchema) {
  const confirmationPolicy = {
    policy_ref: 'policy:workspace-edit-current',
    policy_version: '1',
    required: true,
    confirmation_ref: 'confirmation:workspace-edit-current'
  };
  return {
    operation_ref: 'workspace.edit.propose',
    operation_version: '1.0.0',
    catalog_entry_digest: digestObject(operationCatalog()[0]),
    consequence: 'reversible',
    argument_schema: argumentSchema,
    argument_schema_digest: digestObject(argumentSchema),
    confirmation_policy: confirmationPolicy,
    confirmation_policy_digest: digestObject(confirmationPolicy)
  };
}

function build(argumentsValue, argumentSchema) {
  return buildGenerativeInterfaceActionHandoff({
    proposal: proposal(argumentsValue),
    validationContext: validationContext(),
    selectedRequestId: 'request:edit',
    trustedOperationManifest: manifest(argumentSchema)
  });
}

test('G2 v0 confirmation handoff preserves exact validated argument values and omission set', () => {
  const argumentSchema = {
    schema_ref: 'schema:workspace-edit-propose-args',
    schema_version: '1.0.0',
    additional_args: false,
    fields: [
      { name: 'artifact_id', type: 'string', required: true },
      { name: 'revision', type: 'integer', required: true },
      { name: 'note', type: 'string', required: false }
    ]
  };
  const original = {
    artifact_id: 'artifact:workspace',
    revision: 7
  };

  const handoff = build(original, argumentSchema);

  assert.deepEqual(handoff.arguments, original);
  assert.equal(digestObject(handoff.arguments), digestObject(original));
  assert.equal(Object.hasOwn(handoff.arguments, 'note'), false);
  assert.equal(handoff.canonical_confirmation.required, true);
  assert.equal(handoff.authority_effect, 'none');
  assert.equal(handoff.execution_effect, 'none');
});

test('G2 v0 fails closed instead of coercing an argument before confirmation', () => {
  const argumentSchema = {
    schema_ref: 'schema:workspace-edit-propose-args',
    schema_version: '1.0.0',
    additional_args: false,
    fields: [
      { name: 'artifact_id', type: 'string', required: true },
      { name: 'revision', type: 'integer', required: true }
    ]
  };

  assert.throws(
    () => build({ artifact_id: 'artifact:workspace', revision: '7' }, argumentSchema),
    /argument revision must be integer/i
  );
});
