# AXIOM Hosted Data and Content Security Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Define fail-closed activation contracts for hosted relational data, RLS/record isolation, field integrity, query safety, response minimization, sensitive-field encryption, and file/content handling without adding a database or upload service to the current Mesh.

**Architecture:** Provider-neutral validators describe the minimum properties a hosted database or upload/content surface must prove before its application profile can activate the corresponding adapter. The validators do not create a second authorization engine: hosted data policy is defence in depth beneath server-side application authorization, while privileged Mesh effects continue through Gateway -> Hypervisor -> Sandbox -> Grid.

**Tech Stack:** Node.js ES modules, JSON declarations, `node:test`; no database, ORM, storage, sanitizer, or malware-scanner dependency is added by this plan.

**Spec:** `docs/superpowers/specs/2026-09-05-application-security-baseline-design.md`

## Global Constraints

- Client-visible database credentials may be only intentionally public/anonymous credentials that are safe to copy and cannot bypass data policy.
- Service/admin database credentials never enter browser code.
- Client-supplied owner/user identifiers never prove ownership.
- RLS/equivalent policy is default deny for client-accessible relational data.
- RLS does not replace server-side authorization or Mesh authority.
- Query values are parameterized; dynamic identifiers come from finite allowlists.
- Mutations use explicit writable-field allowlists; authority-bearing fields are server-derived.
- Responses use explicit projections and never serialize internal records wholesale.
- Sensitive data encryption includes backups, replicas, caches, exports, and recovery copies in its inventory.
- Uploads are non-executable by default, bounded, isolated, and retained/deleted under explicit policy.
- Untrusted user content is contextually encoded/sanitized; CSP is defence in depth, not the only XSS control.
- No live database or upload capability is activated by this plan.

---

### Task 1: Relational-database activation declaration

**Files:**
- Create: `mesh/src/lib/relational-data-security.mjs`
- Create: `mesh/test/relational-data-security.test.mjs`
- Modify: `mesh/src/lib/application-security-profile.mjs`

**Interfaces:**
- Produces: `validateRelationalDataSecurity(declaration) -> true`.
- Schema: `axiom-relational-data-security.v1`.

- [ ] **Step 1: Write the failing valid declaration test**

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { validateRelationalDataSecurity } from '../src/lib/relational-data-security.mjs';

const validData = {
  schema: 'axiom-relational-data-security.v1',
  version: 1,
  client_key: {
    exposed: true,
    classification: 'public-anonymous',
    administrative: false,
    authorization_bypass: false
  },
  service_key_browser_exposed: false,
  row_policy: {
    default_deny: true,
    select_independent: true,
    insert_independent: true,
    update_independent: true,
    delete_independent: true,
    owner_from_authenticated_context: true,
    bypass_functions_separately_reviewed: true
  },
  queries: {
    values_parameterized: true,
    dynamic_identifiers_allowlisted: true,
    untrusted_interpreter_concatenation: false
  },
  mutations: {
    writable_fields_allowlisted: true,
    owner_server_derived: true,
    role_server_derived: true,
    approval_server_derived: true,
    timestamps_server_derived: true
  },
  responses: {
    projection_allowlist: true,
    whole_record_serialization: false,
    stack_traces_exposed: false
  }
};

test('relational data security accepts the exact fail-closed declaration', () => {
  assert.equal(validateRelationalDataSecurity(validData), true);
});
```

- [ ] **Step 2: Run RED**

```bash
node --test mesh/test/relational-data-security.test.mjs
```

Expected: FAIL because validator does not exist.

- [ ] **Step 3: Implement exact validation**

Require exact fields. Reject if a client key is administrative or can bypass authorization, if a service key is browser exposed, if any CRUD policy is not independently constrained, if ownership comes from request data, if parameterization/identifier allowlisting is absent, if any authority-bearing mutation field is client-derived, or if whole-record serialization/stack traces are exposed.

Allow `client_key.exposed:false` with classification `server-only`; if exposed is true, classification must be exactly `public-anonymous`.

- [ ] **Step 4: Add horizontal/vertical weakening tests**

```js
for (const mutate of [
  value => { value.row_policy.owner_from_authenticated_context = false; },
  value => { value.client_key.administrative = true; },
  value => { value.queries.values_parameterized = false; },
  value => { value.mutations.role_server_derived = false; },
  value => { value.responses.whole_record_serialization = true; }
]) {
  const candidate = structuredClone(validData);
  mutate(candidate);
  assert.throws(() => validateRelationalDataSecurity(candidate));
}
```

- [ ] **Step 5: Bind relational adapter activation**

When the application profile activates `relational_database`, require a valid declaration path/evidence and reject activation without it. Do not infer data safety from the presence of a public key.

- [ ] **Step 6: Run GREEN and commit**

```bash
node --test mesh/test/relational-data-security.test.mjs mesh/test/application-security-baseline.test.mjs

