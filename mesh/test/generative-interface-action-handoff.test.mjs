import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { digestObject } from '../src/lib/canonical.mjs';
import { createGenerativeInterfaceProposal } from '../src/lib/generative-interface-proposal.mjs';
import {
  GENERATIVE_INTERFACE_ACTION_HANDOFF_SCHEMA,
  buildGenerativeInterfaceActionHandoff
} from '../src/lib/generative-interface-action-handoff.mjs';

function componentRegistry() {
  return [{ type: 'action' }];
}

function operationCatalog() {
  return [
    {
      operation_ref: 'workspace.edit.propose',
      consequence: 'reversible',
      confirmation: 'not-required'
    }
  ];
}

function contextProjection() {
  return {
    purpose: 'workspace-edit',
    artifact_id: 'artifact:workspace'
  };
}

function capabilitySnapshot() {
  return {
    principal_ref: 'principal:owner',
    implemented: ['workspace.edit.propose'],
    available: ['workspace.edit.propose'],
    authorized: []
  };
}

function validationContext() {
  return {
    componentRegistry: componentRegistry(),
    operationCatalog: operationCatalog(),
    contextProjection: contextProjection(),
    capabilitySnapshot: capabilitySnapshot()
  };
}

function proposal(overrides = {}) {
  return createGenerativeInterfaceProposal({
    proposalId: 'ui:proposal-g2',
    generator: {
      provider_ref: 'provider:fixture',
      model_ref: 'model:fixture',
      adapter_ref: 'adapter:fixture'
    },
    renderer: {
      renderer_ref: 'renderer:axiom-one',
      renderer_version: '0.1.0'
    },
    componentRegistry: componentRegistry(),
    operationCatalog: operationCatalog(),
    contextProjection: contextProjection(),
    capabilitySnapshot: capabilitySnapshot(),
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
        arguments: { artifact_id: 'artifact:workspace' },
        consequence: 'reversible',
        confirmation: 'not-required'
      }
    ],
    proposedAt: '2026-09-18T01:15:00.000Z',
    ...overrides
  });
}

function trustedOperationManifest(overrides = {}) {
  const argumentSchema = overrides.argument_schema ?? {
    schema_ref: 'schema:workspace-edit-propose-args',
    schema_version: '1.0.0',
    additional_args: false,
    fields: [
      {
        name: 'artifact_id',
        type: 'string',
        required: true
      }
    ]
  };
  const confirmationPolicy = overrides.confirmation_policy ?? {
    policy_ref: 'policy:workspace-edit-current',
    policy_version: '7',
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
    confirmation_policy_digest: digestObject(confirmationPolicy),
    ...overrides
  };
}

function build(overrides = {}) {
  return buildGenerativeInterfaceActionHandoff({
    proposal: overrides.proposal ?? proposal(),
    validationContext: overrides.validationContext ?? validationContext(),
    selectedRequestId: overrides.selectedRequestId ?? 'request:edit',
    trustedOperationManifest:
      overrides.trustedOperationManifest ?? trustedOperationManifest()
  });
}

test('G2 validates trusted arguments and rebuilds canonical confirmation without granting authority', () => {
  const result = build();

  assert.equal(result.schema, GENERATIVE_INTERFACE_ACTION_HANDOFF_SCHEMA);
  assert.equal(result.version, 0);
  assert.equal(result.status, 'inert-action-handoff-candidate');
  assert.equal(result.request_id, 'request:edit');
  assert.equal(result.operation_ref, 'workspace.edit.propose');
  assert.equal(result.consequence, 'reversible');
  assert.equal(result.proposal_confirmation, 'not-required');
  assert.equal(result.canonical_confirmation.required, true);
  assert.equal(
    result.canonical_confirmation.confirmation_ref,
    'confirmation:workspace-edit-current'
  );
  assert.equal(result.arguments.artifact_id, 'artifact:workspace');
  assert.equal(result.authority_effect, 'none');
  assert.equal(result.execution_effect, 'none');
  assert.equal(result.network_effect, 'none');
  assert.equal(result.runtime_activation, false);
  assert.equal(result.effect_handoff, 'none');
});

test('current confirmation policy is independent from generated consequence and confirmation copy', () => {
  const noConfirmation = {
    policy_ref: 'policy:workspace-edit-current',
    policy_version: '8',
    required: false,
    confirmation_ref: null
  };
  const manifest = trustedOperationManifest({
    confirmation_policy: noConfirmation,
    confirmation_policy_digest: digestObject(noConfirmation)
  });

  const result = build({ trustedOperationManifest: manifest });
  assert.equal(result.consequence, 'reversible');
  assert.equal(result.proposal_confirmation, 'not-required');
  assert.equal(result.canonical_confirmation.required, false);
  assert.equal(result.canonical_confirmation.confirmation_ref, null);
  assert.equal(result.authority_effect, 'none');
});

