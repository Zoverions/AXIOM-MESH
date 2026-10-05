import test from 'node:test';
import assert from 'node:assert/strict';

import { createGenerativeInterfaceProposal } from '../src/lib/generative-interface-proposal.mjs';
import { buildGenerativeInterfaceRenderPlan } from '../src/lib/generative-interface-renderer-schema-gate.mjs';

test('v0 rejects object-valued props until nested schemas are explicitly supported', () => {
  const componentRegistry = [{ type: 'panel' }];
  const operationCatalog = [{
    operation_ref: 'verify.receipt.inspect',
    consequence: 'read-only',
    confirmation: 'not-required'
  }];
  const contextProjection = { receipt_id: 'receipt:demo' };
  const capabilitySnapshot = { discovery_only: true };
  const proposal = createGenerativeInterfaceProposal({
    proposalId: 'proposal:nested-prop',
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
      component_id: 'component:panel',
      type: 'panel',
      props: { metadata: { role: 'admin' } },
      action_request_id: null
    }],
    actionRequests: [],
    proposedAt: '2026-09-18T00:00:00.000Z'
  });

  const rendererManifest = {
    renderer_ref: 'renderer:trusted-lab',
    renderer_version: '0.1.0',
    components: [{
      type: 'panel',
      props_schema: {
        additional_props: false,
        fields: [{ name: 'metadata', type: 'object', required: true }]
      }
    }]
  };

  assert.throws(
    () => buildGenerativeInterfaceRenderPlan({
      proposal,
      validationContext: {
        componentRegistry,
        operationCatalog,
        contextProjection,
        capabilitySnapshot
      },
      rendererManifest
    }),
    /unsupported type object/i
  );
});
