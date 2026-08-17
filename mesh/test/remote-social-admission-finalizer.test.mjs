import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { digestObject } from '../src/lib/canonical.mjs';
import { signedFetch } from '../src/lib/client.mjs';
import { intentRequestDigest } from '../src/lib/intent-binding.mjs';
import {
  REMOTE_SOCIAL_ADMISSION_ACTION,
  REMOTE_SOCIAL_ADMISSION_DATA_SCOPE,
  REMOTE_SOCIAL_ADMISSION_PURPOSE,
  remoteSocialAdmissionIntentInputFromStage
} from '../src/lib/remote-social-admission-authority.mjs';
import {
  REMOTE_SOCIAL_ADMISSION_FINALIZER_SCHEMA,
  normalizeRemoteSocialAdmissionFinalizerRequest
} from '../src/lib/remote-social-admission-finalizer.mjs';
import { PUBLICATION_PERSONA_SCHEMA } from '../src/identity/actor-state.mjs';
import {
  createPublicPersonaProjection,
  createSocialPublicationProjection
} from '../src/lib/social-publication.mjs';
import { createSocialExchangePackage } from '../src/lib/social-exchange-package.mjs';
import { startDevelopmentStack } from '../src/dev.mjs';
import { finalizeRemoteSocialAdmission } from '../src/hypervisor/remote-social-admission-finalizer.mjs';
import { reserveProductionPortBlock } from '../src/lib/production-host.mjs';

function iso(offsetMs) {
  return new Date(Date.now() + offsetMs).toISOString();
}

function packageFixture() {
  const pair = generateKeyPairSync('ed25519');
  const privateKey = pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const publicKey = pair.publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const persona = {
    schema: PUBLICATION_PERSONA_SCHEMA,
    persona_id: 'persona-finalizer-remote',
    controller_actor_id: 'actor-private-finalizer-remote',
    represented_actor_id: null,
    attribution_mode: 'pseudonymous',
    public_actor_link: null,
    selective_link_commitment: null,
    delegation_authority_digest: null,
    created_at: iso(-300_000),
    status: 'active'
  };
  const publication = createSocialPublicationProjection({
    publication_id: 'publication-finalizer-remote',
    content: { media_type: 'text/plain', text: 'Remote observation is not local authorship.' },
    attachment_digests: [],
    audience: { mode: 'public' },
    discoverability: 'listed',
    authorship_mode: 'human-authored',
    created_at: iso(-240_000),
    supersedes_digest: null
  }, { persona });
  return {
    publicKey,
    package: createSocialExchangePackage({
      personas: [createPublicPersonaProjection(persona)],
      publications: [publication],
      transitions: [],
      exporterGridId: 'grid-finalizer-remote',
      exporterPrivateKey: privateKey,
      exporterPublicKey: publicKey,
      createdAt: iso(-180_000),
      now: Date.now()
    })
  };
}

function runtimeIntent(stage, owner, input = remoteSocialAdmissionIntentInputFromStage(stage)) {
  return {
    action: REMOTE_SOCIAL_ADMISSION_ACTION,
    input,
    purpose: REMOTE_SOCIAL_ADMISSION_PURPOSE,
    data_scopes: [REMOTE_SOCIAL_ADMISSION_DATA_SCOPE],
    principal: { id: owner, type: 'human' }
  };
}

function grantAuthority(store, stage, intent, {
  owner = stage.owner,
  intentId = 'intent-finalizer-remote-admit',
  approvalId = 'approval-finalizer-remote-admit'
} = {}) {
  const requestDigest = intentRequestDigest(intent);
  store.appendEvents({
    traceId: 'trace-finalizer-intent',
    actor: owner,
    events: [{
      kind: 'intent.accepted',
      subject: intentId,
      payload: {
        intent_id: intentId,
        principal: owner,
        action: REMOTE_SOCIAL_ADMISSION_ACTION,
        risk: 'high',
        input_digest: digestObject(intent.input),
        request_digest: requestDigest
      }
    }]
  });
  store.appendEvents({
    traceId: 'trace-finalizer-approval',
    actor: 'principal-independent-reviewer',
    events: [{
      kind: 'approval.granted',
      subject: approvalId,
      payload: {
        approval_id: approvalId,
        approver: 'principal-independent-reviewer',
        requester: owner,
        action: REMOTE_SOCIAL_ADMISSION_ACTION,
        request_digest: requestDigest,
        expires_at: iso(2_400_000)
      }
    }]
  });
  return { intentId, approvalId, requestDigest };
}

