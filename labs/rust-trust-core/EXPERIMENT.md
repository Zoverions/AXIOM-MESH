# Rust Trust-Core Laboratory Experiment

**Status:** isolated frontier laboratory; disabled by default

**Date:** 2026-09-06

**Authority:** none

**Production reachability:** none

## Hypothesis

A small Rust implementation can encode AXIOM's deny-dominant authority decision as a typed interface in which an `AuthorityGrant` can only be produced by validated evaluation, while using no third-party crate dependencies and no unsafe Rust.

The experiment is successful only if that implementation reproduces the declared synthetic conformance vectors without changing or bypassing the supported Node.js authority path.

Stage 2 adds a second bounded hypothesis: for a deliberately restricted language-neutral canonical-value domain, a zero-dependency Rust candidate can reproduce the exact UTF-8 bytes emitted by the supported Node `canonicalJson` implementation while Node remains the executable oracle and supported authority implementation.

## Threat model

Assume an accidental or malicious contributor may try to:

- treat existence of the Rust crate as production authority;
- import the laboratory from the supported `mesh/` runtime;
- construct an allow/grant state without satisfying all required evidence;
- coerce malformed or unknown vector values into an allow result;
- add network, credential, durable-state, or external-effect access;
- introduce third-party dependencies without review;
- introduce `unsafe` code to bypass type or memory-safety constraints;
- silently make the Rust result authoritative over the current Node result;
- copy or reimplement the Node oracle inside the test harness instead of executing the supported implementation;
- normalize away Node/Rust byte differences after comparison;
- broaden the Stage 2 grammar until language-specific semantics are falsely described as equivalent;
- describe laboratory success as a production migration.

## Assumptions

- The current Node.js kernel remains the supported reference implementation.
- The Gateway -> Hypervisor -> Sandbox -> Grid authority invariant remains unchanged.
- Laboratory inputs are synthetic and contain no user data, credentials, or production evidence.
- Rust 1.85.0 with edition 2024 semantics is sufficient for this bounded experiment.
- Node 24.18.0 is the pinned Stage 2 oracle runtime in laboratory CI.
- Stage 1 evaluates typed authority-interface suitability only; it does not establish production authority.
- Stage 2 evaluates only the frozen `canonical-value-v0` domain; it does not establish whole-JSON, cryptographic, persistence, recovery, network, or JavaScript runtime-object equivalence.

## Test data

`fixtures/authority-vectors.v0.tsv` contains bounded synthetic authority cases only.

The authority vector format is a laboratory test format, not a production protocol. It contains:

- `case_id`;
- `principal_verified`;
- `capability_authorized`;
- `consent_required`;
- `consent_valid`;
- `budget_required`;
- `budget_remaining`;
- `expected` (`allow` or `deny`).

Stage 2 adds:

- `fixtures/canonical-value-v0.tsv` with 17 valid cases;
- `fixtures/canonical-value-v0-invalid.tsv` with 12 malformed cases;
- `node/canonical_oracle.mjs`, which imports the supported `mesh/src/lib/canonical.mjs` `canonicalJson` implementation directly;
- `tests/canonical_differential.rs`, which invokes that Node oracle as a real subprocess and compares exact bytes with the Rust candidate.

The admitted `canonical-value-v0` domain is intentionally small:

- `null`;
- booleans;
- safe integers in `-9007199254740991..9007199254740991`;
- negative zero, canonicalized as `0`;
- printable ASCII strings U+0020..U+007E excluding `"` and `\`;
- scalar arrays preserving element order;
- flat objects with unique `[A-Za-z0-9._-]{1,64}` keys and scalar values, canonicalized by key order.

Nested arrays or objects, floating point, general JSON escaping, and JavaScript-specific prototype, symbol, accessor, non-enumerable, sparse-array, or custom-property behavior are outside Stage 2 v0.

## Isolation boundary

The laboratory:

- lives only under `labs/rust-trust-core/` plus its dedicated CI workflow and migration documentation;
- has no entry in `mesh/config/capabilities.json`;
- has no Gateway route;
- has no imports from supported runtime code except the Node laboratory oracle importing `canonicalJson` for comparison;
- does not make the Rust result reachable from supported runtime code;
- has no access to production identities, secrets, keys, durable state, or receipts;
- opens no listener and performs no egress;
- cannot call Hypervisor, Sandbox, or Grid;
- is not built into the candidate production image;
- is not a production dependency.

## Stage 2 evidence

The Stage 2 candidate has demonstrated, on the branch verification path prior to final exact-head review:

- 17/17 valid `canonical-value-v0` cases match the live Node oracle byte-for-byte;
- the comparison harness fails on a deliberately introduced byte divergence and reports the case identifier plus both byte strings;
- 12/12 malformed corpus cases are rejected by both the Node and Rust decoders;
- the Node oracle tests execute under pinned Node 24.18.0;
- the Rust candidate executes under pinned Rust 1.85.0;
- the Rust package still has zero third-party dependencies;
- crate-level `#![forbid(unsafe_code)]` remains active;
- Stage 1 authority tests and compile-fail non-reuse/private-construction proofs remain green;
- no supported Node canonicalization call site has been replaced or redirected.

The exact accepted Git commit is the PR head for which the dedicated Rust laboratory, protected Clean Kernel/container/Node-22 checks, Windows compatibility, and both macOS compatibility jobs all pass. A later commit invalidates that exact-head acceptance until the same gates pass again.

## Failure criteria

The experiment fails if any of the following occurs:

- a declared deny vector evaluates to allow;
- a declared allow vector evaluates to deny without an identified vector/spec defect;
- `AuthorityGrant` is publicly constructible outside the evaluator;
- any admitted Stage 2 valid vector produces different Node and Rust bytes;
- the differential harness can be made to accept a deliberate byte mismatch;
- either Stage 2 decoder accepts a declared malformed vector;
- the crate requires `unsafe` code in this slice;
- the crate requires a third-party dependency in this slice;
- malformed fixture values are silently interpreted as authorized or canonical;
- current protected Node verification regresses because of the laboratory;
- the laboratory must widen current authority or data access to function;
- documentation claims the Rust code is supported production authority.

## Halt procedure

If a failure criterion is met:

1. stop migration-stage advancement;
2. keep the Node kernel authoritative;
3. mark the laboratory evidence as failed or inconclusive;
4. revert or remove the Rust laboratory if it destabilizes supported checks;
5. record the failure and its exact commit before considering a revised experiment.

No production rollback is required because these stages have no production integration.

## Reproducibility

From a checkout containing Node 24.18.0 and Rust 1.85.0:

```bash
node --test labs/rust-trust-core/node/canonical_oracle.test.mjs
rustc --version
cargo fmt --manifest-path labs/rust-trust-core/Cargo.toml --all -- --check
cargo clippy --manifest-path labs/rust-trust-core/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path labs/rust-trust-core/Cargo.toml --locked
```

The dedicated GitHub Actions workflow runs the same checks on the repository branch/PR. The Rust differential integration test starts the real Node oracle subprocess itself.

## Evidence to record

For each accepted stage, record:

- exact Git commit;
- Node version where the Node oracle participates;
- Rust compiler version;
- Cargo version;
- conformance-vector version and counts;
- format/Clippy/test result;
- dependency state;
- unsafe-code state;
- known semantic differences and excluded domains;
- explicit non-claims.

## Current non-claims

This experiment does not claim:

- Rust is already the AXIOM production kernel;
- Rust has replaced any supported Node behavior;
- the Node kernel is deprecated;
- semantic equivalence exists beyond the bounded Stage 1 and Stage 2 vectors;
- `canonical-value-v0` is a production protocol or complete JSON canonicalization specification;
- JavaScript-specific object-state defenses have Rust equivalents in this stage;
- cryptographic digest equivalence, persistence equivalence, recovery equivalence, or runtime-authority equivalence has been demonstrated;
- any new capability, network surface, external effect, identity authority, consent authority, governance authority, or durable-state authority exists.
