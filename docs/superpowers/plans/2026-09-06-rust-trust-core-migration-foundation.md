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

---

# Stage 5B Authority-Context Validation Implementation Amendment

> **Execution gate:** This amendment may be executed only after the Stage 5B design/plan review is approved. Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` task-by-task. Do not carry implementation authority from Stage 5A.

**Goal:** Add a laboratory-only Rust candidate that independently validates the frozen structural shape of a bounded synthetic authority-composition context and prove exact structural-admission parity with the supported Node evaluator without migrating an authorization decision.

**Architecture:** Use a restricted JSONL evidence grammar under `labs/rust-trust-core/`. Rust independently parses and validates structural shape using the standard library only. A Node laboratory oracle parses the same rows, invokes the real supported `evaluateAuthorityComposition(...)` at a fixed `now`, and emits only `case_id` plus `structurally_admitted`; it discards `allow`, reasons, `authority_effect`, and every other authority-bearing output.

**Spec:** `docs/superpowers/specs/2026-09-06-rust-trust-core-migration-foundation-design.md` sections 12–27 and `labs/rust-trust-core/STAGE5B-AUTHORITY-CONTEXT-VALIDATION.design.txt`.

## Stage 5B Global Constraints

- **Stage 5A evidence is admissible at Stage 5B; Stage 5A authority is not.**
- Selected target: structural validation only.
- Mandatory distinction: `structurally_admitted != authorized`.
- Node remains authoritative.
- Rust may not return `allow`, denial reasons, `authority_effect`, a grant, capability, consent/budget/credential decision, receipt, or effect permission.
- No supported Node runtime call site imports or invokes Rust.
- `trust-core/rust/canonical_value_v0.rs`, `labs/rust-trust-core/src/intent_attenuation.rs`, and `mesh/src/lib/authority-composition-guard.mjs` remain unchanged unless a separate correction/design gate opens.
- Rust dependencies remain empty; `#![forbid(unsafe_code)]` remains active.
- No production Cargo manifest, Rust binary, FFI, WASM, IPC, runtime subprocess integration, listener, egress, capability registration, Gateway route, credential/state access, or external effect is introduced.
- Fixed Node oracle time: `2030-01-01T00:00:00.000Z`.
- Stage 5B fixture strings are printable ASCII U+0020–U+007E. JSON string escapes are limited to `\"` and `\\`. Numbers, `\u`, control-character escapes, raw control characters, and duplicate object keys fail closed at the laboratory transport boundary.
- The printable-ASCII rule is an evidence-transport restriction, not a production behavior claim.
- Any Node/Rust structural-admission disagreement halts Stage 5B.

## Stage 5B File Map

**Create:**
- `labs/rust-trust-core/fixtures/authority-context-v0.jsonl`
- `labs/rust-trust-core/fixtures/authority-context-v0-invalid.jsonl`
- `labs/rust-trust-core/src/authority_context.rs`
- `labs/rust-trust-core/node/authority_context_oracle.mjs`
- `labs/rust-trust-core/node/authority_context_oracle.test.mjs`
- `labs/rust-trust-core/tests/authority_context_differential.rs`

**Modify:**
- `labs/rust-trust-core/src/lib.rs`
- `.github/workflows/rust-trust-core-lab.yml`
- `labs/rust-trust-core/EXPERIMENT.md`

### Stage 5B Task 1: Freeze hand-curated evidence and establish RED

**Files:**
- Create: `labs/rust-trust-core/fixtures/authority-context-v0.jsonl`
- Create: `labs/rust-trust-core/fixtures/authority-context-v0-invalid.jsonl`
- Create: `labs/rust-trust-core/tests/authority_context_differential.rs`

**Interfaces:**
- Produces the required Rust API names: `AuthorityContextCase`, `AuthorityContextError`, `parse_authority_context_line`, `parse_authority_context_fixture`, `validate_authority_context`.

- [ ] **Step 1: Create the valid JSONL fixture**

The first line is:

```json
{"case_id":"baseline_allow","grant":{"verified":true,"grant_id":"grant:baseline","issuer":"gateway","principal_id":"principal:test","resources":["resource:a"],"actions":["read"],"purposes":["research"],"destinations":["local"],"expires_at":"2099-01-01T00:00:00.000Z","policy_digest":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"},"intent":{"bound":true,"actions":["read"],"purposes":["research"],"destinations":["local"],"resources":["resource:a"]},"request":{"principal_id":"principal:test","resource":"resource:a","action":"read","purpose":"research","destination":"local","protocol":"local","causal_scope_id":"scope:1","policy_digest":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"},"history":[],"restrictions":[]}
```

Add these parse-valid, structurally valid cases:

```text
expired_but_structural
principal_mismatch_but_structural
policy_mismatch_but_structural
request_outside_grant_but_structural
intent_widens_but_structural
composition_blocked_but_structural
empty_scopes_structural
multi_history_structural
multi_restriction_structural
quote_backslash_ascii_structural
```

`expired_but_structural` uses `2029-12-31T23:59:59.999Z`. `composition_blocked_but_structural` uses history actions `prepare`, `approve`, request action `execute`, and one restriction `ordered_actions: ["prepare","approve","execute"]` in the same causal scope.

- [ ] **Step 2: Create the parse-valid structurally invalid fixture**

Include one-defect cases with these exact IDs:

```text
missing_top_level_history
extra_top_level_field
grant_not_object
grant_verified_false
grant_missing_id
grant_extra_field
grant_bad_id
grant_bad_digest
grant_bad_timestamp
grant_unsorted_actions
grant_duplicate_actions
grant_empty_set_member
intent_bound_false
intent_extra_field
request_missing_protocol
request_bad_policy_digest
history_not_array
history_entry_missing_field
history_entry_extra_field
restriction_not_array
restriction_missing_id
restriction_one_action
restriction_seventeen_actions
```

`grant_verified_false` is represented as a literal JSON boolean `false`; do not encode a mutation instruction.

- [ ] **Step 3: Add the initial Rust RED test**

```rust
use axiom_trust_core_lab::{parse_authority_context_fixture, validate_authority_context};
use std::path::PathBuf;

fn manifest_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
}

#[test]
fn stage5b_valid_fixture_requires_structural_validator() {
    let text = std::fs::read_to_string(
        manifest_dir().join("fixtures/authority-context-v0.jsonl"),
    )
    .expect("Stage 5B fixture must be readable");
    let cases = parse_authority_context_fixture(&text)
        .expect("Stage 5B valid fixture must parse");
    assert!(cases.len() >= 10);
    for case in &cases {
        validate_authority_context(case)
            .unwrap_or_else(|error| panic!("{}: {error}", case.case_id()));
    }
}
```

- [ ] **Step 4: Run RED**

```bash
cargo test --manifest-path labs/rust-trust-core/Cargo.toml --locked --test authority_context_differential stage5b_valid_fixture_requires_structural_validator
```

Expected: compile failure for the missing Stage 5B imports only.

- [ ] **Step 5: Commit RED**

```bash
git add labs/rust-trust-core/fixtures/authority-context-v0.jsonl \
  labs/rust-trust-core/fixtures/authority-context-v0-invalid.jsonl \
  labs/rust-trust-core/tests/authority_context_differential.rs
git commit -m "test: define Rust Stage 5B authority-context gate"
```

### Stage 5B Task 2: Implement the zero-dependency restricted JSON parser and structural validator

**Files:**
- Create: `labs/rust-trust-core/src/authority_context.rs`
- Modify: `labs/rust-trust-core/src/lib.rs`
- Test: `labs/rust-trust-core/tests/authority_context_differential.rs`

**Interfaces:**

```rust
pub struct AuthorityContextCase;
pub struct AuthorityContextError;
pub fn parse_authority_context_line(line: &str) -> Result<AuthorityContextCase, AuthorityContextError>;
pub fn parse_authority_context_fixture(text: &str) -> Result<Vec<AuthorityContextCase>, AuthorityContextError>;
pub fn validate_authority_context(case: &AuthorityContextCase) -> Result<(), AuthorityContextError>;
impl AuthorityContextCase { pub fn case_id(&self) -> &str; }
```

`Result<(), AuthorityContextError>` is deliberate: structural success does not mint a token.

