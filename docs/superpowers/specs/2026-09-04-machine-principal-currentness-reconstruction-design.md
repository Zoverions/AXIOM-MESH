# Machine-Principal Currentness Reconstruction — A6 Current-Main Design

**Status:** approved architecture; design only; no runtime effect-path change

**Date:** 2026-09-04

**Parent programme:** #1141 — Agent Trust Protocol v1

**Security pilot:** #1199 — RT-AUTH-001

**Historical implementation provenance:** #1420, #1427, #1435, #1436, #1440, #1442, #1444, #1445, #1447

**Current reconstruction base:** `6170bb13d077ec5f5752853ef23da71dc3798cee`

## 1. Objective

Reconstruct the smallest machine-principal authority-currentness foundation on current `main` so AXIOM can later run the real deterministic RT-AUTH-001 revoke/narrow race without reviving the stale historical A6 implementation stack wholesale.

The immediate first slice stops before Sandbox integration and before lifecycle mutation.

It must provide current-main equivalents of the machine-principal lifecycle-currentness semantics needed by later A6.3/A6.4 work:

1. canonical operation-independent machine-principal lifecycle state;
2. signed lifecycle-currentness checkpoints;
3. controller-key verification appropriate to checkpoint evidence;
4. durable retained-head storage with rollback/equivocation/torn-state rejection;
5. an exact retained-head evaluator that can compare current lifecycle authority against a specific pending effect admission;
6. explicit evidence/non-authority semantics throughout.

The first slice does **not** determine whether the external RT-AUTH-001 scout hypothesis is reproduced. On current `main`, the external revoke/narrow race remains **ARCHITECTURE-LIMITED / NOT REPRODUCED** because the supported mutable machine-principal currentness source and consume-before-effect barrier are not present.

## 2. Why reconstruction is required

The historical A6 line implemented much of the desired semantic stack, but it diverged from current `main` at merge base `1c7ced824e909be28dd3dd45a7fd3648b1849f90` and is now materially stale.

The historical #1420 head is 119 commits behind the current reconstruction base. The later A6.3/A6.4 branches build on that same stale lineage.

Therefore:

> **Historical A6 code is design and test provenance, not a branch to merge blindly.**

Each security property must be re-established against current repository architecture. Exact historical blobs may be reused only where inspection shows their assumptions and dependencies remain valid; otherwise reconstruct the accepted semantics using current patterns.

This design deliberately prefers several reviewable current-main slices over one large forward-port.

## 3. Relationship to current Agent Trust currentness

Current `main` already contains `agent-trust-currentness-checkpoint.mjs` and related Agent Trust evidence composition. That layer is intentionally non-authorizing and issuer-evidence scoped.

Its fixed semantics include the essential doctrine that a currentness artifact can be verified and useful while still stating:

- `global_currentness_claimed: false`;
- `effect_admission_authorized: false`;
- `authority_effect: 'none'`;
- `delegation_effect: 'none'`.

That doctrine remains controlling.

However, the existing Agent Trust checkpoint is not by itself the required machine-principal runtime authority source. It evaluates supplied issuer credential/revocation evidence and preserves explicit non-authority semantics. It must not be silently upgraded into an effect-authorizing source merely because it has an effect-time evaluator.

The reconstructed A6 machine-principal layer therefore composes with existing Agent Trust primitives where appropriate but keeps a distinct responsibility:

> **Represent and retain the currently accepted machine-principal lifecycle authority state against which a pending exact effect can later be checked.**

The retained machine-principal state is still evidence used by an effect-admission decision. It does not independently grant permission.

## 4. Architectural sequence

A6 reconstruction proceeds in three separately reviewable stages.

### Stage A — machine-principal currentness foundation

This design document covers Stage A in implementation detail.

Deliver:

- lifecycle-currentness state/checkpoint semantics;
- controller trust verification;
- durable retained-head store;
- exact retained-head effect-currentness evaluator;
- hostile tests;
- no Sandbox integration;
- no mutable lifecycle command/source API.

