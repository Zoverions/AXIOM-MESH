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

## Planned file structure

**Create**
- `labs/rust-trust-core/node/canonical_adversarial_corpus.mjs` — deterministic xorshift32 corpus generation and CLI rendering only; no canonicalization.
- `labs/rust-trust-core/node/canonical_adversarial_corpus.test.mjs` — generator determinism, seed/count/category, and rendering contract tests.
- `labs/rust-trust-core/node/canonical_adversarial_limits.mjs` — Stage 4 test-harness resource-limit validation for Node-side generated fixtures.
- `labs/rust-trust-core/node/canonical_adversarial_limits.test.mjs` — explicit fail-closed limit tests.
- `labs/rust-trust-core/tests/canonical_adversarial_differential.rs` — generated valid differential campaign, metamorphic object-order evidence, generated mismatch proof, and invalid-case rejection.
- `labs/rust-trust-core/tests/support/mod.rs` — integration-test support module declaration.
- `labs/rust-trust-core/tests/support/adversarial.rs` — Rust-side Stage 4 test-harness limits, Node subprocess helpers, and exact-byte comparison diagnostics.

**Modify**
- `labs/rust-trust-core/node/canonical_oracle.mjs` — add fixture-text/stdin execution while continuing to call the real supported `canonicalJson` implementation.
- `labs/rust-trust-core/node/canonical_oracle.test.mjs` — prove fixture-text execution is identical to file execution.
- `labs/rust-trust-core/EXPERIMENT.md` — correct Stage 3 source-gate truth and document Stage 4 methodology/non-claims before final exact-head CI.
- `docs/MASTER-TODO-SOVEREIGN-HOST-DEPLOYMENT.md` — mark Stage 3 complete and Stage 4 as the active uncompleted migration gate.
- `mesh/src/check-docs.mjs` — register the approved Stage 4 spec and implementation plan as canonical documents; do not relax any inventory rule.
- `.github/workflows/rust-trust-core-lab.yml` — add Stage 4 branch/path coverage, Node generator/limit tests, and an explicit guard that the promoted Rust source remains identical to Stage 3.

**Must remain byte-for-byte unchanged by Stage 4**
- `trust-core/rust/canonical_value_v0.rs`
- `mesh/src/release.mjs`
- `mesh/package.json`
- `mesh/config/capabilities.json`
- Gateway/Hypervisor/Sandbox/Grid production sources.

---

### Task 1: Canonical documentation and Stage 3 truth correction

**Files:**
- Modify: `mesh/src/check-docs.mjs`
- Modify: `labs/rust-trust-core/EXPERIMENT.md`
- Modify: `docs/MASTER-TODO-SOVEREIGN-HOST-DEPLOYMENT.md`
- Modify: `.github/workflows/rust-trust-core-lab.yml`
- Existing: `docs/superpowers/specs/2026-09-06-rust-trust-core-stage4-adversarial-differential-design.md`
- Existing: `docs/superpowers/plans/2026-09-06-rust-trust-core-stage4-adversarial-differential.md`

**Interfaces:**
- Consumes: the repository's existing strict `CANONICAL_DOCUMENTS` inventory and Stage 3 accepted boundary.
- Produces: canonical registration for the Stage 4 spec/plan, truthful Stage 3 records, and CI path/branch triggering for the later Stage 4 test files. No runtime interface changes.

- [ ] **Step 1: Create the implementation branch from the approved design/plan head**

Create `feat/rust-trust-core-stage4-adversarial-differential` from the final commit on `design/rust-trust-core-stage4-adversarial-differential`. Do not branch from a newer unrelated `main` without first comparing it to the signed Stage 3 base and forward-porting only compatible mainline changes.

- [ ] **Step 2: Run documentation verification before registration and preserve the RED evidence**

Run:

```bash
node mesh/src/check-docs.mjs
```

Expected: FAIL because the newly approved Stage 4 spec and plan are not yet in `CANONICAL_DOCUMENTS`. No other documentation failure is acceptable for this RED.

- [ ] **Step 3: Register exactly the two Stage 4 documents**

Add these exact entries adjacent to the earlier Rust migration documents in `mesh/src/check-docs.mjs`:

```js
'docs/superpowers/specs/2026-09-06-rust-trust-core-stage4-adversarial-differential-design.md',
'docs/superpowers/plans/2026-09-06-rust-trust-core-stage4-adversarial-differential.md',
```

