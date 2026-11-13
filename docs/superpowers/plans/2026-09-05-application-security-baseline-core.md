# AXIOM Application Security Baseline Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a machine-verifiable, fail-closed application-security conformance layer and adopt it for the existing AXIOM One loopback application without widening Mesh authority.

**Architecture:** A new canonical baseline policy defines universal controls and adapter activation rules. Each application registers a small security profile declaring its exposure and which conditional adapters are active; a repository checker validates those declarations, scans browser-facing source for prohibited secret/injection/storage patterns, and fails closed on unknown or weakened states. AXIOM One remains loopback-only and bearer-token based; the implementation formalizes existing protections rather than introducing hosted sessions, databases, uploads, or Internet exposure.

**Tech Stack:** Node.js ES modules, `node:test`, JSON policy/manifest files, existing AXIOM canonical validators and credential scanner, no new production dependencies.

**Spec:** `docs/superpowers/specs/2026-09-05-application-security-baseline-design.md`

## Global Constraints

- Preserve `Gateway -> Hypervisor -> Sandbox -> Grid` as the supported privileged-effect path.
- Primary/protected runtime: Node.js `>=24.14.0 <25`; protected CI pin: Node.js `24.18.0`.
- Hosted-production compatibility remains Node.js `22.23.2`; this slice does not activate a hosted production application.
- Add no runtime dependency.
- Browser state cannot create authority.
- Unknown application security state fails closed.
- Existing AXIOM One loopback HTTP is not converted to HTTPS; the HTTPS/HSTS adapter remains inactive for loopback-only exposure.
- Existing AXIOM One bearer tokens remain memory-only and cookies remain unused.
- Do not modify `mesh/config/capabilities.json`; this slice does not add a privileged capability.
- Every security control added here requires a negative-path test.

---

## File Structure

- Create `mesh/config/application-security-baseline.json` — canonical machine-readable baseline and allowed control/adaptor state vocabulary.
- Create `mesh/src/lib/application-security-profile.mjs` — pure schema and invariant validation for baseline and per-application profiles.
- Create `mesh/src/check-application-security.mjs` — repository conformance check over registered application profiles and browser-facing source.
- Create `apps/axiom-one/security-profile.json` — AXIOM One applicability/evidence declaration.
- Create `mesh/test/application-security-baseline.test.mjs` — validator, scanner, and AXIOM One negative tests.
- Modify `mesh/package.json` — expose `application-security:check` and include it in `check`.
- Modify root `package.json` — expose `application-security:check`.
- Modify `mesh/src/check-docs.mjs` — register the approved design and implementation plans as canonical documents.

### Task 1: Canonical baseline and profile validator

**Files:**
- Create: `mesh/config/application-security-baseline.json`
- Create: `mesh/src/lib/application-security-profile.mjs`
- Test: `mesh/test/application-security-baseline.test.mjs`

**Interfaces:**
- Produces: `ACTIVE_APPLICATION_SECURITY_BASELINE` parsed from the JSON policy.
- Produces: `validateApplicationSecurityBaseline(value) -> true`.
- Produces: `validateApplicationSecurityProfile(profile, baseline) -> true`.
- Produces: fixed adapter IDs: `hosted_web`, `relational_database`, `reusable_session`, `password_store`, `file_upload`.
- Consumes: `canonicalJson` and `ValidationError` from `mesh/src/lib/canonical.mjs`.

- [ ] **Step 1: Write the failing baseline identity test**

Add to `mesh/test/application-security-baseline.test.mjs`:

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ACTIVE_APPLICATION_SECURITY_BASELINE,
  validateApplicationSecurityBaseline,
  validateApplicationSecurityProfile
} from '../src/lib/application-security-profile.mjs';