- [ ] **Step 1: Add raw restricted-JSON types and parser tests**

```rust
#[derive(Debug, Clone, PartialEq, Eq)]
enum JsonValue {
    Object(Vec<(String, JsonValue)>),
    Array(Vec<JsonValue>),
    String(String),
    Bool(bool),
    Null,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AuthorityContextError {
    message: String,
}
```

Implement `Display` and `Error`. Add tests:

```rust
#[test]
fn restricted_json_rejects_number_values() {
    assert!(parse_json("{\"x\":1}").is_err());
}

#[test]
fn restricted_json_rejects_duplicate_object_keys() {
    assert!(parse_json("{\"x\":true,\"x\":false}").is_err());
}

#[test]
fn restricted_json_accepts_quote_and_backslash_escapes() {
    assert!(parse_json(r#"{"x":"quote:\" slash:\\"}"#).is_ok());
}
```

The parser rejects trailing data, numbers, unsupported escapes, raw controls, non-printable/non-ASCII strings, and duplicate object keys.

- [ ] **Step 2: Run parser tests**

```bash
cargo test --manifest-path labs/rust-trust-core/Cargo.toml --locked authority_context::tests::restricted_json
```

Expected: PASS.

- [ ] **Step 3: Implement exact structural helpers**

Use these signatures:

```rust
fn exact_object<'a>(value: &'a JsonValue, fields: &[&str], label: &str)
    -> Result<&'a [(String, JsonValue)], AuthorityContextError>;
fn object_field<'a>(object: &'a [(String, JsonValue)], key: &str)
    -> Result<&'a JsonValue, AuthorityContextError>;
fn identifier(value: &JsonValue, label: &str) -> Result<&str, AuthorityContextError>;
fn digest(value: &JsonValue, label: &str) -> Result<&str, AuthorityContextError>;
fn canonical_utc_timestamp(value: &JsonValue, label: &str)
    -> Result<&str, AuthorityContextError>;
fn sorted_unique_ascii_set(value: &JsonValue, label: &str, max_items: usize)
    -> Result<(), AuthorityContextError>;
```

`identifier` implements `[A-Za-z0-9][A-Za-z0-9_.:/-]{0,191}`. `digest` accepts exactly 64 lowercase hex characters. Timestamp accepts exactly `YYYY-MM-DDTHH:MM:SS.mmmZ` and validates Gregorian calendar boundaries with:

```rust
fn leap_year(year: u32) -> bool {
    year % 4 == 0 && (year % 100 != 0 || year % 400 == 0)
}
```

- [ ] **Step 4: Implement the Stage 5B raw case**

```rust
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AuthorityContextCase {
    case_id: String,
    context: JsonValue,
}

impl AuthorityContextCase {
    pub fn case_id(&self) -> &str { &self.case_id }
}
```

`parse_authority_context_line` requires exact top-level fields `case_id`, `grant`, `intent`, `request`, `history`, `restrictions`; it validates `case_id` and preserves the other five raw values. Fixture parsing rejects repeated case IDs.

- [ ] **Step 5: Implement structural validators without authorization semantics**

Create:

```rust
fn validate_grant(value: &JsonValue) -> Result<(), AuthorityContextError>;
fn validate_intent(value: &JsonValue) -> Result<(), AuthorityContextError>;
fn validate_request(value: &JsonValue) -> Result<(), AuthorityContextError>;
fn validate_history(value: &JsonValue) -> Result<(), AuthorityContextError>;
fn validate_restrictions(value: &JsonValue) -> Result<(), AuthorityContextError>;
```

Grant exact fields are `verified`, `grant_id`, `issuer`, `principal_id`, `resources`, `actions`, `purposes`, `destinations`, `expires_at`, `policy_digest`. `verified` must be literal `true`.

Intent exact fields are `bound`, `actions`, `purposes`, `destinations`, `resources`. `bound` must be literal `true`.

Request exact fields are `principal_id`, `resource`, `action`, `purpose`, `destination`, `protocol`, `causal_scope_id`, `policy_digest`.

History: array <=4096; exact entry fields `causal_scope_id`, `action`, `resource`, `purpose`, `destination`; all are IDs.

