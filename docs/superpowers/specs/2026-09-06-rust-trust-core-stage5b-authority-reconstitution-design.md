# Rust Trust-Core Stage 5B Authority Reconstitution — Design

**Status:** written-spec review gate; no implementation authority

**Date:** 2026-09-06

**Base main:** signed merge commit `1f457508f5c6bf2e4361bce1e791cd4f658c0a47`

**Prior stage:** Stage 5A merged through PR #1554 as laboratory-only Node↔Rust intent-attenuation evidence. Stage 5A remains non-authoritative.

**Scope:** define the fresh architectural gate that must be passed before the next Rust trust-core migration step. Stage 5B does not inherit implementation or authorization authority from Stage 5A. Stage 1–5A artifacts are admissible evidence and provenance only.

## 1. Decision

The next architectural migration step must pass a fresh Stage 5B design gate.

The governing rule is:

> **Stage 5A evidence is admissible at Stage 5B; Stage 5A authority is not.**

Stage 5B therefore re-establishes, from the current repository state, the scope, trusted-computing-base boundary, authority boundary, invariants, threat model, migration contract, failure semantics, rollback semantics, dependency/unsafe/FFI policy, and approval criteria for whatever migration slice follows.

A successful Stage 5B design review authorizes only creation of a separate implementation plan for the explicitly approved Stage 5B slice. It does not itself authorize production Rust execution, call-site replacement, capability widening, or any effect-bearing migration.

Node remains the supported authoritative implementation unless and until a later implementation-and-promotion gate explicitly changes that fact.

## 2. Why Stage 5B is not a continuation of Stage 5A

Stage 5A proved a deliberately narrow claim: a laboratory Rust candidate reproduced the supported Node `verifyIntentAttenuation()` subset semantics for actions, purposes, destinations, and resources across bounded curated and generated evidence while Node remained authoritative.

Stage 5A explicitly did not prove or authorize:

- grant issuance;
- grant signature verification;
- credential verification;
- capability consumption;
- consent evaluation;
- budget evaluation;
- expiry/currentness semantics;
- causal-history or composition restrictions;
- persistence or crash recovery;
- state mutation;
- Gateway, Hypervisor, Sandbox, or Grid replacement;
- production Rust runtime integration;
- FFI, WASM, subprocess, service, or linked-runtime authority;
- effect authorization or execution.

Those omissions are not merely a larger test matrix. They cross qualitatively different authority boundaries. Carrying Stage 5A forward as implicit permission would allow a laboratory conformance result to become accidental architectural authority.

Stage 5B prevents that inheritance.

## 3. Approaches considered

### A. Continue Stage 5A incrementally and inherit its accepted boundary

Treat Stage 5B as the next larger authority-semantic differential slice and preserve the Stage 5A assumptions unless a test fails.

**Rejected.** This makes prior implementation structure and prior test boundaries the default architecture. It risks turning successful laboratory evidence into authority by momentum.

### B. Fresh authority gate with evidence carry-forward

Treat all accepted Stage 1–5A work as evidence that may reduce uncertainty, while requiring Stage 5B to independently justify every authority-sensitive boundary it relies on.

**Selected.** This preserves valuable conformance evidence without confusing evidence continuity with authority continuity.

### C. Discard all prior Rust migration evidence and restart from zero

Re-run Stage 1–5A without relying on their accepted results.

**Rejected.** Existing exact-head evidence remains useful provenance. Requiring a fresh authority decision does not require pretending prior evidence does not exist.

## 4. Stage 5B input model

Stage 5B may consume prior artifacts only under explicit classification.

Every imported prior-stage fact must be labeled as one of:

- **provenance:** records what was built or tested previously;
- **evidence:** supports a Stage 5B proposition but grants no authority;
- **assumption:** currently believed and requiring Stage 5B validation if authority-sensitive;
- **constraint:** externally or constitutionally imposed and not negotiable inside Stage 5B;
- **non-claim:** a boundary that remains unproven;
- **reopened question:** a prior decision that Stage 5B deliberately re-evaluates.

No prior artifact may be cited as “already approved” when the claim being made concerns a Stage 5B authority boundary.

## 5. Mandatory Stage 5B design outputs

Stage 5B is not complete until one reviewed design records all of the following.

### 5.1 Exact migration target and non-goals

The gate must name the next slice precisely.

It must state:

- which existing Node behavior is under consideration;
- which Rust source would implement or validate it;
- whether the slice is laboratory-only, source-promoted, production-adjacent, or runtime-reachable;
- what state, credentials, keys, capabilities, receipts, network data, or effects it may touch;
- what is explicitly excluded.

“Continue the Rust migration” is not an acceptable scope statement.

### 5.2 Trusted-computing-base inventory

