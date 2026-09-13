# Sovereign State Placement and Projection Plane — Design

**Status:** approved architectural direction; implementation remains separately gated

**Date:** 2026-09-11

**Scope:** define a domain-neutral state-placement, storage-adapter, and derived-projection architecture that preserves AXIOM's local-first authority model while allowing heterogeneous storage, replicas, caches, archives, indexes, analytics, and other read/derived consumers to evolve independently.

**Builds on:**

- `docs/MASTER-TODO.md`
- `docs/rebuild/STATUS.md`
- `docs/architecture/PERSONAL-COMPUTE-FABRIC-AND-LOCAL-TRUST.md`
- `docs/PRODUCTION-READINESS-TRACKER.md`
- issue #992 — encrypted portable personal-state replica and archive profile
- issue #896 — bounded/paginated Grid queries and streamed artifacts
- issue #897 — scale/cardinality/concurrency/soak evidence
- issue #1457 — sovereign Host Guardian and voluntary device fabric
- issue #1482 — privacy-preserving collective intelligence
- Rust trust-core migration programme, including the fresh Stage 5B gate

## 1. Decision

AXIOM will not turn Grid into a universal storage-provider monolith, and it will not let each product domain invent independent storage-routing semantics.

The first-generation architecture is:

```text
One / agents / Education / Circles / Gov / Social / other domains
                         |
                  logical state request
                         |
              trusted policy boundary
                         |
          placement / eligibility decision
                         |
            +------------+------------+
            |                         |
      canonical Grid             storage broker
            |                    + adapters
            |                         |
            |             local / peer / object / archive
            |
      committed transition
            |
      durable projection outbox
            |
       projection dispatcher
            |
   +--------+---------+----------+-----------+
   |                  |          |           |
 UI/read models     search    analytics    replicas/
                                /privacy    derived stores
```

The governing boundary is:

> **For the first generation, Grid remains the canonical authoritative state store. External, object, cloud, peer, cache, index, analytics, and archive systems may hold replicas or derived projections, but cannot become canonical state providers merely by holding, serving, indexing, or processing bytes.**

A future alternative canonical state engine requires a separate semantic-equivalence, migration, rollback, and promotion design. It is not implied by this architecture.

## 2. Why this layer exists

AXIOM already has several foundations that point toward a heterogeneous storage future:

- encrypted Grid state and signed evidence;
- signed local storage offers;
- backup/restore and portability;
- offline and online causal exchange;
- node discovery and scheduling foundations;
- actor-owned state and portable-replica architecture;
- privacy, residency, purpose, retention, and consequence-aware routing concepts;
- a production-unreachable external-effect outbox precedent;
- scale work for pagination, streaming, queues, background jobs, cardinality, restart, and soak.

The missing abstraction is a common boundary that answers two different questions without conflating them:

1. **Where may this state or encrypted artifact be placed, replicated, cached, or archived?**
2. **Which bounded derived views may be emitted from an authoritative state transition, and to which consumers?**

Without a shared boundary, storage and derived-data behavior will drift across Education, Social, Circles, Governance, Health/research, personal agents, and future domains.

## 3. Non-negotiable invariants

### 3.1 Storage location is not authority

A provider, node, cache, replica, index, search engine, analytics system, or archive gains no state authority merely because it stores or serves the newest, fastest, largest, most available, or most popular copy.

Provider timestamps, object versions, ETags, availability, consensus among storage providers, or successful upload acknowledgements are evidence about storage behavior, not evidence that the stored state is canonical.

### 3.2 Placement eligibility is not an external effect

A placement decision may state that one or more destinations are eligible. It does not itself authorize network access, credential use, upload, deletion, mutation, billing, or any other provider effect.

The effectful storage broker/adapter path must still satisfy the normal applicable authority, credential, purpose, budget, destination, host, and evidence rules.

### 3.3 Projection is not canonical state

A projection, index record, analytics input, materialized read model, cache entry, notification, or search document is derived state.

A derived consumer cannot write back into canonical Grid state merely because it is operationally important or widely used. Any write-back must enter through an ordinary authorized state-transition path.

