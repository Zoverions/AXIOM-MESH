# Rust Trust-Core Stage 4 Adversarial Differential Conformance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove substantially deeper deterministic Node-vs-Rust differential conformance for the already-promoted `canonical-value-v0` candidate without changing its semantics, source, runtime reachability, dependencies, or authority.

**Architecture:** Keep `mesh/src/lib/canonical.mjs` as the executable oracle and `trust-core/rust/canonical_value_v0.rs` as the unchanged promoted candidate. Add deterministic adversarial corpus generation and resource-bound validation only under `labs/rust-trust-core/`, feed identical frozen-v0 rows independently through Node and Rust, and compare exact bytes. Stage 4 is evidence-only: any defect in the promoted source halts the stage and reopens Stage 3 rather than being fixed inside this plan.

**Tech Stack:** Node.js 24.18.0 standard library; Rust 1.85.0 / edition 2024 standard library; Cargo locked tests; GitHub Actions; existing AXIOM Clean Kernel/Windows/macOS workflows.

**Spec:** `docs/superpowers/specs/2026-09-06-rust-trust-core-stage4-adversarial-differential-design.md`

## Global Constraints

- Base Stage 4 work on signed Stage 3 merge `ec2a480ff8d903fbef89807429c289637e3a0d7c` plus this approved design/plan branch.
- Node `mesh/src/lib/canonical.mjs` remains authoritative and must be executed directly by the oracle.
- `trust-core/rust/canonical_value_v0.rs` must not be modified by Stage 4. If a generated case proves it violates the frozen v0 contract, halt Stage 4 and reopen Stage 3.
- Keep the admitted `canonical-value-v0` semantic domain unchanged: null, booleans, JavaScript safe integers, negative zero, restricted printable ASCII strings, scalar arrays, and flat unique-ASCII-key objects only.
- Keep Rust `1.85.0`, edition 2024, zero third-party Rust dependencies, committed lockfile, and `#![forbid(unsafe_code)]`.
- Do not add a production Cargo manifest, Rust binary, FFI, WASM, service, supported subprocess integration, capability, Gateway route, Hypervisor/Sandbox/Grid call, production credential/state access, listener, egress, or production-image inclusion.
- Do not modify `mesh/src/release.mjs` or the `npm --prefix mesh run release:verify` command path to enforce Stage 4 evidence. The Rust source gate remains CI/test-bound.
- Fixed Stage 4 seeds: `0x4158494F`, `0x4D455348`, `0xC0DEF00D`, `0x5EED0004`.
- Exact generated corpus: 1,024 valid rows total (256 per seed) and 256 malformed/over-bound fixture rows total (64 per seed), in addition to the existing 17 valid and 12 malformed hand-curated rows.
- Exact Stage 4 harness limits: `MAX_TOTAL_CASES = 2048`, `MAX_ARRAY_ITEMS = 32`, `MAX_OBJECT_MEMBERS = 32`, `MAX_KEY_LENGTH = 64`, `MAX_PAYLOAD_BYTES = 4096`; overflow always fails, never truncates.
- Final acceptance requires one exact PR head with Rust Trust-Core Laboratory, Clean Kernel, container deny-egress/isolation, Node 22, Windows, macOS Apple Silicon, and macOS Intel all successful.

---

## File map

**Create**
- `labs/rust-trust-core/node/canonical_adversarial_corpus.mjs` — deterministic xorshift32 corpus generation and CLI rendering only; no canonicalization.
- `labs/rust-trust-core/node/canonical_adversarial_corpus.test.mjs` — determinism, seed/count/category, known-sequence, and rendering tests.
- `labs/rust-trust-core/node/canonical_adversarial_limits.mjs` — Node-side Stage 4 test-harness resource limits.
- `labs/rust-trust-core/node/canonical_adversarial_limits.test.mjs` — exact fail-closed limit tests.
- `labs/rust-trust-core/tests/support/mod.rs` — Rust integration support module declaration.
- `labs/rust-trust-core/tests/support/adversarial.rs` — Rust test-harness limits, Node subprocess helpers, duplicate-aware output parsing, and comparison diagnostics.
- `labs/rust-trust-core/tests/canonical_adversarial_differential.rs` — 1,024-case differential campaign, metamorphic permutation evidence, mismatch proof, and generated invalid rejection.