Restrictions: array <=256; exact fields `id`, `ordered_actions`; ordered actions contain 2..=16 IDs.

The public validator ends with `Ok(())` after these five helpers. It does **not** compare principals/policies/scope membership, expiry to time, intent attenuation, history subsequences, or any other authorization semantic.

- [ ] **Step 6: Export only the Stage 5B public API**

```rust
mod authority_context;
pub use authority_context::{
    AuthorityContextCase,
    AuthorityContextError,
    parse_authority_context_fixture,
    parse_authority_context_line,
    validate_authority_context,
};
```

Do not export `JsonValue` or parser helpers.

- [ ] **Step 7: Verify Rust GREEN**

```bash
cargo fmt --manifest-path labs/rust-trust-core/Cargo.toml --all -- --check
cargo clippy --manifest-path labs/rust-trust-core/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path labs/rust-trust-core/Cargo.toml --locked
```

Expected: all inherited Stage 1–5A tests and the Stage 5B valid-fixture test pass.

- [ ] **Step 8: Commit**

```bash
git add labs/rust-trust-core/src/authority_context.rs \
  labs/rust-trust-core/src/lib.rs \
  labs/rust-trust-core/tests/authority_context_differential.rs
git commit -m "feat: add laboratory Stage 5B structural validator"
```

### Stage 5B Task 3: Add the real Node structural-admission oracle

**Files:**
- Create: `labs/rust-trust-core/node/authority_context_oracle.mjs`
- Create: `labs/rust-trust-core/node/authority_context_oracle.test.mjs`

**Interfaces:** stdout is exactly `case_id<TAB>true|false` per row; no third column.

- [ ] **Step 1: Write Node RED tests**

Create tests that import `parseAuthorityContextFixture`, `structurallyAdmitAuthorityContext`, and `runAuthorityContextFixtureText`. Use full test bodies, including:

```js
test('Stage 5B oracle output has exactly two columns', () => {
  const output = runAuthorityContextFixtureText(validFixtureText);
  for (const line of output.split('\n')) {
    assert.equal(line.split('\t').length, 2);
  }
});
```

Add a semantic-separation test that independently calls the supported evaluator on `expired_but_structural`, asserts `allow === false`, then asserts `structurallyAdmitAuthorityContext(...)` returns `{ caseId: 'expired_but_structural', structurallyAdmitted: true }`.

- [ ] **Step 2: Run Node RED**

```bash
node --test labs/rust-trust-core/node/authority_context_oracle.test.mjs
```

Expected: module-not-found failure for `authority_context_oracle.mjs`.

- [ ] **Step 3: Implement the minimum oracle**

```js
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { evaluateAuthorityComposition } from '../../../mesh/src/lib/authority-composition-guard.mjs';
import { ValidationError } from '../../../mesh/src/lib/canonical.mjs';

export const STAGE5B_NOW = Object.freeze(new Date('2030-01-01T00:00:00.000Z'));

export function structurallyAdmitAuthorityContext(candidate) {
  const { case_id: caseId, grant, intent, request, history, restrictions } = candidate;
  try {
    evaluateAuthorityComposition({ grant, intent, request, history, restrictions, now: STAGE5B_NOW });
    return Object.freeze({ caseId, structurallyAdmitted: true });
  } catch (error) {
    if (error instanceof ValidationError) {
      return Object.freeze({ caseId, structurallyAdmitted: false });
    }
    throw error;
  }
}
```

`parseAuthorityContextFixture` enforces the restricted printable-ASCII JSONL transport before `JSON.parse`, rejects numbers/unsupported escapes/duplicate case IDs, and does not sort, deduplicate, truncate, or repair nested values.

`runAuthorityContextFixtureText` emits only:

```js
return parseAuthorityContextFixture(text)
  .map(candidate => {
    const result = structurallyAdmitAuthorityContext(candidate);
    return `${result.caseId}\t${result.structurallyAdmitted}`;
  })
  .join('\n');
```

Support path and `-` stdin using chunk collection and one final `join('')`.

- [ ] **Step 4: Run Node GREEN**

```bash
node --test labs/rust-trust-core/node/authority_context_oracle.test.mjs
```

