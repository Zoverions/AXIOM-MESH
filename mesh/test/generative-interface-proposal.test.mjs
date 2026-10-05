import assert from 'node:assert/strict';
import test from 'node:test';
import { digestObject } from '../src/lib/canonical.mjs';
import {
  GENERATIVE_INTERFACE_PROPOSAL_SCHEMA,
  createGenerativeInterfaceProposal,
  validateGenerativeInterfaceProposal
} from '../src/lib/generative-interface-proposal.mjs';

function componentRegistry() {
  return [
    { type: 'heading' },
    { type: 'text' },
    { type: 'action' }
  ];
}

function operationCatalog() {
  return [
    {
      operation_ref: 'workspace.edit.propose',
      consequence: 'reversible',
      confirmation: 'canonical-required'
    },
    {
      operation_ref: 'verify.receipt.inspect',
      consequence: 'read-only',
      confirmation: 'not-required'
    },
    {
      operation_ref: 'artifact.delete.request',
      consequence: 'consequential',
      confirmation: 'canonical-required'
    }
  ];
}

function contextProjection() {
  return {
    purpose: 'workspace-edit',
    artifact_id: 'artifact:workspace',
    visible_summary: 'Shared draft is ready for review.'
  };
}

function capabilitySnapshot() {
  return {
    principal_ref: 'principal:owner',
    implemented: ['workspace.edit.propose', 'verify.receipt.inspect'],
    available: ['workspace.edit.propose', 'verify.receipt.inspect'],
    authorized: []
  };
}

function proposalInput(overrides = {}) {
  return {
    proposalId: 'ui:proposal-1',
    generator: {
      provider_ref: 'provider:fixture',
      model_ref: 'model:oui-fixture',
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
        component_id: 'component:title',
        type: 'heading',
        props: { text: 'Review shared draft' },
        action_request_id: null
      },
      {
        component_id: 'component:edit',
        type: 'action',
        props: { label: 'Review proposed edit' },
        action_request_id: 'request:edit'
      }
    ],
    actionRequests: [
      {
        request_id: 'request:edit',
        operation_ref: 'workspace.edit.propose',
        arguments: { artifact_id: 'artifact:workspace' },
        consequence: 'reversible',
        confirmation: 'canonical-required'
      }
    ],
    proposedAt: '2026-09-17T23:15:00.000Z',
    ...overrides
  };
}

function validationContext(overrides = {}) {
  return {
    componentRegistry: componentRegistry(),
    operationCatalog: operationCatalog(),
    contextProjection: contextProjection(),
    capabilitySnapshot: capabilitySnapshot(),
    ...overrides
  };
}

test('allowed components and operations produce one exact inert interface proposal', () => {
  const input = proposalInput();
  const proposal = createGenerativeInterfaceProposal(input);
  const result = validateGenerativeInterfaceProposal(proposal, validationContext());

  assert.equal(result.valid, true);
  assert.equal(result.schema, GENERATIVE_INTERFACE_PROPOSAL_SCHEMA);
  assert.equal(result.proposal_id, 'ui:proposal-1');
  assert.equal(result.component_registry_digest, digestObject(componentRegistry()));
  assert.equal(result.operation_catalog_digest, digestObject(operationCatalog()));
  assert.equal(result.context_projection_digest, digestObject(contextProjection()));
  assert.equal(result.capability_snapshot_digest, digestObject(capabilitySnapshot()));
  assert.equal(result.components_digest, digestObject(input.components));
  assert.equal(result.action_requests_digest, digestObject(input.actionRequests));
  assert.equal(result.authority_effect, 'none');
  assert.equal(result.network_effect, 'none');
  assert.equal(result.runtime_activation, false);
  assert.equal(proposal.action_requests[0].authorization_claim, 'none');
  assert.equal(proposal.action_requests[0].execution_effect, 'none');
});

test('unknown component types fail closed', () => {
  const input = proposalInput();
  input.components[0].type = 'unregistered-widget';
  assert.throws(() => createGenerativeInterfaceProposal(input), /component type.*not registered/i);
});

test('unknown operations fail closed even when capability discovery mentions them', () => {
  const input = proposalInput();
  input.actionRequests[0].operation_ref = 'gateway.admin.bypass';
  input.capabilitySnapshot.available.push('gateway.admin.bypass');
  assert.throws(() => createGenerativeInterfaceProposal(input), /operation.*not in the supplied catalog/i);
});

test('generated action requests cannot downgrade a catalog confirmation requirement', () => {
  const input = proposalInput();
  input.actionRequests[0].confirmation = 'not-required';
  assert.throws(() => createGenerativeInterfaceProposal(input), /confirmation.*catalog/i);
});

test('generated action requests cannot rewrite catalog consequence metadata', () => {
  const input = proposalInput();
  input.actionRequests[0].consequence = 'non-consequential-local-draft';
  assert.throws(() => createGenerativeInterfaceProposal(input), /consequence.*catalog/i);
});

