# Formal Verification Substrate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a deterministic, fail-closed formal-proof verification substrate to AXIOM Verify that binds exact statements, proof bytes, dependency closure, verifier profile, resource policy, and transcript while preserving the invariant that verification is evidence and never authority.

**Architecture:** Keep the implementation under `packages/axiom-verify/` and reuse its dependency-light canonical JSON/SHA-256 posture. Add strict v1 formal contracts, in-memory artifact materialization, an allowlisted verifier-profile registry, one deterministic in-process mock adapter, and a formal verification orchestrator/report path. Do not add a real theorem prover, filesystem discovery, network access, subprocess execution, capability changes, or a Mesh policy consumer in this slice; Mesh-side changes are negative reachability tests plus canonical documentation/tracker registration.

**Tech Stack:** Node.js ESM; Node built-ins (`node:crypto`, `node:test`, `node:assert/strict`, `node:fs/promises` in tests only); existing `packages/axiom-verify/canonical.mjs`; existing AXIOM Verify report conventions; existing Mesh external-effect validation for negative authority-boundary tests.

**Spec:** `docs/superpowers/specs/2026-09-05-formal-verification-substrate-design.md`

## Global Constraints

- Node compatibility remains `>=22.23.2 <23 || >=24.14.0 <25`.
- `mesh/config/capabilities.json` MUST NOT change in this slice.
- No real Lean, Coq, Isabelle, HOL, Metamath, SMT, or other external theorem prover is added in this slice.
- Production formal-verification modules MUST NOT import `node:fs`, `node:net`, `node:http`, `node:https`, `node:tls`, `node:dgram`, `node:child_process`, Gateway, Hypervisor, Grid authority clients, capability-grant code, approval-consumption code, or external-effect execution code.
- Verification runs only over caller-supplied bytes and an allowlisted in-process mock profile.
- Unknown schema/profile/adapter conditions fail closed.
- Artifact paths use the v1 relative POSIX ASCII grammar and are rejected rather than normalized when ambiguous.
- Set-like arrays MUST already be canonical-order and duplicate-free: `artifacts[]` by ASCII `path`; `dependencies[]` by `(kind, dependency_id, digest)`; `premise_refs[]`, `non_claims[]`, and `source_refs[]` lexicographically.
- Every declared artifact is checked by exact SHA-256 and byte length before adapter invocation; undeclared extras and missing files fail closed.
- Domain separation MUST use the exact spec prefixes with trailing newline:
  - `axiom-formal-dependency-closure.v1\n`
  - `axiom-formal-proof-bundle.v1\n`
  - `axiom-formal-verifier-profile.v1\n`
  - `axiom-formal-proof-verification.v1\n`
- `VERIFIED` means only that the exact formal statement checks under the exact bound premises/dependencies/profile. It MUST NOT be described as external-world truth, general model correctness, legal sufficiency, policy wisdom, or execution authorization.
- `VERIFIED` MUST NOT create/widen capability, mandate, approval, policy, resource budget, destination scope, or external-effect authority.
- No Mesh production code consumes `axiom-formal-proof-verification.v1` as a policy predicate in this first slice. A future Mesh importer must be separately specified and must bind the exact verification artifact digest through existing signed evidence/provenance machinery.
- The mock adapter is test infrastructure for the substrate contract only; human-facing copy MUST state that it is not mathematical capability or a production theorem-prover integration.

---

### Task 1: Formal v1 contract and domain-separated digest primitives

**Files:**
- Create: `packages/axiom-verify/formal-contracts.mjs`
- Create: `mesh/test/axiom-formal-contracts.test.mjs`

**Interfaces:**
- Produces:
  - `FORMAL_PROOF_BUNDLE_SCHEMA = 'axiom-formal-proof-bundle.v1'`
  - `FORMAL_PROOF_VERIFICATION_SCHEMA = 'axiom-formal-proof-verification.v1'`
  - `FORMAL_VERIFIER_PROFILE_SCHEMA = 'axiom-formal-verifier-profile.v1'`
  - `FORMAL_VERDICTS = Object.freeze(['VERIFIED','REJECTED','UNSUPPORTED','ERROR'])`
  - `domainSeparatedDigestBytes(domain, bytes)`
  - `domainSeparatedDigestObject(domain, value)`
  - `validateFormalProofManifest(manifest)`
  - `validateFormalVerifierProfile(profile)`
  - `formalDependencyClosureDigest(dependencies)`
  - `formalVerifierProfileDigest(profile)`
  - `formalProofBundleDigest(manifest)`
  - `validateFormalVerificationArtifact(artifact)`
  - `formalVerificationArtifactDigest(artifact)`
- Consumes: `canonicalJson`, `sha256`, and `VerifyError` from `packages/axiom-verify/canonical.mjs`.

- [ ] **Step 1: Write the failing public-contract tests**

