# Machine Principal Grid Currentness v1 — Design

**Status:** design proposal; documentation-only; no runtime authority or capability promotion  
**Date:** 2026-09-25  
**Primary issues:** #1443, #1445, #1840  
**Historical references:** #1420, #1435, #1440  
**Current-main design base:** `c69fa23ebe30fead3cfb6509f531abd3ea887e1f`

## 1. Purpose

AXIOM-MESH already has constrained machine principals whose bearer-registry
definition creates a finite machine-authority digest. The current build enforces
that static authority at request admission, policy/plan construction, capability
issuance, Sandbox execution, destination checks, budgets, expiry, and response
inspection.

What it does not yet have is a supported mutable machine-principal lifecycle
authority source for mid-lifetime attenuation, revocation, compromise, or
administrative expiry.

This design adds that missing lifecycle/currentness boundary without creating a
second independent authority system.

The central rule is:

> The configured machine principal is the immutable root authority ceiling for
> one runtime generation. Grid may only retain and order authority-reducing
> lifecycle state beneath that ceiling.

The design must eventually support a deterministic consume-before-effect race
(#1445) and provide the authoritative currentness substrate that later result
disclosure work (#1840) can consume. This specification does not itself enable
either runtime path.

## 2. Current-build facts this design preserves

The design is constrained by the current repository, not by the historical A6
draft branches.

### 2.1 Static bearer registry

`loadApiPrincipals()` loads the API principal registry at service startup.
Machine definitions normalize through `axiom-machine-principal.v1`.

The normalized machine authority currently includes:

- principal id and type;
- human sponsor;
- roles;
- exact scopes;
- lifetime and optional expiry;
- runtime id/kind and optional software digest;
- finite action allowlist;
- finite purpose allowlist;
- finite destination allowlist;
- request/rate/concurrency/execution/response budgets;
- delegation fixed to disabled/depth zero.

The canonical `authority_digest` is derived from those normalized facts.

### 2.2 Grid transactional state

Grid already owns durable encrypted event/materialized state. Its append path
uses one SQLite transaction for event insertion, materialization, and durable
head advancement.

The current repository also contains a useful ordering precedent:
`prepareResolvedRepositoryEffectWithGridApproval()` reads authoritative Grid
state over the signed service channel and submits related transitions in one
Grid commit. Approval consumption and effect preparation therefore succeed or
fail together.

This design reuses that **transaction and ordering pattern**. It does not reuse
the repository-docs outbox or widen that outbox's effect ceiling.

### 2.3 Currentness evidence is not authority

Historical machine-currentness checkpoints and current agent/consent
currentness contracts are useful evidence patterns. They are not authority
roots.

A signed checkpoint may prove what a trusted component observed or retained.
It must never itself grant execution, disclosure, delegation, or mutation
authority.

## 3. Goals

Machine Principal Grid Currentness v1 must:

1. make runtime machine-principal attenuation/revocation durable and ordered;
2. preserve the configured principal as the maximum possible authority;
3. prove that every `narrow` transition is genuinely equal-or-narrower;
4. bind every mutation to an authorized human operation and the exact active
   policy decision;
5. reject stale, replayed, conflicting, substituted, widened, or ambiguous
   transitions;
6. make revocation/currentness queryable through the existing authenticated
   internal service boundary;
7. provide one authoritative retained head per machine principal;
8. support deterministic ordering between lifecycle mutation and logical effect
   release;
9. preserve uncertainty instead of claiming rollback or exactly-once execution
   after crashes;
10. fail closed when currentness is missing, corrupt, inconsistent with the
    root registry, or unavailable.

## 4. Non-goals

v1 does **not**:

- hot-reload bearer credentials;
- rotate machine bearer tokens;
- change sponsor identity;
- replace a machine runtime identity;
- widen roles, scopes, actions, purposes, destinations, or budgets;
- enable delegation;
- reactivate a revoked, compromised, or expired lifecycle;
- provide remote-agent self-enrollment;
- make checkpoints into execution authority;
- establish trusted hardware time;
- provide exactly-once external effects;
- recall bytes or effects already logically released;
- solve arbitrary compute-result disclosure by itself;
- generalize `external-effect-outbox.mjs`;
- promote a capability, public route, deployment, or product claim.

## 5. Design decision

### 5.1 Root authority remains static

For one running deployment generation, the normalized principal loaded from the
configured API registry is the **root authority ceiling**.

Grid lifecycle state never replaces this root. It only says whether that root is
still active or what strict attenuation of that root is currently effective.

If the configured root authority digest changes, the existing lifecycle state
must not be silently reused. A root-digest mismatch is fail-closed until an
explicit migration/re-initialization procedure succeeds.

### 5.2 Grid owns mutable lifecycle state

Grid becomes the sole durable authority domain for mutable machine lifecycle
state.

No second JSONL/currentness database, cache, checkpoint file, or peer-provided
snapshot may independently determine whether a machine principal is currently
active.

The lifecycle state is reconstructed from Grid events and materialized into a
single retained row per machine principal.

### 5.3 Effective authority is deny-only

For principal `P`:

```text
root(P)      = normalized configured axiom-machine-principal.v1
lifecycle(P) = latest valid Grid lifecycle head
effective(P) = lifecycle(P).authority when status is active/narrowed
             = DENY when status is revoked/compromised/expired
```

The lifecycle authority must be proven to be a same-principal attenuation of
`root(P)`.

No field absent from the attenuation relation is allowed to drift.

## 5.4 Fixed v1 contract identifiers

The implementation plan must preserve these exact identifiers unless a later
design revision explicitly changes them:

- mutation authorization schema:
  `axiom-machine-principal-mutation-authorization.v1`;
- lifecycle transition schema:
  `axiom-machine-principal-lifecycle-transition.v1`;
- currentness projection schema:
  `axiom-machine-principal-currentness-projection.v1`;
- logical effect-release schema:
  `axiom-machine-effect-release.v1`;
- lifecycle events:
  `machine.currentness.initialized`,
  `machine.currentness.narrowed`,
  `machine.currentness.revoked`,
  `machine.currentness.compromised`,
  `machine.currentness.expired`;
- logical release event:
  `machine.effect.released`;
- materialized tables:
  `machine_principal_lifecycle_heads`,
  `machine_principal_mutation_commands`,
  `machine_effect_releases`;
- internal read route:
  `GET /internal/v1/machine-currentness/:principal_id`;
- internal mutation route:
  `POST /internal/v1/machine-currentness/mutate`;
- internal release route:
  `POST /internal/v1/machine-effect/release`;
- human-facing policy actions:
  `machine.principal.lifecycle.initialize` and
  `machine.principal.lifecycle.mutate`.

These names are part of the v1 design contract so the implementation plan does
not invent parallel spellings or duplicate state surfaces.

## 6. Lifecycle state model

### 6.1 States

v1 supports:

- `active` — effective authority equals the configured root;
- `narrowed` — effective authority is a strict attenuation of the root;
- `revoked` — terminal deny;
- `compromised` — terminal deny;
- `expired` — terminal deny.

`revoked`, `compromised`, and `expired` are terminal in v1.

A new machine identity/root registry entry is required for later reactivation.
This prevents an old authority lineage from silently regaining power.

### 6.2 Initialization

Runtime enforcement must never auto-create lifecycle authority from an
authenticated request.

Before promotion, every configured machine principal must have an explicit
Grid initialization transition binding:

- principal id/type;
- sponsor;
- exact root `authority_digest`;
- exact normalized root authority facts;
- lifecycle sequence `1`;
- status `active`;
- predecessor `null`;
- initialization actor;
- initialization policy/build provenance;
- Grid event/head bindings.

If a machine principal has no retained lifecycle head after the feature is
enabled, consequential machine execution fails closed with
`machine_currentness_unavailable`.

Read-only diagnostics may report the missing state but cannot synthesize it.

### 6.3 Root mismatch

If the current static registry says authority digest `A2` but Grid lifecycle
was initialized from root digest `A1`, execution and mutation fail closed with
`machine_currentness_root_mismatch`.

No automatic migration from `A1` to `A2` is permitted.

## 7. Authority attenuation relation

A `narrow` transition must carry complete normalized predecessor and successor
authority facts. A caller-supplied successor digest alone is insufficient.

The successor must preserve:

- same principal id;
- same principal type;
- same sponsor;
- same runtime id;
- same runtime kind;
- same optional runtime software digest;
- delegation `allowed=false`;
- delegation `max_depth=0`.

The successor may only reduce authority:

- `roles_successor ⊆ roles_predecessor`;
- `scopes_successor ⊆ scopes_predecessor`;
- `actions_successor ⊆ actions_predecessor`;
- `purposes_successor ⊆ purposes_predecessor`;
- `destinations_successor ⊆ destinations_predecessor`;
- every numeric budget is `<=` its predecessor value;
- an existing expiry may move earlier, never later;
- a persistent principal may be converted to a bounded non-persistent lifetime
  only when the resulting expiry is finite and earlier than any deployment
  maximum established by policy;
- a non-persistent lifetime may not become persistent.

The implementation must normalize the successor authority itself and derive the
successor digest from those normalized facts.

A mutation marked `narrow` is invalid unless at least one authority dimension
strictly decreases.

There is no generic `authority-update` transition in v1.

## 8. Mutation authorization

### 8.1 Entry path

Lifecycle mutation is an administrative effect and must enter through ordinary
AXIOM authentication and deny-dominant policy.

The fixed v1 path is:

```text
authenticated human
  -> Gateway
  -> Hypervisor policy evaluation
  -> exact mutation authorization
  -> signed Hypervisor -> Grid mutation request
  -> Grid transaction
```

`POST /internal/v1/machine-currentness/mutate` is Hypervisor-authenticated and
internal-only. There is no public Grid mutation route.

Machine principals cannot mutate machine lifecycle state in v1.

Whether a sponsor, administrator, reviewer, or another human role may request a
given mutation remains a policy decision. The lifecycle implementation must not
invent role authority.

### 8.2 Mutation authorization binding

The authorization presented to Grid must bind at least:

- authorization schema/version;
- authenticated human actor id;
- target machine principal id/type;
- target root authority digest;
- expected predecessor lifecycle sequence;
- expected predecessor lifecycle head digest;
- expected predecessor authority digest;
- transition kind;
- normalized successor authority digest for `narrow`;
- reason code;
- active policy id/version/digest;
- exact operation/action identifier;
- issue time;
- effective time;
- expiry time;
- one-use command id;
- command digest;
- Hypervisor signature / authenticated service provenance.

Grid must verify the authenticated Hypervisor caller and exact bindings before
any mutation materializes.

A raw policy digest supplied by the client is not authorization.

## 9. Mutation command semantics

### 9.1 Supported commands

v1 mutation kinds:

- `narrow`;
- `revoke`;
- `compromise`;
- `expire`.

### 9.2 Replay and idempotency

`command_id` is unique in Grid materialized state.

An exact replay with the same command digest returns the already committed
successor transition projection from `machine_principal_mutation_commands`
without creating another lifecycle event.

The same `command_id` with different bytes fails closed.

A different command targeting a stale predecessor fails closed.

### 9.3 Competing successors

Two commands may be built against one predecessor, but at most one may commit.

The transaction must compare the current retained lifecycle head to the expected
predecessor inside the same write transaction that appends/materializes the
successor.

After one command advances the head, the other must fail as stale.

### 9.4 Terminal transitions

`revoke`, `compromise`, and `expire` preserve the last effective authority
digest as historical evidence while changing lifecycle status to terminal deny.

They do not create a replacement authority digest.

## 10. Grid persistence model

The implementation should use ordinary Grid events plus materialized state.

The v1 implementation uses the fixed schema, event, route, and table identifiers
listed in §5.4. The records below define their required semantics:

### 10.1 Lifecycle transition events

Each `machine.currentness.*` transition carries
`axiom-machine-principal-lifecycle-transition.v1` and records:

- principal id/type;
- root authority digest;
- predecessor lifecycle head digest/sequence;
- predecessor effective authority digest;
- successor sequence;
- successor status;
- successor effective authority digest when non-terminal;
- complete normalized successor authority facts when `narrow`;
- command id/digest;
- mutation authorization digest;
- actor;
- policy id/version/digest;
- reason;
- effective time.

### 10.2 Materialized lifecycle head

One row per machine principal in `machine_principal_lifecycle_heads` provides:

- root authority digest;
- current status;
- current lifecycle sequence;
- current lifecycle head event/hash/digest;
- current effective authority digest;
- protected normalized effective authority facts where applicable;
- last mutation command id/digest;
- updated time.

### 10.3 Mutation replay record

`machine_principal_mutation_commands` must durably retain enough state to distinguish:

- first successful command;
- exact replay;
- same-id conflicting replay;
- stale predecessor;
- competing successor.

A crash after durable commit but before response delivery must remain
recoverable as an exact replay, not become a second transition.

## 11. Currentness query

`GET /internal/v1/machine-currentness/:principal_id` returns the authoritative
retained machine lifecycle projection over the authenticated internal service
channel.

The projection must bind:

- principal id/type;
- root authority digest;
- status;
- sequence;
- lifecycle head digest/event hash;
- current effective authority digest if non-terminal;
- current effective authority facts or their exact protected digest;
- observed Grid chain/head metadata;
- response timestamp;
- explicit non-claims.

The projection itself grants no authority.

Callers must compare it to the locally normalized root principal and the exact
operation they are evaluating.

## 12. Runtime integration

### 12.1 Before capability issuance

Hypervisor must resolve authoritative machine currentness before issuing a new
machine capability.

It denies when:

- currentness is unavailable;
- root digest mismatches;
- lifecycle is terminal;
- requested action/purpose/destination/budget exceeds the effective narrowed
  authority;
- the current lifecycle head cannot be verified.

The plan and capability must bind the lifecycle sequence/head digest and
effective authority digest used for issuance.

This is necessary but not sufficient: revocation can still happen after
capability issuance.

### 12.2 Before consequential effect

The first promoted race is #1445.

Immediately before the first consequential builtin effect, Sandbox must ask
Grid to order one logical effect release against current lifecycle state.

`POST /internal/v1/machine-effect/release` must, in one ordered Grid transaction:

1. resolve the current lifecycle row;
2. verify root digest;
3. compare capability-bound lifecycle/effective-authority expectations;
4. deny terminal or changed/widening-incompatible state;
5. bind exact capability, intent, plan, action, destination, attempt, and
   lifecycle head;
6. record one logical release decision.

Only a successful committed release permits the caller to invoke the builtin.

If revocation/narrowing commits first, stale effect release denies.

If effect release commits first, that exact attempt has crossed its logical
authorization boundary. A later revocation does not retroactively undo that
release.

### 12.3 No long transaction across execution

Grid must not hold a SQLite write transaction while waiting for model work,
network I/O, arbitrary worker execution, or a builtin effect.

The transaction orders authority and logical release only.

Actual execution remains outside the transaction and therefore retains crash
uncertainty.

## 13. Release/recovery semantics

A committed release is not proof that the effect executed.

A completed effect is not proof that its response was disclosed.

A suppressed response is not rollback.

If the process crashes after logical release but before terminal execution
evidence, the attempt is uncertain and must not be silently re-executed under a
new attempt without the operation's normal idempotency/recovery rules.

Exact release replay may recover the already committed release record, but that
record is not a reusable bearer permission for a different attempt.

Any later attempt requires a new currentness/release ordering step.

## 14. Relationship to #1840 result disclosure

This design supplies the missing live machine lifecycle authority source and
ordering domain that #1840 currently lacks.

It does **not** automatically authorize result disclosure.

A later disclosure integration may reuse the same lifecycle state and ordering
principle, but it must define a distinct logical disclosure release bound to:

- exact attempt/result digest;
- exact recipient;
- exact destination/channel;
- current lifecycle head;
- expiry;
- disclosure-specific authorization.

A previously prepared result or effect-release record cannot be reused as
permission for a later response send.

## 15. Failure behavior

The following fail closed:

- missing lifecycle state after enforcement promotion;
- corrupt/unverifiable lifecycle state;
- static-root mismatch;
- unsupported lifecycle status;
- stale predecessor;
- skipped sequence;
- predecessor digest mismatch;
- same command id with different command digest;
- mutation authorization signature/binding mismatch;
- policy id/version/digest mismatch;
- actor/target substitution;
- successor authority widening;
- sponsor/runtime substitution;
- delegation enablement;
- later expiry;
- budget increase;
- unknown authority field;
- terminal-state reactivation;
- currentness service unavailability at a consequential boundary;
- failed Grid commit.

No denial may create substitute authority.

## 16. Crash and persistence requirements

The implementation must prove:

- event append + lifecycle materialization + command replay state commit
  atomically;
- failed materialization rolls back the event append;
- restart reconstructs the same retained lifecycle head;
- truncated/tampered protected state fails existing Grid integrity checks;
- exact command replay after restart is idempotent;
- a crash cannot acknowledge a mutation before its successor is durably
  retained;
- a failed/uncertain response does not cause a second successor.

Existing Grid checkpoint/continuity semantics remain unchanged.

## 17. Testing requirements

Implementation is not review-ready without all of these classes.

### 17.1 Pure attenuation tests

- each set dimension may shrink;
- each set dimension widening denies;
- each numeric budget may decrease;
- each numeric budget increase denies;
- expiry may shorten but not extend;
- persistent -> bounded finite lifetime follows policy;
- non-persistent -> persistent denies;
- sponsor substitution denies;
- runtime id/kind/software digest substitution denies;
- delegation stays false/depth zero;
- unchanged `narrow` denies;
- unknown fields deny;
- normalization/digest is deterministic and order-independent.

### 17.2 Lifecycle transaction tests

- explicit initialization succeeds once;
- missing initialization denies;
- root mismatch denies;
- exact replay is idempotent;
- same-id conflicting replay denies;
- stale predecessor denies;
- two competing successors produce exactly one winner;
- revoke/compromise/expire are terminal;
- restart preserves head;
- failed materialization rolls back;
- corrupt/tampered state fails existing integrity checks.

### 17.3 Authorization tests

- machine caller cannot mutate lifecycle;
- unauthorized human cannot mutate lifecycle;
- actor substitution denies;
- target substitution denies;
- policy digest/version substitution denies;
- expired mutation authorization denies;
- wrong Hypervisor/service identity denies;
- mutation authority and Grid signing identity remain distinct roles.

### 17.4 Effect-race tests

Use a deterministic test-only barrier:

1. admit/consume capability;
2. pause before logical effect release;
3. commit revoke or narrow;
4. resume effect release;
5. assert denial;
6. assert builtin invocation count is zero;
7. assert durable evidence identifies the newer lifecycle head.

Positive controls:

- unchanged currentness permits one release;
- unrelated principal mutation does not deny;
- release committed before later revocation remains historical evidence of the
  earlier ordering;
- a new grant after revocation cannot revive an old attempt.

### 17.5 Platform/release gates

- Clean Kernel;
- documentation maintenance/rebuild;
- container verification;
- supported Node 22 lane;
- Node 24.18.0 protected verification;
- Windows;
- macOS ARM;
- macOS Intel;
- CodeQL Actions/Rust/JavaScript-TypeScript;
- independent security review before production promotion.

## 18. Migration and rollout

### Stage A — inert contracts

Add pure normalized attenuation contracts and the four fixed v1 schemas from
§5.4 only.

No Grid migration, route, capability, or runtime call site.

### Stage B — Grid storage/currentness

Add the five fixed `machine.currentness.*` lifecycle events, the
`machine_principal_lifecycle_heads` and
`machine_principal_mutation_commands` materializations, replay handling, and
the authenticated currentness read projection.

Still no execution integration.

### Stage C — authorized mutation source (#1443)

Add policy actions `machine.principal.lifecycle.initialize` and
`machine.principal.lifecycle.mutate`, the human-authorized Hypervisor -> Grid
mutation path, and deterministic mutation tests.

No effect path consumes it yet.

### Stage D — effect race (#1445)

Bind capability issuance to lifecycle head and add
`POST /internal/v1/machine-effect/release`,
`machine_effect_releases`, and `machine.effect.released` for atomic logical
effect release against the current retained head.

Keep capability promotion unchanged until the full matrix and review complete.

### Stage E — disclosure integration (#1840)

Only after the lifecycle/effect boundary is accepted may a separate proposal
bind protected result disclosure to current lifecycle state.

Each stage gets a separate reviewable PR and exact-head evidence.

## 19. Historical A6 reconciliation

### Keep from #1420 / #1435

Preserve these semantics:

- lifecycle state is operation-independent;
- operation admission is separate;
- retained latest head matters;
- stale/newer-but-unretained/rollback/equivocation states deny;
- currentness evidence is non-authorizing;
- terminal states do not reactivate.

### Do not port #1440 as-is

The historical mutation draft must not be rebased wholesale because:

- `narrow` proves only that an authority digest changed;
- predecessor/successor normalized authority facts are not compared;
- policy id/version/digest is not bound;
- durable command replay semantics are incomplete;
- competing-successor behavior is not proved;
- crash/torn-state coverage is incomplete;
- the branch is hundreds of commits behind current `main`.

Historical code may be used as design provenance, not as trusted implementation.

## 20. Alternatives considered

### A. Grid-backed deny-only lifecycle overlay — selected

Advantages:

- one durable authority domain for mutable lifecycle state;
- existing transaction/rollback semantics;
- existing signed service channels;
- direct path to deterministic revoke/effect ordering;
- avoids synchronizing independent authority databases.

Cost:

- requires Grid migration/materialization and new carefully reviewed mutation
  semantics.

### B. Modernize the historical separate currentness store — rejected

This would create a second mutable authority database beside Grid and require an
atomicity story across two stores.

It is useful as historical evidence architecture, not as the promoted authority
root.

### C. Hot-reload the bearer registry — rejected for v1

A file reload can change authentication input, but does not by itself provide:

- append-only mutation provenance;
- competing-successor ordering;
- transactionally ordered effect release;
- durable replay/idempotency;
- authoritative crash recovery.

Credential lifecycle and authority lifecycle remain separate concerns.

### D. Per-capability revocation blacklist — rejected

Capabilities are short-lived derived authority. Revoking individual capability
identifiers does not model principal-wide compromise/narrowing and creates an
incomplete second lifecycle mechanism.

## 21. Security invariants

The implementation must preserve all of these:

1. **Configured root is ceiling:** Grid can never create authority absent from
   the normalized configured machine principal.
2. **Knowledge/evidence is not authority:** a checkpoint, receipt, digest, or
   observation cannot authorize an effect.
3. **Deny dominates:** missing/ambiguous/currentness failures deny.
4. **No self-expansion:** a machine cannot widen or mutate its own lifecycle.
5. **No pooled authority:** Circle/peer/collective state cannot widen lifecycle
   authority.
6. **No implicit delegation:** depth remains zero.
7. **Exact operation binding:** mutation and effect release bind the actual
   principal/action/purpose/destination/attempt.
8. **Ordered consequence boundary:** mutable authority and logical release are
   ordered in one authoritative Grid transaction.
9. **Uncertainty stays uncertainty:** release is not execution; execution is not
   disclosure; denial is not rollback.
10. **No silent promotion:** schemas/methods/tests do not make the feature
    production-supported until capability, docs, threat model, release evidence,
    and independent review agree.

## 22. Documentation impact

Every Stage C or Stage D implementation PR must review and update each of these
files when its current statement would otherwise become stale; the PR must state
explicitly when no textual change is required:

- `docs/security/CURRENT-BUILD-THREAT-MODEL.md`;
- `docs/rebuild/REQUIREMENTS.md`;
- `docs/rebuild/AGENT-INTEROPERABILITY-CAPABILITY-MAP.md`;
- `docs/MASTER-TODO-AGENT-INTEROPERABILITY.md`;
- `docs/PRODUCTION-READINESS-TRACKER.md`;
- `docs/PROJECT-STATUS-2026.md`;
- `docs/PRODUCTION-GRADE.md`;
- `mesh/README.md`;
- release notes;
- capability/evidence bindings only if/when promotion occurs.

Documentation must continue to distinguish implemented, test-only,
experimental, specified, and promoted states.

## 23. Promotion blockers

Production promotion remains blocked until:

- #1443's corrected mutation source is implemented and reviewed;
- #1445's deterministic race is implemented and green;
- current `main` protected CI is green on the exact candidate;
- independent security review covers the lifecycle/mutation/effect boundary;
- deployment principal provisioning and lifecycle initialization are exercised
  on an authentic pilot;
- recovery/rotation procedures cover lifecycle state and root-registry mismatch;
- capability/evidence registries and public claims are intentionally updated.

## 24. Decision summary

Machine Principal Grid Currentness v1 uses:

- the static normalized machine principal as the immutable root authority
  ceiling;
- Grid as the only durable mutable lifecycle authority source;
- strict same-principal attenuation for `narrow`;
- terminal revoke/compromise/expiry;
- ordinary human authentication + deny-dominant policy for mutations;
- signed Hypervisor -> Grid mutation requests;
- Grid transaction ordering for lifecycle mutation and logical effect release;
- evidence/checkpoints only as evidence, never as authority;
- separate later work for response/result disclosure.

This is the minimum architecture that closes the missing mutable-currentness
boundary without creating a second scheduler, second authority database, or
credential-driven shortcut.