Expected: PASS, including semantic-denial/structural-admission separation.

- [ ] **Step 5: Commit**

```bash
git add labs/rust-trust-core/node/authority_context_oracle.mjs \
  labs/rust-trust-core/node/authority_context_oracle.test.mjs
git commit -m "test: add real Node Stage 5B structural oracle"
```

### Stage 5B Task 4: Complete hand-curated Node↔Rust differential evidence

**Files:**
- Modify: `labs/rust-trust-core/tests/authority_context_differential.rs`

**Interfaces:** consumes two-column Node output and Rust structural validation result.

- [ ] **Step 1: Add duplicate-aware Node output parser**

```rust
fn parse_node_outputs(stdout: &str) -> Result<std::collections::BTreeMap<String, bool>, String> {
    let mut outputs = std::collections::BTreeMap::new();
    for line in stdout.lines() {
        let columns = line.split('\t').collect::<Vec<_>>();
        if columns.len() != 2 {
            return Err(format!("Stage 5B oracle output must have 2 columns: {line}"));
        }
        let admitted = match columns[1] {
            "true" => true,
            "false" => false,
            other => return Err(format!("invalid Stage 5B oracle boolean: {other}")),
        };
        if outputs.insert(columns[0].to_owned(), admitted).is_some() {
            return Err(format!("duplicate Stage 5B oracle case_id: {}", columns[0]));
        }
    }
    Ok(outputs)
}
```

- [ ] **Step 2: Add batch stdin oracle execution**

Use `Command::new("node")`, pass `node/authority_context_oracle.mjs` and `-`, pipe stdin/stdout/stderr, write the exact JSONL bytes, require exit success, and parse stdout with `parse_node_outputs`.

- [ ] **Step 3: Assert valid corpus parity**

For every valid fixture case: Rust `validate_authority_context(case).is_ok()` is true and Node output for the same `case_id` is true.

- [ ] **Step 4: Assert invalid corpus parity one case at a time**

For each parse-valid invalid line: Rust structural validation returns `Err`; Node returns `false`. Cases outside the admitted transport grammar are tested as parser rejection in both harnesses rather than structural validation.

- [ ] **Step 5: Add comparator perturbation proof**

Take the first real Node output, invert the boolean only in the Rust test's comparison map, and assert the comparator detects the mismatch. Do not modify either implementation.

- [ ] **Step 6: Run**

```bash
cargo test --manifest-path labs/rust-trust-core/Cargo.toml --locked --test authority_context_differential
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add labs/rust-trust-core/tests/authority_context_differential.rs
git commit -m "test: prove Stage 5B structural differential parity"
```

### Stage 5B Task 5: Add deterministic generated and over-bound campaigns

**Files:**
- Modify: `labs/rust-trust-core/tests/authority_context_differential.rs`

**Interfaces:** fixed seed `0x53543542`, exactly 256 generated valid and 256 generated invalid cases.

- [ ] **Step 1: Add RED constants and missing helper calls**

```rust
const GENERATED_SEED: u32 = 0x5354_3542;
const GENERATED_VALID_CASES: usize = 256;
const GENERATED_INVALID_CASES: usize = 256;
```

Require missing `generated_valid_contexts()` and `generated_invalid_contexts()` from a test named `generated_stage5b_campaign_matches_real_node_oracle`.

- [ ] **Step 2: Run RED**

```bash
cargo test --manifest-path labs/rust-trust-core/Cargo.toml --locked --test authority_context_differential generated_stage5b_campaign_matches_real_node_oracle
```

Expected: compile failure only for the missing generator helpers.

- [ ] **Step 3: Implement deterministic xorshift32**

```rust
#[derive(Clone, Copy)]
struct XorShift32 { state: u32 }
impl XorShift32 {
    fn new(seed: u32) -> Self { Self { state: seed } }
    fn next(&mut self) -> u32 {
        self.state ^= self.state.wrapping_shl(13);
        self.state ^= self.state.wrapping_shr(17);
        self.state ^= self.state.wrapping_shl(5);
        self.state
    }
}
```

No host time, OS randomness, locale, environment, filesystem ordering, or network input participates.

- [ ] **Step 4: Generate 256 structural-valid contexts**

