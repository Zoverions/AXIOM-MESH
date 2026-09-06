# Verified Work, Harness Provenance, and Physical-Effect Classification — Design

**Status:** approved architectural integration; v0 executable slice is evidence-only and production-unreachable

**Date:** 2026-09-05

**Scope:** exact AI execution/harness provenance, verified multi-agent work DAGs, consequence-aware physical-effect classification, and integration with bounded recursive improvement without creating new execution authority.

**Builds on:**

- `docs/superpowers/specs/2026-08-29-cognitive-topology-identity-kernel-design.md`
- `docs/superpowers/specs/2026-09-03-sovereign-information-evidence-authority-design.md`
- `docs/operations/AXIOM-ONE-PROVIDER-WEDGE.md`
- `docs/rebuild/AGENT-INTEROPERABILITY-AND-CAPABILITY-SUBSTRATE.md`
- `mesh/src/lib/ai-provider-invoke.mjs`
- draft recursive-agent lineage/improvement work represented by PRs #1451 and #1455

**Authority boundary:** this design does not add a Gateway route, capability-registry promotion, live model adapter, dynamic spawning, remote execution, physical-device command path, automatic improvement application, or new source of authority. `mesh/config/capabilities.json`, signed policy, currentness, exact-effect admission, and existing execution boundaries remain authoritative.

---

## 1. Core decision

AXIOM should treat frontier-model performance as a property of a complete execution system rather than a model label alone, and should treat multi-agent progress as a content-addressed dependency graph rather than a conversational side effect.

The governing model is:

```text
model/runtime + adapter + orchestration + context/tool policy + environment
    -> bounded invocation
    -> exact execution provenance
    -> candidate work artifact
    -> verified work DAG
    -> independent verification/evaluation
    -> proposal/decision evidence
    -> separately authorized effect path, if any
```

The system must be able to answer two distinct questions:

1. **What exact cognitive/execution environment produced this result?**
2. **What exact verified dependency chain supports treating this work as complete or reusable?**

Neither answer grants permission to perform an effect.

---

## 2. Why an adjunct is preferable to mutating current v0 contracts

The current `axiom-ai-provider-invoke.v0` contract is a deliberately narrow local-organizer wedge. It already binds provider/model, purpose, data scope, budget, timeout, cancellation, retention, selected bytes, principal, and draft-only/no-authority semantics.

That contract should remain stable while production provider work is still gated. Harness provenance is therefore introduced as a separately digestible adjunct artifact rather than silently changing the meaning of the existing v0 invoke envelope.

Likewise, the open recursive-improvement stack already defines proposals, evaluations, archives, and promotion eligibility. The verified-work DAG must compose with that work rather than replace it or create a second improvement authority system.

Physical-effect classification follows the same rule: it classifies consequence; it does not decide permission and does not create a second execution engine.

---

## 3. AI Execution Provenance v0

### 3.1 Purpose

`axiom-ai-execution-provenance.v0` records the exact execution/harness context associated with one bounded AI/provider result.

It is designed to prevent capability claims such as “model X achieved result Y” from erasing material harness differences.

### 3.2 Required fields

The artifact contains exactly:

```text
schema
version
status
provenance_id
provider_id
model
request_digest
receipt_digest
adapter
orchestrator
runtime
context
tools
environment
recorded_at
contains_secret_material
authority_effect
network_effect
runtime_activation
```

Unknown fields fail closed.

### 3.3 Component bindings

`adapter`:

```text
adapter_id
adapter_version
implementation_digest
```

`orchestrator`:

```text
orchestrator_id
orchestrator_version
```

`runtime`:

```text
runtime_id
runtime_version
runtime_descriptor_digest
```

`context`:

```text
state_mode
context_policy_digest
memory_projection_digest
```

`state_mode` is one of:

- `stateless`
- `session`
- `persistent`
- `opaque-provider-state`

`memory_projection_digest` may be `null` only where no explicit memory/context projection was supplied to the execution. It must not be used to smuggle raw memory into provenance.