async function stackFixture(t) {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-remote-finalizer-'));
  const lease = await reserveProductionPortBlock('remote social finalizer test');
  const basePort = lease.base_port;
  let stack;
  t.after(async () => {
    try { await stack?.stop(); } finally {
      await lease.release();
      await rm(dataDir, { recursive: true, force: true });
    }
  });
  stack = await startDevelopmentStack({
    dataDir,
    environment: 'test',
    autoBootstrap: true,
    gatewayPort: basePort,
    hypervisorPort: basePort + 1,
    sandboxPort: basePort + 2,
    gridPort: basePort + 3,
    hypervisorUrl: `http://127.0.0.1:${basePort + 1}`,
    sandboxUrl: `http://127.0.0.1:${basePort + 2}`,
    gridUrl: `http://127.0.0.1:${basePort + 3}`,
    rateLimitCapacity: 1_000,
    rateLimitRefillPerSecond: 1_000
  });
  return {
    stack,
    grid: stack.services.find(service => service.name === 'grid'),
    hypervisor: stack.services.find(service => service.name === 'hypervisor'),
    gateway: stack.services.find(service => service.name === 'gateway'),
    sandbox: stack.services.find(service => service.name === 'sandbox')
  };
}

function stagePackage(grid, owner = 'principal-finalizer-owner') {
  const fixture = packageFixture();
  return grid.store.stageRemoteSocialPackage({
    owner,
    package: fixture.package,
    trustedExporterPublicKey: fixture.publicKey,
    expectedExporterGridId: fixture.package.statement.exporter.grid_id,
    trustLabel: 'manual-review',
    stagedAt: iso(-120_000),
    expiresAt: iso(1_800_000),
    now: Date.now()
  });
}

test('Hypervisor-only finalizer atomically consumes approval and admits remote observations', async t => {
  const { stack, grid, hypervisor } = await stackFixture(t);
  const stage = stagePackage(grid);
  const intent = runtimeIntent(stage, stage.owner);
  const authority = grantAuthority(grid.store, stage, intent);

  const result = await finalizeRemoteSocialAdmission({
    identity: hypervisor.identity,
    gridUrl: stack.config.gridUrl,
    intent,
    intentId: authority.intentId,
    approvalId: authority.approvalId,
    traceId: 'trace-finalizer-call'
  });

  assert.equal(result.schema, 'axiom-remote-social-admission-finalizer-result.v1');
  assert.equal(result.status, 'admitted');
  assert.equal(result.stage_id, stage.stage_id);
  assert.equal(result.intent_request_digest, authority.requestDigest);
  assert.notEqual(result.intent_request_digest, result.resolved_request_digest);
  assert.equal(result.remote_observation_only, true);
  assert.equal(result.local_authorship_claimed, false);
  assert.equal(result.network_effect, 'none');
  assert.equal(result.authority_effect, 'none');

  const approval = grid.store.db.prepare(
    'SELECT status, consumed_by_intent FROM approvals WHERE approval_id = ?'
  ).get(authority.approvalId);
  assert.deepEqual(approval, { status: 'consumed', consumed_by_intent: authority.intentId });
  assert.equal(grid.store.listRemoteSocialObservations(stage.owner).observations.length, 2);
  assert.equal(grid.store.listSocialCorpus(stage.owner).publications.length, 0);
});

