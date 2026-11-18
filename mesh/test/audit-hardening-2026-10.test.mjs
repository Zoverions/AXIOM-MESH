import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { generateKeyPairSync, sign } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { canonicalJson, digestObject, sha256 } from '../src/lib/canonical.mjs';
import { verifyCausalBundle, verifyCausalUpdate } from '../src/lib/causal-sync.mjs';
import { buildMachineDiscovery } from '../src/lib/machine-discovery.mjs';
import { MachineIngressGuard } from '../src/lib/machine-ingress.mjs';
import { normalizeMachinePrincipalDefinition } from '../src/lib/machine-principal.mjs';
import {
  verifyNodeAdmission,
  verifyNodeRenewal,
  verifyStorageOffer
} from '../src/lib/nodes.mjs';
import { PolicyEngine } from '../src/lib/policy.mjs';
import { verifyProtectedArtifactState } from '../src/lib/protected-artifact.mjs';
import { executeBuiltin } from '../src/sandbox/executor.mjs';
import { CANONICAL_JSON_MAX_DEPTH } from '../../packages/axiom-verify/canonical.mjs';
import {
  canonicalize as verifyCanonicalize,
  createContinuityAnchorFixture,
  createSignedReceiptFixture,
  digestObject as verifyDigestObject,
  generateEd25519Identity,
  signObject,
  verifyContinuityAnchor,
  verifyMachineReceiptLike
} from '../../packages/axiom-verify/index.mjs';
import {
  PRAXIS_CANONICAL_JSON_MAX_DEPTH,
  canonicalizePraxis
} from '../../labs/praxis/canonical.mjs';

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));

function makeMachinePrincipal(id, maxRequestsPerMinute = 2) {
  return normalizeMachinePrincipalDefinition({
    id,
    type: 'agent',
    sponsor: 'owner.audit-hardening',
    roles: ['researcher'],
    scopes: ['intent:execute'],
    lifetime: 'session',
    expires_at: '2099-01-01T00:00:00.000Z',
    runtime: {
      id: `runtime.${id}`,
      kind: 'local-process',
      software_digest: 'a'.repeat(64)
    },
    constraints: {
      actions: ['system.echo', 'system.hash', 'system.unachievable-a4', 'system.unapproved-a3'],
      purposes: ['research.read'],
      destinations: ['local'],
      budgets: {
        max_requests_per_minute: maxRequestsPerMinute,
        max_concurrent_requests: 2,
        max_execution_ms: 1_500,
        max_request_bytes: 8_192,
        max_response_bytes: 16_384
      },
      delegation: { allowed: false, max_depth: 0 }
    }
  });
}

test('RT-AUTH-001 / H-3: MachineIngressGuard fails closed at principal bound instead of evicting exhausted rate buckets', () => {
  const guard = new MachineIngressGuard({ maxPrincipals: 2 });
  const p1 = makeMachinePrincipal('agent.rate-one', 1);
  const p2 = makeMachinePrincipal('agent.rate-two', 1);
  const p3 = makeMachinePrincipal('agent.rate-three', 1);
  const now = Date.parse('2026-10-13T12:00:00.000Z');

  // Exhaust both p1 and p2 at t = now
  guard.enforce(p1, { requestBytes: 64, now });
  assert.throws(
    () => guard.enforce(p1, { requestBytes: 64, now }),
    error => error?.code === 'machine_rate_budget_exceeded' && error?.status === 429
  );
  guard.enforce(p2, { requestBytes: 64, now });

  // A third principal at the same timestamp cannot evict an exhausted bucket
  assert.throws(
    () => guard.enforce(p3, { requestBytes: 64, now }),
    error => error?.code === 'machine_rate_state_unavailable' && error?.status === 503
  );

  // p1 remains rate-limited (was not evicted)
  assert.throws(
    () => guard.enforce(p1, { requestBytes: 64, now }),
    error => error?.code === 'machine_rate_budget_exceeded' && error?.status === 429
  );

  // Once 60s elapse and p1 refills to capacity, p3 can evict the refilled bucket
  const refilledNow = now + 60_000;
  const admitted = guard.enforce(p3, { requestBytes: 64, now: refilledNow });
  assert.equal(admitted.constrained, true);
});