Create `mesh/test/axiom-formal-contracts.test.mjs` and import the expected surface:

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FORMAL_PROOF_BUNDLE_SCHEMA,
  FORMAL_PROOF_VERIFICATION_SCHEMA,
  FORMAL_VERIFIER_PROFILE_SCHEMA,
  domainSeparatedDigestBytes,
  domainSeparatedDigestObject,
  formalDependencyClosureDigest,
  formalProofBundleDigest,
  formalVerifierProfileDigest,
  formalVerificationArtifactDigest,
  validateFormalProofManifest,
  validateFormalVerifierProfile,
  validateFormalVerificationArtifact
} from '../../packages/axiom-verify/formal-contracts.mjs';

test('formal schema ids are exact', () => {
  assert.equal(FORMAL_PROOF_BUNDLE_SCHEMA, 'axiom-formal-proof-bundle.v1');
  assert.equal(FORMAL_PROOF_VERIFICATION_SCHEMA, 'axiom-formal-proof-verification.v1');
  assert.equal(FORMAL_VERIFIER_PROFILE_SCHEMA, 'axiom-formal-verifier-profile.v1');
});
```

Add a fixed digest vector proving the newline-delimited domain changes the result:

```js
const bytes = Buffer.from('same-payload', 'utf8');
assert.notEqual(
  domainSeparatedDigestBytes('axiom-formal-proof-bundle.v1\n', bytes),
  domainSeparatedDigestBytes('axiom-formal-proof-verification.v1\n', bytes)
);
```

- [ ] **Step 2: Add valid fixture builders inside the test file**

Use this exact baseline manifest shape:

```js
function validManifest() {
  return {
    schema: 'axiom-formal-proof-bundle.v1',
    claim_id: 'claim:mock-001',
    formal_system: {
      adapter_id: 'axiom.mock-formal.v1',
      language: 'axiom-mock',
      language_version: '1',
      logic_profile: 'token-equality-v1'
    },
    entrypoint: { path: 'proof/statement.axm', declaration: 'MockTheorem' },
    statement_fingerprint: { algorithm: 'sha256-domain-v1', value: 'a'.repeat(64) },
    verifier_profile: {
      profile_digest: 'b'.repeat(64),
      adapter_id: 'axiom.mock-formal.v1',
      adapter_version: '1.0.0',
      verifier_id: 'axiom-mock-kernel',
      verifier_version: '1.0.0',
      executable_digest: 'c'.repeat(64),
      configuration_digest: 'd'.repeat(64)
    },
    resource_policy_digest: 'e'.repeat(64),
    artifacts: [
      { path: 'proof/proof.axm', role: 'proof', sha256: 'f'.repeat(64), size_bytes: 64 },
      { path: 'proof/statement.axm', role: 'statement', sha256: '1'.repeat(64), size_bytes: 64 }
    ],
    dependencies: [
      { dependency_id: 'dep:base', kind: 'formal-library', digest: '2'.repeat(64), source_scope: 'bundle' }
    ],
    premise_refs: ['premise:base'],
    declared_scope: {
      claim_kind: 'theorem',
      intended_use: 'substrate-test',
      non_claims: ['does-not-authorize-effects', 'does-not-prove-external-world-truth']
    },
    provenance: {
      proposer_type: 'test-fixture',
      proposer_ref: 'fixture:formal-001',
      source_refs: ['source:fixture']
    }
  };
}
```

Note: `artifacts[]` above is intentionally ordered by ASCII path (`proof/proof.axm` before `proof/statement.axm`).

- [ ] **Step 3: Add canonical-order and duplicate RED tests**

Prove each set-like field rejects noncanonical order and duplicates instead of sorting internally:

```js
const bad = validManifest();
bad.premise_refs = ['premise:z', 'premise:a'];
assert.throws(() => validateFormalProofManifest(bad), /canonical order/i);

const dup = validManifest();
dup.declared_scope.non_claims = ['same', 'same'];
assert.throws(() => validateFormalProofManifest(dup), /duplicate/i);
```

Also cover:
- `artifacts[]` duplicate path;
- `dependencies[]` duplicate `(kind, dependency_id, digest)`;
- malformed 64-hex digests;
- unknown artifact role;
- unknown top-level/nested keys;
- invalid `size_bytes` (`-1`, non-integer, unsafe integer);
- invalid path forms (`/abs`, `a//b`, `a/../b`, `a/./b`, backslash, colon, NUL, empty segment);
- missing/duplicate `statement` or `proof` role is allowed at generic contract level only if the adapter profile later permits it; generic contract validates role vocabulary, not adapter cardinality.

- [ ] **Step 4: Add exact digest formula RED tests**

For dependency closure:

```js
const deps = validManifest().dependencies;
const expected = sha256(Buffer.concat([
  Buffer.from('axiom-formal-dependency-closure.v1\n', 'utf8'),
  Buffer.from(canonicalJson(deps), 'utf8')
]));
assert.equal(formalDependencyClosureDigest(deps), expected);
```

For profile:

```js
const expectedProfile = sha256(Buffer.concat([
  Buffer.from('axiom-formal-verifier-profile.v1\n', 'utf8'),
  Buffer.from(canonicalJson(profile), 'utf8')
]));
assert.equal(formalVerifierProfileDigest(profile), expectedProfile);
```

For bundle, use the spec's two-stage formula:

```js
const manifestDigest = sha256(canonicalJson(manifest));
const expectedBundle = sha256(Buffer.concat([
  Buffer.from('axiom-formal-proof-bundle.v1\n', 'utf8'),
  Buffer.from(manifestDigest, 'hex')
]));
assert.equal(formalProofBundleDigest(manifest), expectedBundle);
```

For verification artifact:

```js
const expectedVerification = sha256(Buffer.concat([
  Buffer.from('axiom-formal-proof-verification.v1\n', 'utf8'),
  Buffer.from(canonicalJson(verificationArtifact), 'utf8')
]));
assert.equal(formalVerificationArtifactDigest(verificationArtifact), expectedVerification);
```

- [ ] **Step 5: Verify RED**

Run:

```bash
node --test mesh/test/axiom-formal-contracts.test.mjs
```

Expected: FAIL because `packages/axiom-verify/formal-contracts.mjs` does not exist.

- [ ] **Step 6: Implement `formal-contracts.mjs` minimally**

Use exact-key validators, bounded strings, bounded arrays, ordinary plain-object checks, explicit regexes, and no coercion. Path grammar should accept only:

```js
const FORMAL_PATH = /^(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+$/;
```

Then reject any segment equal to `.` or `..` even if the regex otherwise matches it.

Implement domain-separated hashing with raw prefix bytes and no hidden normalization:

```js
export function domainSeparatedDigestBytes(domain, bytes) {
  if (typeof domain !== 'string' || !domain.endsWith('\n')) {
    throw new VerifyError('invalid_domain', 'Digest domain must be a newline-terminated string');
  }
  const body = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  return sha256(Buffer.concat([Buffer.from(domain, 'utf8'), body]));
}

export function domainSeparatedDigestObject(domain, value) {
  return domainSeparatedDigestBytes(domain, Buffer.from(canonicalJson(value), 'utf8'));
}
```

Implement `formalProofBundleDigest()` exactly as two-stage manifest digest + domain prefix from the spec; do not simplify it to `domainSeparatedDigestObject()`.

- [ ] **Step 7: Verify GREEN and commit**

```bash
node --test mesh/test/axiom-formal-contracts.test.mjs
git add packages/axiom-verify/formal-contracts.mjs mesh/test/axiom-formal-contracts.test.mjs
git commit -m "feat: add formal verification v1 contracts"
```

---

### Task 2: Bounded in-memory bundle materialization

**Files:**
- Create: `packages/axiom-verify/formal-materialize.mjs`
- Create: `mesh/test/axiom-formal-materialize.test.mjs`

**Interfaces:**
- Produces:
  - `normalizeFormalResourcePolicy(policy)`
  - `formalResourcePolicyDigest(policy)`
  - `validateAndMaterializeFormalBundle({ manifest, artifacts }, resourcePolicy)`
- Returns a frozen record:

```js
{
  manifest,
  manifest_json,
  artifact_records: [
    { path, role, sha256, size_bytes, bytes }
  ],
  total_bundle_bytes,
  dependency_closure_digest,
  proof_bundle_digest
}
```

- `artifacts` input is a plain object mapping exact declared logical path to `Buffer`, `Uint8Array`, or UTF-8 string. It is not a filesystem path map and never triggers I/O.
- Consumes Task 1 validators/digest helpers and `canonicalJson`, `sha256`.

- [ ] **Step 1: Write RED tests for resource limits**

Use this exact resource policy fixture:

```js
const policy = {
  schema: 'axiom-formal-resource-policy.v1',
  max_manifest_bytes: 32768,
  max_bundle_bytes: 262144,
  max_file_count: 32,
  max_individual_file_bytes: 65536,
  max_dependency_count: 64,
  max_transcript_bytes: 16384,
  wall_clock_ms: 1000,
  max_process_count: 1,
  max_output_bytes: 16384,
  max_recursion_depth: 32,
  max_archive_expansions: 0
};
```

Prove each limit fails with a distinct code/message when exceeded.

- [ ] **Step 2: Write RED tests for exact artifact byte binding**

For a valid manifest and artifact map, independently compute SHA-256/size in the fixture. Then prove:
- altered statement bytes -> `artifact_digest_mismatch`;
- altered proof bytes -> `artifact_digest_mismatch`;
- correct digest but wrong declared size -> `artifact_size_mismatch`;
- missing declared file -> `artifact_missing`;
- undeclared extra file -> `artifact_undeclared`;
- duplicate logical path cannot be expressed through the input object and is already blocked in manifest validation;
- non-string/Buffer/Uint8Array value -> `artifact_invalid_bytes`;
- total bundle-size accounting includes manifest canonical JSON bytes plus all artifact bytes;
- no archive expansion path exists.

- [ ] **Step 3: Verify RED**