The gate must enumerate the exact components whose correctness would become security-relevant if the slice succeeds.

At minimum it must classify:

- supported Node implementation/oracle;
- Rust laboratory crate;
- promoted Rust source under `trust-core/rust/`;
- any new Rust package or executable;
- any serialization/parser boundary;
- any FFI/WASM/subprocess/service bridge;
- release verification;
- CI-only evidence machinery;
- host supervisor or OS integration if applicable.

A component being present in the repository does not make it part of the TCB. Conversely, a component that can influence an authority result cannot be omitted from the TCB merely because it is described as glue.

### 5.3 Authority map

The design must state, for each component:

- what inputs it may trust;
- what claims it may produce;
- what authority it may exercise;
- what authority it must never mint;
- what downstream component independently re-verifies its output;
- whether failure is fail-closed;
- whether the component can increase effect scope.

The protected production authority chain remains:

```text
Gateway -> Hypervisor -> Sandbox -> Grid
```

Any proposed change to that chain is itself a Stage 5B architectural decision and cannot be inherited from previous migration work.

### 5.4 Invariant ledger

Stage 5B must explicitly re-approve all invariants relevant to the selected slice.

The initial mandatory set is:

1. capability is not authority;
2. conformance evidence is not runtime authority;
3. source promotion is not execution promotion;
4. Rust `valid=true` or equivalent cannot itself mint a grant or effect permission;
5. malformed, unknown, stale, unverifiable, or partially bound evidence fails closed;
6. effect-increasing transitions require the currently applicable authority path, not self-reported state;
7. no new persistent identity, consent, credential, governance, state, network, or external-effect authority appears implicitly through migration plumbing;
8. rollback cannot require trusting the component being rolled back;
9. version or implementation coexistence cannot allow a weaker path to authorize what the stronger path would deny;
10. prior-stage evidence may strengthen confidence but cannot waive a Stage 5B invariant.

The implementation plan may add stricter invariants. It may not silently weaken these.

## 6. Threat-model refresh

Stage 5B must use the current repository and proposed migration topology rather than copying the Stage 5A threat model unchanged.

At minimum it must examine:

- authority laundering through “verification-only” helpers;
- confused-deputy behavior between Node and Rust;
- disagreement handling when two implementations return different results;
- downgrade to the weaker implementation during coexistence;
- stale or replayed evidence crossing the implementation boundary;
- parser/canonicalization divergence before cryptographic verification;
- FFI memory and ownership hazards if FFI is proposed;
- subprocess path, environment, stdin/stdout, executable-replacement, and exit-code ambiguity if subprocess integration is proposed;
- WASM host-call authority leakage if WASM is proposed;
- service-boundary authentication, admission, and replay if an out-of-process service is proposed;
- dependency compromise and supply-chain expansion;
- `unsafe` expansion;
- panic/crash behavior and partial state transition;
- rollback after durable state has been written by a new implementation;
- time/currentness differences across runtimes;
- cross-platform semantic differences;
- test-oracle contamination where the Rust implementation and Node oracle accidentally share the same flawed logic.

A threat found in Stage 5B may reopen an earlier stage if it invalidates that stage's accepted claim. Stage numbering does not override contrary evidence.

## 7. Migration-contract requirements

Before implementation planning, Stage 5B must define a language-neutral contract for the selected slice.

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
- compatibility and version-negotiation behavior;
- what constitutes semantic mismatch;
- what happens on mismatch.

JavaScript object behavior, Rust type layout, process exit conventions, or FFI ABI details must not become the conceptual contract unless the design explicitly declares them as protocol surface.

## 8. Coexistence and disagreement policy

If Stage 5B proposes a period in which Node and Rust both evaluate the same authority-sensitive operation, the design must choose one explicit disagreement model.

The default is:

> **Any Node/Rust disagreement fails closed and blocks migration advancement. Node remains authoritative for supported operation until a later explicit promotion gate.**

Stage 5B must not use majority voting, “prefer Rust,” “prefer the new implementation,” fuzzy semantic equivalence, or normalization-after-comparison to mask a disagreement.

Shadow execution must not create duplicate effects.

A conformance path must be side-effect-free unless the design separately proves effect isolation.

## 9. Dependency, `unsafe`, and bridge policy

Stage 5B must explicitly approve any expansion beyond the current zero-third-party-dependency, `#![forbid(unsafe_code)]` laboratory posture.

No dependency, `unsafe` block, FFI bridge, WASM runtime, subprocess integration, IPC service, or production Cargo manifest may be introduced merely because the next migration slice appears to need it.

For each proposed expansion, the design must record:

- why the standard library/current boundary is insufficient;
- alternatives considered;
- new TCB/supply-chain surface;
- update and provenance policy;
- platform implications;
- failure behavior;
- rollback behavior;
- independent review requirement.