git add mesh/src/lib/relational-data-security.mjs mesh/test/relational-data-security.test.mjs mesh/src/lib/application-security-profile.mjs
git commit -m "security: gate relational data activation"
```

### Task 2: Sensitive-data encryption declaration

**Files:**
- Create: `mesh/src/lib/hosted-data-encryption.mjs`
- Create: `mesh/test/hosted-data-encryption.test.mjs`
- Modify: `mesh/src/lib/relational-data-security.mjs`

**Interfaces:**
- Produces: `validateHostedDataEncryption(declaration) -> true`.
- Schema: `axiom-hosted-data-encryption.v1`.

- [ ] **Step 1: Write the failing valid encryption declaration test**

```js
const validEncryption = {
  schema: 'axiom-hosted-data-encryption.v1',
  version: 1,
  storage_encryption: true,
  application_field_encryption: 'risk-based',
  key_separated_from_ciphertext: true,
  key_rotation_documented: true,
  recovery_documented: true,
  deletion_documented: true,
  inventory_includes: ['primary', 'replica', 'cache', 'backup', 'export', 'recovery-copy']
};
assert.equal(validateHostedDataEncryption(validEncryption), true);
```

- [ ] **Step 2: Run RED and implement exact validation**

Require storage encryption, key separation, documented rotation/recovery/deletion, and the exact six inventory categories. `application_field_encryption` may be `risk-based` or `required`; it may not be `none` when the relational adapter is active.

- [ ] **Step 3: Add negative tests**

Reject missing backup/export inventory, key co-location, or absent rotation/recovery/deletion semantics.

- [ ] **Step 4: Bind declaration to relational data activation**

A valid relational declaration must include or reference a valid hosted-data encryption declaration. Provider-level “encrypted at rest” alone is insufficient to satisfy the application-level key/inventory declaration.

- [ ] **Step 5: Run GREEN and commit**

```bash
node --test mesh/test/hosted-data-encryption.test.mjs mesh/test/relational-data-security.test.mjs

