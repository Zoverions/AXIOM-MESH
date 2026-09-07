# Rust Trust-Core Stage 5B Authority-Context Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a laboratory-only Rust candidate that independently validates the frozen structural shape of a bounded synthetic authority-composition context and prove exact structural-admission parity with the supported Node evaluator without migrating any authorization decision or runtime authority.

**Architecture:** Stage 5B introduces a restricted language-neutral JSONL evidence grammar under `labs/rust-trust-core/`. A zero-dependency Rust parser/validator independently checks the frozen structural contract, while a Node laboratory oracle parses the same JSONL rows, invokes the real supported `evaluateAuthorityComposition(...)` with a fixed `now`, and emits only `case_id` plus `structurally_admitted`. The Node oracle discards `allow`, denial reasons, `authority_effect`, and all other authorization output. Any Node/Rust admission mismatch fails closed and stops migration advancement.

**Tech Stack:** Node.js 24.18.0 laboratory oracle, Rust 1.85.0 / edition 2024, Rust standard library only, zero third-party Rust dependencies, `#![forbid(unsafe_code)]`, JSONL laboratory fixtures, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-06-rust-trust-core-migration-foundation-design.md` sections 12–27 plus `labs/rust-trust-core/STAGE5B-AUTHORITY-CONTEXT-VALIDATION.design.txt`

## Global Constraints

- Governing rule: **Stage 5A evidence is admissible at Stage 5B; Stage 5A authority is not.**
- Selected target: laboratory-only structural validation of the authority-composition context accepted by `mesh/src/lib/authority-composition-guard.mjs` `evaluateAuthorityComposition(...)`.
- `structurally_admitted != authorized` is mandatory.
- Node remains the supported authoritative implementation.
- The Rust candidate may not return production `allow`/`deny`, denial reasons, `authority_effect`, a grant, capability, consent decision, budget decision, credential decision, receipt, or effect permission.
- No supported Node runtime call site may import or invoke the Stage 5B Rust candidate.
- No file under `trust-core/rust/` may change.
- `labs/rust-trust-core/src/intent_attenuation.rs` may not change unless a separate Stage 5A correction gate is opened.
- The Rust dependency section remains empty and crate-level `#![forbid(unsafe_code)]` remains active.
- No production Cargo manifest, Rust binary, FFI, WASM, IPC service, runtime subprocess integration, listener, egress path, capability registration, Gateway route, Hypervisor/Sandbox/Grid integration, credential access, durable-state access, or external effect is introduced.
- Fixed Node oracle currentness input: `2030-01-01T00:00:00.000Z`.
- The JSONL fixture grammar is laboratory transport only and is not a production protocol.
- JSON fixture strings are restricted to printable ASCII U+0020–U+007E. Within JSON string literals, only `\"` and `\\` escapes are admitted. `\u`, control-character escapes, raw control characters, numbers, and duplicate object keys are outside the Stage 5B fixture grammar and fail closed.
- Printable-ASCII restriction is an evidence-transport restriction, not a claim that the supported Node structural validators accept only ASCII strings.
- Stage 5B set ordering uses ASCII lexical order, which is identical for the admitted evidence grammar in Node and Rust.
- Any Node/Rust disagreement fails closed and halts Stage 5B; no normalization-after-comparison or preference for the new implementation is allowed.
- Any material change to target, TCB, authority map, bridge/dependency policy, state reachability, rollback model, or effect reachability reopens the Stage 5B design gate.

---

## File Structure

**Create**

- `labs/rust-trust-core/fixtures/authority-context-v0.jsonl` — hand-curated parse-valid, structurally admitted contexts, including both semantically allowed and semantically denied examples.
- `labs/rust-trust-core/fixtures/authority-context-v0-invalid.jsonl` — hand-curated parse-valid JSON contexts that must fail structural validation.
- `labs/rust-trust-core/src/authority_context.rs` — restricted JSON parser plus Stage 5B structural validator; no authorization evaluator.
- `labs/rust-trust-core/node/authority_context_oracle.mjs` — laboratory wrapper around the real supported Node evaluator that reports structural admission only.
- `labs/rust-trust-core/node/authority_context_oracle.test.mjs` — Node transport/oracle and authorization-output-discard tests.
- `labs/rust-trust-core/tests/authority_context_differential.rs` — exact Node↔Rust structural-admission comparison, generated campaign, fail-closed invalid campaign, and mismatch proof.

**Modify**

- `labs/rust-trust-core/src/lib.rs` — expose only the Stage 5B laboratory parsing/validation API.
- `.github/workflows/rust-trust-core-lab.yml` — add Stage 5B Node test and source-integrity guards; keep workflow laboratory-only.
- `labs/rust-trust-core/EXPERIMENT.md` — record Stage 5B hypothesis, evidence, non-claims, halt rule, and reproducibility after implementation evidence exists.