```bash
node --test mesh/test/axiom-formal-materialize.test.mjs
```

Expected: FAIL because `formal-materialize.mjs` does not exist.

- [ ] **Step 4: Implement the minimal materializer**

Validation order is normative:

```text
validate manifest shape/order/path rules
-> normalize resource policy
-> enforce manifest byte ceiling
-> enforce file/dependency count ceilings
-> require exact declared artifact key set
-> coerce only string/Buffer/Uint8Array to immutable copied Buffer
-> check individual and aggregate byte ceilings
-> check exact sha256 + size_bytes for every file
-> compute dependency_closure_digest
-> compute proof_bundle_digest
```

Do not call `fs`, `path.resolve`, package managers, environment discovery, or network code.

- [ ] **Step 5: Verify GREEN and commit**

```bash
node --test mesh/test/axiom-formal-contracts.test.mjs mesh/test/axiom-formal-materialize.test.mjs
git add packages/axiom-verify/formal-materialize.mjs mesh/test/axiom-formal-materialize.test.mjs
git commit -m "feat: materialize formal proof bundles in memory"
```

---

### Task 3: Allowlisted verifier profile registry and deterministic mock adapter

**Files:**
- Create: `packages/axiom-verify/formal-mock-adapter.mjs`
- Create: `packages/axiom-verify/formal-profile-registry.mjs`
- Create: `packages/axiom-verify/formal-fixtures.mjs`
- Create: `mesh/test/axiom-formal-profile-registry.test.mjs`
- Create: `mesh/test/axiom-formal-mock-adapter.test.mjs`

**Interfaces:**
- `formal-profile-registry.mjs` produces:
  - `MOCK_FORMAL_RESOURCE_POLICY`
  - `MOCK_FORMAL_PROFILE`
  - `MOCK_FORMAL_PROFILE_DIGEST`
  - `resolveFormalVerifierProfile(profileDigest)`
- Registry resolution returns:

```js
{
  profile,
  profile_digest,
  resource_policy,
  resource_policy_digest,
  adapter
}
```

- `formal-mock-adapter.mjs` produces:
  - `MOCK_STATEMENT_FINGERPRINT_DOMAIN = 'axiom-mock-statement-fingerprint.v1\n'`
  - `verifyMockFormalProof({ manifest, materialized, resolved_profile })`
- Adapter output is exactly:

```js
{
  verdict,
  reason_code,
  statement_fingerprint,
  dependency_closure_digest,
  premise_refs,
  verifier_profile_digest,
  transcript
}
```

- `formal-fixtures.mjs` produces `createMockFormalProofFixture(overrides = {})` for tests only.

- [ ] **Step 1: Write registry RED tests**

Assert:

```js
const resolved = resolveFormalVerifierProfile(MOCK_FORMAL_PROFILE_DIGEST);
assert.equal(resolved.profile_digest, MOCK_FORMAL_PROFILE_DIGEST);
assert.equal(formalVerifierProfileDigest(resolved.profile), MOCK_FORMAL_PROFILE_DIGEST);
assert.equal(formalResourcePolicyDigest(resolved.resource_policy), resolved.resource_policy_digest);
assert.equal(typeof resolved.adapter, 'function');
assert.equal(resolveFormalVerifierProfile('0'.repeat(64)), null);
```

Prove changing any one of these profile fields changes the digest:
- `adapter_version`;
- `verifier_version`;
- `executable_digest`;
- `configuration_digest`;
- `statement_fingerprint_method`;
- `dependency_closure_method`;
- `resource_policy_digest`;
- `output_contract_version`.

- [ ] **Step 2: Define the exact mock semantics in tests**

The mock profile accepts exactly one `statement` artifact and exactly one `proof` artifact.

Statement fingerprint:

```text
SHA-256(
  UTF8("axiom-mock-statement-fingerprint.v1\n") || statement_bytes
)
```

Valid proof bytes are exactly:

```text
axiom.mock.proof.v1\n<statement_fingerprint>\n
```

The adapter checks that `manifest.entrypoint.path` is the statement artifact path and returns `REJECTED/proof_rejected` when proof bytes do not match that exact form.

The adapter never attempts theorem search, network access, file discovery, process launch, or policy decisions.

- [ ] **Step 3: Write adapter RED tests**

Cover:
- valid fixture -> `VERIFIED`;
- changed proof bytes with manifest hashes recomputed -> `REJECTED/proof_rejected`;
- statement fingerprint mismatch in manifest -> adapter returns independently computed fingerprint so orchestrator can reject the mismatch in Task 4;
- duplicate/missing statement/proof roles -> `ERROR/adapter_contract_violation`;
- returned `premise_refs` exactly equal the canonical manifest list;
- transcript contains only stable semantic fields and no timestamp/PID/path outside logical bundle paths.

- [ ] **Step 4: Verify RED**

```bash
node --test mesh/test/axiom-formal-profile-registry.test.mjs mesh/test/axiom-formal-mock-adapter.test.mjs
```

Expected: FAIL because registry/adapter modules do not exist.