test('RT-CRED-003 / H-9: node admission, renewal, storage offer, causal sync, capsule registration, and protected-artifact rewrap canonicalize SPKI PEM before hashing key identity', () => {
  const pair = generateKeyPairSync('ed25519');
  const canonicalPem = pair.publicKey.export({ type: 'spki', format: 'pem' });
  const crlfPem = `${canonicalPem.replace(/\n/g, '\r\n')}\r\n  \r\n`;
  assert.notEqual(sha256(canonicalPem), sha256(crlfPem));

  const expiresAt = new Date(Date.now() + 3_600_000).toISOString();

  // 1. Node admission with CRLF PEM produces canonical public_key_digest
  const admissionStatement = {
    format: 'axiom-node-admission.v1',
    node_id: 'node.pem-crlf',
    public_key: crlfPem,
    security_profile: 'S1_SIGNED_NODE',
    capabilities: ['compute'],
    software_digest: 'b'.repeat(64),
    expires_at: expiresAt,
    nonce: 'nonce.admission.1'
  };
  const admissionSig = sign(null, Buffer.from(canonicalJson(admissionStatement)), pair.privateKey).toString('base64url');
  const verifiedAdmission = verifyNodeAdmission({
    ...admissionStatement,
    signature: admissionSig
  });
  assert.equal(verifiedAdmission.public_key_digest, sha256(canonicalPem));

  // 2. Node renewal with CRLF PEM produces canonical public_key_digest
  const renewalStatement = {
    format: 'axiom-node-renewal.v1',
    node_id: 'node.pem-crlf',
    capabilities: ['compute'],
    software_digest: 'b'.repeat(64),
    expires_at: expiresAt,
    nonce: 'nonce.renewal.1'
  };
  const renewalSig = sign(null, Buffer.from(canonicalJson(renewalStatement)), pair.privateKey).toString('base64url');
  const verifiedRenewal = verifyNodeRenewal({
    ...renewalStatement,
    public_key: crlfPem,
    signature: renewalSig
  });
  assert.equal(verifiedRenewal.public_key_digest, sha256(canonicalPem));

  // 3. Storage offer with CRLF PEM produces canonical public_key_digest
  const offerStatement = {
    format: 'axiom-storage-offer.v1',
    node_id: 'node.pem-crlf',
    capacity_bytes: 1024,
    available_bytes: 512,
    regions: ['local'],
    expires_at: expiresAt,
    nonce: 'nonce.offer.1'
  };
  const offerSig = sign(null, Buffer.from(canonicalJson(offerStatement)), pair.privateKey).toString('base64url');
  const verifiedOffer = verifyStorageOffer({
    ...offerStatement,
    public_key: crlfPem,
    signature: offerSig
  });
  assert.equal(verifiedOffer.public_key_digest, sha256(canonicalPem));

  // 4. Causal sync update and bundle with CRLF PEM match canonical expectedPublicKeyDigest
  const occurredAt = new Date().toISOString();
  const payload = { note: 'canonical-pem' };
  const updateStatement = {
    format: 'axiom-causal-update.v1',
    owner: 'owner:test',
    node_id: 'node.pem-crlf',
    namespace: 'notes',
    record_id: 'rec.1',
    operation: 'put',
    value: payload,
    value_digest: digestObject(payload),
    vector: { 'node.pem-crlf': 1 },
    resolves: [],
    occurred_at: occurredAt,
    nonce: 'nonce.causal.1'
  };
  const updateSig = sign(null, Buffer.from(canonicalJson(updateStatement)), pair.privateKey).toString('base64url');
  const verifiedUpdate = verifyCausalUpdate(
    { ...updateStatement, public_key: crlfPem, signature: updateSig },
    { expectedPublicKeyDigest: sha256(canonicalPem) }
  );
  assert.equal(verifiedUpdate.public_key_digest, sha256(canonicalPem));

  const bundleStatement = {
    format: 'axiom-causal-sync-bundle.v1',
    owner: 'owner:test',
    source_node_id: 'node.pem-crlf',
    updates: [{ ...updateStatement, public_key: crlfPem, signature: updateSig }],
    created_at: occurredAt,
    nonce: 'nonce.bundle.1'
  };
  const bundleSig = sign(null, Buffer.from(canonicalJson(bundleStatement)), pair.privateKey).toString('base64url');
  const verifiedBundle = verifyCausalBundle(
    { ...bundleStatement, public_key: crlfPem, signature: bundleSig },
    { expectedPublicKeyDigest: sha256(canonicalPem) }
  );
  assert.equal(verifiedBundle.public_key_digest, sha256(canonicalPem));

  // 5. Sandbox capsule.register normalizes issuer PEM in signer id and rejects non-Ed25519 keys
  const unsignedManifest = {
    capsule_id: 'capsule.canonical-test',
    version: '1.0.0',
    name: 'Canonical Test Capsule',
    description: 'Verifies canonical SPKI PEM signer id',
    capabilities: ['system.echo'],
    constraints: { network: false },
    schemas: { input: {}, output: {} },
    source: { type: 'git', digest: 'c'.repeat(64) },
    sbom_digest: 'd'.repeat(64),
    issuer: {
      id: 'issuer.canonical',
      public_key: crlfPem
    }
  };
  const manifestSig = sign(null, Buffer.from(canonicalJson(unsignedManifest)), pair.privateKey).toString('base64url');
  const capsuleResult = executeBuiltin({
    tool: 'builtin.validate-mutation',
    intent: {
      action: 'capsule.register',
      input: { manifest: { ...unsignedManifest, signature: manifestSig } },
      principal: { id: 'issuer.canonical' }
    }
  });
  assert.equal(
    capsuleResult.mutation.payload.signer,
    `issuer.canonical:${sha256(canonicalPem).slice(0, 16)}`
  );

  // 6. Protected-artifact rewrap verification normalizes signer.public_key_pem against canonical Grid key_id
  const canonicalGridKeyId = `grid:${sha256(canonicalPem).slice(0, 16)}`;
  const sourceMeta = { sha256: '1'.repeat(64), bytes: 128 };
  const targetMeta = { sha256: '2'.repeat(64), bytes: 128 };
  const unsignedRewrap = {
    format: 'axiom-protected-artifact-rewrap.v1',
    schema_version: 1,
    rotation_id: 'rot.canonical.1',
    created_at: occurredAt,
    artifact: {
      path: 'artifacts/demo.enc',
      context: 'axiom:test',
      encoding: 'bytes'
    },
    source: sourceMeta,
    target: targetMeta,
    prior: null,
    signer: {
      service: 'grid',
      key_id: canonicalGridKeyId,
      public_key_pem: crlfPem
    }
  };
  const rewrapBody = canonicalJson(unsignedRewrap);
  const rewrapState = verifyProtectedArtifactState({
    rewrap: {
      ...unsignedRewrap,
      attestation: {
        algorithm: 'Ed25519',
        key_id: canonicalGridKeyId,
        digest: sha256(rewrapBody),
        signature: sign(null, Buffer.from(rewrapBody), pair.privateKey).toString('base64url')
      }
    },
    expected: sourceMeta,
    actual: targetMeta,
    relativePath: 'artifacts/demo.enc',
    context: 'axiom:test',
    encoding: 'bytes',
    verificationKeys: new Map([[canonicalGridKeyId, pair.publicKey]])
  });
  assert.equal(rewrapState.valid, true);
  assert.equal(rewrapState.rewrapped, true);
  assert.equal(rewrapState.rotations, 1);
});

