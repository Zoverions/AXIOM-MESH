# Formal Verification Substrate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a deterministic, fail-closed formal-proof verification substrate to AXIOM Verify that binds exact statements, proof bytes, dependency closure, verifier profile, resource policy, and transcript while preserving the invariant that verification is evidence and never authority.

**Architecture:** Keep the implementation under `packages/axiom-verify/` and reuse its dependency-light canonical JSON/SHA-256 posture. First validate caller-supplied manifest/artifact bytes under fixed conservative bootstrap ceilings that do not depend on trusting an unknown profile; only then resolve an allowlisted verifier profile, apply its exact tighter resource policy, invoke one deterministic in-process mock adapter, and emit a domain-separated verification artifact/report. Do not add a real theorem prover, filesystem discovery, network access, subprocess execution, capability changes, or a Mesh policy consumer in this slice; Mesh-side changes are negative reachability tests plus canonical documentation/tracker registration.

**Tech Stack:** Node.js ESM; Node built-ins (`node:crypto`, `node:test`, `node:assert/strict`, `node:fs/promises` in tests only); existing `packages/axiom-verify/canonical.mjs`; existing AXIOM Verify report conventions; existing Mesh external-effect validation for negative authority-boundary tests.

**Spec:** `docs/superpowers/specs/2026-09-05-formal-verification-substrate-design.md`

## Global Constraints

- Node compatibility remains `>=22.23.2 <23 || >=24.14.0 <25`.
- `mesh/config/capabilities.json` MUST NOT change in this slice.
- No real Lean, Coq, Isabelle, HOL, Metamath, SMT, or other external theorem prover is added in this slice.
- Production formal-verification modules MUST NOT import `node:fs`, `node:net`, `node:http`, `node:https`, `node:tls`, `node:dgram`, `node:child_process`, Gateway, Hypervisor, Grid authority clients, capability-grant code, approval-consumption code, or external-effect execution code.
- Production formal-verification modules MUST NOT consult `process.env`, `process.cwd()`, user home/config directories, package caches, current locale/timezone, `Date.now()`, `new Date()`, `Math.random()`, or hostnames to decide proof semantics or the core verification result.
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
- Resource-policy identity in this slice uses existing AXIOM canonical digest semantics: `digestObject(policy)`; it does not invent a fifth normative domain prefix not present in the approved spec.
- `VERIFIED` means only that the exact formal statement checks under the exact bound premises/dependencies/profile. It MUST NOT be described as external-world truth, general model correctness, legal sufficiency, policy wisdom, or execution authorization.
- `VERIFIED` MUST NOT create/widen capability, mandate, approval, policy, resource budget, destination scope, or external-effect authority.
- No Mesh production code consumes `axiom-formal-proof-verification.v1` as a policy predicate in this first slice. A future Mesh importer must be separately specified and must bind the exact verification artifact digest through existing signed evidence/provenance machinery.
- The mock adapter is fixture/substrate infrastructure only. Its `executable_digest` is a deterministic fixture-identity binding, not a claim of measured executable provenance or theorem-prover assurance.
- `wall_clock_ms` is profile-bound and checked after the bounded synchronous mock returns. This slice does not claim preemptive CPU isolation; any future external prover requires an independently specified enforceable runner/sandbox before admission.

---

### Task 1: Formal v1 contracts and domain-separated digest primitives

**Files:**
- Create: `packages/axiom-verify/formal-contracts.mjs`
- Create: `mesh/test/axiom-formal-contracts.test.mjs`

