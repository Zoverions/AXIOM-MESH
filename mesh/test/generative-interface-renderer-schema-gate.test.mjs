import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createGenerativeInterfaceProposal
} from '../src/lib/generative-interface-proposal.mjs';
import {
  buildGenerativeInterfaceRenderPlan
} from '../src/lib/generative-interface-renderer-schema-gate.mjs';

function componentRegistry() {
  return [
    { type: 'heading' },
    { type: 'action' }
  ];
}

function operationCatalog() {
  return [
    {
      operation_ref: 'verify.receipt.inspect',
      consequence: 'read-only',
      confirmation: 'not-required'
    }
  ];
}

function contextProjection() {
  return { receipt_id: 'receipt:demo' };
}

function capabilitySnapshot() {
  return { discovery_only: true };
}

function proposal() {
  return createGenerativeInterfaceProposal({
    proposalId: 'proposal:renderer-lab',
    generator: {
      provider_ref: 'provider:lab',
      model_ref: 'model:lab',
      adapter_ref: 'adapter:lab'
    },
    renderer: {
      renderer_ref: 'renderer:trusted-lab',
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
        props: { text: 'Receipt' },
        action_request_id: null
      },
      {
        component_id: 'component:inspect',
        type: 'action',
        props: { label: 'Inspect' },
        action_request_id: 'request:inspect'
      }
    ],
    actionRequests: [
      {
        request_id: 'request:inspect',
        operation_ref: 'verify.receipt.inspect',
        arguments: { receipt_id: 'receipt:demo' },
        consequence: 'read-only',
        confirmation: 'not-required'
      }
    ],
    proposedAt: '2026-09-18T00:00:00.000Z'
  });
}

function validationContext() {
  return {
    componentRegistry: componentRegistry(),
    operationCatalog: operationCatalog(),
    contextProjection: contextProjection(),
    capabilitySnapshot: capabilitySnapshot()
  };
}

function rendererManifest() {
  return {
    renderer_ref: 'renderer:trusted-lab',
    renderer_version: '0.1.0',
    components: [
      {
        type: 'heading',
        props_schema: {
          additional_props: false,
          fields: [
            { name: 'text', type: 'string', required: true }
          ]
        }
      },
      {
        type: 'action',
        props_schema: {
          additional_props: false,
          fields: [
            { name: 'label', type: 'string', required: true }
          ]
        }
      }
    ]
  };
}

test('trusted renderer schema gate produces an inert bound render plan', () => {
  const plan = buildGenerativeInterfaceRenderPlan({
    proposal: proposal(),
    validationContext: validationContext(),
    rendererManifest: rendererManifest()
  });

  assert.equal(plan.schema, 'axiom-generative-interface-render-plan.v0');
  assert.equal(plan.proposal_id, 'proposal:renderer-lab');
  assert.match(plan.proposal_digest, /^[a-f0-9]{64}$/);
  assert.match(plan.renderer_manifest_digest, /^[a-f0-9]{64}$/);
  assert.equal(plan.authority_effect, 'none');
  assert.equal(plan.network_effect, 'none');
  assert.equal(plan.runtime_activation, false);
  assert.equal(plan.effect_handoff, 'none');
  assert.equal(plan.components.length, 2);
  assert.equal(plan.components[1].action_request_id, 'request:inspect');
});

test('unknown generated props fail closed', () => {
  const generated = structuredClone(proposal());
  generated.components[0].props.style = 'admin';
  assert.throws(
    () => buildGenerativeInterfaceRenderPlan({
      proposal: generated,
      validationContext: validationContext(),
      rendererManifest: rendererManifest()
    }),
    /components digest|unknown prop/i
  );
});

test('missing required generated props fail closed', () => {
  const generated = proposal();
  const manifest = rendererManifest();
  manifest.components[0].props_schema.fields.push({
    name: 'level',
    type: 'integer',
    required: true
  });
  assert.throws(
    () => buildGenerativeInterfaceRenderPlan({
      proposal: generated,
      validationContext: validationContext(),
      rendererManifest: manifest
    }),
    /required prop level/i
  );
});

test('generated prop type mismatch fails closed', () => {
  const manifest = rendererManifest();
  manifest.components[0].props_schema.fields[0].type = 'integer';
  assert.throws(
    () => buildGenerativeInterfaceRenderPlan({
      proposal: proposal(),
      validationContext: validationContext(),
      rendererManifest: manifest
    }),
    /prop text.*integer/i
  );
});

test('renderer identity must match the trusted manifest', () => {
  const manifest = rendererManifest();
  manifest.renderer_version = '0.2.0';
  assert.throws(
    () => buildGenerativeInterfaceRenderPlan({
      proposal: proposal(),
      validationContext: validationContext(),
      rendererManifest: manifest
    }),
    /renderer.*does not match/i
  );
});

test('duplicate trusted component schemas fail closed', () => {
  const manifest = rendererManifest();
  manifest.components.push(structuredClone(manifest.components[0]));
  assert.throws(
    () => buildGenerativeInterfaceRenderPlan({
      proposal: proposal(),
      validationContext: validationContext(),
      rendererManifest: manifest
    }),
    /duplicate.*heading/i
  );
});

test('missing trusted component schema fails closed', () => {
  const manifest = rendererManifest();
  manifest.components = manifest.components.filter(entry => entry.type !== 'action');
  assert.throws(
    () => buildGenerativeInterfaceRenderPlan({
      proposal: proposal(),
      validationContext: validationContext(),
      rendererManifest: manifest
    }),
    /component type action.*trusted renderer manifest/i
  );
});
