# AXIOM-MESH Sovereign Context Plane

**Status:** architecture contract plus first executable library slice; not a promoted capability

**Introduced:** 2026-08-11

**Authority:** `mesh/config/capabilities.json` remains authoritative for capability status. This document and the initial library/test slice do not claim a supported Gateway API, MCP surface, autonomous-agent product, or production-promoted context service.

## Decision

AXIOM-MESH distinguishes durable memory from usable context.

The existing `memory.graph` capability remains the encrypted, content-addressed storage substrate for memory objects, relationships, consent-scoped disclosure, tombstoning, and export. The **Sovereign Context Plane** is a separate interpretation and disclosure layer that determines which typed claims may be assembled into context for a particular principal, purpose, scope set, and time.

```text
sources
  -> provenance-bound context claims
  -> encrypted memory graph
  -> principal + purpose + scope + time filtering
  -> supersession / contradiction assessment
  -> deterministic context view
  -> planning / reasoning input
  -> normal AXIOM authority and execution path
  -> evidence / receipts
```

Context is not authority.

A model, agent, service, adapter, or human interface may use a context view to reason about an intent. It may not use context merely to create a capability, satisfy an approval, lower an assurance floor, expand a destination, inject a credential, or authorize an effect.

## Why this is a separate plane

Portable AI context systems correctly identify an important infrastructure problem: useful agents need state that survives individual conversations and model providers. AXIOM has an additional requirement. A useful personal or institutional context layer must preserve not only content, but also the answers to questions such as:

- where did this claim come from;
- what exact source material does it bind to;
- when was it observed;
- when is it considered valid;
- is it an observation, inference, preference, decision, constraint, or record;
- how confident is the asserting source;
- who may receive it;
- for what purpose and scopes;
- what does it supersede;
- what does it contradict;
- whether disagreement remains unresolved; and
- whether any consumer is attempting to treat advisory context as authority.

The sovereign state therefore belongs outside any replaceable model runtime. An agent consumes a bounded projection of that state. It does not own the canonical state merely because it generated or retrieved a claim.

## Non-negotiable security invariant

Every AXIOM context claim and every compiled context view has:

```json
{
  "authority_effect": "none"
}
```

Any other value is invalid.

This is deliberately redundant with the broader AXIOM policy model. Context poisoning is more dangerous when context and permission are conflated. The context plane therefore makes the non-authorizing status of context machine-checkable at its own boundary.

A later privileged action must still travel through the ordinary authenticated AXIOM path and satisfy its normal policy, approvals, grants, destination limits, budgets, execution controls, and evidence requirements.

## Context claim v1

The first executable schema is `axiom-context-claim.v1` in `mesh/src/lib/sovereign-context.mjs`.

A claim carries these fields:

| Field | Purpose |
| --- | --- |
| `claim_id` | Stable finite identifier for claim relationships. |
| `owner` | Principal responsible for the claim in the local sovereign state. |
| `subject` | Entity or object the claim concerns. |
| `predicate` | Stable semantic slot, such as `project.priority`. |
| `value` | Canonical-JSON-encodable value. |
| `claim_type` | `observation`, `inference`, `preference`, `decision`, `constraint`, or `record`. |
| `cardinality` | Whether a slot is expected to have one usable value or may carry multiple values. |
| `confidence_ppm` | Integer confidence metadata from 0 to 1,000,000; it is not an authorization score. |
| `source` | Source type, source reference, SHA-256 digest, and observation time. |
| `validity` | Inclusive validity start and optional end. |
| `disclosure` | Explicit permitted principals, purposes, and required scopes. |
| `sensitivity` | `public`, `internal`, `confidential`, or `restricted`. |
| `supersedes` | Same-slot predecessors explicitly replaced by this claim. |
| `contradicts` | Same-slot claims explicitly declared in conflict. |
| `authority_effect` | Must be `none`. |

The schema rejects undeclared fields so that new semantics cannot silently enter an older validator.

### Provenance boundary

`source.ref` is a locator or stable source reference, not proof by itself. `source.digest` binds the claim to the exact source representation expected by the producer. A later ingestion adapter must define how that digest is produced for its source type and how source authenticity is verified.

The current library therefore establishes provenance binding, not universal source authenticity.

### Confidence boundary

