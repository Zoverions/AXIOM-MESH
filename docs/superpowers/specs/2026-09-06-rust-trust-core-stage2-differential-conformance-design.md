# Rust Trust-Core Stage 2 Differential Conformance — Design

**Status:** proposed Stage 2 design following merged Stage 1 foundation

**Date:** 2026-09-06

**Scope:** freeze the first shared language-neutral conformance surface for pure canonical-value semantics and prove bounded Node-vs-Rust equivalence without moving any production authority from the supported Node.js kernel.

**Stage 1 base:** merge commit `2c0a8dffc86d0764b1fc81ca7315af43b86d1e60`

## 1. Decision

Stage 2 will not migrate a production code path. It will introduce a shared conformance fixture and a differential test harness around a deliberately narrow subset of `mesh/src/lib/canonical.mjs`.

The supported Node.js implementation remains the oracle. The Rust laboratory remains a comparator only.

The first candidate is canonical-value normalization because it is:

- pure and deterministic;
- widely reused by authority/evidence code;
- security-relevant because digest stability depends on it;
- separable from networking, persistence, credentials, policy loading, and effects;
- testable without granting the Rust laboratory runtime authority.

## 2. Why the first vector set is deliberately narrow

`canonical.mjs` includes two different categories of semantics:

1. language-neutral value semantics, such as scalar preservation, negative-zero normalization, dense-array order, object-key ordering, and deterministic recursive output;
2. JavaScript-specific object-state defenses, such as rejecting custom prototypes, symbol-keyed state, accessors, sparse arrays, and non-enumerable properties.

Stage 2 v0 covers only the first category where the same abstract value can be represented without smuggling JavaScript runtime details into Rust.

JavaScript-specific rejection behavior remains authoritative in Node and is explicitly outside this vector version. It must not be described as cross-language equivalent merely because the v0 vectors pass.

## 3. Approaches considered

### A. Full JSON parser plus recursive Rust canonicalizer immediately

This would permit broad nested vectors, but implementing a new parser in the laboratory would add a second semantic problem before canonicalization equivalence is established. Adding a JSON crate would also widen the dependency surface before a dependency review.

**Rejected for v0.**

### B. Reuse only expected-output fixtures without executing Node in CI

Both implementations could compare against committed expected bytes. This is simple, but it weakens the evidence that the current exact Node implementation still agrees with the fixture.

**Rejected as the primary differential gate.** Committed expected bytes may still be included for reviewability, but exact Node execution must remain part of the test.

### C. Shared restricted abstract-value vectors plus exact Node oracle execution

Use a small line-oriented fixture whose grammar can be decoded with standard-library code in both languages. Execute the current Node implementation on every vector and compare those exact outputs with the Rust candidate.

**Selected.** This minimizes parser surface, preserves zero third-party Rust dependencies, and proves exact current-oracle equivalence for the bounded domain.

## 4. Conformance vector v0

The shared fixture will live at:

`labs/rust-trust-core/fixtures/canonical-value-v0.tsv`

Columns:

```text
case_id kind payload
```

The v0 kinds are intentionally finite:

- `null`
- `bool`
- `safe_integer`
- `negative_zero`
- `ascii_string`
- `scalar_array`
- `ascii_key_object`

### 4.1 Restricted scalar domain

`safe_integer` is limited to the exact JavaScript safe-integer range:

```text
-9007199254740991 .. 9007199254740991
```

`negative_zero` is represented by its own kind so the fixture can require the Node rule `-0 -> 0` without relying on a host-language integer representation.

`ascii_string` is limited in v0 to printable ASCII characters U+0020 through U+007E excluding `"` and `\`. This avoids introducing JSON string-escape equivalence before it has its own vector version.

### 4.2 Array domain

`scalar_array` contains only v0 scalar tokens and must preserve element order exactly.

The fixture syntax is a comma-separated token sequence using these prefixes:

```text
n
b:true
b:false
i:42
i:-7
z
s:hello
```

`z` means negative zero and must canonicalize as JSON `0`.

No nested arrays or objects are permitted in v0.

### 4.3 Object domain

`ascii_key_object` contains unique ASCII keys matching:

```text
[A-Za-z0-9._-]{1,64}
```

Values are v0 scalar tokens only. Pairs are written in fixture order as:

```text
key=token;key=token
```

The canonical result must sort keys according to the current Node `Array.prototype.sort()` behavior. Because v0 keys are restricted to ASCII, JavaScript UTF-16 ordering and Rust byte/scalar ordering coincide for the admitted domain.

Duplicate keys are invalid fixture data and must fail the harness rather than being silently overwritten.

## 5. Differential architecture

Stage 2 adds three laboratory-only pieces:

1. **Shared fixture** — the exact input corpus.
2. **Node oracle adapter** — imports `canonicalJson` from `mesh/src/lib/canonical.mjs`, decodes each vector into a normal JavaScript value, and emits one canonical result record per case.
3. **Rust candidate adapter** — decodes the same vector, evaluates the laboratory canonical-value candidate, and compares its bytes with the exact Node oracle result.

The comparison result is binary:

```text
same bytes -> PASS
any difference -> FAIL
```

There is no tolerance, normalization after comparison, or semantic-equivalence heuristic.

## 6. Node remains the oracle

The Node adapter must use the repository implementation directly:

`mesh/src/lib/canonical.mjs`

It must not copy the canonicalization logic into a fixture generator.

This preserves the evidence claim:

> At this exact repository commit, the Rust laboratory produced the same canonical bytes as the supported Node implementation for every admitted v0 vector.

Passing Stage 2 does **not** invert that relationship. Rust does not become the oracle or an independent source of authority.

## 7. Rust candidate boundary

The Rust candidate remains inside:

`labs/rust-trust-core/`

Constraints carried forward from Stage 1:

- Rust `1.85.0` remains pinned unless separately reviewed;
- `#![forbid(unsafe_code)]` remains required;
- zero third-party Rust dependencies remain required for this slice;
- no capability-registry entry;
- no Gateway route or runtime import;
- no Hypervisor, Sandbox, or Grid calls;
- no production credentials, keys, user data, durable state, or receipts;
- no network listener or egress;
- no production promotion claim.

