# AXIOM Application Secrets and Supply-Chain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make secret exposure and dependency integrity ordinary fail-closed application checks while reusing AXIOM's existing credential-history audit and dependency-audit controls.

**Architecture:** The existing credential-history scanner remains the authoritative historical credential control and continues to use a separately provided HMAC audit key. A lightweight current-tree application scan runs in ordinary checks without emitting secret values, while protected CI continues the full history audit and `npm audit --omit=dev`. Supply-chain verification asserts that the dependency-free kernel/root lock state and pinned CI actions cannot silently drift.

**Tech Stack:** Node.js ES modules, Git CLI through existing bounded subprocess patterns, `node:test`, GitHub Actions YAML, existing `credential-history-audit.mjs`; no new scanner or package dependency.

**Spec:** `docs/superpowers/specs/2026-09-05-application-security-baseline-design.md`

## Global Constraints

- Never print or persist a discovered secret value.
- A discovered credential is treated as compromised; history rewriting never substitutes for rotation/revocation.
- Keep `AXIOM_CREDENTIAL_AUDIT_KEY` outside source control.
- Preserve the existing full-history credential audit in protected CI.
- Preserve `persist-credentials: false` on checkout.
- Preserve SHA-pinned GitHub Actions.
- Preserve the root and kernel dependency-free runtime unless a separately reviewed dependency change explicitly updates the threat/supply-chain boundary.
- Add no production dependency in this slice.
- Do not change runtime capability claims.

---

### Task 1: Current supported-tree secret scan

**Files:**
- Create: `mesh/src/check-supported-source-secrets.mjs`
- Create: `mesh/test/supported-source-secrets.test.mjs`
- Modify: `mesh/package.json`
- Modify: root `package.json`

**Interfaces:**
- Consumes: `findCredentialCandidates(content, path, auditKey)` from `mesh/src/credential-history-audit.mjs`.
- Produces: `checkSupportedSourceSecrets({ repositoryRoot, auditKey }) -> { valid, scanned_files }`.
- Produces: `npm run source-secrets:check`.

- [ ] **Step 1: Write a failing fixture test**

```js
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { checkSupportedSourceSecrets } from '../src/check-supported-source-secrets.mjs';

test('supported source secret scan rejects a production-like credential without echoing it', async t => {
  const root = await mkdtemp(join(tmpdir(), 'axiom-source-secret-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'apps', 'fixture'), { recursive: true });
  const secret = `AIza${'A'.repeat(35)}`;
  await writeFile(join(root, 'apps', 'fixture', 'client.mjs'), `export const key = '${secret}';\n`);
  await assert.rejects(
    checkSupportedSourceSecrets({ repositoryRoot: root, auditKey: Buffer.alloc(32, 7) }),
    error => {
      assert.match(error.message, /secret-like credential candidate/);
      assert.equal(error.message.includes(secret), false);
      return true;
    }
  );
});
```

- [ ] **Step 2: Run RED**

```bash
node --test mesh/test/supported-source-secrets.test.mjs
```

Expected: FAIL because the checker does not exist.

- [ ] **Step 3: Implement bounded production-source scanning**

Create `mesh/src/check-supported-source-secrets.mjs` with fixed production-bearing roots:

```js
const SCAN_ROOTS = Object.freeze([
  'apps',
  'packages',
  'mesh/src',
  'mesh/config',
  '.github/workflows'
]);
```

Walk only regular files, reject symlinks while scanning, skip files larger than 8 MiB, and scan extensions:

```js
const TEXT_EXTENSIONS = new Set([
  '.cjs', '.css', '.html', '.js', '.json', '.md', '.mjs', '.toml', '.txt', '.webmanifest', '.yml', '.yaml'
]);
```

For each file call `findCredentialCandidates`. If any candidate exists, throw only:

```js
throw new ValidationError(
  `Supported source contains a secret-like credential candidate: ${relativePath}`
);
```

Do not return candidate IDs, kinds, labels, content excerpts, or values. Use `randomBytes(32)` as the default ephemeral key when one is not supplied.

- [ ] **Step 4: Add safe-source and path-boundary tests**

Test that placeholder `.env`-style values are accepted, binary/oversized files are not parsed as ordinary text, and a symlink inside a scanned root fails closed rather than following outside the repository tree.

Use exact assertions:

```js
assert.equal((await checkSupportedSourceSecrets({ repositoryRoot: root })).valid, true);
await assert.rejects(checkSupportedSourceSecrets({ repositoryRoot: symlinkRoot }), /symlink/);
```

- [ ] **Step 5: Wire scripts**

Add to `mesh/package.json`:

```json
"source-secrets:check": "node src/check-supported-source-secrets.mjs"
```

Insert `node src/check-supported-source-secrets.mjs` into `npm run check` before application-security conformance.

Add to root `package.json`:

```json
"source-secrets:check": "npm --prefix mesh run source-secrets:check"
```

- [ ] **Step 6: Run GREEN**

