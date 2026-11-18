# Rust Trust-Core Migration Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish an isolated, disabled-by-default Rust laboratory that tests typed, deny-dominant authority semantics without changing the supported Node.js trust boundary.

**Architecture:** Keep the current Node kernel authoritative and place all Rust work under `labs/rust-trust-core/`. Use a dedicated CI workflow and language-neutral conformance vectors; do not register a capability, add a Gateway route, or import the lab from `mesh/`.

**Tech Stack:** Rust 1.85.0 / edition 2024, standard library only, GitHub Actions, existing Node.js protected CI.

**Spec:** `docs/superpowers/specs/2026-09-06-rust-trust-core-migration-foundation-design.md`

## Global Constraints

- The supported Node.js kernel remains authoritative throughout this plan.
- The Rust laboratory remains disabled by default and unreachable from Gateway -> Hypervisor -> Sandbox -> Grid.
- No third-party Rust crate dependencies are allowed in this slice.
- Rust source must use `#![forbid(unsafe_code)]`.
- No capability-registry entry or production-promotion claim is added.
- All laboratory test data is synthetic and contains no user data or credentials.
- The dedicated workflow must use a pinned `actions/checkout` commit and read-only repository permissions.

---

### Task 1: Create the isolated laboratory contract and CI boundary

**Files:**
- Create: `labs/rust-trust-core/EXPERIMENT.md`
- Create: `labs/rust-trust-core/Cargo.toml`
- Create: `labs/rust-trust-core/Cargo.lock`
- Create: `labs/rust-trust-core/rust-toolchain.toml`
- Create: `labs/rust-trust-core/fixtures/authority-vectors.v0.tsv`
- Create: `.github/workflows/rust-trust-core-lab.yml`

**Interfaces:**
- Consumes: repository laboratory requirements from `CONTRIBUTING.md` and `docs/rebuild/REQUIREMENTS.md`.
- Produces: a pinned, isolated Rust test environment and shared v0 conformance vectors.

- [ ] **Step 1: Write the experiment manifest**

Record hypothesis, threat model, assumptions, synthetic data, failure criteria, halt procedure, reproducibility, isolation boundary, and explicit non-claims.

- [ ] **Step 2: Create a zero-dependency Cargo package**

Use:

```toml
[package]
name = "axiom-trust-core-lab"
version = "0.0.1"
edition = "2024"
rust-version = "1.85"
publish = false
license = "Apache-2.0"

[lib]
path = "src/lib.rs"

[dependencies]
```

- [ ] **Step 3: Pin the toolchain**

Use Rust `1.85.0`, profile `minimal`, and components `clippy` and `rustfmt`.

- [ ] **Step 4: Add v0 authority vectors**

The TSV columns are:

```text
case_id principal_verified capability_authorized consent_required consent_valid budget_required budget_remaining expected
```

Include at least: fully authorized allow, unverified principal deny, unauthorized capability deny, missing required consent deny, exhausted required budget deny, and irrelevant consent/budget values when not required.

- [ ] **Step 5: Add dedicated CI**

The workflow must:

```text
checkout pinned source
rustc --version
cargo fmt --check
cargo clippy --all-targets -- -D warnings
cargo test --locked
```

and trigger only for the Rust laboratory, its workflow, and the migration spec/plan.

- [ ] **Step 6: Commit**

Commit message:

```text
build: establish isolated Rust trust-core lab
```

---

### Task 2: RED — add conformance tests before authority implementation

**Files:**
- Create: `labs/rust-trust-core/src/lib.rs`
- Create: `labs/rust-trust-core/tests/authority_vectors.rs`

**Interfaces:**
- Consumes: `fixtures/authority-vectors.v0.tsv`.
- Produces: tests requiring `AuthorityEvidence`, `AuthorityGrant`, `DenyReason`, and `evaluate_authority` from the library.

- [ ] **Step 1: Create the minimal library shell**

The file contains only:

```rust
#![forbid(unsafe_code)]
```

- [ ] **Step 2: Write the failing conformance test**

