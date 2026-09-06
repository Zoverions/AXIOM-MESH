# Rust Trust-Core Stage 4 Adversarial Differential Conformance — Design

**Status:** approved architectural direction; written-spec review gate

**Date:** 2026-09-06

**Stage 3 base:** signed merge commit `ec2a480ff8d903fbef89807429c289637e3a0d7c`

**Scope:** deepen evidence for the already-promoted pure `canonical-value-v0` Rust candidate through a deterministic adversarial Node-vs-Rust differential campaign. Stage 4 does not expand the admitted semantic domain, create a production Rust package, introduce a supported Rust runtime path, alter `release:verify`, or move any authority from the supported Node.js kernel.

## 1. Decision

Stage 4 will keep the exact Stage 3 source boundary and the frozen `canonical-value-v0` semantics, then substantially increase differential evidence using a deterministic generated corpus.

The supported Node implementation remains the executable oracle:

`mesh/src/lib/canonical.mjs`

The promoted Rust source remains:

`trust-core/rust/canonical_value_v0.rs`

The laboratory remains the only place where Rust executes.

Stage 4 therefore changes **evidence depth**, not **runtime authority** or **semantic breadth**.

The intended claim after a successful Stage 4 gate is only:

> At the accepted exact commit, the already-promoted Rust `canonical-value-v0` candidate produced byte-identical results to the supported Node oracle across the frozen hand-curated corpus and a bounded deterministic adversarial corpus, while malformed and over-bound inputs failed closed.

That claim does not authorize a supported Node call site to be replaced.

## 2. Why Stage 4 does not expand to `canonical-value-v1`

Three approaches were considered.

### A. Deterministic adversarial differential testing inside v0

Keep the existing semantics and source boundary, then generate a much larger reproducible corpus that stresses boundary values, ordering, combinations, malformed input, and comparison failure behavior.

**Selected.** It isolates one question: whether the already-promoted implementation continues to match the supported oracle under substantially stronger evidence.

### B. Recursive `canonical-value-v1`

Add nested arrays and objects while retaining restricted strings and safe integers.

This would increase useful semantic coverage, but it simultaneously introduces recursive grammar, resource-depth limits, parser behavior, stack/heap behavior, and recursive canonicalization. A failure would be harder to localize to parser semantics versus canonicalization semantics.

**Deferred.** It should be a separate later conformance gate after Stage 4 establishes stronger v0 confidence.

### C. Broad JSON parity

Add recursive values, Unicode and escaping, UTF-16 ordering, floating-point formatting, and wider JSON behavior together.

This mixes multiple independently security-relevant semantics and would be too large for one auditable gate.

**Rejected for Stage 4.**

## 3. Authority and source boundaries

Stage 4 preserves all Stage 3 authority limits.

It must not:

- add a `Cargo.toml` or Rust binary under `trust-core/`;
- add FFI, WASM, subprocess, service, or runtime integration from supported production code into Rust;
- register a capability for the Rust candidate;
- add or alter a Gateway route;
- call the Hypervisor, Sandbox, or Grid from Rust;
- read production identities, credentials, secrets, user data, receipts, or durable state;
- open a listener or perform egress;
- make Rust part of the candidate production image;
- make the Rust result authoritative over the Node result;
- modify `mesh/src/release.mjs` or the `release:verify` execution path merely to enforce Stage 4 evidence.

The Stage 3 Rust candidate-source gate remains **CI/test-bound**. It runs through the tracked-repository kernel test surface and the dedicated Rust Trust-Core Laboratory workflow. It is not a production release-verifier authority in Stage 4.

The protected authority path remains:

```text
Gateway -> Hypervisor -> Sandbox -> Grid
```

Node remains authoritative throughout Stage 4.

The planned Stage 4 implementation must not modify `trust-core/rust/canonical_value_v0.rs`. If the adversarial corpus reveals that the promoted source violates the already-frozen v0 contract, Stage 4 halts and Stage 3 acceptance is explicitly reopened. A correction to the promoted source then requires its own fail-closed correction gate and exact-head verification before Stage 4 can resume. Stage 4 must not silently “fix forward” the implementation it is supposed to evaluate.

## 4. Frozen semantic domain

Stage 4 does not change the `canonical-value-v0` grammar.

The admitted domain remains:

- `null`;
- booleans;
- safe integers in `-9007199254740991..9007199254740991`;
- negative zero, which canonicalizes as JSON `0`;
- printable ASCII strings U+0020 through U+007E excluding `"` and `\`;
- scalar arrays preserving element order;
- flat objects with unique ASCII keys matching `[A-Za-z0-9._-]{1,64}` and scalar values, canonicalized by key order.

The existing hand-curated fixtures remain mandatory:

- `labs/rust-trust-core/fixtures/canonical-value-v0.tsv`;
- `labs/rust-trust-core/fixtures/canonical-value-v0-invalid.tsv`.

Generated evidence supplements those fixtures; it does not replace them.

## 5. Deterministic adversarial corpus

Stage 4 adds one Node-based bounded deterministic corpus generator:

`labs/rust-trust-core/node/canonical_adversarial_corpus.mjs`

Its direct unit tests live at:

`labs/rust-trust-core/node/canonical_adversarial_corpus.test.mjs`

The Rust differential integration consumes the generator output from:

`labs/rust-trust-core/tests/canonical_adversarial_differential.rs`

Node is selected for the generator because the generator emits only the already-frozen language-neutral fixture grammar; it does not perform canonicalization and does not decide pass/fail. The real Node oracle and the promoted Rust candidate independently process the same emitted rows. Input generation therefore does not make the generator an authority implementation.

The generator is test infrastructure only. It is not a production protocol, parser, runtime component, or source of authority.

### 5.1 Reproducibility

The generator must:

- use only standard Node runtime primitives already available in the laboratory toolchain;
- use the exact xorshift32 state transition specified below;
- use fixed published seeds committed in source;
- produce the same ordered case stream for the same seed on every supported CI host;
- avoid host time, OS randomness, locale, filesystem ordering, environment variables, or network input;
- encode seed and sequence number into every generated `case_id`;
- fail if a duplicate generated `case_id` occurs.

The xorshift32 transition is:

```text
state ^= state << 13
state = state >>> 0
state ^= state >>> 17
state = state >>> 0
state ^= state << 5
state = state >>> 0
```

The implementation must preserve these explicit unsigned 32-bit normalizations. The algorithm and seed list are part of the Stage 4 evidence contract and must not change silently.

The initial fixed seeds are:

```text
0x4158494F
0x4D455348
0xC0DEF00D
0x5EED0004
```

These values are identifiers for reproducibility only; they carry no cryptographic meaning.

### 5.2 Corpus size

The accepted Stage 4 run must generate exactly:

- **1,024 valid cases** total: 256 per fixed seed;
- **256 malformed or over-bound fixture cases** total: 64 per fixed seed.

The existing 17 valid and 12 malformed hand-curated cases remain separate required evidence.

Harness-level negative tests that intentionally exceed `MAX_TOTAL_CASES` are separate from the 256 malformed fixture cases and do not change that exact corpus count.

A later change in generated case counts, seeds, generator algorithm, or category allocation invalidates prior Stage 4 exact-head evidence and requires a new reviewed gate.

### 5.3 Valid-case category coverage

Each seed's 256 valid cases must deterministically include all of these categories rather than relying on random frequency:

1. null and boolean scalars;
2. zero and nearby integers;
3. minimum and maximum JavaScript safe integers;
4. values immediately adjacent to the safe-integer boundaries while still admitted;
5. negative zero;
6. printable admitted ASCII strings across short and maximum-length patterns;
7. empty scalar arrays;
8. bounded scalar arrays containing mixed admitted scalar kinds;
9. arrays placing negative zero at the first, middle, and final positions;
10. empty objects;
11. single-member objects;
12. multi-member objects with insertion orders different from canonical key order;
13. key sets containing lexicographically adjacent and prefix-like admitted ASCII keys;
14. paired object permutations containing the same unique key/value members in different insertion orders.

The category schedule must be deterministic and reviewable. The pseudo-random state may choose values inside a category, but it must not decide whether a required category appears at all.

### 5.4 Metamorphic evidence

For generated paired object permutations, Stage 4 must assert both:

- each individual Rust result is byte-identical to the Node oracle result; and
- both permutations produce the same canonical bytes.

This is additional evidence for the already-admitted object-key-ordering rule. It does not create a new semantic domain.

Array order is not normalized. The generator must include distinct arrays whose element order differs and must not assert that those outputs are equal.

## 6. Malformed and over-bound corpus

Each fixed seed also produces a deterministic set of invalid fixture rows.

The 256 generated malformed/over-bound fixture cases must cover:

- unknown `kind`;
- duplicate `case_id`;
- invalid boolean token;
- integer above `9007199254740991`;
- integer below `-9007199254740991`;
- malformed negative-zero representation;
- strings containing excluded quote or backslash characters;
- malformed array scalar tokens;
- unsupported nested array/object tokens;
- invalid object keys;
- duplicate object keys;
- missing or extra TSV columns;
- payloads exceeding the Stage 4 harness payload limit;
- arrays exceeding the Stage 4 harness width limit;
- objects exceeding the Stage 4 harness member limit.

Separate harness-level negative tests must exceed the Stage 4 total-corpus limit and prove that over-count input fails closed before comparison. Those over-count tests do not count toward the 256 generated invalid fixture rows.

Invalid cases must fail closed. They must not be truncated, coerced, normalized into a valid case, silently dropped, or accepted with a warning.

## 7. Explicit resource limits

Stage 4 introduces bounded test-harness limits to prevent a conformance test from becoming an accidental resource-amplification path.

The initial limits are:

```text
MAX_TOTAL_CASES = 2048
MAX_ARRAY_ITEMS = 32
MAX_OBJECT_MEMBERS = 32
MAX_KEY_LENGTH = 64
MAX_PAYLOAD_BYTES = 4096
```

These are laboratory evidence limits, not production protocol limits.

The generator's accepted corpus must stay below them by construction. Dedicated negative tests must prove each relevant bound fails closed when exceeded.

No limit may be implemented as silent truncation.

## 8. Differential data flow

Stage 4 preserves direct execution of the supported Node implementation.

The evidence flow is:

```text
fixed seeds + category schedule
          |
          v
