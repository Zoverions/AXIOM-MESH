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

`AuthorityGrant` is intentionally neither `Copy` nor `Clone`. The laboratory includes compile-fail evidence that an evaluated grant cannot be reused after move and that callers outside the crate cannot construct a grant directly. This does not yet make the grant a production one-use mandate; it establishes the type-level non-reuse foundation on which a later consumable effect API can be evaluated.

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

---

## 12. Stage 5B amendment — fresh authority-reconstitution gate

**Amendment status:** implementation-plan review gate; no Stage 5B implementation authority

**Stage 5B base:** signed `main` merge commit `1f457508f5c6bf2e4361bce1e791cd4f658c0a47`, which merged Stage 5A through PR #1554.

**Prior-stage classification:** Stage 5A is laboratory-only Node↔Rust intent-attenuation evidence. It is not production authority and does not authorize the next migration slice.

The governing Stage 5B rule is:

> **Stage 5A evidence is admissible at Stage 5B; Stage 5A authority is not.**

Stage 5B is therefore a fresh architectural gate. It must re-establish, from current `main`, the exact migration scope, trusted-computing-base boundary, authority map, invariants, threat model, language-neutral migration contract, failure and disagreement semantics, recovery/rollback model, dependency/`unsafe`/bridge policy, and review requirements before any next migration implementation begins.

A successful Stage 5B design review authorizes only a separate Stage 5B implementation plan. It does not authorize production Rust execution, call-site replacement, capability widening, or an effect-bearing migration.

Node remains the supported authoritative implementation unless a later explicit implementation-and-promotion gate changes that fact.

## 13. Why Stage 5B does not inherit Stage 5A authority

Stage 5A proved only a bounded semantic-parity claim around the existing Node `verifyIntentAttenuation()` subset checks for actions, purposes, destinations, and resources.

Stage 5A did not establish or authorize:

- grant issuance or signature verification;
- credential verification;
- capability consumption;
- consent evaluation;
- budget evaluation;
- expiry/currentness semantics;
- causal-history or composition restrictions;
- persistence, crash recovery, or state mutation;
- production Rust runtime integration;
- FFI, WASM, subprocess, service, or linked-runtime authority;
- Gateway, Hypervisor, Sandbox, or Grid replacement;
- effect authorization or execution.

Those are qualitatively different authority boundaries, not merely a larger Stage 5A test matrix. Treating Stage 5A as implicit permission to cross them would allow laboratory conformance evidence to become accidental architecture.

## 14. Stage 5B approaches considered

### A. Incremental continuation with inherited Stage 5A boundary

Treat the next slice as a larger Stage 5A authority-semantic differential and preserve Stage 5A assumptions unless testing exposes a problem.

**Rejected.** This makes prior implementation structure and test boundaries the default architecture and risks authority by momentum.

### B. Fresh authority gate with evidence carry-forward

Treat accepted Stage 1–5A work as evidence that may reduce uncertainty, while requiring Stage 5B to independently justify every authority-sensitive premise it relies on.

**Selected.** This preserves valuable evidence without confusing evidence continuity with authority continuity.

### C. Discard all prior evidence and restart from zero

Repeat the migration programme without relying on accepted Stage 1–5A results.

**Rejected.** Existing exact-head evidence remains useful provenance. A fresh authority decision does not require pretending prior evidence does not exist.

## 15. Stage 5B input classification

Every prior-stage fact imported into Stage 5B must be explicitly classified as one of:

- **provenance** — records what was previously built or tested;
- **evidence** — supports a proposition but grants no authority;
- **assumption** — currently believed and requiring Stage 5B validation if authority-sensitive;
- **constraint** — imposed by a higher-order repository/security rule and not negotiable inside Stage 5B;
- **non-claim** — remains unproven;
- **reopened question** — a prior decision that Stage 5B deliberately re-evaluates.

No prior artifact may be cited as “already approved” when the claim being made concerns a Stage 5B authority boundary.

## 16. Mandatory Stage 5B design outputs

Stage 5B is not complete until the selected migration slice records all of the following.

### 16.1 Exact migration target and non-goals

The gate must name:

- the exact supported Node behavior under consideration;
- the exact Rust source/package/runtime surface proposed to implement or validate it;
- whether the slice is laboratory-only, source-promoted, production-adjacent, or runtime-reachable;
- what state, credentials, keys, capabilities, receipts, network data, or effects it may touch;
- what is explicitly excluded.

“Continue the Rust migration” is not an acceptable scope statement.

### 16.2 Trusted-computing-base inventory

The gate must enumerate every component whose correctness would become security-relevant if the slice succeeds, including as applicable:

- supported Node implementation/oracle;
- Rust laboratory crate;
- promoted Rust source under `trust-core/rust/`;
- any new Rust package or executable;
- serialization/parser boundary;
- FFI/WASM/subprocess/service bridge;
- release verification;
- CI-only evidence machinery;
- host supervisor or OS integration.

