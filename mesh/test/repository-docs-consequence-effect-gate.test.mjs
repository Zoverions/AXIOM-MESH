import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { sha256 } from '../src/lib/canonical.mjs';
import { ensureMeshIdentity, MeshIdentity } from '../src/lib/identity.mjs';
import { loadDataProtector } from '../src/lib/protector.mjs';
import { GridStore } from '../src/grid/store.mjs';
import { buildExternalEffectPreparedEvent } from '../src/lib/external-effect-outbox.mjs';
import { buildRepositoryDocsConsequenceAdmission } from '../src/lib/repository-docs-consequence-admission.mjs';
import {
  buildPreparedRepositoryDocsEffect,
  buildRepositoryDocsEffectPlan
} from '../src/lib/repository-docs-effect.mjs';
import {
  runGitHubRepositoryDocsOperator,
  verifyDurableGridPreparation
} from '../src/repository-operator/github-docs-operator.mjs';

const BASE_SHA = 'a'.repeat(40);
const OLD_BLOB_SHA = 'b'.repeat(40);
const PRINCIPAL = 'operator-human';
const D = character => character.repeat(64);

function identity(service) {
  const pair = generateKeyPairSync('ed25519');
  return new MeshIdentity(
    service,
    pair.privateKey.export({ type: 'pkcs8', format: 'pem' }),
    pair.publicKey.export({ type: 'spki', format: 'pem' })
  );
}

async function fixture(t, { persistConsequence = true } = {}) {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-consequence-effect-gate-'));
  const gridIdentity = await ensureMeshIdentity(dataDir, 'grid', { create: true });
  const protector = await loadDataProtector({ dataDir, autoBootstrap: true });
  const store = new GridStore({
    path: join(dataDir, 'grid.sqlite'),
    dataDir,
    identity: gridIdentity,
    protector
  });
  t.after(async () => {
    try { store.close(); } catch {}
    await rm(dataDir, { recursive: true, force: true });
  });

  const operator = identity('repository-operator');
  const hypervisor = identity('hypervisor');
  const preparedAt = new Date(Date.now() - 1_000).toISOString();
  const expiresAt = new Date(Date.now() + 4 * 60_000).toISOString();
  const oldContent = '# before\n';
  const plan = buildRepositoryDocsEffectPlan({
    identity: operator,
    base_sha: BASE_SHA,
    changes: [{
      path: 'docs/rebuild/STATUS.md',
      operation: 'update',
      old_blob_sha: OLD_BLOB_SHA,
      old_content_sha256: sha256(oldContent),
      new_content: '# after\n'
    }],
    planned_at: preparedAt,
    expires_at: expiresAt
  });
  const prepared = buildPreparedRepositoryDocsEffect({
    identity: hypervisor,
    plan,
    operatorPublicKey: operator.publicKey,
    source_bindings: {
      intent_id: 'intent-consequence-effect-gate',
      intent_digest: D('1'),
      handoff_digest: D('2'),
      remediation_proposal_id: `intent-remediation:${D('3')}`,
      remediation_proposal_digest: D('3'),
      principal: PRINCIPAL,
      machine_authority_digest: null
    },
    authority_bindings: {
      policy_digest: D('4'),
      capability_registry_digest: D('5'),
      executor_registry_digest: D('6'),
      mapping_digest: D('7'),
      build_digest: D('8')
    },
    one_use_nonce: 'consequence_effect_gate_nonce_0123456789',
    prepared_at: preparedAt,
    expires_at: expiresAt
  });
  const consequenceAdmission = buildRepositoryDocsConsequenceAdmission({
    preparedEffect: prepared,
    policyRisk: 'high'
  });
  const baseEvent = buildExternalEffectPreparedEvent(prepared);
  const event = persistConsequence
    ? {
        ...baseEvent,
        payload: {
          ...baseEvent.payload,
          consequence_admission: consequenceAdmission
        }
      }
    : baseEvent;
  const [gridEvent] = store.appendEvents({
    traceId: 'trace:consequence-effect-gate',
    actor: PRINCIPAL,
    events: [event]
  });
  return {
    gridIdentity,
    operator,
    hypervisor,
    prepared,
    consequenceAdmission,
    gridEvent
  };
}

test('durable Grid proof binds and returns the exact persisted consequence admission', async t => {
  const current = await fixture(t);
  const proof = verifyDurableGridPreparation({
    prepared_effect: current.prepared,
    consequence_admission: current.consequenceAdmission,
    grid_prepared_event: current.gridEvent,
    hypervisorPublicKey: current.hypervisor.publicKey,
    operatorPublicKey: current.operator.publicKey,
    gridPublicKey: current.gridIdentity.publicKey,
    now: new Date().toISOString()
  });

  assert.deepEqual(proof.consequence_admission, current.consequenceAdmission);
  assert.equal(proof.consequence_admission.effect_id, current.prepared.effect_id);
  assert.equal(proof.consequence_admission.effect_digest, current.prepared.effect_digest);
  assert.equal(proof.consequence_admission.classification.consequence_class, 'digital-consequential');
  assert.equal(proof.consequence_admission.policy_floor.policy_floor_satisfied, true);
});

test('repository operator rejects missing persisted consequence evidence before any GitHub request', async t => {
  const current = await fixture(t, { persistConsequence: false });
  let githubCalls = 0;

  await assert.rejects(
    () => runGitHubRepositoryDocsOperator({
      prepared_effect: current.prepared,
      grid_prepared_event: current.gridEvent,
      operatorIdentity: current.operator,
      hypervisorPublicKey: current.hypervisor.publicKey,
      gridPublicKey: current.gridIdentity.publicKey,
      token: 'test-token',
      origin: 'http://127.0.0.1:43124',
      environment: 'test',
      fetchImpl: async () => {
        githubCalls += 1;
        return new Response('{}', { status: 500, headers: { 'content-type': 'application/json' } });
      },
      now: new Date().toISOString()
    }),
    /consequence admission/i
  );

  assert.equal(githubCalls, 0);
});