**Modify**
- `labs/rust-trust-core/node/canonical_oracle.mjs` — fixture-text/stdin execution while still calling the real `canonicalJson` implementation.
- `labs/rust-trust-core/node/canonical_oracle.test.mjs` — prove fixture-text execution equals file execution.
- `labs/rust-trust-core/EXPERIMENT.md` — Stage 3 truth correction plus Stage 4 methodology/non-claims.
- `docs/MASTER-TODO-SOVEREIGN-HOST-DEPLOYMENT.md` — Stage 3 complete; Stage 4 active and incomplete.
- `mesh/src/check-docs.mjs` — register only the Stage 4 spec and plan; do not weaken inventory rules.
- `.github/workflows/rust-trust-core-lab.yml` — Stage 4 branch/path coverage, Node tests, and promoted-source immutability guard.

**Must remain byte-for-byte unchanged by Stage 4**
- `trust-core/rust/canonical_value_v0.rs`
- `mesh/src/release.mjs`
- `mesh/package.json`
- `mesh/config/capabilities.json`
- supported Gateway/Hypervisor/Sandbox/Grid production sources.

---

### Task 1: Canonical documentation and Stage 3 truth correction

**Files:**
- Modify: `mesh/src/check-docs.mjs`
- Modify: `labs/rust-trust-core/EXPERIMENT.md`
- Modify: `docs/MASTER-TODO-SOVEREIGN-HOST-DEPLOYMENT.md`
- Modify: `.github/workflows/rust-trust-core-lab.yml`

**Interfaces:**
- Consumes: strict canonical-document inventory and accepted Stage 3 boundary.
- Produces: canonical Stage 4 documentation registration, truthful Stage 3 records, and Stage 4 CI triggering. No runtime interface.

- [ ] **Step 1: Create the implementation branch**

Create `feat/rust-trust-core-stage4-adversarial-differential` from the final approved design/plan head. Before execution, compare current protected `main` with signed Stage 3 merge `ec2a480ff8d903fbef89807429c289637e3a0d7c`; if `main` advanced, forward-port only compatible mainline changes before starting TDD.

- [ ] **Step 2: Prove the documentation RED**

Run:

```bash
node mesh/src/check-docs.mjs
```

Expected: FAIL only because the Stage 4 spec/plan are not yet registered in `CANONICAL_DOCUMENTS`.

- [ ] **Step 3: Register exactly the Stage 4 spec and plan**

Add to `CANONICAL_DOCUMENTS` beside the earlier Rust documents:

```js
'docs/superpowers/specs/2026-09-06-rust-trust-core-stage4-adversarial-differential-design.md',
'docs/superpowers/plans/2026-09-06-rust-trust-core-stage4-adversarial-differential.md',
```

Do not remove, wildcard, or relax any existing document check.

- [ ] **Step 4: Correct Stage 3 source-gate wording**

In `labs/rust-trust-core/EXPERIMENT.md`, replace:

```text
release verification runs the Stage 3 Rust-source preflight before the existing release verifier;
```

with:

```text
the Stage 3 Rust-source preflight remains CI/test-bound: the tracked-repository kernel test and dedicated Rust workflow enforce it, while `mesh/src/release.mjs` and `npm --prefix mesh run release:verify` remain unchanged;
```

Replace rollback wording `release-preflight wiring` with `CI/test source-boundary wiring`.

- [ ] **Step 5: Update the sovereign-host migration queue**

Replace the unchecked Stage 3 line with:

```markdown
- [x] Stage 3: move only the accepted pure `canonical-value-v0` candidate into the governed `trust-core/rust/` source boundary without runtime authority.
- [ ] Stage 4: run deterministic adversarial Node-vs-Rust differential conformance over the frozen `canonical-value-v0` domain without changing the promoted Rust implementation or runtime authority.
```

Leave later migration/promotion requirements unchecked.

- [ ] **Step 6: Extend workflow triggering only**

In `.github/workflows/rust-trust-core-lab.yml`:
- add push branch `feat/rust-trust-core-stage4-adversarial-differential`;
- add the Stage 4 spec and plan paths under both `push.paths` and `pull_request.paths`.

Do not add generator commands until Task 2 files exist.

- [ ] **Step 7: Prove documentation GREEN and immutable production surfaces**

Run:

```bash
node mesh/src/check-docs.mjs
git diff --exit-code ec2a480ff8d903fbef89807429c289637e3a0d7c -- \
  trust-core/rust/canonical_value_v0.rs \
  mesh/src/release.mjs \
  mesh/package.json \
  mesh/config/capabilities.json
```

Expected: both PASS.

- [ ] **Step 8: Commit**

```bash
git add mesh/src/check-docs.mjs labs/rust-trust-core/EXPERIMENT.md \
  docs/MASTER-TODO-SOVEREIGN-HOST-DEPLOYMENT.md \
  .github/workflows/rust-trust-core-lab.yml \
  docs/superpowers/specs/2026-09-06-rust-trust-core-stage4-adversarial-differential-design.md \
  docs/superpowers/plans/2026-09-06-rust-trust-core-stage4-adversarial-differential.md
git commit -m "docs: establish Rust Stage 4 adversarial gate"
```

---

### Task 2: Deterministic adversarial corpus generator

**Files:**
- Create: `labs/rust-trust-core/node/canonical_adversarial_corpus.test.mjs`
- Create: `labs/rust-trust-core/node/canonical_adversarial_corpus.mjs`
- Modify: `.github/workflows/rust-trust-core-lab.yml`

**Interfaces:**
- Consumes: frozen `canonical-value-v0` row grammar only.
- Produces:

```js
export const FIXED_SEEDS = Object.freeze([
  0x4158494F,
  0x4D455348,
  0xC0DEF00D,
  0x5EED0004
]);
export const VALID_CASES_PER_SEED = 256;
export const INVALID_CASES_PER_SEED = 64;
export function xorshift32(state) {}
export function generateValidCases(seed) {}
export function generateInvalidCases(seed) {}
export function renderValidFixture(cases) {}
export function renderInvalidFixture(cases) {}
```

CLI:

```text
node canonical_adversarial_corpus.mjs valid
node canonical_adversarial_corpus.mjs invalid
```

- [ ] **Step 1: Write the failing generator contract test**

Create `canonical_adversarial_corpus.test.mjs` asserting exact seeds/counts, deterministic replay, unique IDs, category coverage, and exact invalid-category counts.

Required valid category set:

```js
const REQUIRED_VALID_CATEGORIES = new Set([
  'null_or_bool',
  'zero_or_near',
  'safe_min',
  'safe_max',
  'near_safe_min',
  'near_safe_max',
  'negative_zero',
  'ascii_string',
  'empty_array',
  'mixed_array',
  'negative_zero_array',
  'empty_object',
  'single_object',
  'unordered_object',
  'adjacent_prefix_keys',
  'object_permutation'
]);
```

Required invalid categories:

```js
const INVALID_CATEGORIES = [
  'unknown_kind',
  'duplicate_case_id',
  'invalid_boolean',
  'integer_above_max',
  'integer_below_min',
  'invalid_negative_zero',
  'excluded_string_character',
  'malformed_array_token',
  'nested_token',
  'invalid_object_key',
  'duplicate_object_key',
  'wrong_tsv_columns',
  'payload_over_limit',
  'array_over_limit',
  'object_over_limit',
  'key_over_limit'
];
```

For every seed require exactly four invalid cases per invalid category.

- [ ] **Step 2: Add fixed xorshift known-sequence expectations**

The test must hard-code these first four outputs; it must not derive them by calling the implementation under test:

```js
assert.deepEqual(sequence(0x4158494F, 4), [
  0x46402397, 0x046EB34E, 0x92E453ED, 0x0BA60B81
]);
assert.deepEqual(sequence(0x4D455348, 4), [
  0x02A83B1E, 0xBCB4C69B, 0xA89121A8, 0x182898BA
]);
assert.deepEqual(sequence(0xC0DEF00D, 4), [
  0xC534B322, 0x394B8BCA, 0x4E6F15B3, 0x37FD583F
]);
assert.deepEqual(sequence(0x5EED0004, 4), [
  0x23521132, 0x4FF85088, 0xF8C73DFC, 0xF06EFA40
]);
```

The `sequence` helper in the test calls `xorshift32` repeatedly; only expected constants are independent.

- [ ] **Step 3: Run RED**

Run:

```bash
node --test labs/rust-trust-core/node/canonical_adversarial_corpus.test.mjs
```

