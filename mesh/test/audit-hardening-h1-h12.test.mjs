import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import { once } from 'node:events';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';

import { digestObject, sha256, ValidationError } from '../src/lib/canonical.mjs';
import { MeshIdentity, ReplayGuard } from '../src/lib/identity.mjs';
import {
  Router,
  TokenBucketLimiter,
  createServiceServer
} from '../src/lib/http.mjs';
import {
  PolicyEngine,
  loadPolicyStack,
  mergeDenyDominantPolicy,
  validatePolicy
} from '../src/lib/policy.mjs';
import { GridStore as CheckpointGridStore } from '../src/grid/_store-checkpoints.mjs';

function allowRule(overrides = {}) {
  return {
    decision: 'allow',
    risk: 'low',
    required_scopes: ['intent:execute'],
    tool: 'builtin.echo',
    ...overrides
  };
}

function policy(rule = allowRule(), version = 'audit-base') {
  return {
    version,
    actions: {
      'system.echo': rule
    }
  };
}

test('H-1 required confirmations reject non-integer and out-of-range values', () => {
  for (const requiredConfirmations of ['two', NaN, -1, 17, 1.5]) {
    assert.throws(
      () => validatePolicy(policy(allowRule({
        required_confirmations: requiredConfirmations
      }))),
      /required confirmations/i
    );
  }

  const malformed = policy(allowRule({ required_confirmations: 'two' }));
  const engine = new PolicyEngine(malformed);
  assert.throws(() => engine.evaluate({
    action: 'system.echo',
    principal: { scopes: ['intent:execute'] },
    intent: { confirmations: [] }
  }), /required confirmations/i);
});

test('H-2 malformed confirmation state fails as policy validation before canonical merge failure', () => {
  assert.throws(() => mergeDenyDominantPolicy([
    policy(allowRule({ required_confirmations: 1 }), 'base'),
    policy(allowRule({ required_confirmations: 'two' }), 'overlay')
  ]), error => (
    error instanceof ValidationError
    && /required confirmations/i.test(error.message)
  ));
});

test('H-3 exhausted token buckets cannot regain capacity through key churn', () => {
  const limiter = new TokenBucketLimiter({
    capacity: 2,
    refillPerSecond: 1,
    maxKeys: 2
  });
  const now = 1_000;

  assert.equal(limiter.take('attacker', now), true);
  assert.equal(limiter.take('attacker', now), true);
  assert.equal(limiter.take('attacker', now), false);
  assert.equal(limiter.take('other', now), true);
  assert.equal(limiter.take('rotated', now), false);
  assert.equal(limiter.take('attacker', now), false);
  assert.equal(limiter.take('rotated', now + 3_000), true);
});

test('H-4 request routing does not trust a malformed Host header as URL authority', async t => {
  const router = new Router();
  router.add('GET', '/health', async () => ({ ok: true }), { auth: false });
  const server = createServiceServer({ name: 'audit-http', router });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    if (server.listening) await new Promise(resolve => server.close(resolve));
  });

  const address = server.address();
  const response = await new Promise((resolve, reject) => {
    const request = http.request({
      host: '127.0.0.1',
      port: address.port,
      path: '/health',
      method: 'GET',
      headers: { Host: '[::bad::' }
    }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({
        status: res.statusCode,
        body: Buffer.concat(chunks).toString('utf8')
      }));
    });
    request.on('error', reject);
    request.end();
  });

  assert.equal(response.status, 200);
  assert.deepEqual(JSON.parse(response.body), { ok: true });
});

test('H-5 replay protection distinguishes replay, saturation, and expired reuse', () => {
  const guard = new ReplayGuard({ maxEntries: 2 });
  const now = 10_000;
  assert.equal(guard.admit('grid', 'nonce-a', now + 1_000, now), 'admitted');
  assert.equal(guard.admit('grid', 'nonce-b', now + 1_000, now), 'admitted');
  assert.equal(guard.admit('grid', 'nonce-a', now + 1_000, now), 'replayed');
  assert.equal(guard.admit('grid', 'nonce-c', now + 1_000, now), 'saturated');
  assert.equal(guard.admit('grid', 'nonce-c', now + 3_000, now + 2_000), 'admitted');
  assert.equal(guard.use('grid', 'compatibility', now + 3_000, now + 2_000), true);
});

test('H-6 deny-dominant merge rejects unsupported fields on deny branches', () => {
  assert.throws(() => mergeDenyDominantPolicy([
    policy(allowRule(), 'base'),
    policy({
      decision: 'deny',
      risk: 'high',
      code: 'policy_denied',
      reason: 'disabled',
      unexpected_authority_hint: true
    }, 'overlay')
  ]), /unsupported deny fields/i);
});

test('H-7 numeric policy constraints require an explicit monotonic direction', () => {
  const merged = mergeDenyDominantPolicy([
    policy(allowRule({
      constraints: {
        maximum_items: 10,
        minimum_assurance: 2
      }
    }), 'base'),
    policy(allowRule({
      constraints: {
        maximum_items: 5,
        minimum_assurance: 4
      }
    }), 'overlay')
  ]);
  assert.equal(merged.actions['system.echo'].constraints.maximum_items, 5);
  assert.equal(merged.actions['system.echo'].constraints.minimum_assurance, 4);

  assert.throws(() => mergeDenyDominantPolicy([
    policy(allowRule({ constraints: { threshold: 10 } }), 'base'),
    policy(allowRule({ constraints: { threshold: 5 } }), 'overlay')
  ]), /direction is undeclared/i);
});