**Must remain byte-identical to the accepted Stage 5A base unless a separate correction gate opens**

- `trust-core/rust/canonical_value_v0.rs`
- `labs/rust-trust-core/src/intent_attenuation.rs`
- `mesh/src/lib/authority-composition-guard.mjs`

---

### Task 1: Freeze Stage 5B hand-curated fixtures and establish the Rust RED gate

**Files:**
- Create: `labs/rust-trust-core/fixtures/authority-context-v0.jsonl`
- Create: `labs/rust-trust-core/fixtures/authority-context-v0-invalid.jsonl`
- Create: `labs/rust-trust-core/tests/authority_context_differential.rs`

**Interfaces:**
- Consumes: the Stage 5B semantic contract from `STAGE5B-AUTHORITY-CONTEXT-VALIDATION.design.txt`.
- Produces: fixture paths and the expected Rust API names `parse_authority_context_fixture`, `parse_authority_context_line`, `validate_authority_context`, `AuthorityContextCase`, and `AuthorityContextError` for Task 2.

- [ ] **Step 1: Create the valid JSONL fixture with structurally admitted contexts**

Each line is one exact top-level object with fields `case_id`, `grant`, `intent`, `request`, `history`, and `restrictions`.

The first row must be equivalent to:

```json
{"case_id":"baseline_allow","grant":{"verified":true,"grant_id":"grant:baseline","issuer":"gateway","principal_id":"principal:test","resources":["resource:a"],"actions":["read"],"purposes":["research"],"destinations":["local"],"expires_at":"2099-01-01T00:00:00.000Z","policy_digest":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"},"intent":{"bound":true,"actions":["read"],"purposes":["research"],"destinations":["local"],"resources":["resource:a"]},"request":{"principal_id":"principal:test","resource":"resource:a","action":"read","purpose":"research","destination":"local","protocol":"local","causal_scope_id":"scope:1","policy_digest":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"},"history":[],"restrictions":[]}
```

Include at least these additional structurally valid cases, changing only the semantic values needed to make the supported evaluator deny while structural validation still succeeds:

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

`expired_but_structural` must use `expires_at: "2029-12-31T23:59:59.999Z"` so it is expired relative to the fixed 2030 oracle time but still structurally valid.

`composition_blocked_but_structural` must include history actions `prepare`, `approve` in one causal scope and request action `execute`, with a restriction whose `ordered_actions` are `prepare`, `approve`, `execute`; the Node evaluator may deny it, but Stage 5B must still classify it structurally admitted.

- [ ] **Step 2: Create the invalid JSONL fixture with one structural defect per row**

Use parse-valid JSON. Include exactly named cases for at least:

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

For example, `grant_verified_false` must remain JSON-parseable:

```json
{"case_id":"grant_verified_false","grant":{"verified":false,"grant_id":"grant:bad","issuer":"gateway","principal_id":"principal:test","resources":["resource:a"],"actions":["read"],"purposes":["research"],"destinations":["local"],"expires_at":"2099-01-01T00:00:00.000Z","policy_digest":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"},"intent":{"bound":true,"actions":["read"],"purposes":["research"],"destinations":["local"],"resources":["resource:a"]},"request":{"principal_id":"principal:test","resource":"resource:a","action":"read","purpose":"research","destination":"local","protocol":"local","causal_scope_id":"scope:1","policy_digest":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"},"history":[],"restrictions":[]}
```

- [ ] **Step 3: Write the initial differential test against the not-yet-existing Rust API**

Start `authority_context_differential.rs` with:

```rust
use axiom_trust_core_lab::{
    parse_authority_context_fixture,
    validate_authority_context,
};

use std::path::PathBuf;

fn manifest_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
}

#[test]
fn stage5b_valid_fixture_requires_structural_validator() {
    let text = std::fs::read_to_string(
        manifest_dir().join("fixtures/authority-context-v0.jsonl"),
    )
    .expect("Stage 5B valid fixture must be readable");
    let cases = parse_authority_context_fixture(&text)
        .expect("Stage 5B valid fixture must parse");
    assert!(cases.len() >= 10);
    for case in &cases {
        validate_authority_context(case)
            .unwrap_or_else(|error| panic!("{} must be structurally admitted: {error}", case.case_id()));
    }
}
```

- [ ] **Step 4: Run the Rust test and preserve the intended RED evidence**

Run:

```bash
cargo test --manifest-path labs/rust-trust-core/Cargo.toml --locked --test authority_context_differential stage5b_valid_fixture_requires_structural_validator
```

