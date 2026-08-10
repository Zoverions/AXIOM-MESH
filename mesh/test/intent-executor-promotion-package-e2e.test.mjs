import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { startDevelopmentStack } from '../src/dev.mjs';
import { canonicalJson, sha256 } from '../src/lib/canonical.mjs';
import { MeshIdentity } from '../src/lib/identity.mjs';
import {
  buildIntentExecutorAdmissionDossier,
  buildIntentExecutorPromotionCandidate,
  buildIntentExecutorReviewAttestation,
  requiredIntentExecutorAdmissionEvidenceAssertions
} from '../src/lib/intent-executor-admission.mjs';
import { loadIntentExecutorRegistry } from '../src/lib/intent-execution-eligibility.mjs';
import {
  buildIntentExecutorPromotionPackage,
  verifyIntentExecutorPromotionPackage
} from '../src/lib/intent-executor-promotion-package.mjs';

const policy = JSON.parse(await readFile(new URL('../config/policy.json', import.meta.url), 'utf8'));
const capabilities = JSON.parse(await readFile(new URL('../config/capabilities.json', import.meta.url), 'utf8'));
const registryUrl = new URL('../config/intent-remediation-executors.json', import.meta.url);
const registryBytes = await readFile(registryUrl, 'utf8');
const registry = await loadIntentExecutorRegistry(registryUrl);
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

function mapping() {
  return {
    semantic_action: 'repo.tests.add',
    target_action: 'system.echo',
    capability_id: 'core.intent-loop',
    tool: 'builtin.echo',
    fixed_input: { value: 'v0.8 real-stack offline package; never apply' },
    constraints: { conformance_only: true }
  };
}

function evidence(realStackDigest) {
  return requiredIntentExecutorAdmissionEvidenceAssertions().map(assertion => ({
    assertion,
    result: 'pass',
    artifact_digest: assertion === 'real_stack_non_execution'
      ? realStackDigest
      : sha256(`v08-e2e:${assertion}`),
    artifact_type: 'conformance-assertion',
    ref: `evidence:v08-e2e:${assertion}`
  }));
}

test('v0.8 builds and verifies an offline package while the real four-service stack remains unchanged', async t => {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-intent-v08-package-'));
  const basePort = await findPortBlock();
  const token = `v08-operator-${crypto.randomUUID()}-${'x'.repeat(24)}`;
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
        id: 'v08-operator',
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
    : 'unbound-local-intent-v08-package';
  const currentContext = {
    executor_registry: registry,
    policy,
    capabilities,
    build: {
      kernel_version: '0.12.0-dev.3',
      source_digest: sha256(revision)
    }
  };
  const realStackDigest = sha256(canonicalJson({
    before_grid_seq: before.runtime.grid.last_seq,
    before_grid_hash: before.runtime.grid.last_hash,
    package_only: true,
    apply_performed: false
  }));
  const dossier = buildIntentExecutorAdmissionDossier({
    candidate_mapping: mapping(),
    current_context: currentContext,
    evidence: evidence(realStackDigest),
    producer: 'v08-producer',
    created_at: '2026-08-10T21:45:00.000Z',
    expires_at: '2026-08-11T21:45:00.000Z'
  });
  const security = identity('v08-security-reviewer');
  const implementation = identity('v08-implementation-reviewer');
  const reviews = [
    {
      review: buildIntentExecutorReviewAttestation(dossier, {
        identity: security,
        review_role: 'security_authority',
        reviewed_at: '2026-08-10T21:46:00.000Z',
        expires_at: '2026-08-11T21:46:00.000Z'
      }),
      public_key: security.publicKey
    },
    {
      review: buildIntentExecutorReviewAttestation(dossier, {
        identity: implementation,
        review_role: 'implementation_conformance',
        reviewed_at: '2026-08-10T21:47:00.000Z',
        expires_at: '2026-08-11T21:47:00.000Z'
      }),
      public_key: implementation.publicKey
    }
  ];
  const candidate = buildIntentExecutorPromotionCandidate({
    dossier,
    reviews,
    current_context: currentContext,
    now: '2026-08-10T21:50:00.000Z'
  });
  const promotionPackage = buildIntentExecutorPromotionPackage({
    promotion_candidate: candidate,
    dossier,
    reviews,
    current_context: currentContext,
    current_registry_bytes: registryBytes,
    now: '2026-08-10T21:50:00.000Z'
  });
  assert.equal(promotionPackage.apply_authorized, false);
  assert.equal(promotionPackage.mapping_installed, false);
  assert.equal(promotionPackage.execution_authorized, false);
  assert.equal(promotionPackage.destination.mutation_performed, false);
  assert.deepEqual(verifyIntentExecutorPromotionPackage(promotionPackage, {
    promotion_candidate: candidate,
    dossier,
    reviews,
    current_context: currentContext,
    current_registry_bytes: registryBytes,
    now: '2026-08-10T21:50:00.000Z'
  }), promotionPackage);

  const after = await api(gateway, token, '/v1/status');
  const afterAudit = await api(gateway, token, '/v1/audit/verify');
  assert.equal(afterAudit.valid, true);
  assert.equal(after.runtime.grid.last_seq, before.runtime.grid.last_seq);
  assert.equal(after.runtime.grid.last_hash, before.runtime.grid.last_hash);
  assert.equal(
    await readFile(registryUrl, 'utf8'),
    registryBytes
  );
  assert.deepEqual(registry.mappings, []);
});