Generate 128 baseline/allow-like contexts and 128 structural-valid semantic-denial contexts cycling through: expired grant, principal mismatch, policy mismatch, request outside grant, request outside intent, intent widening, composition restriction. All 256 must produce structural admission true in Node and Rust.

- [ ] **Step 5: Generate 256 one-defect invalid contexts**

Cycle exactly 16 cases through each category:

```text
verified_false
bound_false
bad_grant_id
bad_grant_digest
bad_request_digest
bad_timestamp
unsorted_set
duplicate_set
empty_set_member
missing_grant_field
extra_grant_field
missing_request_field
bad_history_entry
restriction_one_action
restriction_seventeen_actions
extra_top_level_field
```

Render the actual malformed object; do not use shared mutation instructions.

- [ ] **Step 6: Add explicit over-bound rejection**

Construct and reject 129-item set, 4097-entry history, 257-entry restrictions, 17-action restriction, 257-character printable-ASCII set member, and 193-character identifier. Each test input must remain below 2 MiB; exceedance fails the test rather than truncating.

- [ ] **Step 7: Run full Stage 5B and inherited Rust checks**

```bash
cargo test --manifest-path labs/rust-trust-core/Cargo.toml --locked --test authority_context_differential
cargo fmt --manifest-path labs/rust-trust-core/Cargo.toml --all -- --check
cargo clippy --manifest-path labs/rust-trust-core/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path labs/rust-trust-core/Cargo.toml --locked
```

Expected: all commands exit 0; generated counts are exactly 256 admitted and 256 rejected in both paths.

- [ ] **Step 8: Commit**

```bash
git add labs/rust-trust-core/tests/authority_context_differential.rs
git commit -m "test: add deterministic Stage 5B structural campaign"
```

### Stage 5B Task 6: Bind Stage 5B to laboratory CI and evidence records

**Files:**
- Modify: `.github/workflows/rust-trust-core-lab.yml`
- Modify: `labs/rust-trust-core/EXPERIMENT.md`

- [ ] **Step 1: Add the Stage 5B feature branch trigger**

```yaml
- "feat/rust-trust-core-stage5b-authority-context-validation"
```

- [ ] **Step 2: Add Node Stage 5B oracle test**

```yaml
- name: Verify Stage 5B Node authority-context oracle
  run: node --test labs/rust-trust-core/node/authority_context_oracle.test.mjs
```

- [ ] **Step 3: Add prior-stage source-integrity guards**

```yaml
- name: Verify Stage 5B does not modify promoted Rust v0 source
  run: git diff --exit-code 1f457508f5c6bf2e4361bce1e791cd4f658c0a47 -- trust-core/rust/canonical_value_v0.rs

- name: Verify Stage 5B does not modify Stage 5A attenuation source
  run: git diff --exit-code 1f457508f5c6bf2e4361bce1e791cd4f658c0a47 -- labs/rust-trust-core/src/intent_attenuation.rs
```

Keep all earlier source-boundary checks.

- [ ] **Step 4: Update experiment evidence without premature success claims**

Record: structural admission only; fixed oracle time; printable-ASCII restricted JSONL grammar; seed `0x53543542`; exact generated counts; source-integrity guards; Node remains authoritative; Stage 5A is evidence/provenance only; any real mismatch halts Stage 5B.

- [ ] **Step 5: Run local reproducibility suite**

```bash
node --test \
  labs/rust-trust-core/node/canonical_oracle.test.mjs \
  labs/rust-trust-core/node/canonical_adversarial_corpus.test.mjs \
  labs/rust-trust-core/node/canonical_adversarial_limits.test.mjs \
  labs/rust-trust-core/node/intent_attenuation_oracle.test.mjs \
  labs/rust-trust-core/node/authority_context_oracle.test.mjs
node mesh/src/rust-trust-core-source-boundary.mjs
git diff --exit-code 1f457508f5c6bf2e4361bce1e791cd4f658c0a47 -- trust-core/rust/canonical_value_v0.rs
git diff --exit-code 1f457508f5c6bf2e4361bce1e791cd4f658c0a47 -- labs/rust-trust-core/src/intent_attenuation.rs
cargo fmt --manifest-path labs/rust-trust-core/Cargo.toml --all -- --check
cargo clippy --manifest-path labs/rust-trust-core/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path labs/rust-trust-core/Cargo.toml --locked
npm --prefix mesh run release:verify
```