Repository presence does not itself make a component part of the TCB. Conversely, any component that can influence an authority result cannot be omitted from the TCB merely because it is described as glue.

### 16.3 Authority map

For every Stage 5B component, the design must state:

- what inputs it may trust;
- what claims it may produce;
- what authority it may exercise;
- what authority it must never mint;
- what downstream component independently re-verifies its output;
- whether failure is fail-closed;
- whether it can increase effect scope.

The protected production authority chain remains:

```text
Gateway -> Hypervisor -> Sandbox -> Grid
```

Any proposed change to that chain is itself a Stage 5B architectural decision and cannot be inherited from Stage 5A.

### 16.4 Invariant ledger

The initial mandatory Stage 5B invariants are:

1. capability is not authority;
2. conformance evidence is not runtime authority;
3. source promotion is not execution promotion;
4. a Rust `valid=true` or equivalent result cannot itself mint a grant or effect permission;
5. malformed, unknown, stale, unverifiable, or partially bound evidence fails closed;
6. effect-increasing transitions require the currently applicable authority path, not self-reported state;
7. migration plumbing may not implicitly create persistent identity, consent, credential, governance, state, network, or external-effect authority;
8. rollback must not require trusting the component being rolled back;
9. coexistence may not permit a weaker implementation path to authorize what the stronger path would deny;
10. prior-stage evidence may strengthen confidence but cannot waive a Stage 5B invariant.

The later implementation plan may add stricter invariants. It may not silently weaken these.

## 17. Stage 5B threat-model refresh

Stage 5B must use the current repository and proposed migration topology rather than copy the Stage 5A threat model unchanged.

At minimum, review must cover:

- authority laundering through “verification-only” helpers;
- confused-deputy behavior between Node and Rust;
- disagreement handling when implementations differ;
- downgrade to a weaker implementation during coexistence;
- stale or replayed evidence crossing the implementation boundary;
- parser/canonicalization divergence before cryptographic verification;
- FFI memory/ownership hazards if FFI is proposed;
- subprocess path, environment, stdin/stdout, executable-replacement, and exit-code ambiguity if subprocess integration is proposed;
- WASM host-call authority leakage if WASM is proposed;
- service authentication, admission, replay, and failure semantics if IPC/service integration is proposed;
- dependency compromise and supply-chain expansion;
- `unsafe` expansion;
- panic/crash behavior and partial state transition;
- rollback after durable state has been written by a new implementation;
- time/currentness differences across runtimes;
- cross-platform semantic differences;
- test-oracle contamination where two implementations accidentally share the same flawed logic.

A Stage 5B finding may reopen an earlier stage if it invalidates an earlier accepted claim. Stage numbering does not override contrary evidence.

## 18. Stage 5B migration-contract requirements

Before implementation planning, Stage 5B must freeze a language-neutral contract for the selected slice.

The contract must specify:

- admitted input grammar and canonical representation;
- preconditions and independently verified evidence requirements;
- exact outputs and error classes;
- deterministic versus ambient inputs;
- currentness/time semantics where relevant;
- resource bounds;
- state-transition semantics if any state is touched;
- idempotence/replay behavior where relevant;
- receipt/evidence requirements;
- compatibility/version-negotiation behavior;
- what constitutes semantic mismatch;
- what happens on mismatch.

JavaScript object behavior, Rust type layout, process exit conventions, or FFI ABI details do not become conceptual protocol merely because an implementation uses them.

## 19. Coexistence and disagreement policy

If Node and Rust evaluate the same authority-sensitive operation during Stage 5B, the default policy is:

> **Any Node/Rust disagreement fails closed and blocks migration advancement. Node remains authoritative for supported operation until a later explicit promotion gate.**

Stage 5B must not use majority voting, “prefer Rust,” “prefer the new implementation,” fuzzy semantic equivalence, or normalization-after-comparison to hide disagreement.

Shadow execution must not duplicate effects. A conformance path must be side-effect-free unless a separate Stage 5B design proves effect isolation.

## 20. Dependency, `unsafe`, and bridge policy

Stage 5B must explicitly approve any expansion beyond the current zero-third-party-dependency, `#![forbid(unsafe_code)]` laboratory posture.

No third-party dependency, `unsafe` block, FFI bridge, WASM runtime, subprocess integration, IPC service, or production Cargo manifest may appear merely because a candidate migration slice seems to need it.

For each proposed expansion, Stage 5B must record:

- why the current boundary is insufficient;
- alternatives considered;
- new TCB/supply-chain surface;
- update and provenance policy;
- platform implications;
- failure behavior;
- rollback behavior;
- independent review requirement.

The default is deny introduction until specifically justified and approved.

## 21. Persistence, recovery, and rollback gate

Any Stage 5B slice that can write durable state or influence a state transition must define recovery before implementation begins.

The design must answer:

- whether existing Node code can read state written by the new Rust path;
- whether the new Rust path can read all currently supported state;
- how interrupted writes are detected;
- how partial transitions are rejected or recovered;
- whether rollback requires state migration;
- how receipts identify which implementation produced a transition;
- how downgrade safety is preserved;
- what exact event halts rollout.

If these answers are not available, Stage 5B keeps the slice read-only or laboratory-only.

## 22. Evidence architecture

Stage 5B must declare evidence requirements before implementation.

The minimum evidence classes are:

- positive conformance;
- negative/fail-closed conformance;
- boundary values;
- deterministic generated/adversarial evidence where useful;
- deliberate mismatch detection;
- malformed transport/parser rejection;
- resource-bound rejection;
- cross-platform verification where host semantics matter;
- crash/restart/recovery evidence if state is touched;
- rollback evidence if production reachability exists;
- authority-boundary regression proving the candidate cannot be called from an unapproved path;
- exact-head verification.

Passing Stage 5A tests is inherited evidence only. Stage 5B acceptance criteria must be independently sufficient for the selected Stage 5B slice.

## 23. Approval and independent-review boundary

Stage 5B requires distinct approvals for design and implementation/promotion.

**Design approval** accepts only the selected scope, TCB, authority map, invariants, threat model, migration contract, failure/rollback model, and evidence architecture.

**Implementation/promotion approval** later accepts an exact implementation against that approved design and plan.

A green implementation PR cannot substitute for design approval. Implementation success cannot retroactively redefine the design.

Any material change to the migration target, TCB, authority map, language-neutral contract, dependency/`unsafe`/bridge policy, state ownership, rollback model, or effect reachability reopens Stage 5B design review.

Any production-reachable or effect-influencing Stage 5B slice requires an authority-boundary review independent from the implementation pass before promotion.

## 24. Stage 5B design acceptance criteria

The Stage 5B design gate is accepted only when:

1. it is reviewed against current `main`, not merely a Stage 5A feature branch;
2. Stage 5A is classified as evidence/provenance, not inherited authority;
3. the exact next migration target is separately specified before implementation planning;
4. the Stage 5B TCB inventory is explicit;
5. the authority map is explicit;
6. the invariant ledger is explicit;
7. the threat model is refreshed for the selected topology;
8. the language-neutral migration contract is frozen for the selected slice;
9. failure, disagreement, rollback, and downgrade semantics are explicit;
10. dependency/`unsafe`/bridge decisions are explicit;
11. the evidence architecture is declared before implementation;
12. no production behavior, capability, supported runtime call site, or effect path changes merely to pass the design gate.

This amendment establishes the gate structure. It intentionally does **not** choose an effect-bearing migration target. The separately reviewed Stage 5B target is the laboratory-only authority-context structural validation slice recorded in `labs/rust-trust-core/STAGE5B-AUTHORITY-CONTEXT-VALIDATION.design.txt`.

## 25. Stage 5B non-claims

Acceptance of this amendment does not claim:

- Rust is production authority;
- Rust should replace the entire Node kernel;
- Stage 5A semantics are sufficient for broader authority evaluation;
- the next migration target is full `authority-composition-guard.mjs`;
- cryptographic verification should move next;
- a production Cargo package is approved;
- FFI, WASM, subprocess, IPC, or service integration is approved;
- `unsafe` is approved;
- a new third-party dependency is approved;
- any capability, Gateway route, Hypervisor/Sandbox/Grid behavior, consent, credential, governance, persistent-state, network, or external-effect authority is changed;
- Node is deprecated.

## 26. Failure and rollback of Stage 5B design

If review shows the proposed next migration target cannot satisfy a clear authority map, fail-closed disagreement model, bounded TCB, or recovery/rollback rule, Stage 5B does not proceed to implementation.

The correct result may be to:

- narrow the slice;
- keep it laboratory-only;
- choose a different migration boundary;
- strengthen the Node contract first;
- add missing evidence in an earlier stage;
- or defer migration entirely.

A rejected design requires no code or data rollback because Stage 5B design approval grants no production runtime authority.

## 27. Transition after Stage 5B written-spec approval

The Stage 5B written design has now been translated into a separate implementation plan. The implementation plan is recorded in `docs/superpowers/plans/2026-09-06-rust-trust-core-migration-foundation.md` under the Stage 5B amendment and clarified by `labs/rust-trust-core/STAGE5B-AUTHORITY-CONTEXT-VALIDATION.plan.txt`.

No Stage 5B implementation code may begin until that implementation plan is separately approved.

Plan approval authorizes only the bounded laboratory structural-validation tasks recorded there. It does not authorize production runtime reachability, source promotion, authority evaluation, cryptography, dependency/unsafe/bridge expansion, or any effect-bearing migration.

Any implementation discovery requiring a material change to target, TCB, authority map, language-neutral contract, dependency/unsafe/bridge policy, state reachability, rollback model, or effect reachability reopens Stage 5B design review before code changes continue.