- [ ] **Step 5: Implement the registry and fixture-only mock adapter**

Use fixed mock identity material derived from immutable labels, not environment state:

```js
const executable_digest = sha256('axiom-mock-kernel:v1');
const configuration_digest = sha256('axiom-mock-config:token-equality-v1');
```

The registry is a frozen allowlist. Do not support dynamic registration in v1.

`createMockFormalProofFixture()` must generate statement/proof bytes first, then exact artifact descriptor hashes/sizes, then dependency closure, profile bindings, statement fingerprint, and final canonical manifest.

- [ ] **Step 6: Verify GREEN and commit**

```bash
node --test \
  mesh/test/axiom-formal-contracts.test.mjs \
  mesh/test/axiom-formal-materialize.test.mjs \
  mesh/test/axiom-formal-profile-registry.test.mjs \
  mesh/test/axiom-formal-mock-adapter.test.mjs
git add packages/axiom-verify/formal-mock-adapter.mjs \
  packages/axiom-verify/formal-profile-registry.mjs \
  packages/axiom-verify/formal-fixtures.mjs \
  mesh/test/axiom-formal-profile-registry.test.mjs \
  mesh/test/axiom-formal-mock-adapter.test.mjs
git commit -m "feat: add allowlisted mock formal verifier profile"
```

---

### Task 4: Formal verification orchestrator and deterministic verification artifact

**Files:**
- Create: `packages/axiom-verify/verify-formal-proof.mjs`
- Create: `packages/axiom-verify/formal-report.mjs`
- Create: `mesh/test/axiom-formal-verification.test.mjs`

**Interfaces:**
- Produces `verifyFormalProofBundle(bundle, options = {})`.
- Default resolver is `resolveFormalVerifierProfile`.
- Return shape:

```js
{
  ok,                       // true only for VERIFIED
  verdict,                  // VERIFIED | REJECTED | UNSUPPORTED | ERROR
  code,                     // bounded reason code
  reason,                   // human diagnostic, never policy-authoritative
  artifact,                 // axiom-formal-proof-verification.v1 or null for pre-contract failures
  artifact_digest,          // exact domain-separated digest or null
  report                    // human-facing non-claim report
}
```

- `formal-report.mjs` produces:
  - `FORMAL_VERIFICATION_NON_CLAIMS`
  - `buildFormalVerificationReport(result)`

- [ ] **Step 1: Write the valid end-to-end RED test**

```js
const fixture = createMockFormalProofFixture();
const result = verifyFormalProofBundle(fixture.bundle);
assert.equal(result.ok, true);
assert.equal(result.verdict, 'VERIFIED');
assert.equal(result.code, 'pass');
assert.equal(result.artifact.schema, 'axiom-formal-proof-verification.v1');
assert.equal(result.artifact.proof_bundle_digest, fixture.proof_bundle_digest);
assert.equal(result.artifact.verifier_profile_digest, MOCK_FORMAL_PROFILE_DIGEST);
assert.equal(result.artifact_digest, formalVerificationArtifactDigest(result.artifact));
assert.match(result.report.human_summary, /does not establish.*external world/i);
assert.match(result.report.human_summary, /does not authorize external effects/i);
```

- [ ] **Step 2: Write RED tests for the normative verification sequence**

Cover these exact classes:
- invalid manifest -> `ERROR/manifest_invalid`, `artifact === null`;
- unknown profile after valid byte binding -> `UNSUPPORTED/profile_unknown`;
- profile digest mismatch -> `REJECTED/profile_digest_mismatch`;
- redundant adapter/version/verifier/executable/configuration fields disagree with resolved profile -> matching bounded reason code;
- resource-policy digest mismatch -> `REJECTED/resource_policy_mismatch`;
- changed dependency descriptor with all file bytes unchanged -> `REJECTED/dependency_digest_mismatch` when the adapter result does not match the recomputed closure;
- statement fingerprint mismatch -> `REJECTED/statement_fingerprint_mismatch`;
- malformed adapter output -> `ERROR/adapter_contract_violation`;
- adapter throws -> `ERROR/verifier_execution_error`;
- transcript canonical bytes exceed policy -> `ERROR/transcript_limit_exceeded`;
- proof mismatch -> `REJECTED/proof_rejected`;
- successful path emits `VERIFIED` only after all independent comparisons pass.

- [ ] **Step 3: Add deterministic-repeat protection**

For this v1 mock profile, invoke the adapter twice with the same immutable materialized input and compare canonical semantic adapter outputs before accepting them.

Test with an injected resolver returning an adapter that toggles its verdict:

```js
let flip = false;
const nondeterministicAdapter = () => ({
  verdict: (flip = !flip) ? 'VERIFIED' : 'REJECTED',
  reason_code: 'pass',
  statement_fingerprint: fixture.statement_fingerprint,
  dependency_closure_digest: fixture.dependency_closure_digest,
  premise_refs: fixture.manifest.premise_refs,
  verifier_profile_digest: fixture.manifest.verifier_profile.profile_digest,
  transcript: { stable: false }
});
```

