import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import test from 'node:test';

import { digestObject } from '../src/lib/canonical.mjs';
import { MeshIdentity } from '../src/lib/identity.mjs';
import { intentRequestDigest } from '../src/lib/intent-binding.mjs';
import {
  buildNativeInvocationEnvelope,
  invocationEnvelopeDigest
} from '../src/lib/invocation-envelope.mjs';
import { buildPlan, planDigest } from '../src/lib/plan.mjs';
import {
  buildContextProjectionReceipt,
  buildContextTaskBinding,
  contextTaskBindingIdentity,
  validateContextProjectionReceipt,
  verifyContextTaskBinding
} from '../src/lib/context-task-binding.mjs';

function gridIdentity() {
  const pair = generateKeyPairSync('ed25519');
  return new MeshIdentity(
    'grid',
    pair.privateKey.export({ type: 'pkcs8', format: 'pem' }),
    pair.publicKey.export({ type: 'spki', format: 'pem' })
  );
}

function projection({ machineAuthorityDigest, viewDigest = '1'.repeat(64) } = {}) {
  const authority = {
    schema: 'axiom-context-projection-authority.v1',
    principal_id: machineAuthorityDigest ? 'agent.context-task' : 'owner.context-task',
    principal_type: machineAuthorityDigest ? 'agent' : 'human',
    purpose: 'project.execution',
    purpose_binding: machineAuthorityDigest
      ? 'machine-principal-constraint'
      : 'authenticated-request-selector',
    scope_mode: 'finite-authenticated-scopes',
    context_scopes: ['context:project'],
    ...(machineAuthorityDigest
      ? { machine_authority_digest: machineAuthorityDigest }
      : {})
  };
  authority.authority_digest = digestObject(authority);
  const authorization = {
    ...authority,
    projected_context_scopes: ['context:project']
  };
  return {
    schema: 'axiom-context-projection.v1',
    principal: authority.principal_id,
    purpose: authority.purpose,
    scopes: ['context:project'],
    usable_claims: [],
    conflicts: [],
    withheld_claims: [],
    authority_effect: 'none',
    as_of: '2026-08-11T22:00:00.000Z',
    view_digest: viewDigest,
    evidence: {
      schema: 'axiom-context-grid-evidence.v1',
      grid_chain: {
        valid: true,
        verification_mode: 'full',
        last_seq: 12,
        last_hash: '2'.repeat(64)
      },
      memory_owner: authority.principal_id,
      visible_context_objects: 1
    },
    authorization,
    projection_digest: digestObject({
      view_digest: viewDigest,
      authorization
    }),
    request: {
      owner: authority.principal_id,
      purpose: authority.purpose,
      as_of: '2026-08-11T22:00:00.000Z',
      max_claims: 64,
      authority_digest: authority.authority_digest
    }
  };
}

function intent(contextBinding) {
  return {
    intent_id: 'intent_context_task_binding',
    principal: {
      id: 'owner.context-task',
      type: 'human',
      roles: ['operator'],
      scopes: ['*']
    },
    action: 'system.echo',
    input: { message: 'context-bound' },
    purpose: 'project.execution',
    data_scopes: [],
    context_binding: contextBinding,
    confirmations: [],
    approval_ids: [],
    submitted_at: '2026-08-11T22:01:00.000Z'
  };
}

function decision() {
  return {
    allow: true,
    risk: 'low',
    tool: 'system.echo',
    effect: 'system.echo',
    timeout_ms: 1_000,
    constraints: {},
    policy_version: 'test-policy.v1',
    policy_digest: 'd'.repeat(64),
    policy_layers: [],
    rule_id: 'test:context-binding'
  };
}