test('stage-summary substitution fails and leaves approval active', async t => {
  const { stack, grid, hypervisor } = await stackFixture(t);
  const stage = stagePackage(grid, 'principal-finalizer-substitution');
  const wrongInput = { ...remoteSocialAdmissionIntentInputFromStage(stage), trust_label: 'second-review' };
  const intent = runtimeIntent(stage, stage.owner, wrongInput);
  const authority = grantAuthority(grid.store, stage, intent, {
    owner: stage.owner,
    intentId: 'intent-finalizer-substitution',
    approvalId: 'approval-finalizer-substitution'
  });

  await assert.rejects(() => finalizeRemoteSocialAdmission({
    identity: hypervisor.identity,
    gridUrl: stack.config.gridUrl,
    intent,
    intentId: authority.intentId,
    approvalId: authority.approvalId,
    traceId: 'trace-finalizer-substitution-call'
  }));

  assert.equal(grid.store.db.prepare(
    'SELECT status FROM approvals WHERE approval_id = ?'
  ).get(authority.approvalId).status, 'active');
  assert.equal(grid.store.listRemoteSocialAdmissions(stage.owner).admissions.length, 0);
});

test('finalizer contract rejects owner injection and non-human principals', () => {
  const input = {
    schema: REMOTE_SOCIAL_ADMISSION_FINALIZER_SCHEMA,
    intent_id: 'intent-finalizer-contract',
    approval_id: 'approval-finalizer-contract',
    intent: {
      action: REMOTE_SOCIAL_ADMISSION_ACTION,
      input: {
        schema: 'axiom-remote-social-admission-intent-input.v1',
        stage_id: `remote_stage_${'1'.repeat(64)}`,
        package_digest: '2'.repeat(64),
        exporter_grid_id: 'grid-contract',
        exporter_key_id: '3'.repeat(64),
        import_plan_digest: '4'.repeat(64),
        trust_label: 'manual-review'
      },
      purpose: REMOTE_SOCIAL_ADMISSION_PURPOSE,
      data_scopes: [REMOTE_SOCIAL_ADMISSION_DATA_SCOPE],
      principal: { id: 'principal-contract', type: 'human' }
    }
  };
  assert.doesNotThrow(() => normalizeRemoteSocialAdmissionFinalizerRequest(input));
  assert.throws(() => normalizeRemoteSocialAdmissionFinalizerRequest({
    ...input,
    owner: 'principal-override'
  }), /fields are invalid/);
  assert.throws(() => normalizeRemoteSocialAdmissionFinalizerRequest({
    ...input,
    intent: { ...input.intent, principal: { id: 'agent-contract', type: 'agent' } }
  }), /requires a human principal/);
});

test('Gateway and Sandbox cannot call the Hypervisor-only finalizer edge', async t => {
  const { stack, gateway, sandbox } = await stackFixture(t);
  const body = {
    schema: REMOTE_SOCIAL_ADMISSION_FINALIZER_SCHEMA,
    intent_id: 'intent-forbidden-finalizer',
    approval_id: 'approval-forbidden-finalizer',
    intent: {
      action: REMOTE_SOCIAL_ADMISSION_ACTION,
      input: {
        schema: 'axiom-remote-social-admission-intent-input.v1',
        stage_id: `remote_stage_${'a'.repeat(64)}`,
        package_digest: 'b'.repeat(64),
        exporter_grid_id: 'grid-forbidden',
        exporter_key_id: 'c'.repeat(64),
        import_plan_digest: 'd'.repeat(64),
        trust_label: 'manual-review'
      },
      purpose: REMOTE_SOCIAL_ADMISSION_PURPOSE,
      data_scopes: [REMOTE_SOCIAL_ADMISSION_DATA_SCOPE],
      principal: { id: 'principal-forbidden', type: 'human' }
    }
  };
  for (const identity of [gateway.identity, sandbox.identity]) {
    await assert.rejects(
      () => signedFetch(identity, 'grid', stack.config.gridUrl, '/internal/v1/social/remote-admit', {
        method: 'POST', body, traceId: 'trace-forbidden-finalizer'
      }),
      error => error?.code === 'service_network_policy_denied'
    );
  }
});
