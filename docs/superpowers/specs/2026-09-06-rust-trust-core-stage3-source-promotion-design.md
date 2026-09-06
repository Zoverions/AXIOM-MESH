# Rust Trust-Core Stage 3 Source Promotion — Design

**Status:** approved Stage 3 design following merged Stage 2 differential conformance

**Date:** 2026-09-06

**Scope:** promote only the proven pure `canonical-value-v0` Rust source from the laboratory into an explicitly governed candidate source boundary without creating a Rust production runtime, dependency package, capability, authority plane, or supported call site.

**Stage 2 base:** merge commit `58aa47e38b97e6924299d92f1734517ae7523a0b`

## 1. Decision

Stage 3 will move the pure canonical-value parser/canonicalizer implementation out of the mixed laboratory crate into a dedicated repository source boundary:

`trust-core/rust/canonical_value_v0.rs`

This is **source promotion without authority promotion**.

The promoted file is a reviewed candidate source unit. It is not a standalone crate, binary, shared library, service, runtime adapter, capability, or production dependency. The supported Node.js kernel remains authoritative, and `mesh/src/lib/canonical.mjs` remains the executable oracle for the admitted Stage 2 domain.

The existing laboratory will compile and test the promoted source directly so the accepted Stage 2 differential evidence remains live.

## 2. Why this is the smallest meaningful Stage 3

Stage 2 proved exact byte equivalence over the restricted `canonical-value-v0` domain. Leaving the Rust candidate permanently embedded in a mixed laboratory file would not actually advance the staged migration boundary.

Creating a standalone Rust crate now would advance too far. It would introduce a new dependency/build/package surface before any supported runtime is permitted to consume Rust.

Stage 3 therefore separates **code maturity** from **runtime authority**:

- the pure canonicalization source may leave the experimental mixed file;
- packaging, linking, deployment, invocation, and authority remain prohibited;
- the laboratory remains the only compiler/test harness for the promoted source;
- Node remains the supported implementation and oracle.

## 3. Alternatives considered

### A. Promote the proven source module only

Extract the pure canonical-value implementation to `trust-core/rust/canonical_value_v0.rs`. Keep the existing laboratory crate as the only Rust crate and include/re-export the promoted module for tests.

**Selected.** This advances source maturity while preserving zero runtime reachability and zero new dependency manifests.

### B. Create a standalone `trust-core` Cargo crate

This would give the promoted source a formal Rust package boundary immediately.

**Rejected for Stage 3.** A new manifest would widen dependency and release-governance surfaces and would make the candidate easier to consume from supported code before an explicit promotion decision.

### C. Keep all Rust implementation under `labs/`

This preserves maximum isolation but does not perform the source movement already contemplated by Stage 3.

**Rejected as insufficient progress.**

## 4. Promoted source boundary

Create:

`trust-core/rust/canonical_value_v0.rs`

The file owns only:

- `CanonicalScalar`;
- `CanonicalCase`;
- `VectorError`;
- parsing of the frozen `canonical-value-v0` fixture grammar;
- canonicalization of the admitted value domain;
- private helpers required by those operations.

It must not own or import:

- `AuthorityGrant`;
- authority evaluation;
- identity or credential verification;
- consent or policy evaluation;
- effect budgets;
- cryptographic signing or receipt production;
- durable state;
- host control;
- networking;
- process spawning;
- environment-variable access;
- filesystem access;
- time or randomness;
- Gateway, Hypervisor, Sandbox, or Grid integration.

The module must use only the Rust standard library and must contain `#![forbid(unsafe_code)]` or be included under a crate that already forbids unsafe code. Stage 3 must not add third-party Rust dependencies.

## 5. Laboratory relationship

`labs/rust-trust-core/src/lib.rs` remains the laboratory crate root and continues to own the Stage 1 authority experiment.

It will import the promoted source by explicit repository-relative source inclusion and re-export the canonicalization API required by the Stage 2 tests.

Conceptually:

```text
trust-core/rust/canonical_value_v0.rs
          ^
          | compiled only by
          |
labs/rust-trust-core/src/lib.rs
          |
          +-- Stage 2 differential tests
          +-- Stage 1 authority experiment remains local to lab
```

The inclusion must not create a dependency from `mesh/` to Rust. No supported Node source may import, execute, shell out to, link, load, or otherwise consume the promoted candidate.

## 6. Release/source governance

The release verifier must explicitly distinguish three categories:

1. supported production dependency manifests;
2. approved laboratory dependency manifests;
3. approved non-authoritative Rust candidate source.

Stage 3 adds only the exact candidate path:

`trust-core/rust/canonical_value_v0.rs`

to the third category.

The release/source boundary must continue to fail closed on unrecognized Rust source or dependency paths. In particular:

- arbitrary `trust-core/rust/*.rs` files are not implicitly allowed;
- arbitrary Cargo manifests outside the already approved laboratory remain rejected;
- the candidate source must not be reported as a production dependency manifest;
- no wildcard trust-core exception may be introduced.

The release verifier should report the exact approved candidate source list separately for evidence and auditability.

## 7. Supported-runtime non-reference invariant

Stage 3 adds an explicit guard that supported runtime source remains independent of the candidate.