Expected: `ERROR/nondeterministic_result`; never `VERIFIED`.

- [ ] **Step 4: Define the deterministic transcript contract**

The orchestrator canonicalizes a transcript object containing only:

```js
{
  schema: 'axiom-formal-verification-transcript.v1',
  verdict,
  reason_code,
  claim_id,
  statement_fingerprint,
  dependency_closure_digest,
  premise_refs,
  verifier_profile_digest,
  adapter_transcript
}
```

Reject adapter transcript values that cannot be canonicalized. No wall-clock, PID, hostname, temp path, or random identifier is added.

- [ ] **Step 5: Build the final verification artifact exactly**

```js
{
  schema: 'axiom-formal-proof-verification.v1',
  verdict,
  reason_code,
  claim_id: manifest.claim_id,
  proof_bundle_digest: materialized.proof_bundle_digest,
  statement_fingerprint: computedStatementFingerprint,
  dependency_closure_digest: materialized.dependency_closure_digest,
  premise_refs: manifest.premise_refs,
  verifier_profile_digest: resolved.profile_digest,
  resource_policy_digest: resolved.resource_policy_digest,
  transcript_digest,
  verification_scope: {
    formal_system: manifest.formal_system,
    adapter_id: resolved.profile.adapter_id,
    verifier_id: resolved.profile.verifier_id,
    verifier_version: resolved.profile.verifier_version
  },
  non_claims: [
    'does-not-authorize-external-effects',
    'does-not-establish-external-world-truth',
    'does-not-establish-general-model-correctness',
    'does-not-establish-legal-or-policy-sufficiency',
    'does-not-establish-verifier-soundness-beyond-accepted-profile'
  ]
}
```

Keep `non_claims[]` lexicographically sorted in the actual implementation.

- [ ] **Step 6: Verify RED**

```bash
node --test mesh/test/axiom-formal-verification.test.mjs
```

Expected: FAIL because orchestrator/report modules do not exist.

- [ ] **Step 7: Implement minimal orchestrator/report and verify GREEN**

```bash
node --test \
  mesh/test/axiom-formal-contracts.test.mjs \
  mesh/test/axiom-formal-materialize.test.mjs \
  mesh/test/axiom-formal-profile-registry.test.mjs \
  mesh/test/axiom-formal-mock-adapter.test.mjs \
  mesh/test/axiom-formal-verification.test.mjs
git add packages/axiom-verify/verify-formal-proof.mjs \
  packages/axiom-verify/formal-report.mjs \
  mesh/test/axiom-formal-verification.test.mjs
git commit -m "feat: verify formal proof bundles deterministically"
```

---

### Task 5: AXIOM Verify public surface and authority/non-reachability regression

**Files:**
- Modify: `packages/axiom-verify/index.mjs`
- Create: `mesh/test/axiom-formal-authority-boundary.test.mjs`

**Interfaces:**
- Add public exports from `index.mjs` for:
  - all three formal schema constants;
  - `formalDependencyClosureDigest`;
  - `formalVerifierProfileDigest`;
  - `formalProofBundleDigest`;
  - `formalVerificationArtifactDigest`;
  - `MOCK_FORMAL_PROFILE_DIGEST`;
  - `createMockFormalProofFixture`;
  - `verifyFormalProofBundle`;
  - `FORMAL_VERIFICATION_NON_CLAIMS`.
- Do not change `verifyMachineReceiptLike()` semantics.
- Do not add a generic dispatcher that ambiguously mixes receipt and proof-bundle shapes in v1.

- [ ] **Step 1: Write the public-surface RED test**

Import from `../../packages/axiom-verify/index.mjs` only and prove the new formal API works without importing internal files.

- [ ] **Step 2: Write a static no-authority-import test**

In `mesh/test/axiom-formal-authority-boundary.test.mjs`, read the production formal modules and reject forbidden imports:

```js
const forbidden = [
  /from ['"]node:fs/, /from ['"]node:net/, /from ['"]node:http/, /from ['"]node:https/,
  /from ['"]node:tls/, /from ['"]node:dgram/, /from ['"]node:child_process/,
  /mesh\/src\//, /external-effect-outbox/, /capabilit(?:y|ies)/,
  /approval-consum/, /gateway-client/, /hypervisor/
];
```

Apply those regexes to executable import statements, not comments/human-facing non-claim strings. A small import-line extractor is preferable to scanning all text.

- [ ] **Step 3: Pin that Mesh has no formal-verification policy consumer in this slice**

Scan production `.mjs` files under `mesh/src/` and assert none import `packages/axiom-verify/verify-formal-proof.mjs`, `formal-profile-registry.mjs`, or reference `axiom-formal-proof-verification.v1` in executable source.

This is intentional first-slice behavior: a fabricated `{ verdict: 'VERIFIED' }` object cannot satisfy Mesh policy because no Mesh production consumer exists yet.