`confidence_ppm` is descriptive context. It must never be multiplied into an authorization probability or used to waive a required verification or approval. Different domain adapters may define calibrated confidence profiles later, but authority remains separate.

## Existing memory-graph binding

The first slice does not introduce another database or another durable state engine.

`contextClaimMemoryPutPayload()` converts a validated context claim into the existing Grid memory-object address material:

```text
owner
+ kind = context.claim
+ normalized claim content
+ context-memory binding metadata
-> canonical digest
-> memory_<digest>
```

The resulting payload follows the same content-addressing invariant already enforced for `memory.put`. This allows context claims to inherit the current memory graph's encrypted protected columns, evidence-chain persistence, ownership model, tombstoning, export, backup, and recovery path as those integrations are exposed.

The helper does **not** append a Grid event itself. The current slice is intentionally below the authority/execution boundary.

## Disclosure compilation

`compileContextView()` accepts:

- a finite claim set;
- one authenticated or pre-authenticated principal identifier;
- one explicit purpose;
- a finite set of granted context scopes;
- an evaluation time; and
- a maximum eligible-claim ceiling.

A claim is eligible only when all of the following are true:

1. the requesting principal appears in the claim's disclosure list;
2. the requested purpose appears in the claim's disclosure list;
3. every disclosure scope required by the claim is present in the request;
4. the claim is temporally valid at the requested evaluation time.

There is no wildcard disclosure in v1.

The compiler does not expose counts or identifiers for claims that failed disclosure or temporal eligibility. This avoids turning a context query into a side channel for hidden-state enumeration.

## No silent truncation

If the number of eligible claims exceeds `maxClaims`, compilation fails.

It does not silently take the first N claims, the highest-confidence N claims, or a model-selected subset. Silent truncation can alter a decision by suppressing inconvenient or contradictory state while still making the resulting context look complete.

A future retrieval layer may support explicit pagination or query narrowing, but incompleteness must remain visible and machine-readable.

## Supersession

Supersession is explicit rather than inferred from recency alone.

A claim may supersede another supplied claim only when both claims share the same:

- owner;
- subject;
- predicate; and
- cardinality.

The superseding claim must not have an earlier `source.observed_at` value than its predecessor.

These constraints prevent one owner, one semantic slot, or an older injected record from silently suppressing another principal's state.

The predecessor remains durable history. It is removed only from the usable projection for that context view.

## Contradictions and unresolved state

The compiler is intentionally conservative.

For a `single` cardinality slot, multiple active claims with different canonical values are not ranked into a synthetic answer. They are withheld from `usable_claims` and emitted as an unresolved conflict.

Explicit contradiction links are also withheld while both claims are active and eligible. v1 permits explicit contradiction only inside the same owner/subject/predicate slot because automatic cross-predicate semantic reasoning would introduce a new unverified inference layer.

This means AXIOM can faithfully represent:

> two authorized sources disagree

without silently changing that into:

> AXIOM knows which source is true.

Later domain-specific reconciliation may produce a new provenance-bound inference or decision claim, but that output must remain distinguishable from its inputs.

## Deterministic context views

A compiled `axiom-context-view.v1` contains:

- requesting principal;
- purpose;
- scopes;
- evaluation time;
- sorted usable claims;
- sorted unresolved conflicts;
- counts of eligible, superseded, conflicted, and usable authorized claims;
- `authority_effect: none`;
- an explicit non-authorization notice; and
- a canonical `view_digest`.

Equivalent authorized input produces the same view digest regardless of input claim ordering.

This digest is intended to become the context-side binding point for later plan, intent, receipt, task, and adapter work. It must not be interpreted as proof that every underlying source is true.

## Relationship to AXIOM components

### Memory graph

Stores the durable encrypted claim objects and relationships. The context plane selects and compiles an authorized view without replacing memory ownership or lifecycle controls.

### Grid

The target production integration is Grid-backed context claim persistence and retrieval with evidence-chain verification. The current library does not itself claim Grid-backed query support.

### Gateway

A future Gateway projection must authenticate the requesting principal and derive or validate purpose/scope ceilings from AXIOM authority. Callers must not be able to self-assert broader disclosure rights in a request body.

### Hypervisor and Sandbox

A context view may become an input to planning or execution preparation. It cannot bypass policy evaluation, approvals, grants, sandbox controls, destination validation, budgets, or evidence collection.