At minimum, verification must prove that tracked files under `mesh/src/` do not contain a reference to:

- `trust-core/rust`;
- `canonical_value_v0.rs`;
- a command or path that invokes the Rust laboratory as a canonicalization runtime.

This guard is narrow and structural. It does not claim static proof over every possible future indirection, but it ensures Stage 3 itself does not silently add a supported call site.

## 8. Differential evidence remains mandatory

Promotion of the source file does not retire Stage 2 evidence.

The existing laboratory workflow must continue to require:

- Node `24.18.0` oracle execution;
- Rust `1.85.0`;
- rustfmt;
- Clippy with warnings denied;
- exact Node-vs-Rust byte comparison for all `canonical-value-v0` valid vectors;
- rejection of every malformed vector;
- duplicate Node-oracle `case_id` rejection;
- deliberate mismatch detection;
- zero third-party Rust dependencies;
- unsafe code forbidden.

The existing valid/malformed vector corpora remain unchanged in this Stage 3 slice unless a defect requires a separately reviewed vector correction.

## 9. TDD sequence

### RED 1 — source boundary does not yet allow the promoted candidate

Add a focused source-boundary test requiring the exact Stage 3 candidate source to be classified separately from production and laboratory dependency manifests.

Before modifying the release verifier, the test must fail because the candidate source is unrecognized.

### GREEN 1 — exact candidate classification

Add the minimum release-verifier classification for only:

`trust-core/rust/canonical_value_v0.rs`

Require arbitrary additional Rust source under `trust-core/rust/` to remain rejected.

### RED 2 — lab requires promoted source

Add the promoted module file and adjust the laboratory crate root/test contract so the canonical API must come from that module. The intermediate state should fail until the duplicate implementation is removed/re-exported correctly.

### GREEN 2 — extract without semantic change

Move only the Stage 2 canonical-value code into the promoted module and re-export it from the laboratory crate. Keep Stage 1 authority types/evaluator in `labs/rust-trust-core/src/lib.rs`.

Require the full Stage 2 differential suite to remain byte-identical.

### RED/GREEN 3 — supported-runtime non-reference guard

Add a structural test that fails if supported `mesh/src/` files reference the promoted Rust candidate path or laboratory invocation surface. Make the current tree pass without adding exceptions.

## 10. CI trigger changes

The existing `Rust Trust-Core Laboratory` workflow remains the only Rust build/test workflow.

Its path filters must include:

- `trust-core/rust/**`;
- the Stage 3 design and plan;
- release/source-boundary tests affected by the Stage 3 classification.

No new production Rust workflow is created.

Protected Clean Kernel, container, Node 22, Windows, and both macOS checks must remain green on the exact PR merge result.

## 11. Documentation and planning

Stage 3 must:

- register this design and its implementation plan in `CANONICAL_DOCUMENTS`;
- update the sovereign-host execution queue only after exact differential and protected verification are green;
- extend `labs/rust-trust-core/EXPERIMENT.md` with the promoted-source boundary and non-claims.

The experiment manifest must state explicitly that `trust-core/rust/canonical_value_v0.rs` is repository-promoted source but remains non-authoritative and runtime-unreachable.

## 12. Rollback

Rollback is source-only and reversible:

1. move the canonical-value implementation back into `labs/rust-trust-core/src/lib.rs`;
2. remove the approved candidate-source classification;
3. remove the Stage 3 non-reference guard and CI path entry if no longer needed;
4. restore the laboratory-only source layout.

There is no state migration, credential migration, receipt migration, Gateway migration, or effect rollback because Stage 3 adds no runtime consumer.

## 13. Non-claims

Stage 3 does not claim:

- Rust canonicalization is production-authoritative;
- `trust-core/rust/` is a supported runtime package;
- a Rust crate, binary, service, FFI boundary, WASM module, or shared library exists;
- any Node call site has been replaced;
- full `canonical.mjs` equivalence beyond `canonical-value-v0`;
- JavaScript-specific prototype/symbol/descriptor/accessor/sparse-array equivalence;
- cryptographic, identity, consent, policy, persistence, recovery, networking, or effect-path equivalence;
- permission to add a production Rust dependency or runtime in the next PR without a new review.

## 14. Completion gate

Stage 3 is complete only when:

1. `trust-core/rust/canonical_value_v0.rs` contains only the proven pure canonical-value implementation;
2. no new Cargo manifest, Rust binary, service, FFI surface, runtime adapter, capability, or production dependency exists;
3. the laboratory compiles/tests the promoted source and no duplicate canonical-value implementation remains in the mixed lab file;
4. all Stage 2 exact differential and malformed-vector tests remain green;
5. the release verifier classifies only the exact candidate source separately and still rejects arbitrary Rust source/manifests;
6. supported `mesh/src/` source has no reference to the promoted Rust candidate or laboratory invocation path;
7. protected Clean Kernel, container, Node 22, Windows, and both macOS checks are green on the exact current-main merge result;
8. the experiment manifest and sovereign-host queue accurately record the non-authoritative promoted-source state;
9. Stage 4 remains a separate explicit review and does not inherit authority from Stage 3.
