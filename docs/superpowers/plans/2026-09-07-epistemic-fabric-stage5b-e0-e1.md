# Epistemic Fabric Stage 5B — E0/E1 Implementation Plan

**Status:** implementation planning only; code authority not granted by this plan

**Date:** 2026-09-07

**Design:** `docs/superpowers/specs/2026-09-07-epistemic-fabric-stage5b-design.md`

**Threat model:** `docs/security/EPISTEMIC-FABRIC-THREAT-MODEL.md`

**Queue:** `docs/MASTER-TODO-EPISTEMIC-FABRIC.md`

## Objective

Prepare the smallest fail-closed implementation candidate for:

```text
E0: inert schemas/contracts
E1: local proposal graph for Source -> Claim -> Evidence
```

Nothing in this plan authorizes implementation, runtime activation, public ingestion, federation, autonomous discovery, canonical promotion, or external effect execution.

## Gate 0 — exact candidate inventory

Before code is written, a fresh implementation-gate record must identify:

- immutable base head;
- proposed branch;
- exact files to add/change;
- exact schema IDs/versions;
- exact test files;
- proof that `mesh/config/capabilities.json` remains unchanged;
- proof that production policy/action registries remain unchanged;
- exact resource ceilings;
- rollback/recovery semantics;
- supported Node/platform verification matrix.

If the candidate cannot name an affected authority dimension, the candidate is not ready.

## Task 1 — common inert record envelope

Design tests first for a common immutable envelope with:

```text
id
object_type
schema_version
created_at
created_by
revision
previous_revision
content_digest
provenance_refs
canonical_state
machine_generated
generation_metadata
```

Normative constraints:

- plain JSON-compatible canonical data only;
- finite string/array/object bounds;
- no executable functions/accessors/custom prototypes;
- exact content digest;
- explicit revision lineage;
- `canonical_state` cannot be set to canonical merely by model output;
- authority semantics are fixed to none for E0/E1 objects.

Expected first tests: invalid/oversized/malformed records fail closed.

## Task 2 — Source schema

Minimum fields:

```text
source_type
title?
authors?
published_at?
retrieved_at
external_identifiers?
original_content_digest
parent_source_refs?
raw_artifact_ref?
```

Rules:

- required exact source bytes may not be represented by empty content;
- URL/DOI/etc. is not a substitute for acquired-byte digest where byte identity is required;
- changed bytes create a new source revision/object relationship;
- source validity proves representation/provenance, not truth.

## Task 3 — Claim schema

Minimum fields:

```text
proposition
claim_kind
scope
qualifiers?
assumption_refs?
source_anchors[]
```

Source anchors must bind an exact source reference and bounded location/quote digest where applicable.

Rules:

- machine extraction produces a proposal claim only;
- source-anchor verification failure blocks promotion beyond proposal state;
- scope is explicit and cannot silently widen through relationship creation.

## Task 4 — Evidence schema

Minimum fields:

```text
target_claim_ref
direction
evidence_type
source_refs[]
observation_refs?
methodology_refs?
independence_state
limitations?
applicability_scope
```

Rules:

- `independence_state` includes `unknown`;
- unknown must not be treated as independent;
- evidence may support/weaken/contradict/discriminate without changing effect authority;
- malformed supplied evidence is a validation error, not equivalent to absent evidence.

## Task 5 — deterministic canonicalization and exact digests

Reuse the existing plain-data/canonicalization discipline rather than creating a second canonicalization engine.

Tests must cover:

- object key order equivalence;
- sparse arrays;
- accessors;
- custom prototypes;
- symbol/non-enumerable content;
- unsupported numeric/string forms;
- semantically different scoped claims producing different digests.

## Task 6 — local proposal store

Implement only after schema tests are green and the implementation gate grants E1 authority.

Required properties:

- local/disposable storage first;
- proposal objects only;
- append-only revisions;
- no public network route;
- no provider requirement;
- no production credentials;
- no direct Grid/capability mutation;
- no external effects;
- bounded object count/bytes/traversal depth;
- deterministic export for test comparison.

## Task 7 — model/agent attribution boundary

If E1 uses machine extraction in tests, record at least:

```text
model_or_agent_id
version/profile
run_id
input_digest
generated_at
role
```

Fixture-backed machine generation is preferred for the first slice. Live provider access is out of scope.

## Task 8 — negative authority tests

Tests must prove:

1. Source/Claim/Evidence objects cannot be passed as capabilities;
2. setting `authority_effect` to anything other than none is rejected;
3. a proposal cannot call canonical admission APIs merely by setting a field;
4. no E0/E1 module writes production policy/registry state;
5. no E0/E1 module opens network transport;
6. no E0/E1 module invokes Sandbox external effects;
7. missing/unknown authority remains deny/unavailable.

## Task 9 — stale/replay groundwork

Even before canonical admission exists, proposal revisions must reject impossible or conflicting revision chains.

Design the future exact-head fields now so E1 does not require a breaking authority redesign later.

No claim is made that E1 provides distributed replay protection.

## Task 10 — documentation and verification

Before an E0/E1 PR may be considered merge-ready:

- register the Stage 5B design, threat model, roadmap, queue, and this plan in the canonical documentation corpus;
- add focused registration tests;
- run documentation verification;
- run focused schema/proposal-store tests;
- run Clean Kernel gates that cover changed authority/canonicalization surfaces;
- run supported Windows/Linux compatibility checks;
- review `CURRENT-BUILD-THREAT-MODEL.md` for required delta incorporation;
- confirm capability registry and production policy are unchanged.

## Explicitly out of scope

- canonical epistemic admission;
- assessment scoring;
- unknown/contradiction mutation;
- evidence aggregation;
- prediction scoring;
- federation;
- continuous web/source ingestion;
- live external model providers;
- cross-domain discovery;
- autonomous experiment planning/execution;
- tokenized truth or reputation markets;
- global truth scores.

## Completion condition

E0/E1 is complete only when the repository demonstrates a bounded, local, proposal-only `Source -> Claim -> Evidence` substrate whose exact bytes/provenance/revision semantics are reproducible and whose objects have structurally zero authority effect.