Expected: FAIL because `canonical_adversarial_corpus.mjs` does not exist.

- [ ] **Step 4: Implement exact xorshift32**

Create `canonical_adversarial_corpus.mjs` with:

```js
export function xorshift32(state) {
  state = (state ^ (state << 13)) >>> 0;
  state = (state ^ (state >>> 17)) >>> 0;
  state = (state ^ (state << 5)) >>> 0;
  return state >>> 0;
}
```

No `Math.random`, time, OS randomness, locale, network, or environment input.

- [ ] **Step 5: Implement an exact 256-valid-case schedule per seed**

Use these fixed quotas:
- `object_permutation`: 32 cases = 16 A/B pairs;
- each of the other 15 categories: 14 cases = 210 cases;
- add 7 extra `mixed_array` cases and 7 extra `unordered_object` cases.

Total: `32 + 210 + 7 + 7 = 256` exactly.

Each permutation pair must share `permutationGroup` and contain identical unique key/value members in different insertion orders. Example IDs:

```text
adv_4158494f_000_null_or_bool
adv_4158494f_perm_000_a
adv_4158494f_perm_000_b
```

`renderValidFixture` emits exactly three columns:

```text
case_id\tkind\tpayload
```

No category metadata is added to the fixture grammar.

- [ ] **Step 6: Implement exactly 64 invalid cases per seed**

Generate exactly four cases for each of the 16 invalid categories. `renderInvalidFixture` uses the existing Stage 2 escaped-row format:

```text
case_id\tencoded_row
```

Embedded tabs/newlines become literal `\\t` / `\\n`. A `duplicate_case_id` value contains two full fixture rows with the same ID separated by escaped `\\n`.

- [ ] **Step 7: Add CLI rendering without canonicalization**

Use `pathToFileURL` and expose only:

```text
valid   -> complete 1,024-row valid fixture
invalid -> complete 256-row invalid fixture
```

The generator must not import `canonicalJson`.

- [ ] **Step 8: Run GREEN and add CI command**

Run:

```bash
node --test labs/rust-trust-core/node/canonical_adversarial_corpus.test.mjs
```

Expected: PASS.

Then add to `.github/workflows/rust-trust-core-lab.yml` after the existing oracle test:

```yaml
- name: Verify deterministic Stage 4 corpus
  run: node --test labs/rust-trust-core/node/canonical_adversarial_corpus.test.mjs
```

Re-run:

```bash
node --test labs/rust-trust-core/node/canonical_oracle.test.mjs \
  labs/rust-trust-core/node/canonical_adversarial_corpus.test.mjs
git diff --exit-code ec2a480ff8d903fbef89807429c289637e3a0d7c -- trust-core/rust/canonical_value_v0.rs
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add labs/rust-trust-core/node/canonical_adversarial_corpus.mjs \
  labs/rust-trust-core/node/canonical_adversarial_corpus.test.mjs \
  .github/workflows/rust-trust-core-lab.yml
git commit -m "test: add deterministic Rust Stage 4 corpus"
```

---

### Task 3: 1,024-case generated Node-vs-Rust differential

**Files:**
- Modify: `labs/rust-trust-core/node/canonical_oracle.mjs`
- Modify: `labs/rust-trust-core/node/canonical_oracle.test.mjs`
- Create: `labs/rust-trust-core/tests/support/mod.rs`
- Create: `labs/rust-trust-core/tests/support/adversarial.rs`
- Create: `labs/rust-trust-core/tests/canonical_adversarial_differential.rs`

**Interfaces:**
- Node: `runFixtureText(text: string): string`; CLI accepts `-` for stdin.
- Rust support:

```rust
pub fn run_node_with_stdin(script: &Path, args: &[&str], stdin: &str) -> Result<String, String>;
pub fn parse_node_outputs(stdout: &str) -> Result<BTreeMap<String, String>, String>;
pub fn assert_generated_exact_match(seed: u32, case_id: &str, node: &str, rust: &str);
```

- [ ] **Step 1: Write Node RED test for fixture-text execution**

Add:

```js
test('fixture-text execution is identical to file execution', async () => {
  const text = await readFile(FIXTURE, 'utf8');
  assert.equal(runFixtureText(text), await runFixture(FIXTURE));
});
```

Import `runFixtureText` before it exists.