test('application security baseline has exact v1 identity and deny defaults', () => {
  assert.equal(validateApplicationSecurityBaseline(ACTIVE_APPLICATION_SECURITY_BASELINE), true);
  assert.equal(ACTIVE_APPLICATION_SECURITY_BASELINE.schema, 'axiom-application-security-baseline.v1');
  assert.equal(ACTIVE_APPLICATION_SECURITY_BASELINE.version, 1);
  assert.equal(ACTIVE_APPLICATION_SECURITY_BASELINE.browser_trust, 'untrusted');
  assert.equal(ACTIVE_APPLICATION_SECURITY_BASELINE.unknown_state, 'deny');
  assert.deepEqual(ACTIVE_APPLICATION_SECURITY_BASELINE.adapters, [
    'hosted_web',
    'relational_database',
    'reusable_session',
    'password_store',
    'file_upload'
  ]);
});
```

- [ ] **Step 2: Run the targeted test and verify RED**

Run:

```bash
node --test mesh/test/application-security-baseline.test.mjs
```

Expected: FAIL because `application-security-profile.mjs` does not exist.

- [ ] **Step 3: Add the canonical baseline JSON**

Create `mesh/config/application-security-baseline.json` with exact content:

```json
{
  "schema": "axiom-application-security-baseline.v1",
  "version": 1,
  "browser_trust": "untrusted",
  "unknown_state": "deny",
  "control_states": ["enforced", "inherited", "not-applicable"],
  "adapters": [
    "hosted_web",
    "relational_database",
    "reusable_session",
    "password_store",
    "file_upload"
  ],
  "universal_controls": [
    "secret_non_disclosure",
    "server_authentication",
    "server_authorization",
    "record_access",
    "field_integrity",
    "input_validation",
    "output_encoding",
    "response_minimization",
    "security_headers",
    "transport_policy",
    "request_bounding",
    "security_event_redaction",
    "dependency_integrity"
  ]
}
```

- [ ] **Step 4: Implement exact baseline validation**

Create `mesh/src/lib/application-security-profile.mjs` with these exports and invariants:

```js
import baseline from '../../config/application-security-baseline.json' with { type: 'json' };
import { canonicalJson, ValidationError } from './canonical.mjs';

const CONTROL_STATES = Object.freeze(['enforced', 'inherited', 'not-applicable']);
const ADAPTERS = Object.freeze([
  'hosted_web',
  'relational_database',
  'reusable_session',
  'password_store',
  'file_upload'
]);
const UNIVERSAL_CONTROLS = Object.freeze([
  'secret_non_disclosure',
  'server_authentication',
  'server_authorization',
  'record_access',
  'field_integrity',
  'input_validation',
  'output_encoding',
  'response_minimization',
  'security_headers',
  'transport_policy',
  'request_bounding',
  'security_event_redaction',
  'dependency_integrity'
]);

export const ACTIVE_APPLICATION_SECURITY_BASELINE = Object.freeze(baseline);

export function validateApplicationSecurityBaseline(value) {
  exactObject(value, 'application security baseline', [
    'schema', 'version', 'browser_trust', 'unknown_state',
    'control_states', 'adapters', 'universal_controls'
  ]);
  if (
    value.schema !== 'axiom-application-security-baseline.v1'
    || value.version !== 1
    || value.browser_trust !== 'untrusted'
    || value.unknown_state !== 'deny'
    || canonicalJson(value.control_states) !== canonicalJson(CONTROL_STATES)
    || canonicalJson(value.adapters) !== canonicalJson(ADAPTERS)
    || canonicalJson(value.universal_controls) !== canonicalJson(UNIVERSAL_CONTROLS)
  ) throw new ValidationError('Application security baseline is weakened');
  return true;
}

export function validateApplicationSecurityProfile(profile, active = ACTIVE_APPLICATION_SECURITY_BASELINE) {
  validateApplicationSecurityBaseline(active);
  exactObject(profile, 'application security profile', [
    'schema', 'version', 'application_id', 'status', 'exposure',
    'browser_untrusted', 'adapters', 'controls', 'evidence'
  ]);
  if (
    profile.schema !== 'axiom-application-security-profile.v1'
    || profile.version !== 1
    || typeof profile.application_id !== 'string'
    || !/^[a-z0-9][a-z0-9-]{1,63}$/.test(profile.application_id)
    || !['active', 'experimental'].includes(profile.status)
    || !['loopback-only', 'internet'].includes(profile.exposure)
    || profile.browser_untrusted !== true
  ) throw new ValidationError('Application security profile identity is invalid');
  exactObject(profile.adapters, 'application security adapters', ADAPTERS);
  for (const adapter of ADAPTERS) {
    if (typeof profile.adapters[adapter] !== 'boolean') {
      throw new ValidationError(`Application security adapter flag is invalid: ${adapter}`);
    }
  }
  exactObject(profile.controls, 'application security controls', UNIVERSAL_CONTROLS);
  for (const control of UNIVERSAL_CONTROLS) {
    if (!CONTROL_STATES.includes(profile.controls[control])) {
      throw new ValidationError(`Application security control state is invalid: ${control}`);
    }
  }
  if (!Array.isArray(profile.evidence) || profile.evidence.length === 0) {
    throw new ValidationError('Application security evidence is required');
  }
  if (profile.exposure === 'internet' && profile.adapters.hosted_web !== true) {
    throw new ValidationError('Internet exposure requires the hosted_web adapter');
  }
  if (profile.adapters.password_store && !profile.adapters.reusable_session) {
    throw new ValidationError('Password storage requires reusable_session controls');
  }
  return true;
}

