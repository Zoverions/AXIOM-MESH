import assert from 'node:assert/strict';
import { generateKeyPairSync, sign, verify } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import {
  canonicalJson,
  canonicalize,
  digestObject,
  sha256
} from '../src/lib/canonical.mjs';
import {
  ReplayGuard,
  ensureMeshIdentity,
  issueCapability,
  loadTrustedKey,
  signedRequestHeaders,
  verifyCapability,
  verifyObjectSignature
} from '../src/lib/identity.mjs';
import { mergeDenyDominantPolicy, validateAuthorityReducingPolicy } from '../src/lib/policy.mjs';
import { buildPlan, planDigest, validatePlan } from '../src/lib/plan.mjs';
import { DataProtector, loadDataProtector } from '../src/lib/protector.mjs';
import {
  decryptFromRecipient,
  encryptForRecipient,
  recipientKeyMetadata
} from '../src/lib/recipient-encryption.mjs';
import { createStructuredLogger, redactForLog } from '../src/lib/logger.mjs';
import { meshConfig } from '../src/lib/config.mjs';
import { GridStore } from '../src/grid/store.mjs';
import {
  acquireGridRuntimeLock,
  createGridBackup,
  recordPendingRecovery,
  releaseGridRuntimeLock,
  restoreGridBackup,
  verifyGridBackup
} from '../src/grid/backup.mjs';
import { startDevelopmentStack } from '../src/dev.mjs';
import { verifyExportBundle } from '../src/verify-export.mjs';
import { validateCapabilityRegistry } from '../src/check-registry.mjs';
import {
  deterministicJournalCases,
  deterministicPolicyCases,
  propertyFixtureDigest
} from '../src/lib/property-cases.mjs';
import { runCli } from '../src/cli.mjs';
import { renderRegistryMarker } from '../src/status.mjs';

test('canonical JSON is stable and rejects non-finite values', () => {
  const left = { z: [3, { b: true, a: 'x' }], a: 1 };
  const right = { a: 1, z: [3, { a: 'x', b: true }] };
  assert.equal(canonicalJson(left), canonicalJson(right));
  assert.equal(digestObject(left), digestObject(right));
  assert.deepEqual(canonicalize({ b: -0, a: 1 }), { a: 1, b: 0 });
  assert.throws(() => canonicalJson({ value: Number.NaN }), /non-finite/);
});

test('capability registry covers every product family and gates runnable claims', async () => {
  const registry = JSON.parse(await readFile(join(
    fileURLToPath(new URL('../config', import.meta.url)),
    'capabilities.json'
  ), 'utf8'));
  const result = validateCapabilityRegistry(registry);
  assert.equal(result.valid, true);
  assert.ok(result.counts.implemented >= 5);
  assert.ok(result.counts.disabled >= 3);
});

test('governing claim documents are bound to the registry schema, version, and digest', async () => {
  const repositoryRoot = new URL('../../', import.meta.url);
  const registry = JSON.parse(await readFile(new URL('../config/capabilities.json', import.meta.url), 'utf8'));
  const marker = renderRegistryMarker(registry);
  for (const path of [
    'README.md',
    'CONSTITUTION.md',
    'docs/rebuild/PRODUCT-DEFINITION.md',
    'docs/rebuild/REQUIREMENTS.md'
  ]) {
    assert.match(await readFile(new URL(path, repositoryRoot), 'utf8'), new RegExp(escapeRegex(marker)));
  }
  assert.throws(
    () => validateCapabilityRegistry({ ...registry, schema: 'axiom-capabilities.v2' }),
    /schema/
  );
});

test('CLI validates input and preserves structured Gateway failure semantics', async () => {
  const options = {
    config: meshConfig({ dataDir: '/unused', gatewayPort: 23456 }),
    env: { AXIOM_API_TOKEN: 'test-token' },
    fetchImpl: async () => ({
      ok: false,
      status: 403,
      async json() {
        return { error: { code: 'policy_denied', message: 'Denied by policy' } };
      }
    })
  };
  await assert.rejects(
    () => runCli(['intent', 'system.echo', '[]'], options),
    /JSON object/
  );
  await assert.rejects(
    () => runCli(['intent', 'system.echo', '{invalid'], options),
    /valid JSON/
  );
  await assert.rejects(
    () => runCli(['intent', 'system.echo', '{}'], options),
    error => error.code === 'policy_denied' && error.status === 403
  );
  await assert.rejects(() => runCli(['unknown'], options), /Unknown command/);
});

test('IAM-04 deterministic property cases never weaken higher policy authority', () => {
  const first = deterministicPolicyCases('axiom-iam04', 256);
  const second = deterministicPolicyCases('axiom-iam04', 256);
  assert.equal(propertyFixtureDigest(first), propertyFixtureDigest(second));
  for (const fixture of first) {
    const [global, local] = fixture.layers;
    const merged = mergeDenyDominantPolicy(fixture.layers);
    const action = fixture.action;
    const globalRule = global.actions[action];
    const localRule = local.actions[action];
    const rule = merged.actions[action];
    if (globalRule.decision === 'deny' || localRule.decision === 'deny') {
      assert.equal(rule.decision, 'deny');
    }
    assert.ok(['low', 'medium', 'high', 'critical'].indexOf(rule.risk)
      >= ['low', 'medium', 'high', 'critical'].indexOf(globalRule.risk));
    assert.ok(rule.required_confirmations >= globalRule.required_confirmations);
    for (const scope of globalRule.required_scopes) assert.ok(rule.required_scopes.includes(scope));
  }
});

test('ECON-02 deterministic journals remain integer-balanced under generated load', () => {
  const first = deterministicJournalCases('axiom-econ02', 512);
  const second = deterministicJournalCases('axiom-econ02', 512);
  assert.equal(propertyFixtureDigest(first), propertyFixtureDigest(second));
  for (const fixture of first) {
    assert.ok(fixture.entries.length >= 2);
    assert.ok(fixture.entries.every(entry => Number.isSafeInteger(entry.amount) && entry.amount !== 0));
    assert.equal(fixture.entries.reduce((sum, entry) => sum + entry.amount, 0), 0);
  }
});

test('production configuration rejects generated credentials and remote plaintext internals', () => {
  const enforced = meshConfig({
    environment: 'production',
    autoBootstrap: false,
    requireDenyEgress: true,
    gatewaySocket: resolve('/run/axiom-mesh/gateway.sock'),
    transportDir: resolve('/run/secrets/transport')
  });
  assert.equal(enforced.requireDenyEgress, true);
  assert.equal(enforced.transport.enabled, true);
  assert.match(enforced.gatewaySocket, /gateway\.sock$/);
  assert.throws(() => meshConfig({
    environment: 'production',
    autoBootstrap: false,
    transportDir: resolve('/run/secrets/transport'),
    gatewaySocket: 'relative/gateway.sock'
  }), /absolute path/);
  assert.throws(() => meshConfig({
    environment: 'production',
    autoBootstrap: true,
    transportDir: resolve('/run/secrets/transport')
  }), /must be false/);
  assert.throws(() => meshConfig({
    environment: 'production',
    autoBootstrap: false,
    transportDir: resolve('/run/secrets/transport'),
    hypervisorUrl: 'http://mesh.internal:8081'
  }), /must use HTTPS/);
  assert.throws(() => meshConfig({
    environment: 'production',
    autoBootstrap: false,
    transportDir: 'relative/transport'
  }), /absolute path/);
  assert.throws(() => meshConfig({
    environment: 'production',
    autoBootstrap: false,
    internalTlsEnabled: false
  }), /mutually authenticated TLS/);
  assert.throws(() => meshConfig({
    environment: 'development',
    internalTlsEnabled: false,
    gridUrl: 'http://untrusted.example:8083'
  }), /loopback-only/);
});

test('capability tokens are signed, audience-bound, expiring, and replay guardable', async t => {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-identity-'));
  t.after(() => rm(dataDir, { recursive: true, force: true }));
  const identity = await ensureMeshIdentity(dataDir, 'hypervisor', { create: true });
  const now = Math.floor(Date.now() / 1000);
  const token = issueCapability(identity, {
    iss: 'hypervisor',
    aud: 'sandbox',
    subject: 'person',
    jti: 'capability-1',
    nbf: now - 1,
    exp: now + 10,
    intent_digest: 'a'.repeat(64),
    tool: 'builtin.echo',
    constraints: {},
    plan_digest: 'b'.repeat(64),
    policy_digest: 'c'.repeat(64)
  });
  const claims = verifyCapability(token, identity.publicKey, { audience: 'sandbox', nowSeconds: now });
  assert.equal(claims.tool, 'builtin.echo');
  assert.throws(() => verifyCapability(token, identity.publicKey, {
    audience: 'grid',
    nowSeconds: now
  }), /audience/);
  assert.throws(() => verifyCapability(token, identity.publicKey, {
    audience: 'sandbox',
    nowSeconds: now + 11
  }), /not currently valid/);
  const guard = new ReplayGuard();
  assert.equal(guard.use('capability', claims.jti, claims.exp * 1000), true);
  assert.equal(guard.use('capability', claims.jti, claims.exp * 1000), false);
  const boundedGuard = new ReplayGuard({ maxEntries: 1 });
  assert.equal(boundedGuard.use('service', 'first', Date.now() + 10_000), true);
  assert.equal(boundedGuard.use('service', 'second', Date.now() + 10_000), false);
  assert.equal(boundedGuard.use('service', 'first', Date.now() + 10_000), false);
});

