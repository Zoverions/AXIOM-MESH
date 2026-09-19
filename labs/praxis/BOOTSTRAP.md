# Praxis bootstrap and AXIOM migration path

This note defines the conditions under which Praxis could move from an inert
language experiment to an implementation substrate for AXIOM-MESH.

It is not a production plan or promotion record.

## Core distinction

While the current AXIOM runtime remains canonical, a Praxis execution path that
performs privileged effects outside the existing authority path is a bypass.

If Praxis later becomes the reviewed implementation of that authority path,
using Praxis is no longer a bypass merely because the old implementation is not
invoked. At that point the relevant question is whether the new implementation
preserves the canonical invariants and has been explicitly promoted as the new
authority root.

No source language gets that status automatically.

## Bootstrap problem

A language designed to protect authority eventually places trust in more than
its source semantics. The important split is between the **authority TCB** and
the **usability TCB**.

The authority TCB includes, at minimum:

- the Praxis authority semantics;
- canonical IR envelope verification;
- the runtime/interpreter checks that consume authority;
- runtime representation of linear authority and prepared effects;
- host/executor ABI;
- cryptographic canonicalization and digest rules;
- the mechanism that binds authority to an exact plan and durable preparation
  evidence.

The usability TCB includes the lexer, parser, static checker, lowering/compiler,
CLI, and review conveniences. Bugs there may reject a valid program or emit bad
IR, but they must not be sufficient to grant an effect. The runtime therefore
treats compiled IR as hostile input and re-checks the authority invariants it
relies on. The adversarial corpus includes hand-edited, re-sealed IR for this
reason.

The build/release toolchain remains part of the supply-chain trust problem, and
a malicious embedding host remains outside the protection of the P0 lab.

A future self-hosted compiler does not eliminate this problem. It changes where
the trust must be established.

## Migration stages

### P0 — inert laboratory

Current authority stage.

Praxis may parse, type-check, compile to inspectable IR, and execute only
against explicitly injected synthetic/test hosts.

Initial P1 corpus work and one P2 pure differential target may be developed
while the authority stage remains P0. Evidence maturity and runtime authority
are intentionally separate axes.

No production authority.

### P1 — semantic corpus

Encode AXIOM invariants as language-level conformance fixtures.

Minimum corpus:

- compiled IR is untrusted and cannot bypass runtime authority checks;
- knowledge cannot become authority;
- identity cannot become authority;
- discovery cannot become authority;
- planning cannot become authority;
- collective agreement cannot amplify authority;
- permit action/scope/exact-plan binding;
- quorum membership and threshold binding outside governed IR;
- linear authority consumption;
- expiry/revocation semantics;
- deny on absent/unknown/malformed policy results;
- durable preparation before external I/O;
- uncertain external outcome remains uncertain/prepared;
- completion requires a receipt bound to the exact preparation;
- cancellation, idempotency, replay, and rollback semantics;
- secret/reference separation and non-exportability.

### P2 — pure-component differential implementation

Reimplement components that perform no external effect and hold no production
authority.

Candidates should be deterministic functions such as:

- canonicalization;
- digest construction;
- schema/contract validation;
- policy evaluation over supplied fixtures;
- state-machine transition validation;
- evidence normalization.

Run old and Praxis implementations over the same positive, negative, malformed,
boundary, and adversarial corpus, including re-sealed hand-edited IR wherever
the component participates in an authority decision.

A mismatch is a blocker, not an invitation to choose whichever result is more
convenient.

### P3 — production-unreachable orchestration

Allow Praxis to express plans against a synthetic or isolated host adapter while
remaining unable to reach production credentials, Grid mutation, external
operators, or deployment surfaces.

Test:

- operation preparation;
- authorization binding;
- cancellation;
- lease expiry;
- replay;
- concurrent authorization races;
- malformed host responses;
- restart/recovery behavior.

### P4 — shadow execution

For a bounded existing AXIOM path, run Praxis beside the current implementation
without allowing Praxis to cause the effect.

Both implementations receive the same admissible inputs.

Record:

```text
old decision
Praxis decision
old preparation digest
Praxis preparation digest
old required authority
Praxis required authority
old receipt expectation
Praxis receipt expectation
```

Any disagreement remains observable and blocks promotion.

### P5 — constrained authority adapter

Permit one reviewed production-unreachable Praxis component to request an
existing AXIOM authority operation through an adapter.

Praxis still does not become an alternate root.

The adapter must preserve the existing:

```text
Gateway -> Hypervisor -> Sandbox -> Grid
```

authority path and durable external-effect boundary.

### P6 — protected component replacement

Replace one existing protected implementation only after:

- differential tests converge;
- security review converges;
- rollback is proven;
- observability distinguishes old/new implementation;
- exact release evidence is captured;
- no alternate legacy/new dual-authority path remains accidentally reachable.

The replaced component's **invariant** remains canonical even though its
implementation changes.

### P7 — authority-root candidacy

Only after multiple protected components have converged should Praxis be
considered for the authority root itself.

This requires a separate architecture decision.

The migration must define the new canonical path explicitly. For example, a
future architecture might become:

```text
Gateway
  -> Praxis Authority Verifier
  -> Praxis Hypervisor
  -> Sandbox
  -> Grid
```

or another reviewed equivalent.

This cannot emerge merely because more AXIOM code happens to be written in
Praxis.

### P8 — self-hosting

A self-hosted Praxis compiler may be considered only after a trusted bootstrap
compiler and reproducible build path exist.

Useful assurance techniques include:

- byte/reproducible builds where practical;
- compiler differential testing;
- independent parser/checker implementation;
- deterministic IR serialization;
- compiler fuzzing;
- property-based authority/effect tests;
- translation validation;
- diverse-double-compilation style checks where practical;
- signed release provenance;
- exact source/toolchain/build binding.

Self-hosting is a portability and sovereignty milestone, not proof of
correctness.

## Rewrite order

If AXIOM is substantially recoded in Praxis, migrate from lowest authority to
highest authority.

Preferred order:

```text
pure data + canonicalization
        |
validators / schemas
        |
policy and evidence evaluators
        |
planning / intent compilation
        |
sandbox orchestration
        |
hypervisor preparation
        |
Grid mutation / authority consumption
        |
external-effect execution
        |
Gateway / canonical authority root
```

The final three classes should move last because mistakes there change real
authority or external state.

## Promotion invariant

At every migration stage:

> A new implementation may replace old code. It may not silently replace the
> authority invariant.

That is the difference between a rewrite and a bypass.