test('RT-AUTH-001 / RT-REL-008: buildMachineDiscovery omits actions with unachievable runtime assurance', () => {
  const policyDef = {
    version: 'assurance-filter-v1',
    defaults: {},
    actions: {
      'system.echo': {
        decision: 'allow',
        risk: 'low',
        required_scopes: ['intent:execute'],
        tool: 'builtin.echo'
      },
      'system.unachievable-a4': {
        decision: 'allow',
        risk: 'critical',
        required_assurance: 'A4',
        requires_independent_approval: true,
        required_scopes: ['intent:execute'],
        tool: 'builtin.hash'
      },
      'system.unapproved-a3': {
        decision: 'allow',
        risk: 'high',
        required_assurance: 'A3',
        requires_independent_approval: false,
        required_scopes: ['intent:execute'],
        tool: 'builtin.hash'
      }
    }
  };
  const policyEngine = new PolicyEngine(policyDef, {
    layers: [{ order: 0, version: policyDef.version, digest: 'e'.repeat(64) }]
  });
  const principal = makeMachinePrincipal('agent.assurance-discovery');

  // PolicyEngine.evaluate denies both unachievable actions
  assert.equal(
    policyEngine.evaluate({ action: 'system.unachievable-a4', principal, intent: {} }).code,
    'assurance_unavailable'
  );
  assert.equal(
    policyEngine.evaluate({ action: 'system.unapproved-a3', principal, intent: {} }).code,
    'assurance_path_unavailable'
  );

  // Machine discovery must not advertise either unexecutable action
  const discovery = buildMachineDiscovery({
    principal,
    policy: policyEngine,
    kernelVersion: '0.12.0-dev.3'
  });
  assert.deepEqual(discovery.actions.map(item => item.id), ['system.echo']);
});