### Stage B — separately authorized lifecycle mutation source

After Stage A is merged and green, reconstruct A6.3 on current `main`.

At minimum support retained transitions:

- active authority A -> narrowed authority B;
- narrowed authority B -> further narrowed authority C;
- active/narrowed -> revoked;
- active/narrowed -> compromised;
- active/narrowed -> expired through an explicit retained `expire` transition.

`narrowed` remains an operational lifecycle state under the new exact reduced authority digest. It is not synonymous with revoked. A capability bound to predecessor authority A must fail after narrowing to B because A no longer matches the retained authority digest; a later capability correctly issued under B may satisfy the currentness prerequisite while status remains `narrowed`.

Expiry uses one canonical lifecycle rule in this programme: expiry that changes machine-principal lifecycle authority is represented by an explicit retained `expired` successor. Independent credential/checkpoint validity and evidence-freshness limits may still expire by time without creating a lifecycle mutation.

Mutation authority, currentness signing authority, storage, and ordinary effect authorization remain separate roles.

### Stage C — consume-before-first-effect integration

Only after Stages A and B are current-main green:

1. durably consume the single-use capability;
2. reach a deterministic test barrier immediately before the first consequential effect;
3. mutate and durably retain newer machine-principal authority state;
4. resolve the latest retained head;
5. evaluate currentness against the exact pending admission;
6. deny stale/revoked/changed authority before effect invocation;
7. prove the consumed capability remains burned;
8. preserve exact evidence in terminal receipts/attestations.

Only Stage C can support a strong `REPRODUCED` or `NOT_REPRODUCED` classification for the external race.

## 5. Stage A core invariant

> **Cryptographic validity, identity validity, capability validity, and historical authority evidence are necessary inputs but are not sufficient for a consequential effect. When machine-principal currentness is required, the effect-admission path must be able to prove that the exact retained latest lifecycle state still matches the exact authority bound to the pending admission.**

Corollaries:

- currentness evidence is not authority;
- signed but unretained evidence is not the retained latest head;
- caller-supplied evidence cannot select an older head;
- a retained lifecycle head cannot bypass invalid capability, plan, policy, destination, replay, subject, approval, or consumption checks;
- unknown, unreadable, stale, equivocated, rolled-back, or unverifiable required currentness fails closed;
- `indeterminate != allow`.

## 6. Component boundaries

Stage A should remain decomposed into focused units with one clear responsibility each.

### 6.1 MachinePrincipalLifecycleState

Operation-independent normalized state for one constrained machine principal.

Required semantic fields:

- schema/version;
- principal id;
- principal type;
- current authority digest;
- lifecycle status;
- lifecycle sequence;
- observed-at timestamp;
- predecessor source-head digest;
- source-head digest;
- `controller_id`;
- `controller_key_id`;
- `controller_credential_digest`;
- `controller_key_epoch`;
- fixed evidence/non-authority claims.

Initial lifecycle statuses are:

- `active`;
- `narrowed`;
- `revoked`;
- `compromised`;
- `expired`.

`active` and `narrowed` are potentially usable states, subject to exact retained-authority equality and every other admission requirement. `revoked`, `compromised`, and `expired` are non-usable terminal states in this first programme slice.

Stage A does not provide an API that changes these states. Test fixtures may construct valid signed sequences strictly through internal test helpers.

Lifecycle state MUST NOT contain:

- capability JTI;
- intent digest;
- plan digest;
- effect destination;
- effect-specific admission digest;
- ordinary action payload;
- permission to execute.

The lifecycle sequence advances for lifecycle/authority changes, not for attempted effects.

### 6.2 MachinePrincipalCurrentnessCheckpoint

A signed envelope over one normalized lifecycle state.

It must bind at minimum:

- checkpoint schema;
- checkpoint id;
- checkpoint sequence;
- predecessor checkpoint digest;
- principal id/type;
- lifecycle source-head digest;
- authority digest;
- lifecycle status;
- observed-at;
- controller id/key id/credential digest/key epoch;
- statement digest;
- signature;
- checkpoint digest;
- fixed nonclaims.

Verification must reject:

- unknown fields;
- malformed/canonicalization-invalid data;
- signature substitution;
- controller key substitution;
- controller credential/epoch substitution;
- principal substitution;
- authority/status/source-head tampering;
- invalid predecessor or sequence progression.

A verified checkpoint reports no execution, delegation, capability-promotion, or global-currentness authority.

### 6.3 Currentness controller trust

The controller that signs currentness checkpoints is an evidence/currentness role, not an ordinary effect actor.

Where current `main` already has suitable machine-identity or operational-key lifecycle primitives, reuse them rather than inventing another key-lifecycle framework.

Required verification properties:

- trusted controller root/public key or equivalent root trust binding is static deployment/repository configuration, not caller input;
- checkpoint signer key must match the expected controller identity and key epoch;
- checkpoint controller credential digest must match the credential actually verified;
- revoked/compromised/stale controller credentials cannot validate a checkpoint when controller currentness is required;
- controller-key verification does not imply authority to mutate machine-principal lifecycle state;
- controller-key verification does not imply authority to execute the pending effect.

Stage A may use deterministic test keys/fixtures. It must not add a remote enrollment or administration surface.

### 6.4 MachinePrincipalCurrentnessStore

Append-only durable retained-head store for verified machine-principal currentness checkpoints.

Use the current `delegation-root-attestation-key-currentness-store.mjs` as a mechanical/security precedent where its storage assumptions fit, while keeping machine-principal semantics separate.

Required store invariants:

- canonical JSONL retained history;
- first retained checkpoint is sequence 1;
- successor advances exactly one sequence;
- predecessor checkpoint digest continuity;
- same-sequence/same-digest exact replay is idempotent;
- same-sequence/different-digest is equivocation and fails closed;
- older sequence is rollback and fails closed;
- sequence gaps fail closed;
- startup re-verifies complete retained history;
- incomplete/torn trailing record fails closed;
- non-canonical retained JSON fails closed;
- state path resolves to a regular non-symlink file;
- active disk/memory divergence fails closed;
- append is synced before retention success is reported;
- checkpoint/state byte limits are explicit and bounded;
- restart preserves the exact retained head;
- store projections expose only non-authorizing metadata.

Required fixed store nonclaims include equivalents of:

- local durable retention claimed: true;
- hostile-host rollback proof claimed: false;
- hardware monotonicity claimed: false;
- global currentness claimed: false;
- authority effect: none;
- delegation effect: none;
- execution authority granted: false.

### 6.5 Retained-head resolver

The later effect path must not be handed an arbitrary checkpoint object and asked to trust it.

Stage A therefore exposes a narrow internal resolver over the retained store.

Conceptual interface:

```text
resolveRetainedHead({ expectedPrincipalId, expectedPrincipalType, trustContext })
  -> verified retained-head projection
```

The resolver:

1. verifies retained store state;
2. resolves only the actual retained latest head;
3. verifies principal/type and controller bindings;
4. returns the exact checkpoint/head digests and lifecycle projection required by the evaluator;
5. reports no effect authority.

No caller-controlled filesystem path belongs in the effect admission request. Store provisioning belongs to trusted application/deployment composition.

### 6.6 Exact effect-currentness evaluator

The lifecycle head is operation-independent. The evaluator binds it to one exact pending effect admission without mutating the lifecycle checkpoint.

Canonical pending admission input contains at minimum:

- principal id;
- principal type;
- capability-bound authority digest;
- capability id or digest;
- intent digest;
- plan digest;
- exact effect destination/tool identifier;
- evaluation timestamp plus explicit clock-assurance/freshness policy.

