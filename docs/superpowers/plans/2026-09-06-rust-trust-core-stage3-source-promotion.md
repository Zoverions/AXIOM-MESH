# Rust Trust-Core Stage 3 Source Promotion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Promote the proven pure `canonical-value-v0` Rust implementation into a governed repository candidate-source boundary while keeping Node authoritative and Rust completely outside supported runtime authority.

**Architecture:** Create one source-only candidate file at `trust-core/rust/canonical_value_v0.rs`; do not create a Cargo manifest, binary, service, FFI surface, or runtime consumer. The existing `labs/rust-trust-core` crate remains the only Rust build surface and compiles/re-exports the promoted module for the existing Stage 2 differential suite. Extend release governance so only the exact candidate source is admitted and add a structural guard proving supported `mesh/src/` source does not reference it.

**Tech Stack:** Node.js 24.18.0, Rust 1.85.0 / edition 2024, Rust standard library only, Node built-in test runner, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-06-rust-trust-core-stage3-source-promotion-design.md`

## Global Constraints

- The supported Node.js kernel remains authoritative.
- `mesh/src/lib/canonical.mjs` remains the executable oracle for `canonical-value-v0`.
- Rust remains non-authoritative and runtime-unreachable.
- The only promoted Rust source path is `trust-core/rust/canonical_value_v0.rs`.
- Do not create a Cargo manifest, Rust binary, service, FFI boundary, WASM module, runtime adapter, capability-registry entry, Gateway route, Hypervisor/Sandbox/Grid integration, production credential/state access, listener, or egress path.
- Rust remains pinned to `1.85.0` in the existing laboratory crate.
- `#![forbid(unsafe_code)]` remains required.
- Zero third-party Rust dependencies remain required.
- Existing `canonical-value-v0` valid and malformed fixture corpora remain unchanged unless a separately reviewed defect is discovered.
- The release verifier must admit only the exact approved candidate source and keep rejecting arbitrary Rust source/manifests.
- Supported `mesh/src/` source must not reference or invoke the promoted candidate or Rust laboratory.
- Every Stage 3 change remains source-only and reversible.

---

### Task 1: RED/GREEN — govern the exact promoted candidate source

**Files:**
- Create: `mesh/test/rust-trust-core-candidate-source-boundary.test.mjs`
- Modify: `mesh/src/release.mjs`

**Interfaces:**
- Consumes: `validateSupportedSourceBoundary(trackedPaths)` from `mesh/src/release.mjs`.
- Produces: `candidate_rust_sources` in the returned boundary evidence, containing exactly `trust-core/rust/canonical_value_v0.rs` when that path is present in the tracked set.

- [ ] **Step 1: Write the failing source-boundary test.**

Create a Node test with three assertions:

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { validateSupportedSourceBoundary } from '../src/release.mjs';

test('release source boundary classifies only the approved Stage 3 Rust candidate source', () => {
  const result = validateSupportedSourceBoundary([
    'README.md',
    'package.json',
    'package-lock.json',
    'mesh/package.json',
    'mesh/package-lock.json',
    'labs/rust-trust-core/Cargo.toml',
    'labs/rust-trust-core/Cargo.lock',
    'trust-core/rust/canonical_value_v0.rs'
  ]);

  assert.deepEqual(result.candidate_rust_sources, [
    'trust-core/rust/canonical_value_v0.rs'
  ]);
  assert.deepEqual(result.dependency_manifests, [
    'mesh/package-lock.json',
    'mesh/package.json',
    'package-lock.json',
    'package.json'
  ]);
  assert.deepEqual(result.laboratory_dependency_manifests, [
    'labs/rust-trust-core/Cargo.lock',
    'labs/rust-trust-core/Cargo.toml'
  ]);
});

test('release source boundary rejects unapproved Rust source beside the Stage 3 candidate', () => {
  assert.throws(
    () => validateSupportedSourceBoundary([
      'mesh/package.json',
      'trust-core/rust/canonical_value_v0.rs',
      'trust-core/rust/extra.rs'
    ]),
    /Unsupported legacy runtime or dependency paths/
  );
});