**Interfaces:**
- Produces:
  - `FORMAL_PROOF_BUNDLE_SCHEMA = 'axiom-formal-proof-bundle.v1'`
  - `FORMAL_PROOF_VERIFICATION_SCHEMA = 'axiom-formal-proof-verification.v1'`
  - `FORMAL_VERIFIER_PROFILE_SCHEMA = 'axiom-formal-verifier-profile.v1'`
  - `FORMAL_RESOURCE_POLICY_SCHEMA = 'axiom-formal-resource-policy.v1'`
  - `FORMAL_VERDICTS = Object.freeze(['VERIFIED','REJECTED','UNSUPPORTED','ERROR'])`
  - `domainSeparatedDigestBytes(domain, bytes)`
  - `domainSeparatedDigestObject(domain, value)`
  - `validateFormalProofManifest(manifest)`
  - `validateFormalVerifierProfile(profile)`
  - `normalizeFormalResourcePolicy(policy)`
  - `formalResourcePolicyDigest(policy)`
  - `formalDependencyClosureDigest(dependencies)`
  - `formalVerifierProfileDigest(profile)`
  - `formalProofBundleDigest(manifest)`
  - `validateFormalVerificationArtifact(artifact)`
  - `formalVerificationArtifactDigest(artifact)`
- `statement_fingerprint` is always the closed object `{ algorithm: 'sha256-domain-v1', value: <64-hex> }`; it is never a bare digest string.
- Consumes: `canonicalJson`, `digestObject`, `sha256`, and `VerifyError` from `packages/axiom-verify/canonical.mjs`.

- [ ] **Step 1: Write the failing schema/digest public-contract tests**

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalJson, sha256 } from '../../packages/axiom-verify/canonical.mjs';
import {
  FORMAL_PROOF_BUNDLE_SCHEMA,
  FORMAL_PROOF_VERIFICATION_SCHEMA,
  FORMAL_VERIFIER_PROFILE_SCHEMA,
  domainSeparatedDigestBytes,
  formalDependencyClosureDigest,
  formalProofBundleDigest,
  formalVerifierProfileDigest,
  formalVerificationArtifactDigest,
  validateFormalProofManifest
} from '../../packages/axiom-verify/formal-contracts.mjs';

test('formal schema ids are exact', () => {
  assert.equal(FORMAL_PROOF_BUNDLE_SCHEMA, 'axiom-formal-proof-bundle.v1');
  assert.equal(FORMAL_PROOF_VERIFICATION_SCHEMA, 'axiom-formal-proof-verification.v1');
  assert.equal(FORMAL_VERIFIER_PROFILE_SCHEMA, 'axiom-formal-verifier-profile.v1');
});

const bytes = Buffer.from('same-payload', 'utf8');
assert.notEqual(
  domainSeparatedDigestBytes('axiom-formal-proof-bundle.v1\n', bytes),
  domainSeparatedDigestBytes('axiom-formal-proof-verification.v1\n', bytes)
);
```

- [ ] **Step 2: Use this exact valid manifest shape in contract tests**

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

- [ ] **Step 3: Add strict order/path/shape RED tests**

Prove rejection of:
- unsorted or duplicate `artifacts[]`, `dependencies[]`, `premise_refs[]`, `declared_scope.non_claims[]`, `provenance.source_refs[]`;
- duplicate artifact path even when role/digest differ;
- malformed 64-hex digest;
- unknown artifact role outside `statement|proof|source|dependency|configuration|lockfile|auxiliary`;
- unknown top-level or nested key;
- unsafe/non-integer/negative `size_bytes`;
- `/abs`, `a//b`, `a/../b`, `a/./b`, `a\\b`, `a:b`, NUL, empty path.

Use:

```js
const bad = validManifest();
bad.premise_refs = ['premise:z', 'premise:a'];
assert.throws(() => validateFormalProofManifest(bad), /canonical order/i);
```

Generic manifest validation checks role vocabulary but does not require exactly one statement/proof; adapter-specific cardinality belongs to Task 3.

- [ ] **Step 4: Pin exact digest formulas**

Dependency closure:

```js
const expectedDependency = sha256(Buffer.concat([
  Buffer.from('axiom-formal-dependency-closure.v1\n', 'utf8'),
  Buffer.from(canonicalJson(manifest.dependencies), 'utf8')
]));
assert.equal(formalDependencyClosureDigest(manifest.dependencies), expectedDependency);
```

Verifier profile:

```js
const expectedProfile = sha256(Buffer.concat([
  Buffer.from('axiom-formal-verifier-profile.v1\n', 'utf8'),
  Buffer.from(canonicalJson(profile), 'utf8')
]));
assert.equal(formalVerifierProfileDigest(profile), expectedProfile);
```