Do not remove, wildcard, or weaken any existing canonical-document rule.

- [ ] **Step 4: Correct the stale Stage 3 experiment claim**

In `labs/rust-trust-core/EXPERIMENT.md`, replace the false Stage 3 gate bullet:

```text
release verification runs the Stage 3 Rust-source preflight before the existing release verifier;
```

with:

```text
the Stage 3 Rust-source preflight remains CI/test-bound: the tracked-repository kernel test and dedicated Rust workflow enforce it, while `mesh/src/release.mjs` and `npm --prefix mesh run release:verify` remain unchanged;
```

Also change rollback wording that says `release-preflight wiring` to `CI/test source-boundary wiring` so the rollback record matches the accepted implementation.

- [ ] **Step 5: Bring the master todo up to accepted truth**

Replace:

```markdown
- [ ] Stage 3: move only pure validation/canonicalization candidates after Stage 2 evidence is accepted; do not introduce runtime authority.
```

with:

```markdown
- [x] Stage 3: move only the accepted pure `canonical-value-v0` candidate into the governed `trust-core/rust/` source boundary without runtime authority.
- [ ] Stage 4: run deterministic adversarial Node-vs-Rust differential conformance over the frozen `canonical-value-v0` domain without changing the promoted Rust implementation or runtime authority.
```

Leave the broader later-stage promotion requirements unchecked.

- [ ] **Step 6: Extend workflow triggering only, not Stage 4 commands yet**

In `.github/workflows/rust-trust-core-lab.yml`:

1. add branch `feat/rust-trust-core-stage4-adversarial-differential` under `push.branches`;
2. add the Stage 4 spec and plan paths under both `push.paths` and `pull_request.paths`.

Do not add generator commands until the generator tests exist in Task 2.

- [ ] **Step 7: Verify documentation GREEN**

Run:

```bash
node mesh/src/check-docs.mjs
```

Expected: PASS with the strict inventory intact.

- [ ] **Step 8: Verify prohibited production surfaces are unchanged**

Run:

```bash
git diff --exit-code ec2a480ff8d903fbef89807429c289637e3a0d7c -- trust-core/rust/canonical_value_v0.rs mesh/src/release.mjs mesh/package.json mesh/config/capabilities.json
```

Expected: PASS / no diff.

- [ ] **Step 9: Commit**

```bash
git add mesh/src/check-docs.mjs labs/rust-trust-core/EXPERIMENT.md docs/MASTER-TODO-SOVEREIGN-HOST-DEPLOYMENT.md .github/workflows/rust-trust-core-lab.yml docs/superpowers/specs/2026-09-06-rust-trust-core-stage4-adversarial-differential-design.md docs/superpowers/plans/2026-09-06-rust-trust-core-stage4-adversarial-differential.md
git commit -m "docs: establish Rust Stage 4 adversarial gate"
```

---

### Task 2: Deterministic bounded adversarial corpus generator

**Files:**
- Create: `labs/rust-trust-core/node/canonical_adversarial_corpus.test.mjs`
- Create: `labs/rust-trust-core/node/canonical_adversarial_corpus.mjs`
- Modify: `.github/workflows/rust-trust-core-lab.yml`

**Interfaces:**
- Consumes: frozen `canonical-value-v0` fixture grammar only; it must not import `canonicalJson` or the Rust candidate.
- Produces:
  - `FIXED_SEEDS: readonly number[]`
  - `VALID_CASES_PER_SEED = 256`
  - `INVALID_CASES_PER_SEED = 64`
  - `xorshift32(state: number): number`
  - `generateValidCases(seed: number): Array<{caseId, kind, payload, category, permutationGroup}>`
  - `generateInvalidCases(seed: number): Array<{caseId, encodedRow, category}>`
  - `renderValidFixture(cases): string`
  - `renderInvalidFixture(cases): string`
  - CLI: `node canonical_adversarial_corpus.mjs valid` emits one 1,024-row valid fixture; `... invalid` emits one 256-row `case_id<TAB>encoded_row` invalid fixture.

- [ ] **Step 1: Write the generator contract test before the module exists**

Create `canonical_adversarial_corpus.test.mjs` importing the interfaces above and asserting:

```js
assert.deepEqual(FIXED_SEEDS, [0x4158494F, 0x4D455348, 0xC0DEF00D, 0x5EED0004]);
assert.equal(VALID_CASES_PER_SEED, 256);
assert.equal(INVALID_CASES_PER_SEED, 64);
```

For each fixed seed, assert:

```js
const first = generateValidCases(seed);
const second = generateValidCases(seed);
assert.deepEqual(first, second);
assert.equal(first.length, 256);
assert.equal(new Set(first.map(item => item.caseId)).size, 256);
```

Assert every required valid category appears, including a permutation pair. Use this exact category set:

```js
new Set([
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
])
```

Assert each seed's invalid set has 64 unique IDs and exactly four cases in each of the 16 invalid categories from the spec.

Add a known-sequence test for `xorshift32`, calculating expected constants once from the exact approved transition and committing those constants. Do not calculate the expected sequence by calling `xorshift32` itself.

- [ ] **Step 2: Run the test and preserve the intended RED**

Run:

```bash
node --test labs/rust-trust-core/node/canonical_adversarial_corpus.test.mjs
```

Expected: FAIL because `canonical_adversarial_corpus.mjs` does not exist. Formatting/workflow failures do not count as RED.

- [ ] **Step 3: Implement exact xorshift32 and fixed constants**

Create `canonical_adversarial_corpus.mjs` beginning with:

```js
export const FIXED_SEEDS = Object.freeze([
  0x4158494F,
  0x4D455348,
  0xC0DEF00D,
  0x5EED0004
]);
export const VALID_CASES_PER_SEED = 256;
export const INVALID_CASES_PER_SEED = 64;

export function xorshift32(state) {
  state = (state ^ (state << 13)) >>> 0;
  state = (state ^ (state >>> 17)) >>> 0;
  state = (state ^ (state << 5)) >>> 0;
  return state >>> 0;
}
```

No call may use `Math.random`, `Date`, `crypto.random*`, locale-sensitive comparison, network input, or environment variables.

- [ ] **Step 4: Implement the deterministic valid category schedule**

Use a fixed quota schedule so category appearance is guaranteed rather than probabilistic:

- 32 cases (16 A/B pairs) for `object_permutation`;
- at least 16 cases for each of the other 15 categories;
- allocate any remaining exact quota deterministically to `mixed_array` and `unordered_object` until the total is exactly 256.

Every `object_permutation` pair must share a non-null `permutationGroup` and contain identical unique key/value members in different insertion orders.

Use generated case IDs that encode seed and sequence, for example:

```text
adv_4158494f_000_null_or_bool
adv_4158494f_perm_000_a
adv_4158494f_perm_000_b
```

Do not add a new fixture column for category metadata; category/permutation metadata exists only in the in-memory generator object. `renderValidFixture` must emit exactly:

```text
case_id\tkind\tpayload
...
```

- [ ] **Step 5: Implement the exact 64-invalid-case schedule per seed**

Use 16 fixed invalid categories with exactly four cases each:

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

`renderInvalidFixture` must use the existing escaped-row convention:

```text
case_id\tencoded_row
...
```

where embedded tabs/newlines are rendered as literal `\\t` / `\\n`.

For `duplicate_case_id`, the encoded row value must contain two full fixture rows with the same ID separated by escaped `\\n`, matching the Stage 2 invalid-fixture convention.

- [ ] **Step 6: Add CLI rendering without adding canonicalization**

At module bottom:

```js
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const mode = process.argv[2];
  if (mode === 'valid') process.stdout.write(renderValidFixture(allValidCases()));
  else if (mode === 'invalid') process.stdout.write(renderInvalidFixture(allInvalidCases()));
  else throw new TypeError('Usage: canonical_adversarial_corpus.mjs <valid|invalid>');
}
```

The generator must not import `mesh/src/lib/canonical.mjs`.

- [ ] **Step 7: Run generator tests GREEN**

Run:

```bash
node --test labs/rust-trust-core/node/canonical_adversarial_corpus.test.mjs
```

Expected: PASS with 1,024 total valid cases and 256 total invalid cases across the fixed seeds.

- [ ] **Step 8: Add the generator test to dedicated CI**

In `.github/workflows/rust-trust-core-lab.yml`, immediately after the existing Node oracle test add:

```yaml
- name: Verify deterministic Stage 4 corpus
  run: node --test labs/rust-trust-core/node/canonical_adversarial_corpus.test.mjs
```

- [ ] **Step 9: Re-run Node tests and source immutability guard**

Run:

```bash
node --test labs/rust-trust-core/node/canonical_oracle.test.mjs labs/rust-trust-core/node/canonical_adversarial_corpus.test.mjs
git diff --exit-code ec2a480ff8d903fbef89807429c289637e3a0d7c -- trust-core/rust/canonical_value_v0.rs
```

Expected: both PASS.

- [ ] **Step 10: Commit**

```bash
git add labs/rust-trust-core/node/canonical_adversarial_corpus.mjs labs/rust-trust-core/node/canonical_adversarial_corpus.test.mjs .github/workflows/rust-trust-core-lab.yml
git commit -m "test: add deterministic Rust Stage 4 corpus"
```

---

### Task 3: Generated valid Node-vs-Rust differential campaign

**Files:**
- Modify: `labs/rust-trust-core/node/canonical_oracle.mjs`
- Modify: `labs/rust-trust-core/node/canonical_oracle.test.mjs`
- Create: `labs/rust-trust-core/tests/support/mod.rs`
- Create: `labs/rust-trust-core/tests/support/adversarial.rs`
- Create: `labs/rust-trust-core/tests/canonical_adversarial_differential.rs`

**Interfaces:**
- Consumes: Task 2 `valid` CLI output and existing Rust exports `parse_canonical_fixture`, `canonicalize_case`, `CanonicalCase`.
- Produces:
  - Node `runFixtureText(text: string): string` using the actual `canonicalJson` implementation;
  - Node CLI `canonical_oracle.mjs -` reading fixture text from stdin;
  - Rust support `run_node_with_stdin(script: &Path, args: &[&str], stdin: &str) -> Result<String, String>`;
  - Rust support `parse_node_outputs(stdout: &str) -> Result<BTreeMap<String,String>,String>` with duplicate-ID rejection;
  - Rust support `assert_generated_exact_match(seed: u32, case_id: &str, node: &str, rust: &str)`;
  - generated valid differential test proving 1,024/1,024 byte equality plus metamorphic object-permutation equality.

- [ ] **Step 1: Extend the Node oracle unit test first**

Add a test that imports `runFixtureText` before it exists:

```js
test('fixture-text execution is identical to file execution', async () => {
  const text = await readFile(FIXTURE, 'utf8');
  assert.equal(runFixtureText(text), await runFixture(FIXTURE));
});
```

- [ ] **Step 2: Add the Rust generated-differential test before its support interfaces exist**

Create `canonical_adversarial_differential.rs` importing:

```rust
mod support;
use axiom_trust_core_lab::{canonicalize_case, parse_canonical_fixture};
use support::adversarial::{
    assert_generated_exact_match, parse_node_outputs, run_node_with_stdin,
};
```

The first test must invoke the generator's `valid` mode, require exactly 1,024 parsed cases, send the same fixture text to the Node oracle via stdin, canonicalize every Rust case, and compare raw bytes.

Add a second test that identifies `*_perm_*_a` / `*_perm_*_b` pairs by case ID and asserts each pair's Node canonical bytes are equal after each individual case has already passed Node-vs-Rust comparison.

- [ ] **Step 3: Run Node and Rust tests and preserve the intended RED**

Run:

```bash
node --test labs/rust-trust-core/node/canonical_oracle.test.mjs
cargo test --manifest-path labs/rust-trust-core/Cargo.toml --locked --test canonical_adversarial_differential
```

Expected: FAIL specifically for missing `runFixtureText` and/or the new Rust support module/functions. Do not accept failure from formatting, the generator, or the promoted source.

- [ ] **Step 4: Implement fixture-text/stdin oracle support**

Refactor `canonical_oracle.mjs` so canonicalization remains in one function:

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

Update CLI input handling:

```js
const path = process.argv[2];
if (!path) throw new TypeError('Usage: canonical_oracle.mjs <fixture-path|->');
const text = path === '-' ? await readFile(0, 'utf8') : await readFile(path, 'utf8');
process.stdout.write(`${runFixtureText(text)}\n`);
```

Do not duplicate or replace `canonicalJson`.

- [ ] **Step 5: Implement Rust subprocess and duplicate-aware output support**

Create `tests/support/mod.rs`:

```rust
pub mod adversarial;
```

In `tests/support/adversarial.rs`, implement `run_node_with_stdin` with `std::process::Command`, `Stdio::piped`, `write_all`, and `wait_with_output`. Reject nonzero status and non-UTF-8 output.

Implement `parse_node_outputs` using a `BTreeMap` and reject duplicate IDs exactly as the Stage 2 harness does:

```rust
if outputs.insert(case_id.to_owned(), canonical.to_owned()).is_some() {
    return Err(format!("duplicate Node oracle case_id: {case_id}"));
}
```

Implement `assert_generated_exact_match` using `assert_eq!(node.as_bytes(), rust.as_bytes(), ...)` and include `seed=0x{seed:08x}`, `case_id`, Node bytes, and Rust bytes in the diagnostic.

- [ ] **Step 6: Make the 1,024-case differential test GREEN**

The test must:

1. call the generator CLI `valid`;
2. parse with `parse_canonical_fixture`;
3. assert `cases.len() == 1024`;
4. send identical fixture text to `canonical_oracle.mjs -`;
5. assert Node output count is 1,024;
6. derive the seed from `case_id` and compare every Rust result with `assert_generated_exact_match`;
7. assert all 1,024 matched.

For object permutation pairs, use the case-ID `perm_<group>_a/b` convention and assert both Node bytes are equal.

- [ ] **Step 7: Run GREEN verification**

Run:

```bash
node --test labs/rust-trust-core/node/canonical_oracle.test.mjs labs/rust-trust-core/node/canonical_adversarial_corpus.test.mjs
cargo fmt --manifest-path labs/rust-trust-core/Cargo.toml --all -- --check
cargo clippy --manifest-path labs/rust-trust-core/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path labs/rust-trust-core/Cargo.toml --locked
```

Expected: all PASS; the existing 17-case Stage 2 differential test must remain green.

- [ ] **Step 8: Confirm promoted source is still unchanged**

Run:

```bash
git diff --exit-code ec2a480ff8d903fbef89807429c289637e3a0d7c -- trust-core/rust/canonical_value_v0.rs
```

Expected: PASS / no diff. If it fails, stop Stage 4 rather than editing the source.

- [ ] **Step 9: Commit**

```bash
git add labs/rust-trust-core/node/canonical_oracle.mjs labs/rust-trust-core/node/canonical_oracle.test.mjs labs/rust-trust-core/tests/support/mod.rs labs/rust-trust-core/tests/support/adversarial.rs labs/rust-trust-core/tests/canonical_adversarial_differential.rs
git commit -m "test: add generated canonical differential campaign"
```

---

### Task 4: Generated mismatch-detection proof

**Files:**
- Modify: `labs/rust-trust-core/tests/canonical_adversarial_differential.rs`
- Modify: `labs/rust-trust-core/tests/support/adversarial.rs`

**Interfaces:**
- Consumes: Task 3 real generated case, real Node oracle bytes, and real Rust candidate bytes.
- Produces: a controlled generated mismatch proof that fails at the byte comparator and reports seed/case/Node/Rust provenance without modifying the promoted source.

- [ ] **Step 1: Write the mismatch test before the dedicated probe helper exists**

Add a test that obtains the first accepted generated case from seed `0x4158494F`, computes real Node and Rust bytes, then calls a not-yet-existing helper:

```rust
let panic = catch_generated_mismatch(
    seed,
    case.case_id(),
    node_bytes,
    rust_bytes,
).expect_err("perturbed generated bytes must be rejected");
```

The helper contract is:

```rust
pub fn catch_generated_mismatch(
    seed: u32,
    case_id: &str,
    node: &str,
    rust: &str,
) -> Result<(), String>
```

It must perturb only the comparison input (for example append one ASCII space to a copy of the Rust string), invoke the real `assert_generated_exact_match`, catch the panic, and return its diagnostic string as `Err`.

- [ ] **Step 2: Run the targeted test and preserve RED**

Run:

```bash
cargo test --manifest-path labs/rust-trust-core/Cargo.toml --locked --test canonical_adversarial_differential generated_comparator_rejects_controlled_real_case_divergence -- --exact
```

Expected: FAIL because `catch_generated_mismatch` does not exist.

- [ ] **Step 3: Implement only the comparison-boundary probe helper**