### 3.4 Change delivery is not effect authority

Receiving a projection/change event never creates a capability, consent, credential, governance decision, or effect authorization.

### 3.5 No generic row-level CDC plane

AXIOM will not default to broadcasting raw database-row changes to arbitrary downstream systems.

Each projection profile must define the minimum purpose-appropriate representation needed by a named consumer class. A search projection, backup projection, privacy contribution, UI read model, and public social projection may all derive from the same canonical event while receiving materially different data.

### 3.6 At-least-once delivery, deterministic idempotency

The projection plane does not claim distributed exactly-once delivery.

The baseline semantics are:

- durable outbox creation bound to the authoritative transaction;
- at-least-once delivery;
- deterministic event identity;
- ordered sequence/predecessor evidence where the projection requires ordering;
- replay tolerance;
- idempotent consumer application;
- explicit gap, duplicate, reorder, conflict, and stale-projection handling.

### 3.7 Privacy and residency are eligibility constraints

Data residency, custody, disclosure, retention, purpose, confidentiality, locality, and jurisdictional constraints are evaluated before a destination can become eligible.

A fast or cheap provider cannot compensate for violation of a hard privacy/residency constraint.

### 3.8 Derived systems receive only what they need

Downstream consumers do not receive broad canonical state by default.

Every projection profile declares:

- consumer class;
- purpose;
- allowed source state families/events;
- exact projection schema;
- disclosure class;
- retention/expiry;
- ordering/freshness requirements;
- whether content is public, private, encrypted, aggregated, or commitment-only;
- whether replay is permitted;
- explicit authority non-claims.

### 3.9 Fail closed on uncertain placement or projection policy

Unknown schema versions, unsupported destinations, stale policy, missing residency metadata, ambiguous owner/custody, invalid projection profiles, incomplete authority evidence, or unverifiable canonical bindings fail closed for the requested placement/projection.

Local canonical operation should remain available where safe even when optional replication/projection is unavailable.

## 4. Trust and authority map

The system separates five roles.

### 4.1 Canonical state authority — Grid

Grid remains the first-generation canonical durable state/evidence authority for supported state families.

It owns the accepted state-transition transaction and the canonical transition identity needed by downstream projections.

### 4.2 Placement policy evaluator — pure decision logic

The placement evaluator consumes a normalized logical request plus current policy/context and returns an eligibility plan.

It performs no provider I/O, opens no network connection, holds no provider credential, uploads no object, and creates no canonical state merely by evaluating a request.

### 4.3 Storage broker/adapters — effectful execution

The broker consumes an already eligible placement plan and, under separately valid effect authority, invokes one or more narrowly scoped storage adapters.

The broker must not reinterpret an ineligible destination as eligible and must not broaden scope, purpose, retention, destination, resource, or disclosure bounds.

### 4.4 Projection outbox/dispatcher — canonical-to-derived bridge

The outbox record is committed atomically with, or transactionally bound to, the canonical transition that authorizes its existence.

The dispatcher may deliver only the projection profiles recorded as eligible for that transition. It cannot create new canonical state or silently widen the projection payload.

### 4.5 Derived consumers — non-authoritative

Search, read models, caches, analytics systems, privacy engines, replica workers, notifications, and similar consumers process bounded projections.

Their state is replaceable/rebuildable from authoritative evidence according to each profile's retention and replay rules.

## 5. Logical placement contract

The placement boundary is expressed in logical requirements rather than backend-specific database instructions.

A candidate `state-placement-request.v1` should bind at minimum:

- request ID;
- owner/controller identity or custody scope;
- source/canonical state family;
- operation class: replicate, cache, archive, export-staging, restore-staging, or another closed enum;
- purpose;
- data classification;
- confidentiality requirement;
- disclosure ceiling;
- locality/residency requirements;
- permitted and forbidden destination classes;
- retention/expiry requirement;
- availability target;
- freshness/maximum-lag requirement where applicable;
- consistency class where applicable;
- encryption/profile requirement;
- recovery importance;
- cost/resource ceiling where trusted evidence exists;
- consequence/assurance class;
- policy and schema versions;
- explicit authority non-claims.

