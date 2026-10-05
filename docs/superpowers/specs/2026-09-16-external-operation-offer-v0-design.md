# External Operation Offer v0 — Design

**Status:** design handoff for user review; no implementation authority

**Date:** 2026-09-16

**Trigger:** GitHub issue #1598, prompted by the open-source release of `monid-ai/monid` as a provider-neutral agent-tool connector and metering layer.

**Implementation base inspected:** `b8a746eace641c1b97ca70163bb030f49ca033f3`

**Builds on:**

- `docs/architecture/RUNTIME-AND-CONNECTOR-FABRIC.md`
- `docs/rebuild/REQUIREMENTS.md`, especially CORE-04 through CORE-07, CAP-01 through CAP-10, AI-01 through AI-10, and TRUST-01 through TRUST-04
- `docs/architecture/contracts/runtime-connector-catalog-entry.v1.schema.json`
- `mesh/src/lib/runtime-connector-fabric-contracts.mjs`
- `mesh/config/runtime-provider-catalog.v0.json`
- `docs/superpowers/specs/2026-08-30-sovereign-intelligence-selection-v0-design.md`
- issue #1575, watch-findings integration backlog
- issue #1578 and draft PR #1597, which introduce the Knowledge -> Operation -> Authority framing and inert operation discovery

**Authority boundary:** this design does not enable Monid, MCP, external providers, credentials, wallets, paid calls, network egress, new Gateway routes, autonomous purchasing, capability-registry promotion, or production execution. `mesh/config/capabilities.json` remains authoritative for runnable capability state.

## 1. Core decision

AXIOM should support external tool brokers as replaceable connector-market sources without creating a second authorization system.

The existing Runtime & Connector Fabric already models the durable parts of an integration:

- immutable catalog identity and provenance;
- integration class and deployment form;
- requested capabilities/actions/purposes/destinations/data classes;
- credential classes and network requirements;
- static resource and monetary ceilings;
- orchestration posture;
- assurance observations;
- lifecycle, quarantine, rollback, and non-claims.

That contract should remain frozen rather than absorbing fast-changing per-call market state.

The missing layer is a bounded, content-addressed description of one **currently advertised external operation candidate**: what operation a broker says exists now, what exact schema/version it exposes, what provider/destination it would use, what effect it represents, what it costs, what current health/latency evidence exists, and how uncertain execution would be reconciled.

The new adjunct contract is therefore:

`axiom-external-operation-offer.v0`

An offer is descriptive input to local routing and authorization. It is never authority.

> **Catalog presence is not authority. Offer availability is not authority. Ranking is not authority. Payment eligibility is not authority. External success is not proof of authorization or truth.**

## 2. Cognitive Federation: external capabilities as replaceable hemispheres

AXIOM should not conceptualize external models, tools, runtimes, APIs, or services merely as utilities attached to a controller. At the entity level they are better understood as **specialized cognitive modules or hemispheres** recruited by a persistent sovereign self.

A route may contribute, for example:

- perception and retrieval;
- symbolic or statistical reasoning;
- long-context synthesis;
- coding and formal verification;
- language, image, audio, or video generation;
- memory retrieval or transformation;
- planning and critique;
- social or institutional interaction;
- physical or digital actuation.

The persistent entity remains independent of any particular route. Its identity, owned memory, policies, consent state, durable preferences, authority, evidence history, and continuity must survive replacement or loss of one or many external cognitive modules.

This gives AXIOM a **Cognitive Federation** model:

```text
                 persistent AXIOM entity
        identity / memory / values / continuity
                       |
          +------------+-------------+
          |            |             |
          v            v             v
     local model   remote model   tool/service broker
          |            |             |
          +------ specialized cognition ------+
                       |
                       v
              proposed operation/effect
                       |
                       v
              AXIOM authority boundary
        Gateway -> Hypervisor -> Sandbox -> Grid
```

The analogy is intentionally limited. A newly connected hemisphere does not gain the authority of the whole organism merely because it contributes cognition. Capability aggregation must not become authority aggregation.

Therefore:

1. **Capability may compose; authority does not compose ambiently.** Several modules may jointly solve a task, but their permissions remain separately bounded.
2. **Cognition is replaceable; continuity is not provider-bound.** Provider loss degrades capability, not identity.
3. **Specialization should be exploited.** AXIOM should route work to the best eligible module rather than insist one general model do everything.
4. **Data exposure remains selective.** A module receives only the context needed for its role, not the complete Personal Model or memory graph.
5. **No module may rewrite the sovereign self merely by being persuasive, useful, or repeatedly selected.** Durable preference, policy, memory-authority, or identity changes require their own governed transitions.
6. **The integrated entity owns the result lineage.** Outputs from different hemispheres retain source/provenance so synthesis does not erase where claims or artifacts came from.

This is consistent with the existing Intelligence Fabric direction: provider/model loss must degrade capability rather than erase entity continuity, and future increases in intelligence or access must not silently widen authority.

## 3. Alternatives considered

### Approach A — create a new external-tool-broker profile

Create `axiom-external-tool-broker-profile.v0` containing broker identity, topology, pricing, schemas, credentials, health, latency, privacy, and execution semantics.

**Rejected as the primary design.** Most durable broker identity and requested-access information is already represented by `axiom-runtime-connector-catalog-entry.v1`. A second static profile would duplicate catalog semantics and create drift.

### Approach B — extend `axiom-runtime-connector-catalog-entry.v1`

Add dynamic pricing, operation schemas, live health, latency, and quote expiry directly to the frozen runtime/connector catalog contract.

**Rejected.** The catalog is intentionally immutable and suitable for exact task binding. Live quotes and observations are volatile. Mixing them would force needless catalog-version churn and weaken the existing separation between durable identity and current observations.

### Approach C — adjunct per-operation offer bound to the existing catalog entry

Keep broker/provider identity in the current immutable catalog. Represent volatile operation state in a separately digest-bound offer object.

**Selected.** This follows the same pattern already used by Sovereign Intelligence Selection v0: stable catalog identity remains stable, while fast-changing routing metadata lives in an adjunct contract.

## 4. Architectural placement

The target flow is:

```text
KNOWLEDGE
  skills / first-party guidance / provider descriptions
        |
        v
OPERATION DISCOVERY
  static operation manifest + external broker offers
        |
        v
LOCAL ELIGIBILITY
  provenance/currentness/data/destination/effect/spend filters
        |
        v
OPTIMIZATION
  quality / cost / latency / health / preference among eligible candidates
        |
        v
AUTHORITY
  current principal + policy + consent + approval + grant
        |
        v
EXECUTION
  Gateway -> Hypervisor -> Sandbox -> Grid -> bounded adapter
        |
        v
EVIDENCE
  AXIOM receipt + external/broker evidence + uncertainty/reconciliation state
```

Draft PR #1597 supplies the complementary Knowledge -> Operation -> Authority language. This design does not depend on #1597 being merged unchanged; the controlling existing invariant remains the Runtime & Connector Fabric rule that orchestration does not create authorization.

## 5. External Operation Offer v0

### 5.1 Identity and binding

Every offer must bind:

- `schema = axiom-external-operation-offer.v0`;
- `offer_id`;
- `observed_at`;
- `valid_until` or an explicit `freshness = unknown` state;
- exact `catalog_entry_id`;
- exact `catalog_entry_version`;
- canonical `catalog_entry_digest`;
- `broker_operation_id`;
- provider identity/reference;
- operation-schema digest;
- advertised destination/origin;
- declared effect class;
- declared input/output data classes;
- network requirement;
- quote/usage model;
- health and latency observations when present;
- timeout/cancellation semantics;
- idempotency/reconciliation semantics;
- evidence/provenance references;
- explicit `grants_authority = false`.

Unknown required semantics fail closed. The offer cannot widen any field in the immutable catalog entry's requested-access envelope.

### 5.2 Effect classes

The v0 closed effect vocabulary should be small and conservative:

- `read-external`;
- `write-external`;
- `publish-external`;
- `create-external-resource`;
- `delete-external-resource`;
- `generate-media`;
- `financial`;
- `communication`;
- `unknown`.

`unknown` is not eligible for consequential execution.

The broker's marketing description is advisory data. AXIOM must classify native semantics independently enough to detect cases where an endpoint advertised as query/read actually mutates external state.