Node bounded deterministic corpus generator
          |
          v
canonical-value-v0 fixture rows
          |
          +--------------------------+
          |                          |
          v                          v
real Node oracle                promoted Rust candidate
mesh/src/lib/canonical.mjs      trust-core/rust/canonical_value_v0.rs
          |                          |
          +------------+-------------+
                       |
                       v
              exact byte comparator
                       |
             same bytes -> PASS
             any difference -> FAIL
```

The comparator must continue to compare raw emitted bytes. There is no tolerance, reparsing, normalization after comparison, ordering heuristic, or semantic-equivalence fallback.

Node oracle output parsing must remain duplicate-aware. A duplicate case identifier or malformed oracle line is a hard failure before comparison.

## 9. Controlled mismatch proof

Stage 4 must prove the generated-corpus comparator itself fails when one generated Rust result is deliberately perturbed.

The test must:

1. generate a real accepted case using one of the fixed seeds;
2. obtain the real Node oracle bytes;
3. obtain the real Rust candidate bytes;
4. perturb one Rust byte or substitute a known unequal byte string only at the comparison boundary;
5. assert that the comparator fails;
6. include the seed, case identifier, Node bytes, and Rust bytes in the diagnostic.

The promoted candidate implementation must not be modified to create the mismatch.

Passing only hand-curated mismatch tests is insufficient for Stage 4; at least one mismatch proof must originate from the generated corpus path.

## 10. Test-driven implementation sequence

Stage 4 implementation must preserve RED -> GREEN evidence.

### RED 1 — generated-corpus contract absent

Add the Stage 4 integration test that requires the fixed seeds, exact valid/malformed counts, category coverage, deterministic replay, and resource-limit contract before the generator exists.

The Rust laboratory job must fail for the missing Stage 4 generator/harness surface, not for formatting, workflow syntax, documentation inventory, or unrelated build configuration.

### GREEN 1 — deterministic bounded generator

Implement only the minimum Node generator and harness support needed to produce the declared v0 corpus reproducibly and feed it through the existing Node and Rust paths.

The accepted result must include exact Node-vs-Rust byte equality for all 1,024 valid generated cases plus the existing 17 hand-curated valid cases.

### RED 2 — generated mismatch detection

Add the controlled generated-corpus mismatch proof before any new comparison helper required by that proof exists.

The RED condition must be specific to the missing generated mismatch-detection surface.

### GREEN 2 — exact generated comparison diagnostic

Implement only the comparison/diagnostic behavior required to prove the generated mismatch is rejected with seed and case provenance.

### RED 3 — generated malformed and over-bound rejection

Add the 256-case generated malformed fixture corpus plus separate explicit resource-bound and total-corpus-limit negative tests before the required fail-closed harness checks exist.

### GREEN 3 — bounded fail-closed harness

Implement only the minimum validation required for all declared malformed and over-bound cases to fail closed.

### REFACTOR

Run formatting and Clippy with warnings denied. Refactoring must not expand the semantic domain, source inventory, dependencies, authority, runtime reachability, or promoted Rust implementation.

## 11. CI and exact-head evidence

The existing `Rust Trust-Core Laboratory` workflow remains the dedicated Stage 4 execution surface.

It may be extended only as needed to:

- execute deterministic replay/category tests;
- execute the live Node oracle;
- execute generated differential tests;
- execute malformed/resource-bound rejection tests;
- run Rust formatting;
- run Clippy with warnings denied;
- run locked Rust tests.

The workflow must remain non-production and must not build or publish a supported Rust runtime artifact.

Stage 4 acceptance requires one exact PR head for which all of the following complete successfully:

- Rust Trust-Core Laboratory;
- protected Clean Kernel verification;
- protected container isolation/deny-egress checks;
- Node 22 compatibility;
- Windows compatibility;
- macOS Apple Silicon compatibility;
- macOS Intel compatibility.

Any later commit invalidates exact-head acceptance until the same gates pass again.

## 12. Evidence record

An accepted Stage 4 record must state at minimum:

- exact Git commit;
- Stage 3 base merge commit;
- Node oracle version;
- Rust compiler version;
- Cargo version;
- promoted Rust source inventory;
- generator implementation path;
- generator algorithm/version;
- exact fixed seeds;
- exact valid generated count;
- exact malformed generated count;
- hand-curated valid/malformed counts;
- required category coverage result;
- deterministic replay result;
- controlled generated mismatch result;
- resource-bound rejection result;
- third-party dependency count;
- unsafe-code state;
- exact protected workflow conclusions;
- known exclusions and non-claims.

No Stage 4 evidence may describe the Rust candidate as production-ready, authoritative, or a replacement for Node.

## 13. Rollback

Stage 4 rollback is evidence-only.

If the generated corpus, resource-limit checks, or differential harness expose a defect:

1. stop migration advancement;
2. keep Node authoritative;
3. mark Stage 4 evidence failed or inconclusive;
4. retain the last accepted Stage 3 source boundary unless the defect is proven to invalidate the Stage 3 promoted source itself;
5. remove or revert the Stage 4 generator/harness changes if necessary;
6. record the failing seed, case identifier, exact inputs, exact outputs, toolchain versions, and commit before redesign.

No production data, receipt, state, capability, or runtime rollback is required because Stage 4 introduces no production runtime integration.

If a Stage 4 finding demonstrates that the promoted Stage 3 implementation itself violates the already-frozen v0 contract, migration advancement halts, Stage 3 acceptance is reopened, and the promoted source is corrected only through a separate fail-closed correction gate. Stage 4 evidence is then restarted against the newly accepted Stage 3 source; it is not patched forward in place.

## 14. Documentation truth corrections in the Stage 4 design branch

Before the Stage 4 design branch is accepted, two existing records must be corrected without altering runtime behavior:

1. `labs/rust-trust-core/EXPERIMENT.md` must no longer claim that Stage 3 source preflight runs inside `release:verify`. The accepted Stage 3 boundary is CI/test-bound: the tracked-repository kernel test and dedicated Rust workflow enforce it, while `mesh/src/release.mjs` and `npm --prefix mesh run release:verify` remain unchanged.
2. `docs/MASTER-TODO-SOVEREIGN-HOST-DEPLOYMENT.md` must mark Stage 3 source promotion complete and identify Stage 4 adversarial differential conformance as the next uncompleted trust-core migration gate.

These changes are documentation truth maintenance only. They must not widen release-verifier authority or imply Stage 4 implementation approval.

## 15. Current non-claims

Stage 4 does not claim or establish:

- recursive/nested canonical-value equivalence;
- general Unicode or JSON string-escaping equivalence;
- floating-point formatting equivalence;
- JavaScript prototype, descriptor, symbol, accessor, non-enumerable, sparse-array, or other object-runtime equivalence;
- cryptographic digest or signature-verification equivalence;
- capability or authority-evaluator equivalence;
- persistence, crash, restart, or recovery equivalence;
- networking or host-boundary equivalence;
- Gateway, Hypervisor, Sandbox, or Grid replacement;
- production Cargo/package/runtime support;
- production release-verifier integration for the Rust source gate;
- permission to modify the promoted Stage 3 Rust source inside the Stage 4 evidence campaign;
- permission to replace any supported Node call site;
- permission to begin Stage 5 automatically.

## 16. Stage 4 acceptance criterion

Stage 4 is complete only when all of the following are true at one exact accepted commit:

1. the Stage 3 promoted source inventory and `trust-core/rust/canonical_value_v0.rs` contents remain unchanged throughout the Stage 4 evidence campaign;
2. the hand-curated v0 corpus remains green;
3. the fixed Stage 4 seeds reproduce the same ordered corpus;
4. exactly 1,024 generated valid cases are produced and all match the live Node oracle byte-for-byte;
5. exactly 256 generated malformed/over-bound fixture cases fail closed as declared;
6. separate total-corpus-limit negative tests fail closed;
7. every required valid and invalid category is demonstrably covered;
8. paired object permutations satisfy the declared metamorphic equality check;
9. generated array-order cases preserve order and are not incorrectly normalized;
10. a deliberate generated-output mismatch is detected with seed/case provenance;
11. all declared harness resource limits fail closed when exceeded;
12. Rust remains on the accepted pinned toolchain, with zero third-party dependencies and unsafe code forbidden unless separately reviewed;
13. the Rust source gate remains CI/test-bound and `release:verify` remains unchanged;
14. no supported runtime or authority path invokes Rust;
15. Rust Trust-Core Laboratory, Clean Kernel, container, Node 22, Windows, and both macOS lanes are green on the exact head;
16. Stage 5 remains a separate explicit design and promotion gate.

Passing Stage 4 permits only consideration of the next migration stage. It does not promote Rust into supported runtime authority.