test('Grid-signed context projection receipt becomes a non-authorizing task binding', () => {
  const identity = gridIdentity();
  const receipt = buildContextProjectionReceipt(projection(), identity);
  const validated = validateContextProjectionReceipt(receipt);
  const binding = buildContextTaskBinding(receipt);
  const verified = verifyContextTaskBinding(binding, identity.publicKey, {
    principalId: 'owner.context-task',
    purpose: 'project.execution'
  });

  assert.equal(validated.statement.authority_effect, 'none');
  assert.equal(verified.view_digest, receipt.statement.view_digest);
  assert.deepEqual(contextTaskBindingIdentity(binding), {
    schema: 'axiom-context-task-binding.v1',
    view_digest: receipt.statement.view_digest,
    projection_digest: receipt.statement.projection_digest,
    authority_digest: receipt.statement.authority_digest,
    receipt_digest: receipt.receipt_digest
  });
});

test('context receipt is causally bound through request, invocation, and plan digests', () => {
  const identity = gridIdentity();
  const firstBinding = buildContextTaskBinding(buildContextProjectionReceipt(
    projection({ viewDigest: '1'.repeat(64) }),
    identity
  ));
  const secondBinding = buildContextTaskBinding(buildContextProjectionReceipt(
    projection({ viewDigest: '3'.repeat(64) }),
    identity
  ));
  const firstIntent = intent(firstBinding);
  const secondIntent = intent(secondBinding);
  const firstInvocation = buildNativeInvocationEnvelope(firstIntent, decision());
  const secondInvocation = buildNativeInvocationEnvelope(secondIntent, decision());
  const firstPlan = buildPlan(firstIntent, decision());
  const secondPlan = buildPlan(secondIntent, decision());

  assert.notEqual(intentRequestDigest(firstIntent), intentRequestDigest(secondIntent));
  assert.notEqual(
    invocationEnvelopeDigest(firstInvocation),
    invocationEnvelopeDigest(secondInvocation)
  );
  assert.notEqual(planDigest(firstPlan), planDigest(secondPlan));
  assert.deepEqual(
    firstInvocation.request.context_binding,
    contextTaskBindingIdentity(firstBinding)
  );
  assert.equal(firstPlan.context.authority_effect, 'none');
  assert.equal(firstPlan.context.view_digest, firstBinding.view_digest);
  assert.ok(firstPlan.decision_provenance.observable_inputs.includes('intent.context_binding'));
});

test('context task binding rejects digest substitution and receipt tampering', () => {
  const identity = gridIdentity();
  const receipt = buildContextProjectionReceipt(projection(), identity);
  const binding = buildContextTaskBinding(receipt);

  assert.throws(
    () => buildContextTaskBinding({
      ...receipt,
      receipt_digest: 'f'.repeat(64)
    }),
    /receipt digest does not match/
  );
  assert.throws(
    () => verifyContextTaskBinding({
      ...binding,
      view_digest: 'e'.repeat(64)
    }, identity.publicKey),
    /does not match its projection receipt/
  );
});

test('context projection receipt is principal, purpose, and machine-authority bound', () => {
  const identity = gridIdentity();
  const machineAuthorityDigest = 'a'.repeat(64);
  const binding = buildContextTaskBinding(buildContextProjectionReceipt(
    projection({ machineAuthorityDigest }),
    identity
  ));

  assert.throws(
    () => verifyContextTaskBinding(binding, identity.publicKey, {
      principalId: 'agent.other',
      purpose: 'project.execution',
      machineAuthorityDigest
    }),
    error => error.code === 'context_receipt_principal_mismatch'
  );
  assert.throws(
    () => verifyContextTaskBinding(binding, identity.publicKey, {
      principalId: 'agent.context-task',
      purpose: 'project.other',
      machineAuthorityDigest
    }),
    error => error.code === 'context_receipt_purpose_mismatch'
  );
  assert.throws(
    () => verifyContextTaskBinding(binding, identity.publicKey, {
      principalId: 'agent.context-task',
      purpose: 'project.execution',
      machineAuthorityDigest: 'b'.repeat(64)
    }),
    error => error.code === 'context_receipt_machine_authority_mismatch'
  );
});