The request must not contain raw provider credentials or imply that naming a destination authorizes using it.

## 6. Placement plan

A candidate `state-placement-plan.v1` is a deterministic policy result.

It should bind:

- exact normalized request digest;
- policy/profile digest;
- evaluation time/currentness information where relevant;
- eligible destination classes/instances;
- ineligible destinations with bounded reason codes;
- required encryption/wrapping profile;
- required replica count/diversity constraints;
- retention/expiry constraints;
- maximum object/chunk bounds;
- required effect-authority class;
- required credential class;
- required receipts/evidence;
- plan expiry;
- explicit statement that the plan grants no storage/network authority.

A plan is inspectable evidence for why a destination was eligible. It is not a credential or capability.

## 7. Storage broker and provider adapters

Provider-specific complexity belongs behind constrained adapters rather than in Grid state semantics.

An adapter should expose a narrow capability set such as:

- put immutable encrypted object/chunk;
- fetch exact object/chunk by bound identifier;
- verify provider-side presence where the provider offers trustworthy evidence;
- request deletion/retention transition;
- inspect bounded metadata needed for recovery/health;
- list only within an explicitly bounded namespace when required.

Adapters must not receive a general-purpose arbitrary database or filesystem interface merely because the provider supports one.

### 7.1 Credential rules

- provider credentials remain provider-specific and least privilege;
- credentials are never embedded in placement plans or projection payloads;
- credential access is separately authorized/brokered;
- one provider credential must not silently authorize another destination;
- credential rotation/revocation state is independent of replica authority;
- failed credential currentness fails closed for the provider effect.

### 7.2 Provider claims

A successful provider response may establish only what the reviewed adapter can actually verify, for example that an exact ciphertext object was accepted under a provider object identifier.

It does not prove:

- canonical state;
- user identity;
- content truth;
- retention beyond the provider's actual guarantee;
- deletion from all third-party copies;
- independent availability;
- legal compliance beyond the evidence actually checked.

## 8. Canonical transition and projection outbox

A canonical state transition that is eligible to emit derived state records a durable outbox entry bound to the same accepted transition.

The outbox should not duplicate full canonical state unless a specific projection profile requires those bytes.

A candidate outbox entry binds:

- projection event ID;
- canonical Grid identity;
- canonical sequence/checkpoint/event ID;
- canonical event/state-transition digest;
- owner/custody scope;
- source state family/event class;
- projection profile ID/version;
- projected payload digest;
- consumer class/destination class;
- ordering/predecessor information where required;
- purpose;
- disclosure classification;
- creation time;
- expiry/retention class;
- delivery/replay policy;
- policy/profile digests;
- explicit `authority_effect: none`.

The outbox must support bounded backlog, inspection, retry, and terminal failure state without silently dropping canonical evidence.

## 9. Projection profiles

Projection profiles are closed, reviewable transformations from canonical state/evidence into bounded derived representations.

Examples:

### 9.1 UI/read-model projection

May contain owner-visible summaries needed by Axiom One or another local interface.

It should not expose secrets merely because the canonical state contains them.

### 9.2 Search/index projection

May contain only fields approved for search/discovery, plus source digests/sequence needed to detect staleness.

A search engine does not receive unrelated private fields.

### 9.3 Replica/archive projection

Normally consists of encrypted objects/chunks plus manifests, commitments, key-epoch references, and recovery metadata—not decrypted domain semantics.

### 9.4 Privacy/collective-intelligence projection

Must reuse the privacy-preserving collective-intelligence programme rather than emitting row-level personal records.

The projection may be an authorized bounded contribution, commitment, or aggregation input rather than a subject record.

### 9.5 Public/social projection

Must reuse the actor/publication projection boundary and must not expose protected actor linkage or private state merely because a publication event exists.

## 10. Delivery semantics and consumer state

### 10.1 Deterministic event identity

Retries of the same canonical transition/profile pair produce the same logical projection-event identity or another formally defined idempotency key.

### 10.2 Ordering

Profiles that require ordering bind a canonical sequence/checkpoint and predecessor expectation.

