import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { startDevelopmentStack } from '../src/dev.mjs';
import { canonicalJson, digestObject, sha256 } from '../src/lib/canonical.mjs';
import { MeshIdentity } from '../src/lib/identity.mjs';
import {
  buildIntentExecutorAdmissionDossier,
  buildIntentExecutorPromotionCandidate,
  buildIntentExecutorReviewAttestation,
  requiredIntentExecutorAdmissionEvidenceAssertions,
  verifyIntentExecutorPromotionCandidate
} from '../src/lib/intent-executor-admission.mjs';
import {
  buildIntentExecutionHandoff,
  evaluateIntentExecutionEligibility,
  loadIntentExecutorRegistry
} from '../src/lib/intent-execution-eligibility.mjs';
import { buildIntentRemediationProposal } from '../src/lib/intent-remediation.mjs';

const policy = JSON.parse(await readFile(new URL('../config/policy.json', import.meta.url), 'utf8'));
const capabilities = JSON.parse(await readFile(new URL('../config/capabilities.json', import.meta.url), 'utf8'));
const productionRegistryPath = new URL('../config/intent-remediation-executors.json', import.meta.url);
const productionRegistryText = await readFile(productionRegistryPath, 'utf8');
const productionRegistry = await loadIntentExecutorRegistry(productionRegistryPath);
const REVISION = /^[a-f0-9]{40}$/;

function identity(service) {
  const pair = generateKeyPairSync('ed25519');
  return new MeshIdentity(
    service,
    pair.privateKey.export({ type: 'pkcs8', format: 'pem' }),
    pair.publicKey.export({ type: 'spki', format: 'pem' })
  );
}

async function api(base, token, path) {
  const response = await fetch(`${base}${path}`, {
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/json'
    }
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(`HTTP GET ${path} failed ${response.status}: ${canonicalJson(payload)}`);
  }
  return payload;
}

async function findPortBlock() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const base = 22_000 + Math.floor(Math.random() * 20_000);
    const servers = [];
    try {
      for (let offset = 0; offset < 4; offset += 1) {
        const server = net.createServer();
        await new Promise((resolve, reject) => {
          server.once('error', reject);
          server.listen(base + offset, '127.0.0.1', resolve);
        });
        servers.push(server);
      }
      await Promise.all(servers.map(server => new Promise(resolve => server.close(resolve))));
      return base;
    } catch {
      await Promise.all(servers.map(server => new Promise(resolve => server.close(resolve))));
    }
  }
  throw new Error('Could not allocate four consecutive ports');
}

function testOnlyMapping() {
  return {
    semantic_action: 'repo.tests.add',
    target_action: 'system.echo',
    capability_id: 'core.intent-loop',
    tool: 'builtin.echo',
    fixed_input: { value: 'v0.7 four-service admission conformance; never submit' },
    constraints: { conformance_only: true }
  };
}

function syntheticRatifiedRemediation(buildDigest) {
  const state = {
    schema: 'axiom-intent-governance-state.v1',
    contract_id: 'intent-v07-admission-e2e',
    activation_digest: sha256('v07-activation'),
    contract_digest: sha256('v07-contract'),
    graph_digest: sha256('v07-graph'),
    build: { build_digest: buildDigest },
    assessment: {
      source_assessment_digest: sha256('v07-assessment'),
      evaluated_at: '2026-08-10T21:00:00.000Z'
    },
    reconciliation: {
      state: 'blocked',
      reconciliation_digest: sha256('v07-reconciliation'),
      violations: ['INV-V07-ADMISSION'],
      unknowns: [],
      proposed_actions: [{
        action: 'repo.tests.add',
        decision: 'autonomous',
        reason: 'Conformance-only action for admission proof.',
        triggered_by: ['INV-V07-ADMISSION']
      }]
    },
    execution_authorized: false
  };
  const remediation = buildIntentRemediationProposal(state, {
    creator: 'v07-producer',
    created_at: '2026-08-10T21:00:01.000Z',
    expires_at: '2026-08-11T21:00:01.000Z'
  });
  return {
    remediation,
    remediation_state: {
      schema: 'axiom-intent-remediation-governance-state.v1',
      remediation_proposal_id: remediation.remediation_proposal_id,
      remediation_proposal_digest: remediation.remediation_proposal_digest,
      basis_digest: remediation.basis_digest,
      contract_id: remediation.contract_id,
      activation_digest: remediation.activation_digest,
      source_assessment_digest: remediation.source_assessment_digest,
      source_reconciliation_digest: remediation.source_reconciliation_digest,
      reconciliation_state: remediation.reconciliation_state,
      action_counts: { autonomous: 1, approval_required: 0, deny: 0 },
      governance_status: 'active',
      current: true,
      current_reason: 'synthetic-v07-conformance-fixture',
      execution_authorized: false
    }
  };
}