test('release source boundary still rejects unapproved Cargo manifests', () => {
  assert.throws(
    () => validateSupportedSourceBoundary([
      'mesh/package.json',
      'trust-core/rust/Cargo.toml'
    ]),
    /Unsupported legacy runtime or dependency paths/
  );
});
```

- [ ] **Step 2: Run the focused Node test and verify RED.**

Run the repository Node test command scoped to `mesh/test/rust-trust-core-candidate-source-boundary.test.mjs`.

Expected: failure because `trust-core/rust/canonical_value_v0.rs` is not yet an approved source class and/or `candidate_rust_sources` is absent.

- [ ] **Step 3: Add the minimum release-verifier classification.**

In `mesh/src/release.mjs`, add:

```js
const CANDIDATE_RUST_SOURCES = new Set([
  'trust-core/rust/canonical_value_v0.rs'
]);
```

Extend `validateSupportedSourceBoundary` so tracked `.rs` files under `trust-core/rust/` are rejected unless present in `CANDIDATE_RUST_SOURCES`. Do not add a wildcard exception. Preserve existing dependency-manifest checks.

Return a separately sorted evidence field:

```js
candidate_rust_sources: [...CANDIDATE_RUST_SOURCES]
  .filter(path => trackedPaths.includes(path))
  .sort()