test('layered policy merging is deny-dominant and only tightens requirements', () => {
  const merged = mergeDenyDominantPolicy([
    {
      version: 'global.1',
      actions: {
        'system.echo': {
          decision: 'allow',
          risk: 'low',
          required_scopes: ['intent:execute'],
          required_confirmations: 0,
          tool: 'builtin.echo'
        },
        'chain.submit': { decision: 'deny', risk: 'critical' }
      }
    },
    {
      version: 'local.1',
      actions: {
        'system.echo': {
          decision: 'allow',
          risk: 'medium',
          required_scopes: ['local:approved'],
          required_confirmations: 1,
          tool: 'builtin.echo'
        },
        'chain.submit': { decision: 'allow', risk: 'low', required_scopes: ['chain:write'] }
      }
    }
  ]);
  assert.deepEqual(merged.actions['system.echo'].required_scopes, ['intent:execute', 'local:approved']);
  assert.equal(merged.actions['system.echo'].risk, 'medium');
  assert.equal(merged.actions['system.echo'].required_confirmations, 1);
  assert.equal(merged.actions['chain.submit'].decision, 'deny');
  assert.equal(merged.actions['chain.submit'].risk, 'critical');
  const cannotExpand = mergeDenyDominantPolicy([
    { version: 'global.1', actions: { 'system.echo': {
      decision: 'allow',
      risk: 'low',
      tool: 'builtin.echo'
    } } },
    { version: 'user.1', actions: { 'unknown.effect': {
      decision: 'allow',
      risk: 'low',
      tool: 'builtin.echo'
    } } }
  ]);
  assert.equal(cannotExpand.actions['unknown.effect'], undefined);
  assert.throws(() => mergeDenyDominantPolicy([
    { version: 'global.1', actions: { 'system.echo': {
      decision: 'allow',
      risk: 'low',
      tool: 'builtin.echo'
    } } },
    { version: 'user.1', actions: { 'system.echo': {
      decision: 'allow',
      risk: 'low',
      tool: 'builtin.hash'
    } } }
  ]), /cannot replace the tool/);
  assert.throws(() => validateAuthorityReducingPolicy({
    version: 'unsafe-emergency.1',
    actions: {
      'governance.rollback': { decision: 'deny', risk: 'critical' }
    }
  }), /cannot block recovery action/);
});

test('plan schema rejects private reasoning and dependency cycles', () => {
  const intent = {
    intent_id: 'intent_plan_test',
    principal: { id: 'person:test' },
    action: 'system.echo'
  };
  const plan = buildPlan(intent, {
    risk: 'low',
    tool: 'builtin.echo',
    constraints: {},
    policy_version: 'global.1',
    policy_digest: 'a'.repeat(64),
    policy_layers: [{ version: 'global.1', digest: 'a'.repeat(64) }]
  });
  assert.match(planDigest(plan), /^[a-f0-9]{64}$/);
  const privateReasoning = structuredClone(plan);
  privateReasoning.decision_provenance.reasoning = 'hidden rationale';
  assert.throws(() => validatePlan(privateReasoning), /private reasoning/);
  const cycle = structuredClone(plan);
  cycle.steps[0].depends_on = ['commit'];
  assert.throws(() => validatePlan(cycle), /cycle/);
});

test('Grid evidence survives restart and detects payload tampering', async t => {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-grid-'));
  t.after(() => rm(dataDir, { recursive: true, force: true }));
  const identity = await ensureMeshIdentity(dataDir, 'grid', { create: true });
  const protector = await loadDataProtector({ dataDir, autoBootstrap: true });
  const dbPath = join(dataDir, 'grid.sqlite');
  let store = new GridStore({ path: dbPath, dataDir, identity, protector });
  store.appendEvents({
    traceId: 'trace_test_0001',
    actor: 'person:test',
    events: [{
      kind: 'intent.accepted',
      subject: 'intent_test_0001',
      payload: {
        intent_id: 'intent_test_0001',
        principal: 'person:test',
        action: 'system.echo',
        risk: 'low',
        input_digest: sha256('{}'),
        request_digest: sha256('request')
      }
    }]
  });
  assert.equal(store.verifyChain().valid, true);
  store.db.prepare("UPDATE intents SET status = 'tampered' WHERE intent_id = ?").run('intent_test_0001');
  store.close();
  store = new GridStore({ path: dbPath, dataDir, identity, protector });
  assert.equal(store.verifyChain().valid, true);
  assert.equal(store.getIntent('intent_test_0001').status, 'accepted');
  store.db.prepare('UPDATE events SET payload_json = ? WHERE seq = 1').run('{"tampered":true}');
  const verification = store.verifyChain();
  assert.equal(verification.valid, false);
  assert.equal(verification.reason, 'payload_decryption_failed');
  store.close();
});

test('Grid migration ledger is checksum verified and fails closed on drift', async t => {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-migrations-'));
  t.after(() => rm(dataDir, { recursive: true, force: true }));
  const identity = await ensureMeshIdentity(dataDir, 'grid', { create: true });
  const protector = await loadDataProtector({ dataDir, autoBootstrap: true });
  const dbPath = join(dataDir, 'grid.sqlite');
  let store = new GridStore({ path: dbPath, dataDir, identity, protector });
  assert.deepEqual(
    store.db.prepare('SELECT version FROM schema_migrations ORDER BY version').all().map(row => row.version),
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
  );
  store.db.prepare("UPDATE schema_migrations SET checksum = 'tampered' WHERE version = 2").run();
  store.close();
  assert.throws(
    () => new GridStore({ path: dbPath, dataDir, identity, protector }),
    /does not match the runtime checksum/
  );
});