The default remains **deny introduction until specifically justified and approved**.

## 10. Persistence, recovery, and rollback gate

Any Stage 5B slice that can write durable state or influence a state transition must define recovery before implementation begins.

The design must answer:

- can old Node code read state written by the new Rust path;
- can the new Rust path read all currently supported state;
- how interrupted writes are detected;
- how partial transitions are rejected or recovered;
- whether rollback requires state migration;
- how receipts prove which implementation produced a transition;
- how downgrade safety is preserved;
- what exact event halts rollout.

If those answers are not available, Stage 5B must keep the slice read-only or laboratory-only.

## 11. Evidence and test architecture

Stage 5B must define evidence before implementation.

The minimum evidence classes are:

- positive conformance;
- negative/fail-closed conformance;
- boundary values;
- deterministic generated or adversarial cases where useful;
- deliberate mismatch detection;
- malformed transport/parser rejection;
- resource-bound rejection;
- cross-platform verification where host semantics matter;
- crash/restart/recovery evidence if state is touched;
- rollback evidence if production reachability exists;
- authority-boundary regression proving the candidate cannot be called from an unapproved path;
- exact-head verification.

Passing Stage 5A tests is inherited evidence only. Stage 5B acceptance criteria must be sufficient for the Stage 5B slice on their own.

## 12. Approval and independent-review boundary

Stage 5B requires two distinct approvals:

1. **design approval:** this architecture, scope, TCB, invariants, threat model, and migration contract are accepted;
2. **implementation/promotion approval:** a later exact implementation is accepted against the approved design and plan.

Design approval cannot be substituted by a green implementation PR.

Implementation success cannot retroactively redefine the approved design.

Any material change to:

- migration target;
- TCB;
- authority map;
- language-neutral contract;
- dependency/unsafe/bridge policy;
- state ownership;
- rollback model;
- effect reachability;

reopens the Stage 5B design gate.

For any production-reachable or effect-influencing Stage 5B slice, an authority-boundary review independent from the implementation pass is mandatory before promotion.

## 13. Stage 5B design acceptance criteria

This design gate is accepted only when:

1. it is reviewed against current `main`, not merely the Stage 5A feature branch;
2. Stage 5A is classified as evidence/provenance, not inherited authority;
3. the exact next migration target is separately specified before implementation planning;
4. the Stage 5B TCB inventory is explicit;
5. the authority map is explicit;
6. the invariant ledger is explicit;
7. the threat model is refreshed for the selected topology;
8. the language-neutral migration contract is frozen for the selected slice;
9. failure, disagreement, rollback, and downgrade semantics are explicit;
10. dependency/unsafe/bridge decisions are explicit;
11. the evidence architecture is declared before implementation;
12. no production behavior, capability, supported runtime call site, or effect path changes merely to pass the design gate.

The current design document establishes the gate structure. It intentionally does **not** choose the next effect-bearing migration target. That choice belongs inside the fresh gate and must not be inferred from Stage 5A chronology.

## 14. Immediate non-claims

Creation or acceptance of this Stage 5B design does not claim:

- Rust is production authority;
- Rust should replace the whole Node kernel;
- Stage 5A semantics are sufficient for broader authority evaluation;
- the next migration target is full `authority-composition-guard.mjs`;
- cryptographic verification should move next;
- a production Cargo package is approved;
- FFI, WASM, subprocess, IPC, or service integration is approved;
- `unsafe` is approved;
- a new third-party dependency is approved;
- any capability, Gateway route, Hypervisor/Sandbox/Grid behavior, consent, credential, governance, persistent-state, network, or external-effect authority is changed;
- Node is deprecated.

## 15. Failure and rollback of the design gate

If review shows the proposed next migration target cannot satisfy a clear authority map, fail-closed disagreement model, recovery/rollback rule, or bounded TCB, Stage 5B does not proceed to implementation.

The correct result may be:

- narrow the slice;
- keep it laboratory-only;
- select a different migration boundary;
- strengthen the Node contract first;
- add missing evidence in an earlier stage;
- or defer migration entirely.

A design-gate rejection requires no code or data rollback because Stage 5B grants no production runtime authority.

## 16. Transition after written-spec approval

After this written specification is reviewed and approved, the next step is **not implementation immediately**.

The next step is to invoke the implementation-planning gate and produce a Stage 5B plan that:

1. names the exact first migration slice;
2. maps each implementation task to the approved Stage 5B outputs above;
3. begins with RED evidence for the new gate-specific boundary;
4. preserves Node authority until an explicit later promotion decision;
5. includes exact rollback and exact-head verification steps;
6. stops if implementation would require an unapproved change to scope or authority.

Only that separately reviewed implementation plan may authorize Stage 5B code work.