The Rust canonical-value API is laboratory-only. Its existence does not authorize any supported runtime to use it.

## 8. Fail-closed fixture handling

Both adapters must reject malformed vectors.

At minimum, fail on:

- unknown `kind`;
- duplicate `case_id`;
- invalid boolean token;
- integer outside the declared safe range;
- invalid negative-zero representation;
- string outside the admitted ASCII subset;
- malformed scalar-array token;
- object key outside the admitted key grammar;
- duplicate object key;
- unsupported nested value;
- extra or missing TSV columns.

Malformed fixtures must not be coerced into a comparison result.

## 9. Test sequence

The implementation must preserve TDD evidence.

### RED 1 — shared vectors exist, Rust candidate does not

Add the fixture and differential integration test before the Rust canonical-value API exists. The Rust job must fail for missing candidate symbols, not for toolchain or workflow configuration.

### GREEN 1 — minimum candidate

Implement only the v0 abstract-value types, decoder, and canonical writer required for the declared vectors.

### RED 2 — direct oracle mismatch proof

Add at least one controlled test proving that a deliberately altered Rust output is detected as unequal to the Node oracle bytes. This test must exercise the comparison layer, not a mock comparison result.

### GREEN 2 — exact comparison

Restore the real candidate path and require all shared vectors to match the exact Node oracle.

### RED 3 — malformed vector rejection

Add negative fixture cases proving both adapters reject malformed input rather than normalizing it into an allowed case.

### GREEN 3 — fail-closed fixture decoder

Implement the minimum shared grammar validation needed to make those cases pass.

## 10. CI

The existing `Rust Trust-Core Laboratory` workflow remains the dedicated Stage 2 surface.

It may be extended only to:

- pin the same Node version used by the protected kernel workflow;
- execute the Node oracle adapter;
- run Rust formatting;
- run Clippy with warnings denied;
- run locked Rust tests including the differential comparison.

It must not become a production build workflow.

Protected Clean Kernel and cross-platform Node checks must remain unchanged and green because Stage 2 must not alter supported behavior.

## 11. Evidence output

The Stage 2 differential test should report, at minimum:

- exact Git commit;
- Node version;
- Rust compiler version;
- fixture version `canonical-value-v0`;
- total vector count;
- exact matched vector count;
- malformed-vector rejection count;
- Rust dependency count;
- unsafe-code state;
- explicit non-claims.

No evidence file from this stage may call the Rust implementation production-ready or authoritative.

## 12. Non-claims

Stage 2 does not claim:

- full equivalence of `canonical.mjs`;
- equivalence for JavaScript prototype, symbol, descriptor, accessor, or sparse-array defenses;
- recursive/nested canonicalization equivalence beyond the admitted v0 grammar;
- complete JSON string escaping equivalence;
- floating-point formatting equivalence;
- digest equivalence for every possible Node input;
- authority, identity, consent, policy, persistence, recovery, cryptographic, networking, or effect-path equivalence;
- permission to replace a supported Node call site.

## 13. Promotion gate

Stage 2 v0 is complete only when:

1. the fixture grammar is frozen and documented;
2. exact Node oracle execution is part of the laboratory test;
3. every valid vector produces byte-identical Rust and Node canonical output;
4. malformed-vector cases fail closed;
5. Rust remains zero-dependency and unsafe-free;
6. protected Node, container, Windows, and macOS checks remain green at the exact head;
7. no supported runtime call site imports or invokes Rust;
8. the next expansion of the conformance domain is a separate explicit review.

Passing this gate permits only the next conformance slice. It does not permit production migration.
