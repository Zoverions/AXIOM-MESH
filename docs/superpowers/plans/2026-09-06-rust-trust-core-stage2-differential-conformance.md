# Rust Trust-Core Stage 2 Differential Conformance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove byte-for-byte equivalence between the supported Node `canonicalJson` implementation and a laboratory-only Rust candidate over the frozen `canonical-value-v0` domain without moving production authority.

**Architecture:** Keep Node authoritative. A laboratory Node adapter imports the exact supported `mesh/src/lib/canonical.mjs`, decodes shared TSV vectors, and emits canonical bytes. Rust decodes the same restricted grammar, produces candidate bytes with only the standard library, invokes the Node adapter as a subprocess, and fails on any mismatch. JavaScript-specific prototype/symbol/descriptor/sparse-array defenses remain outside v0.

**Tech Stack:** Node.js 24.18.0 oracle adapter, Rust 1.85.0 / edition 2024, Rust standard library only, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-06-rust-trust-core-stage2-differential-conformance-design.md`

## Global Constraints

- The supported Node.js kernel remains authoritative.
- Rust remains laboratory-only and non-authoritative.
- Rust `1.85.0` remains pinned.
- `#![forbid(unsafe_code)]` remains required.
- Zero third-party Rust dependencies remain required.
- No capability-registry entry, Gateway route, runtime import, production credential/state access, listener, egress, or production promotion.
- The Node adapter must import the repository `canonicalJson` implementation directly.
- Differential comparison is byte-for-byte with no post-comparison normalization.
- `safe_integer` is limited to `-9007199254740991..9007199254740991`.
- v0 strings are printable ASCII U+0020..U+007E excluding `"` and `\\`.
- v0 object keys match `[A-Za-z0-9._-]{1,64}` and must be unique.
- Nested arrays/objects, floating point, JSON escaping, and JavaScript-specific object-state defenses are outside v0.

---

### Task 1: Register Stage 2 planning surfaces and extend the laboratory CI trigger

**Files:**
- Modify: `mesh/src/check-docs.mjs`
- Modify: `.github/workflows/rust-trust-core-lab.yml`

**Interfaces:**
- Consumes: approved Stage 2 design and this plan.
- Produces: canonical documentation registration and exact CI triggering for Stage 2 changes.

- [ ] **Step 1: Add the Stage 2 design and plan to `CANONICAL_DOCUMENTS`.**
- [ ] **Step 2: Extend Rust laboratory workflow paths to include both Stage 2 documents and the future Node adapter path.**
- [ ] **Step 3: Pin Node `24.18.0` in the laboratory workflow using the repository's already-pinned `actions/setup-node` commit.**
- [ ] **Step 4: Add a Node-oracle test command before Rust checks.**
- [ ] **Step 5: Commit with `build: govern Stage 2 differential conformance`**.

---

### Task 2: RED 1 — freeze vectors and require the missing Rust candidate

**Files:**
- Create: `labs/rust-trust-core/fixtures/canonical-value-v0.tsv`
- Create: `labs/rust-trust-core/node/canonical_oracle.mjs`
- Create: `labs/rust-trust-core/node/canonical_oracle.test.mjs`
- Create: `labs/rust-trust-core/tests/canonical_differential.rs`

**Interfaces:**
- Node adapter CLI: `node labs/rust-trust-core/node/canonical_oracle.mjs <fixture-path>` -> UTF-8 lines `case_id<TAB>canonical_json`.
- Rust candidate API required by the test but intentionally absent in RED: `parse_canonical_vector_row(&str) -> Result<CanonicalCase, VectorError>` and `canonicalize_case(&CanonicalCase) -> String`.

- [ ] **Step 1: Freeze at least 14 valid vectors covering null, booleans, positive/negative/boundary safe integers, negative zero, ASCII strings, ordered scalar arrays, and objects whose source order differs from canonical key order.**
- [ ] **Step 2: Implement only the Node oracle adapter and its valid-vector decoder. It must import `canonicalJson` from `../../../mesh/src/lib/canonical.mjs`.**
- [ ] **Step 3: Add Node tests proving the adapter emits the exact supported Node bytes for representative cases.**
- [ ] **Step 4: Add the Rust differential integration test importing the not-yet-implemented Rust candidate API, invoking the real Node adapter with `std::process::Command`, and comparing every output byte.**
- [ ] **Step 5: Verify RED in CI: Node adapter tests pass; Rust compile/Clippy fails specifically because the canonical candidate symbols are absent.**
- [ ] **Step 6: Commit with `test: define Stage 2 canonical differential vectors`.**

---

### Task 3: GREEN 1 — implement the minimum zero-dependency Rust candidate

**Files:**
- Modify: `labs/rust-trust-core/src/lib.rs`
- Test: `labs/rust-trust-core/tests/canonical_differential.rs`

