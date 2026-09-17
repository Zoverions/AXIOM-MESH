# Canonical Shared Artifact v0 Design

**Date:** 2026-09-17
**Programme:** #1610 C1
**Base:** `b8a746eace641c1b97ca70163bb030f49ca033f3`
**Status:** approved automatically under the repository automation policy

## Purpose

Define the smallest inert canonical object needed to prove safe co-creative human + agent editing before Axiom One gains a mutable workspace surface.

C1 is a semantic contract only. It does not create storage, a Gateway route, a capability, a runtime mutation path, a Circle execution path, an authorization bypass, or an automatic merge policy.

## Approval assessment

C1 may proceed automatically because the slice is bounded, branch-isolated, reversible, covered by fail-closed tests, and does not change `mesh/config/capabilities.json` or any reachable authority path. Merge, production promotion, deployment, credential handling, and any later reachable mutation remain separate decisions.

## Invariants

> A human edit and an agent edit may use different interfaces, but accepted durable mutation is represented by the same canonical revision semantics.

> Concurrent incompatible edits remain visible. Receive time, wall-clock time, actor type, origin, or lexical order never silently selects a winner.

> Resolution is a new revision that explicitly names and causally depends on every current head.

> Retraction is a tombstone revision. Historical evidence is retained in the artifact history.

> Artifact evidence does not itself grant authority.

## Contract

Schema: `axiom-canonical-shared-artifact.v0`

Version: `0`

Status: `inert-shared-artifact-contract`

The document is an immutable snapshot with exact top-level fields:

- `schema`
- `version`
- `status`
- `artifact_id`
- `owner_ref`
- `authority_domain`
- `content_type`
- `revisions`
- `current_heads`
- `state`
- `current_content_digest`
- `sharing`
- `created_at`
- `updated_at`
- `authority_effect`
- `network_effect`
- `runtime_activation`

`authority_effect` and `network_effect` are always `none`; `runtime_activation` is always `false`.

### Identity and authority domain

`artifact_id`, `owner_ref`, and authority-domain references use bounded identifiers.

`authority_domain` contains exactly:

- `kind`: `owner` or `circle`
- `ref`: bounded identifier

For `kind: owner`, `ref` must equal `owner_ref`.

Allowing a `circle` label in the inert contract does not activate Circle shared context. C5 remains separately gated.

### Content types

v0 supports only:

- `text/plain`
- `application/json`

The artifact has one fixed `content_type` for its lifetime.

Text payloads are strings up to 64 KiB. Structured payloads must be canonical-JSON-compatible plain data and their canonical JSON representation must not exceed 64 KiB.

Each non-tombstone revision stores its payload and a `content_digest` equal to the SHA-256 digest of the canonical object:

```json
{
  "content_type": "<artifact content_type>",
  "payload": "<revision payload>"
}
```

A tombstone revision has `payload: null` and `content_digest: null`.

### Revision record

Each revision contains exactly:

- `revision_id`
- `parents`
- `operation`
- `actor_principal`
- `actor_kind`
- `authorization`
- `payload`
- `content_digest`
- `resolves`
- `work_graph`
- `occurred_at`

`operation` is one of:

- `put`
- `retract`
- `resolve`

`actor_kind` is descriptive only and is one of `human`, `agent`, or `service`. `actor_principal` is the authoritative attribution key.

Every revision binds authorization evidence using exactly:

- `request_digest`
- `evidence_ref`
- `evidence_digest`

C1 validates the binding shape and digest syntax only. It does not independently re-authorize the revision or treat the evidence reference as authority.

`work_graph` is either `null` or contains exactly:

- `graph_id`
- `graph_digest`

This is an optional provenance binding to existing Verified Work Graph evidence. C1 does not duplicate that graph contract.

### History and head semantics

Revisions must be presented in topological acceptance order.

Rules:

1. revision IDs are unique;
2. every parent references an earlier revision;
3. the first revision is `put` with no parents;
4. every later non-resolution revision has exactly one parent;
5. a normal `put` or `retract` removes its parent from the current-head set only if that parent is still a current head, then adds itself;
6. editing from a stale historical parent therefore creates a concurrent head rather than overwriting the newer head;
7. `put` and `retract` have an empty `resolves` array;
8. a `resolve` revision requires at least two current heads;
9. for `resolve`, `parents` and `resolves` must each equal the complete sorted current-head set immediately before the revision;
10. a resolution removes every prior current head and becomes the sole head;
11. partial, phantom, duplicate, unsorted, or undeclared resolution fails closed.

`current_heads` must equal the complete sorted head set derived from the revision history.

### State derivation

- more than one current head -> `state: conflict`, `current_content_digest: null`;
- one current head whose operation is `retract` -> `state: retracted`, `current_content_digest: null`;
- one non-tombstone current head -> `state: active`, with `current_content_digest` equal to that revision's content digest.

There is intentionally no silent last-write-wins state.

### Sharing projection

`sharing` contains exactly:

- `state`: `private` or `projected`
- `projection_refs`: sorted unique bounded identifiers

`private` requires an empty projection list. `projected` requires at least one projection reference.

Projection metadata describes declared sharing only. It grants no read, write, Circle, network, or runtime authority.

## Validation bounds

- at least 1 and at most 256 revisions;
- at most 32 parents/resolution heads per revision;
- at most 64 projection references;
- bounded identifiers: `/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/`;
- SHA-256 digests: `/^[a-f0-9]{64}$/`;
- canonical UTC timestamps only;
- `updated_at` equals the last revision timestamp;
- `created_at` equals the first revision timestamp;
- revision timestamps are non-decreasing;
- exact fields only; unknown fields fail closed;
- canonicalization errors fail closed;
- validation must not mutate the input.

## Public API

`mesh/src/lib/canonical-shared-artifact.mjs` exports:

```js
export const CANONICAL_SHARED_ARTIFACT_SCHEMA = 'axiom-canonical-shared-artifact.v0';
export function canonicalSharedArtifactDigest(document) {}
export function validateCanonicalSharedArtifact(document) {}
```

Validation returns a frozen normalized summary containing the schema, artifact ID, owner reference, authority domain, state, current heads, current content digest, revision count, artifact digest, and fixed zero-effect fields.

The digest function validates first and returns a deterministic digest of the original canonical document.

## JSON Schema mirror

`mesh/config/canonical-shared-artifact-v0.schema.json` mirrors the structural boundary using JSON Schema Draft 2020-12 with exact-field closure. Cross-revision causal invariants remain authoritative in the semantic validator.

## Hostile tests

Tests must reject at minimum:

- unknown top-level, revision, authorization, work-graph, authority-domain, or sharing fields;
- unsupported content types or operations;
- malformed IDs, digests, timestamps, or oversized payloads;
- digest/payload mismatch;
- duplicate revision IDs;
- missing, forward, duplicate, or self parents;
- history whose declared current heads do not match derived heads;
- silent conflict collapse to one declared head;
- resolution that omits a current head;
- resolution naming a phantom/non-head revision;
- resolution with unsorted or duplicate head lists;
- retraction with content;
- non-retraction without content;
- incorrect derived state/current digest;
- private sharing with projections or projected sharing without projections;
- owner authority-domain mismatch;
- timestamp regression or incorrect created/updated boundaries;
- non-canonical structured data;
- any attempt to set authority/network/runtime effects above the inert boundary.

Tests must also prove:

- deterministic digest across object-key order;
- validation does not mutate deeply frozen input;
- a stale-parent edit produces two visible heads;
- a complete resolution converges those heads to one;
- an agent-authored and human-authored revision use the same revision contract;
- optional work-graph evidence is provenance only.

## Non-claims

C1 does not claim:

- a production shared editor;
- direct human write authority;
- agent write authority;
- persistence or database mutation;
- automatic conflict resolution;
- automatic authorization-evidence verification;
- Circle shared-context activation;
- rich document/sheet/board formats;
- automatic sync across Grids;
- automatic merge, publish, deploy, spend, or execution.

Those are later slices and must cross their own existing AXIOM authority boundaries.