git add mesh/src/lib/hosted-data-encryption.mjs mesh/test/hosted-data-encryption.test.mjs mesh/src/lib/relational-data-security.mjs
git commit -m "security: gate hosted data encryption"
```

### Task 3: File-upload activation declaration

**Files:**
- Create: `mesh/src/lib/file-upload-security.mjs`
- Create: `mesh/test/file-upload-security.test.mjs`
- Modify: `mesh/src/lib/application-security-profile.mjs`

**Interfaces:**
- Produces: `validateFileUploadSecurity(declaration) -> true`.
- Schema: `axiom-file-upload-security.v1`.

- [ ] **Step 1: Write the failing upload declaration test**

```js
const validUpload = {
  schema: 'axiom-file-upload-security.v1',
  version: 1,
  maximum_file_bytes: 10485760,
  maximum_files_per_request: 10,
  allowed_media_types: ['image/png', 'image/jpeg', 'application/pdf'],
  client_filename_authoritative: false,
  randomized_storage_identifier: true,
  executable_storage_path: false,
  archive_expansion_bound: true,
  parser_resource_bound: true,
  content_signature_checked: true,
  quarantine_supported: true,
  least_privilege_object_access: true,
  safe_serving_origin_or_attachment: true,
  retention_documented: true,
  deletion_documented: true,
  export_documented: true,
  recovery_documented: true
};
assert.equal(validateFileUploadSecurity(validUpload), true);
```

- [ ] **Step 2: Run RED**

```bash
node --test mesh/test/file-upload-security.test.mjs
```

Expected: FAIL because validator does not exist.

- [ ] **Step 3: Implement bounded upload validation**

Require maximum file size `1..104857600`, maximum files `1..100`, a non-empty finite media-type allowlist of at most 64 entries, and all safety/lifecycle booleans above. Reject wildcard media types such as `*/*`, `image/*`, or empty strings.

- [ ] **Step 4: Add zip-bomb/executable/path weakening tests**

Reject:

```js
client_filename_authoritative: true
executable_storage_path: true
archive_expansion_bound: false
parser_resource_bound: false
safe_serving_origin_or_attachment: false
```

and any wildcard media type.

- [ ] **Step 5: Bind file-upload adapter activation**

Require the upload declaration whenever `file_upload === true`. Do not activate upload capability or create storage routes in this task.

- [ ] **Step 6: Run GREEN and commit**

```bash
node --test mesh/test/file-upload-security.test.mjs mesh/test/application-security-baseline.test.mjs

git add mesh/src/lib/file-upload-security.mjs mesh/test/file-upload-security.test.mjs mesh/src/lib/application-security-profile.mjs
git commit -m "security: gate file upload activation"
```

### Task 4: Untrusted-content rendering declaration

**Files:**
- Create: `mesh/src/lib/content-rendering-security.mjs`
- Create: `mesh/test/content-rendering-security.test.mjs`
- Modify: `mesh/src/lib/file-upload-security.mjs`

**Interfaces:**
- Produces: `validateContentRenderingSecurity(declaration) -> true`.
- Schema: `axiom-content-rendering-security.v1`.

- [ ] **Step 1: Write the failing rendering declaration test**

```js
const validRendering = {
  schema: 'axiom-content-rendering-security.v1',
  version: 1,
  text_rendering_default: true,
  raw_html_api_allowed: false,
  rich_text_sanitizer_required: true,
  executable_content_isolated_or_rejected: true,
  contextual_encoding: ['html-text', 'html-attribute', 'url'],
  csp_is_sole_xss_control: false
};
assert.equal(validateContentRenderingSecurity(validRendering), true);
```

- [ ] **Step 2: Run RED and implement exact validation**

Require text rendering by default, raw HTML APIs disabled, reviewed sanitizer requirement for rich text, executable content isolation/rejection, contextual encoding for the three v1 contexts, and `csp_is_sole_xss_control:false`.

- [ ] **Step 3: Add negative tests**

Reject `raw_html_api_allowed:true`, absent sanitizer requirement, or `csp_is_sole_xss_control:true`.

- [ ] **Step 4: Run GREEN and commit**

```bash
node --test mesh/test/content-rendering-security.test.mjs mesh/test/file-upload-security.test.mjs

git add mesh/src/lib/content-rendering-security.mjs mesh/test/content-rendering-security.test.mjs mesh/src/lib/file-upload-security.mjs
git commit -m "security: gate untrusted content rendering"
```

### Task 5: Non-activation and authority-boundary verification

**Files:**
- Review: `apps/axiom-one/security-profile.json`
- Review: `mesh/config/capabilities.json`
- Test: `mesh/test/application-security-baseline.test.mjs`

**Interfaces:**
- Proves that data/content conformance contracts do not create runtime effects.

- [ ] **Step 1: Assert adapters remain inactive on AXIOM One**

```js
assert.equal(profile.adapters.relational_database, false);
assert.equal(profile.adapters.file_upload, false);
```

- [ ] **Step 2: Assert capability registry unchanged**

```bash
git diff main...HEAD -- mesh/config/capabilities.json
```

Expected: no changes attributable to this plan.

- [ ] **Step 3: Run full verification**

```bash
npm run application-security:check
npm run check
npm run release:verify
```

Expected: PASS.

- [ ] **Step 4: Commit only real corrections**

If verification exposes no defect, create no empty commit.