Proof bundle is the spec's two-stage formula:

```js
const manifestDigest = sha256(canonicalJson(manifest));
const expectedBundle = sha256(Buffer.concat([
  Buffer.from('axiom-formal-proof-bundle.v1\n', 'utf8'),
  Buffer.from(manifestDigest, 'hex')
]));
assert.equal(formalProofBundleDigest(manifest), expectedBundle);
```

Verification artifact:

```js
const expectedVerification = sha256(Buffer.concat([
  Buffer.from('axiom-formal-proof-verification.v1\n', 'utf8'),
  Buffer.from(canonicalJson(verificationArtifact), 'utf8')
]));
assert.equal(formalVerificationArtifactDigest(verificationArtifact), expectedVerification);
```

`formalProofBundleDigest()` is a pure low-level formula helper; production orchestration MUST call it only after Task 2 has independently validated every artifact byte/size.

- [ ] **Step 5: Pin resource-policy contract**

Use the closed object:

```js
{
  schema: 'axiom-formal-resource-policy.v1',
  max_manifest_bytes,
  max_bundle_bytes,
  max_file_count,
  max_individual_file_bytes,
  max_dependency_count,
  max_transcript_bytes,
  wall_clock_ms,
  max_process_count,
  max_output_bytes,
  max_recursion_depth,
  max_archive_expansions
}
```

All fields are non-negative safe integers; byte/count/time ceilings except `max_archive_expansions` must be positive. In this slice `max_process_count === 1` and `max_archive_expansions === 0`. `formalResourcePolicyDigest(policy) === digestObject(normalizeFormalResourcePolicy(policy))`.

- [ ] **Step 6: Verify RED**

```bash
node --test mesh/test/axiom-formal-contracts.test.mjs
```

Expected: FAIL because `formal-contracts.mjs` does not exist.

- [ ] **Step 7: Implement minimal contracts and verify GREEN**

Path grammar:

```js
const FORMAL_PATH = /^(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+$/;
```

Then reject any segment exactly `.` or `..`.

Domain-separated bytes:

```js
export function domainSeparatedDigestBytes(domain, bytes) {
  if (typeof domain !== 'string' || !domain.endsWith('\n')) {
    throw new VerifyError('invalid_domain', 'Digest domain must be a newline-terminated string');
  }
  const body = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  return sha256(Buffer.concat([Buffer.from(domain, 'utf8'), body]));
}
```

Run and commit:

```bash
node --test mesh/test/axiom-formal-contracts.test.mjs
git add packages/axiom-verify/formal-contracts.mjs mesh/test/axiom-formal-contracts.test.mjs
git commit -m "feat: add formal verification v1 contracts"
```

---

### Task 2: Bootstrap-bounded in-memory artifact validation

**Files:**
- Create: `packages/axiom-verify/formal-materialize.mjs`
- Create: `mesh/test/axiom-formal-materialize.test.mjs`

**Interfaces:**
- Produces:
  - `FORMAL_BOOTSTRAP_RESOURCE_POLICY`
  - `validateAndMaterializeFormalBundle({ manifest, artifacts })`
  - `assertMaterializedBundleWithinResourcePolicy(materialized, policy)`
- `FORMAL_BOOTSTRAP_RESOURCE_POLICY` is fixed in source and intentionally conservative:

```js
{
  schema: 'axiom-formal-resource-policy.v1',
  max_manifest_bytes: 32768,
  max_bundle_bytes: 262144,
  max_file_count: 32,
  max_individual_file_bytes: 65536,
  max_dependency_count: 64,
  max_transcript_bytes: 16384,
  wall_clock_ms: 5000,
  max_process_count: 1,
  max_output_bytes: 16384,
  max_recursion_depth: 32,
  max_archive_expansions: 0
}
```

This bootstrap ceiling is not a verifier trust decision. It exists only so an unknown/untrusted requested profile cannot force unbounded parsing/materialization before registry lookup.

- Returns:

```js
{
  manifest,
  manifest_json,
  artifact_records: [{ path, role, sha256, size_bytes, bytes }],
  total_artifact_bytes,
  total_bundle_bytes,
  dependency_closure_digest,
  proof_bundle_digest
}
```

- `artifacts` is a plain object mapping exact declared logical path to `Buffer`, `Uint8Array`, or UTF-8 string. No filesystem reads occur.

- [ ] **Step 1: Write bootstrap-limit RED tests**

Prove distinct fail-closed codes for bootstrap violation of manifest bytes, total bundle bytes, file count, individual file bytes, and dependency count.

- [ ] **Step 2: Write exact artifact-binding RED tests**

Prove:
- altered statement/proof bytes -> `artifact_digest_mismatch`;
- correct digest but wrong declared size -> `artifact_size_mismatch`;
- missing declared file -> `artifact_missing`;
- undeclared extra file -> `artifact_undeclared`;
- unsupported byte value -> `artifact_invalid_bytes`;
- `total_bundle_bytes` equals canonical manifest UTF-8 bytes plus all artifact bytes;
- proof bundle digest is not returned until all declared artifact hashes/sizes have passed.

- [ ] **Step 3: Write profile-policy recheck RED tests**

Given a successfully bootstrap-materialized bundle, pass a tighter profile policy to `assertMaterializedBundleWithinResourcePolicy()` and prove it rejects if any profile ceiling is exceeded. This is the second resource gate required before adapter execution.

- [ ] **Step 4: Verify RED**

```bash
node --test mesh/test/axiom-formal-materialize.test.mjs
```

Expected: FAIL because `formal-materialize.mjs` does not exist.

- [ ] **Step 5: Implement the exact validation sequence**

```text
validate manifest/order/path shape
-> apply fixed bootstrap manifest/file/dependency ceilings
-> require exact declared artifact key set
-> copy only string/Buffer/Uint8Array bytes
-> enforce individual + aggregate bootstrap byte ceilings
-> verify exact sha256 + size_bytes for every artifact
-> compute dependency_closure_digest
-> compute proof_bundle_digest
```

`assertMaterializedBundleWithinResourcePolicy()` rechecks already-measured counts/bytes against the resolved profile policy; it does not re-read or mutate bytes.

- [ ] **Step 6: Verify GREEN and commit**

```bash
node --test mesh/test/axiom-formal-contracts.test.mjs mesh/test/axiom-formal-materialize.test.mjs
git add packages/axiom-verify/formal-materialize.mjs mesh/test/axiom-formal-materialize.test.mjs
git commit -m "feat: bind formal proof bundle bytes"
```

---

### Task 3: Static allowlisted mock verifier profile and adapter

**Files:**
- Create: `packages/axiom-verify/formal-mock-adapter.mjs`
- Create: `packages/axiom-verify/formal-profile-registry.mjs`
- Create: `packages/axiom-verify/formal-fixtures.mjs`
- Create: `mesh/test/axiom-formal-profile-registry.test.mjs`
- Create: `mesh/test/axiom-formal-mock-adapter.test.mjs`

**Interfaces:**
- `formal-profile-registry.mjs` exports `MOCK_FORMAL_RESOURCE_POLICY`, `MOCK_FORMAL_PROFILE`, `MOCK_FORMAL_PROFILE_DIGEST`, `resolveFormalVerifierProfile(profileDigest)`.
- Exact resource policy is the same numeric ceiling as bootstrap in v1; future profiles may be tighter but never bypass bootstrap.
- Exact profile descriptor:

```js
{
  profile_schema: 'axiom-formal-verifier-profile.v1',
  adapter_id: 'axiom.mock-formal.v1',
  adapter_version: '1.0.0',
  formal_system: {
    language: 'axiom-mock',
    language_version: '1',
    logic_profile: 'token-equality-v1'
  },
  verifier_id: 'axiom-mock-kernel',
  verifier_version: '1.0.0',
  executable_digest: sha256('axiom-mock-kernel-fixture:v1'),
  configuration_digest: sha256('axiom-mock-config:token-equality-v1'),
  statement_fingerprint_method: 'sha256-domain:axiom-mock-statement-fingerprint.v1',
  dependency_closure_method: 'axiom-formal-dependency-closure.v1',
  resource_policy_digest: formalResourcePolicyDigest(MOCK_FORMAL_RESOURCE_POLICY),
  output_contract_version: 'axiom-formal-adapter-output.v1'
}
```