test('H-8 Gateway collection and discovery integers use the canonical bounded validator', async () => {
  const source = await readFile(new URL('../src/gateway/server.mjs', import.meta.url), 'utf8');
  for (const marker of [
    "label: 'node discovery minimum_security_level'",
    "label: 'node discovery minimum_lease_seconds'",
    "label: 'node discovery limit'",
    "label: 'node schedules limit'",
    "label: 'approvals limit'",
    "label: 'memory limit'",
    "label: 'backups limit'"
  ]) {
    assert.equal(source.includes(marker), true, `missing canonical validation marker: ${marker}`);
  }
  for (const retired of [
    'Approval limit must be an integer between 1 and 100',
    'Memory limit must be an integer between 1 and 500',
    'Backup limit must be an integer between 1 and 100',
    'Node schedule limit must be an integer between 1 and 100'
  ]) {
    assert.equal(source.includes(retired), false, `retired ad-hoc validator remains: ${retired}`);
  }
  assert.match(source, /\^\(0\|\[1-9\]\[0-9\]\*\)\$/);
});

test('H-9 service key IDs are stable across equivalent SPKI PEM text formatting', () => {
  const pair = generateKeyPairSync('ed25519');
  const privatePem = pair.privateKey.export({ type: 'pkcs8', format: 'pem' });
  const publicPem = pair.publicKey.export({ type: 'spki', format: 'pem' });
  const canonical = new MeshIdentity('grid', privatePem, publicPem);
  const reformatted = new MeshIdentity(
    'grid',
    privatePem,
    publicPem.replaceAll('\n', '\r\n')
  );
  assert.equal(reformatted.keyId, canonical.keyId);
});

test('H-10 export reads ignore stored bundle paths and verify signed manifest bytes', async t => {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-export-h10-'));
  t.after(() => rm(dataDir, { recursive: true, force: true }));
  const exportId = 'export_123e4567-e89b-42d3-a456-426614174000';
  const exportDir = join(dataDir, 'exports', exportId);
  await mkdir(exportDir, { recursive: true });
  const expectedBytes = Buffer.from('{"safe":true}\n');
  await writeFile(join(exportDir, 'bundle.jsonl'), expectedBytes);
  const attackerPath = join(dataDir, 'attacker-controlled.txt');
  await writeFile(attackerPath, 'attacker-controlled');

  const pair = generateKeyPairSync('ed25519');
  const privatePem = pair.privateKey.export({ type: 'pkcs8', format: 'pem' });
  const publicPem = pair.publicKey.export({ type: 'spki', format: 'pem' });
  const identity = new MeshIdentity('grid', privatePem, publicPem);
  const unsigned = {
    format: 'axiom-export.v1',
    export_id: exportId,
    files: [{
      name: 'bundle.jsonl',
      media_type: 'application/x-ndjson',
      bytes: expectedBytes.length,
      sha256: sha256(expectedBytes)
    }]
  };
  const manifest = {
    ...unsigned,
    attestation: identity.signObject(unsigned)
  };
  const fakeStore = {
    dataDir,
    verificationKeys: new Map([[identity.keyId, identity.publicKey]]),
    getExport(id, principal) {
      assert.equal(id, exportId);
      assert.equal(principal, 'owner.audit');
      return {
        status: 'completed',
        bundle_path: attackerPath,
        manifest_json: manifest
      };
    }
  };

  const result = await CheckpointGridStore.prototype.getExportBundle.call(
    fakeStore,
    exportId,
    'owner.audit'
  );
  assert.equal(result.bundle, expectedBytes.toString('utf8'));
  assert.notEqual(result.bundle, 'attacker-controlled');

  await writeFile(join(exportDir, 'bundle.jsonl'), 'tampered');
  await assert.rejects(
    () => CheckpointGridStore.prototype.getExportBundle.call(
      fakeStore,
      exportId,
      'owner.audit'
    ),
    error => error?.code === 'export_integrity_failed'
  );
});

test('H-11 overlay evidence rejects an asserted digest that does not match measured policy bytes', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'axiom-policy-h11-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, 'policy.json');
  await writeFile(path, JSON.stringify(policy(allowRule(), 'base')));
  const base = await loadPolicyStack([path]);
  const overlay = policy({
    decision: 'deny',
    risk: 'high',
    code: 'policy_denied',
    reason: 'disabled'
  }, 'overlay');
  const merged = mergeDenyDominantPolicy([base.policy, overlay]);

  assert.throws(() => new PolicyEngine(merged, {
    layers: [
      ...base.layers,
      {
        order: base.layers.length,
        version: overlay.version,
        digest: 'f'.repeat(64)
      }
    ]
  }), /does not match measured policy bytes/i);

  const measuredDigest = digestObject(overlay);
  const engine = new PolicyEngine(merged, {
    layers: [
      ...base.layers,
      {
        order: base.layers.length,
        version: overlay.version,
        digest: measuredDigest
      }
    ]
  });
  assert.equal(engine.layers.at(-1).digest, measuredDigest);
});

test('H-12 policies loaded as active bases re-assert deny-only overlay semantics at use time', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'axiom-policy-h12-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, 'policy.json');
  await writeFile(path, JSON.stringify(policy(allowRule(), 'base')));
  const base = await loadPolicyStack([path]);

  assert.throws(() => mergeDenyDominantPolicy([
    base.policy,
    policy(allowRule({ required_scopes: [] }), 'malicious-overlay')
  ]), /deny rules only/i);
});