test('RT-EVID-004: AXIOM Verify rejects top-level envelope injection, signer key_id mismatch, and Proxy/cyclic/over-deep canonical inputs', () => {
  const { receipt, publicKeyPem } = createSignedReceiptFixture();

  // 1. Top-level verification injection into receipt envelope must FAIL closed
  const injectedReceipt = structuredClone(receipt);
  injectedReceipt.verification = { forged: true };
  const { receipt_digest: _r, ...injectedReceiptEnv } = injectedReceipt;
  injectedReceipt.receipt_digest = verifyDigestObject(injectedReceiptEnv);
  const receiptInjectedResult = verifyMachineReceiptLike(injectedReceipt, { publicKeyPem });
  assert.equal(receiptInjectedResult.ok, false);
  assert.equal(receiptInjectedResult.code, 'invalid_shape');
  assert.equal(receiptInjectedResult.report.verdict, 'FAIL');

  // 2. Arbitrary extra top-level field on receipt must FAIL closed
  const extraFieldReceipt = structuredClone(receipt);
  extraFieldReceipt.untrusted_note = 'injected';
  const { receipt_digest: _r2, ...extraFieldEnv } = extraFieldReceipt;
  extraFieldReceipt.receipt_digest = verifyDigestObject(extraFieldEnv);
  const receiptExtraResult = verifyMachineReceiptLike(extraFieldReceipt, { publicKeyPem });
  assert.equal(receiptExtraResult.ok, false);
  assert.equal(receiptExtraResult.code, 'invalid_shape');

  // 3. Receipt signed with attacker key but claiming victim attestation.key_id must FAIL closed
  const attacker = generateEd25519Identity('grid');
  const forgedAttestation = {
    ...signObject(receipt.statement, attacker),
    key_id: receipt.attestation.key_id
  };
  const spoofedEnv = {
    schema: receipt.schema,
    statement: receipt.statement,
    attestation: forgedAttestation
  };
  const spoofedReceipt = {
    ...spoofedEnv,
    receipt_digest: verifyDigestObject(spoofedEnv)
  };
  const spoofedResult = verifyMachineReceiptLike(spoofedReceipt, {
    publicKeyPem: attacker.publicPem
  });
  assert.equal(spoofedResult.ok, false);
  assert.equal(spoofedResult.code, 'signature_invalid');

  // 4. Continuity anchor rejects extra top-level fields and mismatched grid_key_id
  const { anchor, publicKeyPem: anchorKeyPem, chainSegment } = createContinuityAnchorFixture();
  const injectedAnchor = structuredClone(anchor);
  injectedAnchor.extra = 'unsigned-top-level';
  const { anchor_digest: _a, ...injectedAnchorRecord } = injectedAnchor;
  injectedAnchor.anchor_digest = verifyDigestObject(injectedAnchorRecord);
  const anchorInjectedResult = verifyContinuityAnchor(injectedAnchor, {
    publicKeyPem: anchorKeyPem,
    chainSegment
  });
  assert.equal(anchorInjectedResult.ok, false);
  assert.equal(anchorInjectedResult.code, 'invalid_shape');

  // 5. Proxy, cyclic, and over-deep objects fail closed in both Verify and Praxis canonicalizers
  const proxyObj = new Proxy({ a: 1 }, {});
  assert.throws(() => verifyCanonicalize(proxyObj), /Proxy/);
  assert.throws(() => canonicalizePraxis(proxyObj), /Proxy/);

  const cyclic = { a: 1 };
  cyclic.self = cyclic;
  assert.throws(() => verifyCanonicalize(cyclic), /cyclic/);
  assert.throws(() => canonicalizePraxis(cyclic), /cyclic/);

  assert.equal(CANONICAL_JSON_MAX_DEPTH, 2048);
  assert.equal(PRAXIS_CANONICAL_JSON_MAX_DEPTH, 2048);
  let deep = 'leaf';
  for (let i = 0; i < CANONICAL_JSON_MAX_DEPTH + 2; i += 1) {
    deep = [deep];
  }
  assert.throws(() => verifyCanonicalize(deep), /exceeds 2048 levels|stack depth/);
  assert.throws(() => canonicalizePraxis(deep), /exceeds 2048 levels|stack depth/);
});

