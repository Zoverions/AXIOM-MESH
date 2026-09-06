# Rust Trust-Core Migration Foundation — Design

**Status:** approved architectural direction; first implementation slice is an isolated laboratory

**Date:** 2026-09-06

**Scope:** establish the evidence, conformance, isolation, and typed-authority foundations for evaluating Rust as a future implementation language for the deepest AXIOM trusted core. This slice does not replace the supported Node.js kernel, widen authority, alter Gateway semantics, activate a new runtime, or create a production claim.

**Builds on:**

- `AGENTS.md`
- `CONTRIBUTING.md`
- `docs/rebuild/REQUIREMENTS.md`
- `docs/operations/GATEWAY-CLIENT-CONTRACT.md`
- `docs/architecture/PERSONAL-COMPUTE-FABRIC-AND-LOCAL-TRUST.md`
- `docs/MASTER-TODO-SOVEREIGN-HOST-DEPLOYMENT.md`

## 1. Decision

AXIOM will preserve the current clean-room Node.js kernel as the supported reference implementation while beginning a staged, evidence-gated evaluation of Rust for the smallest security-critical trust core.

The governing principle is:

> **Forgiving where experimentation is cheap. Unforgiving where authority is exercised.**

The migration must not be a rewrite. The Node implementation remains the executable specification and conformance oracle until a Rust implementation demonstrates semantic equivalence and stronger failure properties at an explicitly reviewed boundary.

## 2. Why a laboratory first

The current repository explicitly treats the Node.js kernel as the supported trusted implementation. Introducing Rust directly into `mesh/` would silently change the trusted-computing-base language and contradict current repository truth before evidence exists.

The first Rust work therefore lives under `labs/rust-trust-core/` and is:

- disabled by default;
- unreachable from the Gateway, Hypervisor, Sandbox, and Grid;
- unable to read production identities, secrets, user data, or durable state;
- unable to perform network or external effects;
- excluded from the capability registry;
- excluded from production promotion claims;
- independently testable in CI.

Its purpose is to test language and type-system suitability against AXIOM invariants, not to create a second authority plane.

## 3. Migration architecture

The intended long-term boundary remains:

```text
human applications / agents / integrations
              |
      versioned Gateway contract
              |
        trusted implementation
              |
     Hypervisor -> Sandbox -> Grid
```

The implementation language behind the Gateway may eventually change without changing the contract itself.

The staged target is:

```text
Stage 0  Node kernel remains authoritative
Stage 1  isolated Rust trust-core laboratory
Stage 2  shared language-neutral conformance vectors
Stage 3  Rust implementations of pure validation/canonicalization primitives
Stage 4  differential Node-vs-Rust conformance
Stage 5  cryptographic verification and capability evaluation candidates
Stage 6  privileged host/recovery/network-boundary candidates
Stage 7  explicitly reviewed trust-boundary replacement, if evidence supports it
```

No stage advances automatically.

## 4. First-slice components

### 4.1 Language-neutral conformance vectors

The first conformance surface is a deliberately small tab-separated vector format under:

`labs/rust-trust-core/fixtures/authority-vectors.v0.tsv`

It represents only the inputs necessary to test a deny-dominant authority gate:

- verified principal evidence;
- authorized capability evidence;
- whether consent is required and valid;
- whether an effect budget is required and whether capacity remains;
- expected allow/deny result.

TSV is used only as a laboratory test-vector format. It is not a production protocol or replacement for versioned Gateway JSON contracts.

### 4.2 Typed authority grant

The Rust laboratory exposes raw evidence structures but does not expose a public constructor for an `AuthorityGrant`.

Only the authority evaluator may produce an `AuthorityGrant`, and only when all required evidence passes. Future effect-bearing functions can therefore be designed to accept a grant token rather than a bag of unchecked booleans.

This is the core type-system experiment:

> **Can the implementation make unauthorized effect states harder to represent and harder to accidentally execute?**

### 4.3 Deny-dominant evaluation

The v0 evaluator must deny when any of the following holds:

1. principal evidence is not verified;
2. capability evidence is not authorized;
3. consent is required and not valid;
4. a budget is required and no budget remains.

Unknown or malformed conformance-vector values fail the test harness rather than being coerced into an allow result.

### 4.4 Unsafe and dependency policy

The Rust laboratory begins with:

- `#![forbid(unsafe_code)]`;
- zero third-party crate dependencies;
- `publish = false`;
- pinned minimum Rust version compatible with Rust 2024 edition;
- committed lockfile;
- CI formatting, Clippy, and unit/conformance tests.

Any future dependency requires the same threat, licensing, maintenance, integrity, update, removal, and supply-chain review required elsewhere in AXIOM.

Any future need for `unsafe` requires a separate design review, narrow encapsulation, explicit invariants, targeted tests, and a documented reason safe Rust cannot satisfy the requirement.

## 5. Authority and data boundaries

The laboratory has no runtime authority.

It must not:

- register a capability;
- bind a Gateway route;
- call the Hypervisor, Sandbox, or Grid;
- load production credentials or keys;
- read or write production durable state;
- open a network listener;
- perform egress;
- mint receipts that claim production authority;
- replace Node decisions in a supported path;
- advertise production readiness.

The current invariant remains unchanged:

```text
Gateway -> Hypervisor -> Sandbox -> Grid
```

## 6. Experiment manifest

`labs/rust-trust-core/EXPERIMENT.md` records the laboratory hypothesis, threat model, assumptions, synthetic test data, failure criteria, halt procedure, reproducibility steps, and non-claims required by the repository frontier-laboratory policy.

The experiment fails if the Rust implementation requires widening authority, cannot reproduce the declared deny-dominant vectors, introduces unreviewed unsafe code or dependencies, or causes current Node verification to regress.

## 7. Testing strategy

The first implementation follows TDD.

### RED

Commit the Rust crate scaffold and conformance test before the authority evaluator exists. CI must fail because the expected evaluator/types are missing.

### GREEN

Implement only the minimum evaluator and private `AuthorityGrant` construction needed for the vectors to pass.

### REFACTOR

Run formatting and Clippy with warnings denied. No behavior expansion occurs during refactoring.

The laboratory workflow runs independently of protected Node checks. The existing Node workflow still runs on the documentation/workflow changes in the foundation PR, ensuring that the supported kernel remains clean.

## 8. Evidence gates for later stages

A future stage may begin only after the prior stage records:

- exact source commit;
- compiler/toolchain version;
- test commands and results;
- conformance-vector version;
- dependency and unsafe-code state;
- known semantic differences;
- limitations and non-claims.

Replacing any supported Node authority behavior requires additional evidence:

- differential tests against exact Node semantics;
- negative/failure-path equivalence;
- canonical serialization equivalence where applicable;
- cryptographic verification equivalence where applicable;
- crash/restart/recovery behavior;
- rollback path;
- independent review;
- explicit promotion decision.

## 9. Rollback and decommissioning

Until a later promotion decision, rollback is deletion of the laboratory and its dedicated CI workflow. No production migration is required because the laboratory has no runtime integration.

If Rust later becomes a supported implementation, every migrated slice must retain a tested rollback route to the last accepted implementation until that rollback is explicitly retired.

## 10. Current non-claims

This design does not claim:

- Rust is already safer in AXIOM's actual implementation;
- the Rust laboratory is production code;
- the Node kernel is deprecated;
- Gateway behavior has changed;
- any capability is newly enabled;
- any Rust code has authority over user data, identity, consent, governance, networking, or effects;
- semantic equivalence has been demonstrated beyond the bounded laboratory vectors.

## 11. Completion criterion for the foundation slice

The foundation slice is complete when:

1. the isolated laboratory and experiment manifest exist;
2. the zero-dependency Rust crate forbids unsafe code;
3. deny-dominant typed-authority behavior passes the shared v0 vectors;
4. dedicated Rust CI passes formatting, Clippy, and tests;
5. protected Node verification remains green;
6. no capability-registry or production-state claim changes are made;
7. the next migration stage is explicitly separated from this one.