- [ ] **Step 2: Write Rust RED test for generated differential**

Create `canonical_adversarial_differential.rs` with:

```rust
mod support;
use axiom_trust_core_lab::{canonicalize_case, parse_canonical_fixture};
use support::adversarial::{
    assert_generated_exact_match, parse_node_outputs, run_node_with_stdin,
};
```

The first test must:
1. run generator CLI `valid`;
2. assert fixture parses to 1,024 cases;
3. feed identical text to `canonical_oracle.mjs -`;
4. assert Node output has 1,024 unique IDs;
5. canonicalize every Rust case;
6. derive seed from case ID;
7. compare raw bytes for every case;
8. assert exactly 1,024 matches.

Add a second test grouping `*_perm_*_a` / `*_perm_*_b` IDs and asserting each pair's already-verified Node canonical bytes are equal.

- [ ] **Step 3: Run RED**

```bash
node --test labs/rust-trust-core/node/canonical_oracle.test.mjs
cargo test --manifest-path labs/rust-trust-core/Cargo.toml --locked --test canonical_adversarial_differential
```

Expected: FAIL only for missing `runFixtureText` and/or Rust support functions.

- [ ] **Step 4: Implement fixture-text/stdin oracle path**

Refactor `canonical_oracle.mjs` to:

```js
export function runFixtureText(text) {
  return parseFixture(text)
    .map(({ caseId, value }) => `${caseId}\t${canonicalJson(value)}`)
    .join('\n');
}

export async function runFixture(path) {
  return runFixtureText(await readFile(path, 'utf8'));
}
```

CLI:

```js
const path = process.argv[2];
if (!path) throw new TypeError('Usage: canonical_oracle.mjs <fixture-path|->');
const text = path === '-' ? await readFile(0, 'utf8') : await readFile(path, 'utf8');
process.stdout.write(`${runFixtureText(text)}\n`);
```

Do not copy or replace `canonicalJson`.

- [ ] **Step 5: Implement Rust support helpers**

`tests/support/mod.rs`:

```rust
pub mod adversarial;
```

`tests/support/adversarial.rs`:
- use `Command`, `Stdio::piped`, `write_all`, `wait_with_output`;
- reject process start/write/status/UTF-8 errors;
- parse Node output into `BTreeMap` with duplicate-ID rejection;
- compare `node.as_bytes()` to `rust.as_bytes()`;
- diagnostic must include `seed=0x{seed:08x}`, case ID, Node bytes, Rust bytes.

- [ ] **Step 6: Run GREEN**

```bash
node --test labs/rust-trust-core/node/canonical_oracle.test.mjs \
  labs/rust-trust-core/node/canonical_adversarial_corpus.test.mjs
cargo fmt --manifest-path labs/rust-trust-core/Cargo.toml --all -- --check
cargo clippy --manifest-path labs/rust-trust-core/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path labs/rust-trust-core/Cargo.toml --locked
git diff --exit-code ec2a480ff8d903fbef89807429c289637e3a0d7c -- trust-core/rust/canonical_value_v0.rs
```

Expected: all PASS, including existing 17-vector Stage 2 differential coverage.

- [ ] **Step 7: Commit**

```bash
git add labs/rust-trust-core/node/canonical_oracle.mjs \
  labs/rust-trust-core/node/canonical_oracle.test.mjs \
  labs/rust-trust-core/tests/support/mod.rs \
  labs/rust-trust-core/tests/support/adversarial.rs \
  labs/rust-trust-core/tests/canonical_adversarial_differential.rs
git commit -m "test: add generated canonical differential campaign"
```

---

### Task 4: Generated mismatch-detection proof

**Files:**
- Modify: `labs/rust-trust-core/tests/canonical_adversarial_differential.rs`
- Modify: `labs/rust-trust-core/tests/support/adversarial.rs`

**Interfaces:**

```rust
pub fn catch_generated_mismatch(
    seed: u32,
    case_id: &str,
    node: &str,
    rust: &str,
) -> Result<(), String>;
```

- [ ] **Step 1: Write RED test**

Use the first real accepted case from seed `0x4158494F`. Obtain real Node and Rust bytes, then call `catch_generated_mismatch` before it exists. Require returned diagnostic to contain:

```text
seed=0x4158494f
case=
node=
rust=
```