During implementation, inspect the current runtime admission/capability contracts. If current `main` binds additional exact-effect dimensions required to prevent widening, those dimensions become part of the canonical Stage A admission digest rather than preserving an obsolete historical field set.

The evaluator must:

1. resolve/verify the retained latest head;
2. verify current controller trust as required;
3. require principal/type equality;
4. require lifecycle status `active` or `narrowed`;
5. require retained authority digest equality with the capability-bound authority digest;
6. enforce freshness/future-time rules;
7. compute a deterministic canonical admission digest;
8. compute a deterministic currentness-evidence digest;
9. compute a deterministic effect-currentness evaluation digest;
10. return a non-authorizing prerequisite decision/evidence object.

It must deny for at least:

- missing required store/head;
- store verification failure;
- controller verification failure;
- wrong principal/type;
- stale/future evidence;
- authority digest mismatch, including predecessor authority A after narrowing to B;
- `revoked`, `compromised`, or `expired` lifecycle state;
- unrecognized status;
- malformed or unreproducible admission binding;
- older signed head when the retained store has advanced;
- signed but unretained candidate head presented externally.

A `narrowed` retained state with exact authority digest B may satisfy the currentness prerequisite for a later correctly B-bound admission. It may never validate a predecessor A-bound admission.

A successful Stage A evaluator means only:

> the retained currentness prerequisite matched this exact pending admission at the evaluated instant under the configured evidence/freshness assumptions.

It does not execute the effect and does not independently authorize it.

## 7. Authority and trust separation

Stage A must make these distinctions mechanically visible:

```text
identity evidence
  != lifecycle mutation authority
  != currentness checkpoint signing authority
  != durable retention
  != effect-currentness evidence
  != ordinary effect authorization
  != consequential effect
```

No single artifact introduced in Stage A may collapse these roles.

In particular:

- possession of the controller signing key is not ordinary effect authority;
- a valid currentness checkpoint is not a capability;
- a retained head is not a grant;
- a successful currentness evaluation cannot revive a consumed/replayed/invalid capability;
- a later Grid-signed currentness receipt, if reintroduced, remains evidence and not an independent bearer credential.

## 8. Configuration and path safety

Stage A adds no caller-facing state-path selection.

Trusted deployment composition may provision:

- currentness state path;
- trusted controller root/public key or equivalent trust configuration;
- expected principal bindings;
- maximum evidence age;
- checkpoint/state size limits.

Runtime/effect requests must not be able to replace these values with request-controlled alternatives.

The default/current production behavior must remain unchanged until a later separately reviewed integration explicitly requires machine-principal currentness for a named execution path.

## 9. Time and freshness semantics

Currentness correctness depends on time but Stage A must not overclaim clock assurance.

Requirements:

- canonical UTC timestamps;
- deterministic test clocks;
- explicit maximum evidence age;
- future-dated evidence rejection beyond configured tolerance;
- no assumption that host wall clock is externally attested;
- clock-assurance limitations preserved in evidence/nonclaims.

Two different time concepts must remain separate:

1. lifecycle status changes such as `expired` are explicit retained lifecycle transitions in Stage B;
2. controller credential validity, checkpoint validity, and evidence freshness are evaluated against time and may independently make evidence unusable without mutating lifecycle state.

Stage A should reuse the repository's current deterministic-clock patterns rather than reintroduce test fixtures whose validity silently decays with wall time.

## 10. Failure semantics

Required currentness is fail closed.

Stable denial classes should distinguish, at minimum:

- source unavailable/missing;
- retained-store invalid;
- rollback/equivocation/torn state;
- controller untrusted/stale/revoked;
- principal mismatch;
- authority changed;
- lifecycle terminal/non-usable;
- evidence stale/future;
- admission binding invalid.

Exact external-facing code names should follow current repository error conventions discovered during implementation rather than introducing a parallel taxonomy solely for this design.

No exception path may be translated into ALLOW.

