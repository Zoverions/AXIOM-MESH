import test from 'node:test';
import assert from 'node:assert/strict';

import { createGenerativeInterfaceProposal } from '../src/lib/generative-interface-proposal.mjs';
import { buildGenerativeInterfaceRenderPlan } from '../src/lib/generative-interface-renderer-schema-gate.mjs';

function fixture() {
  const componentRegistry = [{ type: 'heading' }];
  const operationCatalog = [{
    operation_ref: 'verify.receipt.inspect',
    consequence: 'read-only',
    confirmation: 'not-required'
  }];
  const contextProjection = { receipt_id: 'receipt:demo' };
  const capabilitySnapshot = { discovery_only: true };
  const proposal = createGenerativeInterfaceProposal({
    proposalId: 'proposal:unknown-prop',
    generator: {
      provider_ref: 'provider:lab',
      model_ref: 'model:lab',
      adapter_ref: 'adapter:lab'
    },
    renderer: {
      renderer_ref: 'renderer:trusted-lab',
      renderer_version: '0.1.0'
    },
    componentRegistry,
    operationCatalog,
    contextProjection,
    capabilitySnapshot,
    components: [{
      component_id: 'component:title',
      type: 'heading',
      props: { text: 'Receipt', style: 'admin' },
      action_request_id: null
    }],
    actionRequests: [],
    proposedAt: '2026-09-18T00:00:00.000Z'
  });
  return {
    proposal,
    validationContext: {
      componentRegistry,
      operationCatalog,
      contextProjection,
      capabilitySnapshot
    }
  };
}

function manifest() {
  return {
    renderer_ref: 'renderer:trusted-lab',
    renderer_version: '0.1.0',
    components: [{
      type: 'heading',
      props_schema: {
        additional_props: false,
        fields: [{ name: 'text', type: 'string', required: true }]
      }
    }]
  };
}

test('a G0-valid component with an untrusted prop is rejected by the renderer gate', () => {
  const { proposal, validationContext } = fixture();
  assert.throws(
    () => buildGenerativeInterfaceRenderPlan({
      proposal,
      validationContext,
      rendererManifest: manifest()
    }),
    /unknown prop style/i
  );
});

test('trusted renderer manifests cannot opt into arbitrary additional props', () => {
  const { proposal, validationContext } = fixture();
  const rendererManifest = manifest();
  rendererManifest.components[0].props_schema.additional_props = true;
  assert.throws(
    () => buildGenerativeInterfaceRenderPlan({
      proposal,
      validationContext,
      rendererManifest
    }),
    /fail closed on additional props/i
  );
});