test('schema 8 state migrates through scheduling schema 10 without evidence loss', async t => {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-migration-eight-'));
  t.after(() => rm(dataDir, { recursive: true, force: true }));
  const identity = await ensureMeshIdentity(dataDir, 'grid', { create: true });
  const protector = await loadDataProtector({ dataDir, autoBootstrap: true });
  const dbPath = join(dataDir, 'grid.sqlite');
  let store = new GridStore({ path: dbPath, dataDir, identity, protector });
  store.appendEvents({
    traceId: 'trace_migration_eight',
    actor: 'person:migration',
    events: [{
      kind: 'intent.accepted',
      subject: 'intent_migration_eight',
      payload: {
        intent_id: 'intent_migration_eight',
        principal: 'person:migration',
        action: 'system.hash',
        risk: 'low',
        input_digest: sha256('migration-eight'),
        request_digest: sha256('migration-eight-request')
      }
    }]
  });
  const evidenceHead = store.verifyChain().head;
  store.close();

  const schemaEight = new DatabaseSync(dbPath);
  schemaEight.exec(`
    DROP TABLE sync_heads;
    DROP TABLE sync_updates;
    DROP TABLE sync_bundles;
    DROP TABLE node_schedules;
    DELETE FROM schema_migrations WHERE version IN (9, 10);
    UPDATE meta SET value = '8' WHERE key = 'schema_version';
  `);
  schemaEight.close();

  store = new GridStore({ path: dbPath, dataDir, identity, protector });
  assert.equal(store.getStatus().schema_version, 10);
  assert.equal(store.getIntent('intent_migration_eight').status, 'accepted');
  assert.equal(store.verifyChain().head, evidenceHead);
  assert.deepEqual(
    store.db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type = 'table' AND name LIKE 'sync_%'
      ORDER BY name
    `).all().map(row => row.name),
    ['sync_bundles', 'sync_heads', 'sync_updates']
  );
  store.close();
});

test('data protector authenticates ciphertext and binds it to storage context', () => {
  const protector = new DataProtector(Buffer.alloc(32, 7));
  const sealed = protector.seal({ sensitive: 'value' }, 'axiom:test:one');
  assert.doesNotMatch(sealed, /sensitive|value/);
  assert.deepEqual(protector.open(sealed, 'axiom:test:one'), { sensitive: 'value' });
  assert.throws(() => protector.open(sealed, 'axiom:test:two'), /authentication failed/);
  const sealedBytes = protector.sealBytes(Buffer.from([0, 1, 2, 255]), 'axiom:test:bytes');
  assert.deepEqual(
    protector.openBytes(sealedBytes, 'axiom:test:bytes'),
    Buffer.from([0, 1, 2, 255])
  );
  assert.throws(() => protector.openBytes(sealedBytes, 'axiom:test:other'), /authentication failed/);
  assert.throws(() => new DataProtector(Buffer.alloc(31)), /exactly 32 bytes/);
});

test('recipient export encryption is X25519-bound, context-bound, and tamper evident', () => {
  const recipient = generateKeyPairSync('x25519');
  const other = generateKeyPairSync('x25519');
  const plaintext = Buffer.from('portable private state');
  const context = 'axiom:export:test:bundle.jsonl';
  const envelope = encryptForRecipient(plaintext, recipient.publicKey, context);
  assert.equal(envelope.recipient_key_id, recipientKeyMetadata(recipient.publicKey).key_id);
  assert.deepEqual(decryptFromRecipient(envelope, recipient.privateKey, context), plaintext);
  assert.throws(
    () => decryptFromRecipient(envelope, other.privateKey, context),
    /does not match/
  );
  assert.throws(
    () => decryptFromRecipient(envelope, recipient.privateKey, `${context}:wrong`),
    /context/
  );
  const tampered = structuredClone(envelope);
  const tamperedCiphertext = Buffer.from(tampered.ciphertext, 'base64url');
  tamperedCiphertext[0] ^= 1;
  tampered.ciphertext = tamperedCiphertext.toString('base64url');
  assert.throws(
    () => decryptFromRecipient(tampered, recipient.privateKey, context),
    /authentication|digest/
  );
});

test('structured logging redacts secrets, payloads, prompts, and error messages', () => {
  const redacted = redactForLog({
    trace_id: 'trace_safe',
    authorization: 'Bearer secret',
    nested: {
      prompt: 'private prompt',
      payload: { private: true },
      value: 'visible'
    },
    error: new Error('message may contain sensitive input')
  });
  assert.equal(redacted.authorization, '[REDACTED]');
  assert.equal(redacted.nested.prompt, '[REDACTED]');
  assert.equal(redacted.nested.payload, '[REDACTED]');
  assert.equal(redacted.nested.value, 'visible');
  assert.deepEqual(redacted.error, { name: 'Error', code: undefined });
  const lines = [];
  const logger = createStructuredLogger('test', {
    sink: line => lines.push(line),
    now: () => '2026-07-25T00:00:00.000Z'
  });
  logger.info({ event: 'fixture', token: 'do-not-log', trace_id: 'trace_safe' });
  assert.equal(JSON.parse(lines[0]).token, '[REDACTED]');
  assert.equal(JSON.parse(lines[0]).trace_id, 'trace_safe');
});

test('Grid startup fails closed when durable payloads use a different key', async t => {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-wrong-key-'));
  t.after(() => rm(dataDir, { recursive: true, force: true }));
  const identity = await ensureMeshIdentity(dataDir, 'grid', { create: true });
  const dbPath = join(dataDir, 'grid.sqlite');
  const store = new GridStore({
    path: dbPath,
    dataDir,
    identity,
    protector: new DataProtector(Buffer.alloc(32, 1))
  });
  store.appendEvents({
    traceId: 'trace_wrong_key',
    actor: 'person:test',
    events: [{
      kind: 'intent.accepted',
      subject: 'intent_wrong_key',
      payload: {
        intent_id: 'intent_wrong_key',
        principal: 'person:test',
        action: 'system.echo',
        risk: 'low',
        input_digest: sha256('{}'),
        request_digest: sha256('request')
      }
    }]
  });
  store.close();
  assert.throws(() => new GridStore({
    path: dbPath,
    dataDir,
    identity,
    protector: new DataProtector(Buffer.alloc(32, 2))
  }), /authentication failed|startup verification/);
});

test('encrypted Grid backups verify, exclude live restore, preserve rollback, and emit recovery evidence', async t => {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-backup-'));
  t.after(() => rm(dataDir, { recursive: true, force: true }));
  const identity = await ensureMeshIdentity(dataDir, 'grid', { create: true });
  const protector = await loadDataProtector({ dataDir, autoBootstrap: true });
  const dbPath = join(dataDir, 'grid.sqlite');
  let store = new GridStore({ path: dbPath, dataDir, identity, protector });
  store.appendEvents({
    traceId: 'trace_backup_seed',
    actor: 'person:test',
    events: [{
      kind: 'intent.accepted',
      subject: 'intent_before_backup',
      payload: {
        intent_id: 'intent_before_backup',
        principal: 'person:test',
        action: 'system.echo',
        risk: 'low',
        input_digest: sha256('{}'),
        request_digest: sha256('backup-request')
      }
    }]
  });
  const backupId = 'backup_test_exact_restore';
  store.appendEvents({
    traceId: 'trace_backup_request',
    actor: 'person:test',
    events: [{
      kind: 'backup.requested',
      subject: backupId,
      payload: { backup_id: backupId, principal: 'person:test' }
    }]
  });
  const manifest = await createGridBackup({
    store,
    dataDir,
    identity,
    protector,
    backupId,
    traceId: 'trace_backup_complete'
  });
  const manifestPath = join(dataDir, 'backups', backupId, 'manifest.json');
  const snapshotPath = join(dataDir, 'backups', backupId, 'snapshot.axb');
  const protectedSnapshot = await readFile(snapshotPath);
  const verified = verifyGridBackup({
    manifest,
    protectedSnapshot,
    gridPublicKey: identity.publicKey,
    protector,
    expectedDatabaseDigest: manifest.database.sha256
  });
  assert.equal(verified.valid, true);
  assert.equal(verified.database_digest, manifest.database.sha256);
  const tamperedSnapshot = Buffer.from(protectedSnapshot);
  tamperedSnapshot[tamperedSnapshot.length - 2] ^= 1;
  assert.throws(() => verifyGridBackup({
    manifest,
    protectedSnapshot: tamperedSnapshot,
    gridPublicKey: identity.publicKey,
    protector
  }), /digest|byte count/);

  store.appendEvents({
    traceId: 'trace_after_backup',
    actor: 'person:test',
    events: [{
      kind: 'intent.accepted',
      subject: 'intent_after_backup',
      payload: {
        intent_id: 'intent_after_backup',
        principal: 'person:test',
        action: 'system.echo',
        risk: 'low',
        input_digest: sha256('{}'),
        request_digest: sha256('after-backup')
      }
    }]
  });
  store.close();

  const runtimeLock = await acquireGridRuntimeLock(dataDir);
  await assert.rejects(() => restoreGridBackup({
    manifestPath,
    dataDir,
    identity,
    protector,
    expectedDatabaseDigest: manifest.database.sha256
  }), error => error.code === 'grid_is_running');
  await releaseGridRuntimeLock(runtimeLock);
  await assert.rejects(() => restoreGridBackup({
    manifestPath,
    dataDir,
    identity,
    protector,
    expectedDatabaseDigest: 'f'.repeat(64)
  }), /exact expected database digest/);

  const restored = await restoreGridBackup({
    manifestPath,
    dataDir,
    identity,
    protector,
    expectedDatabaseDigest: manifest.database.sha256
  });
  assert.equal(restored.restored, true);
  assert.equal(restored.database_digest, manifest.database.sha256);
  assert.ok((await readFile(join(restored.rollback_path, 'grid.sqlite'))).length > 0);

  store = new GridStore({ path: dbPath, dataDir, identity, protector });
  const recovery = await recordPendingRecovery({ store, dataDir, identity });
  assert.equal(recovery.backup_id, backupId);
  assert.equal(store.getBackupRecord(backupId).status, 'restored');
  assert.equal(store.verifyChain().valid, true);
  assert.throws(() => store.getIntent('intent_after_backup'), /not found/);
  store.close();
});

test('full four-service path enforces auth, idempotency, consent, export, and audit', async t => {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-e2e-'));
  const basePort = await findPortBlock();
  const operatorToken = `operator-${'o'.repeat(40)}`;
  const approverToken = `approver-${'a'.repeat(40)}`;
  const overrides = {
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
    rateLimitRefillPerSecond: 1_000,
    apiTokens: {
      [operatorToken]: {
        id: 'local-operator',
        type: 'human',
        roles: ['administrator'],
        scopes: ['*']
      },
      [approverToken]: {
        id: 'independent-approver',
        type: 'human',
        roles: ['reviewer'],
        scopes: ['approval:write', 'intent:execute']
      }
    }
  };
  let stack = await startDevelopmentStack(overrides);
  t.after(async () => {
    try {
      await stack.stop();
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  });
  const gateway = `http://127.0.0.1:${basePort}`;
  const token = operatorToken;

  const status = await api(gateway, token, '/v1/status');
  assert.equal(status.runtime.grid.mode, 'single-node-transparency-log');
  assert.equal(status.runtime.grid.consensus, false);
  const liveness = await fetch(`${gateway}/health`);
  assert.equal(liveness.status, 200);
  assert.deepEqual(await liveness.json(), { service: 'gateway', status: 'live' });
  const readiness = await fetch(`${gateway}/ready`);
  assert.equal(readiness.status, 200);
  assert.equal((await readiness.json()).status, 'ready');
  const unauthenticatedOperations = await fetch(`${gateway}/v1/operations`);
  assert.equal(unauthenticatedOperations.status, 401);
  const unauthorizedOperations = await api(
    gateway,
    approverToken,
    '/v1/operations',
    {},
    403
  );
  assert.equal(unauthorizedOperations.error.code, 'forbidden');
  const operations = await api(gateway, token, '/v1/operations');
  assert.equal(operations.format, 'axiom-operations.v1');
  assert.equal(operations.status, 'ready');
  assert.deepEqual(
    operations.services.map(service => service.service),
    ['gateway', 'grid', 'hypervisor', 'sandbox']
  );
  assert.equal(operations.topology.consensus, false);
  const metricsResponse = await fetch(`${gateway}/v1/metrics`, {
    headers: { authorization: `Bearer ${token}` }
  });
  assert.equal(metricsResponse.status, 200);
  assert.match(
    metricsResponse.headers.get('content-type'),
    /^application\/openmetrics-text; version=1\.0\.0/
  );
  const metrics = await metricsResponse.text();
  assert.match(metrics, /axiom_service_ready\{service="grid"\} 1/);
  assert.doesNotMatch(metrics, /local-operator|independent-approver/);

  const idempotencyKey = `e2e-${crypto.randomUUID()}`;
  const first = await api(gateway, token, '/v1/intents', {
    method: 'POST',
    idempotencyKey,
    body: { action: 'system.echo', input: { message: 'hello' } }
  });
  assert.equal(first.status, 'completed');
  assert.equal(first.message, 'hello');
  const replay = await api(gateway, token, '/v1/intents', {
    method: 'POST',
    idempotencyKey,
    body: { action: 'system.echo', input: { message: 'hello' } }
  });
  assert.equal(replay.idempotent_replay, true);
  assert.equal(replay.result_json.message, 'hello');
  const conflict = await api(gateway, token, '/v1/intents', {
    method: 'POST',
    idempotencyKey,
    body: { action: 'system.echo', input: { message: 'changed' } }
  }, 409);
  assert.equal(conflict.error.code, 'idempotency_conflict');

  const denied = await api(gateway, token, '/v1/intents', {
    method: 'POST',
    body: { action: 'chain.submit', input: { transaction: '0x00' } }
  }, 403);
  assert.equal(denied.error.code, 'policy_denied');
  const unavailable = await api(gateway, token, '/v1/intents', {
    method: 'POST',
    body: { action: 'ai.infer', input: { model: 'unconfigured' } }
  }, 503);
  assert.equal(unavailable.error.code, 'capability_unavailable');

  const issuer = generateKeyPairSync('ed25519');
  const capsuleUnsigned = {
    capsule_id: 'example.echo',
    version: '1.0.0',
    name: 'Example Echo',
    description: 'A signed, deterministic echo capsule manifest',
    capabilities: ['system.echo'],
    constraints: { network: false, filesystem: false },
    schemas: {
      input: { type: 'object', additionalProperties: true },
      output: { type: 'object', additionalProperties: true }
    },
    source: { type: 'native', digest: 'a'.repeat(64) },
    sbom_digest: 'b'.repeat(64),
    issuer: {
      id: 'issuer:test',
      public_key: issuer.publicKey.export({ type: 'spki', format: 'pem' })
    }
  };
  const capsuleManifest = {
    ...capsuleUnsigned,
    signature: sign(
      null,
      Buffer.from(canonicalJson(capsuleUnsigned)),
      issuer.privateKey
    ).toString('base64url')
  };
  const registered = await api(gateway, token, '/v1/intents', {
    method: 'POST',
    body: { action: 'capsule.register', input: { manifest: capsuleManifest } }
  });
  assert.equal(registered.capsule_id, 'example.echo');
  const capsulesBeforeRevoke = await api(gateway, token, '/v1/capsules');
  assert.equal(capsulesBeforeRevoke.capsules[0].status, 'active');
  const confirmationRequired = await api(gateway, token, '/v1/intents', {
    method: 'POST',
    body: {
      action: 'capsule.revoke',
      input: { digest: registered.digest, reason: 'fixture retirement' }
    }
  }, 409);
  assert.equal(confirmationRequired.error.code, 'confirmation_required');
  assert.deepEqual(
    confirmationRequired.error.details.required_confirmation_values,
    ['confirm:capsule.revoke']
  );
  const independentRequired = await api(gateway, token, '/v1/intents', {
    method: 'POST',
    body: {
      action: 'capsule.revoke',
      input: { digest: registered.digest, reason: 'fixture retirement' },
      confirmations: ['confirm:capsule.revoke']
    }
  }, 409);
  assert.equal(independentRequired.error.code, 'independent_approval_required');
  const approval = await api(gateway, approverToken, '/v1/intents', {
    method: 'POST',
    body: {
      action: 'approval.grant',
      input: {
        requester: 'local-operator',
        action: 'capsule.revoke',
        request_digest: independentRequired.error.details.request_digest,
        expires_at: new Date(Date.now() + 60_000).toISOString()
      }
    }
  });
  assert.equal(approval.status, 'completed');
  await api(gateway, token, '/v1/intents', {
    method: 'POST',
    body: {
      action: 'capsule.revoke',
      input: { digest: registered.digest, reason: 'fixture retirement' },
      confirmations: ['confirm:capsule.revoke'],
      approval_ids: [approval.approval_id]
    }
  });
  const approvals = await api(gateway, approverToken, '/v1/approvals');
  assert.equal(approvals.approvals[0].status, 'consumed');
  assert.equal(approvals.truncated, false);
  const boundedApprovals = await api(gateway, approverToken, '/v1/approvals?limit=1');
  assert.equal(boundedApprovals.approvals.length, 1);
  const capsulesAfterRevoke = await api(gateway, token, '/v1/capsules');
  assert.equal(capsulesAfterRevoke.capsules[0].status, 'revoked');

  const consent = await api(gateway, token, '/v1/intents', {
    method: 'POST',
    body: {
      action: 'consent.grant',
      input: {
        controller: 'capsule:education',
        purpose: 'curriculum-personalization',
        scopes: ['learning-progress:read'],
        expires_at: new Date(Date.now() + 86_400_000).toISOString()
      }
    }
  });
  assert.match(consent.revocation_handle, /^[A-Za-z0-9_-]{40,}$/);
  const consents = await api(gateway, token, '/v1/consents');
  assert.equal(consents.consents.length, 1);
  assert.equal(consents.consents[0].purpose, 'curriculum-personalization');
  const wrongRevocation = await api(gateway, token, '/v1/intents', {
    method: 'POST',
    body: {
      action: 'consent.revoke',
      input: {
        consent_id: consent.consent_id,
        revocation_handle: 'x'.repeat(43)
      }
    }
  }, 400);
  assert.equal(wrongRevocation.error.code, 'validation_error');
  await api(gateway, token, '/v1/intents', {
    method: 'POST',
    body: {
      action: 'consent.revoke',
      input: {
        consent_id: consent.consent_id,
        revocation_handle: consent.revocation_handle
      }
    }
  });
  const revokedConsents = await api(gateway, token, '/v1/consents');
  assert.equal(revokedConsents.consents[0].status, 'revoked');

  const memoryOne = await api(gateway, token, '/v1/intents', {
    method: 'POST',
    body: {
      action: 'memory.put',
      input: {
        kind: 'note',
        content: { title: 'Private note', text: 'selectively disclosed' },
        metadata: { source: 'e2e' }
      }
    }
  });
  const memoryTwo = await api(gateway, token, '/v1/intents', {
    method: 'POST',
    body: {
      action: 'memory.put',
      input: {
        kind: 'fact',
        content: { subject: 'kernel', value: 'encrypted-at-rest' },
        metadata: {}
      }
    }
  });
  await api(gateway, token, '/v1/intents', {
    method: 'POST',
    body: {
      action: 'memory.link',
      input: {
        from_id: memoryOne.object_id,
        to_id: memoryTwo.object_id,
        relation: 'supports',
        metadata: { confidence: 1 }
      }
    }
  });
  const ownMemory = await api(gateway, token, '/v1/memory');
  assert.equal(ownMemory.objects.length, 2);
  assert.equal(ownMemory.edges.length, 1);
  const boundedMemory = await api(gateway, token, '/v1/memory?limit=1');
  assert.equal(boundedMemory.objects.length, 1);
  assert.equal(boundedMemory.truncated, true);
  const hiddenMemory = await api(
    gateway,
    approverToken,
    '/v1/memory?owner=local-operator'
  );
  assert.equal(hiddenMemory.objects.length, 0);
  await api(gateway, token, '/v1/intents', {
    method: 'POST',
    body: {
      action: 'consent.grant',
      input: {
        controller: 'independent-approver',
        purpose: 'selective-memory-disclosure',
        scopes: [`memory:${memoryOne.object_id}:read`],
        expires_at: new Date(Date.now() + 86_400_000).toISOString()
      }
    }
  });
  const sharedMemory = await api(
    gateway,
    approverToken,
    '/v1/memory?owner=local-operator'
  );
  assert.deepEqual(sharedMemory.objects.map(item => item.object_id), [memoryOne.object_id]);
  assert.equal(sharedMemory.edges.length, 0);

  const nodeKeys = generateKeyPairSync('ed25519');
  const nodePublicKey = nodeKeys.publicKey.export({ type: 'spki', format: 'pem' });
  const nodeAdmission = {
    format: 'axiom-node-admission.v2',
    node_id: 'node:e2e',
    public_key: nodePublicKey,
    security_profile: 'S2_HARDENED',
    capabilities: ['compute.batch', 'offline.causal-sync', 'storage.offer'],
    software_digest: sha256('node-software-v1'),
    expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    nonce: 'node-admission-e2e',
    discovery: {
      endpoint: 'https://node-e2e.mesh.example',
      failure_domain: 'test-zone-a',
      roles: ['compute', 'storage'],
      resources: {
        cpu_millis: 2_000,
        memory_bytes: 1_048_576,
        storage_bytes: 1_000_000,
        max_concurrent_assignments: 2
      }
    }
  };
  const invalidAdmission = await api(gateway, token, '/v1/intents', {
    method: 'POST',
    body: {
      action: 'node.register',
      input: { ...nodeAdmission, signature: 'A'.repeat(86) }
    }
  }, 400);
  assert.equal(invalidAdmission.error.code, 'validation_error');
  const nodeRecord = await api(gateway, token, '/v1/intents', {
    method: 'POST',
    body: {
      action: 'node.register',
      input: {
        ...nodeAdmission,
        signature: sign(
          null,
          Buffer.from(canonicalJson(nodeAdmission)),
          nodeKeys.privateKey
        ).toString('base64url')
      }
    }
  });
  assert.equal(nodeRecord.status, 'completed');
  assert.equal((await api(gateway, token, '/v1/nodes')).nodes[0].status, 'active');
  const discovery = await api(
    gateway,
    token,
    '/v1/node-discovery?capability=compute.batch&role=compute&minimum_security_level=2'
  );
  assert.deepEqual(
    discovery.nodes.map(node => node.node_id),
    ['node:e2e']
  );
  const discoveryStatement = structuredClone(discovery);
  delete discoveryStatement.attestation;
  const gridIdentity = stack.services.find(
    service => service.name === 'grid'
  ).identity;
  assert.equal(
    verifyObjectSignature(
      discoveryStatement,
      discovery.attestation,
      gridIdentity.publicKey
    ),
    true
  );
  const schedule = await api(gateway, token, '/v1/intents', {
    method: 'POST',
    body: {
      action: 'node.schedule',
      input: {
        request_id: 'node-schedule-e2e',
        required_capabilities: ['compute.batch'],
        required_roles: ['compute'],
        minimum_security_level: 2,
        resources: {
          cpu_millis: 500,
          memory_bytes: 1_024,
          storage_bytes: 0
        },
        replicas: 1,
        lease_seconds: 300
      }
    }
  });
  assert.equal(schedule.status, 'completed');
  assert.deepEqual(
    schedule.node_schedule.placements.map(item => item.node_id),
    ['node:e2e']
  );
  const scheduleList = await api(gateway, token, '/v1/node-schedules');
  assert.equal(scheduleList.schedules[0].status, 'active');
  assert.equal(scheduleList.truncated, false);
  assert.equal(
    (await api(gateway, token, '/v1/node-schedules?limit=1')).schedules.length,
    1
  );

  const rogueKeys = generateKeyPairSync('ed25519');
  const roguePublicKey = rogueKeys.publicKey.export({ type: 'spki', format: 'pem' });
  const rogueSyncAt = new Date().toISOString();
  const rogueSyncUpdate = signedCausalUpdate({
    keys: rogueKeys,
    publicKey: roguePublicKey,
    owner: 'local-operator',
    nodeId: 'node:unregistered',
    namespace: 'operator-notes',
    recordId: 'record:e2e',
    value: { title: 'unauthorized write' },
    vector: { 'node:unregistered': 1 },
    occurredAt: rogueSyncAt,
    nonce: 'sync-update-rogue-one'
  });
  const rejectedRogueSync = await independentlyApprovedIntent({
    gateway,
    requesterToken: token,
    approverToken,
    action: 'sync.apply',
    confirmation: 'confirm:sync.apply',
    input: {
      bundle: signedCausalBundle({
        keys: rogueKeys,
        publicKey: roguePublicKey,
        owner: 'local-operator',
        nodeId: 'node:unregistered',
        updates: [rogueSyncUpdate],
        createdAt: rogueSyncAt,
        nonce: 'sync-bundle-rogue-one'
      })
    },
    expectedStatus: 403
  });
  assert.equal(rejectedRogueSync.error.code, 'sync_node_unavailable');

  const firstSyncAt = new Date().toISOString();
  const firstSyncUpdate = signedCausalUpdate({
    keys: nodeKeys,
    publicKey: nodePublicKey,
    owner: 'local-operator',
    nodeId: 'node:e2e',
    namespace: 'operator-notes',
    recordId: 'record:e2e',
    value: { title: 'first offline value' },
    vector: { 'node:e2e': 1 },
    occurredAt: firstSyncAt,
    nonce: 'sync-update-e2e-one'
  });
  const firstSyncBundle = signedCausalBundle({
    keys: nodeKeys,
    publicKey: nodePublicKey,
    owner: 'local-operator',
    nodeId: 'node:e2e',
    updates: [firstSyncUpdate],
    createdAt: firstSyncAt,
    nonce: 'sync-bundle-e2e-one'
  });
  const firstSyncResult = await independentlyApprovedIntent({
    gateway,
    requesterToken: token,
    approverToken,
    action: 'sync.apply',
    confirmation: 'confirm:sync.apply',
    input: { bundle: firstSyncBundle }
  });
  assert.equal(firstSyncResult.update_count, 1);
  let syncState = await api(gateway, token, '/v1/sync?namespace=operator-notes');
  assert.equal(syncState.conflicts, 0);
  assert.equal(syncState.records[0].status, 'active');
  assert.equal(syncState.records[0].heads[0].value.title, 'first offline value');
  const firstSyncRecord = await api(
    gateway,
    token,
    `/v1/sync/bundles/${firstSyncResult.bundle_digest}`
  );
  assert.equal(firstSyncRecord.owner, 'local-operator');
  assert.equal(firstSyncRecord.update_count, 1);
  const ownerIsolatedSyncRecord = await api(
    gateway,
    approverToken,
    `/v1/sync/bundles/${firstSyncResult.bundle_digest}`,
    {},
    404
  );
  assert.equal(ownerIsolatedSyncRecord.error.code, 'sync_bundle_not_found');

  const peerKeys = generateKeyPairSync('ed25519');
  const peerPublicKey = peerKeys.publicKey.export({ type: 'spki', format: 'pem' });
  const peerAdmission = {
    format: 'axiom-node-admission.v1',
    node_id: 'node:peer',
    public_key: peerPublicKey,
    security_profile: 'S2_HARDENED',
    capabilities: ['offline.causal-sync'],
    software_digest: sha256('node-peer-software-v1'),
    expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    nonce: 'node-admission-peer'
  };
  await api(gateway, token, '/v1/intents', {
    method: 'POST',
    body: {
      action: 'node.register',
      input: {
        ...peerAdmission,
        signature: sign(
          null,
          Buffer.from(canonicalJson(peerAdmission)),
          peerKeys.privateKey
        ).toString('base64url')
      }
    }
  });
  const peerSyncAt = new Date().toISOString();
  const peerSyncUpdate = signedCausalUpdate({
    keys: peerKeys,
    publicKey: peerPublicKey,
    owner: 'local-operator',
    nodeId: 'node:peer',
    namespace: 'operator-notes',
    recordId: 'record:e2e',
    value: { title: 'concurrent peer value' },
    vector: { 'node:peer': 1 },
    occurredAt: peerSyncAt,
    nonce: 'sync-update-peer-one'
  });
  await independentlyApprovedIntent({
    gateway,
    requesterToken: token,
    approverToken,
    action: 'sync.apply',
    confirmation: 'confirm:sync.apply',
    input: {
      bundle: signedCausalBundle({
        keys: peerKeys,
        publicKey: peerPublicKey,
        owner: 'local-operator',
        nodeId: 'node:peer',
        updates: [peerSyncUpdate],
        createdAt: peerSyncAt,
        nonce: 'sync-bundle-peer-one'
      })
    }
  });
  syncState = await api(gateway, token, '/v1/sync?record_id=record:e2e');
  assert.equal(syncState.conflicts, 1);
  assert.equal(syncState.records[0].status, 'conflict');
  assert.equal(syncState.records[0].heads.length, 2);

  const conflictHeads = syncState.records[0].heads.map(head => head.update_id).sort();
  const resolutionAt = new Date().toISOString();
  const phantomDependency = signedCausalUpdate({
    keys: nodeKeys,
    publicKey: nodePublicKey,
    owner: 'local-operator',
    nodeId: 'node:e2e',
    namespace: 'operator-notes',
    recordId: 'record:e2e',
    value: { title: 'phantom peer history' },
    vector: { 'node:e2e': 2, 'node:peer': 99 },
    occurredAt: resolutionAt,
    nonce: 'sync-update-e2e-phantom-dependency',
    resolves: conflictHeads
  });
  const rejectedPhantomDependency = await independentlyApprovedIntent({
    gateway,
    requesterToken: token,
    approverToken,
    action: 'sync.apply',
    confirmation: 'confirm:sync.apply',
    input: {
      bundle: signedCausalBundle({
        keys: nodeKeys,
        publicKey: nodePublicKey,
        owner: 'local-operator',
        nodeId: 'node:e2e',
        updates: [phantomDependency],
        createdAt: resolutionAt,
        nonce: 'sync-bundle-e2e-phantom-dependency'
      })
    },
    expectedStatus: 409
  });
  assert.equal(rejectedPhantomDependency.error.code, 'sync_causal_dependency_missing');

  const incompleteResolution = signedCausalUpdate({
    keys: nodeKeys,
    publicKey: nodePublicKey,
    owner: 'local-operator',
    nodeId: 'node:e2e',
    namespace: 'operator-notes',
    recordId: 'record:e2e',
    value: { title: 'silently discarded peer value' },
    vector: { 'node:e2e': 2, 'node:peer': 1 },
    occurredAt: resolutionAt,
    nonce: 'sync-update-e2e-incomplete-resolution',
    resolves: conflictHeads.slice(0, 1)
  });
  const rejectedResolution = await independentlyApprovedIntent({
    gateway,
    requesterToken: token,
    approverToken,
    action: 'sync.apply',
    confirmation: 'confirm:sync.apply',
    input: {
      bundle: signedCausalBundle({
        keys: nodeKeys,
        publicKey: nodePublicKey,
        owner: 'local-operator',
        nodeId: 'node:e2e',
        updates: [incompleteResolution],
        createdAt: resolutionAt,
        nonce: 'sync-bundle-e2e-incomplete-resolution'
      })
    },
    expectedStatus: 409
  });
  assert.equal(rejectedResolution.error.code, 'sync_resolution_incomplete');
  assert.equal((await api(gateway, token, '/v1/sync?record_id=record:e2e')).conflicts, 1);

  const resolutionUpdate = signedCausalUpdate({
    keys: nodeKeys,
    publicKey: nodePublicKey,
    owner: 'local-operator',
    nodeId: 'node:e2e',
    namespace: 'operator-notes',
    recordId: 'record:e2e',
    value: { title: 'explicitly merged value' },
    vector: { 'node:e2e': 2, 'node:peer': 1 },
    occurred_at: resolutionAt,
    nonce: 'sync-update-e2e-resolution',
    resolves: conflictHeads
  });
  await independentlyApprovedIntent({
    gateway,
    requesterToken: token,
    approverToken,
    action: 'sync.apply',
    confirmation: 'confirm:sync.apply',
    input: {
      bundle: signedCausalBundle({
        keys: nodeKeys,
        publicKey: nodePublicKey,
        owner: 'local-operator',
        nodeId: 'node:e2e',
        updates: [resolutionUpdate],
        createdAt: resolutionAt,
        nonce: 'sync-bundle-e2e-resolution'
      })
    }
  });
  syncState = await api(gateway, token, '/v1/sync?record_id=record:e2e');
  assert.equal(syncState.conflicts, 0);
  assert.equal(syncState.records[0].heads.length, 1);
  assert.equal(syncState.records[0].heads[0].value.title, 'explicitly merged value');

  const storageStatement = {
    format: 'axiom-storage-offer.v1',
    node_id: 'node:e2e',
    capacity_bytes: 1_000_000,
    available_bytes: 750_000,
    regions: ['ca-central'],
    expires_at: new Date(Date.now() + 3_600_000).toISOString(),
    nonce: 'storage-offer-e2e'
  };
  const mismatchedStorageOffer = await api(gateway, token, '/v1/intents', {
    method: 'POST',
    body: {
      action: 'storage.offer',
      input: {
        ...storageStatement,
        nonce: 'storage-offer-wrong-node-key',
        public_key: peerPublicKey,
        signature: sign(
          null,
          Buffer.from(canonicalJson({
            ...storageStatement,
            nonce: 'storage-offer-wrong-node-key'
          })),
          peerKeys.privateKey
        ).toString('base64url')
      }
    }
  }, 400);
  assert.equal(mismatchedStorageOffer.error.code, 'validation_error');
  const storageOffer = await api(gateway, token, '/v1/intents', {
    method: 'POST',
    body: {
      action: 'storage.offer',
      input: {
        ...storageStatement,
        public_key: nodePublicKey,
        signature: sign(
          null,
          Buffer.from(canonicalJson(storageStatement)),
          nodeKeys.privateKey
        ).toString('base64url')
      }
    }
  });
  assert.equal(storageOffer.status, 'completed');
  assert.equal((await api(gateway, token, '/v1/storage-offers')).offers[0].status, 'active');
  const renewalStatement = {
    format: 'axiom-node-renewal.v2',
    node_id: 'node:e2e',
    capabilities: ['compute.batch', 'offline.causal-sync', 'storage.offer'],
    software_digest: sha256('node-software-v2'),
    expires_at: new Date(Date.now() + 172_800_000).toISOString(),
    nonce: 'node-renewal-e2e',
    discovery: nodeAdmission.discovery
  };
  await api(gateway, token, '/v1/intents', {
    method: 'POST',
    body: {
      action: 'node.renew',
      input: {
        ...renewalStatement,
        public_key: nodePublicKey,
        signature: sign(
          null,
          Buffer.from(canonicalJson(renewalStatement)),
          nodeKeys.privateKey
        ).toString('base64url')
      }
    }
  });
  assert.equal(
    (await api(gateway, token, '/v1/nodes')).nodes
      .find(node => node.node_id === 'node:e2e').software_digest,
    renewalStatement.software_digest
  );
  await independentlyApprovedIntent({
    gateway,
    requesterToken: token,
    approverToken,
    action: 'node.quarantine',
    confirmation: 'confirm:node.quarantine',
    input: { node_id: 'node:e2e', reason: 'E2E quarantine verification.' }
  });
  assert.equal(
    (await api(gateway, token, '/v1/nodes')).nodes
      .find(node => node.node_id === 'node:e2e').status,
    'quarantined'
  );
  assert.equal(
    (await api(gateway, token, '/v1/storage-offers')).offers[0].status,
    'quarantined'
  );
  assert.equal(
    (await api(gateway, token, '/v1/node-schedules')).schedules[0].status,
    'degraded'
  );

  const cash = await api(gateway, token, '/v1/intents', {
    method: 'POST',
    body: {
      action: 'accounting.account.create',
      input: { unit: 'CAD-CENT', name: 'Cash' }
    }
  });
  const equity = await api(gateway, token, '/v1/intents', {
    method: 'POST',
    body: {
      action: 'accounting.account.create',
      input: { unit: 'CAD-CENT', name: 'Opening Equity' }
    }
  });
  const unbalanced = await api(gateway, token, '/v1/intents', {
    method: 'POST',
    body: {
      action: 'accounting.journal.post',
      input: {
        unit: 'CAD-CENT',
        reference: 'invalid',
        entries: [
          { account_id: cash.account_id, amount: 100 },
          { account_id: equity.account_id, amount: -99 }
        ]
      }
    }
  }, 400);
  assert.equal(unbalanced.error.code, 'validation_error');
  const journal = await api(gateway, token, '/v1/intents', {
    method: 'POST',
    body: {
      action: 'accounting.journal.post',
      input: {
        unit: 'CAD-CENT',
        reference: 'opening-balance',
        memo: 'Initial local ledger fixture',
        entries: [
          { account_id: cash.account_id, amount: 100, metadata: { side: 'debit' } },
          { account_id: equity.account_id, amount: -100, metadata: { side: 'credit' } }
        ]
      }
    }
  });
  assert.equal(journal.balanced, true);
  const accounting = await api(gateway, token, '/v1/accounting');
  assert.equal(accounting.accounts.length, 2);
  assert.equal(accounting.journals.length, 1);
  assert.equal(accounting.balances.reduce((sum, item) => sum + item.balance, 0), 0);

  // Keep the governance window valid even when the full parallel suite places
  // the host under provider, transport, and recovery-drill load.
  const votingEndsAt = new Date(Date.now() + 5_000).toISOString();
  const activateAfter = new Date(Date.now() + 6_000).toISOString();
  const proposal = await independentlyApprovedIntent({
    gateway,
    requesterToken: token,
    approverToken,
    action: 'governance.propose',
    confirmation: 'confirm:governance.propose',
    input: {
      title: 'Disable echo through governed overlay',
      body: 'Exercises proposal, voting, timelock, activation, verification, and rollback.',
      voting_ends_at: votingEndsAt,
      activate_after: activateAfter,
      action: {
        type: 'policy.overlay',
        policy: {
          version: 'governance-e2e.1',
          actions: {
            'system.echo': {
              decision: 'deny',
              risk: 'critical',
              reason: 'Governed e2e denial.'
            }
          }
        },
        rollback: { description: 'Remove the policy overlay and restore the base policy.' }
      }
    }
  });
  await api(gateway, token, '/v1/intents', {
    method: 'POST',
    body: {
      action: 'governance.vote',
      input: { proposal_id: proposal.proposal_id, choice: 'for' }
    }
  });
  await waitUntil(votingEndsAt);
  await independentlyApprovedIntent({
    gateway,
    requesterToken: token,
    approverToken,
    action: 'governance.finalize',
    confirmation: 'confirm:governance.finalize',
    input: { proposal_id: proposal.proposal_id }
  });
  assert.equal(
    (await api(gateway, token, '/v1/proposals')).proposals[0].status,
    'approved'
  );
  await waitUntil(activateAfter);
  await independentlyApprovedIntent({
    gateway,
    requesterToken: token,
    approverToken,
    action: 'governance.activate',
    confirmation: 'confirm:governance.activate',
    input: { proposal_id: proposal.proposal_id }
  });
  const governedDenial = await api(gateway, token, '/v1/intents', {
    method: 'POST',
    body: { action: 'system.echo', input: { message: 'must be denied' } }
  }, 403);
  assert.equal(governedDenial.error.code, 'policy_denied');
  await api(gateway, token, '/v1/intents', {
    method: 'POST',
    body: {
      action: 'governance.verify',
      input: {
        proposal_id: proposal.proposal_id,
        verification_digest: sha256('governance-e2e-verification')
      }
    }
  });
  const appeal = await api(gateway, token, '/v1/intents', {
    method: 'POST',
    body: {
      action: 'governance.appeal',
      input: {
        target_type: 'proposal',
        target_id: proposal.proposal_id,
        grounds: { claim: 'Rollback path should remain human-reviewable.' },
        desired_resolution: 'Record and review the rollback rationale.'
      }
    }
  });
  assert.equal(appeal.status, 'completed');
  assert.equal((await api(gateway, token, '/v1/appeals')).appeals.length, 1);
  await independentlyApprovedIntent({
    gateway,
    requesterToken: token,
    approverToken,
    action: 'governance.rollback',
    confirmation: 'confirm:governance.rollback',
    input: { proposal_id: proposal.proposal_id, reason: 'E2E rollback verification complete.' }
  });
  assert.equal(
    (await api(gateway, token, '/v1/proposals')).proposals[0].status,
    'rolled_back'
  );
  assert.equal((await api(gateway, token, '/v1/intents', {
    method: 'POST',
    body: { action: 'system.echo', input: { message: 'restored' } }
  })).message, 'restored');

  const emergencyExpiresAt = new Date(Date.now() + 5_000).toISOString();
  const emergency = await independentlyApprovedIntent({
    gateway,
    requesterToken: token,
    approverToken,
    action: 'governance.emergency',
    confirmation: 'confirm:governance.emergency',
    input: {
      reason: 'Temporary e2e authority reduction.',
      expires_at: emergencyExpiresAt,
      review_by: new Date(Date.now() + 10_000).toISOString(),
      policy: {
        version: 'emergency-e2e.1',
        actions: {
          'system.hash': {
            decision: 'deny',
            risk: 'critical',
            reason: 'Temporary emergency denial.'
          }
        }
      }
    }
  });
  assert.equal((await api(gateway, token, '/v1/intents', {
    method: 'POST',
    body: { action: 'system.hash', input: { value: 'denied' } }
  }, 403)).error.code, 'policy_denied');
  await waitUntil(emergencyExpiresAt);
  assert.match((await api(gateway, token, '/v1/intents', {
    method: 'POST',
    body: { action: 'system.hash', input: { value: 'restored' } }
  })).digest, /^[a-f0-9]{64}$/);
  await api(gateway, token, '/v1/intents', {
    method: 'POST',
    body: {
      action: 'governance.emergency.review',
      input: { overlay_id: emergency.overlay_id, findings: 'Expired on schedule; no expansion occurred.' }
    }
  });

  const exported = await api(gateway, token, '/v1/intents', {
    method: 'POST',
    body: {
      action: 'export.create',
      input: { types: ['intents', 'consents', 'events', 'memory', 'accounting'] }
    }
  });
  assert.equal(exported.status, 'completed');
  assert.equal(exported.export_manifest.format, 'axiom-export.v1');
  assert.equal(exported.export_manifest.schema_versions.records, 2);
  const bundle = await api(gateway, token, `/v1/exports/${exported.export_id}/bundle`);
  assert.match(bundle.bundle, /"type":"intent"/);
  assert.match(bundle.bundle, /"type":"memory_object"/);
  assert.match(bundle.bundle, /"type":"journal"/);
  assert.equal(sha256(bundle.bundle), bundle.manifest.files[0].sha256);
  const gridKey = await loadTrustedKey(dataDir, 'grid');
  const unsignedManifest = structuredClone(bundle.manifest);
  delete unsignedManifest.attestation;
  assert.equal(verifyObjectSignature(unsignedManifest, bundle.manifest.attestation, gridKey), true);
  const independent = verifyExportBundle({
    manifest: bundle.manifest,
    bundle: bundle.bundle,
    gridPublicKey: gridKey
  });
  assert.equal(independent.valid, true);
  assert.throws(() => verifyExportBundle({
    manifest: bundle.manifest,
    bundle: `${bundle.bundle}{"tampered":true}\n`,
    gridPublicKey: gridKey
  }), /byte count/);

  const unrelatedSelectiveType = await api(gateway, token, '/v1/intents', {
    method: 'POST',
    body: {
      action: 'export.create',
      input: {
        types: ['accounting', 'memory'],
        object_ids: [memoryOne.object_id]
      }
    }
  }, 400);
  assert.equal(unrelatedSelectiveType.error.code, 'validation_error');
  const beforeUnauthorizedExport = await api(gateway, token, '/v1/status');
  const unknownSelectiveObject = await api(gateway, token, '/v1/intents', {
    method: 'POST',
    body: {
      action: 'export.create',
      input: {
        types: ['memory'],
        object_ids: ['memory:missing']
      }
    }
  }, 403);
  assert.equal(unknownSelectiveObject.error.code, 'export_scope_forbidden');
  const unauthorizedExportEvents = await api(
    gateway,
    token,
    `/v1/events?after=${beforeUnauthorizedExport.runtime.grid.last_seq}`
  );
  assert.ok(unauthorizedExportEvents.events.some(event => event.kind === 'intent.failed'));
  assert.equal(
    unauthorizedExportEvents.events.some(event => event.kind === 'export.requested'),
    false
  );

  const exportRecipient = generateKeyPairSync('x25519');
  const encryptedExport = await api(gateway, token, '/v1/intents', {
    method: 'POST',
    body: {
      action: 'export.create',
      input: {
        types: ['capsules', 'events', 'identity', 'memory'],
        object_ids: [memoryOne.object_id],
        capsule_ids: ['example.echo'],
        recipient_public_key: exportRecipient.publicKey.export({ type: 'spki', format: 'pem' })
      }
    }
  });
  assert.equal(encryptedExport.encrypted, true);
  assert.equal(encryptedExport.export_manifest.files[0].name, 'bundle.encrypted.json');
  assert.equal(
    encryptedExport.export_manifest.scope.recipient.key_id,
    encryptedExport.recipient_key_id
  );
  assert.equal('public_key' in encryptedExport.export_manifest.scope.recipient, false);
  const encryptedBundle = await api(
    gateway,
    token,
    `/v1/exports/${encryptedExport.export_id}/bundle`
  );
  assert.doesNotMatch(encryptedBundle.bundle, /Private note|selectively disclosed|encrypted-at-rest/);
  assert.throws(() => verifyExportBundle({
    manifest: encryptedBundle.manifest,
    bundle: encryptedBundle.bundle,
    gridPublicKey: gridKey
  }), /Recipient private key/);
  const encryptedVerification = verifyExportBundle({
    manifest: encryptedBundle.manifest,
    bundle: encryptedBundle.bundle,
    gridPublicKey: gridKey,
    recipientPrivateKey: exportRecipient.privateKey
  });
  assert.equal(encryptedVerification.valid, true);
  assert.equal(encryptedVerification.encrypted, true);
  const decryptedSelectiveBundle = decryptFromRecipient(
    encryptedBundle.bundle,
    exportRecipient.privateKey,
    encryptedBundle.manifest.encryption.context
  ).toString('utf8');
  assert.match(decryptedSelectiveBundle, new RegExp(memoryOne.object_id));
  assert.doesNotMatch(decryptedSelectiveBundle, new RegExp(memoryTwo.object_id));
  assert.match(decryptedSelectiveBundle, /"capsule_id":"example.echo"/);
  const gridPublicPem = gridKey.export({ type: 'spki', format: 'pem' });
  const stagedImport = await api(gateway, token, '/v1/intents', {
    method: 'POST',
    body: {
      action: 'import.stage',
      input: {
        manifest: bundle.manifest,
        bundle: bundle.bundle,
        grid_public_key: gridPublicPem
      }
    }
  });
  assert.equal(stagedImport.status, 'completed');
  const stagedImportRecord = await api(gateway, token, `/v1/imports/${stagedImport.import_id}`);
  assert.equal(stagedImportRecord.status, 'staged');
  assert.equal(stagedImportRecord.diff_json.conflicts, 0);
  assert.equal(stagedImportRecord.diff_json.new, stagedImport.record_count);
  const applyConfirmation = await api(gateway, token, '/v1/intents', {
    method: 'POST',
    body: { action: 'import.apply', input: { import_id: stagedImport.import_id } }
  }, 409);
  assert.equal(applyConfirmation.error.code, 'confirmation_required');
  const importApprovalNeeded = await api(gateway, token, '/v1/intents', {
    method: 'POST',
    body: {
      action: 'import.apply',
      input: { import_id: stagedImport.import_id },
      confirmations: ['confirm:import.apply']
    }
  }, 409);
  assert.equal(importApprovalNeeded.error.code, 'independent_approval_required');
  const importApproval = await api(gateway, approverToken, '/v1/intents', {
    method: 'POST',
    body: {
      action: 'approval.grant',
      input: {
        requester: 'local-operator',
        action: 'import.apply',
        request_digest: importApprovalNeeded.error.details.request_digest,
        expires_at: new Date(Date.now() + 60_000).toISOString()
      }
    }
  });
  await api(gateway, token, '/v1/intents', {
    method: 'POST',
    body: {
      action: 'import.apply',
      input: { import_id: stagedImport.import_id },
      confirmations: ['confirm:import.apply'],
      approval_ids: [importApproval.approval_id]
    }
  });
  assert.equal(
    (await api(gateway, token, `/v1/imports/${stagedImport.import_id}`)).status,
    'applied'
  );
  const restaged = await api(gateway, token, '/v1/intents', {
    method: 'POST',
    body: {
      action: 'import.stage',
      input: {
        manifest: bundle.manifest,
        bundle: bundle.bundle,
        grid_public_key: gridPublicPem
      }
    }
  });
  const restagedRecord = await api(gateway, token, `/v1/imports/${restaged.import_id}`);
  assert.equal(restagedRecord.diff_json.new, 0);
  assert.equal(restagedRecord.diff_json.conflicts, 0);
  assert.equal(restagedRecord.diff_json.existing, restaged.record_count);

  const backup = await independentlyApprovedIntent({
    gateway,
    requesterToken: token,
    approverToken,
    action: 'backup.create',
    confirmation: 'confirm:backup.create',
    input: {}
  });
  assert.equal(backup.status, 'completed');
  assert.equal(backup.backup_manifest.format, 'axiom-grid-backup.v1');
  assert.match(backup.backup_manifest.database.sha256, /^[a-f0-9]{64}$/);
  const backups = await api(gateway, token, '/v1/backups');
  assert.equal(backups.backups[0].backup_id, backup.backup_id);
  assert.equal(backups.backups[0].status, 'completed');
  assert.equal(backups.truncated, false);
  assert.equal(
    (await api(gateway, token, `/v1/backups/${backup.backup_id}`)).database_digest,
    backup.backup_manifest.database.sha256
  );

  const audit = await api(gateway, token, '/v1/audit/verify');
  assert.equal(audit.valid, true);
  assert.ok(audit.events >= 20);
  const gridStore = stack.services.find(service => service.name === 'grid').store;
  const rawPayloads = gridStore.db.prepare('SELECT payload_json FROM events').all();
  assert.ok(rawPayloads.every(row => JSON.parse(row.payload_json).format === 'axiom-protected.v1'));
  assert.ok(rawPayloads.every(row => !row.payload_json.includes('selectively disclosed')));
  await stack.stop();
  stack = await startDevelopmentStack(overrides);
  const restartedMemory = await api(gateway, token, '/v1/memory');
  assert.equal(restartedMemory.objects.length, 2);
  const restartedAccounting = await api(gateway, token, '/v1/accounting');
  assert.equal(restartedAccounting.journals.length, 1);
  assert.equal(restartedAccounting.balances.reduce((sum, item) => sum + item.balance, 0), 0);
  assert.equal((await api(gateway, token, '/v1/audit/verify')).valid, true);

  const directSandbox = await fetch(`http://127.0.0.1:${basePort + 2}/internal/v1/execute`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}'
  });
  assert.equal(directSandbox.status, 401);

  const gatewayIdentity = stack.services.find(service => service.name === 'gateway').identity;
  const hypervisorIdentity = stack.services.find(service => service.name === 'hypervisor').identity;
  const sandboxUrl = `http://127.0.0.1:${basePort + 2}/internal/v1/execute`;
  const boundedIntent = {
    intent_id: 'intent_capability_binding_test',
    principal: {
      id: 'local-operator',
      type: 'human',
      roles: ['administrator'],
      scopes: ['*']
    },
    action: 'system.echo',
    input: { bounded: true },
    purpose: 'negative-path-test',
    data_scopes: [],
    confirmations: [],
    approval_ids: [],
    submitted_at: new Date().toISOString()
  };
  const nowSeconds = Math.floor(Date.now() / 1000);
  const boundedPlan = buildPlan(boundedIntent, {
    risk: 'low',
    tool: 'builtin.echo',
    constraints: {},
    policy_version: 'test.1',
    policy_digest: 'e'.repeat(64),
    policy_layers: [{ version: 'test.1', digest: 'e'.repeat(64) }]
  });
  validatePlan(boundedPlan);
  const boundedPlanDigest = planDigest(boundedPlan);
  const boundedCapability = issueCapability(hypervisorIdentity, {
    iss: 'hypervisor',
    aud: 'sandbox',
    subject: 'local-operator',
    jti: `cap_${crypto.randomUUID()}`,
    nbf: nowSeconds - 1,
    exp: nowSeconds + 30,
    intent_digest: digestObject(boundedIntent),
    tool: 'builtin.echo',
    constraints: {},
    policy_digest: 'e'.repeat(64),
    plan_digest: boundedPlanDigest
  });
  const mismatchedPlan = structuredClone(boundedPlan);
  mismatchedPlan.timeout_ms -= 1;
  const wrongPlanBody = Buffer.from(JSON.stringify({
    intent: boundedIntent,
    capability: boundedCapability,
    plan: mismatchedPlan
  }));
  const wrongPlan = await fetch(sandboxUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...signedRequestHeaders(hypervisorIdentity, {
        method: 'POST',
        url: sandboxUrl,
        audience: 'sandbox',
        body: wrongPlanBody
      })
    },
    body: wrongPlanBody
  });
  assert.equal(wrongPlan.status, 403);
  assert.equal((await wrongPlan.json()).error.code, 'capability_plan_mismatch');

  const sandboxOperationsUrl = `http://127.0.0.1:${basePort + 2}/internal/v1/operations`;
  const sandboxOperations = await fetch(sandboxOperationsUrl, {
    headers: signedRequestHeaders(hypervisorIdentity, {
      method: 'GET',
      url: sandboxOperationsUrl,
      audience: 'sandbox'
    })
  });
  assert.equal(sandboxOperations.status, 200);
  const sandboxOperationsBody = await sandboxOperations.json();
  assert.match(sandboxOperationsBody.execution_epoch, /^sandbox_epoch_/);

  const capabilityCommitUrl = `http://127.0.0.1:${basePort + 3}/internal/v1/commit`;
  const capabilityCommitBody = Buffer.from(JSON.stringify({
    actor: boundedIntent.principal.id,
    principal: boundedIntent.principal.id,
    events: [{
      kind: 'capability.consume.requested',
      subject: verifyCapability(
        boundedCapability,
        hypervisorIdentity.publicKey,
        { audience: 'sandbox', issuer: 'hypervisor' }
      ).jti,
      payload: {
        capability: boundedCapability,
        execution_epoch: sandboxOperationsBody.execution_epoch
      }
    }]
  }));
  const capabilityCommit = await fetch(capabilityCommitUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...signedRequestHeaders(hypervisorIdentity, {
        method: 'POST',
        url: capabilityCommitUrl,
        audience: 'grid',
        body: capabilityCommitBody
      })
    },
    body: capabilityCommitBody
  });
  assert.equal(capabilityCommit.status, 201);
  const capabilityCommitResult = await capabilityCommit.json();
  const consumptionReceipt = capabilityCommitResult.capability_consumptions?.[0]?.receipt;
  assert.ok(consumptionReceipt);

  const validExecutionBody = Buffer.from(JSON.stringify({
    intent: boundedIntent,
    capability: boundedCapability,
    plan: boundedPlan,
    consumption_receipt: consumptionReceipt
  }));
  const validExecution = await fetch(sandboxUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...signedRequestHeaders(hypervisorIdentity, {
        method: 'POST',
        url: sandboxUrl,
        audience: 'sandbox',
        body: validExecutionBody
      })
    },
    body: validExecutionBody
  });
  assert.equal(validExecution.status, 200);
  const capabilityReplay = await fetch(sandboxUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...signedRequestHeaders(hypervisorIdentity, {
        method: 'POST',
        url: sandboxUrl,
        audience: 'sandbox',
        body: validExecutionBody
      })
    },
    body: validExecutionBody
  });
  assert.equal(capabilityReplay.status, 409);
  assert.equal((await capabilityReplay.json()).error.code, 'capability_replayed');

  const directCommitUrl = `http://127.0.0.1:${basePort + 3}/internal/v1/commit`;
  const directCommitBody = Buffer.from(JSON.stringify({
    actor: 'local-operator',
    principal: 'local-operator',
    events: []
  }));
  const directCommit = await fetch(directCommitUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...signedRequestHeaders(gatewayIdentity, {
        method: 'POST',
        url: directCommitUrl,
        audience: 'grid',
        body: directCommitBody
      })
    },
    body: directCommitBody
  });
  assert.equal(directCommit.status, 403);
  assert.equal(
    (await directCommit.json()).error.code,
    'service_network_policy_denied'
  );

  const gridUrl = `http://127.0.0.1:${basePort + 3}/internal/v1/status`;
  const signedHeaders = signedRequestHeaders(gatewayIdentity, {
    method: 'GET',
    url: gridUrl,
    audience: 'grid'
  });
  const invalidHeaders = {
    ...signedHeaders,
    'x-axiom-signature': `${
      signedHeaders['x-axiom-signature'][0] === 'A' ? 'B' : 'A'
    }${signedHeaders['x-axiom-signature'].slice(1)}`
  };
  const invalidSignature = await fetch(gridUrl, { headers: invalidHeaders });
  assert.equal(invalidSignature.status, 401);
  const incompatibleHeaders = {
    ...signedRequestHeaders(gatewayIdentity, {
      method: 'GET',
      url: gridUrl,
      audience: 'grid'
    }),
    'x-axiom-interface': 'axiom.grid.v2'
  };
  const incompatible = await fetch(gridUrl, { headers: incompatibleHeaders });
  assert.equal(incompatible.status, 426);
  assert.equal((await incompatible.json()).error.code, 'incompatible_interface');
  const signedFirst = await fetch(gridUrl, { headers: signedHeaders });
  assert.equal(signedFirst.status, 200);
  const signedReplay = await fetch(gridUrl, { headers: signedHeaders });
  assert.equal(signedReplay.status, 409);
  assert.equal((await signedReplay.json()).error.code, 'replayed_request');

  const gridService = stack.services.find(service => service.name === 'grid');
  await new Promise(resolve => gridService.server.close(resolve));
  const degradedReadiness = await fetch(`${gateway}/ready`);
  assert.equal(degradedReadiness.status, 503);
  assert.equal((await degradedReadiness.json()).status, 'not_ready');
  assert.equal((await fetch(`${gateway}/health`)).status, 200);
});