function exactObject(value, name, keys) {
  if (
    !value
    || typeof value !== 'object'
    || Array.isArray(value)
    || canonicalJson(Object.keys(value).sort()) !== canonicalJson([...keys].sort())
  ) throw new ValidationError(`${name} fields are invalid`);
}
```

- [ ] **Step 5: Add weakening tests**

Add tests that clone the baseline/profile and verify rejection of:

```js
const weakened = structuredClone(ACTIVE_APPLICATION_SECURITY_BASELINE);
weakened.browser_trust = 'trusted';
assert.throws(() => validateApplicationSecurityBaseline(weakened), /weakened/);

const invalidProfile = {
  schema: 'axiom-application-security-profile.v1',
  version: 1,
  application_id: 'fixture-app',
  status: 'experimental',
  exposure: 'internet',
  browser_untrusted: true,
  adapters: {
    hosted_web: false,
    relational_database: false,
    reusable_session: false,
    password_store: false,
    file_upload: false
  },
  controls: Object.fromEntries(
    ACTIVE_APPLICATION_SECURITY_BASELINE.universal_controls.map(name => [name, 'enforced'])
  ),
  evidence: ['mesh/test/application-security-baseline.test.mjs']
};
assert.throws(() => validateApplicationSecurityProfile(invalidProfile), /hosted_web/);
```

- [ ] **Step 6: Run targeted tests GREEN**

Run:

```bash
node --test mesh/test/application-security-baseline.test.mjs
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add mesh/config/application-security-baseline.json mesh/src/lib/application-security-profile.mjs mesh/test/application-security-baseline.test.mjs
git commit -m "security: define application security baseline"
```

### Task 2: Register AXIOM One against the baseline

**Files:**
- Create: `apps/axiom-one/security-profile.json`
- Modify: `mesh/src/check-axiom-one.mjs`
- Modify: `mesh/test/axiom-one-shell.test.mjs`

**Interfaces:**
- Consumes: `validateApplicationSecurityProfile()` from Task 1.
- Produces: AXIOM One profile with all conditional adapters inactive.
- Preserves: `experimental-local-preview`, loopback-only HTTP, memory-only bearer token, cookies disabled.

- [ ] **Step 1: Add failing AXIOM One profile assertions**

Extend `mesh/test/axiom-one-shell.test.mjs`:

```js
assert.equal(result.application_security_schema, 'axiom-application-security-profile.v1');
assert.equal(result.application_security_exposure, 'loopback-only');
assert.equal(result.application_security_active_adapters, 0);
```

- [ ] **Step 2: Run the existing AXIOM One test RED**

```bash
node --test mesh/test/axiom-one-shell.test.mjs
```

Expected: FAIL because the checker does not report application-security profile fields.

- [ ] **Step 3: Create the exact AXIOM One security profile**

Create `apps/axiom-one/security-profile.json`:

```json
{
  "schema": "axiom-application-security-profile.v1",
  "version": 1,
  "application_id": "axiom-one",
  "status": "experimental",
  "exposure": "loopback-only",
  "browser_untrusted": true,
  "adapters": {
    "hosted_web": false,
    "relational_database": false,
    "reusable_session": false,
    "password_store": false,
    "file_upload": false
  },
  "controls": {
    "secret_non_disclosure": "enforced",
    "server_authentication": "inherited",
    "server_authorization": "inherited",
    "record_access": "inherited",
    "field_integrity": "inherited",
    "input_validation": "enforced",
    "output_encoding": "enforced",
    "response_minimization": "enforced",
    "security_headers": "enforced",
    "transport_policy": "enforced",
    "request_bounding": "enforced",
    "security_event_redaction": "enforced",
    "dependency_integrity": "enforced"
  },
  "evidence": [
    "mesh/test/axiom-one-shell.test.mjs",
    "mesh/src/check-axiom-one.mjs",
    "apps/axiom-one/app-policy.json"
  ]
}
```

- [ ] **Step 4: Load and validate the profile in `check-axiom-one.mjs`**

Import `validateApplicationSecurityProfile` and add `security-profile.json` to the existing `Promise.all`. After `validatePolicy(policy)`, call `validateApplicationSecurityProfile(securityProfile)`. Extend the returned evidence object with:

```js
application_security_schema: securityProfile.schema,
application_security_exposure: securityProfile.exposure,
application_security_active_adapters: Object.values(securityProfile.adapters).filter(Boolean).length,
application_security_profile_digest: digestObject(securityProfile),
```

Add an invariant tying the new profile to the existing policy:

```js
if (
  securityProfile.exposure !== 'loopback-only'
  || securityProfile.adapters.hosted_web !== false
  || securityProfile.adapters.reusable_session !== false
  || policy.security.cookies_used !== false
  || policy.security.token_persistence !== 'memory-only'
) throw new ValidationError('AXIOM One application security profile conflicts with preview policy');
```

- [ ] **Step 5: Add a cross-file weakening test**

In `application-security-baseline.test.mjs`, construct an AXIOM One-like profile with `reusable_session: true` while the application policy still says `cookies_used: false`, and assert the AXIOM One checker helper rejects the conflict. If needed, export a pure helper `validateAxiomOneApplicationSecurity(policy, securityProfile)` from `check-axiom-one.mjs` and test that helper directly.

- [ ] **Step 6: Run AXIOM One tests GREEN**

```bash
node --test mesh/test/axiom-one-shell.test.mjs mesh/test/application-security-baseline.test.mjs
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/axiom-one/security-profile.json mesh/src/check-axiom-one.mjs mesh/test/axiom-one-shell.test.mjs mesh/test/application-security-baseline.test.mjs
git commit -m "security: bind axiom one to application baseline"
```

### Task 3: Repository-level application security checker

**Files:**
- Create: `mesh/src/check-application-security.mjs`
- Modify: `mesh/test/application-security-baseline.test.mjs`
- Modify: `mesh/package.json`
- Modify: root `package.json`

**Interfaces:**
- Produces: `checkApplicationSecurity() -> { valid, applications, scanned_browser_assets, active_adapters }`.
- Produces: CLI command `npm run application-security:check`.
- Consumes: `findCredentialCandidates()` from `credential-history-audit.mjs` with an ephemeral audit key; no secret value or keyed credential ID is emitted.
- Consumes: `validateApplicationSecurityProfile()`.

- [ ] **Step 1: Add a failing repository checker test**

```js
import { checkApplicationSecurity } from '../src/check-application-security.mjs';