The test imports the not-yet-implemented public API, parses the TSV with the standard library, evaluates every row, and compares allow/deny with `expected`.

- [ ] **Step 3: Push and verify RED in GitHub Actions**

Expected result: the Rust laboratory job fails to compile because the authority API is intentionally missing. The failure must be attributable to missing symbols rather than workflow/toolchain/configuration errors.

- [ ] **Step 4: Commit**

Commit message:

```text
test: define Rust trust-core authority vectors
```

---

### Task 3: GREEN — implement the minimum typed deny-dominant authority gate

**Files:**
- Modify: `labs/rust-trust-core/src/lib.rs`
- Test: `labs/rust-trust-core/tests/authority_vectors.rs`

**Interfaces:**
- Consumes: raw evidence structs from callers.
- Produces:
  - `AuthorityEvidence<'a>`
  - `PrincipalEvidence<'a>`
  - `CapabilityEvidence<'a>`
  - `ConsentEvidence`
  - `EffectBudgetEvidence`
  - `DenyReason`
  - `AuthorityGrant<'a>` with private fields and no public constructor
  - `evaluate_authority(AuthorityEvidence<'a>) -> Result<AuthorityGrant<'a>, DenyReason>`

- [ ] **Step 1: Implement the minimum evidence types**

Use borrowed subject/capability identifiers and booleans/numeric budget evidence only. Do not add serialization, networking, cryptography, persistence, policy loading, or runtime integration.

- [ ] **Step 2: Implement deny-dominant evaluation**

The exact order is:

```text
principal not verified -> UnverifiedPrincipal
capability not authorized -> UnauthorizedCapability
required consent invalid -> MissingRequiredConsent
required budget remaining == 0 -> ExhaustedEffectBudget
otherwise -> AuthorityGrant
```

- [ ] **Step 3: Keep AuthorityGrant construction private**

Only `evaluate_authority` may create the grant. Expose read-only getters for subject and capability so tests can confirm binding without enabling caller-side construction.

- [ ] **Step 4: Push and verify GREEN**

Expected:

```text
cargo fmt --check: PASS
cargo clippy --all-targets -- -D warnings: PASS
cargo test --locked: PASS
```

- [ ] **Step 5: Commit**

Commit message:

```text
feat: add typed deny-dominant Rust authority gate
```

---

### Task 4: Record the laboratory in current planning surfaces and verify the PR

**Files:**
- Modify: `docs/ROADMAP.md`
- Modify: `docs/MASTER-TODO-SOVEREIGN-HOST-DEPLOYMENT.md`
- Verify: no changes to `mesh/config/capabilities.json`

**Interfaces:**
- Consumes: completed laboratory evidence.
- Produces: an explicit staged migration roadmap with Node remaining authoritative.

- [ ] **Step 1: Add the laboratory as an evidence-gated sovereign-host work item**

State that Stage 1 is laboratory-only and that future Node-to-Rust replacement requires differential equivalence, failure-path, recovery, rollback, and independent-review evidence.

- [ ] **Step 2: Preserve non-claims**

State explicitly that Rust is not a supported production kernel, the Node kernel is not deprecated, and no capability is enabled by the laboratory.

- [ ] **Step 3: Verify protected checks**

On the pull request, require the existing protected checks plus the dedicated Rust laboratory job to be green before considering the foundation ready for merge.

- [ ] **Step 4: Compare the branch against `main`**

Confirm that changes are limited to the approved migration foundation and do not modify supported runtime behavior.

- [ ] **Step 5: Commit**

Commit message:

```text
docs: stage Rust trust-core migration programme
```

## Plan self-review

- Spec coverage: isolation, no authority widening, typed grant experiment, deny-dominant behavior, zero dependencies, unsafe prohibition, CI, rollback, and staged evidence gates are each mapped to tasks.
- Placeholder scan: no implementation placeholders are required for this foundation slice.
- Type consistency: Task 2 imports exactly the API defined in Task 3.
- Scope: the plan intentionally stops before cryptography, persistence, Gateway integration, or replacement of Node behavior.