async function api(base, token, path, {
  method = 'GET',
  body,
  idempotencyKey = `test-${crypto.randomUUID()}`
} = {}, expectedStatus = 200) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/json',
      ...(body === undefined ? {} : {
        'content-type': 'application/json',
        'idempotency-key': idempotencyKey
      })
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const payload = await response.json();
  assert.equal(response.status, expectedStatus, JSON.stringify(payload));
  return payload;
}

async function independentlyApprovedIntent({
  gateway,
  requesterToken,
  approverToken,
  action,
  confirmation,
  input,
  expectedStatus = 200
}) {
  const confirmationRequired = await api(gateway, requesterToken, '/v1/intents', {
    method: 'POST',
    body: { action, input }
  }, 409);
  assert.equal(confirmationRequired.error.code, 'confirmation_required');
  const approvalRequired = await api(gateway, requesterToken, '/v1/intents', {
    method: 'POST',
    body: { action, input, confirmations: [confirmation] }
  }, 409);
  assert.equal(approvalRequired.error.code, 'independent_approval_required');
  const approval = await api(gateway, approverToken, '/v1/intents', {
    method: 'POST',
    body: {
      action: 'approval.grant',
      input: {
        requester: 'local-operator',
        action,
        request_digest: approvalRequired.error.details.request_digest,
        expires_at: new Date(Date.now() + 60_000).toISOString()
      }
    }
  });
  return api(gateway, requesterToken, '/v1/intents', {
    method: 'POST',
    body: {
      action,
      input,
      confirmations: [confirmation],
      approval_ids: [approval.approval_id]
    }
  }, expectedStatus);
}