Expected: compilation fails because `parse_authority_context_fixture` / `validate_authority_context` are not exported. Existing Stage 1–5A code must not be the cause.

- [ ] **Step 5: Commit the RED gate**

```bash
git add \
  labs/rust-trust-core/fixtures/authority-context-v0.jsonl \
  labs/rust-trust-core/fixtures/authority-context-v0-invalid.jsonl \
  labs/rust-trust-core/tests/authority_context_differential.rs
git commit -m "test: define Rust Stage 5B authority-context gate"
```

---

### Task 2: Add the zero-dependency Rust restricted-JSON parser and structural validator

**Files:**
- Create: `labs/rust-trust-core/src/authority_context.rs`
- Modify: `labs/rust-trust-core/src/lib.rs`
- Test: `labs/rust-trust-core/tests/authority_context_differential.rs`

**Interfaces:**
- Consumes: one Stage 5B JSONL line per case.
- Produces:

```rust
pub struct AuthorityContextCase;
pub struct AuthorityContextError;
pub fn parse_authority_context_line(line: &str) -> Result<AuthorityContextCase, AuthorityContextError>;
pub fn parse_authority_context_fixture(text: &str) -> Result<Vec<AuthorityContextCase>, AuthorityContextError>;
pub fn validate_authority_context(case: &AuthorityContextCase) -> Result<(), AuthorityContextError>;
impl AuthorityContextCase { pub fn case_id(&self) -> &str; }
```

`Result<(), AuthorityContextError>` is deliberate: successful structural validation must not manufacture an authority-bearing token.

- [ ] **Step 1: Add restricted JSON value types and parser tests**

In `authority_context.rs`, define:

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

impl std::fmt::Display for AuthorityContextError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(&self.message)
    }
}

impl std::error::Error for AuthorityContextError {}
```

The parser must admit only objects, arrays, strings, booleans, and `null`. It must reject JSON numbers, duplicate object keys, trailing data, raw control characters, `\u` escapes, and escapes other than `\"` and `\\`.

Add module tests proving:

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
    let parsed = parse_json(r#"{"x":"quote:\" slash:\\"}"#).unwrap();
    assert!(matches!(parsed, JsonValue::Object(_)));
}
```

- [ ] **Step 2: Run the focused parser tests**

Run:

```bash
cargo test --manifest-path labs/rust-trust-core/Cargo.toml --locked authority_context::tests::restricted_json
```

Expected: PASS after the restricted parser exists.

- [ ] **Step 3: Add exact-object and scalar validators**

Implement helpers with these signatures:

```rust
fn exact_object<'a>(value: &'a JsonValue, fields: &[&str], label: &str)
    -> Result<&'a [(String, JsonValue)], AuthorityContextError>;
fn object_field<'a>(object: &'a [(String, JsonValue)], key: &str)
    -> Result<&'a JsonValue, AuthorityContextError>;
fn ascii_string(value: &JsonValue, label: &str, min: usize, max: usize)
    -> Result<&str, AuthorityContextError>;
fn identifier(value: &JsonValue, label: &str) -> Result<&str, AuthorityContextError>;
fn digest(value: &JsonValue, label: &str) -> Result<&str, AuthorityContextError>;
fn canonical_utc_timestamp(value: &JsonValue, label: &str)
    -> Result<&str, AuthorityContextError>;
fn sorted_unique_ascii_set(value: &JsonValue, label: &str, max_items: usize)
    -> Result<(), AuthorityContextError>;
```

`identifier` must implement the exact ASCII evidence grammar `[A-Za-z0-9][A-Za-z0-9_.:/-]{0,191}` without regex dependencies.

`digest` must require exactly 64 characters from `[a-f0-9]`.

`canonical_utc_timestamp` must require exactly `YYYY-MM-DDTHH:MM:SS.mmmZ`, validate month/day including Gregorian leap-year rules, and reject values that would normalize to a different timestamp. Implement leap years as:

```rust
fn leap_year(year: u32) -> bool {
    year % 4 == 0 && (year % 100 != 0 || year % 400 == 0)
}
```

Reject hour > 23, minute > 59, second > 59, month outside 1..=12, day 0, or day beyond the month length.

- [ ] **Step 4: Add raw Stage 5B case parsing without authorization semantics**

Define:

```rust
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AuthorityContextCase {
    case_id: String,
    context: JsonValue,
}