A consumer must reject or quarantine impossible gaps/conflicts rather than silently guessing order.

### 10.3 Replay

Consumers declare whether historical replay is allowed and what retention window applies.

Replay never upgrades a projection into current authority.

### 10.4 Rebuild

Replaceable derived state should be rebuildable from retained authoritative evidence when practical.

Where privacy/deletion/retention rules intentionally prevent full replay, the limitation must be explicit rather than silently approximated.

### 10.5 Backpressure

A slow or failed consumer cannot block canonical state indefinitely unless the specific state family has an explicitly reviewed synchronous dependency.

The baseline is bounded asynchronous delivery with backlog quotas, health state, and operator-visible lag.

## 11. Caching

Caching is an optimization over already-authorized data access, not an authority source.

A cache policy must bind at least:

- source/projection identity;
- owner/custody scope;
- confidentiality class;
- cache destination class;
- maximum TTL/staleness;
- invalidation/supersession semantics;
- encryption requirement;
- retention/deletion behavior;
- maximum bytes/entries;
- whether persistence across restart is allowed.

Sensitive state must not become cross-owner shared cache content merely because deduplication or hit rate would improve.

Cache misses, stale entries, stampedes, poison/substitution attempts, and eviction must be part of the scale/adversarial suite.

## 12. Residency and destination policy

Residency constraints are first-class hard eligibility rules where policy requires them.

A destination description must distinguish evidence classes such as:

- owner-local device/location declaration;
- provider contractual/region configuration;
- authenticated provider assertion;
- independently verified location/attestation where available;
- unknown.

The policy must not silently promote a marketing region label into independently verified physical location.

If a request requires evidence stronger than the destination can provide, the destination is ineligible.

## 13. Multi-tenant and resource isolation

Managed/hosted deployments require storage and projection work to remain bounded per isolation unit.

At minimum support:

- record/object/backlog byte ceilings;
- active-job limits;
- per-provider concurrency/rate ceilings;
- request shaping/backpressure;
- tenant-specific quotas;
- bounded retries;
- circuit breaking/quarantine for unhealthy adapters;
- no cross-tenant query/index leakage;
- no one tenant exhausting another tenant's storage/projection queue allocation.

The existing scale programme should measure absolute limits and growth slopes rather than infer safety from a small request benchmark.

## 14. Receipts and evidence

Three receipt families are intentionally distinct.

### 14.1 Placement receipt

Explains why a logical placement request produced a particular eligible/ineligible destination set.

It binds the request, policy, destination evidence, constraints, and decision.

It proves no provider effect occurred.

### 14.2 Storage/replica receipt

Binds a separately authorized provider operation to:

- placement plan;
- adapter/provider identity;
- exact encrypted object/manifest digest;
- provider object identifier or bounded result;
- credential/key epoch references without exposing secrets;
- operation time;
- retention/deletion semantics actually supported;
- terminal/uncertain result;
- provider/adaptor evidence level.

It does not make the replica canonical.

### 14.3 Projection receipt

Binds:

- canonical transition digest/sequence;
- projection profile/version;
- projected payload digest;
- consumer/destination class;
- delivery attempt/result;
- replay/idempotency state;
- lag/freshness evidence;
- explicit non-authority semantics.

A receipt may authenticate process history. It does not create truth or execution authority by itself.

## 15. Privacy and anti-correlation requirements

This architecture must not become a correlation bypass around AXIOM's privacy work.

Required rules:

- provider-visible object names should avoid unnecessary semantic/user-class leakage;
- content-addressed identifiers may need owner/domain separation or blinding where cross-owner correlation is a risk;
- projection event identifiers must not become universal person identifiers;
- downstream consumers receive purpose-specific identities/projections rather than ambient actor IDs when not required;
- audit/receipt metadata must be evaluated for correlation risk;
- analytics projections must reuse privacy-ledger/release-safety rules rather than centralize row-level personal data;
- one domain's pseudonym is not a general storage/projection join key for another domain.

## 16. Failure and recovery semantics

The design must distinguish canonical success from optional derivative failure.