### Machine principals

Machine principals are the natural consumers of bounded context views. A machine's context scope must be no broader than its sponsorship, purpose, and runtime authority permit.

### MCP, A2A, and other adapters

Adapters may eventually project context retrieval in protocol-native form. They remain translators. An MCP tool description, Agent Card, remote task payload, or model request cannot widen AXIOM context disclosure or turn context into authority.

### AXIOM One

A human-facing product can later show claim provenance, freshness, conflicts, disclosure, and supersession history. Editing or correcting context should create evidence-backed lifecycle changes rather than silently rewriting history.

## Threat model additions

The context plane introduces or makes explicit these threat classes:

### Context injection

An attacker attempts to place a malicious instruction, false preference, forged decision, or poisoned retrieval artifact into durable context.

**v1 boundary:** strict schema, source digest, owner, explicit type, finite disclosure, and non-authority invariant. Source authentication remains adapter-specific future work.

### Provenance laundering

An inference is presented as an observation or authoritative record.

**v1 boundary:** claim type and exact source fields remain part of the canonical claim and view digest.

### Stale-context execution

A previously true claim remains available after it is no longer valid.

**v1 boundary:** explicit validity interval evaluated at compilation time; later ingestion profiles must define refresh expectations.

### Cross-owner suppression

One principal creates a claim that supersedes or contradicts another owner's state to remove it from a context view.

**v1 boundary:** relationships must remain within the same owner/subject/predicate slot.

### Conflict masking

A system selects one of several incompatible single-valued claims without exposing disagreement.

**v1 boundary:** disagreement is withheld as unresolved conflict.

### Truncation poisoning

A bounded retrieval silently excludes later, lower-ranked, or inconvenient claims.

**v1 boundary:** compilation fails instead of silently truncating eligible state.

### Authority confusion

A model or adapter interprets a stored preference, decision, or record as permission to execute.

**v1 boundary:** claims and views require `authority_effect: none`; downstream execution still requires the normal AXIOM authority path.

### Hidden-state enumeration

A caller learns that inaccessible claims exist from filtering diagnostics.

**v1 boundary:** the compiled view reports only statistics for claims that were eligible for that caller, purpose, scopes, and time.

## Promotion sequence

The intended sequence is:

```text
P0 architecture + pure deterministic compiler
  -> P1 Grid-backed context.claim persistence/retrieval
  -> P2 evidence-verified query and lifecycle semantics
  -> P3 authenticated Gateway context projection
  -> P4 machine-principal purpose/scope binding
  -> P5 plan/task/receipt context-view digest binding
  -> P6 MCP or other compatibility projection
  -> P7 adversarial/context-poisoning and privacy review
  -> capability-registry promotion with executable evidence
```

Registry status must not move ahead of executable evidence.

## First executable slice

The initial slice consists of:

- `mesh/src/lib/sovereign-context.mjs`;
- `mesh/test/sovereign-context.test.mjs`.

It currently proves library-level behavior for:

- context never creating authority;
- compatibility with existing memory content addressing;
- principal/purpose/scope/time filtering;
- explicit same-slot supersession;
- implicit single-valued conflict withholding;
- explicit contradiction withholding;
- deterministic context-view digests;
- refusal of silent truncation; and
- prevention of cross-owner/cross-slot suppression relationships.

These tests are not yet evidence for a registry capability because no sovereign-context capability has been promoted in `capabilities.json`.

## Explicit non-claims

This slice does not claim:

- that AXIOM can determine whether an arbitrary source statement is true;
- production context ingestion from Gmail, Drive, GitHub, messaging, browsers, or third-party memory products;
- a supported context search/index/vector database;
- semantic contradiction detection across arbitrary predicates;
- a supported context Gateway route;
- a supported MCP context server or client;
- automatic authorization from stored decisions or preferences;
- autonomous correction of user state;
- completed distributed/federated context reconciliation;
- that an agent runtime owns the sovereign state; or
- production promotion of a new context capability.

## Long-horizon outcome

AXIOM should make the model and agent runtime replaceable while the user's or institution's governed state remains continuous.

The long-horizon stack is therefore not merely an Internet of Context. It is a substrate for **sovereign, provenance-bound, permissioned, temporally explicit, conflict-visible context that remains separate from authority and can be independently bound to later evidence.**
