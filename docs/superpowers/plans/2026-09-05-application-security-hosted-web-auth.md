# AXIOM Hosted Web and Authentication Security Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Define and enforce the activation contract for Internet-facing AXIOM web applications, reusable browser sessions, password storage, login/recovery rate limiting, CSRF defence, bot controls, and HTTPS/HSTS without activating any such surface in AXIOM One.

**Architecture:** This slice adds pure, provider-neutral validation and conformance tests for hosted-web and authentication declarations. A future hosted application may activate these adapters only by supplying an exact declaration that satisfies transport, cookie, CSRF, session, password, rate-limit, and bot/accessibility requirements. The current AXIOM One profile remains adapter-inactive and therefore gains no hosted session or Internet authority.

**Tech Stack:** Node.js ES modules, JSON declarations, `node:test`; no external authentication, CAPTCHA, password, or session package is added by this plan.

**Spec:** `docs/superpowers/specs/2026-09-05-application-security-baseline-design.md`

## Global Constraints

- This plan defines activation gates; it does not create a live hosted application.
- Internet exposure requires HTTPS and hosted-web controls.
- HSTS is required only after a production origin is HTTPS-continuous and deployment-owned; loopback remains exempt.
- Cookie-authenticated mutations require CSRF defence.
- Reusable session cookies must be `HttpOnly`, `Secure`, host-scoped, bounded, rotated, and revocable.
- Prefer passkeys/managed identity over creating a password store.
- If a password store is activated, Argon2id-class adaptive hashing and migration metadata are mandatory.
- Bot protection is abuse mitigation only; it never establishes identity or authority.
- Login/recovery controls must not leak account existence beyond the intended UX.
- No hosted identity may bypass Gateway/Hypervisor/Sandbox/Grid authorization for privileged Mesh effects.
- Add no runtime dependency until a concrete provider implementation is separately reviewed.

---

### Task 1: Hosted-web activation declaration validator

**Files:**
- Create: `mesh/src/lib/hosted-web-security.mjs`
- Create: `mesh/test/hosted-web-security.test.mjs`
- Modify: `mesh/src/lib/application-security-profile.mjs`

**Interfaces:**
- Produces: `validateHostedWebSecurity(declaration) -> true`.
- Produces declaration schema: `axiom-hosted-web-security.v1`.
- Consumes: a per-application hosted declaration only when `adapters.hosted_web === true`.

- [ ] **Step 1: Write the failing valid-declaration test**

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { validateHostedWebSecurity } from '../src/lib/hosted-web-security.mjs';

const validHosted = {
  schema: 'axiom-hosted-web-security.v1',
  version: 1,
  https_required: true,
  hsts: {
    enabled: true,
    max_age_seconds: 31536000,
    include_subdomains: false,
    preload: false
  },
  redirects: { plaintext_http: 'redirect-or-reject', external_targets: 'allowlist' },
  cors: { wildcard_credentials: false, allowed_origins: ['https://app.example.test'] },
  browser_headers: {
    csp: true,
    frame_ancestors: 'none',
    nosniff: true,
    referrer_policy: 'no-referrer',
    permissions_policy: true
  },
  anonymous_abuse_controls: true,
  accessibility_fallback_required_for_bot_challenges: true
};

