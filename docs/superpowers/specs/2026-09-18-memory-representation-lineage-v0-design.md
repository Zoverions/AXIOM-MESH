# Memory Representation and Lineage v0 Design

**Status:** approved bounded architecture slice; inert contracts only; no runtime promotion claim

**Created:** 2026-09-18

**Base:** `931e9a7a753ce5924c498d022c686d16092c2251`

## Purpose

AXIOM memory does not require one canonical representation. A logical memory may have text, structured, graph, vector, image-compacted, encrypted archival, or future model-native representations without making any one encoding the definition of the memory.

The invariant is:

> **Memory continuity belongs to identity and lineage, not encoding.**

Representation changes may alter storage and retrieval form, but they must not silently alter provenance, ownership, authority, asserted meaning, or recoverability guarantees.

This slice formalizes that rule without changing the existing Grid memory schema, Gateway surface, Sandbox actions, capability registry, provider access, network behavior, persistence behavior, or authority path.

## Existing foundation

The current kernel already has content-addressed encrypted `memory_objects`, owner-scoped memory references, typed memory edges, tombstoning, selective export, protected payloads, and signed event history. Existing designs also require provenance-preserving reconciliation and distinguish derived narratives from their evidence corpus.

Those primitives remain authoritative for current runnable behavior. This design layers a representation-neutral lineage contract above them; it does not reinterpret an existing `memory_<digest>` object as a new logical memory entity.

## Core distinctions

### Logical memory entity

A `MemoryEntity` identifies the continuing logical memory and its owner, provenance references, and known representation references.

It contains no ordinary content field and no required canonical-representation field.

### Representation

A `MemoryRepresentation` identifies one encoding or materialization of a logical memory. It records:

- representation identity;
- logical memory identity;
- owner;
- open-ended format identifier;
- content digest;
- parent representation references;
- fidelity class;
- explicit recoverability dimensions;
- creator;
- retention class;
- optional authoritative-purpose scopes;
- optional promotion receipt reference.

Formats are deliberately open-ended. The contract must permit future representations without schema redesign.

### Transition

A `MemoryTransition` is an explicit receipt for a change between representations.

Initial transition operations are:

`observe`, `derive`, `summarize`, `compress`, `encode`, `project`, `merge`, `split`, `correct`, `supersede`, `retract`, `archive`, `rehydrate`, `forget`, `redact`, `promote`, and `demote`.

A transition records source and destination representation IDs, actor, purpose, fidelity claim, whether source material remains, what information was intentionally discarded, recoverability before/after, promotion scopes where applicable, and an exact timestamp.

## Fidelity classes

v0 defines:

- `exact` — byte-equivalent or deterministically reconstructable;
- `semantic` — asserted information is intended to survive even though encoding changes;
- `lossy-source-retained` — the representation is lossy but an ancestor remains available;
- `lossy-terminal` — information was intentionally discarded and the discarded detail is no longer promised recoverable;
- `not-applicable` — only for destructive lifecycle transitions such as `forget`.

Compression is allowed. Hidden loss is not.

## Recoverability dimensions

Recoverability is represented explicitly rather than as one boolean:

- `byte`;
- `semantic`;
- `provenance`;
- `relationship`;
- `operational`;
- `identity`.

A transition may reduce these guarantees only by saying so.

## Canonicality is purpose-scoped

A representation may be authoritative for zero or more explicit purposes:

- `history`;
- `signature-verification`;
- `human-display`;
- `semantic-retrieval`;
- `model-context`;
- `export`;
- `recovery`.

No single purpose is mandatory and no representation is globally canonical.

A derived representation that claims any authoritative purpose must name an explicit promotion receipt. Derivation alone never promotes authority.

## Hard safety invariants

1. All v0 contracts are inert: `authority_effect = "none"`, `network_effect = "none"`, and `runtime_activation = false`.
2. Validation never creates a principal, permission, capability, consent, approval, memory object, edge, network request, provider invocation, or Grid mutation.
3. A logical entity does not require one canonical representation.
4. Representation identifiers and provenance references are unique within their lists.
5. A derived representation cannot claim an authoritative purpose without a promotion receipt reference.
6. A transition cannot use the same representation as both source and destination.
7. `observe` has no source representation and at least one destination.
8. `forget` has at least one source; it may have no destination; its fidelity is `not-applicable`.
9. Other transformation operations require at least one source and at least one destination.
10. `promote` requires at least one explicit promotion scope; non-promotion operations carry no promotion scopes.
11. `lossy-terminal` transitions with source not retained must explicitly state what was discarded and cannot claim byte recoverability afterward.
12. `forget` with no destination must explicitly state discarded information.
13. Unknown fields fail closed.
14. Content bytes are outside these contracts; only digests and references are carried.

## Compatibility

Existing `memory.put`, `memory.link`, `memory.tombstone`, `memory.list`, exports, Axiom One Vault behavior, Education memory contracts, context-semantic memory, and Grid tables do not change in v0.

This means:

- no migration;
- no new route;
- no capability-registry status change;
- no application-policy change;
- no persistence claim;
- no automatic conversion of old memory objects;
- no provider or inference dependency.

A later governed-state slice may map a logical memory entity to existing protected `memory_objects` and persist transition receipts. That requires a separate design/review gate because it changes durable state.

## Adversarial test requirements

The v0 test suite must prove at least:

- one entity may validly name multiple representations with no canonical field;
- open-ended formats such as visual microtext compaction are accepted;
- duplicate provenance or representation references fail;
- derived representations cannot self-promote;
- source representations may carry an authoritative purpose without a derivation-promotion receipt;
- transition overlap between source and destination fails;
- `observe`, ordinary transform, `promote`, and `forget` cardinality rules fail closed;
- authority/network/runtime fields cannot be widened;
- terminal loss cannot claim retained byte recoverability;
- unknown fields fail;
- validation produces deterministic document digests.

## Non-goals

This slice does not implement:

- memory retrieval ranking;
- embeddings;
- snap compaction itself;
- model-context injection;
- least-context projection execution;
- deletion propagation across the existing Grid;
- backup/recovery changes;
- automatic promotion;
- authority changes;
- new persistent tables;
- network synchronization;
- UI.

## Next slices

After v0 is independently green:

1. **Projection contract:** minimum-sufficient, capability-scoped memory projection with explicit disclosure purpose.
2. **Governed lineage state:** persist entities/representations/transitions while preserving current memory-object semantics.
3. **Lineage-aware lifecycle:** derive invalidation/forget/recovery consequences without silent descendant survival.
4. **Tiered storage and regeneration:** mark embeddings, summaries, compacted context, and other regenerable representations as disposable unless explicitly promoted.
5. **Axiom One / Verify surfaces:** show lineage, loss, promotion, contradiction, and recoverability in human-readable form.

## Governing doctrine

> **Representations are replaceable; provenance is not.**

> **Compression may discard information, but it may not conceal that information was discarded.**

> **Inference does not inherit the authority of its source.**

> **Derived representations remain derived until explicitly promoted.**

> **Every irreversible loss of recoverability is an explicit, evidenced transition.**