impl AuthorityContextCase {
    pub fn case_id(&self) -> &str {
        &self.case_id
    }
}
```

`parse_authority_context_line` must require exact top-level fields:

```text
case_id
grant
intent
request
history
restrictions
```

It must validate `case_id` as an identifier, preserve the remaining raw value, and reject duplicate `case_id` values at fixture level.

- [ ] **Step 5: Add structural validation only**

`validate_authority_context` must call dedicated helpers:

```rust
fn validate_grant(value: &JsonValue) -> Result<(), AuthorityContextError>;
fn validate_intent(value: &JsonValue) -> Result<(), AuthorityContextError>;
fn validate_request(value: &JsonValue) -> Result<(), AuthorityContextError>;
fn validate_history(value: &JsonValue) -> Result<(), AuthorityContextError>;
fn validate_restrictions(value: &JsonValue) -> Result<(), AuthorityContextError>;
```

The exact grant fields are:

```rust
&[
    "verified", "grant_id", "issuer", "principal_id",
    "resources", "actions", "purposes", "destinations",
    "expires_at", "policy_digest",
]
```

Grant `verified` must be literal `true`; intent `bound` must be literal `true`.

History must be an array of at most 4096 exact objects with fields:

```text
causal_scope_id
action
resource
purpose
destination
```

Restrictions must be an array of at most 256 exact objects with fields `id` and `ordered_actions`; `ordered_actions` must contain 2..=16 valid identifiers and preserve order.

Do **not** compare principal IDs, policy digests, request values against grant/intent scope, expiry against `now`, intent attenuation, history subsequences, or any other authorization semantic.

The function ends only with:

```rust
pub fn validate_authority_context(case: &AuthorityContextCase)
    -> Result<(), AuthorityContextError>
{
    let object = exact_object(
        &case.context,
        &["grant", "intent", "request", "history", "restrictions"],
        "authority context",
    )?;
    validate_grant(object_field(object, "grant")?)?;
    validate_intent(object_field(object, "intent")?)?;
    validate_request(object_field(object, "request")?)?;
    validate_history(object_field(object, "history")?)?;
    validate_restrictions(object_field(object, "restrictions")?)?;
    Ok(())
}
```

If the chosen internal representation keeps `case_id` outside `context`, ensure the top-level parser performs the exact six-field check before extracting it; do not accidentally require only five fields after extraction.

- [ ] **Step 6: Export only the Stage 5B laboratory API**

Add to `lib.rs`:

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

Do not export `JsonValue`, parser cursors, or validation helpers.

- [ ] **Step 7: Run focused and inherited Rust verification**

Run:

```bash
cargo fmt --manifest-path labs/rust-trust-core/Cargo.toml --all -- --check
cargo clippy --manifest-path labs/rust-trust-core/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path labs/rust-trust-core/Cargo.toml --locked
```

Expected: all Stage 1–5A tests remain green and the Stage 5B valid-fixture test passes.

- [ ] **Step 8: Commit the Rust validator**

```bash
git add \
  labs/rust-trust-core/src/authority_context.rs \
  labs/rust-trust-core/src/lib.rs \
  labs/rust-trust-core/tests/authority_context_differential.rs
git commit -m "feat: add laboratory Stage 5B structural validator"
```

---

### Task 3: Add the real Node structural-admission oracle without authorization output

**Files:**
- Create: `labs/rust-trust-core/node/authority_context_oracle.mjs`
- Create: `labs/rust-trust-core/node/authority_context_oracle.test.mjs`

**Interfaces:**
- Consumes: the same Stage 5B JSONL lines as Rust.
- Produces stdout rows exactly:

```text
case_id<TAB>true
case_id<TAB>false
```

No third output column is permitted.

- [ ] **Step 1: Write Node RED tests before the oracle module exists**

Create tests that import:

```js
import {
  parseAuthorityContextFixture,
  structurallyAdmitAuthorityContext,
  runAuthorityContextFixtureText
} from './authority_context_oracle.mjs';
```

Include these named tests:

```js
test('Stage 5B oracle reports structural admission only', ...)
test('semantically denied context remains structurally admitted', ...)
test('structurally invalid context reports false', ...)
test('oracle output has exactly two TSV columns', ...)
test('duplicate case IDs fail closed', ...)
test('transport values outside restricted JSON grammar fail closed', ...)
```

For `semantically denied context remains structurally admitted`, call the supported evaluator directly in the test to prove `allow === false`, then assert the Stage 5B oracle reports `structurallyAdmitted === true` for the same context.

- [ ] **Step 2: Run Node tests to capture RED**

Run:

```bash
node --test labs/rust-trust-core/node/authority_context_oracle.test.mjs
```

Expected: FAIL because `authority_context_oracle.mjs` does not exist.

- [ ] **Step 3: Implement the minimum Node oracle**

Use the real supported evaluator:

```js
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { evaluateAuthorityComposition } from '../../../mesh/src/lib/authority-composition-guard.mjs';
import { ValidationError } from '../../../mesh/src/lib/canonical.mjs';