### 5.3 Price and usage

A quote is evidence, not permission to spend.

The offer may declare:

- currency;
- quoted amount in minor units where determinable;
- pricing unit (`call`, `result`, `character`, `second`, `token`, `other`);
- minimum/maximum estimable charge where appropriate;
- whether the quote is exact, bounded, variable, free, or unknown;
- quote expiry;
- broker usage-settlement semantics.

AXIOM authorization must bind a separate current spend ceiling. If the actual or newly quoted cost exceeds the authorized ceiling, execution fails closed or requires fresh authorization.

Wallet funding, credit purchase, subscription activation, payment-method changes, or balance top-up are separate consequential actions and are out of scope for v0.

### 5.4 Health and latency

Broker-reported availability and p50/p95 latency are useful routing observations but are not trusted facts by default.

They should be represented as timestamped observations with source identity and freshness. They may affect ranking only after hard eligibility filters pass.

## 6. Hosted and owner-local broker topology

AXIOM must distinguish:

### Hosted broker

The external broker may observe at least the operation request, routing choice, execution metadata, and metered billing according to its service design. Credential custody may be broker-managed or transport-injected according to the specific contract.

### Owner-local broker/connector engine

Connector definitions and execution logic may run on owner-controlled infrastructure using owner-controlled provider credentials.

Owner-local execution does **not** imply that the downstream provider is local, private, offline, non-retaining, or safe for the submitted data. Destination policy still applies to the ultimate provider.

The topology is therefore an eligibility/privacy input, not a shortcut around provider analysis.

## 7. Policy-before-optimization

Candidate routing must preserve this order:

1. principal identity/currentness;
2. authority scope and purpose;
3. consent and data policy;
4. destination/jurisdiction restrictions;
5. effect classification;
6. spend/resource ceiling;
7. provider/broker/capability eligibility;
8. required assurance/currentness;
9. only then rank eligible candidates by quality, price, latency, health, energy, locality, independence, or explicit user preference.

A semantic router such as TypeSafe/System One may help map a natural-language task to candidate operations or rank already-eligible candidates. It must not determine that authority exists or upgrade unknown/currentness states.

## 8. Execution and reconciliation

A selected offer is still not executable authority.

Before an effect:

- re-resolve the immutable catalog entry;
- verify the operation offer digest and freshness;
- compare native operation/effect semantics against the authorized plan;
- bind exact provider/destination/data/spend/timeout constraints;
- obtain the normal AXIOM grant through the existing authority path;
- reauthorize immediately before the external effect where required by existing adapter semantics.

If execution times out or transport status is ambiguous after possible external mutation, AXIOM must not blindly retry. The task moves to `uncertain` unless a provider-specific idempotent reconciliation/status path proves the terminal result.

This reuses the existing task/artifact/handoff uncertainty model rather than creating a second lifecycle.

## 9. Evidence model

A completed or uncertain broker-backed operation should preserve at least:

- exact intent/plan/grant references;
- principal and machine/runtime identity;
- catalog entry identity/version/digest;
- offer identity/digest and observed freshness;
- operation ID and operation-schema digest;
- provider and destination;
- authorized spend ceiling;
- externally reported usage/cost;
- request/response artifact digests where policy permits;
- provider/broker terminal status;
- AXIOM terminal or uncertainty state;
- reconciliation evidence if applicable.

The receipt must distinguish:

- AXIOM authorization/effect-path evidence;
- broker/provider observations;
- external-world truth claims.

A broker's success response is not itself proof that the claimed external state is true.

## 10. Monid as first interoperability fixture

Monid should be represented as **one example implementation**, not named in durable AXIOM protocol identifiers.

The first fixture should capture only externally evidenced properties needed for the contract:

- open-source connector/engine identity and exact source commit;
- hosted versus owner-local execution modes where separately evidenced;
- `discover`, `inspect`, and `run` operation mapping;
- declarative provider/endpoint schema identity;
- metering/usage model;
- transport-edge credential injection behavior;
- replay-fixture testing model;
- current advertised price/health/latency fields as observations rather than trusted guarantees.

No Monid balance, key, live provider credential, paid call, or egress is required for v0 conformance.