test('RT-KERN-005: repo-entry-profile.mjs detects inline-commented headers, same-line section assignments, and line continuations', () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'axiom-repo-entry-bypass-'));
  const configPath = join(tempRoot, 'config');
  writeFileSync(
    configPath,
    [
      '[core] # trailing comment on section header',
      '  fsmonitor = /tmp/evil-monitor',
      '[core] hooksPath = .evil-hooks',
      '[filter "lfs"] ; comment after subsection header',
      '  proc\\',
      'ess = /tmp/evil-filter',
      '[alias]',
      '  sneak = \\',
      '    !sh -c "id"'
    ].join('\n'),
    'utf8'
  );

  try {
    const result = spawnSync(process.execPath, ['repo-entry-profile.mjs', configPath], {
      cwd: repositoryRoot,
      encoding: 'utf8',
      windowsHide: true
    });
    assert.equal(result.status, 2, result.stderr || result.stdout);
    const profile = JSON.parse(result.stdout);
    assert.equal(profile.passed, false);
    assert.equal(profile.finding_count, 4);
    assert.deepEqual(
      profile.files[0].findings.map(({ key, risk_class, value }) => ({ key, risk_class, value })),
      [
        { key: 'core.fsmonitor', risk_class: 'automatic-helper', value: 'REDACTED' },
        { key: 'core.hookspath', risk_class: 'hook-redirection', value: 'REDACTED' },
        { key: 'filter.*.process', risk_class: 'content-filter-command', value: 'REDACTED' },
        { key: 'alias.sneak', risk_class: 'shell-alias', value: 'REDACTED' }
      ]
    );
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('RT-CRED-003: mcp-config-credential-check.mjs detects literal secrets in CLI args arrays while allowing safe references', () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'axiom-mcp-args-'));
  const riskyPath = join(tempRoot, 'risky.json');
  const safePath = join(tempRoot, 'safe.json');

  writeFileSync(
    riskyPath,
    JSON.stringify({
      mcpServers: {
        cliSecret: {
          command: 'npx',
          args: [
            '--api-key=sk-hardcoded-111',
            '--token',
            'ghp_hardcoded_222',
            'Authorization: Bearer hardcoded_333',
            '--header=Authorization: Bearer hardcoded_444'
          ]
        }
      }
    }),
    'utf8'
  );

  writeFileSync(
    safePath,
    JSON.stringify({
      mcpServers: {
        cliSafe: {
          command: 'npx',
          args: [
            '--api-key=${env:MCP_API_KEY}',
            '--token',
            '${input:mcp_token}',
            'Authorization: Bearer op://Private/MCP/token',
            '--header=Authorization: Bearer ${env:MCP_HEADER_TOKEN}'
          ]
        }
      }
    }),
    'utf8'
  );

  try {
    const riskyResult = spawnSync(
      process.execPath,
      ['mcp-config-credential-check.mjs', riskyPath],
      { cwd: repositoryRoot, encoding: 'utf8', windowsHide: true }
    );
    assert.equal(riskyResult.status, 2);
    assert.match(riskyResult.stdout, /4 hardcoded credential literals found/);
    assert.doesNotMatch(
      riskyResult.stdout,
      /sk-hardcoded-111|ghp_hardcoded_222|hardcoded_333|hardcoded_444/
    );

    const safeResult = spawnSync(
      process.execPath,
      ['mcp-config-credential-check.mjs', safePath],
      { cwd: repositoryRoot, encoding: 'utf8', windowsHide: true }
    );
    assert.equal(safeResult.status, 0);
    assert.match(safeResult.stdout, /no hardcoded credential literals found/);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('RT-EVID-004: profile scripts ignore ambient GIT_DIR and GIT_WORK_TREE environment overrides', () => {
  const spoofedEnv = {
    ...process.env,
    GIT_DIR: '/nonexistent/spoofed-git-dir',
    GIT_WORK_TREE: '/nonexistent/spoofed-work-tree'
  };

  const memoryResult = spawnSync(process.execPath, ['memory-lifecycle-profile.mjs'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    env: spoofedEnv,
    windowsHide: true
  });
  const memoryProfile = JSON.parse(memoryResult.stdout);
  assert.equal(memoryProfile.schema, 'axiom-memory-lifecycle-profile.v0');
  assert.equal(memoryProfile.preview_status, 'experimental-local-preview');

  const probeResult = spawnSync(process.execPath, ['community-testnet-probe.mjs'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    env: spoofedEnv,
    windowsHide: true
  });
  const probeProfile = JSON.parse(probeResult.stdout);
  assert.equal(probeProfile.schema, 'axiom-community-testnet-probe.v0');
});