- [ ] **Step 2: Run RED**

```bash
cargo test --manifest-path labs/rust-trust-core/Cargo.toml --locked \
  --test canonical_adversarial_differential \
  generated_comparator_rejects_controlled_real_case_divergence -- --exact
```

Expected: FAIL because helper is missing.

- [ ] **Step 3: Implement comparison-boundary-only perturbation**

In `tests/support/adversarial.rs`, copy the Rust output, append one ASCII space, invoke real `assert_generated_exact_match` inside `std::panic::catch_unwind`, extract the panic string, and return it as `Err`. Do not mutate candidate source, fixture, oracle, or generator.

- [ ] **Step 4: Run GREEN**

```bash
cargo test --manifest-path labs/rust-trust-core/Cargo.toml --locked \
  --test canonical_adversarial_differential \
  generated_comparator_rejects_controlled_real_case_divergence -- --exact
cargo test --manifest-path labs/rust-trust-core/Cargo.toml --locked
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add labs/rust-trust-core/tests/canonical_adversarial_differential.rs \
  labs/rust-trust-core/tests/support/adversarial.rs
git commit -m "test: prove generated differential mismatch detection"
```

---

### Task 5: Fail-closed generated invalid corpus and resource limits

**Files:**
- Create: `labs/rust-trust-core/node/canonical_adversarial_limits.mjs`
- Create: `labs/rust-trust-core/node/canonical_adversarial_limits.test.mjs`
- Modify: `labs/rust-trust-core/tests/support/adversarial.rs`
- Modify: `labs/rust-trust-core/tests/canonical_adversarial_differential.rs`
- Modify: `.github/workflows/rust-trust-core-lab.yml`

**Interfaces:**

Node:

```js
export const STAGE4_LIMITS = Object.freeze({
  maxTotalCases: 2048,
  maxArrayItems: 32,
  maxObjectMembers: 32,
  maxKeyLength: 64,
  maxPayloadBytes: 4096
});
export function validateStage4FixtureLimits(text) {}
export function validateStage4RowLimits(line) {}
```

Rust:

```rust
pub const MAX_TOTAL_CASES: usize = 2048;
pub const MAX_ARRAY_ITEMS: usize = 32;
pub const MAX_OBJECT_MEMBERS: usize = 32;
pub const MAX_KEY_LENGTH: usize = 64;
pub const MAX_PAYLOAD_BYTES: usize = 4096;
pub fn validate_stage4_fixture_limits(text: &str) -> Result<(), String>;
pub fn validate_stage4_row_limits(line: &str) -> Result<(), String>;
```

- [ ] **Step 1: Write Node RED tests for exact limits**

Require accepted row plus `limit + 1` failures:

```js
assert.doesNotThrow(() => validateStage4RowLimits('ok\tscalar_array\tn,b:true'));
assert.throws(() => validateStage4RowLimits(`payload\tascii_string\t${'a'.repeat(4097)}`), /MAX_PAYLOAD_BYTES/);
assert.throws(() => validateStage4RowLimits(`array\tscalar_array\t${Array(33).fill('n').join(',')}`), /MAX_ARRAY_ITEMS/);
assert.throws(() => validateStage4RowLimits(`object\tascii_key_object\t${Array.from({length: 33}, (_, i) => `k${i}=n`).join(';')}`), /MAX_OBJECT_MEMBERS/);
assert.throws(() => validateStage4RowLimits(`key\tascii_key_object\t${'k'.repeat(65)}=n`), /MAX_KEY_LENGTH/);
```

Construct a normal-header fixture with 2,049 body rows and require `/MAX_TOTAL_CASES/`.

- [ ] **Step 2: Write Rust RED tests for limits and 256 invalid rows**

In `canonical_adversarial_differential.rs`:
- import missing Rust constants/validators;
- add one `limit + 1` test per bound;
- run generator CLI `invalid` and assert exactly 256 rows;
- decode escaped rows;
- route Stage 4 over-bound categories through `validate_stage4_row_limits` first;
- route grammar-invalid categories through `parse_canonical_vector_row` or `parse_canonical_fixture`;
- route `duplicate_case_id` through full fixture parsing.

- [ ] **Step 3: Run RED**

```bash
node --test labs/rust-trust-core/node/canonical_adversarial_limits.test.mjs
cargo test --manifest-path labs/rust-trust-core/Cargo.toml --locked --test canonical_adversarial_differential
```