- [ ] **Step 4: Prove a genuine verification artifact cannot masquerade as an external effect**

Use the real external-effect validator:

```js
import { normalizePreparedExternalEffect } from '../src/lib/external-effect-outbox.mjs';

const verified = verifyFormalProofBundle(createMockFormalProofFixture().bundle);
assert.equal(verified.verdict, 'VERIFIED');
assert.throws(
  () => normalizePreparedExternalEffect(verified.artifact),
  /schema|prepared external effect/i
);
```

Also prove the verification artifact contains none of these authority fields:

```text
capability_id
approval_id
mandate_id
execution_authorized
external_effect_executed
merge_authorized
```

- [ ] **Step 5: Verify RED**

```bash
node --test mesh/test/axiom-formal-authority-boundary.test.mjs
```

Expected: FAIL until `index.mjs` exports the formal surface.

- [ ] **Step 6: Update `index.mjs`, verify GREEN, and commit**

```bash
node --test \
  mesh/test/axiom-verify.test.mjs \
  mesh/test/axiom-formal-contracts.test.mjs \
  mesh/test/axiom-formal-materialize.test.mjs \
  mesh/test/axiom-formal-profile-registry.test.mjs \
  mesh/test/axiom-formal-mock-adapter.test.mjs \
  mesh/test/axiom-formal-verification.test.mjs \
  mesh/test/axiom-formal-authority-boundary.test.mjs
git add packages/axiom-verify/index.mjs mesh/test/axiom-formal-authority-boundary.test.mjs
git commit -m "feat: expose formal verification through AXIOM Verify"
```

---

### Task 6: Adversarial matrix and report non-claim regression

**Files:**
- Create: `mesh/test/axiom-formal-adversarial.test.mjs`

**Interfaces:**
- Consumes only the public `packages/axiom-verify/index.mjs` surface plus dependency-injection hooks explicitly exposed by `verifyFormalProofBundle()` for tests (`profileResolver` only).
- Produces no production code unless a failing adversarial case requires the smallest correction in Tasks 1–5 modules.

- [ ] **Step 1: Build the mutation matrix**

Start from one valid fixture and mutate one dimension at a time:

```text
statement bytes
proof bytes
artifact size
artifact digest
artifact path
artifact order
dependency order
dependency duplicate
dependency digest
premise order
non-claim order
source-ref order
profile digest
adapter id
adapter version
verifier id
verifier version
executable digest
configuration digest
resource-policy digest
statement fingerprint
unknown profile
oversized manifest
oversized artifact
oversized bundle
oversized dependency count
oversized transcript
adapter throw
adapter malformed output
adapter nondeterminism
```

Each mutation must assert one exact expected verdict/reason class and must never produce `VERIFIED` accidentally.

- [ ] **Step 2: Add result-class separation tests**

Prove:
- bad proof under a known profile -> `REJECTED`;
- unknown profile -> `UNSUPPORTED`;
- resource/adaptor execution failure -> `ERROR`;
- only exact valid fixture -> `VERIFIED`.

Do not collapse these into a boolean-only API.

- [ ] **Step 3: Add human-report non-claim tests**

For every emitted `VERIFIED` result, assert human output contains all of:

```text
external world
model correctness
verifier soundness
external effects
legal
policy
```

And does not contain phrases that imply production promotion or truth certification:

```text
production-ready
certified true
guaranteed true
authorized to execute
mathematically proves reality
```

- [ ] **Step 4: Run the adversarial suite and fix only demonstrated failures**

```bash
node --test mesh/test/axiom-formal-adversarial.test.mjs
```

Expected after fixes: PASS.

- [ ] **Step 5: Run the complete focused AXIOM Verify suite and commit**

```bash
node --test \
  mesh/test/axiom-verify.test.mjs \
  mesh/test/axiom-formal-contracts.test.mjs \
  mesh/test/axiom-formal-materialize.test.mjs \
  mesh/test/axiom-formal-profile-registry.test.mjs \
  mesh/test/axiom-formal-mock-adapter.test.mjs \
  mesh/test/axiom-formal-verification.test.mjs \
  mesh/test/axiom-formal-authority-boundary.test.mjs \
  mesh/test/axiom-formal-adversarial.test.mjs
git add packages/axiom-verify mesh/test/axiom-formal-*.test.mjs
git commit -m "test: harden formal verification boundary"
```

---

### Task 7: Canonical tracker and documentation registration

**Files:**
- Modify: `docs/MASTER-TODO.md`
- Modify: `mesh/src/check-docs.mjs`
- Create: `mesh/test/formal-verification-doc-registration.test.mjs`
- Existing: `docs/superpowers/specs/2026-09-05-formal-verification-substrate-design.md`
- Existing: `docs/superpowers/plans/2026-09-05-formal-verification-substrate.md`

**Interfaces:**
- Adds `FORMAL-001` immediately after `VERIFY-001` in the P0 tracker.
- Registers the approved spec and implementation plan in `CANONICAL_DOCUMENTS`.
- Does not register runtime capability promotion and does not modify `mesh/config/capabilities.json`.