- Registry resolution returns `{ profile, profile_digest, resource_policy, resource_policy_digest, adapter }` or `null`. No dynamic registration API exists.
- `verifyMockFormalProof({ manifest, materialized, resolved_profile })` returns exactly:

```js
{
  verdict,
  reason_code,
  statement_fingerprint: { algorithm: 'sha256-domain-v1', value: <64-hex> },
  dependency_closure_digest,
  premise_refs,
  verifier_profile_digest,
  transcript
}
```

- [ ] **Step 1: Write profile identity RED tests**

Assert resolving `MOCK_FORMAL_PROFILE_DIGEST` round-trips exact profile/resource digests and unknown 64-hex returns `null`. Prove changing any one of `adapter_version`, `verifier_version`, `executable_digest`, `configuration_digest`, `statement_fingerprint_method`, `dependency_closure_method`, `resource_policy_digest`, or `output_contract_version` changes profile digest.

- [ ] **Step 2: Pin exact mock proof semantics in tests**

Exactly one `statement` artifact and one `proof` artifact are required. `entrypoint.path` must equal the statement artifact path.

Statement fingerprint:

```text
SHA-256(UTF8("axiom-mock-statement-fingerprint.v1\n") || statement_bytes)
```

Valid proof bytes:

```text
axiom.mock.proof.v1\n<statement_fingerprint.value>\n
```

Bad proof returns `REJECTED/proof_rejected`. Missing/duplicate role cardinality returns `ERROR/adapter_contract_violation`.

- [ ] **Step 3: Pin stable adapter transcript**

Adapter transcript is a plain canonicalizable record containing only stable logical facts such as declaration, logical statement path, proof check boolean, and reason code. It contains no wall-clock, PID, hostname, absolute path, environment variable, random value, or raw diagnostic stream.

- [ ] **Step 4: Verify RED**

```bash
node --test mesh/test/axiom-formal-profile-registry.test.mjs mesh/test/axiom-formal-mock-adapter.test.mjs
```

Expected: FAIL because modules do not exist.

- [ ] **Step 5: Implement registry, adapter, fixture builder**

`createMockFormalProofFixture(overrides = {})` must:
1. resolve the static mock profile;
2. create statement bytes;
3. compute statement fingerprint;
4. create proof bytes from that fingerprint;
5. compute artifact hashes/sizes and canonical artifact ordering;
6. build canonical dependencies/premises/non-claims/source refs;
7. copy redundant verifier identity fields from the resolved profile;
8. set top-level resource policy digest from the resolved resource policy;
9. return `{ bundle: { manifest, artifacts }, manifest, statement_fingerprint, dependency_closure_digest, proof_bundle_digest }`.