In `tests/support/adversarial.rs`, implement `catch_generated_mismatch` using `std::panic::catch_unwind`. Clone/perturb the Rust output string only inside this helper; do not change the candidate, fixture, oracle, or generator.

Return an error diagnostic containing all of:

```text
seed=0x4158494f
case=<actual generated case id>
node=
rust=
```

- [ ] **Step 4: Run targeted and full tests GREEN**

Run:

```bash
cargo test --manifest-path labs/rust-trust-core/Cargo.toml --locked --test canonical_adversarial_differential generated_comparator_rejects_controlled_real_case_divergence -- --exact
cargo test --manifest-path labs/rust-trust-core/Cargo.toml --locked
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add labs/rust-trust-core/tests/canonical_adversarial_differential.rs labs/rust-trust-core/tests/support/adversarial.rs
git commit -m "test: prove generated differential mismatch detection"
```

---

### Task 5: Fail-closed malformed corpus and resource limits

**Files:**
- Create: `labs/rust-trust-core/node/canonical_adversarial_limits.mjs`
- Create: `labs/rust-trust-core/node/canonical_adversarial_limits.test.mjs`
- Modify: `labs/rust-trust-core/tests/support/adversarial.rs`
- Modify: `labs/rust-trust-core/tests/canonical_adversarial_differential.rs`
- Modify: `.github/workflows/rust-trust-core-lab.yml`

**Interfaces:**
- Consumes: Task 2 `invalid` CLI output; existing Node `decodeVectorRow`/`parseFixture`; existing promoted Rust `parse_canonical_vector_row`/`parse_canonical_fixture`.
- Produces parallel Node/Rust Stage 4 harness-limit validators with exact constants and no truncation.

Node exports:

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

Rust support exports:

```rust
pub const MAX_TOTAL_CASES: usize = 2048;
pub const MAX_ARRAY_ITEMS: usize = 32;
pub const MAX_OBJECT_MEMBERS: usize = 32;
pub const MAX_KEY_LENGTH: usize = 64;
pub const MAX_PAYLOAD_BYTES: usize = 4096;
pub fn validate_stage4_fixture_limits(text: &str) -> Result<(), String>;
pub fn validate_stage4_row_limits(line: &str) -> Result<(), String>;
```

- [ ] **Step 1: Write Node limit tests before the validator exists**

Create `canonical_adversarial_limits.test.mjs` asserting accepted rows pass and each exact bound fails when exceeded by one:

```js
assert.doesNotThrow(() => validateStage4RowLimits('ok\tscalar_array\tn,b:true'));
assert.throws(() => validateStage4RowLimits(`payload\tascii_string\t${'a'.repeat(4097)}`), /MAX_PAYLOAD_BYTES/);
assert.throws(() => validateStage4RowLimits(`array\tscalar_array\t${Array(33).fill('n').join(',')}`), /MAX_ARRAY_ITEMS/);
assert.throws(() => validateStage4RowLimits(`object\tascii_key_object\t${Array.from({length: 33}, (_, i) => `k${i}=n`).join(';')}`), /MAX_OBJECT_MEMBERS/);
assert.throws(() => validateStage4RowLimits(`key\tascii_key_object\t${'k'.repeat(65)}=n`), /MAX_KEY_LENGTH/);
```

Construct a 2,049-row fixture and require `validateStage4FixtureLimits` to throw `/MAX_TOTAL_CASES/` before semantic parsing.

- [ ] **Step 2: Add Rust RED tests for the same bounds and generated invalid corpus**

In `canonical_adversarial_differential.rs`, import the not-yet-existing Rust limit validators/constants and add:

1. one targeted test per limit using `limit + 1`;
2. a generated-invalid test that runs `canonical_adversarial_corpus.mjs invalid`, asserts exactly 256 invalid cases, decodes each escaped row, and proves rejection.

Rejection rule:

- Stage 4 over-bound categories must be rejected by `validate_stage4_row_limits` before the v0 parser is called;
- grammar-invalid categories must be within harness limits and then be rejected by `parse_canonical_vector_row` or `parse_canonical_fixture`;
- `duplicate_case_id` must be tested through full fixture parsing, never by a single-row parser.

- [ ] **Step 3: Run Node/Rust tests and preserve RED**

Run:

```bash
node --test labs/rust-trust-core/node/canonical_adversarial_limits.test.mjs
cargo test --manifest-path labs/rust-trust-core/Cargo.toml --locked --test canonical_adversarial_differential
```

Expected: FAIL for missing limit validators, not because the promoted source was changed.

- [ ] **Step 4: Implement Node limits with byte-count semantics**

In `canonical_adversarial_limits.mjs`:

- split each row into exactly 3 TSV columns for limit inspection;
- use `Buffer.byteLength(payload, 'utf8')` for `MAX_PAYLOAD_BYTES`;
- for `scalar_array`, count comma-separated items only when payload is non-empty;
- for `ascii_key_object`, count semicolon-separated members and inspect the key before `=`;
- enforce `MAX_KEY_LENGTH` using ASCII byte length;
- in fixture validation, normalize CRLF, remove one trailing empty line, verify the normal header, and reject more than 2,048 body rows;
- never slice/truncate input to make it fit.

Limit validation is Stage 4 harness behavior only; do not alter `canonical_oracle.mjs` v0 semantics.

- [ ] **Step 5: Implement equivalent Rust test-harness limits**

In `tests/support/adversarial.rs`, implement the exact constants and validators using `payload.as_bytes().len()` and the same structural counting rules. Return errors naming the exact violated constant, for example:

```text
Stage 4 MAX_ARRAY_ITEMS exceeded: 33 > 32
```

Do not modify `trust-core/rust/canonical_value_v0.rs` to enforce these test-harness limits.

- [ ] **Step 6: Make all 256 generated invalid cases fail closed**

In Node tests, iterate Task 2's generated invalid cases and require each case to fail either Stage 4 limit validation or the existing Node v0 parser according to its category.

In Rust tests, do the same against the Rust test-harness validator and promoted parser. Assert exactly 256/256 rejected in each language path.

No invalid case may be silently skipped. The test must fail if a category produces zero cases.

- [ ] **Step 7: Add limit tests to dedicated CI**

In `.github/workflows/rust-trust-core-lab.yml`, add after generator verification:

```yaml
- name: Verify Stage 4 adversarial limits
  run: node --test labs/rust-trust-core/node/canonical_adversarial_limits.test.mjs
```

Add a promoted-source immutability step before Rust compilation:

```yaml
- name: Verify Stage 4 does not modify promoted Rust v0 source
  run: git diff --exit-code ec2a480ff8d903fbef89807429c289637e3a0d7c -- trust-core/rust/canonical_value_v0.rs
```

- [ ] **Step 8: Run full Stage 4 local verification**

Run:

```bash
node --test labs/rust-trust-core/node/canonical_oracle.test.mjs labs/rust-trust-core/node/canonical_adversarial_corpus.test.mjs labs/rust-trust-core/node/canonical_adversarial_limits.test.mjs
node mesh/src/rust-trust-core-source-boundary.mjs
cargo fmt --manifest-path labs/rust-trust-core/Cargo.toml --all -- --check
cargo clippy --manifest-path labs/rust-trust-core/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path labs/rust-trust-core/Cargo.toml --locked
node mesh/src/check-docs.mjs
git diff --exit-code ec2a480ff8d903fbef89807429c289637e3a0d7c -- trust-core/rust/canonical_value_v0.rs mesh/src/release.mjs mesh/package.json mesh/config/capabilities.json
```

Expected: all PASS.

- [ ] **Step 9: Commit**

```bash
git add labs/rust-trust-core/node/canonical_adversarial_limits.mjs labs/rust-trust-core/node/canonical_adversarial_limits.test.mjs labs/rust-trust-core/tests/support/adversarial.rs labs/rust-trust-core/tests/canonical_adversarial_differential.rs .github/workflows/rust-trust-core-lab.yml
git commit -m "test: fail closed on Stage 4 adversarial bounds"
```

---

### Task 6: Stage 4 record, PR, and exact-head acceptance evidence

**Files:**
- Modify: `labs/rust-trust-core/EXPERIMENT.md`
- Modify: `.github/workflows/rust-trust-core-lab.yml` only if path coverage is incomplete; no semantic CI changes after the final evidence record is written.
- PR metadata: Stage 4 pull request body (not a repository file) carries exact run numbers/conclusions after CI so recording evidence does not change the verified commit.