### 16.1 Canonical transition succeeds, projection unavailable

Canonical state remains committed. The outbox remains pending/retryable or terminally failed according to bounded policy. The UI may report stale/unavailable derived state but must not pretend the canonical write failed unless the product contract explicitly required synchronous projection.

### 16.2 Canonical transition succeeds, replica upload uncertain

Replica state remains uncertain/pending. Do not treat timeout as success. A later reconciliation may verify provider state or reattempt idempotently.

### 16.3 Provider contains a newer-looking object than Grid

Provider recency does not win. Recovery compares signed continuity, manifest, Grid sequence/checkpoint, anti-rollback evidence, and configured recovery authority.

### 16.4 Projection consumer loses state

Rebuild from authorized retained projection/canonical evidence where the profile permits. Do not infer canonical loss from derived-state loss.

### 16.5 Policy changes while work is pending

New effect attempts must satisfy current applicable policy/currentness. A previously eligible plan does not remain indefinitely executable after policy, destination, credential, consent, or retention changes.

## 17. Threat model and adversarial cases

At minimum test and document:

- provider claims successful write but object is absent/incomplete;
- provider/object digest substitution;
- stale placement plan replay;
- destination substitution after plan issuance;
- residency evidence downgrade/substitution;
- credential confusion across providers;
- adapter attempts to widen object namespace or operation;
- cache poisoning and cross-owner cache correlation;
- projection payload contains fields not allowed by its profile;
- generic/raw row accidentally enters the projection plane;
- duplicate delivery;
- reorder and gap;
- consumer rollback;
- stale derived data represented as current;
- projection receipt substitution;
- consumer attempts write-back into Grid without normal authority;
- slow consumer causes unbounded canonical backlog;
- retry storm/provider outage;
- cache stampede;
- provider saturation;
- one tenant exhausts another's queue/storage budget;
- deletion request confused with proven deletion;
- archive/replica interpreted as canonical during recovery;
- analytics consumer correlates domain-specific identifiers;
- outbox truncation or loss after canonical commit;
- policy/currentness changes between eligibility and provider effect;
- adapter/network uncertainty upgraded to success.

## 18. Scale and observability requirements

The existing scale programme should be extended rather than creating a parallel performance programme.

Measure, by deployment profile:

- placement-evaluation latency and CPU;
- cache hit/miss/staleness and stampede behavior;
- provider adapter latency/error/saturation curves;
- queue depth and wait time;
- outbox backlog size/age;
- projection delivery lag;
- duplicate/replay/reorder counts;
- consumer catch-up after restart;
- bytes and CPU per projected event;
- retry amplification;
- per-tenant fairness/isolation;
- storage growth by canonical vs replica vs derived state;
- rebuild duration and peak memory;
- residency-routing denials/fallback behavior;
- canonical request latency while backup/export/projection jobs run.

Operational telemetry remains privacy-minimized and must not expose raw state, secrets, prompts, object contents, broad actor identifiers, or high-cardinality user-controlled labels.

## 19. Implementation sequence

Implementation remains separately approved and should proceed in narrow slices.

### S0 — pure contracts and policy evaluator

- define strict placement request/plan schemas;
- implement deterministic pure evaluation against synthetic destination profiles;
- add hard-constraint and fail-closed negative fixtures;
- no provider I/O;
- no Gateway route;
- no capability change.

### S1 — local-only broker laboratory

- one bounded local/object-store test adapter under a disposable root;
- exact plan binding;
- no remote network;
- idempotent immutable writes;
- storage receipt and negative substitution tests.

### S2 — durable projection outbox

- bind projection eligibility to canonical transitions;
- atomic/transactional outbox persistence;
- bounded inspection/retry state;
- no external consumer required initially.

### S3 — first derived consumer

Use a low-consequence, rebuildable consumer such as a local read/search index or bounded Axiom One read model.

Prove duplicate/replay/reorder/stale handling and inability to write back as authority.

### S4 — generic encrypted remote-object adapter laboratory

- explicit provider destination/profile;
- least-privilege credential brokerage;
- ciphertext-only payload path;
- bounded retries and uncertainty;
- provider presence/recovery evidence only to the level actually verified.