`tools`:

```text
tool_policy_digest
toolset_digest
```

`environment`:

```text
environment_id
environment_version
environment_digest
```

All digests bind declarations or byte-addressed artifacts; they do not prove the external truth of the declaration.

### 3.4 Exact result binding

The artifact must bind:

- one exact normalized provider invoke digest; and
- one exact terminal provider receipt digest.

A resolver must reject provider/model mismatch between the provenance artifact and the provider receipt.

The resolver is evidence-only and must return no capability, grant, approval, or executable instruction.

### 3.5 Local organizer profile

The deterministic local organizer may produce a provenance artifact using explicit local values such as:

```text
adapter_id = local.organize.adapter
orchestrator_id = axiom-one.local-organize
runtime_id = deterministic.local.organizer
state_mode = stateless
toolset_digest = digest(empty tool set)
network_effect = none
```

This does not relabel the stub as production AI. It proves the contract can carry honest harness provenance before a real provider is introduced.

---

## 4. Verified Work Graph v0

### 4.1 Purpose

`axiom-verified-work-graph.v0` is a generic, content-addressable DAG for decomposed work and reusable verified artifacts.

It is intended for:

- formal mathematics;
- software implementation;
- security verification;
- research synthesis;
- specification completion;
- recursively spawned subagent campaigns;
- governed improvement experiments.

The graph is shared reality about work dependencies. It is not a scheduler and is not delegation.

### 4.2 Top-level fields

The graph contains exactly:

```text
schema
version
status
graph_id
subject_ref
nodes
created_at
contains_secret_material
authority_effect
network_effect
execution_authority
```

The v0 status is `inert-evidence`.

`authority_effect = none`, `network_effect = none`, and `execution_authority = false` are mandatory.

### 4.3 Node contract

Each node contains exactly:

```text
node_id
kind
label
state
dependencies
artifact_digest
verification_result
verifier_ref
verification_evidence_digest
lineage_ref
```

Kinds:

- `goal`
- `task`
- `artifact`
- `verification`

States:

- `proposed`
- `ready`
- `accepted`
- `rejected`
- `blocked`

Verification results:

- `pass`
- `fail`
- `indeterminate`
- `not-applicable`

### 4.4 Structural invariants

1. Node IDs are unique.
2. Exactly one `goal` node exists.
3. The goal has no dependencies.
4. Every dependency names an existing node.
5. Self-dependencies fail closed.
6. Duplicate dependencies fail closed.
7. The graph must be acyclic.
8. Artifact nodes require an exact artifact digest.
9. Non-artifact nodes require `artifact_digest = null` in v0.
10. Verification nodes require at least one dependency, a verifier reference, an evidence digest, and a non-`not-applicable` result.
11. Non-verification nodes require `verification_result = not-applicable`, `verifier_ref = null`, and `verification_evidence_digest = null`.
12. A graph digest is evidence of the exact graph, not evidence that every node label is true.
13. Accepted work remains non-authorizing unless a separate authority-bearing path explicitly consumes it.

### 4.5 Recursive-agent integration

The existing recursive lineage/improvement work should consume the graph as evidence, not authority.

A future improvement experiment may bind:

```text
improvement proposal
  -> work graph digest
  -> exact candidate artifacts
  -> evaluator evidence
  -> canary/shadow evidence
  -> promotion-eligibility assessment
```

A spawned child receives a separately bounded task/delegation envelope. A work-graph edge must never be interpreted as delegated authority.

---

## 5. Effect Consequence Classification v0

### 5.1 Purpose

AXIOM needs an explicit machine-readable distinction between ordinary informational/digital effects and embodied physical effects.

`axiom-effect-consequence-classification.v0` is an evidence-only classification artifact that can later be bound into exact-effect admission.

### 5.2 Default consequence classes

The v0 default classes are:

1. `informational`
2. `digital-reversible`
3. `digital-consequential`
4. `physical-reversible`
5. `physical-safety-relevant`
6. `physical-potentially-irreversible`