If evidence is insufficient to prove denial-before-effect in later Stage C, the terminal evidence must say uncertain rather than upgrading uncertainty into non-occurrence proof.

## 11. TDD implementation strategy for Stage A

Implementation begins only after this design is reviewed and an implementation plan is approved.

The implementation sequence should use current-main TDD:

### RED 1 — lifecycle/checkpoint semantics

Add focused tests requiring the new machine-principal lifecycle/checkpoint contract before implementation exists.

RED must fail for the intended missing symbol/file/fixture only, not through unrelated breakage.

### GREEN 1

Implement the smallest strict lifecycle/checkpoint semantics necessary to pass the focused contract tests.

### RED 2 — durable retained store

Add retained-store tests for genesis, progression, restart, rollback, equivocation, torn state, symlink/non-regular path, bounds, and disk/memory divergence.

### GREEN 2

Implement the store by reusing current repository storage/canonicalization patterns where appropriate.

### RED 3 — exact retained-head evaluator

Add evaluator tests requiring exact retained-head resolution and exact admission binding.

### GREEN 3

Implement resolver/evaluator with no effect-path integration.

### Regression verification

Run focused tests, full Clean Kernel, Node 22 compatibility, Windows/macOS compatibility, CodeQL, and any current release-governed workflows affected by the added files.

Protected CI on the exact candidate is required before merge consideration.

## 12. Required Stage A hostile tests

At minimum:

### Lifecycle/checkpoint

- valid genesis active state;
- valid sequence successor;
- wrong predecessor;
- sequence gap;
- principal substitution;
- principal-type substitution;
- authority digest tamper;
- lifecycle-status tamper;
- source-head tamper;
- controller key substitution;
- controller credential/epoch substitution;
- bad signature;
- unknown fields;
- non-canonical statement/digest mismatch.

### Durable store

- genesis retain/read/reopen;
- valid successor;
- exact duplicate idempotence;
- older rollback rejected;
- same-sequence equivocation rejected;
- sequence gap rejected;
- wrong predecessor rejected;
- torn trailing record rejected;
- non-canonical JSON rejected;
- symlink/non-regular state rejected;
- active disk/memory divergence rejected;
- oversize checkpoint rejected;
- oversize state rejected;
- restart preserves exact head.

### Resolver/evaluator

- exact active authority/head control case succeeds as prerequisite evidence only;
- narrowed authority B with a correctly B-bound admission succeeds as prerequisite evidence only;
- predecessor authority A after retained narrowing to B -> deny by authority mismatch;
- revoked -> deny;
- compromised -> deny;
- expired -> deny;
- wrong principal/type -> deny;
- stale evidence -> deny;
- future-dated evidence -> deny;
- missing source/head when required -> deny;
- older signed checkpoint cannot displace retained latest head;
- newer signed but unretained checkpoint is not accepted as retained latest state;
- caller cannot substitute state path/trust root/head;
- successful currentness prerequisite cannot turn an otherwise invalid capability or admission into ALLOW.

The last test may initially operate at the evaluator boundary rather than Sandbox because Stage A does not alter runtime effect admission.

## 13. Stage B design constraints carried forward

The future lifecycle mutation source must not be smuggled into Stage A.

When Stage B begins, it must enforce:

- separately authorized mutation command;
- mutation actor/provenance;
- exact predecessor retained-head binding;
- exact successor sequence;
- attenuation proof for `narrow`;
- explicit retained `expire` transition for lifecycle expiry;
- no principal/type substitution;
- no widening via actions/scopes/purposes/destinations/budgets/delegation/approval/assurance/runtime binding;
- stale predecessor/replay rejection;
- deny-dominant competing successor handling;
- success only after signed successor is durably retained;
- `revoked`, `compromised`, and `expired` do not silently reactivate;
- `narrowed` may narrow further but may never widen;
- mutation command/receipt grants no ordinary effect authority.

Stage B is separately reviewed because it introduces a write/authority boundary that Stage A intentionally lacks.