```bash
npm run source-secrets:check
node --test mesh/test/supported-source-secrets.test.mjs
npm run check
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add mesh/src/check-supported-source-secrets.mjs mesh/test/supported-source-secrets.test.mjs mesh/package.json package.json
git commit -m "security: scan supported source for secrets"
```

### Task 2: Supply-chain invariant checker

**Files:**
- Create: `mesh/src/check-application-supply-chain.mjs`
- Create: `mesh/test/application-supply-chain.test.mjs`
- Modify: `mesh/package.json`
- Modify: root `package.json`

**Interfaces:**
- Produces: `checkApplicationSupplyChain() -> { valid, root_dependency_count, kernel_dependency_count, audits_required }`.
- Reads: root `package.json`, `package-lock.json`, `mesh/package.json`, `.github/workflows/kernel.yml`.

- [ ] **Step 1: Write the failing invariant test**

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { checkApplicationSupplyChain } from '../src/check-application-supply-chain.mjs';

test('application supply-chain policy preserves dependency-free kernel and protected audits', async () => {
  const result = await checkApplicationSupplyChain();
  assert.equal(result.valid, true);
  assert.equal(result.root_dependency_count, 0);
  assert.equal(result.kernel_dependency_count, 0);
  assert.equal(result.audits_required, true);
});
```

- [ ] **Step 2: Run RED**

```bash
node --test mesh/test/application-supply-chain.test.mjs
```

Expected: FAIL because the checker does not exist.

- [ ] **Step 3: Implement manifest and workflow validation**

The checker must reject non-empty `dependencies`, `devDependencies`, `optionalDependencies`, or `peerDependencies` in the root or `mesh/package.json` unless a future policy version explicitly changes this invariant.

It must require root `package-lock.json` to remain lockfile version 3 and contain only the root package entry in `packages` for this v1 dependency-free state.

It must require `.github/workflows/kernel.yml` to contain all of:

```text
persist-credentials: false
npm audit --omit=dev
npm --prefix mesh audit --omit=dev
AXIOM_CREDENTIAL_AUDIT_KEY: ${{ secrets.AXIOM_CREDENTIAL_AUDIT_KEY }}
npm run credential-history:audit
```

It must reject any workflow `uses:` entry that is not pinned to a 40-hex commit SHA.

- [ ] **Step 4: Add weakening fixtures**

Create temporary fixture manifests/workflows and assert rejection when:

```js
rootPackage.dependencies = { leftpad: '1.0.0' };
```

when `persist-credentials` becomes `true`, when either `npm audit` command is removed, and when an action changes from `owner/action@<40hex>` to `owner/action@v7`.

- [ ] **Step 5: Wire scripts**

Add:

```json
"application-supply-chain:check": "node src/check-application-supply-chain.mjs"
```

to `mesh/package.json`, include it in `check`, and add the matching root forwarding script.

- [ ] **Step 6: Run GREEN**

```bash
npm run application-supply-chain:check
node --test mesh/test/application-supply-chain.test.mjs
npm run check
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add mesh/src/check-application-supply-chain.mjs mesh/test/application-supply-chain.test.mjs mesh/package.json package.json
git commit -m "security: bind application supply chain policy"
```

### Task 3: Preserve full-history credential evidence and incident semantics

**Files:**
- Modify only if verification shows drift: `.github/workflows/kernel.yml`
- Modify only if wording is stale: `docs/security/CREDENTIAL-HISTORY-REVOCATION.md`
- Test: `mesh/test/application-supply-chain.test.mjs`

**Interfaces:**
- Preserves: signed/HMAC-safe credential-history evidence and separate external revocation semantics.

- [ ] **Step 1: Verify existing protected history audit**

```bash
npm run credential-history:audit
```

Run only in an environment with the separately provisioned `AXIOM_CREDENTIAL_AUDIT_KEY`. Expected: evidence is emitted without raw credential values.

- [ ] **Step 2: Verify workflow remains fail closed**

Confirm the workflow uses `secrets.AXIOM_CREDENTIAL_AUDIT_KEY`, writes evidence only to `$RUNNER_TEMP`, uploads only the evidence JSON, and never echoes the secret.

- [ ] **Step 3: Add a documentation assertion**

Extend `application-supply-chain.test.mjs` to read `docs/security/CREDENTIAL-HISTORY-REVOCATION.md` and require phrases expressing both rules:

```text
scanner never writes a token, password, private key, or secret-bearing Git object
history rewrite does not revoke an external credential
```

Use the exact current wording if it differs semantically; do not rewrite the document merely to satisfy a new phrase.

- [ ] **Step 4: Run final supply-chain verification**

```bash
npm run source-secrets:check
npm run application-supply-chain:check
npm run check
npm run release:verify
```

Expected: PASS.

- [ ] **Step 5: Commit only if Task 3 required a real change**

If no workflow/document drift exists, create no empty commit. Otherwise commit only the verified correction.