The ordering expresses a default minimum scrutiny direction, not universal law and not authority.

Domain policy may tighten treatment. It may not use the classifier to bypass stronger legal, safety, clinical, device, or local-owner protections.

### 5.3 Required fields

The artifact contains exactly:

```text
schema
version
status
classification_id
effect_ref
consequence_class
rationale
reversibility
physical_safety_impact
legal_or_regulatory_impact
classified_at
classifier_ref
authority_effect
execution_effect
```

`authority_effect = none` and `execution_effect = none` are mandatory.

### 5.4 Fail-closed semantics

The v0 validator must:

- reject unknown fields;
- reject unknown consequence classes;
- require physical classes to declare non-`none` physical safety impact where applicable;
- reject `physical-potentially-irreversible` paired with `reversibility = reversible`;
- never return an authorization decision;
- never reduce an existing protection level.

Runtime binding to exact-effect admission is deliberately deferred to a separately reviewed slice.

---

## 6. Formal-verification and proof-carrying direction

Where a work product can be mechanically checked, AXIOM should prefer a machine-checkable artifact and verifier evidence over an unqualified model assertion.

The reusable pattern is:

```text
natural-language intent
  -> formal or executable claim
  -> candidate artifact
  -> verifier result
  -> evidence digest
  -> work-graph verification node
```

Examples include Lean proofs, schema validation, invariant tests, deterministic protocol checks, accounting conservation tests, and formal/model-checked state transitions.

This design does not mandate Lean or one proof system. The work graph records the verifier/evidence relationship without pretending every domain is formally provable.

---

## 7. Decentralized ownership and collective infrastructure

The architecture continues to prefer:

```text
person-owned node
  -> voluntary Circle
  -> community/institutional infrastructure
  -> jurisdictional infrastructure
```

Collectively owned compute or model infrastructure may be useful, but it must not require surrendering personal-agent identity or local authority roots upward.

This is a deployment/governance direction only. The v0 executable slice does not implement a jurisdictional AI service, token, dividend, federation, or public compute market.

---

## 8. Security invariants

1. Model alignment or benchmark performance never substitutes for AXIOM authorization.
2. Harness provenance never grants model/provider authority.
3. A work graph never grants task delegation or effect authority.
4. A verification result never grants execution authority.
5. Effect classification never grants or denies authority by itself.
6. Unknown fields and malformed digests fail closed.
7. Raw secrets, tokens, credentials, cookies, private keys, and session material are forbidden in all three v0 artifacts.
8. Graph dependency cycles fail closed.
9. Provenance must bind exact request/result digests rather than mutable names alone.
10. Provider/model mismatch between execution provenance and receipt fails closed.
11. Physical-effect classes cannot be used to weaken existing device, safety, legal, or policy protections.
12. Capability registry remains unchanged by this slice.

---

## 9. Executable v0 slice

This approved slice adds three pure, production-unreachable evidence contracts:

- AI Execution Provenance v0 validator/digest/resolver + JSON Schema mirror;
- Verified Work Graph v0 validator/digest/topological-order helper + JSON Schema mirror;
- Effect Consequence Classification v0 validator/digest + JSON Schema mirror.

It also updates the canonical planning surface so future AI-provider, recursive-agent, embodied-system, and formal-verification work consumes these primitives instead of inventing parallel formats.

No public route, database migration, capability registry entry, network egress, device command, or model invocation is added.

---

## 10. Promotion gates for later slices

Before any production path may rely on these artifacts, a later proposal must separately demonstrate:

- exact authority/policy consumer;
- currentness and revocation semantics;
- late effect-time revalidation;
- no classification-to-authority shortcut;
- adapter/runtime attestation appropriate to the claimed assurance level;
- resource and cancellation bounds;
- human-understandable consequence display where applicable;
- rollback/recovery for consequential digital or physical effects;
- adversarial substitution, downgrade, stale-evidence, and confused-deputy tests;
- independent review and protected CI evidence.

Until then, the artifacts are knowledge and provenance only.