test('reviewed executor promotion candidate is created on real stack without installing or executing', async t => {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-intent-v07-admission-'));
  const basePort = await findPortBlock();
  const token = `v07-operator-${crypto.randomUUID()}-${'x'.repeat(24)}`;
  const stack = await startDevelopmentStack({
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
    apiTokens: {
      [token]: {
        id: 'v07-operator',
        type: 'human',
        roles: ['administrator'],
        scopes: ['*']
      }
    }
  });
  t.after(async () => {
    await stack.stop();
    await rm(dataDir, { recursive: true, force: true });
  });

  const gateway = `http://127.0.0.1:${basePort}`;
  const before = await api(gateway, token, '/v1/status');
  const beforeAudit = await api(gateway, token, '/v1/audit/verify');
  assert.equal(beforeAudit.valid, true);

  const revision = REVISION.test(process.env.GITHUB_SHA ?? '')
    ? process.env.GITHUB_SHA
    : 'unbound-local-intent-v07-admission';
  const build = {
    kernel_version: '0.12.0-dev.4',
    source_digest: sha256(revision)
  };
  const buildDigest = digestObject(build);
  const synthetic = syntheticRatifiedRemediation(buildDigest);
  const testRegistry = {
    schema: 'axiom-intent-remediation-executor-registry.v1',
    kernel_version: '0.12.0-dev.4',
    mappings: [testOnlyMapping()]
  };
  const eligibility = evaluateIntentExecutionEligibility({
    remediation: synthetic.remediation,
    remediation_state: synthetic.remediation_state,
    semantic_action: 'repo.tests.add',
    executor_registry: testRegistry,
    policy,
    capabilities,
    principal: { id: 'v07-operator', scopes: ['*'] }
  });
  assert.equal(eligibility.decision, 'eligible');
  assert.equal(eligibility.execution_authorized, false);
  const handoff = buildIntentExecutionHandoff(eligibility);
  assert.equal(handoff.execution_authorized, false);

  const realStackEvidence = digestObject({
    handoff_digest: handoff.handoff_digest,
    before_chain_hash: before.runtime.grid.last_hash,
    before_chain_seq: before.runtime.grid.last_seq,
    handoff_submitted: false
  });
  const admissionEvidence = requiredIntentExecutorAdmissionEvidenceAssertions().map(assertion => ({
    assertion,
    result: 'pass',
    artifact_digest: assertion === 'real_stack_non_execution'
      ? realStackEvidence
      : sha256(`v07:${assertion}`),
    artifact_type: 'conformance-assertion',
    ref: `evidence:v07:${assertion}`
  }));
  const context = {
    executor_registry: productionRegistry,
    policy,
    capabilities,
    build
  };
  const dossier = buildIntentExecutorAdmissionDossier({
    candidate_mapping: testOnlyMapping(),
    current_context: context,
    evidence: admissionEvidence,
    producer: 'v07-producer',
    created_at: '2026-08-10T21:05:00.000Z',
    expires_at: '2026-08-11T21:05:00.000Z'
  });

  const security = identity('v07-security-reviewer');
  const implementation = identity('v07-implementation-reviewer');
  const reviews = [
    {
      review: buildIntentExecutorReviewAttestation(dossier, {
        identity: security,
        review_role: 'security_authority',
        reviewed_at: '2026-08-10T21:06:00.000Z',
        expires_at: '2026-08-11T21:06:00.000Z'
      }),
      public_key: security.publicKey
    },
    {
      review: buildIntentExecutorReviewAttestation(dossier, {
        identity: implementation,
        review_role: 'implementation_conformance',
        reviewed_at: '2026-08-10T21:07:00.000Z',
        expires_at: '2026-08-11T21:07:00.000Z'
      }),
      public_key: implementation.publicKey
    }
  ];
  const candidate = buildIntentExecutorPromotionCandidate({
    dossier,
    reviews,
    current_context: context,
    now: '2026-08-10T21:10:00.000Z'
  });
  assert.equal(candidate.mapping_installed, false);
  assert.equal(candidate.execution_authorized, false);
  assert.equal(candidate.installation_authority, null);
  assert.deepEqual(verifyIntentExecutorPromotionCandidate(candidate, {
    dossier,
    reviews,
    current_context: context,
    now: '2026-08-10T21:10:00.000Z'
  }), candidate);

  const after = await api(gateway, token, '/v1/status');
  const afterAudit = await api(gateway, token, '/v1/audit/verify');
  assert.equal(afterAudit.valid, true);
  assert.equal(after.runtime.grid.last_seq, before.runtime.grid.last_seq);
  assert.equal(after.runtime.grid.last_hash, before.runtime.grid.last_hash);
  assert.equal(
    productionRegistryText,
    '{\n  "schema": "axiom-intent-remediation-executor-registry.v1",\n  "kernel_version": "0.12.0-dev.4",\n  "mappings": []\n}\n'
  );
  assert.deepEqual(productionRegistry.mappings, []);
});