test('unknown selected action requests fail closed', () => {
  assert.throws(
    () => build({ selectedRequestId: 'request:missing' }),
    /selected action request.*not present/i
  );
});

test('trusted operation metadata must bind the exact G0 catalog entry', () => {
  const manifest = trustedOperationManifest({
    catalog_entry_digest: '0'.repeat(64)
  });
  assert.throws(
    () => build({ trustedOperationManifest: manifest }),
    /catalog entry digest/i
  );
});

test('trusted operation consequence drift fails closed before action handoff', () => {
  const manifest = trustedOperationManifest({ consequence: 'consequential' });
  assert.throws(
    () => build({ trustedOperationManifest: manifest }),
    /consequence.*current trusted operation metadata/i
  );
});

test('trusted argument schema rejects unknown missing and mistyped generated arguments', () => {
  const withUnknown = proposal({
    actionRequests: [
      {
        request_id: 'request:edit',
        operation_ref: 'workspace.edit.propose',
        arguments: {
          artifact_id: 'artifact:workspace',
          hidden_mode: 'force'
        },
        consequence: 'reversible',
        confirmation: 'not-required'
      }
    ]
  });
  assert.throws(
    () => build({ proposal: withUnknown }),
    /contains unknown argument hidden_mode/i
  );

  const missing = proposal({
    actionRequests: [
      {
        request_id: 'request:edit',
        operation_ref: 'workspace.edit.propose',
        arguments: {},
        consequence: 'reversible',
        confirmation: 'not-required'
      }
    ]
  });
  assert.throws(
    () => build({ proposal: missing }),
    /missing required argument artifact_id/i
  );

  const mistyped = proposal({
    actionRequests: [
      {
        request_id: 'request:edit',
        operation_ref: 'workspace.edit.propose',
        arguments: { artifact_id: 42 },
        consequence: 'reversible',
        confirmation: 'not-required'
      }
    ]
  });
  assert.throws(
    () => build({ proposal: mistyped }),
    /argument artifact_id must be string/i
  );
});

test('argument schema and confirmation policy digests are independently verified', () => {
  assert.throws(
    () => build({
      trustedOperationManifest: trustedOperationManifest({
        argument_schema_digest: '1'.repeat(64)
      })
    }),
    /argument schema digest/i
  );

  assert.throws(
    () => build({
      trustedOperationManifest: trustedOperationManifest({
        confirmation_policy_digest: '2'.repeat(64)
      })
    }),
    /confirmation policy digest/i
  );
});

test('v0 argument schemas reject unconstrained nested object or array values', () => {
  for (const unsupportedType of ['object', 'array']) {
    const argumentSchema = {
      schema_ref: 'schema:nested-not-yet-supported',
      schema_version: '1.0.0',
      additional_args: false,
      fields: [
        {
          name: 'artifact_id',
          type: unsupportedType,
          required: true
        }
      ]
    };
    assert.throws(
      () => build({
        trustedOperationManifest: trustedOperationManifest({
          argument_schema: argumentSchema,
          argument_schema_digest: digestObject(argumentSchema)
        })
      }),
      /unsupported argument type/i
    );
  }
});

test('confirmation policy shape fails closed and cannot imply authority when confirmation is absent', () => {
  const invalidPolicy = {
    policy_ref: 'policy:workspace-edit-current',
    policy_version: '9',
    required: false,
    confirmation_ref: 'confirmation:should-not-exist'
  };
  assert.throws(
    () => build({
      trustedOperationManifest: trustedOperationManifest({
        confirmation_policy: invalidPolicy,
        confirmation_policy_digest: digestObject(invalidPolicy)
      })
    }),
    /confirmation_ref must be null when confirmation is not required/i
  );

  const noConfirmation = {
    policy_ref: 'policy:workspace-edit-current',
    policy_version: '10',
    required: false,
    confirmation_ref: null
  };
  const result = build({
    trustedOperationManifest: trustedOperationManifest({
      confirmation_policy: noConfirmation,
      confirmation_policy_digest: digestObject(noConfirmation)
    })
  });
  assert.equal(result.canonical_confirmation.required, false);
  assert.equal(result.authority_effect, 'none');
  assert.equal(result.effect_handoff, 'none');
});

test('G2 production module remains pure and contains no effect-capable imports', () => {
  const source = readFileSync(
    new URL('../src/lib/generative-interface-action-handoff.mjs', import.meta.url),
    'utf8'
  );
  for (const forbidden of [
    'node:fs',
    'node:child_process',
    'node:http',
    'node:https',
    'node:net',
    'node:tls',
    'gateway',
    'grid',
    'capabilities.json',
    'fetch('
  ]) {
    assert.equal(
      source.toLowerCase().includes(forbidden.toLowerCase()),
      false,
      `G2 action handoff must not import or invoke effect surface ${forbidden}`
    );
  }
});