test('confirmation requirements are preserved independently from consequence labels', () => {
  const input = proposalInput();
  input.operationCatalog[0].consequence = 'consequential';
  input.operationCatalog[0].confirmation = 'not-required';
  input.actionRequests[0].consequence = 'consequential';
  input.actionRequests[0].confirmation = 'not-required';

  const proposal = createGenerativeInterfaceProposal(input);
  assert.equal(proposal.action_requests[0].consequence, 'consequential');
  assert.equal(proposal.action_requests[0].confirmation, 'not-required');
  assert.equal(proposal.action_requests[0].authorization_claim, 'none');
  assert.equal(proposal.action_requests[0].execution_effect, 'none');
});

test('generated arguments cannot smuggle authority approval grant credential or token material', () => {
  for (const forbidden of ['authorization', 'approval', 'grant', 'credential', 'token', 'capability_proof']) {
    const input = proposalInput();
    input.actionRequests[0].arguments = {
      artifact_id: 'artifact:workspace',
      nested: { [forbidden]: 'fabricated-by-ui-model' }
    };
    assert.throws(
      () => createGenerativeInterfaceProposal(input),
      new RegExp(`reserved authority field.*${forbidden}`, 'i')
    );
  }
});

test('authority field spelling variants cannot bypass generated argument filtering', () => {
  for (const forbidden of ['capabilityProof', 'capability-proof', 'capability proof']) {
    const input = proposalInput();
    input.actionRequests[0].arguments = {
      artifact_id: 'artifact:workspace',
      nested: { [forbidden]: 'fabricated-by-ui-model' }
    };
    assert.throws(
      () => createGenerativeInterfaceProposal(input),
      /reserved authority field/i
    );
  }
});

test('validation binds the proposal to exact context capability registry and operation snapshots', () => {
  const proposal = createGenerativeInterfaceProposal(proposalInput());

  assert.throws(() => validateGenerativeInterfaceProposal(proposal, validationContext({
    contextProjection: { ...contextProjection(), visible_summary: 'Changed after generation.' }
  })), /context projection digest/i);

  assert.throws(() => validateGenerativeInterfaceProposal(proposal, validationContext({
    capabilitySnapshot: { ...capabilitySnapshot(), available: ['verify.receipt.inspect'] }
  })), /capability snapshot digest/i);

  assert.throws(() => validateGenerativeInterfaceProposal(proposal, validationContext({
    componentRegistry: [...componentRegistry(), { type: 'card' }]
  })), /component registry digest/i);

  assert.throws(() => validateGenerativeInterfaceProposal(proposal, validationContext({
    operationCatalog: operationCatalog().slice(0, 2)
  })), /operation catalog digest/i);
});

test('generator and renderer identities remain provenance and cannot change authority state', () => {
  const proposal = createGenerativeInterfaceProposal(proposalInput({
    generator: {
      provider_ref: 'provider:any-external-model',
      model_ref: 'model:any-ui-generator',
      adapter_ref: 'adapter:any-ui-adapter'
    },
    renderer: {
      renderer_ref: 'renderer:third-party-skin',
      renderer_version: '99.0.0'
    }
  }));

  assert.equal(proposal.authority_effect, 'none');
  assert.equal(proposal.network_effect, 'none');
  assert.equal(proposal.runtime_activation, false);

  const tampered = structuredClone(proposal);
  tampered.authority_effect = 'granted';
  assert.throws(() => validateGenerativeInterfaceProposal(tampered, validationContext()), /authority effect must be none/i);
});

test('unknown proposal fields malformed timestamps and tampered action payloads fail closed', () => {
  const proposal = createGenerativeInterfaceProposal(proposalInput());

  const unknown = structuredClone(proposal);
  unknown.permission = 'allow';
  assert.throws(() => validateGenerativeInterfaceProposal(unknown, validationContext()), /unknown field permission/i);

  const badTime = structuredClone(proposal);
  badTime.proposed_at = '2026-09-17';
  assert.throws(() => validateGenerativeInterfaceProposal(badTime, validationContext()), /canonical UTC timestamp/i);

  const tampered = structuredClone(proposal);
  tampered.action_requests[0].arguments.artifact_id = 'artifact:other';
  assert.throws(() => validateGenerativeInterfaceProposal(tampered, validationContext()), /action requests digest/i);
});

test('duplicate component registry types fail closed', () => {
  const input = proposalInput();
  input.componentRegistry = [...componentRegistry(), { type: 'heading' }];
  assert.throws(
    () => createGenerativeInterfaceProposal(input),
    /component registry contains duplicate type heading/i
  );
});

test('duplicate component ids fail closed', () => {
  const input = proposalInput();
  input.components = [
    ...input.components,
    {
      component_id: 'component:title',
      type: 'text',
      props: { text: 'duplicate id' },
      action_request_id: null
    }
  ];
  assert.throws(
    () => createGenerativeInterfaceProposal(input),
    /duplicate component component:title/i
  );
});

test('duplicate action request ids fail closed even with different arguments', () => {
  const input = proposalInput();
  input.actionRequests = [
    ...input.actionRequests,
    {
      request_id: 'request:edit',
      operation_ref: 'verify.receipt.inspect',
      arguments: { receipt_id: 'receipt:other' },
      consequence: 'read-only',
      confirmation: 'not-required'
    }
  ];
  input.components.push({
    component_id: 'component:inspect',
    type: 'action',
    props: { label: 'Inspect' },
    action_request_id: 'request:edit'
  });
  assert.throws(
    () => createGenerativeInterfaceProposal(input),
    /duplicate action request request:edit/i
  );
});
