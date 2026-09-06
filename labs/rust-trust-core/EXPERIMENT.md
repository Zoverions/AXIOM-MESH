# Rust Trust-Core Laboratory Experiment

**Status:** staged trust-core migration evidence; no runtime authority

**Date:** 2026-09-06

**Authority:** none

**Production reachability:** none

## Hypothesis

A small Rust implementation can encode AXIOM's deny-dominant authority decision as a typed interface in which an `AuthorityGrant` can only be produced by validated evaluation, while using no third-party crate dependencies and no unsafe Rust.

The experiment is successful only if that implementation reproduces the declared synthetic conformance vectors without changing or bypassing the supported Node.js authority path.

Stage 2 adds a second bounded hypothesis: for a deliberately restricted language-neutral canonical-value domain, a zero-dependency Rust candidate can reproduce the exact UTF-8 bytes emitted by the supported Node `canonicalJson` implementation while Node remains the executable oracle and supported authority implementation.

Stage 3 tests a narrower promotion claim: the already-conformant `canonical-value-v0` Rust implementation can be moved from laboratory-owned source into the exact reviewed source path `trust-core/rust/canonical_value_v0.rs` without making Rust executable production authority, changing any supported Node call site, adding a Rust package to production, or widening any effect boundary.

Stage 4 tests a broader conformance claim without widening the promoted source or runtime boundary: deterministic generated valid, malformed, and over-bound cases can exercise the live Node oracle and the unchanged promoted Rust `canonical-value-v0` source while preserving exact-byte agreement, fail-closed rejection, and bounded laboratory resource use.

## Threat model

Assume an accidental or malicious contributor may try to:

- treat existence of Rust source as production authority;
- import the Rust candidate into the supported `mesh/` runtime;
- construct an allow/grant state without satisfying all required evidence;
- coerce malformed or unknown vector values into an allow result;
- add network, credential, durable-state, or external-effect access;
- introduce third-party dependencies without review;
- introduce `unsafe` code to bypass type or memory-safety constraints;
- silently make the Rust result authoritative over the current Node result;
- copy or reimplement the Node oracle inside the test harness instead of executing the supported implementation;
- normalize away Node/Rust byte differences after comparison;
- broaden the Stage 2 grammar until language-specific semantics are falsely described as equivalent;
- add an unreviewed Rust source beside the Stage 3 candidate and implicitly expand the trusted source surface;
- add a `Cargo.toml` under the promoted `trust-core/` path and turn source promotion into package/runtime promotion;
- describe source promotion as a production migration;
- make generated Stage 4 inputs nondeterministic or seed-dependent on ambient state;
- silently truncate generated adversarial inputs instead of rejecting explicit resource-bound violations;
- weaken the promoted Rust v0 source inside Stage 4 to make generated differential checks pass.

## Assumptions

- The current Node.js kernel remains the supported reference implementation.
- The Gateway -> Hypervisor -> Sandbox -> Grid authority invariant remains unchanged.
- Laboratory inputs are synthetic and contain no user data, credentials, or production evidence.
- Rust 1.85.0 with edition 2024 semantics is sufficient for this bounded experiment.
- Node 24.18.0 is the pinned Stage 2/3/4 oracle runtime in laboratory CI.
- Stage 1 evaluates typed authority-interface suitability only; it does not establish production authority.
- Stage 2 evaluates only the frozen `canonical-value-v0` domain; it does not establish whole-JSON, cryptographic, persistence, recovery, network, or JavaScript runtime-object equivalence.
- Stage 3 promotes one source file for review and reuse only; it does not create a Cargo package, binary, FFI boundary, subprocess integration, runtime route, capability, or production dependency.
- Stage 4 adds only deterministic laboratory generation, differential comparison, malformed/over-bound rejection, and CI source-integrity evidence; it does not change `canonical-value-v0` semantics or runtime authority.

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

Nested arrays or objects, floating point, general JSON escaping, and JavaScript-specific prototype, symbol, accessor, non-enumerable, sparse-array, or custom-property behavior are outside Stage 2/3/4 v0.

Stage 4 adds generated laboratory-only cases from `node/canonical_adversarial_corpus.mjs`. The generator uses xorshift32 with explicit `>>> 0` unsigned normalization and the fixed seeds `0x4158494F`, `0x4D455348`, `0xC0DEF00D`, and `0x5EED0004`.

## Isolation boundary

The staged Rust programme currently consists of:

- the laboratory under `labs/rust-trust-core/`;
- the single Stage 3 promoted source `trust-core/rust/canonical_value_v0.rs`;
- the dedicated CI workflow and source-boundary verifier;
- migration documentation.

It:

- has no entry in `mesh/config/capabilities.json`;
- has no Gateway route;
- has no production Cargo manifest or Rust binary;
- has no FFI or production subprocess integration;
- has no imports from supported runtime code except the Node laboratory oracle importing `canonicalJson` for comparison;
- does not make the Rust result reachable from supported runtime code;
- has no access to production identities, secrets, keys, durable state, or receipts;
- opens no listener and performs no egress;
- cannot call Hypervisor, Sandbox, or Grid;
- is not built into the candidate production image;
- is not a production dependency.

`mesh/src/rust-trust-core-source-boundary.mjs` separately checks tracked Rust source outside the laboratory and permits only `trust-core/rust/canonical_value_v0.rs`. Arbitrary additional `.rs` files outside the laboratory fail closed. Existing release dependency governance continues to reject unapproved Cargo manifests, including a `trust-core/rust/Cargo.toml`.

Stage 4's generated source gate remains CI/test-bound and does not become `release:verify` authority. The dedicated workflow explicitly diffs the promoted Rust v0 source against the accepted Stage 3 base so Stage 4 cannot silently mutate that source while claiming broader conformance evidence.

## Stage 2 evidence

The Stage 2 candidate demonstrated on its accepted verification path:

- 17/17 valid `canonical-value-v0` cases match the live Node oracle byte-for-byte;
- the comparison harness fails on a deliberately introduced byte divergence and reports the case identifier plus both byte strings;
- 12/12 malformed corpus cases are rejected by both the Node and Rust decoders;
- the Node oracle tests execute under pinned Node 24.18.0;
- the Rust candidate executes under pinned Rust 1.85.0;
- the Rust package has zero third-party dependencies;
- crate-level `#![forbid(unsafe_code)]` remains active;
- Stage 1 authority tests and compile-fail non-reuse/private-construction proofs remain green;
- no supported Node canonicalization call site was replaced or redirected.

## Stage 3 evidence and gate

Stage 3 is accepted only on an exact PR head for which all required checks pass. Its evidence must establish that:

- `trust-core/rust/canonical_value_v0.rs` is the single approved promoted Rust source outside the laboratory;
- the laboratory crate imports and re-exports that promoted source rather than maintaining a second canonicalization implementation;
- the existing Stage 2 Node-vs-Rust differential harness therefore exercises the promoted source against the live Node oracle;
- a dedicated promoted-source regression test covers representative valid behavior and malformed/out-of-contract rejection;
- the source-boundary verifier rejects an additional unapproved Rust source;
- existing release dependency governance still rejects an unapproved Cargo manifest under the promoted path;
- the Stage 3 Rust-source preflight remains CI/test-bound: the tracked-repository kernel test and dedicated Rust workflow enforce it, while `mesh/src/release.mjs` and `npm --prefix mesh run release:verify` remain unchanged;
- Rust 1.85.0 formatting, Clippy, and locked tests pass with no third-party dependency or unsafe-code expansion;
- protected Clean Kernel and host-compatibility workflows remain green;
- no supported Node call site, capability registry entry, Gateway/Hypervisor/Sandbox/Grid path, credential, state, network, or effect authority is changed.

A later commit invalidates exact-head acceptance until these gates pass again.

## Stage 4 adversarial differential methodology and gate

Stage 4 is an evidence expansion over frozen `canonical-value-v0`, not a source or authority promotion. Its fixed methodology is:

- generator: `labs/rust-trust-core/node/canonical_adversarial_corpus.mjs`;
- algorithm: xorshift32 with explicit `>>> 0` normalization;
- seeds: `0x4158494F`, `0x4D455348`, `0xC0DEF00D`, `0x5EED0004`;
- generated valid cases: 1,024;
- generated invalid/over-bound fixture rows: 256;
- hand-curated valid cases retained: 17;
- hand-curated malformed cases retained: 12;
- resource limits: 2,048 total cases / 32 array items / 32 object members / 64 key bytes / 4,096 payload bytes;
- source gate: CI/test-bound, not `release:verify` authority;
- promoted Rust v0 source: unchanged from Stage 3.

The valid campaign sends generated fixture text through the live Node oracle, which continues to call the supported `canonicalJson` implementation, and independently through the promoted Rust parser/canonicalizer. Exact UTF-8 bytes are compared without normalization. Object insertion-order permutations are separately required to produce identical verified Node bytes.

The invalid campaign routes Stage 4 resource-bound violations through explicit harness validators and grammar-invalid cases through the existing Node/Rust v0 parsers. No input is truncated to fit a limit. A controlled comparison-boundary perturbation proves the generated differential comparator itself fails closed and reports seed, case, Node bytes, and Rust bytes.

Stage 4 acceptance requires all 1,024 generated valid cases to match byte-for-byte, all 256 generated invalid/over-bound cases to be rejected in both language paths, the hand-curated Stage 2 corpus to remain green, Rust 1.85 formatting/Clippy/locked tests to remain green, the promoted-source diff guard to remain clean, and protected host verification to remain green on the exact accepted head.