**Interfaces:**
- Produces:
  - `CanonicalScalar`
  - `CanonicalCase`
  - `VectorError`
  - `parse_canonical_vector_row(&str) -> Result<CanonicalCase, VectorError>`
  - `canonicalize_case(&CanonicalCase) -> String`

- [ ] **Step 1: Add exact v0 scalar and case enums without serialization, networking, cryptography, persistence, or runtime integration.**
- [ ] **Step 2: Implement fail-closed parsing for valid v0 rows only.**
- [ ] **Step 3: Implement canonical byte writing: `null`, booleans, safe integers, negative zero as `0`, admitted ASCII strings, arrays preserving element order, and objects sorting admitted ASCII keys.**
- [ ] **Step 4: Run `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, and `cargo test --locked`; require exact Node-vs-Rust matches.**
- [ ] **Step 5: Commit with `feat: add Stage 2 canonical Rust candidate`.**

---

### Task 4: RED/GREEN 2 — prove the comparison layer detects real byte divergence

**Files:**
- Modify: `labs/rust-trust-core/tests/canonical_differential.rs`

**Interfaces:**
- Comparison helper: `assert_exact_match(case_id: &str, node: &str, rust: &str)` used by the real differential path.

- [ ] **Step 1: Add a test that feeds a deliberately altered Rust byte string into the same comparison helper used by the real path and asserts that it panics/fails with the case id and both byte strings.**
- [ ] **Step 2: Verify the new mismatch-detection test fails before the helper exists.**
- [ ] **Step 3: Implement the minimum comparison helper and route the real differential test through it.**
- [ ] **Step 4: Run the full Rust laboratory suite and require GREEN.**
- [ ] **Step 5: Commit with `test: prove Stage 2 differential mismatch detection`.**

---

### Task 5: RED/GREEN 3 — fail closed on malformed vector grammar in both adapters

**Files:**
- Create: `labs/rust-trust-core/fixtures/canonical-value-v0-invalid.tsv`
- Modify: `labs/rust-trust-core/node/canonical_oracle.mjs`
- Modify: `labs/rust-trust-core/node/canonical_oracle.test.mjs`
- Modify: `labs/rust-trust-core/tests/canonical_differential.rs`

**Interfaces:**
- Invalid fixture columns: `case_id<TAB>row` where `row` is one complete malformed vector row encoded as a test string.
- Both decoders must reject every invalid case.

- [ ] **Step 1: Add invalid cases for unknown kind, duplicate case id, invalid boolean, integer above/below safe range, invalid negative-zero payload, disallowed ASCII string character, malformed array token, invalid object key, duplicate object key, nested/unsupported token, and wrong TSV column count.**
- [ ] **Step 2: Add Node tests that require rejection of every invalid case.**
- [ ] **Step 3: Add Rust tests that require rejection of every invalid case.**
- [ ] **Step 4: Verify RED for any currently accepted malformed case.**
- [ ] **Step 5: Add only the missing validation required for both adapters to reject all invalid cases.**
- [ ] **Step 6: Run Node oracle tests plus full Rust laboratory checks and require GREEN.**
- [ ] **Step 7: Commit with `test: fail closed on malformed canonical vectors`.**

---

### Task 6: Record Stage 2 evidence boundary and exact-head verification

**Files:**
- Modify: `labs/rust-trust-core/EXPERIMENT.md`
- Modify: `docs/MASTER-TODO-SOVEREIGN-HOST-DEPLOYMENT.md`
- Modify: PR #1548 description/status only after verification.

**Interfaces:**
- Produces an explicit evidence statement with exact commit, Node/Rust versions, fixture version, valid-vector count, malformed-rejection count, dependency count, unsafe state, and non-claims.

- [ ] **Step 1: Extend the experiment manifest with the Stage 2 differential hypothesis and non-claims.**
- [ ] **Step 2: Mark Stage 2 v0 complete in the sovereign-host planning surface only after exact differential evidence is green.**
- [ ] **Step 3: Confirm `mesh/config/capabilities.json`, Gateway, Hypervisor, Sandbox, Grid, production compose/runtime files, and production dependency manifests are unchanged.**
- [ ] **Step 4: Require exact-head `Rust Trust-Core Laboratory`, `Clean Kernel`, container, Node 22, Windows, and both macOS jobs to pass.**
- [ ] **Step 5: Update PR #1548 from design-only wording to implemented evidence and mark ready for review only after every gate is green.**

## Plan self-review

- Spec coverage: every Stage 2 design requirement is mapped to a task, including exact Node oracle use, restricted grammar, zero dependencies, unsafe prohibition, mismatch proof, malformed rejection, CI, evidence, non-claims, and authority isolation.
- Placeholder scan: no TBD/TODO/unspecified implementation steps remain.
- Type consistency: the Rust APIs named in the RED task are exactly the APIs implemented in GREEN 1; the comparison helper is introduced only in Task 4.
- Scope: no cryptography, digest replacement, production call-site migration, nested JSON parser, floating-point formatting, or JavaScript runtime-object equivalence is included.