test('repository application security check covers registered applications without leaking candidate values', async () => {
  const result = await checkApplicationSecurity();
  assert.equal(result.valid, true);
  assert.equal(result.applications, 1);
  assert.ok(result.scanned_browser_assets >= 5);
  assert.equal(result.active_adapters, 0);
  assert.equal(JSON.stringify(result).includes('Bearer '), false);
});
```

- [ ] **Step 2: Run test RED**

```bash
node --test mesh/test/application-security-baseline.test.mjs
```

Expected: FAIL because `check-application-security.mjs` does not exist.

- [ ] **Step 3: Implement exact application registration and browser scan**

Create `mesh/src/check-application-security.mjs` with a fixed application registry:

```js
const APPLICATIONS = Object.freeze([
  {
    id: 'axiom-one',
    root: 'apps/axiom-one',
    profile: 'apps/axiom-one/security-profile.json',
    browser_assets: [
      'apps/axiom-one/index.html',
      'apps/axiom-one/app.mjs',
      'apps/axiom-one/presentation.mjs',
      'apps/axiom-one/sw.mjs',
      'apps/axiom-one/styles.css'
    ]
  }
]);
```

For every asset:

1. read it as a `Buffer`;
2. call `findCredentialCandidates(content, path, randomBytes(32))`;
3. if candidates exist, throw `ValidationError('Browser-facing application asset contains a secret-like credential candidate: <path>')` without including candidate values or IDs;
4. reject `document.cookie`, `localStorage`, `sessionStorage`, `indexedDB`, `innerHTML`, `outerHTML`, `insertAdjacentHTML`, and literal `http://`/`https://` in browser-executable assets unless the application profile activates a future reviewed exception mechanism (v1 has no exception mechanism, so reject).

Return only counts and application IDs; never return candidate IDs.