**Halt rule:** any real generated Node/Rust mismatch inside frozen `canonical-value-v0` stops Stage 4 immediately and reopens Stage 3. Stage 4 must not patch `trust-core/rust/canonical_value_v0.rs` to make the campaign pass.

## Failure criteria

The experiment fails if any of the following occurs:

- a declared deny vector evaluates to allow;
- a declared allow vector evaluates to deny without an identified vector/spec defect;
- `AuthorityGrant` is publicly constructible outside the evaluator;
- any admitted Stage 2/3/4 valid vector produces different Node and Rust bytes;
- any generated Stage 4 valid case produces different Node and Rust bytes;
- the differential harness can be made to accept a deliberate byte mismatch;
- either Stage 2/3 decoder accepts a declared malformed vector;
- a Stage 4 generated malformed or over-bound case is accepted by its required fail-closed path;
- a Stage 4 input is silently truncated rather than rejected at an explicit bound;
- the crate or promoted source requires `unsafe` code in this slice;
- the crate requires a third-party dependency in this slice;
- malformed fixture values are silently interpreted as authorized or canonical;
- another Rust source outside the laboratory is admitted without an explicit later-stage review;
- a production Cargo manifest, binary, runtime call site, capability, or effect path is introduced as part of Stage 3 or Stage 4;
- current protected Node verification regresses because of the migration work;
- the migration must widen current authority or data access to function;
- documentation claims the promoted Rust source is supported production authority;
- Stage 4 changes the promoted Rust v0 source while claiming only broader conformance evidence.

## Halt and rollback procedure

If a failure criterion is met:

1. stop migration-stage advancement;
2. keep the Node kernel authoritative;
3. mark the affected evidence as failed or inconclusive;
4. for a real Stage 4 generated Node/Rust mismatch in frozen v0, reopen Stage 3 and do not patch the promoted candidate inside Stage 4;
5. for Stage 3 source-promotion failure, remove `trust-core/rust/canonical_value_v0.rs`, restore the laboratory-owned implementation, and revert the Stage 3 source-boundary/workflow/CI/test source-boundary wiring;
6. record the failure and its exact commit before considering a revised experiment.

No production data or authority rollback is required because Stage 4 has no production runtime integration.

## Reproducibility

From a checkout containing Node 24.18.0 and Rust 1.85.0:

```bash
node --test \
  labs/rust-trust-core/node/canonical_oracle.test.mjs \
  labs/rust-trust-core/node/canonical_adversarial_corpus.test.mjs \
  labs/rust-trust-core/node/canonical_adversarial_limits.test.mjs
node mesh/src/rust-trust-core-source-boundary.mjs
git diff --exit-code ec2a480ff8d903fbef89807429c289637e3a0d7c -- trust-core/rust/canonical_value_v0.rs
rustc --version
cargo fmt --manifest-path labs/rust-trust-core/Cargo.toml --all -- --check
cargo clippy --manifest-path labs/rust-trust-core/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path labs/rust-trust-core/Cargo.toml --locked
npm --prefix mesh run release:verify
```

The dedicated GitHub Actions workflow runs the Node oracle, Stage 4 generator and limits tests, Stage 3 source-boundary check, promoted-source integrity guard, and Rust checks. The Rust differential integration tests start the real Node oracle and deterministic generator subprocesses themselves.

## Evidence to record

For each accepted stage, record:

- exact Git commit;
- Node version where the Node oracle participates;
- Rust compiler version;
- Cargo version;
- conformance-vector version and counts;
- generated corpus algorithm, seeds, categories, and counts where applicable;
- resource-bound limits where applicable;
- format/Clippy/test result;
- dependency state;
- unsafe-code state;
- known semantic differences and excluded domains;
- exact promoted-source inventory where applicable;
- explicit non-claims.

Exact accepted head SHA and CI run identifiers are recorded in PR metadata after verification so recording evidence does not mutate the verified repository head.

## Current non-claims

This experiment does not claim:

- Rust is already the AXIOM production kernel;
- source promotion is runtime or authority promotion;
- Rust has replaced any supported Node behavior or call site;
- the Node kernel or `canonicalJson` implementation is deprecated;
- semantic equivalence exists beyond the bounded Stage 1 and `canonical-value-v0` Stage 2/3/4 evidence;
- generated coverage proves equivalence for all possible values in the admitted domain;
- `canonical-value-v0` is a production protocol or complete JSON canonicalization specification;
- JavaScript-specific object-state defenses have Rust equivalents in this stage;
- cryptographic digest equivalence, persistence equivalence, recovery equivalence, or runtime-authority equivalence has been demonstrated;
- any supported production executable consumes the promoted Rust source;
- Stage 4 resource limits are production runtime limits;
- the Stage 4 source-integrity gate is `release:verify` authority;
- any new capability, network surface, external effect, identity authority, consent authority, governance authority, or durable-state authority exists.