### S5 — fresh-host recovery pilot

Reuse issue #992 acceptance direction: restore a valid actor/Grid state onto a fresh host from an encrypted remote replica while rejecting tamper, rollback, wrong-owner/key/profile, partial-object, and policy-widening cases.

### S6 — multi-consumer/scale campaign

Exercise UI/read model, search/index, replica/archive, and privacy/analytics projection classes under concurrency, restart, backlog, saturation, provider failure, and tenant isolation.

No stage automatically promotes the next.

## 20. Rust trust-core relationship

This architecture does not expand the approved Rust migration boundary.

Potential long-term Rust candidates include pure parsing, canonicalization, placement-policy evaluation, digest verification, and other narrowly selected trust-core primitives only after their own design/promotion gates.

Storage adapters, provider SDKs, network clients, and derived consumer implementations must not be pulled into the deepest Rust trust core merely because Rust is used somewhere in the placement path.

The same governing rule applies:

> **Forgiving where experimentation is cheap. Unforgiving where authority is exercised.**

## 21. Product/API relationship

Human applications should not need to understand provider-specific storage topology.

Axiom One or another reference interface may eventually explain:

- where canonical state lives;
- configured replica/availability target;
- current replica health;
- why a destination is or is not eligible;
- projection/index freshness;
- retention/deletion status;
- recovery readiness;
- receipts and exact evidence where useful.

The product must not claim that a replica is authoritative, that a provider has deleted every copy, or that a derived view is current when lag/health says otherwise.

## 22. Relationship to existing programmes

This design should converge existing work rather than create a parallel architecture tree.

- **#992 portable replicas:** becomes the primary recovery/replica consumer of the placement/broker contracts.
- **#896 bounded Grid/artifacts:** supplies pagination, streaming, background-job, chunking, and per-isolation-unit resource requirements.
- **#897 scale evidence:** becomes the canonical performance/soak evidence programme for the placement/projection plane.
- **#1457 Host Guardian:** remains controlling for local resource sovereignty and whether a device may contribute storage/relay/compute resources.
- **#1482 privacy-preserving collective intelligence:** owns statistical privacy, secure aggregation, privacy budgets, and release safety; this projection plane only supplies bounded authorized inputs.
- **actor/public social projection architecture:** remains authoritative for public/social disclosure semantics.
- **causal sync:** remains distinct from passive backup/archive storage; a passive object store does not become an admitted causal-authority node.
- **external-effect outbox:** is a useful fail-closed precedent but is not reused as if derived projection delivery were ordinary consequential execution. The two remain semantically distinct.

## 23. Non-goals and current non-claims

This design does not claim or authorize:

- production cloud/object-storage adapters;
- object transfer from current `storage.offers`;
- a new canonical database engine;
- multi-master database consensus;
- exactly-once distributed delivery;
- BFT finality;
- a generic raw CDC service;
- universal data-lake export;
- automatic cross-domain joins;
- production differential privacy;
- provider/legal residency certification from configuration labels alone;
- public remote storage discovery;
- ambient cross-tenant caching;
- provider credentials inside Grid state/projection payloads;
- production Rust authority expansion;
- autonomous deletion, billing, migration, or storage-provider switching;
- permission for a derived consumer to write canonical state.

## 24. Completion criterion for the design

This design is complete when the repository has one accepted architectural boundary stating that:

1. Grid remains first-generation canonical state authority;
2. placement eligibility and provider execution are separate;
3. storage providers remain availability/replica services unless separately promoted;
4. derived projections are purpose-specific and non-authoritative;
5. the canonical-to-derived bridge uses a durable, replayable, idempotent outbox model rather than raw ambient CDC;
6. residency/privacy/retention constraints dominate cost/performance optimization;
7. delivery semantics are at-least-once with deterministic idempotency rather than an exactly-once claim;
8. #992, #896, #897, #1457, and #1482 can consume the architecture without creating competing storage/projection authority systems;
9. implementation can begin with pure contracts and a local-only laboratory without widening current production claims.