Expected: every command exits 0 before ready-for-review.

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/rust-trust-core-lab.yml labs/rust-trust-core/EXPERIMENT.md
git commit -m "ci: bind Stage 5B structural validation evidence"
```

### Stage 5B Task 7: Exact-head acceptance and halt boundary

**Files:** PR metadata only after the implementation head is fixed.

- [ ] **Step 1: Verify exact implementation surface**

Run:

```bash
git fetch origin main
BASE_SHA=$(git merge-base origin/main HEAD)
git diff --name-only "$BASE_SHA"...HEAD
```

Allowed Stage 5B implementation paths are:

```text
labs/rust-trust-core/fixtures/authority-context-v0.jsonl
labs/rust-trust-core/fixtures/authority-context-v0-invalid.jsonl
labs/rust-trust-core/src/authority_context.rs
labs/rust-trust-core/src/lib.rs
labs/rust-trust-core/node/authority_context_oracle.mjs
labs/rust-trust-core/node/authority_context_oracle.test.mjs
labs/rust-trust-core/tests/authority_context_differential.rs
labs/rust-trust-core/EXPERIMENT.md
.github/workflows/rust-trust-core-lab.yml
```

Any additional authority/runtime/capability/dependency/credential/state/network/effect path reopens design review.

- [ ] **Step 2: Verify dependency and unsafe state**

```bash
BASE_SHA=$(git merge-base origin/main HEAD)
git diff --exit-code "$BASE_SHA" -- labs/rust-trust-core/Cargo.toml labs/rust-trust-core/Cargo.lock
rg -n "unsafe\b" labs/rust-trust-core/src labs/rust-trust-core/tests
```

Cargo files must be unchanged. No unsafe block/function/trait/impl may exist.

- [ ] **Step 3: Require exact-head CI**

Require Rust Trust-Core Laboratory, Clean Kernel `verify`, Clean Kernel `container`, Node 22 compatibility, Windows, macOS Apple Silicon, macOS Intel, and triggered/required CodeQL lanes to complete successfully on one exact PR head.

- [ ] **Step 4: Refresh review state**

No unresolved review finding may affect structural-vs-authority separation, direct Node oracle binding, fail-closed parser/validator semantics, transport grammar, source-integrity guards, dependency/unsafe boundary, or runtime reachability.

- [ ] **Step 5: Record only this bounded claim**

```text
At the accepted exact head, the laboratory-only Rust Stage 5B candidate matched the supported Node evaluator's structural admission behavior for the frozen Stage 5B printable-ASCII JSONL evidence grammar across the declared hand-curated and deterministic generated corpora, while declared invalid and over-bound contexts failed closed. Node remains authoritative and no production runtime or effect authority was promoted.
```

Do not claim full `evaluateAuthorityComposition()` parity, cryptographic parity, authorization parity, production readiness, or permission to promote the Rust validator under `trust-core/rust/`.

- [ ] **Step 6: Halt on a real mismatch**

If Node and Rust disagree: stop Stage 5B, keep Node authoritative, record exact commit/case/raw JSONL/results/toolchains/platform, classify the defect, reopen design if the contract changes materially, and do not modify the supported Node evaluator or add a bridge merely to make Rust pass.

## Stage 5B Plan Self-Review

- Spec coverage: exact target, TCB, structural/authority separation, zero-dependency parser, fail-closed boundaries, disagreement policy, prior-stage source guards, deterministic evidence, CI, rollback/halt, exact-head acceptance are all assigned to tasks.
- Placeholder scan: no `TBD`, `TODO`, deferred code stub, symbolic SHA placeholder, or unfilled implementation command remains.
- Type consistency: Task 1 imports the exact public Rust API defined and exported in Task 2; Tasks 4–5 consume that same API.
- Scope: no cryptography, persistence, supported runtime integration, source promotion, Gateway/Hypervisor/Sandbox/Grid replacement, or authority decision is implemented by this plan.