## 11. Required synthetic fixtures

The implementation slice should use deterministic offline fixtures for at least:

1. free read-only external search;
2. paid read-only enrichment;
3. external mutation/write;
4. public publishing/communication;
5. generated media with usage-per-unit pricing;
6. unknown effect classification;
7. stale operation/schema digest;
8. price increase above authorized ceiling;
9. provider timeout with ambiguous external status;
10. hosted-broker unavailable/fallback candidate;
11. malicious tool description attempting instruction/authority injection;
12. two parallel child tasks competing for one aggregate spend ceiling.

## 12. Required negative tests

At minimum, tests must prove:

1. discovered/cheap but unauthorized destination -> denied;
2. broker-declared read with consequential native semantics -> denied or reclassified;
3. tool-description prompt injection cannot widen authority;
4. stale catalog or operation digest -> rejected;
5. price drift above current spend ceiling -> no paid execution;
6. parallel child tasks cannot bypass aggregate budget limits;
7. timeout after possible execution -> no blind retry;
8. revoked authority before effect admission -> denied even if offer remains healthy;
9. broker outage changes availability, not identity/authority;
10. owner-local broker mode does not imply downstream provider locality/privacy;
11. ranking cannot bypass explicit provider exclusion or stronger assurance rule;
12. external receipt/cost record cannot self-certify authorization, legitimacy, or truth;
13. one cognitive module cannot pass its credentials or permissions to another merely because both participate in the same composite task;
14. combining complementary modules cannot synthesize an authority tuple that no valid grant contains;
15. loss/replacement of a cognitive module preserves persistent entity identity and owned memory semantics.

## 13. First implementation slice

The first slice should remain inert and offline:

- add `docs/architecture/contracts/external-operation-offer.v0.schema.json`;
- add pure validation/normalization/digest helpers, preferably adjacent to existing Runtime & Connector Fabric contracts unless file-size/cohesion argues for a focused module;
- add synthetic fixtures and property/negative tests;
- add one Monid example fixture pinned to an exact public source commit and explicitly marked non-authorizing/non-live;
- reuse the existing runtime/provider catalog entry as the durable broker identity anchor;
- reuse existing money, destination, task uncertainty, and evidence concepts rather than adding parallel semantics;
- document the Cognitive Federation / external-hemisphere interpretation in the Runtime & Connector Fabric or first-embodiment architecture where it improves conceptual continuity;
- keep capability registry state unchanged.

No new network listener, provider credential, wallet, payment route, egress rule, live Monid adapter, or production capability is part of this slice.

## 14. Promotion sequence

A future live broker integration must progress independently through:

1. offline schema/fixture conformance;
2. exact-source adapter review;
3. local disposable live call with owner-supplied test credentials;
4. semantic-effect and uncertain-status tests;
5. spend-budget enforcement tests;
6. privacy/data-destination review;
7. revocation/currentness race tests;
8. independent security review appropriate to the effect surface;
9. separate capability-registry promotion decision;
10. only then any supported/production exposure.

Self-hosting or open source may improve inspectability and portability but does not skip this sequence.

## 15. Explicit non-claims

This design does not claim:

- production Monid integration;
- that Monid's advertised tool count is AXIOM-authorized capacity;
- live MCP/A2A interoperability;
- autonomous purchasing;
- provider truthfulness;
- safe privacy/retention behavior for every broker/provider;
- a production settlement layer;
- universal best-tool routing;
- that external success responses prove real-world truth;
- that external services are literally biological brain hemispheres;
- any widening of `Gateway -> Hypervisor -> Sandbox -> Grid`.

## 16. Acceptance criteria for the design

The implementation plan may proceed only if the reviewed design preserves these properties:

- no duplicate broker authority/profile system;
- immutable catalog identity remains the durable anchor;
- volatile offer state is adjunct and digest-bound;
- spend is an explicit effect dimension;
- semantic tool descriptions remain untrusted data;
- uncertainty and reconciliation reuse existing task semantics;
- external cognitive modules remain replaceable and selectively contextualized;
- capability composition does not imply authority composition;
- no capability registry promotion occurs in the first slice;
- Monid is an interoperability fixture, not an AXIOM protocol dependency.
