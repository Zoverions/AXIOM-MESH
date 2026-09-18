# Personal Agent Context Compiler + Memory Promotion Gate v0

**Status:** laboratory-only, stacked on the Rust Personal Agent Kernel vNext lane  
**Date:** 2026-09-18

## Goal

Make context assembly and durable-memory promotion explicit, deterministic, bounded, inspectable parts of the Personal Agent Kernel without creating a new authority engine or production data path.

The subsystem implements this non-authorizing flow:

```text
Durable state references
  -> bounded context projection
  -> ephemeral execution context manifest
  -> result/evidence
  -> memory promotion assessment
  -> separate authorized persistence effect
```

It does **not** implement the final persistence effect.

## Architectural position

The canonical production authority path remains:

```text
Gateway -> Hypervisor -> Sandbox -> Grid
```

The Context Compiler lives on the Knowledge side of the existing:

```text
Knowledge -> Operation -> Authority
```

boundary.

It may decide what information is eligible to be presented to a runtime. It cannot mint, infer, consume, move, or verify execution authority.

The Memory Promotion Gate determines only whether a candidate is semantically eligible to proceed to a distinct durable-write operation. It cannot write memory and cannot turn knowledge, successful history, model output, continuity, or an assessment into authority.

## Context Compiler

### Inputs

A context compilation request binds:

- task ID;
- owner subject;
- purpose;
- target capability reference;
- exact instruction-set digest;
- exact runtime-surface digest;
- exact capability-surface digest;
- item and token ceilings;
- sensitivity ceiling;
- provenance requirement;
- caller-supplied candidate references.

Candidates contain references and digests, not content bytes.

### Candidate classes

v0 recognizes:

- instructions;
- durable memory;
- tool state;
- evidence;
- skills;
- artifacts.

These classifications affect auditability, not authority.

### Hard exclusions

The compiler rejects or omits:

- authority-bearing material;
- embedded secrets;
- critical-secret classified material;
- owner mismatches;
- quarantined, stale, or superseded inputs;
- inputs above the configured sensitivity ceiling;
- provenance-free inputs when provenance is required;
- duplicate item references;
- malformed digests/identifiers.

A blocked **required** item fails the compilation. A blocked optional item is preserved in the omission ledger with deterministic reason strings.

### Deterministic selection

Eligible candidates are ordered by:

1. required before optional;
2. lower numeric priority first;
3. lexical item reference.

The compiler then applies exact item and estimated-token ceilings.

A required item that cannot fit fails closed. An optional item that cannot fit is omitted with an explicit budget reason.

### Bundle binding

The compiler creates a canonical length-prefixed preimage containing:

- task bindings;
- context policy limits;
- every selected item reference/digest/provenance reference;
- every omission and reason;
- total estimated tokens.

The dependency-free semantic core does not implement cryptography. It calls a `Sha256Port` and rejects any result that is not lowercase 64-hex SHA-256 shape.

This preserves the existing architecture rule that cryptographic/runtime sidecars stay separate from the semantic core.

The resulting bundle digest answers:

> What exact task/runtime/capability surface and information manifest was presented for this operation?

The bundle does not contain live grants, credentials, secret bytes, or authorization.

## Memory Promotion Gate

The promotion gate consumes:

- expected owner;
- the existing kernel memory assessment;
- candidate content digest;
- source kind;
- assessment reference + digest;
- context-bundle digest;
- provenance;
- independent evidence;
- causal receipts where required;
- lineage references;
- contradiction references;
- supersession references;
- sensitivity classification.

### Required semantics

The gate preserves the existing receipt-gated memory rules:

- owner-direct and signed-local material may proceed without causal receipts;
- verified remote and third-party material require independent evidence;
- agent inference and imported memory require at least two independent evidence references and a causal receipt;
- contradictions quarantine;
- an existing assessment other than clean `AdmitDurable` quarantines;
- secret material is routed away from the ordinary memory path;
- lineage is mandatory for durable promotion.

### Output

The gate returns exactly one of:

- `EligibleForDurableWrite`
- `Quarantine`

Eligibility is not persistence.

The decision explicitly reports:

- `truth_certified = false`;
- `grants_authority = false`;
- `storage_performed = false`;
- a separate storage effect is still required.

The decision itself is digest-bound through the same `Sha256Port` seam.

## Security invariants

v0 must preserve all of the following:

1. Context never becomes authority.
2. Memory never becomes authority.
3. A model cannot promote its own output merely because it generated it.
4. A successful past action cannot create future authority.
5. Quarantined/stale/superseded state cannot silently enter required context.
6. Critical-secret material never enters ordinary model context.
7. Authority-bearing material is rejected rather than silently omitted.
8. Required context cannot be silently dropped to satisfy a budget.
9. Optional omissions remain inspectable.
10. Candidate ordering cannot change the compiled bundle.
11. Durable promotion requires explicit lineage.
12. Promotion eligibility performs no persistence.
13. No Gateway route, Grid table, credential path, provider call, capability registration, or production runtime path is added.

## Relationship to other current lanes

### State lanes

The existing tool-owned state lanes solve write ownership and cross-tool merge collisions. The Context Compiler consumes only references/digests and can later bind directly to snapshot-validation receipts. v0 does not change the state-lane API.

### Representation-neutral memory lineage

The representation-neutral lineage work defines how multiple representations and transitions preserve provenance/recoverability without a single canonical encoding.

This gate deliberately uses generic lineage references rather than importing that still-separate lane. Once both stacks converge, promotion evidence can bind directly to the canonical lineage-transition receipt without changing the v0 authority model.

### Crypto sidecars

Real SHA-256/COSE/Ed25519 verification remains outside this dependency-free core. The compiler/gate requires a digest adapter and validates its output shape; it does not claim cryptographic verification itself.

## Promotion prerequisites beyond this laboratory

Before production promotion:

- bind context inputs to authenticated/current state and memory receipts;
- bind promotion assessment to the exact candidate bytes/representation transition;
- integrate real SHA-256 through the reviewed crypto adapter;
- prove currentness/revocation handling for context evidence;
- add restart/corruption/adversarial tests;
- reconcile with representation-neutral lineage after its stack lands;
- complete independent security review;
- preserve the existing Gateway -> Hypervisor -> Sandbox -> Grid authority path.

No production activation is authorized by this document.
