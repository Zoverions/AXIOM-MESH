import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  createCredentialHistoryEvidence,
  createCredentialRevocationLedger,
  findCredentialCandidates,
  scanGitHistory,
  validateCredentialRevocationLedger,
  verifyCredentialHistoryEvidence,
  verifySupportedHistoryExcludesDeprecatedCredentials
} from '../src/credential-history-audit.mjs';

const GIT = process.env.AXIOM_GIT_EXECUTABLE || 'git';
const AUDIT_KEY = Buffer.alloc(32, 0x5a);
const DEPRECATED_REF = 'archive/legacy-main-pre-clean-room-2026-05-21';
const FIXTURE_TOKEN = 'fixture-operator-token-123456789';

test('credential history scanner emits keyed identifiers without secret values', () => {
  const privatePem = generateKeyPairSync('ed25519').privateKey.export({
    type: 'pkcs8',
    format: 'pem'
  });
  const content = Buffer.from(
    `AXIOM_OPERATOR_TOKEN=${FIXTURE_TOKEN}\n${privatePem}`
  );
  const findings = findCredentialCandidates(content, '.env', AUDIT_KEY);

  assert.equal(findings.length, 2);
  assert.ok(findings.every(finding => (
    finding.credential_id.startsWith('hmac-sha256:')
    && !JSON.stringify(finding).includes(FIXTURE_TOKEN)
    && !JSON.stringify(finding).includes('PRIVATE KEY-----')
  )));
});

test('credential revocation ledger covers deprecated history and blocks reuse', async t => {
  const repositoryRoot = await mkdtemp(join(tmpdir(), 'axiom-credential-history-'));
  t.after(() => rm(repositoryRoot, { recursive: true, force: true }));
  git(repositoryRoot, ['init', '--initial-branch=legacy']);
  git(repositoryRoot, ['config', 'user.name', 'AXIOM Test']);
  git(repositoryRoot, ['config', 'user.email', 'test@invalid.example']);

  const pair = generateKeyPairSync('ed25519');
  const privatePem = pair.privateKey.export({ type: 'pkcs8', format: 'pem' });
  await mkdir(join(repositoryRoot, 'certs'), { recursive: true });
  await writeFile(
    join(repositoryRoot, '.env'),
    `AXIOM_OPERATOR_TOKEN=${FIXTURE_TOKEN}\n`
  );
  await writeFile(join(repositoryRoot, 'certs', 'gateway.key'), privatePem);
  git(repositoryRoot, ['add', '.']);
  git(repositoryRoot, ['commit', '-m', 'legacy fixture credentials']);
  git(repositoryRoot, ['tag', DEPRECATED_REF]);

  git(repositoryRoot, ['switch', '--orphan', 'main']);
  await writeFile(join(repositoryRoot, 'README.md'), 'clean supported root\n');
  git(repositoryRoot, ['add', '.']);
  git(repositoryRoot, ['commit', '-m', 'clean root']);

  const legacyInventory = scanGitHistory({
    repositoryRoot,
    ref: DEPRECATED_REF,
    auditKey: AUDIT_KEY,
    gitExecutable: GIT
  });
  const currentInventory = scanGitHistory({
    repositoryRoot,
    ref: 'main',
    auditKey: AUDIT_KEY,
    scope: 'tree',
    gitExecutable: GIT
  });
  assert.equal(legacyInventory.records.length, 2);
  assert.equal(currentInventory.records.length, 0);

  const ledger = createCredentialRevocationLedger({
    legacyInventory,
    deprecatedRef: DEPRECATED_REF,
    auditKey: AUDIT_KEY,
    generatedAt: '2026-07-28T12:00:00.000Z'
  });
  const validation = validateCredentialRevocationLedger(ledger, {
    expectedInventory: legacyInventory,
    auditKey: AUDIT_KEY,
    expectedDeprecatedRef: DEPRECATED_REF
  });
  const trust = verifySupportedHistoryExcludesDeprecatedCredentials({
    legacyInventory,
    currentInventory
  });
  assert.equal(validation.repository_revoked, 2);
  assert.equal(validation.external_attestation_required, 2);
  assert.equal(validation.external_complete, false);
  assert.equal(trust.reused_credentials, 0);

  const evidence = createCredentialHistoryEvidence({
    ledger,
    ledgerValidation: validation,
    legacyInventory,
    currentInventory,
    trustComparison: trust,
    generatedAt: '2026-07-28T12:00:00.000Z'
  });
  assert.equal(verifyCredentialHistoryEvidence(evidence).valid, true);
  const serializedEvidence = JSON.stringify(evidence);
  assert.doesNotMatch(serializedEvidence, new RegExp(FIXTURE_TOKEN));
  assert.doesNotMatch(serializedEvidence, /PRIVATE KEY-----/);

  const tamperedEvidence = structuredClone(evidence);
  tamperedEvidence.inventory.credential_count += 1;
  assert.throws(
    () => verifyCredentialHistoryEvidence(tamperedEvidence),
    /attestation/
  );

  const incompleteLedger = structuredClone(ledger);
  incompleteLedger.entries.pop();
  assert.throws(
    () => validateCredentialRevocationLedger(incompleteLedger, {
      expectedInventory: legacyInventory,
      auditKey: AUDIT_KEY,
      expectedDeprecatedRef: DEPRECATED_REF
    }),
    /summary|exact historical inventory/
  );

  await writeFile(
    join(repositoryRoot, '.env'),
    `AXIOM_OPERATOR_TOKEN=${FIXTURE_TOKEN}\n`
  );
  git(repositoryRoot, ['add', '.env']);
  git(repositoryRoot, ['commit', '-m', 'reintroduce deprecated fixture']);
  const reusedInventory = scanGitHistory({
    repositoryRoot,
    ref: 'main',
    auditKey: AUDIT_KEY,
    scope: 'tree',
    gitExecutable: GIT
  });
  assert.throws(
    () => verifySupportedHistoryExcludesDeprecatedCredentials({
      legacyInventory,
      currentInventory: reusedInventory
    }),
    /reintroduces 1 deprecated credential/
  );

  const ledgerFile = join(repositoryRoot, 'ledger.json');
  await writeFile(ledgerFile, `${JSON.stringify(ledger)}\n`);
  assert.equal(JSON.parse(await readFile(ledgerFile, 'utf8')).entries.length, 2);
});

function git(cwd, args) {
  return execFileSync(GIT, args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  }).trim();
}
