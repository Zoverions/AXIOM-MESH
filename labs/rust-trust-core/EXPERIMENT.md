# Rust Trust-Core Laboratory Experiment

**Status:** isolated frontier laboratory; disabled by default

**Date:** 2026-09-06

**Authority:** none

**Production reachability:** none

## Hypothesis

A small Rust implementation can encode AXIOM's deny-dominant authority decision as a typed interface in which an `AuthorityGrant` can only be produced by validated evaluation, while using no third-party crate dependencies and no unsafe Rust.

The experiment is successful only if that implementation reproduces the declared synthetic conformance vectors without changing or bypassing the supported Node.js authority path.

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
- describe laboratory success as a production migration.

## Assumptions

- The current Node.js kernel remains the supported reference implementation.
- The Gateway -> Hypervisor -> Sandbox -> Grid authority invariant remains unchanged.
- Laboratory inputs are synthetic and contain no user data, credentials, or production evidence.
- Rust 1.85.0 with edition 2024 semantics is sufficient for this bounded experiment.
- The first slice evaluates type/interface suitability only; it does not evaluate cryptographic, persistence, recovery, or network equivalence.

## Test data

`fixtures/authority-vectors.v0.tsv` contains bounded synthetic cases only.

The vector format is a laboratory test format, not a production protocol. It contains:

- `case_id`;
- `principal_verified`;
- `capability_authorized`;
- `consent_required`;
- `consent_valid`;
- `budget_required`;
- `budget_remaining`;
- `expected` (`allow` or `deny`).

## Isolation boundary

The laboratory:

- lives only under `labs/rust-trust-core/` plus its dedicated CI workflow and migration documentation;
- has no entry in `mesh/config/capabilities.json`;
- has no Gateway route;
- has no imports from supported runtime code;
- has no access to production identities, secrets, keys, durable state, or receipts;
- opens no listener and performs no egress;
- cannot call Hypervisor, Sandbox, or Grid;
- is not built into the candidate production image;
- is not a production dependency.

## Failure criteria

The experiment fails if any of the following occurs:

- a declared deny vector evaluates to allow;
- a declared allow vector evaluates to deny without an identified vector/spec defect;
- `AuthorityGrant` is publicly constructible outside the evaluator;
- the crate requires `unsafe` code in this slice;
- the crate requires a third-party dependency in this slice;
- malformed fixture values are silently interpreted as authorized;
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

No production rollback is required because this stage has no production integration.

## Reproducibility

From a checkout containing Rust 1.85.0:

```bash
rustc --version
cargo fmt --manifest-path labs/rust-trust-core/Cargo.toml --all -- --check
cargo clippy --manifest-path labs/rust-trust-core/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path labs/rust-trust-core/Cargo.toml --locked
```

The dedicated GitHub Actions workflow runs the same checks on the repository branch/PR.

## Evidence to record

For each accepted stage, record:

- exact Git commit;
- Rust compiler version;
- Cargo version;
- conformance-vector version;
- format/Clippy/test result;
- dependency state;
- unsafe-code state;
- known limitations;
- explicit non-claims.

## Current non-claims

This experiment does not claim:

- Rust is already the AXIOM production kernel;
- Rust has replaced any supported Node behavior;
- the Node kernel is deprecated;
- semantic equivalence exists beyond the bounded vectors;
- any new capability, network surface, external effect, identity authority, consent authority, governance authority, or durable-state authority exists.