## 14. Stage C design constraints carried forward

The future consume-before-effect integration must be as late as safely possible and identify the first consequential effect for the selected path.

Required ordering:

```text
normal ingress/authentication
  -> policy / machine-authority evaluation
  -> exact plan + capability issuance
  -> durable one-time capability consumption
  -> deterministic test-only pre-effect barrier
  -> resolve exact retained latest currentness head
  -> exact effect-currentness prerequisite
  -> only then first consequential effect
```

The barrier is test control, not an authority source.

The first Stage C path should be the smallest real repository-owned builtin/effect with an observable invocation boundary. Do not broadly refactor every provider/connector.

Stage C must prove non-occurrence using an invocation counter or equivalent repository-owned evidence, not merely an HTTP/error response.

## 15. RT-AUTH-001 classification discipline

Until Stage C executes the supported race on an exact commit, use:

> **ARCHITECTURE-LIMITED / NOT REPRODUCED**

Do not use `REPRODUCED` merely because historical code demonstrates that stale currentness could conceptually matter.

A future `REPRODUCED` result requires:

- supported lifecycle mutation succeeded;
- successor state was durably retained before barrier release;
- old capability still crossed the consequential-effect boundary.

A future strong `NOT_REPRODUCED` result requires:

- supported mutation succeeded;
- successor state was durably retained;
- latest-head effect admission denied the old capability;
- repository-owned evidence proves no consequential effect occurred;
- consumed capability remained non-replayable.

Green CI alone is neither classification.

## 16. Non-goals

Stage A explicitly does **not** create:

- Sandbox effect-path currentness enforcement;
- a lifecycle mutation source;
- a public/remote currentness administration endpoint;
- caller-selected currentness state files;
- bearer-token registry mutation;
- global currentness/finality;
- hardware monotonicity or hostile-host rollback proof;
- automatic authority recovery/reactivation;
- general delegation authority;
- capability issuance changes;
- weakened capability TTL/signature/replay/consumption checks;
- production capability promotion;
- deployment authority;
- a vulnerability claim;
- security certification;
- WIMSE/OAuth/MCP/A2A conformance claims.

## 17. Expected Stage A repository shape

Exact filenames may change during implementation if current repository organization demands it, but the preferred shape is a small set of focused files rather than one large subsystem module:

```text
mesh/src/lib/
  machine-principal-currentness.mjs
  machine-principal-currentness-store.mjs
  machine-principal-effect-currentness.mjs

mesh/test/
  machine-principal-currentness.test.mjs
  machine-principal-currentness-store.test.mjs
  machine-principal-effect-currentness.test.mjs
```

If controller-key lifecycle functionality already exists in a current reusable module, Stage A should import it rather than create a fourth module.

Schemas/threat-model documentation should be added only where repository conventions require them for the new caller-authored or portable artifact. Avoid duplicating schemas for internal-only projections.

## 18. Definition of done for Stage A

Stage A is complete only when, on an exact current-main-derived candidate:

1. machine-principal lifecycle/checkpoint semantics are strict and deterministic;
2. controller verification is explicit and separately scoped;
3. a durable retained-head store survives restart and rejects rollback/equivocation/torn/non-canonical state;
4. the evaluator resolves the actual retained latest head rather than accepting an arbitrary caller head;
5. exact pending-admission binding is deterministic;
6. `active` exact authority can produce prerequisite evidence;
7. `narrowed` exact current authority can produce prerequisite evidence only for the narrowed authority digest;
8. predecessor/changed, revoked, compromised, expired, stale, or mismatched state fails closed;
9. every introduced currentness artifact remains explicitly non-authorizing;
10. no Sandbox/runtime effect path has been changed;
11. focused tests and protected repository CI are green on the exact candidate;
12. claim language remains `ARCHITECTURE-LIMITED / NOT REPRODUCED` for the external race.

Only then should Stage B receive an implementation design/plan against the resulting current `main`.