function signedCausalUpdate({
  keys,
  publicKey,
  owner,
  nodeId,
  namespace,
  recordId,
  value,
  vector,
  occurredAt,
  nonce,
  resolves = [],
  operation = 'put'
}) {
  const payload = operation === 'put' ? value : null;
  const statement = {
    format: 'axiom-causal-update.v1',
    owner,
    node_id: nodeId,
    namespace,
    record_id: recordId,
    operation,
    value: payload,
    value_digest: digestObject(payload),
    vector,
    resolves: [...resolves].sort(),
    occurred_at: occurredAt,
    nonce
  };
  return {
    ...statement,
    public_key: publicKey,
    signature: sign(
      null,
      Buffer.from(canonicalJson(statement)),
      keys.privateKey
    ).toString('base64url')
  };
}

function signedCausalBundle({
  keys,
  publicKey,
  owner,
  nodeId,
  updates,
  createdAt,
  nonce
}) {
  const statement = {
    format: 'axiom-causal-sync-bundle.v1',
    owner,
    source_node_id: nodeId,
    updates,
    created_at: createdAt,
    nonce
  };
  return {
    ...statement,
    public_key: publicKey,
    signature: sign(
      null,
      Buffer.from(canonicalJson(statement)),
      keys.privateKey
    ).toString('base64url')
  };
}

async function waitUntil(isoTimestamp) {
  const delay = Math.max(0, new Date(isoTimestamp).valueOf() - Date.now() + 20);
  if (delay) await new Promise(resolve => setTimeout(resolve, delay));
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
  throw new Error('Unable to reserve a local port block');
}

test('capsule manifest signature fixture is cryptographically sound', () => {
  const pair = generateKeyPairSync('ed25519');
  const publicKey = pair.publicKey.export({ type: 'spki', format: 'pem' });
  const unsigned = {
    capsule_id: 'example.echo',
    version: '1.0.0',
    name: 'Example',
    description: 'A signed example capsule',
    capabilities: ['system.echo'],
    constraints: { network: false },
    schemas: {
      input: { type: 'object' },
      output: { type: 'object' }
    },
    source: { type: 'native', digest: 'a'.repeat(64) },
    sbom_digest: 'b'.repeat(64),
    issuer: { id: 'test-issuer', public_key: publicKey }
  };
  const signature = sign(null, Buffer.from(canonicalJson(unsigned)), pair.privateKey).toString('base64url');
  assert.equal(
    verify(null, Buffer.from(canonicalJson(unsigned)), pair.publicKey, Buffer.from(signature, 'base64url')),
    true
  );
});

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}