Expected: FAIL for missing validators.

- [ ] **Step 4: Implement Node limits**

Rules:
- exactly three TSV columns for row-limit inspection;
- `Buffer.byteLength(payload, 'utf8')` for payload bytes;
- `scalar_array`: empty = 0 items, else comma count + 1;
- `ascii_key_object`: empty = 0 members, else semicolon count + 1;
- inspect each object key before `=` and enforce 64 ASCII bytes;
- fixture validator normalizes CRLF, removes one trailing empty line, requires normal header, and rejects >2,048 body rows;
- no slicing/truncation.

Do not alter oracle v0 semantics.

- [ ] **Step 5: Implement equivalent Rust test-harness limits**

Use byte lengths (`as_bytes().len()`), identical counting rules, and errors naming the violated constant, e.g.:

```text
Stage 4 MAX_ARRAY_ITEMS exceeded: 33 > 32
```

Do not modify `trust-core/rust/canonical_value_v0.rs`.

- [ ] **Step 6: Prove 256/256 invalid rejection in both paths**

Node tests iterate generated invalid cases and require every case to fail either Stage 4 limit validation or existing Node v0 parsing according to category.

Rust tests do the same against Rust harness limits and promoted parser. Assert exactly 256 rejected and assert every declared category appears.

- [ ] **Step 7: Add CI commands and promoted-source guard**

Add:

```yaml
- name: Verify Stage 4 adversarial limits
  run: node --test labs/rust-trust-core/node/canonical_adversarial_limits.test.mjs

- name: Verify Stage 4 does not modify promoted Rust v0 source
  run: git diff --exit-code ec2a480ff8d903fbef89807429c289637e3a0d7c -- trust-core/rust/canonical_value_v0.rs
```

- [ ] **Step 8: Run full local GREEN**

```bash
node --test \
  labs/rust-trust-core/node/canonical_oracle.test.mjs \
  labs/rust-trust-core/node/canonical_adversarial_corpus.test.mjs \
  labs/rust-trust-core/node/canonical_adversarial_limits.test.mjs
node mesh/src/rust-trust-core-source-boundary.mjs
cargo fmt --manifest-path labs/rust-trust-core/Cargo.toml --all -- --check
cargo clippy --manifest-path labs/rust-trust-core/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path labs/rust-trust-core/Cargo.toml --locked
node mesh/src/check-docs.mjs
git diff --exit-code ec2a480ff8d903fbef89807429c289637e3a0d7c -- \
  trust-core/rust/canonical_value_v0.rs \
  mesh/src/release.mjs \
  mesh/package.json \
  mesh/config/capabilities.json
```

Expected: all PASS.

- [ ] **Step 9: Commit**

```bash
git add labs/rust-trust-core/node/canonical_adversarial_limits.mjs \
  labs/rust-trust-core/node/canonical_adversarial_limits.test.mjs \
  labs/rust-trust-core/tests/support/adversarial.rs \
  labs/rust-trust-core/tests/canonical_adversarial_differential.rs \
  .github/workflows/rust-trust-core-lab.yml
git commit -m "test: fail closed on Stage 4 adversarial bounds"
```

---

### Task 6: Stage 4 experiment record and exact-head acceptance gate

**Files:**
- Modify: `labs/rust-trust-core/EXPERIMENT.md`
- PR metadata: exact accepted head/run evidence is stored in the PR body after CI so evidence recording does not mutate the verified head.

**Interfaces:**
- Consumes: Tasks 1-5 GREEN evidence.
- Produces: reviewable Stage 4 record and one immutable exact-head acceptance snapshot. No runtime authority.

- [ ] **Step 1: Record Stage 4 methodology before final CI**

Add to `EXPERIMENT.md`:

```text
generator: labs/rust-trust-core/node/canonical_adversarial_corpus.mjs
algorithm: xorshift32 with explicit >>> 0 normalization
seeds: 0x4158494F, 0x4D455348, 0xC0DEF00D, 0x5EED0004
generated valid: 1,024
generated invalid/over-bound fixture rows: 256
hand-curated valid: 17
hand-curated malformed: 12
limits: 2048 total / 32 array / 32 object / 64 key / 4096 payload bytes
source gate: CI/test-bound, not release:verify authority
promoted Rust v0 source: unchanged from Stage 3
```