export const STAGE5B_NOW = Object.freeze(new Date('2030-01-01T00:00:00.000Z'));
```

`parseAuthorityContextFixture(text)` must:

- normalize CRLF to LF;
- require one JSON object per non-empty line;
- enforce the Stage 5B printable-ASCII/escape transport restriction before `JSON.parse`;
- reject JSON numbers and unsupported escapes;
- require a valid `case_id` identifier;
- reject duplicate case IDs;
- return raw context objects without sorting, deduplicating, or repairing nested values.

`structurallyAdmitAuthorityContext(candidate)` must:

```js
export function structurallyAdmitAuthorityContext(candidate) {
  const { case_id: caseId, grant, intent, request, history, restrictions } = candidate;
  try {
    evaluateAuthorityComposition({
      grant,
      intent,
      request,
      history,
      restrictions,
      now: STAGE5B_NOW
    });
    return Object.freeze({ caseId, structurallyAdmitted: true });
  } catch (error) {
    if (error instanceof ValidationError) {
      return Object.freeze({ caseId, structurallyAdmitted: false });
    }
    throw error;
  }
}
```

The function must not expose the supported evaluator result.

`runAuthorityContextFixtureText(text)` must emit only:

```js
return parseAuthorityContextFixture(text)
  .map(candidate => {
    const result = structurallyAdmitAuthorityContext(candidate);
    return `${result.caseId}\t${result.structurallyAdmitted}`;
  })
  .join('\n');
```

Support both a fixture path and `-` stdin using chunk collection plus one final `join('')`.

- [ ] **Step 4: Run Node tests to GREEN**

Run:

```bash
node --test labs/rust-trust-core/node/authority_context_oracle.test.mjs
```

Expected: PASS, including proof that a semantically denied context is still reported as structurally admitted and that no authorization output leaves the oracle.

- [ ] **Step 5: Commit the Node oracle**

```bash
git add \
  labs/rust-trust-core/node/authority_context_oracle.mjs \
  labs/rust-trust-core/node/authority_context_oracle.test.mjs
git commit -m "test: add real Node Stage 5B structural oracle"
```

---

### Task 4: Complete hand-curated Node↔Rust structural-admission differential evidence

**Files:**
- Modify: `labs/rust-trust-core/tests/authority_context_differential.rs`
- Test: `labs/rust-trust-core/fixtures/authority-context-v0.jsonl`
- Test: `labs/rust-trust-core/fixtures/authority-context-v0-invalid.jsonl`

**Interfaces:**
- Consumes: Node two-column oracle output and Rust `Result<(), AuthorityContextError>`.
- Produces: exact per-case structural-admission parity across the hand-curated valid and invalid corpora.

- [ ] **Step 1: Add duplicate-aware Node output parsing**

Add:

```rust
use std::collections::BTreeMap;
use std::io::Write;
use std::process::{Command, Stdio};