- [ ] **Step 1: Write the documentation-registration RED test**

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { CANONICAL_DOCUMENTS } from '../src/check-docs.mjs';

const REQUIRED_FORMAL_DOCS = [
  'docs/superpowers/specs/2026-09-05-formal-verification-substrate-design.md',
  'docs/superpowers/plans/2026-09-05-formal-verification-substrate.md'
];

test('FORMAL-001 design and plan are canonical documents', () => {
  for (const path of REQUIRED_FORMAL_DOCS) assert.ok(CANONICAL_DOCUMENTS.includes(path), path);
});
```

Also read `docs/MASTER-TODO.md` and assert it contains one `FORMAL-001` row with status `In progress` and language including `formal verification is evidence, not authority`.

- [ ] **Step 2: Verify RED**

```bash
node --test mesh/test/formal-verification-doc-registration.test.mjs
```

Expected: FAIL because the two paths and tracker row are not registered yet.

- [ ] **Step 3: Update the tracker**

Add exactly one row after `VERIFY-001`:

```text
| FORMAL-001 | In progress | Formal verification substrate | Exact statement/proof/dependency/profile/resource binding in AXIOM Verify; deterministic mock-adapter evidence path; formal verification is evidence, not authority; no real prover or Mesh effect consumer in this slice |
```

- [ ] **Step 4: Register the two reviewed documents**

Add the spec path to the specs block and the plan path to the plans block in `CANONICAL_DOCUMENTS`. Do not add package source files or tests to `CANONICAL_DOCUMENTS`.

- [ ] **Step 5: Verify docs and full repository checks**

```bash
node --test mesh/test/formal-verification-doc-registration.test.mjs
npm test
npm run check
```

Expected: all PASS on a supported Node version. If `npm run check` exposes an unrelated pre-existing failure, record it separately; do not weaken FORMAL-001 checks to hide it.

- [ ] **Step 6: Commit**

```bash
git add docs/MASTER-TODO.md mesh/src/check-docs.mjs mesh/test/formal-verification-doc-registration.test.mjs \
  docs/superpowers/specs/2026-09-05-formal-verification-substrate-design.md \
  docs/superpowers/plans/2026-09-05-formal-verification-substrate.md
git commit -m "docs: register FORMAL-001 verification substrate"
```

---

### Task 8: Final verification and review evidence

**Files:**
- No new production files expected.
- Review all Task 1–7 files.

**Interfaces:**
- Produces final implementation evidence only; no capability promotion.

- [ ] **Step 1: Verify exact changed-file scope**

Expected production/source changes are limited to:

```text
packages/axiom-verify/formal-contracts.mjs
packages/axiom-verify/formal-materialize.mjs
packages/axiom-verify/formal-mock-adapter.mjs
packages/axiom-verify/formal-profile-registry.mjs
packages/axiom-verify/formal-fixtures.mjs
packages/axiom-verify/verify-formal-proof.mjs
packages/axiom-verify/formal-report.mjs
packages/axiom-verify/index.mjs
mesh/src/check-docs.mjs
docs/MASTER-TODO.md
```

Plus the approved spec/plan and dedicated tests. Any change to `mesh/config/capabilities.json`, Gateway, Hypervisor, Grid authority clients, approvals, mandates, external-effect execution, networking, or subprocess code is out of scope and must be removed before approval.

- [ ] **Step 2: Run focused verification**

```bash
node --test \
  mesh/test/axiom-verify.test.mjs \
  mesh/test/axiom-formal-contracts.test.mjs \
  mesh/test/axiom-formal-materialize.test.mjs \
  mesh/test/axiom-formal-profile-registry.test.mjs \
  mesh/test/axiom-formal-mock-adapter.test.mjs \
  mesh/test/axiom-formal-verification.test.mjs \
  mesh/test/axiom-formal-authority-boundary.test.mjs \
  mesh/test/axiom-formal-adversarial.test.mjs \
  mesh/test/formal-verification-doc-registration.test.mjs
```

Expected: all PASS.

- [ ] **Step 3: Run repository verification**

```bash
npm test
npm run check
```

Expected: PASS on the supported Node matrix.

- [ ] **Step 4: Inspect non-authority reachability manually**

Confirm:
- `packages/axiom-verify/` formal modules have no authority/network/subprocess imports;
- no Mesh production source consumes `axiom-formal-proof-verification.v1` yet;
- `normalizePreparedExternalEffect()` rejects a formal verification artifact;
- capabilities registry is unchanged;
- mock adapter is labeled fixture/substrate-only;
- reports retain formal-proof-vs-reality non-claims.

- [ ] **Step 5: Commit any verification-only corrections**

Only if Step 2–4 exposed a defect, make the smallest correction, rerun the exact failing command plus the focused suite, then commit with a narrowly scoped message such as:

```bash
git commit -m "fix: close formal verification admission gap"
```

Do not create a release or promote FORMAL-001 beyond `In progress` in this plan.