The fixture helper may call the materializer after construction to calculate its expected bundle digest; production verification still recomputes independently.

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
git commit -m "feat: add allowlisted mock formal verifier"
```

---

### Task 4: Formal verification orchestrator, transcript, and report

**Files:**
- Create: `packages/axiom-verify/verify-formal-proof.mjs`
- Create: `packages/axiom-verify/formal-report.mjs`
- Create: `mesh/test/axiom-formal-verification.test.mjs`

**Interfaces:**
- `verifyFormalProofBundle(bundle, options = {})` where `options.profileResolver` defaults to `resolveFormalVerifierProfile` and is the only test injection hook.
- Returns:

```js
{
  ok,
  verdict,
  code,
  reason,
  artifact,
  artifact_digest,
  report
}
```

- `artifact === null` only for pre-contract failures where a valid v1 verification artifact cannot be truthfully constructed (for example malformed/unknown manifest schema).
- After a manifest is structurally valid and all bytes are bootstrap-bound, `UNSUPPORTED`, `REJECTED`, and `ERROR` should emit a deterministic `axiom-formal-proof-verification.v1` artifact whenever required identity fields are available.

- [ ] **Step 1: Write exact valid-path RED test**

```js
const fixture = createMockFormalProofFixture();
const result = verifyFormalProofBundle(fixture.bundle);
assert.equal(result.ok, true);
assert.equal(result.verdict, 'VERIFIED');
assert.equal(result.code, 'pass');
assert.deepEqual(result.artifact.statement_fingerprint, fixture.statement_fingerprint);
assert.equal(result.artifact.proof_bundle_digest, fixture.proof_bundle_digest);
assert.equal(result.artifact.verifier_profile_digest, MOCK_FORMAL_PROFILE_DIGEST);
assert.equal(result.artifact_digest, formalVerificationArtifactDigest(result.artifact));
```

- [ ] **Step 2: Implement/test the normative orchestration order**

Exact order:

```text
1. bootstrap-validate manifest + caller-supplied bytes
2. resolve requested profile_digest through options.profileResolver
3. unknown profile -> UNSUPPORTED/profile_unknown (no adapter call)
4. compare manifest redundant profile fields to resolved profile
5. compare top-level resource_policy_digest to resolved resource policy digest
6. apply resolved profile resource ceilings to materialized measured facts
7. invoke adapter with immutable validated material
8. measure elapsed monotonic time only for resource enforcement; do not include elapsed value in core transcript/artifact
9. validate bounded adapter output contract
10. invoke adapter a second time with identical immutable inputs and compare canonical semantic output
11. disagreement -> ERROR/nondeterministic_result
12. independently compare statement fingerprint, dependency closure digest, premise refs, verifier profile digest
13. construct bounded deterministic transcript and enforce max_transcript_bytes
14. construct/validate verification artifact
15. compute verification artifact digest
16. build human report with required non-claims
```

The synchronous mock's elapsed-time check can detect an overrun after return but cannot preempt a hung function; report/non-claims must not imply stronger sandboxing.

- [ ] **Step 3: Write failure-class RED tests**

Cover:
- malformed manifest -> `ERROR/manifest_invalid`, `artifact === null`;
- unknown profile -> `UNSUPPORTED/profile_unknown`;
- redundant `adapter_id`, `adapter_version`, `verifier_id`, `verifier_version`, `executable_digest`, `configuration_digest` mismatch -> bounded corresponding `REJECTED` code;
- resource-policy digest mismatch -> `REJECTED/resource_policy_mismatch`;
- profile-specific byte/count ceiling breach -> `ERROR/resource_limit_exceeded`;
- adapter throw -> `ERROR/verifier_execution_error`;
- malformed adapter output -> `ERROR/adapter_contract_violation`;
- adapter transcript over limit -> `ERROR/transcript_limit_exceeded`;
- adapter nondeterminism -> `ERROR/nondeterministic_result`;
- statement fingerprint mismatch -> `REJECTED/statement_fingerprint_mismatch`;
- dependency closure mismatch -> `REJECTED/dependency_digest_mismatch`;
- premise list mismatch -> `REJECTED/premise_refs_mismatch`;
- bad proof -> `REJECTED/proof_rejected`;
- only the exact valid fixture -> `VERIFIED/pass`.

- [ ] **Step 4: Pin deterministic transcript shape**

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

Compute `transcript_digest = sha256(canonicalJson(transcript))`; the approved spec requires the transcript itself to be bounded/deterministic but does not define an additional transcript domain prefix.

- [ ] **Step 5: Pin verification artifact shape**

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
  verifier_profile_digest: requestedOrResolvedProfileDigest,
  resource_policy_digest: manifest.resource_policy_digest,
  transcript_digest,
  verification_scope: {
    formal_system: manifest.formal_system,
    adapter_id: resolved ? resolved.profile.adapter_id : manifest.verifier_profile.adapter_id,
    verifier_id: resolved ? resolved.profile.verifier_id : manifest.verifier_profile.verifier_id,
    verifier_version: resolved ? resolved.profile.verifier_version : manifest.verifier_profile.verifier_version
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

The array above is already lexicographically sorted. For `UNSUPPORTED/profile_unknown`, the artifact records the requested manifest profile identity; it does not represent that profile as trusted or accepted.

- [ ] **Step 6: Pin human report language**

`FORMAL_VERIFICATION_NON_CLAIMS` must state at minimum:
- formal premises may not correspond to the external world;
- a result does not establish general model correctness;
- verifier soundness is only within accepted profile/review assumptions;
- formal verification does not authorize external effects;
- it does not establish legal sufficiency, policy wisdom, or institutional legitimacy;
- the mock profile is fixture-only and not a real theorem prover.

- [ ] **Step 7: Verify RED, implement, GREEN, commit**

```bash
node --test mesh/test/axiom-formal-verification.test.mjs
```

Expected before implementation: FAIL.

Then:

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

### Task 5: AXIOM Verify public surface and non-authority reachability guard

**Files:**
- Modify: `packages/axiom-verify/index.mjs`
- Create: `mesh/test/axiom-formal-authority-boundary.test.mjs`

**Interfaces:**
- Publicly export all formal schema constants, digest/validation helpers needed by independent verifiers, `MOCK_FORMAL_PROFILE_DIGEST`, `createMockFormalProofFixture`, `verifyFormalProofBundle`, and `FORMAL_VERIFICATION_NON_CLAIMS`.
- Do not change `verifyMachineReceiptLike()` behavior.
- Do not add a generic receipt/proof dispatcher in v1.

- [ ] **Step 1: Write public-surface RED test**

Import only from `../../packages/axiom-verify/index.mjs`, create a mock fixture, verify it, and assert `VERIFIED` plus exact artifact digest.

- [ ] **Step 2: Add production import/ambient-state static guard**

Read only the new production formal modules and extract executable import lines. Reject imports matching:

```js
[
  /node:fs/, /node:net/, /node:http/, /node:https/, /node:tls/, /node:dgram/,
  /node:child_process/, /mesh\/src\//, /external-effect-outbox/,
  /gateway-client/, /hypervisor/, /approval-consum/
]
```

Also reject executable production references to:

```js
[
  /process\.env/, /process\.cwd\(/, /Math\.random\(/, /Date\.now\(/,
  /new Date\(/, /os\.hostname\(/, /homedir\(/
]
```

Do not scan comments/non-claim prose with these semantic regexes; strip comments or inspect executable lines so the test does not punish documentation language.

- [ ] **Step 3: Pin no Mesh policy consumer in this slice**

Recursively scan production `.mjs` under `mesh/src/` and assert no executable source imports formal verifier modules or references `axiom-formal-proof-verification.v1`. This is intentional: a fabricated JSON object containing `verdict: 'VERIFIED'` is not a Mesh policy input in this slice at all.

- [ ] **Step 4: Prove a real verification artifact is rejected by external-effect normalization**

```js
import { normalizePreparedExternalEffect } from '../src/lib/external-effect-outbox.mjs';

const verified = verifyFormalProofBundle(createMockFormalProofFixture().bundle);
assert.equal(verified.verdict, 'VERIFIED');
assert.throws(() => normalizePreparedExternalEffect(verified.artifact));
```

Assert the artifact has none of:

```text
capability_id
approval_id
mandate_id
execution_authorized
external_effect_executed
merge_authorized
```

- [ ] **Step 5: Verify RED, expose API, GREEN, commit**

```bash
node --test mesh/test/axiom-formal-authority-boundary.test.mjs
```

Expected before index export: FAIL.

Then:

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

### Task 6: Adversarial mutation matrix

**Files:**
- Create: `mesh/test/axiom-formal-adversarial.test.mjs`

**Interfaces:**
- Consume public `packages/axiom-verify/index.mjs` plus the documented `options.profileResolver` injection hook.
- No new production module should be necessary; if a mutation exposes a defect, make the smallest correction in Tasks 1–5 code and rerun the focused suite.

- [ ] **Step 1: Mutate every trust binding one at a time**

Matrix:

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
bootstrap manifest limit
bootstrap file limit
bootstrap bundle limit
profile-specific resource limit
transcript limit
adapter throw
adapter malformed output
adapter nondeterminism
```

Each mutation asserts one expected bounded verdict/reason class and must never accidentally produce `VERIFIED`.

- [ ] **Step 2: Pin result-class separation**

```text
known-profile bad proof        -> REJECTED
unknown profile                -> UNSUPPORTED
resource/execution/contract    -> ERROR
exact valid fixture            -> VERIFIED
```

- [ ] **Step 3: Pin human non-claims**

Every `VERIFIED` report must contain concepts `external world`, `model correctness`, `verifier soundness`, `external effects`, `legal`, and `policy`, and must not claim `production-ready`, `certified true`, `guaranteed true`, `authorized to execute`, or `mathematically proves reality`.

- [ ] **Step 4: Run and commit adversarial coverage**

```bash
node --test mesh/test/axiom-formal-adversarial.test.mjs
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
- Add `FORMAL-001` immediately after `VERIFY-001` in P0.
- Register approved spec and plan in `CANONICAL_DOCUMENTS`.
- No capability registry change.

- [ ] **Step 1: Write doc-registration RED test**

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

Also read `docs/MASTER-TODO.md` and require exactly one `FORMAL-001` row with `In progress` and `formal verification is evidence, not authority`.

- [ ] **Step 2: Verify RED**

```bash
node --test mesh/test/formal-verification-doc-registration.test.mjs
```

Expected: FAIL until registration/tracker change.

- [ ] **Step 3: Add tracker row exactly**

```text
| FORMAL-001 | In progress | Formal verification substrate | Exact statement/proof/dependency/profile/resource binding in AXIOM Verify; deterministic mock-adapter evidence path; formal verification is evidence, not authority; no real prover or Mesh effect consumer in this slice |
```

- [ ] **Step 4: Register only the spec and plan**

Add spec to the specs block and plan to the plans block in `CANONICAL_DOCUMENTS`. Do not add source/tests to the canonical-document list.

- [ ] **Step 5: Verify docs, repository checks, commit**

```bash
node --test mesh/test/formal-verification-doc-registration.test.mjs
npm test
npm run check
git add docs/MASTER-TODO.md mesh/src/check-docs.mjs mesh/test/formal-verification-doc-registration.test.mjs \
  docs/superpowers/specs/2026-09-05-formal-verification-substrate-design.md \
  docs/superpowers/plans/2026-09-05-formal-verification-substrate.md
git commit -m "docs: register FORMAL-001 verification substrate"
```

Expected: PASS on a supported Node version. If a full repository command exposes an unrelated pre-existing failure, record it separately; do not weaken FORMAL-001 tests.

---

### Task 8: Final verification and review evidence

**Files:**
- No new production files expected.
- Review all Task 1–7 changes.

**Interfaces:**
- Produces verification evidence only; no release or capability promotion.

- [ ] **Step 1: Verify exact production/source scope**

Allowed source changes:

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

Plus the approved spec/plan and dedicated tests. Changes to `mesh/config/capabilities.json`, Gateway, Hypervisor, Grid authority clients, approval/mandate logic, external-effect execution, network code, or subprocess code are out of scope and must be removed.

- [ ] **Step 2: Run focused suite**

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

Expected: PASS on supported Node.

- [ ] **Step 4: Manually confirm non-authority/non-environment reachability**

Confirm:
- formal modules have no forbidden authority/network/subprocess imports;
- no formal proof semantics depend on ambient env/cwd/time/random/hostname;
- no Mesh production source consumes formal verification artifacts yet;
- `normalizePreparedExternalEffect()` rejects a formal verification artifact;
- capabilities registry is unchanged;
- mock adapter is clearly fixture/substrate-only;
- reports preserve proof-vs-reality non-claims.

- [ ] **Step 5: Commit only demonstrated final corrections**

If Steps 2–4 expose a defect, make the smallest correction, rerun the exact failing command plus the focused suite, and commit with a narrow message such as:

```bash
git commit -m "fix: close formal verification boundary gap"
```

Do not create a release or promote FORMAL-001 beyond `In progress` in this plan.