fn parse_node_outputs(stdout: &str) -> Result<BTreeMap<String, bool>, String> {
    let mut outputs = BTreeMap::new();
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

- [ ] **Step 2: Add a batch stdin oracle helper**

```rust
fn node_outputs_for_text(text: &str) -> BTreeMap<String, bool> {
    let mut child = Command::new("node")
        .arg(manifest_dir().join("node/authority_context_oracle.mjs"))
        .arg("-")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("Stage 5B Node oracle must start");
    child.stdin.take().unwrap().write_all(text.as_bytes()).unwrap();
    let output = child.wait_with_output().unwrap();
    assert!(
        output.status.success(),
        "Stage 5B Node oracle failed: {}",
        String::from_utf8_lossy(&output.stderr)
    );
    let stdout = String::from_utf8(output.stdout).unwrap();
    parse_node_outputs(stdout.trim_end()).unwrap()
}
```

- [ ] **Step 3: Prove all valid contexts are admitted in both paths**

Add:

```rust
#[test]
fn hand_curated_structural_contexts_match_real_node_oracle() {
    let text = std::fs::read_to_string(
        manifest_dir().join("fixtures/authority-context-v0.jsonl"),
    ).unwrap();
    let cases = parse_authority_context_fixture(&text).unwrap();
    let node = node_outputs_for_text(&text);
    assert_eq!(node.len(), cases.len());

    for case in &cases {
        validate_authority_context(case).unwrap();
        assert_eq!(node.get(case.case_id()), Some(&true), "{}", case.case_id());
    }
}
```

- [ ] **Step 4: Prove every declared invalid context fails closed in both paths**

Parse the invalid fixture one line at a time so one invalid case cannot suppress evidence for later cases:

```rust
#[test]
fn hand_curated_invalid_contexts_fail_closed_in_both_paths() {
    let text = std::fs::read_to_string(
        manifest_dir().join("fixtures/authority-context-v0-invalid.jsonl"),
    ).unwrap();

    for line in text.lines().filter(|line| !line.is_empty()) {
        let case = parse_authority_context_line(line).unwrap();
        assert!(validate_authority_context(&case).is_err(), "{}", case.case_id());
        let node = node_outputs_for_text(&format!("{line}\n"));
        assert_eq!(node.get(case.case_id()), Some(&false), "{}", case.case_id());
    }
}
```

If an invalid case is intentionally outside the admitted transport grammar rather than merely structurally invalid, test it separately as a transport rejection in both language harnesses instead of forcing `parse_authority_context_line(...).unwrap()`.

- [ ] **Step 5: Add a controlled comparison-mismatch proof**

```rust
#[test]
fn differential_comparator_rejects_perturbed_node_admission() {
    let text = std::fs::read_to_string(
        manifest_dir().join("fixtures/authority-context-v0.jsonl"),
    ).unwrap();
    let cases = parse_authority_context_fixture(&text).unwrap();
    let mut node = node_outputs_for_text(&text);
    let first = cases.first().unwrap();
    let real = *node.get(first.case_id()).unwrap();
    node.insert(first.case_id().to_owned(), !real);
    let rust_admitted = validate_authority_context(first).is_ok();
    assert_ne!(rust_admitted, node[first.case_id()]);
}
```

The mismatch is introduced only at the comparison boundary; do not alter the supported Node evaluator or Rust candidate.

- [ ] **Step 6: Run the Stage 5B differential tests**

```bash
cargo test --manifest-path labs/rust-trust-core/Cargo.toml --locked --test authority_context_differential
```

Expected: PASS.

- [ ] **Step 7: Commit the hand-curated differential evidence**

```bash
git add labs/rust-trust-core/tests/authority_context_differential.rs
git commit -m "test: prove Stage 5B structural differential parity"
```

---

### Task 5: Add deterministic generated structural-admission and fail-closed campaigns

**Files:**
- Modify: `labs/rust-trust-core/tests/authority_context_differential.rs`

**Interfaces:**
- Consumes: frozen Stage 5B JSONL grammar and the real Node oracle.
- Produces: deterministic generated evidence with published seed and category counts.

- [ ] **Step 1: Add the fixed generator contract before helpers exist**

Use:

```rust
const GENERATED_SEED: u32 = 0x5354_3542; // ASCII-ish "ST5B" marker, reproducibility only
const GENERATED_VALID_CASES: usize = 256;
const GENERATED_INVALID_CASES: usize = 256;
```

Use the same xorshift32 transition style already established in Stage 5A:

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

The first RED test must require `generated_valid_contexts()` and `generated_invalid_contexts()` before those helpers exist.

- [ ] **Step 2: Run the focused test and capture RED**

```bash
cargo test --manifest-path labs/rust-trust-core/Cargo.toml --locked --test authority_context_differential generated_stage5b_campaign
```

Expected: compilation failure only for the missing generator helpers.

- [ ] **Step 3: Implement 256 structurally valid generated contexts**

Generate valid contexts across deterministic categories. At least 128 must be semantically likely to allow under the supported evaluator and at least 128 must be structurally valid but semantically deny due to one of:

```text
expired grant
principal mismatch
policy mismatch
request outside grant
request outside intent
intent widening
composition restriction
```

All 256 must remain structurally admitted in both Node and Rust.

Build JSON using explicit string rendering helpers that escape only `"` and `\\`. Do not use ambient randomness, time, locale, filesystem ordering, or environment variables.

- [ ] **Step 4: Implement 256 one-defect invalid contexts**

Cycle deterministically through these mutation categories, 16 cases each:

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

For object-shape mutations, render the actual malformed object; do not encode a mutation instruction that both implementations interpret.

All generated invalid contexts must remain parse-valid within the Stage 5B restricted JSON grammar and fail structural validation in both language paths.

- [ ] **Step 5: Compare the exact generated stream through both paths**

Add:

```rust
#[test]
fn generated_stage5b_campaign_matches_real_node_oracle() {
    let valid = generated_valid_contexts();
    let invalid = generated_invalid_contexts();
    assert_eq!(valid.len(), GENERATED_VALID_CASES);
    assert_eq!(invalid.len(), GENERATED_INVALID_CASES);

    let valid_text = valid.join("\n") + "\n";
    let valid_cases = parse_authority_context_fixture(&valid_text).unwrap();
    let node_valid = node_outputs_for_text(&valid_text);
    for case in &valid_cases {
        assert!(validate_authority_context(case).is_ok(), "{}", case.case_id());
        assert_eq!(node_valid.get(case.case_id()), Some(&true), "{}", case.case_id());
    }

    for line in &invalid {
        let case = parse_authority_context_line(line).unwrap();
        assert!(validate_authority_context(&case).is_err(), "{}", case.case_id());
        let node = node_outputs_for_text(&format!("{line}\n"));
        assert_eq!(node.get(case.case_id()), Some(&false), "{}", case.case_id());
    }
}
```

- [ ] **Step 6: Add explicit over-bound tests without allocating unbounded input**

Programmatically construct and reject:

- 129-item set;
- 4097-entry history;
- 257-entry restrictions;
- 17-action restriction;
- 257-character printable-ASCII set member;
- 193-character identifier.

Keep each generated input under a fixed 2 MiB laboratory test ceiling. If a constructed case would exceed that ceiling, the test must fail rather than truncate it.

- [ ] **Step 7: Run generated campaign and full laboratory suite**

```bash
cargo test --manifest-path labs/rust-trust-core/Cargo.toml --locked --test authority_context_differential
cargo fmt --manifest-path labs/rust-trust-core/Cargo.toml --all -- --check
cargo clippy --manifest-path labs/rust-trust-core/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path labs/rust-trust-core/Cargo.toml --locked
```

Expected: PASS with 256/256 generated valid cases admitted in both paths and 256/256 generated invalid cases rejected in both paths.

- [ ] **Step 8: Commit generated evidence**

```bash
git add labs/rust-trust-core/tests/authority_context_differential.rs
git commit -m "test: add deterministic Stage 5B structural campaign"
```

---

### Task 6: Bind Stage 5B into laboratory CI and protect prior-stage source boundaries

**Files:**
- Modify: `.github/workflows/rust-trust-core-lab.yml`
- Modify: `labs/rust-trust-core/EXPERIMENT.md`

**Interfaces:**
- Consumes: Stage 5B Node tests, Rust tests, accepted Stage 5A base `1f457508f5c6bf2e4361bce1e791cd4f658c0a47`.
- Produces: dedicated CI execution and source-integrity evidence without production promotion.

- [ ] **Step 1: Extend the dedicated workflow branch/path surface**

Add push branch:

```yaml
- "feat/rust-trust-core-stage5b-authority-context-validation"
```

Ensure the Stage 5B plan path is included under both `push.paths` and `pull_request.paths`:

```yaml
- "docs/superpowers/plans/2026-09-06-rust-trust-core-stage5b-authority-context-validation.md"
```

- [ ] **Step 2: Add the Stage 5B Node oracle test step**

```yaml
- name: Verify Stage 5B Node authority-context oracle
  run: node --test labs/rust-trust-core/node/authority_context_oracle.test.mjs
```

Place it after the Stage 5A Node oracle test and before source-boundary checks.

- [ ] **Step 3: Add fail-closed prior-stage integrity guards**

Add:

```yaml
- name: Verify Stage 5B does not modify promoted Rust v0 source
  run: git diff --exit-code 1f457508f5c6bf2e4361bce1e791cd4f658c0a47 -- trust-core/rust/canonical_value_v0.rs

- name: Verify Stage 5B does not modify Stage 5A attenuation source
  run: git diff --exit-code 1f457508f5c6bf2e4361bce1e791cd4f658c0a47 -- labs/rust-trust-core/src/intent_attenuation.rs
```

Do not weaken or remove Stage 3/4/5A guards.

- [ ] **Step 4: Update `EXPERIMENT.md` with Stage 5B evidence language**

Add a Stage 5B section stating exactly:

```text
Stage 5B evaluates structural admission only. A structurally admitted context may still be denied by the supported Node authority evaluator. The Rust candidate emits no production authority decision and is not runtime reachable. Stage 5A evidence is provenance/evidence only and does not authorize Stage 5B.
```

Record the fixed oracle time, fixture grammar restriction, generated seed `0x53543542`, 256 valid generated cases, 256 invalid generated cases, source-integrity guards, and halt rule.

Do not claim Stage 5B passes until exact-head CI has actually passed.

- [ ] **Step 5: Run local reproducibility commands**

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

Expected: all commands exit 0 before the implementation PR is moved out of draft.

- [ ] **Step 6: Commit CI/evidence wiring**

```bash
git add \
  .github/workflows/rust-trust-core-lab.yml \
  labs/rust-trust-core/EXPERIMENT.md
git commit -m "ci: bind Stage 5B structural validation evidence"
```

---

### Task 7: Exact-head acceptance and promotion halt boundary

**Files:**
- No production source changes.
- PR metadata only after the exact implementation head is fixed.

**Interfaces:**
- Consumes: exact implementation commit plus GitHub workflow/review evidence.
- Produces: either a Stage 5B laboratory acceptance record or an explicit halt; never production promotion.

- [ ] **Step 1: Verify the implementation diff is confined to the approved Stage 5B surface**

Compare against the exact implementation branch base. The expected implementation files are limited to:

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

If another authority, runtime, capability, dependency, promoted-source, credential, state, network, or effect file appears, stop and reopen the Stage 5B design gate.

- [ ] **Step 2: Verify dependencies and unsafe state**

```bash
git diff --exit-code <implementation-base> -- labs/rust-trust-core/Cargo.toml labs/rust-trust-core/Cargo.lock
rg -n "unsafe\b" labs/rust-trust-core/src labs/rust-trust-core/tests
```

Expected: Cargo files unchanged. `unsafe` appears only in the crate-level `#![forbid(unsafe_code)]` declaration or documentation text; no unsafe block/function/trait/impl exists.

- [ ] **Step 3: Require exact-head protected CI**

On one exact PR head require:

```text
Rust Trust-Core Laboratory — success
Clean Kernel verify — success
Clean Kernel container — success
Node 22 compatibility — success
Windows compatibility — success
macOS Apple Silicon — success
macOS Intel — success
CodeQL actions — success if triggered/required
CodeQL JavaScript/TypeScript — success if triggered/required
CodeQL Rust — success if triggered for the head
```

Any later commit invalidates this evidence until the same required gates complete again.

- [ ] **Step 4: Refresh review state on the exact head**

Require no unresolved review finding that affects:

```text
structural-vs-authority separation
Node-oracle direct supported-function binding
Rust parser/validator fail-closed semantics
fixture grammar mismatch
source-integrity guards
dependency/unsafe boundary
runtime reachability
```

- [ ] **Step 5: Record only the bounded Stage 5B claim**

The PR acceptance text may claim only:

```text
At the accepted exact head, the laboratory-only Rust Stage 5B candidate matched the supported Node evaluator's structural admission behavior for the frozen Stage 5B printable-ASCII JSONL evidence grammar across the declared hand-curated and deterministic generated corpora, while declared invalid/over-bound contexts failed closed. Node remains authoritative and no production runtime or effect authority was promoted.
```

It must not claim full `evaluateAuthorityComposition()` parity, cryptographic parity, authorization parity, production readiness, or permission to move the Rust validator under `trust-core/rust/`.

- [ ] **Step 6: Halt rather than patch around a real mismatch**

If a real Node/Rust structural mismatch occurs:

```text
1. Stop Stage 5B advancement.
2. Keep Node authoritative.
3. Record exact commit, case_id, raw JSONL line, Node result/error, Rust result/error, Node version, Rust version, and platform.
4. Determine whether the defect is in the Stage 5B fixture grammar, Node oracle wrapper, Rust parser/validator, or the design contract.
5. If the design contract changes materially, reopen Stage 5B design review before code changes continue.
6. Do not modify the supported Node evaluator merely to make Rust pass.
7. Do not promote the Rust source or add a bridge while the mismatch is unresolved.
```

---

## Plan Self-Review Checklist

Before execution begins, confirm:

- Stage 5B target remains structural validation only.
- The plan never treats Stage 5A success as Stage 5B authority.
- Node oracle output is exactly two columns and contains no `allow`, reasons, or `authority_effect`.
- Rust returns `Result<(), AuthorityContextError>` rather than an authority-bearing grant/token.
- Restricted JSON parser is explicitly laboratory-only and zero-dependency.
- Printable-ASCII transport restriction is documented as evidence grammar, not production behavior.
- Fixed `now` is used only to satisfy the supported evaluator call and its semantic result is discarded.
- Hand-curated valid cases include semantic-denial examples to prove `structurally_admitted != authorized`.
- Invalid cases exercise exact-object, boolean precondition, ID, digest, timestamp, set, history, and restriction boundaries.
- Generated evidence is deterministic with fixed seed and exact counts.
- Stage 3 promoted source and Stage 5A attenuation source are guarded byte-for-byte from the accepted Stage 5A merge base.
- Cargo dependencies remain empty and unsafe remains forbidden.
- No supported runtime imports Rust.
- No production state or external effect is reachable.
- Exact-head acceptance remains laboratory-only and does not authorize Stage 6 or source/runtime promotion.
