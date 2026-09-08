# Epistemic Fabric Stage 5B — E2-RC Implementation Gate

**Status:** PROPOSED — OWNER APPROVAL REQUIRED; implementation is not authorized

**Date:** 2026-09-08

**Fresh base head:** `00a664943c1219afdf0bf9257dbb3362e3231c04`

**Gate branch:** `docs/epistemic-e2-rc-gate`

**Proposed implementation branch after gate approval-record merge:** `feat/epistemic-e2-reproducibility-closure`

**Design:** `docs/superpowers/specs/2026-09-07-epistemic-fabric-stage5b-design.md`

**Implementation plan:** `docs/superpowers/plans/2026-09-08-epistemic-e2-reproducibility-closure.md`

**Threat model:** `docs/security/EPISTEMIC-FABRIC-THREAT-MODEL.md`

**Queue:** `docs/MASTER-TODO-EPISTEMIC-FABRIC.md`

## Gate decision

This document proposes the fresh E2-RC implementation gate required by Amendment B and the merged E2-RC implementation plan.

It is bound to exact `main` head:

```text
00a664943c1219afdf0bf9257dbb3362e3231c04
```

The owner has **not** approved this gate yet. Until explicit owner approval is recorded against the exact gate proposal head and that approval record passes protected checks and merges, E2-RC implementation remains blocked.

The invariant remains:

```text
knowledge may inform authority
knowledge must never silently become authority
```

E2-RC is an inert reproducibility-evidence adjunct. It may describe what was checked. It may not create truth, confidence, canonical status, execution authority, policy authority, permission, capability, or external effect.

## Gate 0 — prerequisites satisfied

The gate is proposed only because the prerequisite planning chain is now on `main`:

1. Stage 5B Epistemic Fabric design is canonical.
2. Amendment B is merged through PR #1564.
3. E0/E1 is merged through PR #1563.
4. The E2-RC implementation plan is merged through PR #1565.
5. PR #1565 passed protected exact-head verification before merge; its first Clean Kernel artifact-upload failure was retried at the same exact head and the retry completed successfully.

None of those prerequisites grants E2-RC implementation authority by itself.

## Gate 1 — exact implementation envelope

After this gate is explicitly approved and its approval record merges, the first E2-RC implementation PR may add or modify only:

```text
mesh/config/epistemic-reproducibility-closure-v0.schema.json
mesh/src/lib/epistemic-reproducibility-closure.mjs
mesh/test/epistemic-reproducibility-closure.test.mjs
mesh/test/epistemic-reproducibility-authority-boundary.test.mjs
docs/MASTER-TODO-EPISTEMIC-FABRIC.md
docs/security/EPISTEMIC-FABRIC-THREAT-MODEL.md
```

No other path is authorized by this gate.

Any need to modify another file requires an explicit gate amendment before the change is made.

## Gate 2 — protected E0/E1 byte identities

The E2-RC implementation MUST leave the existing E0/E1 contract and store bytes unchanged from the fresh base head.

Protected paths and exact Git blob identities at `00a664943c1219afdf0bf9257dbb3362e3231c04`:

```text
mesh/config/epistemic-record-v0.schema.json
  e12888375fd33dc1a4f53c43eb7f16db1a856781
mesh/config/epistemic-source-v0.schema.json
  d65dc30f799bda9751904c5b3a6154a93dc39623
mesh/config/epistemic-claim-v0.schema.json
  b7cfd33ecf78173367c69113e04cfc455270b76e
mesh/config/epistemic-evidence-v0.schema.json
  3f515ce7669bd1e2f73feeb89fc3a7fd4ce705bf
mesh/src/lib/epistemic-contracts.mjs
  c211874baabf063c17aafd9d36d78b9833c6f983
mesh/src/lib/epistemic-proposal-store.mjs
  e89ee381185b0e9a3cb78c57ca1956339a4a54d9
```

The first implementation PR must include a test or verification step proving byte identity for these paths against the gate base.

The owner-approved JSON Schema SHA-256 identities remain:

```text
epistemic-record-v0.schema.json
  d647878abe6912d580ac60122b4a15a2ae845b411d4236630ce19a62deb0c7ae
epistemic-source-v0.schema.json
  d359eb1238eb44d573ff273aa8b89780b42b85b7e67f0f80f2a47f3eae6a3868
epistemic-claim-v0.schema.json
  a7c6b20afcb223a2e48db9543d5e332bb8de9b752110d68b80582e63f02f2c87
epistemic-evidence-v0.schema.json
  207ab9477334eb6654869abc9e688a7cbe40ba5065c72f349f22ede8d944d628
```

## Gate 3 — exact public contract

The implementation may expose only:

```js
export const REPRODUCIBILITY_CLOSURE_SCHEMA = 'axiom-epistemic-reproducibility-closure.v0';
export const REPRODUCIBILITY_CLOSURE_VERSION = '0.1.0';
export const REPRODUCIBILITY_CLOSURE_LIMITS = Object.freeze({
  serialized_record_bytes: 64 * 1024,
  direct_dependencies: 256,
  limitation_items: 64,
  separation_evidence_refs: 32,
  network_requests: 0,
  external_effects: 0,
  provider_calls: 0,
  production_credentials: 0
});

export function computeDependencyClosureDigest(dependencies) {}
export function computeReproducibilityClosureDigest(value) {}
export function validateReproducibilityClosure(value) {}
export function finalizeReproducibilityClosure(value) {}
export function summarizeReproducibilityClosure(value) {}
```

No storage API, network API, policy API, provider/prover API, canonical-admission API, capability API, or execution API is authorized.

## Gate 4 — canonicalization and digest contract

Production code may import only:

```text
ValidationError
canonicalJson
canonicalize
sha256
```

from:

```text
mesh/src/lib/canonical.mjs
```

No second canonicalizer is permitted.

Exact digest domains:

```text
axiom-epistemic-reproducibility-closure.v0\n
axiom-epistemic-dependency-closure.v0\n
```

`content_digest` is self-excluding and domain-separated.

All digest strings use:

```text
sha256:<64 lowercase hex>
```

Dependency order is canonical by:

```text
(dependency_kind, dependency_ref, dependency_digest)
```

The validator rejects noncanonical dependency order rather than silently reordering it.

## Gate 5 — coverage semantics

Allowed `coverage_claim` values are exactly:

```text
target_only
partial_closure
declared_closure_checked
fresh_rebuild
```

Coverage and outcome are separate dimensions.

`declared_closure_checked` is invalid if any direct dependency is `reused_without_recheck` or `unavailable`.

`fresh_rebuild` is invalid unless every direct dependency is `freshly_checked`.

A `fresh_rebuild` may still result in:

```text
fail
indeterminate
error
```

No coverage label may imply truth, correctness, canonical admission, or authority.

## Gate 6 — dependency semantics

Direct dependencies are limited to 256 per record.

Larger systems may compose bounded records only by binding:

```text
child_closure_ref
child_closure_digest
```

The pair is all-or-nothing.

Direct self-reference to the current `closure_id` must fail.

This slice does not claim global graph-cycle validation across separately stored records.

Dependency dispositions are bounded so that:

- `freshly_checked` and `reused_with_bound_verification` require `verification_evidence_ref`;
- `reused_without_recheck` and `unavailable` must not carry verification evidence for the current run.

A child closure digest binds referenced child evidence without asserting that the global dependency graph was traversed or validated.

## Gate 7 — replay semantics

Allowed replay modes are exactly:

```text
original
same_context_replay
separate_context_replay
unknown_context_replay
```

`separate_context_replay` means only that bound actor/environment context differs and separation evidence is present.

It MUST NOT be represented as `independent reproduction` or epistemic independence.

Epistemic independence remains a later, separately gated evidence-layer concern.

## Gate 8 — authority boundary

Every valid E2-RC record must preserve:

```text
status = inert-evidence
canonical_state = proposal
authority_effect = none
network_effect = none
execution_authority = false
contains_secret_material = false
```

The contract must not expose fields named:

```text
truth
confidence
score
verified
independent
canonical
authorize
capability
grant
consent
permission
```

`mesh/config/capabilities.json` MUST NOT change.

No Gateway, Hypervisor, Sandbox, Grid, provider, model, theorem prover, repository-effect, wallet, credential, service-network, or external-effect surface may be imported or invoked.

## Gate 9 — ambient-state prohibition

Production E2-RC code MUST NOT import:

```text
node:fs
node:http
node:https
node:net
node:dgram
node:tls
node:child_process
```

Production validation semantics MUST NOT consult:

```text
process.env
process.cwd()
Date.now()
new Date()
Math.random()
hostnames
package caches
user directories
ambient filesystem state
ambient network state
```

The record may validate an explicit canonical timestamp supplied by the caller, but it may not generate time from ambient state.

## Gate 10 — resource ceilings

The following ceilings are binding:

| Dimension | Ceiling |
|---|---:|
| serialized E2-RC record | 64 KiB |
| direct dependencies | 256 |
| limitation items | 64 |
| individual limitation string | 2 KiB |
| separation evidence refs | 32 |
| individual separation evidence ref | 256 characters |
| network requests | 0 |
| external effects | 0 |
| provider calls | 0 |
| production credentials | 0 |

Unknown, malformed, or over-limit state fails closed.

## Gate 11 — threat-model delta

The first implementation PR must explicitly address these E2-RC-specific threats in `docs/security/EPISTEMIC-FABRIC-THREAT-MODEL.md`:

1. **verification laundering** — collapsing partial coverage into an unqualified verified state;
2. **dependency omission laundering** — presenting an incomplete declared closure as complete;
3. **reused-dependency laundering** — presenting reused or unavailable dependencies as freshly checked;
4. **child-closure substitution** — changing a referenced child closure without changing the bound digest;
5. **replay-context laundering** — presenting a separate context as epistemically independent;
6. **scalar collapse** — turning multidimensional evidence state into truth/confidence/score;
7. **authority laundering** — treating evidence records as capabilities, permissions, grants, or policy authority;
8. **ambient nondeterminism** — deriving validation semantics from clock, environment, filesystem, network, or random state;
9. **effect-path smuggling** — adding provider, prover, network, credential, repository, or runtime effects behind a verification helper;
10. **resource exhaustion** — oversized records, dependency lists, limitation lists, or separation evidence.

Mitigations must be implemented as contract structure and negative tests, not documentation claims alone.

## Gate 12 — predeclared TDD and negative tests

Implementation must follow RED -> GREEN -> REFACTOR and prove at minimum:

1. the public module initially fails to import before implementation exists;
2. valid minimal records finalize and validate deterministically;
3. content digest is stable across key-order variation;
4. self-including or incorrect content digests fail;
5. dependency-list digest is domain-separated and deterministic;
6. dependencies out of canonical order fail rather than reorder;
7. duplicate dependencies fail;
8. more than 256 direct dependencies fail;
9. `freshly_checked` without verification evidence fails;
10. `reused_without_recheck` with current-run verification evidence fails;
11. partial or unavailable dependency state cannot claim `declared_closure_checked`;
12. anything except all `freshly_checked` cannot claim `fresh_rebuild`;
13. coverage and result remain independent dimensions;
14. child closure ref/digest partial pairs fail;
15. direct self-reference fails;
16. separate-context replay without separation evidence fails;
17. separate-context replay never emits an independence claim;
18. unknown replay context remains unknown;
19. authority/canonical/network/execution fields cannot be widened;
20. forbidden scalar/truth/verified/permission fields fail as unknown fields;
21. production module has no forbidden imports or ambient-state reads;
22. `mesh/config/capabilities.json` is byte-identical to gate base;
23. all six protected E0/E1 paths are byte-identical to gate base;
24. 64 KiB record ceiling fails closed;
25. limitation and separation-reference ceilings fail closed;
26. JSON Schema mirror is closed and agrees with runtime validation on accepted/rejected fixtures;
27. no live provider, prover, network, credential, repository-effect, Gateway, Hypervisor, Sandbox, or Grid path is exercised.

## Gate 13 — rollback and failure semantics

E2-RC has no durable production migration and no external effect in this slice.

Rollback is therefore deletion/reversion of the four E2-RC implementation/test files plus reversal of the two documentation status updates.

Existing E0/E1 bytes must remain untouched before, during, and after rollback.

Malformed, corrupted, oversized, ambiguous, unsupported, or noncanonical E2-RC input fails closed with explicit validation failure.

No recovery path may silently normalize an invalid record into a valid one.

## Gate 14 — independence from parked work

Open FORMAL-001 PR #1537 and Verified Work Graph PR #1539 remain design/provenance inputs only.

E2-RC implementation must not import or depend on their unmerged source files.

Any future adapter from those artifacts to E2-RC requires a separate gate.

## Gate 15 — protected verification before merge

The implementation PR must be verified against its exact head after all review-driven changes.

Required protected checks include at least:

```text
verify
container
Analyze (actions)
Analyze (javascript-typescript)
```

Supported-platform compatibility checks must also be green where triggered.

A failed infrastructure/artifact-upload step is not silently waived. If evidence shows a transient infrastructure failure, a same-head retry may be used; the retry must complete successfully before merge.

No implementation merge may rely on stale checks from an earlier head.

## Gate 16 — approval semantics

Owner approval of this gate authorizes only the implementation envelope, invariants, ceilings, threat-model delta, tests, and rollback semantics written above and in the already-merged E2-RC implementation plan.

Approval does **not** authorize:

- E3 canonical admission;
- evidence scoring or scalar truth/confidence;
- epistemic independence claims;
- federation or continuous ingestion;
- external model/provider/prover invocation;
- network access;
- repository effects;
- credentials or wallets;
- Gateway/Hypervisor/Sandbox/Grid authority changes;
- capability registry changes;
- live deployment or production promotion.

Any such change requires a new independent gate.

## Approval record

**Owner decision:** PENDING

**Gate proposal head:** PENDING UNTIL THIS PR HEAD IS FINAL

**Approval condition:** explicit owner approval must reference the exact final gate proposal head after protected checks are green.

**Implementation authority:** BLOCKED