```

- [ ] **Step 4: Re-run the focused Node test and require GREEN.**

Expected: all three tests pass; arbitrary `extra.rs` and `trust-core/rust/Cargo.toml` remain rejected.

- [ ] **Step 5: Run the existing Rust source-boundary test too.**

Run both:

```text
mesh/test/rust-trust-core-source-boundary.test.mjs
mesh/test/rust-trust-core-candidate-source-boundary.test.mjs
```

Expected: both pass and production dependency classification remains unchanged.

- [ ] **Step 6: Commit with `test: govern Stage 3 Rust candidate source`.**

---

### Task 2: RED/GREEN — extract the proven canonical module without semantic change

**Files:**
- Create: `trust-core/rust/canonical_value_v0.rs`
- Modify: `labs/rust-trust-core/src/lib.rs`
- Test: `labs/rust-trust-core/tests/canonical_differential.rs`
- Test: existing Rust unit/doc tests

**Interfaces:**
- Promoted module produces the existing public API:
  - `CanonicalScalar`
  - `CanonicalCase`
  - `VectorError`
  - `parse_canonical_vector_row(&str) -> Result<CanonicalCase, VectorError>`
  - `parse_canonical_fixture(&str) -> Result<Vec<CanonicalCase>, VectorError>`
  - `canonicalize_case(&CanonicalCase) -> String`
- Laboratory crate re-exports those exact names so existing Stage 2 tests remain source-compatible.

- [ ] **Step 1: Write a failing Rust source-location contract test before extraction.**

Add a test in `labs/rust-trust-core/tests/canonical_differential.rs` that resolves the repository root and requires `trust-core/rust/canonical_value_v0.rs` to exist and the laboratory crate root to contain the module include/re-export marker. The test must fail while the candidate file is absent.

The contract should check for exact strings such as:

```text
#[path = "../../../trust-core/rust/canonical_value_v0.rs"]
mod canonical_value_v0;
pub use canonical_value_v0::{
```

- [ ] **Step 2: Run the Rust laboratory suite and verify RED.**

Run:

```bash
cargo test --manifest-path labs/rust-trust-core/Cargo.toml --locked
```

Expected: source-location contract fails because the promoted source file/include does not yet exist.

- [ ] **Step 3: Create `trust-core/rust/canonical_value_v0.rs` with only the proven canonical-value code.**

Move, without semantic expansion, these Stage 2 definitions/helpers out of `labs/rust-trust-core/src/lib.rs`:

```text
SAFE_INTEGER_MIN
SAFE_INTEGER_MAX
CanonicalScalar
CanonicalValue
CanonicalCase
VectorError
parse_canonical_vector_row
parse_canonical_fixture
canonicalize_case
parse_scalar_token
parse_safe_integer
has_canonical_integer_syntax
parse_ascii_string
parse_ascii_key_object
is_valid_object_key
canonicalize_scalar
```

The promoted module may import only standard-library items needed by those definitions (`HashSet`, `Error`, `Display`, `Formatter`).

- [ ] **Step 4: Make the laboratory crate compile the promoted source directly.**

At the top of `labs/rust-trust-core/src/lib.rs`, after `#![forbid(unsafe_code)]`, add:

```rust
#[path = "../../../trust-core/rust/canonical_value_v0.rs"]
mod canonical_value_v0;

pub use canonical_value_v0::{
    CanonicalCase, CanonicalScalar, VectorError, canonicalize_case,
    parse_canonical_fixture, parse_canonical_vector_row,
};
```

Retain the Stage 1 authority experiment in `labs/rust-trust-core/src/lib.rs`. Remove the duplicate canonical-value definitions from the laboratory file.

- [ ] **Step 5: Run rustfmt, Clippy, and the full locked Rust suite.**

Run:

```bash
cargo fmt --manifest-path labs/rust-trust-core/Cargo.toml --all -- --check
cargo clippy --manifest-path labs/rust-trust-core/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path labs/rust-trust-core/Cargo.toml --locked
```

Expected: exact Stage 2 Node-vs-Rust comparison, mismatch proof, malformed-vector rejection, duplicate-oracle output rejection, authority tests, and compile-fail grant tests all remain green.

- [ ] **Step 6: Confirm no new Rust manifest/dependency exists.**

Inspect changed paths and require that the only new path under `trust-core/rust/` is `canonical_value_v0.rs`.

- [ ] **Step 7: Commit with `refactor: promote canonical Rust candidate source`.**

---

### Task 3: RED/GREEN — prove supported runtime does not consume the candidate

**Files:**
- Create: `mesh/test/rust-trust-core-runtime-isolation.test.mjs`

**Interfaces:**
- Consumes: repository tracked source under `mesh/src/`.
- Produces: a structural invariant that no supported runtime source contains prohibited Stage 3 Rust candidate/laboratory references.

- [ ] **Step 1: Write the structural isolation test.**

The test must enumerate tracked files under `mesh/src/` and fail if any file contains one of these exact markers:

```text
trust-core/rust
canonical_value_v0.rs
labs/rust-trust-core
cargo run --manifest-path labs/rust-trust-core/Cargo.toml
```

Use repository-local filesystem/git utilities already available to Node tests; do not add dependencies.

- [ ] **Step 2: Prove the test can fail.**

Before accepting GREEN, temporarily include a synthetic in-memory source string containing `trust-core/rust` through the same marker-check helper and assert that the helper reports the marker. This is the RED proof for the guard logic and must not modify supported source.

- [ ] **Step 3: Run the focused isolation test against the real tree.**

Expected: PASS because Stage 3 adds no supported runtime reference.

- [ ] **Step 4: Commit with `test: enforce Rust candidate runtime isolation`.**

---

### Task 4: Govern Stage 3 CI and documentation surfaces

**Files:**
- Modify: `.github/workflows/rust-trust-core-lab.yml`
- Modify: `mesh/src/check-docs.mjs`
- Modify: `labs/rust-trust-core/EXPERIMENT.md`
- Modify: `docs/MASTER-TODO-SOVEREIGN-HOST-DEPLOYMENT.md`

**Interfaces:**
- Consumes: approved Stage 3 spec/plan and implemented candidate source.
- Produces: exact CI triggering, canonical-doc registration, experiment evidence/non-claims, and Stage 3 planning status.

- [ ] **Step 1: Register both Stage 3 documents in `CANONICAL_DOCUMENTS`.**

Add exactly:

```text
docs/superpowers/specs/2026-09-06-rust-trust-core-stage3-source-promotion-design.md
docs/superpowers/plans/2026-09-06-rust-trust-core-stage3-source-promotion.md
```

- [ ] **Step 2: Extend the Rust laboratory workflow path filters.**

Add:

```text
trust-core/rust/**
mesh/test/rust-trust-core-candidate-source-boundary.test.mjs
mesh/test/rust-trust-core-runtime-isolation.test.mjs
```

and the two Stage 3 docs. Keep the existing Node oracle, rustfmt, Clippy, and locked Rust test commands unchanged.

- [ ] **Step 3: Extend `EXPERIMENT.md`.**

Record:

- Stage 3 source promotion path `trust-core/rust/canonical_value_v0.rs`;
- Node remains authoritative;
- laboratory remains the only Rust compiler/test surface;
- no standalone Cargo manifest/binary/service/runtime consumer exists;
- source rollback is moving the module back under the laboratory and deleting the candidate classification;
- Stage 2 exact differential evidence remains mandatory;
- Stage 4 is not authorized by Stage 3 completion.

- [ ] **Step 4: Mark Stage 3 complete in the sovereign-host queue only after verification evidence is green.**

Change only the Stage 3 checkbox from `[ ]` to `[x]` and preserve the existing no-runtime-authority wording.

- [ ] **Step 5: Run canonical documentation verification and the focused Node tests.**

Use the repository's existing clean-kernel/doc verification command or test target that exercises `CANONICAL_DOCUMENTS` plus the three Rust source-boundary/isolation tests.

- [ ] **Step 6: Commit with `docs: record Rust trust-core Stage 3 source promotion`.**

---

### Task 5: Exact-head verification and PR gate

**Files:**
- PR metadata only after verification

**Interfaces:**
- Produces: reviewable Stage 3 PR with exact current-main merge-result evidence and no production-authority claim.

- [ ] **Step 1: Compare the Stage 3 branch against current `main`.**

Require no change to:

```text
mesh/config/capabilities.json
mesh/src/gateway/**
mesh/src/hypervisor/**
mesh/src/sandbox/**
mesh/src/grid/**
mesh/compose.production.yml
mesh/package.json
mesh/package-lock.json
package.json
package-lock.json
```

except repository-governance files explicitly named in this plan.

- [ ] **Step 2: Run/require exact-head Stage 3 verification.**

Require:

- Node source-boundary tests GREEN;
- runtime-isolation test GREEN;
- Node oracle tests GREEN;
- Rust `1.85.0` verified;
- rustfmt GREEN;
- Clippy `-D warnings` GREEN;
- full locked Rust suite GREEN;
- zero third-party Rust dependencies;
- unsafe code forbidden.

- [ ] **Step 3: Open the Stage 3 PR as draft or review-ready only according to actual verification state.**

PR body must state:

- source promotion without authority promotion;
- exact candidate source path;
- Node remains authoritative;
- laboratory remains sole Rust build surface;
- no new manifest/binary/service/FFI/runtime/capability;
- TDD RED/GREEN evidence;
- rollback path;
- Stage 4 not authorized.

- [ ] **Step 4: Require protected PR merge-result checks against current `main`.**

Require successful:

- Rust Trust-Core Laboratory;
- Clean Kernel `verify`;
- Clean Kernel `container`;
- Node 22 compatibility;
- Windows compatibility;
- macOS Apple Silicon;
- macOS Intel;
- required CodeQL checks if triggered by branch protection.

- [ ] **Step 5: Review inline feedback and resolve only with evidence.**

Any technically valid review finding must receive its own RED/GREEN regression before merge.

- [ ] **Step 6: Merge only if the verified head and current `main` are unchanged and all required checks/reviews are clean.**

Pin the exact feature head SHA in the merge call. If `main` advances, require a fresh current-main merge-result gate.

## Plan self-review

- **Spec coverage:** every Stage 3 design requirement maps to a task: exact source-only promotion, no package/runtime authority, laboratory direct compilation, separate release classification, arbitrary-Rust rejection, supported-runtime non-reference invariant, unchanged differential evidence, CI/docs governance, rollback, and protected merge-result verification.
- **Placeholder scan:** no TBD/TODO/unspecified implementation actions remain.
- **Type consistency:** the promoted module exports exactly the Stage 2 API already consumed by tests; the laboratory re-export names match the existing API.
- **Scope check:** no cryptography, identity, consent, policy, persistence, networking, Gateway/effect integration, standalone Cargo package, FFI, WASM, or production call-site migration is included.