- [ ] **Step 4: Add adversarial secret fixtures**

Add pure exported helper:

```js
export function assertBrowserAssetSafe(content, path, { auditKey = randomBytes(32) } = {}) { ... }
```

Test:

```js
assert.throws(
  () => assertBrowserAssetSafe(Buffer.from('const key = "AIza' + 'A'.repeat(35) + '";'), 'fixture.mjs'),
  /secret-like credential candidate/
);
assert.throws(
  () => assertBrowserAssetSafe(Buffer.from('element.innerHTML = value'), 'fixture.mjs'),
  /browser security boundary/
);
```

- [ ] **Step 5: Wire scripts and protected `check`**

In `mesh/package.json` add:

```json
"application-security:check": "node src/check-application-security.mjs"
```

Insert `node src/check-application-security.mjs` into the `check` chain after `check-axiom-one.mjs`.

In root `package.json` add:

```json
"application-security:check": "npm --prefix mesh run application-security:check"
```

- [ ] **Step 6: Run targeted and aggregate checks**

```bash
npm run application-security:check
node --test mesh/test/application-security-baseline.test.mjs mesh/test/axiom-one-shell.test.mjs
npm run check
```

Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add mesh/src/check-application-security.mjs mesh/test/application-security-baseline.test.mjs mesh/package.json package.json
git commit -m "security: enforce application conformance checks"
```

### Task 4: Canonical documentation registration

**Files:**
- Modify: `mesh/src/check-docs.mjs`
- Existing: `docs/superpowers/specs/2026-09-05-application-security-baseline-design.md`
- Existing: `docs/superpowers/plans/2026-09-05-application-security-baseline-core.md`
- Existing: sibling application-security plans created with this programme.
- Test: `mesh/test/application-security-baseline.test.mjs`

**Interfaces:**
- Consumes: `CANONICAL_DOCUMENTS` in `check-docs.mjs`.
- Produces: exact canonical registration so `docs:check` cannot silently drop the baseline programme.

- [ ] **Step 1: Add a failing registration assertion**

Read `CANONICAL_DOCUMENTS` from `check-docs.mjs` in the test and assert inclusion of the approved design and all application-security plans.

- [ ] **Step 2: Run the registration test RED**

```bash
node --test mesh/test/application-security-baseline.test.mjs
```

Expected: FAIL because these documents are not yet in `CANONICAL_DOCUMENTS`.

- [ ] **Step 3: Register exact document paths**

Add the design and plans to `CANONICAL_DOCUMENTS` adjacent to the other September 2026 superpowers documents. Do not add content markers unless `docs:check` proves they are required.

- [ ] **Step 4: Run docs and full checks GREEN**

```bash
npm --prefix mesh run docs:check
npm run check
npm run release:verify
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add mesh/src/check-docs.mjs mesh/test/application-security-baseline.test.mjs docs/superpowers/specs/2026-09-05-application-security-baseline-design.md docs/superpowers/plans/2026-09-05-application-security-baseline-*.md
git commit -m "docs: register application security programme"
```

### Task 5: Final exact-head verification and claim check

**Files:**
- No planned source changes unless verification exposes a defect.
- Review: `docs/security/CURRENT-BUILD-THREAT-MODEL.md`
- Review: `docs/PRODUCTION-READINESS-TRACKER.md`
- Review: `docs/releases/0.12.0-dev.3.md`

**Interfaces:**
- Produces: exact-head evidence that the new application security check is enforced while no new hosted/runtime capability is claimed.

- [ ] **Step 1: Confirm capability registry is unchanged**

```bash
git diff main...HEAD -- mesh/config/capabilities.json
```

Expected: no diff.

- [ ] **Step 2: Run exact protected validation**

```bash
npm run doctor
npm run setup:check
npm run application-security:check
npm run check
npm run release:verify
```

Expected: all commands exit 0.

- [ ] **Step 3: Inspect current-state claims**

Confirm the change still says:

- AXIOM One is an experimental local preview;
- no hosted database is activated;
- no reusable cookie session is activated;
- no AXIOM password store is activated;
- no upload service is activated;
- no production promotion follows from this work.

If an existing canonical document contradicts these exact facts, update only that stale statement and add the affected document to the final commit.

- [ ] **Step 4: Commit verification-only documentation corrections if any**

If no corrections are required, do not create an empty commit. If corrections are required:

```bash
git add <only-the-stale-canonical-documents>
git commit -m "docs: align application security claims"
```
