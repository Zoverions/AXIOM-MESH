import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { startDevelopmentStack } from '../src/dev.mjs';
import {
  buildCognitiveSelectionAuthorizationIntent,
  validateCognitiveSelectionAuthorizationResult
} from '../src/lib/cognitive-selection-authorization.mjs';

const OWNER = 'local-operator';
const DIGEST_A = 'a'.repeat(64);
const DIGEST_B = 'b'.repeat(64);
const DIGEST_C = 'c'.repeat(64);
const DIGEST_D = 'd'.repeat(64);

function proposal() {
  return {
    valid: true,
    schema: 'axiom-cognitive-selection-proposal.v0',
    version: 0,
    status: 'inert-selection-proposal',
    request_id: 'eligibility.authz.e2e',
    request_digest: DIGEST_A,
    policy_id: 'cognitive.selection.policy.authz.e2e',
    policy_digest: DIGEST_B,
    eligibility_report_digest: DIGEST_C,
    evaluated_profiles: 1,
    eligible_profiles: 1,
    rejected_profiles: [],
    ranked_candidates: [{
      rank: 1,
      profile_id: 'cognitive.example.local',
      offering_ref: 'local/model-example',
      profile_digest: DIGEST_D,
      criterion_values: [{ field: 'economics.cost_class', value: 'low' }]
    }],
    recommendation_made: true,
    recommended_profile_id: 'cognitive.example.local',
    recommended_profile_digest: DIGEST_D,
    ranking_applied: true,
    winner_selected: false,
    requires_gateway_authorization: true,
    execution_effect: 'none',
    authority_effect: 'none',
    network_effect: 'none',
    credential_visibility: 'none',
    runtime_activation: false,
    selection_effect: 'proposal-only'
  };
}

async function findPortBlock() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const base = 20_000 + Math.floor(Math.random() * 20_000);
    const servers = [];
    try {
      for (let port = base; port < base + 4; port += 1) {
        const server = net.createServer();
        await new Promise((resolve, reject) => {
          server.once('error', reject);
          server.listen(port, '127.0.0.1', resolve);
        });
        servers.push(server);
      }
      await Promise.all(servers.map(server => new Promise(resolve => server.close(resolve))));
      return base;
    } catch {
      await Promise.all(servers.map(server => new Promise(resolve => server.close(resolve))));
    }
  }
  throw new Error('Unable to reserve four adjacent local test ports');
}

async function api(base, token, path, {
  method = 'GET',
  body,
  idempotencyKey = `cognitive-authz-${randomUUID()}`
} = {}, expectedStatus = 200) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/json',
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(method === 'GET' ? {} : { 'idempotency-key': idempotencyKey })
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const payload = await response.json();
  assert.equal(response.status, expectedStatus, JSON.stringify(payload));
  return payload;
}

async function fixture(t) {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-cognitive-selection-authz-'));
  const basePort = await findPortBlock();
  const token = `operator-${'o'.repeat(40)}`;
  const overrides = {
    dataDir,
    environment: 'test',
    autoBootstrap: true,
    gatewayPort: basePort,
    hypervisorPort: basePort + 1,
    sandboxPort: basePort + 2,
    gridPort: basePort + 3,
    gatewayUrl: `http://127.0.0.1:${basePort}`,
    hypervisorUrl: `http://127.0.0.1:${basePort + 1}`,
    sandboxUrl: `http://127.0.0.1:${basePort + 2}`,
    gridUrl: `http://127.0.0.1:${basePort + 3}`,
    rateLimitCapacity: 1_000,
    rateLimitRefillPerSecond: 1_000,
    apiTokens: {
      [token]: {
        id: OWNER,
        type: 'human',
        roles: ['administrator'],
        scopes: ['*']
      }
    }
  };
  const stack = await startDevelopmentStack(overrides);
  t.after(async () => {
    try {
      await stack.stop();
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  });
  return { token, gateway: `http://127.0.0.1:${basePort}` };
}

test('real four-service path authorizes the exact cognitive selection without authorizing execution', async t => {
  const fx = await fixture(t);
  const selectionProposal = proposal();
  const intent = buildCognitiveSelectionAuthorizationIntent(selectionProposal);
  const result = await api(fx.gateway, fx.token, '/v1/intents', {
    method: 'POST',
    body: intent
  });

  assert.equal(result.status, 'completed');
  assert.equal(Object.hasOwn(result.evidence, 'effect_destination'), false);
  assert.match(result.evidence.policy_digest, /^[a-f0-9]{64}$/);

  const decision = validateCognitiveSelectionAuthorizationResult(result, selectionProposal);
  assert.equal(decision.status, 'authorized');
  assert.equal(decision.selection_authorized, true);
  assert.equal(decision.selection_applied, false);
  assert.equal(decision.cognitive_execution_authorized, false);
  assert.equal(decision.provider_invocation_authorized, false);
  assert.equal(decision.network_effect, 'none');
  assert.equal(decision.credential_visibility, 'none');
  assert.equal(decision.runtime_activation, false);
  assert.equal(decision.effect_destination, null);
  assert.equal(decision.policy_digest, result.evidence.policy_digest);
  assert.equal(decision.recommended_profile_id, selectionProposal.recommended_profile_id);
  assert.equal(decision.recommended_profile_digest, selectionProposal.recommended_profile_digest);
});