Add halt rule: a real generated Node/Rust mismatch in frozen v0 stops Stage 4 and reopens Stage 3.

Do not add final run numbers/head SHA to the repo file after CI.

- [ ] **Step 2: Run complete pre-PR verification again**

Repeat Task 5 Step 8 after the experiment-record edit. Expected: all PASS.

- [ ] **Step 3: Verify changed-file boundary**

Against Stage 3 base, allowed changed files are exactly within this set:

```text
.github/workflows/rust-trust-core-lab.yml
docs/MASTER-TODO-SOVEREIGN-HOST-DEPLOYMENT.md
docs/superpowers/specs/2026-09-06-rust-trust-core-stage4-adversarial-differential-design.md
docs/superpowers/plans/2026-09-06-rust-trust-core-stage4-adversarial-differential.md
labs/rust-trust-core/EXPERIMENT.md
labs/rust-trust-core/node/canonical_adversarial_corpus.mjs
labs/rust-trust-core/node/canonical_adversarial_corpus.test.mjs
labs/rust-trust-core/node/canonical_adversarial_limits.mjs
labs/rust-trust-core/node/canonical_adversarial_limits.test.mjs
labs/rust-trust-core/node/canonical_oracle.mjs
labs/rust-trust-core/node/canonical_oracle.test.mjs
labs/rust-trust-core/tests/canonical_adversarial_differential.rs
labs/rust-trust-core/tests/support/mod.rs
labs/rust-trust-core/tests/support/adversarial.rs
mesh/src/check-docs.mjs
```

Any change to promoted Rust v0 source, release verifier, capabilities, production runtime, Gateway/Hypervisor/Sandbox/Grid, credentials/state, deployment surfaces, or production manifests is a blocker.

- [ ] **Step 4: Commit final experiment record**

```bash
git add labs/rust-trust-core/EXPERIMENT.md
git commit -m "docs: record Rust Stage 4 adversarial evidence contract"
```

- [ ] **Step 5: Open draft PR with exact title**

```text
feat: add Rust Stage 4 adversarial differential conformance
```

PR body must include:
- evidence-only purpose;
- fixed seeds/counts/limits;
- RED -> GREEN sequence for generator, valid differential, mismatch proof, invalid limits;
- promoted source unchanged;
- Node authoritative;
- source gate CI/test-bound;
- no runtime/capability/effect authority;
- Stage 5 not authorized.

- [ ] **Step 6: Require exact-head workflow success**

For one unchanged PR head require:

```text
Rust Trust-Core Laboratory       completed/success
Clean Kernel                     completed/success
  verify                         success
  container                      success
  compatibility-node-22          success
Windows Compatibility            completed/success
  verify-windows                 success
  verify-macos (macos-15)        success
  verify-macos (macos-15-intel)  success
```

Any commit invalidates prior exact-head evidence.

- [ ] **Step 7: Process all review findings before readiness**

For every finding: verify against current code; valid findings get fresh RED -> GREEN correction plus full exact-head restart; invalid/wording findings get evidence-backed response/correction without authority widening; resolve only after addressed.

- [ ] **Step 8: Update PR body with immutable evidence snapshot**

Without changing repo files, record:
- exact accepted head SHA;
- Node/Rust/Cargo versions;
- 1,024/1,024 generated valid exact matches;
- 256/256 generated invalid rejections in both language paths;
- 17/17 existing valid matches and 12/12 existing malformed rejections;
- deterministic replay/category coverage;
- generated mismatch proof;
- all resource-bound negative tests;
- dependency count `0` and unsafe state `forbidden`;
- exact workflow run numbers/conclusions;
- unresolved review-thread count `0`;
- explicit non-claims.

PR body edits do not alter head SHA.

- [ ] **Step 9: Mark ready only after final immutability check**

Immediately re-read PR head, protected `main`, workflow conclusions, review threads, and changed files. Do not mark ready if head/base incompatibly changed, a check regressed, a blocker exists, or promoted source changed.

- [ ] **Step 10: Stop at Stage 4 acceptance/merge gate**

Do not merge as part of this plan. Report exact head, workflow evidence, review state, changed-file boundary, and non-claims. Stage 5 requires a separate explicit acceptance/merge decision.