**Interfaces:**
- Consumes: all Task 1-5 GREEN evidence.
- Produces: reviewable Stage 4 experiment record and one immutable exact-head acceptance snapshot. It does not produce runtime authority.

- [ ] **Step 1: Update the experiment record before final exact-head verification**

Add a Stage 4 section to `labs/rust-trust-core/EXPERIMENT.md` recording:

```text
- generator: labs/rust-trust-core/node/canonical_adversarial_corpus.mjs
- algorithm: xorshift32 with explicit >>> 0 normalization
- seeds: 0x4158494F, 0x4D455348, 0xC0DEF00D, 0x5EED0004
- generated valid: 1,024
- generated invalid/over-bound fixture rows: 256
- existing hand-curated valid: 17
- existing hand-curated malformed: 12
- limits: 2048 total / 32 array / 32 object / 64 key / 4096 payload bytes
- Node remains oracle; Rust remains non-authoritative
- promoted source unchanged from Stage 3
- source gate remains CI/test-bound, not release:verify authority
```

Also add Stage 4 halt criteria: any real generated Node/Rust mismatch in the frozen v0 domain stops Stage 4 and reopens Stage 3.

Do **not** put CI run numbers or a final head SHA in this file after verification; those belong in PR metadata so recording them cannot invalidate the exact head.

- [ ] **Step 2: Run the complete pre-PR verification suite**

Run the full command block from Task 5 Step 8 again after the experiment-record edit.

Expected: all PASS.

- [ ] **Step 3: Verify the final diff is bounded**

Compare against Stage 3 base and require that changed files are limited to:

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

Any change to `trust-core/rust/canonical_value_v0.rs`, capability registry, production runtime, release verifier, Gateway, Hypervisor, Sandbox, Grid, credentials/state, compose/deployment, or production dependency manifests is a blocker requiring review before proceeding.

- [ ] **Step 4: Commit the final Stage 4 record**

```bash
git add labs/rust-trust-core/EXPERIMENT.md
git commit -m "docs: record Rust Stage 4 adversarial evidence contract"
```

- [ ] **Step 5: Open the pull request as draft**

Use a title such as:

```text
feat: add Rust Stage 4 adversarial differential conformance
```

PR body must state:

- evidence-only Stage 4 purpose;
- fixed seeds/counts/limits;
- TDD RED -> GREEN sequence for generator, valid differential, mismatch proof, and invalid limits;
- promoted source unchanged;
- Node remains authoritative;
- source gate remains CI/test-bound;
- no runtime/capability/effect authority;
- Stage 5 not authorized.

- [ ] **Step 6: Require exact-head workflow completion**

Record the PR head SHA, then require all workflow families on that exact head:

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

Do not reuse earlier-head evidence after any commit.

- [ ] **Step 7: Review every new comment/thread before readiness**

For each review finding:

1. verify the claim against current code;
2. if valid, use a fresh RED -> GREEN correction and restart exact-head evidence;
3. if invalid or wording-only, respond with the verified boundary and correct misleading text without widening authority;
4. resolve only after the concern is actually addressed.

- [ ] **Step 8: Update PR metadata with the immutable evidence snapshot**

Without changing repository files, add to the PR body:

- exact accepted head SHA;
- exact Rust/Node toolchain versions;
- 1,024/1,024 generated valid matches;
- 256/256 generated invalid rejections in both language paths;
- 17/17 existing valid matches and 12/12 existing malformed rejections;
- deterministic replay/category coverage result;
- generated mismatch proof result;
- dependency count `0` and unsafe state `forbidden`;
- exact workflow run numbers and conclusions;
- unresolved review-thread count `0`;
- explicit Stage 4 non-claims.

PR-body edits do not change the head SHA.

- [ ] **Step 9: Mark ready for review only after the final immutability gate**

Immediately before changing draft state, re-read:

- PR head SHA;
- protected `main` SHA;
- workflow conclusions attached to the PR head;
- review threads;
- changed-file list.

If the PR head changed, `main` advanced incompatibly, a workflow regressed, an unresolved blocker appeared, or the promoted source changed, do not mark ready.

- [ ] **Step 10: Stop at the Stage 4 acceptance/merge gate**

Do not merge automatically as part of implementation-plan execution. Report the exact head, workflow evidence, review state, changed-file boundary, and non-claims. Stage 5 begins only after a separate explicit Stage 4 acceptance/merge decision.