test('hosted web security accepts the exact fail-closed v1 declaration', () => {
  assert.equal(validateHostedWebSecurity(validHosted), true);
});
```

- [ ] **Step 2: Run RED**

```bash
node --test mesh/test/hosted-web-security.test.mjs
```

Expected: FAIL because the validator does not exist.

- [ ] **Step 3: Implement exact hosted-web validation**

Require exact object fields shown above. Reject when:

- `https_required !== true`;
- HSTS is enabled with `max_age_seconds < 86400`;
- `plaintext_http` is not `redirect-or-reject`;
- `external_targets` is not `allowlist`;
- credentialed wildcard CORS is possible;
- any required browser-header control is disabled;
- anonymous abuse controls are absent;
- accessibility fallback is not required for bot challenges.

The validator must not accept arbitrary extra keys.

- [ ] **Step 4: Add weakening tests**

```js
for (const mutate of [
  value => { value.https_required = false; },
  value => { value.cors.wildcard_credentials = true; },
  value => { value.browser_headers.csp = false; },
  value => { value.accessibility_fallback_required_for_bot_challenges = false; }
]) {
  const candidate = structuredClone(validHosted);
  mutate(candidate);
  assert.throws(() => validateHostedWebSecurity(candidate));
}
```

- [ ] **Step 5: Bind activation into application profile validation**

Extend `validateApplicationSecurityProfile` so a profile with `adapters.hosted_web === true` must provide a `hosted_web` declaration path in a new `adapter_evidence` exact object. Because this is a schema change, increment the per-application profile schema to `axiom-application-security-profile.v2` only when this task is actually executed, migrate AXIOM One to v2 with all adapter evidence set to `null`, and keep baseline v1 compatible only if the checker explicitly supports both versions during migration.

Do not silently add optional fields to the v1 exact-object schema.

- [ ] **Step 6: Run GREEN**

```bash
node --test mesh/test/hosted-web-security.test.mjs mesh/test/application-security-baseline.test.mjs mesh/test/axiom-one-shell.test.mjs
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add mesh/src/lib/hosted-web-security.mjs mesh/test/hosted-web-security.test.mjs mesh/src/lib/application-security-profile.mjs apps/axiom-one/security-profile.json mesh/test/application-security-baseline.test.mjs
git commit -m "security: gate hosted web activation"
```

### Task 2: Reusable-session and CSRF activation declaration

**Files:**
- Create: `mesh/src/lib/session-security.mjs`
- Create: `mesh/test/session-security.test.mjs`
- Modify: `mesh/src/lib/application-security-profile.mjs`

**Interfaces:**
- Produces: `validateSessionSecurity(declaration) -> true`.
- Schema: `axiom-session-security.v1`.

- [ ] **Step 1: Write the failing valid session test**

```js
const validSession = {
  schema: 'axiom-session-security.v1',
  version: 1,
  cookie: {
    http_only: true,
    secure: true,
    same_site: 'lax',
    host_prefix: true,
    domain_attribute: null,
    path: '/'
  },
  idle_timeout_seconds: 1800,
  absolute_timeout_seconds: 43200,
  rotate_on_authentication: true,
  rotate_on_privilege_change: true,
  revocation_supported: true,
  fixation_resistant: true,
  csrf: {
    required_for_cookie_mutations: true,
    origin_check: true,
    state_change_get_allowed: false,
    token_or_bound_request: true
  }
};
assert.equal(validateSessionSecurity(validSession), true);
```

- [ ] **Step 2: Run RED**

```bash
node --test mesh/test/session-security.test.mjs
```

Expected: FAIL because the validator does not exist.

- [ ] **Step 3: Implement exact session validation**

Reject unless all booleans above are exact, `same_site` is `lax` or `strict`, `domain_attribute` is `null`, path is `/`, idle timeout is `60..86400`, absolute timeout is `300..604800`, and absolute timeout is not less than idle timeout.

- [ ] **Step 4: Add negative tests for cookie/CSRF weakening**

Reject `http_only:false`, `secure:false`, `same_site:'none'`, a cross-subdomain `domain_attribute`, `state_change_get_allowed:true`, missing origin checks, or missing bound/token CSRF protection.

- [ ] **Step 5: Bind adapter dependency**

Require `reusable_session === true` only when `hosted_web === true`, and require the session declaration to validate before the application profile validates.

- [ ] **Step 6: Run GREEN and commit**

```bash
node --test mesh/test/session-security.test.mjs mesh/test/hosted-web-security.test.mjs mesh/test/application-security-baseline.test.mjs
git add mesh/src/lib/session-security.mjs mesh/test/session-security.test.mjs mesh/src/lib/application-security-profile.mjs
git commit -m "security: gate reusable browser sessions"
```

### Task 3: Password-store activation declaration

**Files:**
- Create: `mesh/src/lib/password-security.mjs`
- Create: `mesh/test/password-security.test.mjs`
- Modify: `mesh/src/lib/application-security-profile.mjs`

**Interfaces:**
- Produces: `validatePasswordSecurity(declaration) -> true`.
- Schema: `axiom-password-security.v1`.

- [ ] **Step 1: Write the failing declaration test**

```js
const validPassword = {
  schema: 'axiom-password-security.v1',
  version: 1,
  storage_required: true,
  preferred_alternatives_reviewed: true,
  kdf: 'argon2id',
  unique_random_salt: true,
  plaintext_retained: false,
  reversible_password_encryption: false,
  parameter_versioning: true,
  rehash_on_success_when_stale: true,
  recovery_response_enumeration_resistant: true
};
assert.equal(validatePasswordSecurity(validPassword), true);
```

- [ ] **Step 2: Run RED**

```bash
node --test mesh/test/password-security.test.mjs
```

Expected: FAIL because validator does not exist.

- [ ] **Step 3: Implement exact validation**

Require the exact schema, `kdf === 'argon2id'`, all protection booleans true except `plaintext_retained` and `reversible_password_encryption`, which must be false.

This declaration proves policy only. It does **not** add an Argon2 package. A concrete password implementation requires a separately reviewed dependency/provider implementation and executable hash/verify tests.

- [ ] **Step 4: Bind adapter dependency and negatives**

Require `password_store === true` only when both `hosted_web` and `reusable_session` are true. Reject password activation without a declaration.

- [ ] **Step 5: Run GREEN and commit**

```bash
node --test mesh/test/password-security.test.mjs mesh/test/session-security.test.mjs mesh/test/application-security-baseline.test.mjs
git add mesh/src/lib/password-security.mjs mesh/test/password-security.test.mjs mesh/src/lib/application-security-profile.mjs
git commit -m "security: gate password storage activation"
```

### Task 4: Login/recovery pressure and bot-control declaration

**Files:**
- Create: `mesh/src/lib/auth-abuse-security.mjs`
- Create: `mesh/test/auth-abuse-security.test.mjs`
- Modify: `mesh/src/lib/hosted-web-security.mjs`

**Interfaces:**
- Produces: `validateAuthAbuseSecurity(declaration) -> true`.
- Schema: `axiom-auth-abuse-security.v1`.

- [ ] **Step 1: Write the failing policy test**

```js
const validAbuse = {
  schema: 'axiom-auth-abuse-security.v1',
  version: 1,
  login: { per_source: true, per_account: true, progressive_delay: true, concurrency_bound: true },
  recovery: { per_source: true, per_account: true, send_limit: true, enumeration_resistant: true },
  registration: { abuse_control: true },
  bot_signal_is_authority: false,
  privacy_minimized_telemetry: true,
  accessibility_fallback: true
};
assert.equal(validateAuthAbuseSecurity(validAbuse), true);
```

- [ ] **Step 2: Run RED, implement exact validation, and add weakening tests**

Reject any disabled pressure bound, `bot_signal_is_authority:true`, non-minimized telemetry, or absent accessibility fallback.

- [ ] **Step 3: Run GREEN and commit**

```bash
node --test mesh/test/auth-abuse-security.test.mjs

git add mesh/src/lib/auth-abuse-security.mjs mesh/test/auth-abuse-security.test.mjs mesh/src/lib/hosted-web-security.mjs
git commit -m "security: gate hosted auth abuse controls"
```

### Task 5: Non-activation verification

**Files:**
- Review: `apps/axiom-one/security-profile.json`
- Test: `mesh/test/application-security-baseline.test.mjs`

**Interfaces:**
- Proves that adding activation contracts did not activate them.

- [ ] **Step 1: Assert AXIOM One remains inactive**

```js
assert.deepEqual(profile.adapters, {
  hosted_web: false,
  relational_database: false,
  reusable_session: false,
  password_store: false,
  file_upload: false
});
```

- [ ] **Step 2: Run full verification**

```bash
npm run application-security:check
npm run check
npm run release:verify
```

Expected: PASS with zero active hosted/auth adapters for AXIOM One.

- [ ] **Step 3: Commit only if verification required a real correction**

Do not create a commit merely to record that no activation occurred.
